import type { ProductMap } from '../assembly/moduleOps'
import type { ModuleDoc, PortRef } from '../assembly/types'
import { productLabel } from '../catalog/types'

/** 零件顯示名稱；同一產品出現多次時加上 #編號 */
export function instanceLabel(doc: ModuleDoc, products: ProductMap, instanceId: string): string {
  const inst = doc.instances.find((i) => i.id === instanceId)
  const product = inst && products[inst.productId]
  if (!inst || !product) return '（已刪除的零件）'
  const same = doc.instances.filter((i) => i.productId === inst.productId)
  const base = product.modelCode || productLabel(product)
  return same.length > 1 ? `${base} #${same.indexOf(inst) + 1}` : base
}

export function portLabel(doc: ModuleDoc, products: ProductMap, ref: PortRef): string {
  const inst = doc.instances.find((i) => i.id === ref.instance)
  const port = inst && products[inst.productId]?.ports.find((p) => p.id === ref.port)
  return `${instanceLabel(doc, products, ref.instance)}．${port?.name ?? '（已刪除的埠）'}`
}
