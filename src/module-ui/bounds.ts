import { Matrix4, Vector3 } from 'three'
import type { ModuleDoc } from '../assembly/types'
import type { Tessellation } from '../catalog/tessellation'
import type { Product } from '../catalog/types'
import type { Vec3 } from '../geometry/vec3'

export interface Bounds {
  min: Vec3
  max: Vec3
}

/**
 * 模組的外形尺寸：把每個零件的所有頂點轉到世界座標後取範圍（旋轉的零件也精確）。
 * 還沒有網格的零件略過；沒有任何零件時回傳 undefined。
 */
export function moduleBounds(
  doc: ModuleDoc,
  products: Readonly<Record<string, Product>>,
  meshes: Readonly<Record<string, Tessellation>>,
  transforms: Readonly<Record<string, number[]>>,
): Bounds | undefined {
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  const m = new Matrix4()
  const v = new Vector3()
  let any = false
  for (const inst of doc.instances) {
    const product = products[inst.productId]
    const mesh = product && meshes[product.source.sha256]
    const t = transforms[inst.id]
    if (!mesh || !t) continue
    m.fromArray(t)
    for (const part of mesh.parts) {
      const p = part.positions
      for (let i = 0; i < p.length; i += 3) {
        v.set(p[i], p[i + 1], p[i + 2]).applyMatrix4(m)
        if (v.x < min[0]) min[0] = v.x
        if (v.y < min[1]) min[1] = v.y
        if (v.z < min[2]) min[2] = v.z
        if (v.x > max[0]) max[0] = v.x
        if (v.y > max[1]) max[1] = v.y
        if (v.z > max[2]) max[2] = v.z
        any = true
      }
    }
  }
  return any ? { min, max } : undefined
}

/** 尺寸顯示到 0.1 mm */
export const formatMm = (n: number): string => (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, '')
