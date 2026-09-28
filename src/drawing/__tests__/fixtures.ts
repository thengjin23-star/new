import type { ProjectionMesh } from '../projection'

export const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
export const translate = (x: number, y: number, z: number) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]

/** 長方體：每個面 2 個三角形、各自一個 B-rep 面（頂點不共用，與 STEP 三角化相同） */
export function box(sx: number, sy: number, sz: number): Pick<ProjectionMesh, 'positions' | 'indices' | 'faceRanges'> {
  const [x, y, z] = [sx / 2, sy / 2, sz / 2]
  const faces: [number, number, number][][] = [
    [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]], // 前 y-
    [[x, y, -z], [-x, y, -z], [-x, y, z], [x, y, z]], // 後 y+
    [[-x, y, -z], [-x, -y, -z], [-x, -y, z], [-x, y, z]], // 左 x-
    [[x, -y, -z], [x, y, -z], [x, y, z], [x, -y, z]], // 右 x+
    [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]], // 上 z+
    [[-x, y, -z], [x, y, -z], [x, -y, -z], [-x, -y, -z]], // 下 z-
  ]
  const positions: number[] = []
  const indices: number[] = []
  const ranges: number[] = []
  faces.forEach((quad, f) => {
    const base = positions.length / 3
    for (const p of quad) positions.push(...p)
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
    ranges.push(f * 2, f * 2 + 1)
  })
  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices), faceRanges: Uint32Array.from(ranges) }
}

/** 圓柱（軸向 z）：側面一個 B-rep 面，上下各一個面 */
export function cylinder(r: number, h: number, n = 32): Pick<ProjectionMesh, 'positions' | 'indices' | 'faceRanges'> {
  const positions: number[] = []
  const indices: number[] = []
  const ring = (z: number) => {
    const start = positions.length / 3
    for (let k = 0; k < n; k++) positions.push(r * Math.cos((2 * Math.PI * k) / n), r * Math.sin((2 * Math.PI * k) / n), z)
    return start
  }
  const bottom = ring(-h / 2)
  const top = ring(h / 2)
  for (let k = 0; k < n; k++) {
    const k2 = (k + 1) % n
    indices.push(bottom + k, bottom + k2, top + k2, bottom + k, top + k2, top + k)
  }
  const side = indices.length / 3
  // 上下蓋另外建頂點（與側面在邊界重合）
  const capTop = ring(h / 2)
  const capBottom = ring(-h / 2)
  const ct = positions.length / 3
  positions.push(0, 0, h / 2)
  const cb = positions.length / 3
  positions.push(0, 0, -h / 2)
  for (let k = 0; k < n; k++) indices.push(ct, capTop + k, capTop + ((k + 1) % n))
  for (let k = 0; k < n; k++) indices.push(cb, capBottom + ((k + 1) % n), capBottom + k)
  const faceRanges = [0, side - 1, side, side + n - 1, side + n, side + 2 * n - 1]
  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices), faceRanges: Uint32Array.from(faceRanges) }
}

export const segments = (f: Float32Array) => {
  const out: [number, number, number, number][] = []
  for (let i = 0; i < f.length; i += 4) out.push([f[i], f[i + 1], f[i + 2], f[i + 3]])
  return out
}
export const totalLength = (f: Float32Array) => segments(f).reduce((s, [a, b, c, d]) => s + Math.hypot(c - a, d - b), 0)

