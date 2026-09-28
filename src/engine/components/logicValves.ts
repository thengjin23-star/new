import { defineComponent, NO_STATE, type NoState } from '../definition'
import { numParam } from '../params'
import { PRESSURE_SWITCH_NAMES, strParam } from '../signals'
import type { PortState } from '../types'

/** 梭動閥、雙壓閥內部的球（或滑軸）目前讓哪一個入口接到出口 */
export interface ShuttleState {
  open: 'X' | 'Y'
}

const pressurized = (ports: Readonly<Record<string, PortState>>, id: string) => ports[id] === 'pressure'

/** 梭動閥：有壓的入口推開球接到出口；兩邊都有壓或都沒壓時維持 */
function orOpen(ports: Readonly<Record<string, PortState>>, state: ShuttleState): 'X' | 'Y' {
  const x = pressurized(ports, 'X')
  const y = pressurized(ports, 'Y')
  if (x && !y) return 'X'
  if (y && !x) return 'Y'
  return state.open
}

/** 雙壓閥：先到的壓力把滑軸推過去、封住自己，出口接到另一個入口；兩個入口都有壓時出口才有壓 */
function andOpen(ports: Readonly<Record<string, PortState>>, state: ShuttleState): 'X' | 'Y' {
  const x = pressurized(ports, 'X')
  const y = pressurized(ports, 'Y')
  if (x && !y) return 'Y'
  if (y && !x) return 'X'
  return state.open
}

const LOGIC_PORTS = [
  { id: 'X', role: 'working', iso: '1' },
  { id: 'Y', role: 'working', iso: '1' },
  { id: 'A', role: 'working', iso: '2' },
] as const

/** 梭動閥（OR）：X 或 Y 任一有壓，A 就有壓 */
export const shuttleValve = defineComponent<ShuttleState>({
  type: 'shuttleValve',
  label: '梭動閥（OR）',
  category: 'logic',
  ports: LOGIC_PORTS,
  createState: () => ({ open: 'X' }),
  getInternalPaths: () => [],
  portPaths: (ports, state) => [[orOpen(ports, state), 'A']],
  update: ({ state, ports }) => {
    const open = orOpen(ports, state)
    return open === state.open ? state : { open }
  },
})

/** 雙壓閥（AND）：X 與 Y 都有壓，A 才有壓（雙手操作安全迴路） */
export const twoPressureValve = defineComponent<ShuttleState>({
  type: 'twoPressureValve',
  label: '雙壓閥（AND）',
  category: 'logic',
  ports: LOGIC_PORTS,
  createState: () => ({ open: 'X' }),
  getInternalPaths: () => [],
  portPaths: (ports, state) => [[andOpen(ports, state), 'A']],
  update: ({ state, ports }) => {
    const open = andOpen(ports, state)
    return open === state.open ? state : { open }
  },
})

export interface QuickExhaustState {
  /** P 有壓：P → A 供氣；P 洩壓：A 直接由 R 排氣 */
  supplying: boolean
}

/**
 * 快速排氣閥：P 有壓時 P → A、R 封閉；P 洩壓時膜片翻轉，A 直接由 R 排到大氣，
 * 不必經過長管線與方向閥（裝在氣缸口加快回程）。
 */
export const quickExhaust = defineComponent<QuickExhaustState>({
  type: 'quickExhaust',
  label: '快速排氣閥',
  category: 'flow',
  ports: [
    { id: 'P', role: 'working', iso: '1' },
    { id: 'A', role: 'working', iso: '2' },
    { id: 'R', role: 'vent', iso: '3' },
  ],
  createState: () => ({ supplying: false }),
  getInternalPaths: () => [],
  getExhaustPorts: () => ['R'],
  portPaths: (ports, state) => {
    const supplying = ports.P === undefined ? state.supplying : ports.P === 'pressure'
    // 排氣時膜片封住 P，A 只通 R
    return supplying ? [['P', 'A']] : [['A', 'R']]
  },
  update: ({ state, ports }) => {
    const supplying = ports.P === 'pressure'
    return supplying === state.supplying ? state : { supplying }
  },
})

/** 壓力開關：埠的壓力達到設定值時，輸出訊號（例如 PS1） */
export const pressureSwitch = defineComponent<NoState>({
  type: 'pressureSwitch',
  label: '壓力開關',
  category: 'logic',
  ports: [{ id: 'P', role: 'pilot' }],
  params: [
    {
      key: 'signal',
      label: '訊號名稱',
      kind: 'select',
      default: 'PS1',
      options: PRESSURE_SWITCH_NAMES.map((n) => ({ value: n, label: n })),
      circuitOnly: true,
    },
    { key: 'setpoint', label: '設定壓力', unit: 'MPa', kind: 'number', default: 0.4, min: 0.05, max: 1.6, step: 0.05, live: true },
  ],
  createState: () => NO_STATE,
  getInternalPaths: () => [],
  getSignals: (_, params, { pressure }) => {
    const name = strParam(params, 'signal')
    return name ? { [name]: (pressure.P ?? 0) >= numParam(params, 'setpoint', 0.4) - 1e-9 } : {}
  },
})
