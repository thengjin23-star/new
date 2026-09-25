import { symmetricEigen3, fitCircle2D } from '../geometry/linalg'
import { add, cross, distance, dot, length, normalize, perpendicular, scale, sub, type Vec3 } from '../geometry/vec3'
import type { MeshPart } from './tessellation'

/** 點選的 B-rep 面經分析後的幾何 */
export type FaceAnalysis =
  | {
      kind: 'cylinder'
      /** 軸向（單位向量；正負號任意） */
      axis: Vec3
      /** 軸線上的一點（與 axis 正交的分量） */
      center: Vec3
      radius: number
      /** 沿 axis 的範圍（t = 點·axis） */
      tMin: number
      tMax: number
      /** 孔（法向量朝向軸線）或凸柱（法向量背向軸線） */
      shape: 'hole' | 'boss'
    }
  | { kind: 'plane'; normal: Vec3; centroid: Vec3; area: number }
  | { kind: 'other'; normal: Vec3; centroid: Vec3 }

interface FaceSamples {
  points: Vec3[]
  normals: Vec3[]
  /** 三角形的幾何法向量（未正規化，長度 = 面積×2） */
  triangleNormals: Vec3[]
  triangleCentroids: Vec3[]
}

/** 取出某個 B-rep 面的頂點（去除重複）與三角形資訊 */
export function sampleFace(part: MeshPart, faceIndex: number): FaceSamples {
  const first = part.faceRanges[faceIndex * 2]
  const last = part.faceRanges[faceIndex * 2 + 1]
  const seen = new Set<number>()
  const points: Vec3[] = []
  const normals: Vec3[] = []
  const triangleNormals: Vec3[] = []
  const triangleCentroids: Vec3[] = []
  const P = part.positions
  const N = part.normals
  const at = (i: number): Vec3 => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]
  for (let t = first; t <= last; t++) {
    const ids = [part.indices[t * 3], part.indices[t * 3 + 1], part.indices[t * 3 + 2]]
    for (const i of ids) {
      if (seen.has(i)) continue
      seen.add(i)
      points.push(at(i))
      normals.push(normalize([N[i * 3], N[i * 3 + 1], N[i * 3 + 2]]))
    }
    const [a, b, c] = ids.map(at)
    triangleNormals.push(cross(sub(b, a), sub(c, a)))
    triangleCentroids.push(scale(add(add(a, b), c), 1 / 3))
  }
  return { points, normals, triangleNormals, triangleCentroids }
}

/** 分析面的形狀：平面、圓柱（孔或凸柱），或其他曲面 */
export function analyzeFace(part: MeshPart, faceIndex: number): FaceAnalysis {
  const s = sampleFace(part, faceIndex)

  // 面積加權的平均法向量與重心；以頂點法向量決定朝外的方向
  let area = 0
  let normalSum: Vec3 = [0, 0, 0]
  let centroid: Vec3 = [0, 0, 0]
  s.triangleNormals.forEach((n, i) => {
    const a = length(n) / 2
    area += a
    normalSum = add(normalSum, n)
    centroid = add(centroid, scale(s.triangleCentroids[i], a))
  })
  centroid = area > 0 ? scale(centroid, 1 / area) : s.points[0]
  const vertexMean = normalize(s.normals.reduce(add, [0, 0, 0] as Vec3))
  let normal = normalize(normalSum)
  if (dot(normal, vertexMean) < 0) normal = scale(normal, -1)

  // 平面：所有頂點法向量與平均法向量的夾角都小於 2°
  const flat = s.normals.every((n) => dot(n, vertexMean) > Math.cos((2 * Math.PI) / 180))
  if (flat) return { kind: 'plane', normal: vertexMean, centroid, area }

  // 圓柱：法向量都與軸垂直 → 法向量共變異矩陣的最小特徵值接近 0，且法向量在平面上有足夠的分佈
  if (s.points.length >= 6) {
    const m = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]
    for (const n of s.normals) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[i][j] += n[i] * n[j]
    const { values, vectors } = symmetricEigen3(m)
    if (values[0] < 0.02 * values[2] && values[1] > 0.05 * values[2]) {
      const axis = normalize(vectors[0])
      const u = perpendicular(Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], axis)
      const w = cross(axis, u)
      const circle = fitCircle2D(
        s.points.map((p) => dot(p, u)),
        s.points.map((p) => dot(p, w)),
      )
      if (circle && circle.rms < 0.02 * circle.r + 1e-3) {
        const center = add(scale(u, circle.cx), scale(w, circle.cy))
        const ts = s.points.map((p) => dot(p, axis))
        // 法向量與「從軸線指向頂點」的方向一致 → 凸柱；相反 → 孔
        let facing = 0
        s.points.forEach((p, i) => {
          const radial = perpendicular(sub(p, center), axis)
          facing += dot(radial, s.normals[i])
        })
        return {
          kind: 'cylinder',
          axis,
          center,
          radius: circle.r,
          tMin: Math.min(...ts),
          tMax: Math.max(...ts),
          shape: facing < 0 ? 'hole' : 'boss',
        }
      }
    }
  }
  return { kind: 'other', normal, centroid }
}

