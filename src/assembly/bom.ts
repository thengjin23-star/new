import { CATEGORY_LABEL, type Product } from '../catalog/types'
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

const csvCell = (v: string | number) => {
  const s = String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV（開頭加 UTF-8 BOM，Excel 開啟時中文才不會變亂碼） */
export function bomToCsv(doc: ModuleDoc, rows: readonly BomRow[]): string {
  const lines = [
    [`模組：${doc.name}`].map(csvCell).join(','),
    ...(doc.customer ? [[`客戶：${doc.customer}`].map(csvCell).join(',')] : []),
    '',
    ['項次', '型號', '名稱', '類別', '數量'].join(','),
    ...rows.map((r) =>
      [r.index, r.product.modelCode, r.product.name, CATEGORY_LABEL[r.product.category], r.quantity].map(csvCell).join(','),
    ),
  ]
  return '﻿' + lines.join('\r\n') + '\r\n'
}
