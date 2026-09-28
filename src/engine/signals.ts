import type { ParamDef } from './definition'
import type { Params } from './types'

/**
 * 訊號的命名：
 * - 電氣輸出（電磁線圈）：Y1、Y2…
 * - 氣缸位置感測器：氣缸代號 A、B… → 縮回端 a0、伸出端 a1（b0、b1…）
 * - 壓力開關：PS1、PS2…
 */
export const OUTPUT_NAMES: readonly string[] = Array.from({ length: 16 }, (_, i) => `Y${i + 1}`)
export const CYLINDER_LETTERS: readonly string[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
export const PRESSURE_SWITCH_NAMES: readonly string[] = Array.from({ length: 8 }, (_, i) => `PS${i + 1}`)

/** 氣缸代號 → 感測器名稱：sensorName('A', 1) = 'a1' */
export const sensorName = (letter: string, end: 0 | 1): string => `${letter.toLowerCase()}${end}`

export const SENSOR_NAMES: readonly string[] = CYLINDER_LETTERS.flatMap((l) => [sensorName(l, 0), sensorName(l, 1)])

/** 活塞位置在這個範圍內視為到達行程端（0～1） */
export const END_TOLERANCE = 0.001

/** 讀取字串參數；缺少或型別不符時回傳空字串 */
export function strParam(params: Params | undefined, key: string): string {
  const v = params?.[key]
  return typeof v === 'string' ? v : ''
}

/** 電磁線圈的訊號名稱參數（空白 = 手動，點線圈切換） */
export function coilParam(side: 'l' | 'r', label: string): ParamDef {
  return {
    key: side === 'l' ? 'coilL' : 'coilR',
    label,
    kind: 'select',
    default: '',
    options: [{ value: '', label: '（手動）' }, ...OUTPUT_NAMES.map((n) => ({ value: n, label: n }))],
    hint: '程序控制以這個輸出控制線圈；接在同一個輸出的線圈一起動作',
    circuitOnly: true,
  }
}

/** 氣缸的位置感測器（氣缸代號） */
export const SENSOR_PARAM: ParamDef = {
  key: 'sensor',
  label: '位置感測器',
  kind: 'select',
  default: '',
  options: [
    { value: '', label: '無' },
    ...CYLINDER_LETTERS.map((l) => ({ value: l, label: `氣缸 ${l}（${sensorName(l, 0)}／${sensorName(l, 1)}）` })),
  ],
  hint: '縮回端與伸出端的感測訊號，供程序控制與滾輪閥使用',
  circuitOnly: true,
}

/** 滾輪閥的觸發位置 */
export const TRIGGER_PARAM: ParamDef = {
  key: 'trigger',
  label: '觸發位置',
  kind: 'select',
  default: '',
  options: [
    { value: '', label: '（未指定）' },
    ...CYLINDER_LETTERS.flatMap((l) => [
      { value: sensorName(l, 0), label: `${sensorName(l, 0)}（氣缸 ${l} 縮回端）` },
      { value: sensorName(l, 1), label: `${sensorName(l, 1)}（氣缸 ${l} 伸出端）` },
    ]),
  ],
  hint: '氣缸到達這個位置時壓下滾輪',
  circuitOnly: true,
}
