import type { Vec3 } from './vec3'

/**
 * 3×3 對稱矩陣的特徵分解（Jacobi 旋轉法）。
 * 回傳特徵值由小到大排序，vectors[i] 為對應的單位特徵向量。
 */
export function symmetricEigen3(m: readonly (readonly number[])[]): { values: number[]; vectors: Vec3[] } {
  const a = m.map((row) => [...row])
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]
  for (let sweep = 0; sweep < 64; sweep++) {
    const off = a[0][1] ** 2 + a[0][2] ** 2 + a[1][2] ** 2
    const scale = a[0][0] ** 2 + a[1][1] ** 2 + a[2][2] ** 2 + off
    if (off <= 1e-24 * (scale || 1)) break
    for (const [p, q] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ]) {
      if (Math.abs(a[p][q]) < 1e-300) continue
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q])
      const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
      const c = 1 / Math.sqrt(t * t + 1)
      const s = t * c
      for (let k = 0; k < 3; k++) {
        const kp = a[k][p]
        const kq = a[k][q]
        a[k][p] = c * kp - s * kq
        a[k][q] = s * kp + c * kq
      }
      for (let k = 0; k < 3; k++) {
        const pk = a[p][k]
        const qk = a[q][k]
        a[p][k] = c * pk - s * qk
        a[q][k] = s * pk + c * qk
      }
      for (let k = 0; k < 3; k++) {
        const kp = v[k][p]
        const kq = v[k][q]
        v[k][p] = c * kp - s * kq
        v[k][q] = s * kp + c * kq
      }
    }
  }
  const order = [0, 1, 2].sort((i, j) => a[i][i] - a[j][j])
  return {
    values: order.map((i) => a[i][i]),
    vectors: order.map((i): Vec3 => [v[0][i], v[1][i], v[2][i]]),
  }
}

/**
 * 平面上的最小平方圓擬合（代數法，先平移到重心以保持數值穩定）。
 * 回傳圓心、半徑與均方根殘差。點數不足或共線時回傳 null。
 */
export function fitCircle2D(xs: readonly number[], ys: readonly number[]): { cx: number; cy: number; r: number; rms: number } | null {
  const n = xs.length
  if (n < 3) return null
  let mx = 0
  let my = 0
  for (let i = 0; i < n; i++) {
    mx += xs[i]
    my += ys[i]
  }
  mx /= n
  my /= n
  let suu = 0
  let svv = 0
  let suv = 0
  let suuu = 0
  let svvv = 0
  let suvv = 0
  let svuu = 0
  for (let i = 0; i < n; i++) {
    const u = xs[i] - mx
    const v = ys[i] - my
    suu += u * u
    svv += v * v
    suv += u * v
    suuu += u * u * u
    svvv += v * v * v
    suvv += u * v * v
    svuu += v * u * u
  }
  const det = suu * svv - suv * suv
  if (Math.abs(det) < 1e-12 * (suu + svv) ** 2) return null
  const b1 = 0.5 * (suuu + suvv)
  const b2 = 0.5 * (svvv + svuu)
  const uc = (b1 * svv - b2 * suv) / det
  const vc = (suu * b2 - suv * b1) / det
  const r = Math.sqrt(uc * uc + vc * vc + (suu + svv) / n)
  let sq = 0
  for (let i = 0; i < n; i++) {
    const d = Math.hypot(xs[i] - mx - uc, ys[i] - my - vc) - r
    sq += d * d
  }
  return { cx: uc + mx, cy: vc + my, r, rms: Math.sqrt(sq / n) }
}
