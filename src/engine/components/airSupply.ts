import { DEFAULT_SUPPLY_PRESSURE } from '../constants'
import { defineComponent, NO_STATE, type NoState } from '../definition'
import { numParam } from '../params'

/** 氣源：P 埠恆定供壓 */
export const airSupply = defineComponent<NoState>({
  type: 'airSupply',
  label: '氣源',
  category: 'source',
  ports: [{ id: 'P', role: 'supply' }],
  params: [
    {
      key: 'pressure',
      label: '供氣壓力',
      unit: 'MPa',
      kind: 'number',
      default: DEFAULT_SUPPLY_PRESSURE,
      min: 0.05,
      max: 1.6,
      step: 0.05,
    },
  ],
  createState: () => NO_STATE,
  getInternalPaths: () => [],
  getSourcePorts: () => ['P'],
  sourcePressure: (params) => numParam(params, 'pressure', DEFAULT_SUPPLY_PRESSURE),
})
