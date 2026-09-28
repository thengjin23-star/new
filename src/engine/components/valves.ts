import { defineValve, type ValvePassage, type ValveSpec, type ValveState } from './valveFactory'

/** 5 口閥常用的兩種通道組合 */
const P_A: readonly ValvePassage[] = [
  ['P', 'A'],
  ['B', 'EB'],
]
const P_B: readonly ValvePassage[] = [
  ['P', 'B'],
  ['A', 'EA'],
]

/** @deprecated 相容舊程式：5/2 手動閥各閥位的通道（閥位 0：P→A；閥位 1：P→B） */
export const VALVE52_PATHS = { 0: P_A, 1: P_B } as const

/** 舊名稱：5/2 手動閥的狀態 */
export type Valve52State = ValveState

/**
 * 所有閥的規格。方格由左到右排列；彈簧復歸閥的靜止位在右側方格（ISO 1219 畫法），
 * 單電控 5/2 靜止時 1→2（P→B）、4→5（A→EA），通電後 1→4（P→A）。
 */
export const VALVE_SPECS = {
  valve52Manual: {
    type: 'valve52Manual',
    label: '5/2 手動閥（定位）',
    portSet: 5,
    // 閥位 0（右格）：P→A；閥位 1（左格）：P→B —— 與第一版相同
    boxes: [P_B, P_A],
    positionBox: [1, 0],
    rest: 0,
    left: ['lever'],
    right: ['detent'],
    mode: 'toggle',
  },
  valve52Single: {
    type: 'valve52Single',
    label: '5/2 單電控閥',
    portSet: 5,
    boxes: [P_A, P_B],
    rest: 1,
    left: ['solenoid'],
    right: ['spring'],
    mode: 'springReturn',
  },
  valve52Double: {
    type: 'valve52Double',
    label: '5/2 雙電控閥（記憶）',
    portSet: 5,
    boxes: [P_A, P_B],
    rest: 1,
    left: ['solenoid'],
    right: ['solenoid'],
    mode: 'double',
  },
  valve53Closed: {
    type: 'valve53Closed',
    label: '5/3 中位封閉',
    portSet: 5,
    boxes: [P_A, [], P_B],
    rest: 1,
    left: ['spring', 'solenoid'],
    right: ['spring', 'solenoid'],
    mode: 'doubleCentered',
  },
  valve53Exhaust: {
    type: 'valve53Exhaust',
    label: '5/3 中位排氣',
    portSet: 5,
    boxes: [
      P_A,
      [
        ['A', 'EA'],
        ['B', 'EB'],
      ],
      P_B,
    ],
    rest: 1,
    left: ['spring', 'solenoid'],
    right: ['spring', 'solenoid'],
    mode: 'doubleCentered',
  },
  valve53Pressure: {
    type: 'valve53Pressure',
    label: '5/3 中位加壓',
    portSet: 5,
    boxes: [
      P_A,
      [
        ['P', 'A'],
        ['P', 'B'],
      ],
      P_B,
    ],
    rest: 1,
    left: ['spring', 'solenoid'],
    right: ['spring', 'solenoid'],
    mode: 'doubleCentered',
  },
  valve32NC: {
    type: 'valve32NC',
    label: '3/2 電磁閥（常閉）',
    portSet: 3,
    boxes: [[['P', 'A']], [['A', 'R']]],
    rest: 1,
    left: ['solenoid'],
    right: ['spring'],
    mode: 'springReturn',
  },
  valve32NO: {
    type: 'valve32NO',
    label: '3/2 電磁閥（常開）',
    portSet: 3,
    boxes: [[['A', 'R']], [['P', 'A']]],
    rest: 1,
    left: ['solenoid'],
    right: ['spring'],
    mode: 'springReturn',
  },
  valve32Button: {
    type: 'valve32Button',
    label: '3/2 按鈕閥（常閉）',
    portSet: 3,
    boxes: [[['P', 'A']], [['A', 'R']]],
    rest: 1,
    left: ['button'],
    right: ['spring'],
    mode: 'button',
  },
  valve22NC: {
    type: 'valve22NC',
    label: '2/2 電磁閥（常閉）',
    portSet: 2,
    boxes: [[['P', 'A']], []],
    rest: 1,
    left: ['solenoid'],
    right: ['spring'],
    mode: 'springReturn',
  },
  valve52Pilot: {
    type: 'valve52Pilot',
    label: '5/2 單氣控閥',
    portSet: 5,
    boxes: [P_A, P_B],
    rest: 1,
    left: ['pilot'],
    right: ['spring'],
    mode: 'pilot',
    pilots: { l: '14' },
  },
  valve52DoublePilot: {
    type: 'valve52DoublePilot',
    label: '5/2 雙氣控閥（記憶）',
    portSet: 5,
    boxes: [P_A, P_B],
    rest: 1,
    left: ['pilot'],
    right: ['pilot'],
    mode: 'pilotDouble',
    pilots: { l: '14', r: '12' },
  },
  valve32Pilot: {
    type: 'valve32Pilot',
    label: '3/2 氣控閥（常閉）',
    portSet: 3,
    boxes: [[['P', 'A']], [['A', 'R']]],
    rest: 1,
    left: ['pilot'],
    right: ['spring'],
    mode: 'pilot',
    pilots: { l: '12' },
  },
  valve32Roller: {
    type: 'valve32Roller',
    label: '3/2 滾輪閥（常閉）',
    portSet: 3,
    boxes: [[['P', 'A']], [['A', 'R']]],
    rest: 1,
    left: ['roller'],
    right: ['spring'],
    mode: 'roller',
  },
  valve32Timer: {
    type: 'valve32Timer',
    label: '氣動延時閥（常閉）',
    portSet: 3,
    boxes: [[['P', 'A']], [['A', 'R']]],
    rest: 1,
    left: ['pilot'],
    right: ['spring'],
    mode: 'timer',
    pilots: { l: '12' },
    category: 'logic',
  },
} as const satisfies Record<string, ValveSpec>

export type ValveType = keyof typeof VALVE_SPECS

export const valve52Manual = defineValve(VALVE_SPECS.valve52Manual)
export const valve52Single = defineValve(VALVE_SPECS.valve52Single)
export const valve52Double = defineValve(VALVE_SPECS.valve52Double)
export const valve53Closed = defineValve(VALVE_SPECS.valve53Closed)
export const valve53Exhaust = defineValve(VALVE_SPECS.valve53Exhaust)
export const valve53Pressure = defineValve(VALVE_SPECS.valve53Pressure)
export const valve32NC = defineValve(VALVE_SPECS.valve32NC)
export const valve32NO = defineValve(VALVE_SPECS.valve32NO)
export const valve32Button = defineValve(VALVE_SPECS.valve32Button)
export const valve22NC = defineValve(VALVE_SPECS.valve22NC)
export const valve52Pilot = defineValve(VALVE_SPECS.valve52Pilot)
export const valve52DoublePilot = defineValve(VALVE_SPECS.valve52DoublePilot)
export const valve32Pilot = defineValve(VALVE_SPECS.valve32Pilot)
export const valve32Roller = defineValve(VALVE_SPECS.valve32Roller)
export const valve32Timer = defineValve(VALVE_SPECS.valve32Timer)
