import { Matrix4, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { rotatePoint, rotationAxisAngle } from '../mat4'
import type { Vec3 } from '../vec3'

/** 把分解出來的軸角轉回去，與原矩陣作用在幾個點上的結果比較 */
function roundTrip(m: Matrix4) {
  const { axis, angle } = rotationAxisAngle(m.elements)
  const rot = new Matrix4().extractRotation(m)
  for (const p of [
    [1, 0, 0],
    [0, 1, 0],
    [0.3, -2, 5],
  ] as Vec3[]) {
    const expected = new Vector3(...p).applyMatrix4(rot)
    const got = rotatePoint(p, axis, angle)
    expect(got[0]).toBeCloseTo(expected.x, 9)
    expect(got[1]).toBeCloseTo(expected.y, 9)
    expect(got[2]).toBeCloseTo(expected.z, 9)
  }
}

describe('rotationAxisAngle', () => {
  it('單位矩陣：角度 0', () => {
    expect(rotationAxisAngle(new Matrix4().elements).angle).toBe(0)
  })

  it('一般旋轉（含平移）可還原', () => {
    roundTrip(new Matrix4().makeRotationAxis(new Vector3(1, 2, 3).normalize(), 1.1).setPosition(10, 20, 30))
    roundTrip(new Matrix4().makeRotationZ(Math.PI / 2))
    roundTrip(new Matrix4().makeRotationX(-0.3))
  })

  it('180° 旋轉（軸向的正負號由非對角項決定）', () => {
    roundTrip(new Matrix4().makeRotationX(Math.PI))
    roundTrip(new Matrix4().makeRotationY(Math.PI))
    roundTrip(new Matrix4().makeRotationAxis(new Vector3(1, 1, 0).normalize(), Math.PI))
    roundTrip(new Matrix4().makeRotationAxis(new Vector3(-1, 2, 0.5).normalize(), Math.PI))
  })
})
