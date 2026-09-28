import { bomColumns, bomTotal } from '../assembly/bom'
import type { Product } from '../catalog/types'
import { registry } from '../engine'
import { toCsv } from '../utils/csv'
import type { CircuitInfo } from './circuitDoc'
import { isPneumaticNode, type CircuitFlowNode } from './flow'

export interface CircuitBomRow {
  index: number
  /** 有指定產品時為型號 */
  modelCode?: string
  name: string
  /** 元件類型（例如 5/2 單電控閥） */
  typeLabel: string
  quantity: number
  tags: string[]
  /** 產品庫中的廠牌與單價（有指定產品且產品庫有資料時） */
  maker?: string
  price?: number
}

/**
 * 迴路圖的材料表：指定了產品的元件依產品彙總，沒有指定的依元件類型彙總。
 * 氣源與排氣口不列入（不是要採購的零件）。
 */
export function buildCircuitBom(
  nodes: readonly CircuitFlowNode[],
  products: Readonly<Record<string, Pick<Product, 'maker' | 'price'>>> = {},
): CircuitBomRow[] {
  const rows = new Map<string, CircuitBomRow>()
  for (const n of nodes) {
    if (!isPneumaticNode(n)) continue
    const type = n.data.componentType
    if ((type === 'airSupply' || type === 'exhaust') && !n.data.product) continue
    const typeLabel = registry.has(type) ? registry.get(type).label : type
    const product = n.data.product
    const key = product ? `p:${product.id}` : `t:${type}`
    let row = rows.get(key)
    if (!row) {
      const info = product && products[product.id]
      row = {
        index: 0,
        modelCode: product?.modelCode,
        name: product ? product.name || product.modelCode : `${typeLabel}（未指定型號）`,
        typeLabel,
        quantity: 0,
        tags: [],
        ...(info?.maker && { maker: info.maker }),
        ...(typeof info?.price === 'number' && { price: info.price }),
      }
      rows.set(key, row)
    }
    row.quantity++
    if (n.data.tag) row.tags.push(n.data.tag)
  }
  // 有型號的在前，依型號排序；未指定型號的依類型
  const sorted = [...rows.values()].sort((a, b) => {
    if (!!a.modelCode !== !!b.modelCode) return a.modelCode ? -1 : 1
    return (a.modelCode ?? a.typeLabel).localeCompare(b.modelCode ?? b.typeLabel, 'zh-Hant')
  })
  sorted.forEach((r, i) => {
    r.index = i + 1
    r.tags.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  })
  return sorted
}

export function circuitBomToCsv(info: Pick<CircuitInfo, 'name' | 'customer'>, rows: readonly CircuitBomRow[]): string {
  const cols = bomColumns(rows)
  const total = bomTotal(rows)
  return toCsv([
    [`迴路：${info.name}`],
    ...(info.customer ? [[`客戶：${info.customer}`]] : []),
    [],
    ['項次', '型號', '名稱', '元件類型', ...(cols.maker ? ['廠牌'] : []), '數量', '標號', ...(cols.price ? ['單價', '小計'] : [])],
    ...rows.map((r) => [
      r.index,
      r.modelCode ?? '',
      r.name,
      r.typeLabel,
      ...(cols.maker ? [r.maker ?? ''] : []),
      r.quantity,
      r.tags.join(' '),
      ...(cols.price ? [r.price ?? '', r.price !== undefined ? r.price * r.quantity : ''] : []),
    ]),
    ...(total !== undefined ? [[], ['', '', '', '', ...(cols.maker ? [''] : []), '', '', '合計', total]] : []),
  ])
}
