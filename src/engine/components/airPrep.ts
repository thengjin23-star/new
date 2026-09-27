import { defineComponent, NO_STATE, type NoState, type ParamDef } from '../definition'
import { numParam } from '../params'
import type { PortDef } from '../types'

/** 氣源處理元件共用的進出口 */
const IN_OUT: readonly PortDef[] = [
  { id: 'IN', role: 'supply', iso: '1' },
  { id: 'OUT', role: 'working', iso: '2' },
]

const SETTING: ParamDef = {
  key: 'setting',
  label: '設定壓力',
  unit: 'MPa',
  kind: 'number',
  default: 0.5,
  min: 0.05,
  max: 1,
  step: 0.05,
  live: true,
}

/** 過濾器：氣流直接通過 */
export const filter = defineComponent<NoState>({
  type: 'filter',
  label: '過濾器',
  category: 'source',
  ports: IN_OUT,
  createState: () => NO_STATE,
  getInternalPaths: () => [['IN', 'OUT']],
})

/** 調壓閥：出口壓力不超過設定值（反方向排氣不受限） */
export const regulator = defineComponent<NoState>({
  type: 'regulator',
  label: '調壓閥',
  category: 'source',
  ports: IN_OUT,
  params: [SETTING],
  createState: () => NO_STATE,
  getInternalPaths: (_, params) => [{ from: 'IN', to: 'OUT', maxPressure: numParam(params, 'setting', 0.5) }],
})

/** 給油器：氣流直接通過 */
export const lubricator = defineComponent<NoState>({
  type: 'lubricator',
  label: '給油器',
  category: 'source',
  ports: IN_OUT,
  createState: () => NO_STATE,
  getInternalPaths: () => [['IN', 'OUT']],
})

/** 三點組合（過濾＋調壓＋給油，簡化符號） */
export const frl = defineComponent<NoState>({
  type: 'frl',
  label: '三點組合（FRL）',
  category: 'source',
  ports: IN_OUT,
  params: [SETTING],
  createState: () => NO_STATE,
  getInternalPaths: (_, params) => [{ from: 'IN', to: 'OUT', maxPressure: numParam(params, 'setting', 0.5) }],
})

/** 壓力錶：顯示所接管路的壓力 */
export const pressureGauge = defineComponent<NoState>({
  type: 'pressureGauge',
  label: '壓力錶',
  category: 'source',
  ports: [{ id: 'P', role: 'working' }],
  createState: () => NO_STATE,
  getInternalPaths: () => [],
})
