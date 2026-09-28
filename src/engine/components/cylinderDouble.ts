import { CYLINDER_STROKE_SECONDS } from '../constants'
import { defineComponent, type ParamDef } from '../definition'
import { numParam } from '../params'
import { END_TOLERANCE, SENSOR_PARAM, sensorName, strParam } from '../signals'
import type { Params, PortState, Signals } from '../types'

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

/** 氣缸共用參數：缸徑與行程用於推力與圖面，行程時間決定模擬速度 */
export const CYLINDER_PARAMS: readonly ParamDef[] = [
  { key: 'bore', label: '缸徑', unit: 'mm', kind: 'number', default: 32, min: 2, max: 500, step: 1 },
  {
    key: 'rod',
    label: '活塞桿徑',
    unit: 'mm',
    kind: 'number',
    default: 0,
    min: 0,
    max: 300,
    step: 1,
    hint: '0 = 依缸徑自動帶入常用值',
  },
  { key: 'stroke', label: '行程', unit: 'mm', kind: 'number', default: 100, min: 1, max: 3000, step: 5 },
  {
    key: 'strokeTime',
    label: '行程時間（全開）',
    unit: 's',
    kind: 'number',
    default: CYLINDER_STROKE_SECONDS,
    min: 0.1,
    max: 30,
    step: 0.1,
    hint: '進排氣都不節流時走完全行程的秒數',
  },
]

/** 位置感測器：氣缸代號 A → 縮回端 a0、伸出端 a1 */
export function cylinderSignals(piston: number, params: Params | undefined): Signals {
  const letter = strParam(params, 'sensor')
  if (!letter) return {}
  return { [sensorName(letter, 0)]: piston <= END_TOLERANCE, [sensorName(letter, 1)]: piston >= 1 - END_TOLERANCE }
}

/** 依缸徑推算常用的活塞桿徑（ISO 15552／常見小型氣缸） */
const ROD_BY_BORE: readonly (readonly [number, number])[] = [
  [6, 3],
  [8, 4],
  [10, 4],
  [12, 6],
  [16, 6],
  [20, 8],
  [25, 10],
  [32, 12],
  [40, 16],
  [50, 20],
  [63, 20],
  [80, 25],
  [100, 25],
  [125, 32],
  [160, 40],
  [200, 40],
]

export function defaultRodDiameter(bore: number): number {
  let rod = ROD_BY_BORE[0][1]
  for (const [b, r] of ROD_BY_BORE) if (bore >= b) rod = r
  return rod
}

/**
 * 理論推力（N）：F = P × A，P 以 MPa（= N/mm²）計。
 * 伸出用無桿側面積，縮回扣掉活塞桿面積。
 */
export function cylinderForce(pressure: number, bore: number, rod: number, direction: 'extend' | 'retract'): number {
  const area = (Math.PI / 4) * (direction === 'extend' ? bore * bore : Math.max(0, bore * bore - rod * rod))
  return pressure * area
}

/** 活塞位置夾在 0～1；非常接近行程端時貼齊（避免累加誤差讓活塞停在 0.9999…） */
export function clampPiston(v: number): number {
  if (v >= 1 - 1e-9) return 1
  if (v <= 1e-9) return 0
  return v
}

/** 速度比例：進氣側與排氣側取較窄者（未提供流量資訊時視為全開） */
const speedFactor = (supply: number | undefined, vent: number | undefined) => Math.min(supply ?? 1, vent ?? 1)

/** 雙動氣缸：A 為後端（無桿側），B 為前端（有桿側）；兩腔被活塞隔開，沒有內部通路 */
export const cylinderDouble = defineComponent<CylinderState>({
  type: 'cylinderDouble',
  label: '雙動氣缸',
  category: 'actuator',
  ports: [
    { id: 'A', role: 'working' },
    { id: 'B', role: 'working' },
  ],
  params: [...CYLINDER_PARAMS, SENSOR_PARAM],
  createState: () => ({ piston: 0 }),
  getInternalPaths: () => [],
  getSignals: (state, params) => cylinderSignals(state.piston, params),
  update: ({ state, dt, ports, supplyFlow, ventFlow, params }) => {
    const dir = cylinderDirection(ports.A ?? 'blocked', ports.B ?? 'blocked')
    if (dir === 0) return state
    const factor = dir > 0 ? speedFactor(supplyFlow?.A, ventFlow?.B) : speedFactor(supplyFlow?.B, ventFlow?.A)
    const strokeTime = numParam(params, 'strokeTime', CYLINDER_STROKE_SECONDS)
    const piston = clampPiston(state.piston + (dir * dt * factor) / strokeTime)
    return piston === state.piston ? state : { piston }
  },
})
