import type { Vec3 } from './vec3'

/**
 * 4×4 矩陣（column-major，與 three.js 相同）的旋轉部分 → 旋轉軸與角度（弧度）。
 * 只適用於純旋轉＋平移（模組零件的位置都是這種矩陣）。
 */
export function rotationAxisAngle(m: ArrayLike<number>): { axis: Vec3; angle: number } {
  // R 的第 r 列、第 c 行 = m[c * 4 + r]
  const r00 = m[0]
  const r11 = m[5]
  const r22 = m[10]
  const cos = Math.min(1, Math.max(-1, (r00 + r11 + r22 - 1) / 2))
  const angle = Math.acos(cos)
  if (angle < 1e-9) return { axis: [0, 0, 1], angle: 0 }
  if (Math.PI - angle > 1e-6) {
    const s = 2 * Math.sin(angle)
    const axis: Vec3 = [(m[6] - m[9]) / s, (m[8] - m[2]) / s, (m[1] - m[4]) / s]
    const l = Math.hypot(...axis)
    return { axis: [axis[0] / l, axis[1] / l, axis[2] / l], angle }
  }
  // 約 180°：由對角線求軸，再用非對角項決定正負號
  const x = Math.sqrt(Math.max(0, (r00 + 1) / 2))
  const y = Math.sqrt(Math.max(0, (r11 + 1) / 2))
  const z = Math.sqrt(Math.max(0, (r22 + 1) / 2))
  let axis: Vec3
  if (x >= y && x >= z) axis = [x, (m[4] + m[1]) / (4 * x), (m[8] + m[2]) / (4 * x)]
  else if (y >= z) axis = [(m[4] + m[1]) / (4 * y), y, (m[9] + m[6]) / (4 * y)]
  else axis = [(m[8] + m[2]) / (4 * z), (m[9] + m[6]) / (4 * z), z]
  const l = Math.hypot(...axis)
  return { axis: [axis[0] / l, axis[1] / l, axis[2] / l], angle }
}

/** 繞 axis 轉 angle（弧度）的旋轉矩陣作用在點上（Rodrigues） */
export function rotatePoint(p: Vec3, axis: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const [x, y, z] = axis
  const d = x * p[0] + y * p[1] + z * p[2]
  const cross: Vec3 = [y * p[2] - z * p[1], z * p[0] - x * p[2], x * p[1] - y * p[0]]
  return [p[0] * c + cross[0] * s + x * d * (1 - c), p[1] * c + cross[1] * s + y * d * (1 - c), p[2] * c + cross[2] * s + z * d * (1 - c)]
}
