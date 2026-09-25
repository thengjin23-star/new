import { CYLINDER_STROKE_SECONDS } from '../constants'
import { defineComponent } from '../definition'
import type { PortState } from '../types'

export interface CylinderState {
  /** 活塞位置：0 = 完全縮回，1 = 完全伸出 */
  piston: number
}

/**
 * 活塞運動方向：
 * - A 有壓且 B 通往排氣 → 伸出（+1）
 * - B 有壓且 A 通往排氣 → 縮回（-1）
 * - 其餘（兩端都有壓、都沒壓、一端被封住）→ 停止（0）
 */
export function cylinderDirection(a: PortState, b: PortState): -1 | 0 | 1 {
  if (a === 'pressure' && b === 'exhaust') return 1
  if (b === 'pressure' && a === 'exhaust') return -1
  return 0
}

/** 雙動氣缸：A 為後端（無桿側），B 為前端（有桿側）；兩腔被活塞隔開，沒有內部通路 */
export const cylinderDouble = defineComponent<CylinderState>({
  type: 'cylinderDouble',
  label: '雙動氣缸',
  category: 'actuator',
  ports: [
    { id: 'A', role: 'working' },
    { id: 'B', role: 'working' },
  ],
  createState: () => ({ piston: 0 }),
  getInternalPaths: () => [],
  update: ({ state, dt, ports }) => {
    const dir = cylinderDirection(ports.A ?? 'blocked', ports.B ?? 'blocked')
    if (dir === 0) return state
    const piston = Math.min(1, Math.max(0, state.piston + (dir * dt) / CYLINDER_STROKE_SECONDS))
    return piston === state.piston ? state : { piston }
  },
})
