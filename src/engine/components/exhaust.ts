import { defineComponent, NO_STATE, type NoState } from '../definition'

/** 排氣口：E 埠直接通往大氣 */
export const exhaust = defineComponent<NoState>({
  type: 'exhaust',
  label: '排氣口',
  category: 'misc',
  ports: [{ id: 'E', role: 'vent' }],
  createState: () => NO_STATE,
  getInternalPaths: () => [],
  getExhaustPorts: () => ['E'],
})

/** 消音器：與排氣口相同，排氣時降低噪音 */
export const silencer = defineComponent<NoState>({
  type: 'silencer',
  label: '消音器',
  category: 'misc',
  ports: [{ id: 'E', role: 'vent' }],
  createState: () => NO_STATE,
  getInternalPaths: () => [],
  getExhaustPorts: () => ['E'],
})

/** 塞頭：封住不用的埠 */
export const plug = defineComponent<NoState>({
  type: 'plug',
  label: '塞頭',
  category: 'misc',
  ports: [{ id: 'P', role: 'working' }],
  createState: () => NO_STATE,
  getInternalPaths: () => [],
})
