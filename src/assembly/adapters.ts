import type { Product, ProductPort } from '../catalog/types'
import { checkMate, type MateLevel, type PortSpec } from '../threads'
import { addInstance, connect, disconnect, type ProductMap } from './moduleOps'
import type { ModuleDoc, PortRef } from './types'

export interface AdapterOption {
  product: Product
  /** 接 A 端的埠 */
  portForA: ProductPort
  /** 接 B 端的埠 */
  portForB: ProductPort
  levels: [MateLevel, MateLevel]
}

const usable = (level: MateLevel) => level === 'ok' || level === 'warn'
const rank = (o: AdapterOption) => o.levels.filter((l) => l === 'warn').length

/** 從產品庫找出能把 A、B 接起來的轉接頭（每個產品只列出最好的一種接法） */
export function findAdapters(products: readonly Product[], a: PortSpec, b: PortSpec): AdapterOption[] {
  const options: AdapterOption[] = []
  for (const product of products) {
    let best: AdapterOption | undefined
    for (const pa of product.ports) {
      for (const pb of product.ports) {
        if (pa === pb || !pa.spec || !pb.spec) continue
        const la = checkMate(a, pa.spec).level
        const lb = checkMate(pb.spec, b).level
        if (!usable(la) || !usable(lb)) continue
        const option: AdapterOption = { product, portForA: pa, portForB: pb, levels: [la, lb] }
        if (!best || rank(option) < rank(best)) best = option
      }
    }
    if (best) options.push(best)
  }
  return options.sort((x, y) => rank(x) - rank(y) || x.product.modelCode.localeCompare(y.product.modelCode))
}

/**
 * 在 A、B 之間插入轉接頭：A 不動 → 轉接頭 → B（B 所在的群組跟著移動）。
 * 若 A、B 原本已直接鎖合，先拆開。
 */
export function insertAdapter(
  doc: ModuleDoc,
  products: ProductMap,
  a: PortRef,
  b: PortRef,
  option: AdapterOption,
): { doc: ModuleDoc; instanceId: string } | { error: string } {
  const existing = doc.mates.find(
    (m) =>
      (m.parent.instance === a.instance && m.parent.port === a.port && m.child.instance === b.instance && m.child.port === b.port) ||
      (m.parent.instance === b.instance && m.parent.port === b.port && m.child.instance === a.instance && m.child.port === a.port),
  )
  let next = existing ? disconnect(doc, products, existing.id) : doc
  const added = addInstance(next, option.product.id)
  next = added.doc
  const all = { ...products, [option.product.id]: option.product }
  const first = connect(next, all, a, { instance: added.instanceId, port: option.portForA.id })
  if ('error' in first) return { error: first.error }
  const second = connect(first.doc, all, { instance: added.instanceId, port: option.portForB.id }, b)
  if ('error' in second) return { error: second.error }
  return { doc: second.doc, instanceId: added.instanceId }
}
