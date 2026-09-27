import { findUnconnectedPorts, registry } from '../engine'
import { effectivePneumatic, pneumaticTypeLabel } from '../catalog/pneumatic'
import type { Product } from '../catalog/types'
import { isPneumaticNode, toCircuit, type CircuitFlowNode, type PneumaticFlowNode, type TubeFlowEdge } from './flow'

export type CheckLevel = 'error' | 'warn' | 'info'

export interface CircuitCheck {
  level: CheckLevel
  text: string
  /** 點選後要選取的元件 */
  nodeIds: string[]
}

/** 元件的稱呼：標號（類型） */
export function nodeTitle(n: PneumaticFlowNode): string {
  const label = registry.has(n.data.componentType) ? registry.get(n.data.componentType).label : n.data.componentType
  return n.data.tag ? `${n.data.tag}（${label}）` : label
}

/** 產品埠的快插管徑（mm）；不是快插埠時回傳 undefined */
function tubeOd(node: PneumaticFlowNode, portId: string, products: Readonly<Record<string, Product>>): number | undefined {
  const product = node.data.product && products[node.data.product.id]
  if (!product) return undefined
  const pn = effectivePneumatic(product)
  const productPortId = pn?.portMap[portId]
  const spec = product.ports.find((p) => p.id === productPortId)?.spec
  return spec?.kind === 'tube' && spec.role === 'socket' ? spec.od : undefined
}

/** 編輯時的檢查清單（依嚴重程度排序） */
export function checkCircuit(
  nodes: readonly CircuitFlowNode[],
  edges: readonly TubeFlowEdge[],
  products: Readonly<Record<string, Product>>,
): CircuitCheck[] {
  const result: CircuitCheck[] = []
  const pneumatic = nodes.filter(isPneumaticNode)
  if (pneumatic.length === 0) return result
  const byId = new Map(pneumatic.map((n) => [n.id, n]))

  if (!pneumatic.some((n) => n.data.componentType === 'airSupply')) {
    result.push({ level: 'warn', text: '電路中沒有氣源', nodeIds: [] })
  }

  // 未連接的埠：排氣埠未接時視為封閉（氣缸可能不動），其餘提醒
  const unconnected = findUnconnectedPorts(toCircuit(nodes, edges))
  const perNode = new Map<string, string[]>()
  for (const key of unconnected) {
    const i = key.lastIndexOf(':')
    const id = key.slice(0, i)
    perNode.set(id, [...(perNode.get(id) ?? []), key.slice(i + 1)])
  }
  for (const [id, ports] of perNode) {
    const node = byId.get(id)!
    const def = registry.get(node.data.componentType)
    const exhausts = ports.filter((p) => def.ports.find((d) => d.id === p)?.role === 'exhaust')
    const others = ports.filter((p) => !exhausts.includes(p))
    if (exhausts.length) {
      result.push({
        level: 'warn',
        text: `${nodeTitle(node)} 的排氣埠 ${exhausts.join('、')} 未接消音器或排氣口（視為封閉）`,
        nodeIds: [id],
      })
    }
    if (others.length) {
      result.push({ level: 'warn', text: `${nodeTitle(node)} 的 ${others.join('、')} 未連接`, nodeIds: [id] })
    }
  }

  // 重複的標號
  const tags = new Map<string, string[]>()
  for (const n of pneumatic) {
    const tag = n.data.tag?.trim().toUpperCase()
    if (tag) tags.set(tag, [...(tags.get(tag) ?? []), n.id])
  }
  for (const [tag, ids] of tags) {
    if (ids.length > 1) result.push({ level: 'warn', text: `標號 ${tag} 重複（${ids.length} 個元件）`, nodeIds: ids })
  }

  // 產品功能與元件類型不一致
  for (const n of pneumatic) {
    const product = n.data.product && products[n.data.product.id]
    if (!product) continue
    const pn = effectivePneumatic(product)
    if (pn && pn.type !== n.data.componentType) {
      result.push({
        level: 'warn',
        text: `${nodeTitle(n)} 指定的產品 ${product.modelCode} 功能為「${pneumaticTypeLabel(pn.type)}」，與元件類型不同`,
        nodeIds: [n.id],
      })
    }
  }

  // 管線兩端的快插管徑不一致
  for (const e of edges) {
    const a = byId.get(e.source)
    const b = byId.get(e.target)
    if (!a || !b) continue
    const odA = tubeOd(a, e.sourceHandle ?? '', products)
    const odB = tubeOd(b, e.targetHandle ?? '', products)
    if (odA !== undefined && odB !== undefined && Math.abs(odA - odB) > 0.01) {
      result.push({
        level: 'error',
        text: `${nodeTitle(a)} ${e.sourceHandle} 為 Ø${odA} 快插、${nodeTitle(b)} ${e.targetHandle} 為 Ø${odB}：管徑不同，需要變徑接頭`,
        nodeIds: [a.id, b.id],
      })
    }
  }

  // 沒有指定型號（資訊）
  const noProduct = pneumatic.filter((n) => !n.data.product && !['airSupply', 'exhaust'].includes(n.data.componentType))
  if (noProduct.length) {
    result.push({ level: 'info', text: `${noProduct.length} 個元件尚未指定型號（BOM 以元件類型列出）`, nodeIds: noProduct.map((n) => n.id) })
  }

  const order: Record<CheckLevel, number> = { error: 0, warn: 1, info: 2 }
  return result.sort((x, y) => order[x.level] - order[y.level])
}

