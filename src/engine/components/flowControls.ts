import { defineComponent, NO_STATE, type NoState, type ParamDef } from '../definition'
import { numParam } from '../params'
import type { PortDef } from '../types'

const PORTS_12: readonly PortDef[] = [
  { id: '1', role: 'working' },
  { id: '2', role: 'working' },
]

const OPENING: ParamDef = {
  key: 'opening',
  label: '節流開度',
  unit: '%',
  kind: 'number',
  default: 50,
  min: 0,
  max: 100,
  step: 5,
  live: true,
  hint: '100% = 全開；0% = 關閉',
}

const capacityOf = (params: Parameters<typeof numParam>[0]) => numParam(params, 'opening', 50) / 100

/** 單向閥：只允許 1 → 2 */
export const checkValve = defineComponent<NoState>({
  type: 'checkValve',
  label: '單向閥',
  category: 'flow',
  ports: PORTS_12,
  createState: () => NO_STATE,
  getInternalPaths: () => [{ from: '1', to: '2', oneWay: true }],
})

/**
 * 速度控制閥（單向節流閥）：1 → 2 經單向閥自由流動，2 → 1 經節流。
 * 裝在氣缸口做排氣節流（meter-out）時，1 接閥、2 接氣缸。
 */
export const flowControl = defineComponent<NoState>({
  type: 'flowControl',
  label: '速度控制閥（單向節流）',
  category: 'flow',
  ports: PORTS_12,
  params: [OPENING],
  createState: () => NO_STATE,
  getInternalPaths: (_, params) => [
    { from: '1', to: '2', oneWay: true },
    { from: '2', to: '1', oneWay: true, capacity: capacityOf(params) },
  ],
})

/** 節流閥：雙向節流 */
export const throttle = defineComponent<NoState>({
  type: 'throttle',
  label: '節流閥（雙向）',
  category: 'flow',
  ports: PORTS_12,
  params: [OPENING],
  createState: () => NO_STATE,
  getInternalPaths: (_, params) => [{ from: '1', to: '2', capacity: capacityOf(params) }],
})
