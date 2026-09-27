import { useMemo } from 'react'
import { moduleBounds, type Bounds } from './bounds'
import { useModuleStore, useTransforms } from './moduleStore'

/** 目前模組的外形範圍（依零件頂點計算） */
export function useModuleBounds(): Bounds | undefined {
  const doc = useModuleStore((s) => s.doc)
  const products = useModuleStore((s) => s.products)
  const meshes = useModuleStore((s) => s.meshes)
  const { transforms } = useTransforms()
  return useMemo(() => moduleBounds(doc, products, meshes, transforms), [doc, products, meshes, transforms])
}
