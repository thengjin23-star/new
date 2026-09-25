import { dot, normalize, perpendicular, type Vec3 } from '../geometry/vec3'
import type { PortSpec } from '../threads'
import { newId } from '../utils/id'
import type { PortFrame, PortRotation, ProductPort } from './types'

const UP: Vec3 = [0, 0, 1]
const RIGHT: Vec3 = [1, 0, 0]

/**
 * 預設的旋轉基準：優先取「上方（+Z）」在垂直於 axis 平面上的投影；
 * axis 本身接近上下方向時改用 +X。兩個以相同慣例建模的零件鎖合後會保持同向。
 */
export function defaultRef(axis: Vec3): Vec3 {
  return perpendicular(Math.abs(dot(axis, UP)) < 0.9 ? UP : RIGHT, axis)
}

/** 正規化並確保 ref 與 axis 垂直 */
export function makeFrame(origin: Vec3, axis: Vec3, ref?: Vec3): PortFrame {
  const a = normalize(axis)
  let r = ref ? perpendicular(ref, a) : defaultRef(a)
  if (r[0] === 0 && r[1] === 0 && r[2] === 0) r = defaultRef(a)
  return { origin: [...origin], axis: a, ref: r }
}

/** 螺紋與快插可自由轉；安裝面預設固定 */
export function defaultRotation(spec: PortSpec | undefined): PortRotation {
  return spec?.kind === 'interface' ? 'fixed' : 'free'
}

export function makePort(input: {
  name: string
  spec?: PortSpec
  origin: Vec3
  axis: Vec3
  ref?: Vec3
  rotation?: PortRotation
  detected?: ProductPort['detected']
}): ProductPort {
  return {
    id: newId('p'),
    name: input.name,
    spec: input.spec,
    frame: makeFrame(input.origin, input.axis, input.ref),
    rotation: input.rotation ?? defaultRotation(input.spec),
    detected: input.detected,
  }
}
