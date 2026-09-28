import type { ProductPort } from '../catalog/types'
import type { Vec3 } from '../geometry/vec3'
import { fmtNum, tubeLabel } from '../threads'
import type { ModuleDoc, ModuleTube } from './types'

/**
 * PU 管：只能接在快插接頭（管徑規格、插座）上，兩端管徑必須相同。
 * 管線沿兩端埠的軸線以三次貝茲曲線畫出；長度依曲線估算（可修改）。
 */

export type TubeError = 'not-socket' | 'od-mismatch' | 'same-port'

export const TUBE_ERROR_TEXT: Record<TubeError, string> = {
  'not-socket': 'PU 管只能接在快插接頭的插管端',
  'od-mismatch': '兩端的管徑不同，需要變徑接頭',
  'same-port': '請點選另一個快插接頭',
}

/** 兩個埠能不能用 PU 管連接；可以時回傳管徑 */
export function tubeCheck(a: ProductPort | undefined, b: ProductPort | undefined): { ok: true; od: number; label: string } | { ok: false; error: TubeError } {
  const sa = a?.spec
  const sb = b?.spec
  if (!sa || !sb || sa.kind !== 'tube' || sb.kind !== 'tube' || sa.role !== 'socket' || sb.role !== 'socket') return { ok: false, error: 'not-socket' }
  if (Math.abs(sa.od - sb.od) > 0.01 || sa.system !== sb.system) return { ok: false, error: 'od-mismatch' }
  return { ok: true, od: sa.od, label: tubeLabel(sa) }
}

/** 單一埠可不可以接 PU 管 */
export const isTubeSocket = (p: ProductPort | undefined): boolean => p?.spec?.kind === 'tube' && p.spec.role === 'socket'

/** 管線曲線的 4 個控制點：沿兩端埠的軸線（朝外）拉出，距離依兩端距離決定 */
export function tubeControlPoints(a: { origin: Vec3; axis: Vec3 }, b: { origin: Vec3; axis: Vec3 }): [Vec3, Vec3, Vec3, Vec3] {
  const dist = Math.hypot(b.origin[0] - a.origin[0], b.origin[1] - a.origin[1], b.origin[2] - a.origin[2])
  const d = Math.min(200, Math.max(15, dist * 0.5))
  const at = (p: Vec3, v: Vec3): Vec3 => [p[0] + v[0] * d, p[1] + v[1] * d, p[2] + v[2] * d]
  return [a.origin, at(a.origin, a.axis), at(b.origin, b.axis), b.origin]
}

export function bezierPoint(p: readonly Vec3[], t: number): Vec3 {
  const u = 1 - t
  const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t]
  return [0, 1, 2].map((k) => w[0] * p[0][k] + w[1] * p[1][k] + w[2] * p[2][k] + w[3] * p[3][k]) as Vec3
}

/** 曲線長度（取樣折線） */
export function bezierLength(p: readonly Vec3[], samples = 48): number {
  let len = 0
  let prev = p[0]
  for (let i = 1; i <= samples; i++) {
    const q = bezierPoint(p, i / samples)
    len += Math.hypot(q[0] - prev[0], q[1] - prev[1], q[2] - prev[2])
    prev = q
  }
  return len
}

/** 建議的裁切長度：曲線長度加上兩端插入快插接頭的長度（約管徑 2 倍），進位到 10 mm */
export function estimateTubeLength(curveLength: number, od: number): number {
  return Math.ceil((curveLength + 4 * od) / 10) * 10
}

/** 常見 PU 管的內徑（外徑 → 內徑，mm）；其他管徑約為外徑的 0.65 倍 */
const TUBE_ID: Readonly<Record<number, number>> = { 3: 2, 4: 2.5, 6: 4, 8: 5, 10: 6.5, 12: 8, 16: 10 }

export function tubeInnerDiameter(od: number): number {
  const known = Object.entries(TUBE_ID).find(([o]) => Math.abs(Number(o) - od) < 0.01)
  return known ? known[1] : Math.round(od * 0.65 * 2) / 2
}

export interface TubeBomRow {
  label: string
  od: number
  count: number
  /** 總長（mm） */
  length: number
}

/** 管徑的顯示文字（零件表以它彙總） */
export const tubeLabelOf = (t: Pick<ModuleTube, 'label' | 'od'>): string => t.label ?? `Ø${fmtNum(t.od)}`

/** PU 管依管徑彙總（總長，mm）；沒有長度的管以 estimate 估算 */
export function tubeBom(doc: Pick<ModuleDoc, 'tubes'>, estimate?: (tube: ModuleTube) => number | undefined): TubeBomRow[] {
  const rows = new Map<string, TubeBomRow>()
  for (const t of doc.tubes ?? []) {
    const label = tubeLabelOf(t)
    const row = rows.get(label) ?? { label, od: t.od, count: 0, length: 0 }
    row.count++
    row.length += t.length ?? estimate?.(t) ?? 0
    rows.set(label, row)
  }
  return [...rows.values()].sort((a, b) => a.od - b.od)
}

/** 長度顯示：1250 → 「1.25 m」 */
export const formatMeters = (mm: number): string => `${(Math.round(mm / 10) / 100).toFixed(2)} m`

/**
 * PU 管的三角網格（出圖用，不需要 three.js）：沿貝茲曲線掃出圓管，兩端不封口。
 * 整條管視為一個曲面（只畫輪廓線，沒有特徵邊）。
 */
export function tubeMesh(points: readonly Vec3[], radius: number, segments = 48, radial = 16): { positions: Float32Array; indices: Uint32Array; faceRanges: Uint32Array } {
  const positions: number[] = []
  const indices: number[] = []
  // 沿曲線的切線與不旋轉的法向量（平行傳送）
  let normal: Vec3 | undefined
  const tangentAt = (t: number): Vec3 => {
    const a = bezierPoint(points, Math.max(0, t - 1e-3))
    const b = bezierPoint(points, Math.min(1, t + 1e-3))
    const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const l = Math.hypot(...d) || 1
    return [d[0] / l, d[1] / l, d[2] / l]
  }
  const cross = (u: Vec3, v: Vec3): Vec3 => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
  const norm = (v: Vec3): Vec3 => {
    const l = Math.hypot(...v) || 1
    return [v[0] / l, v[1] / l, v[2] / l]
  }
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const c = bezierPoint(points, t)
    const tan = tangentAt(t)
    if (!normal) {
      const helper: Vec3 = Math.abs(tan[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]
      normal = norm(cross(tan, helper))
    } else {
      // 去掉與切線平行的分量
      const d = normal[0] * tan[0] + normal[1] * tan[1] + normal[2] * tan[2]
      normal = norm([normal[0] - d * tan[0], normal[1] - d * tan[1], normal[2] - d * tan[2]])
    }
    const binormal = cross(tan, normal)
    for (let k = 0; k < radial; k++) {
      const a = (2 * Math.PI * k) / radial
      const cs = Math.cos(a) * radius
      const sn = Math.sin(a) * radius
      positions.push(c[0] + normal[0] * cs + binormal[0] * sn, c[1] + normal[1] * cs + binormal[1] * sn, c[2] + normal[2] * cs + binormal[2] * sn)
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let k = 0; k < radial; k++) {
      const a = i * radial + k
      const b = i * radial + ((k + 1) % radial)
      const c = (i + 1) * radial + k
      const d = (i + 1) * radial + ((k + 1) % radial)
      indices.push(a, c, b, b, c, d)
    }
  }
  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices), faceRanges: Uint32Array.from([0, indices.length / 3 - 1]) }
}
