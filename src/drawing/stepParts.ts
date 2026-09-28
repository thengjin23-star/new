import { buildBom } from '../assembly/bom'
import type { ProductMap } from '../assembly/moduleOps'
import type { Mat4, ModuleDoc } from '../assembly/types'
import type { Tessellation } from '../catalog/tessellation'
import { hasModel, productLabel } from '../catalog/types'
import type { StepPart } from './stepAssembly'

const hex = (c: readonly number[]) =>
  `#${c
    .slice(0, 3)
    .map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0'))
    .join('')}`

export interface StepPlan {
  parts: StepPart[]
  /** 要讀取的原始檔（sha256） */
  sources: string[]
  /** 不會寫入 STEP 的零件 */
  skipped: { name: string; reason: string }[]
}

/**
 * 整理 STEP 組立檔的內容：每個零件實例一個實體，名稱為「項次_型號」（同一產品有多個時加 _1、_2…），
 * 顏色取模型本身的顏色。沒有 3D 檔或原始檔為 IGES 的零件略過。
 */
export function collectStepParts(
  doc: ModuleDoc,
  products: ProductMap,
  meshes: Readonly<Record<string, Tessellation>>,
  transforms: Readonly<Record<string, Mat4>>,
): StepPlan {
  const itemOf = new Map(buildBom(doc, products).map((r) => [r.product.id, r.index]))
  const counts = new Map<string, number>()
  for (const inst of doc.instances) counts.set(inst.productId, (counts.get(inst.productId) ?? 0) + 1)
  const seen = new Map<string, number>()
  const parts: StepPart[] = []
  const skipped: StepPlan['skipped'] = []
  const sources = new Set<string>()
  for (const inst of doc.instances) {
    const product = products[inst.productId]
    const matrix = transforms[inst.id]
    if (!product || !matrix) continue
    const k = (seen.get(product.id) ?? 0) + 1
    seen.set(product.id, k)
    const code = (product.modelCode || productLabel(product)).replace(/[\r\n'\\]/g, ' ').trim()
    const name = `${itemOf.get(product.id) ?? 0}_${code}${(counts.get(product.id) ?? 1) > 1 ? `_${k}` : ''}`
    if (!hasModel(product)) {
      if (k === 1) skipped.push({ name: code, reason: '沒有 3D 檔' })
      continue
    }
    if (product.source.format !== 'step') {
      if (k === 1) skipped.push({ name: code, reason: 'IGES 檔無法寫入 STEP 組立檔' })
      continue
    }
    const color = meshes[product.source.sha256]?.parts.find((p) => p.color)?.color
    parts.push({ name, source: product.source.sha256, matrix, color: color ? hex(color) : undefined })
    sources.add(product.source.sha256)
  }
  return { parts, sources: [...sources], skipped }
}
