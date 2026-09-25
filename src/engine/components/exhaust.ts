import { defineComponent, NO_STATE, type NoState } from '../definition'

/** 排氣口／消音器：E 埠直接通往大氣 */
export const exhaust = defineComponent<NoState>({
  type: 'exhaust',
  label: '排氣口／消音器',
  category: 'misc',
  ports: [{ id: 'E', role: 'vent' }],
  createState: () => NO_STATE,
  getInternalPaths: () => [],
  getExhaustPorts: () => ['E'],
})
