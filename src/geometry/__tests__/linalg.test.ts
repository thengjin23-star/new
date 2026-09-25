import { describe, expect, it } from 'vitest'
import { fitCircle2D, symmetricEigen3 } from '../linalg'
import { dot, normalize, type Vec3 } from '../vec3'

/** A·v */
const mul = (m: number[][], v: Vec3): Vec3 => [dot(m[0] as Vec3, v), dot(m[1] as Vec3, v), dot(m[2] as Vec3, v)]

describe('symmetricEigen3', () => {
  it('對角矩陣：特徵值由小到大', () => {
    const { values } = symmetricEigen3([
      [3, 0, 0],
      [0, 1, 0],
      [0, 0, 2],
    ])
    expect(values.map((v) => +v.toFixed(9))).toEqual([1, 2, 3])
  })

  it('一般對稱矩陣：A·v = λ·v，且特徵向量互相正交', () => {
    const m = [
      [4, 1, 2],
      [1, 3, 0.5],
      [2, 0.5, 5],
    ]
    const { values, vectors } = symmetricEigen3(m)
    vectors.forEach((v, i) => {
      const av = mul(m, v)
      for (let k = 0; k < 3; k++) expect(av[k]).toBeCloseTo(values[i] * v[k], 9)
    })
    expect(dot(vectors[0], vectors[1])).toBeCloseTo(0, 9)
    expect(dot(vectors[1], vectors[2])).toBeCloseTo(0, 9)
  })

  it('圓柱面的法向量：最小特徵值對應軸向', () => {
    const axis = normalize([1, 2, 3])
    const u = normalize([2, -1, 0])
    const w = [axis[1] * u[2] - axis[2] * u[1], axis[2] * u[0] - axis[0] * u[2], axis[0] * u[1] - axis[1] * u[0]] as Vec3
    const m = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2
      const n: Vec3 = [0, 1, 2].map((i) => Math.cos(a) * u[i] + Math.sin(a) * w[i]) as Vec3
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[i][j] += n[i] * n[j]
    }
    const { values, vectors } = symmetricEigen3(m)
    expect(values[0]).toBeCloseTo(0, 9)
    expect(Math.abs(dot(vectors[0], axis))).toBeCloseTo(1, 9)
  })
})

describe('fitCircle2D', () => {
  it('完整圓與部分圓弧都能擬合', () => {
    for (const span of [Math.PI * 2, Math.PI, Math.PI / 2]) {
      const xs: number[] = []
      const ys: number[] = []
      for (let k = 0; k <= 20; k++) {
        const a = (k / 20) * span
        xs.push(5 + 4.3 * Math.cos(a))
        ys.push(-2 + 4.3 * Math.sin(a))
      }
      const c = fitCircle2D(xs, ys)!
      expect(c.cx).toBeCloseTo(5, 6)
      expect(c.cy).toBeCloseTo(-2, 6)
      expect(c.r).toBeCloseTo(4.3, 6)
      expect(c.rms).toBeLessThan(1e-6)
    }
  })

  it('點數不足或共線時回傳 null', () => {
    expect(fitCircle2D([0, 1], [0, 1])).toBeNull()
    expect(fitCircle2D([0, 1, 2, 3], [0, 1, 2, 3])).toBeNull()
  })
})
