import { defineComponent, NO_STATE, type NoState } from '../definition'

/** 氣源：P 埠恆定供壓 */
export const airSupply = defineComponent<NoState>({
  type: 'airSupply',
  label: '氣源',
  category: 'source',
  ports: [{ id: 'P', role: 'supply' }],
  createState: () => NO_STATE,
  getInternalPaths: () => [],
  getSourcePorts: () => ['P'],
})
