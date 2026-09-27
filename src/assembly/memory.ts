import { hasModel, type Product, type ProductPort } from '../catalog/types'
import { checkMate, specKey, type MateLevel, type PortSpec } from '../threads'

/**
 * 「記住搭配」：每次鎖合都記下「A 產品的某個埠接過 B 產品的某個埠」，
 * 以及「某種規格的埠接過 B 產品的某個埠」（換了別的產品、同樣規格也能參考）。
 */
export interface PortSide {
  product: string
  port: string
  spec?: PortSpec
}

export const exactKey = (a: Pick<PortSide, 'product' | 'port'>, b: Pick<PortSide, 'product' | 'port'>): string =>
  `${a.product}:${a.port}>${b.product}:${b.port}`

export const specStatKey = (spec: PortSpec, b: Pick<PortSide, 'product' | 'port'>): string =>
  `spec:${specKey(spec)}>${b.product}:${b.port}`

/** 一次鎖合要累計的記錄（兩個方向各一筆，另加規格記錄） */
export function mateStatKeys(a: PortSide, b: PortSide): string[] {
  const keys = [exactKey(a, b), exactKey(b, a)]
  if (a.spec) keys.push(specStatKey(a.spec, b))
  if (b.spec) keys.push(specStatKey(b.spec, a))
  return keys
}

export interface Suggestion {
  product: Product
  port: ProductPort
  level: MateLevel
  /** 排序分數：同一個產品的同一個埠用過的次數 × 10 ＋ 同規格用過的次數 × 3 */
  score: number
  /** 用過的次數（顯示用） */
  uses: number
}

const LEVEL_ORDER: Record<MateLevel, number> = { ok: 0, warn: 1, unknown: 2, error: 3 }

/**
 * 可以接到 from 這個埠的產品：規格相容（正確或注意）的埠，或以前實際接過的埠。
 * 每個產品只取最適合的一個埠；依常用程度、相容等級、型號排序。
 */
export function suggestPartners(
  from: { product: Product; port: ProductPort },
  candidates: readonly Product[],
  stats: Readonly<Record<string, number>>,
): Suggestion[] {
  const fromSide = { product: from.product.id, port: from.port.id }
  const result: Suggestion[] = []
  for (const product of candidates) {
    if (!hasModel(product)) continue
    let best: Suggestion | undefined
    for (const port of product.ports) {
      const exact = stats[exactKey(fromSide, { product: product.id, port: port.id })] ?? 0
      const bySpec = from.port.spec ? (stats[specStatKey(from.port.spec, { product: product.id, port: port.id })] ?? 0) : 0
      const level = checkMate(from.port.spec, port.spec).level
      const compatible = level === 'ok' || level === 'warn'
      if (!compatible && exact === 0) continue
      const s: Suggestion = { product, port, level, score: exact * 10 + bySpec * 3, uses: exact + bySpec }
      if (!best || s.score > best.score || (s.score === best.score && LEVEL_ORDER[s.level] < LEVEL_ORDER[best.level])) best = s
    }
    if (best) result.push(best)
  }
  return result.sort(
    (a, b) => b.score - a.score || LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.product.modelCode.localeCompare(b.product.modelCode),
  )
}