/** 從 origin 沿 dir 發出射線，若沒有碰到零件就回傳 true（由呼叫端以 BVH 實作） */
export type OpenTester = (origin: Vec3, dir: Vec3) => boolean

export interface PortProposal {
  origin: Vec3
  /** 朝外的方向 */
  axis: Vec3
  shape: 'hole' | 'boss' | 'plane'
  diameter?: number
  /** 圓柱面沿軸向的長度（孔深或螺紋長） */
  length?: number
}

/**
 * 依面的分析結果提出埠的位置與方向：
 * - 孔：原點在孔口，axis 朝孔外
 * - 凸柱：原點在根部（肩面），axis 朝尖端
 * - 平面：原點在面的重心，axis 為面的法向量
 * 判斷孔口／尖端的方法：在靠近孔壁（0.85r）處沿軸向往外發射 4 條射線，
 * 真正的開口端射線會離開零件；內側端（孔底、縮徑台階、接頭本體）會碰到零件。
 */
export function proposePort(face: FaceAnalysis, isOpen: OpenTester, click?: Vec3): PortProposal {
  if (face.kind === 'plane') return { origin: face.centroid, axis: face.normal, shape: 'plane' }
  if (face.kind === 'other') return { origin: click ?? face.centroid, axis: face.normal, shape: 'plane' }

  const { axis, center, radius, tMin, tMax } = face
  const ends = [
    { point: add(center, scale(axis, tMin)), out: scale(axis, -1) },
    { point: add(center, scale(axis, tMax)), out: axis },
  ]
  const u = perpendicular(Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], axis)
  const w = cross(axis, u)
  const openness = ends.map(({ point, out }) => {
    let free = 0
    for (let k = 0; k < 4; k++) {
      const angle = (k * Math.PI) / 2
      const offset = add(scale(u, Math.cos(angle) * radius * 0.85), scale(w, Math.sin(angle) * radius * 0.85))
      if (isOpen(add(add(point, scale(out, 0.05)), offset), out)) free++
    }
    return free >= 3
  })

  const nearest = click ? (distance(click, ends[0].point) <= distance(click, ends[1].point) ? 0 : 1) : 1
  // 開口端：只有一端開放就取那一端；兩端都開放（貫穿）或都不開放時，取靠近點選位置的一端
  const openEnd = openness[0] !== openness[1] ? (openness[0] ? 0 : 1) : nearest
  const length_ = tMax - tMin
  const diameter = radius * 2

  if (face.shape === 'hole') {
    const mouth = ends[openEnd]
    return { origin: mouth.point, axis: mouth.out, shape: 'hole', diameter, length: length_ }
  }
  // 凸柱：開口端是螺紋尖端，原點取另一端（根部），方向朝尖端
  const tip = ends[openEnd]
  const base = ends[1 - openEnd]
  return { origin: base.point, axis: tip.out, shape: 'boss', diameter, length: length_ }
}
