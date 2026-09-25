import { BufferAttribute, BufferGeometry, Mesh } from 'three'
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh'
import type { MeshPart, Tessellation } from '../catalog/tessellation'

// 讓點選（raycast）使用 BVH 加速
BufferGeometry.prototype.computeBoundsTree = computeBoundsTree
BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree
Mesh.prototype.raycast = acceleratedRaycast

const cache = new Map<string, BufferGeometry[]>()

/**
 * 由網格資料建立 three.js 幾何（依 sha256 快取，同一產品的多個實例共用）。
 * BVH 使用 indirect 模式：不重新排列 index，點選得到的三角形編號才能對應回 B-rep 面。
 */
export function geometriesFor(sha256: string, tessellation: Tessellation): BufferGeometry[] {
  let list = cache.get(sha256)
  if (!list) {
    list = tessellation.parts.map((p) => {
      const g = new BufferGeometry()
      g.setAttribute('position', new BufferAttribute(p.positions, 3))
      g.setAttribute('normal', new BufferAttribute(p.normals, 3))
      g.setIndex(new BufferAttribute(p.indices, 1))
      g.computeBoundsTree({ indirect: true })
      g.computeBoundingSphere()
      return g
    })
    cache.set(sha256, list)
  }
  return list
}

const faceCache = new Map<string, BufferGeometry>()

/** 某個 B-rep 面的三角形（用於滑過時的高亮） */
export function faceGeometry(sha256: string, partIndex: number, part: MeshPart, face: number): BufferGeometry {
  const key = `${sha256}:${partIndex}:${face}`
  let g = faceCache.get(key)
  if (!g) {
    const first = part.faceRanges[face * 2]
    const last = part.faceRanges[face * 2 + 1]
    const positions = new Float32Array((last - first + 1) * 9)
    let o = 0
    for (let t = first; t <= last; t++) {
      for (let k = 0; k < 3; k++) {
        const v = part.indices[t * 3 + k] * 3
        positions[o++] = part.positions[v]
        positions[o++] = part.positions[v + 1]
        positions[o++] = part.positions[v + 2]
      }
    }
    g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(positions, 3))
    faceCache.set(key, g)
  }
  return g
}
