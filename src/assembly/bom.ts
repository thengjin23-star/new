import { CATEGORY_LABEL, type Product } from '../catalog/types'
import { toCsv } from '../utils/csv'
import type { ProductMap } from './moduleOps'
import type { ModuleDoc } from './types'

export interface BomRow {
  index: number
  product: Product
  quantity: number
}

/** 依產品彙總數量；順序依第一次加入模組的先後 */
export function buildBom(doc: ModuleDoc, products: ProductMap): BomRow[] {
  const rows = new Map<string, BomRow>()
  for (const inst of doc.instances) {
    const product = products[inst.productId]
    if (!product) continue
    const row = rows.get(product.id)
    if (row) row.quantity++
    else rows.set(product.id, { index: rows.size + 1, product, quantity: 1 })
  }
  return [...rows.values()]
}

/** BOM 是否要顯示廠牌、單價欄（有任何一個產品填了才顯示） */
export function bomColumns(products: readonly Pick<Product, 'maker' | 'price'>[]): { maker: boolean; price: boolean } {
  return { maker: products.some((p) => !!p.maker), price: products.some((p) => typeof p.price === 'number') }
}

/** 合計金額；沒有任何單價時為 undefined */
export function bomTotal(rows: readonly { price?: number; quantity: number }[]): number | undefined {
  const priced = rows.filter((r) => typeof r.price === 'number')
  return priced.length ? priced.reduce((sum, r) => sum + r.price! * r.quantity, 0) : undefined
}

/** CSV（開頭加 UTF-8 BOM，Excel 開啟時中文才不會變亂碼） */
export function bomToCsv(doc: ModuleDoc, rows: readonly BomRow[]): string {
  const cols = bomColumns(rows.map((r) => r.product))
  const total = bomTotal(rows.map((r) => ({ price: r.product.price, quantity: r.quantity })))
  return toCsv([
    [`模組：${doc.name}`],
    ...(doc.customer ? [[`客戶：${doc.customer}`]] : []),
    [],
    ['項次', '型號', '名稱', '類別', ...(cols.maker ? ['廠牌'] : []), '數量', ...(cols.price ? ['單價', '小計'] : [])],
    ...rows.map((r) => [
      r.index,
      r.product.modelCode,
      r.product.name,
      CATEGORY_LABEL[r.product.category],
      ...(cols.maker ? [r.product.maker ?? ''] : []),
      r.quantity,
      ...(cols.price ? [r.product.price ?? '', r.product.price !== undefined ? r.product.price * r.quantity : ''] : []),
    ]),
    ...(total !== undefined ? [[], ['', '', '', '', ...(cols.maker ? [''] : []), '', '合計', total]] : []),
  ])
}
