import { CYLINDER_STROKE_SECONDS } from '../constants'
import { defineComponent } from '../definition'
import { numParam } from '../params'
import { CYLINDER_PARAMS, type CylinderState } from './cylinderDouble'

/**
 * 單動氣缸（彈簧復歸）：A 有壓 → 伸出；A 排氣 → 彈簧推回；A 被封住 → 停在原處。
 * 前端為呼吸孔，不需要接管。
 */
export const cylinderSingle = defineComponent<CylinderState>({
  type: 'cylinderSingle',
  label: '單動氣缸（彈簧復歸）',
  category: 'actuator',
  ports: [{ id: 'A', role: 'working' }],
  params: [
    ...CYLINDER_PARAMS,
    {
      key: 'returnTime',
      label: '復歸時間',
      unit: 's',
      kind: 'number',
      default: CYLINDER_STROKE_SECONDS,
      min: 0.1,
      max: 30,
      step: 0.1,
      hint: '排氣不節流時彈簧推回全行程的秒數',
    },
  ],
  createState: () => ({ piston: 0 }),
  getInternalPaths: () => [],
  update: ({ state, dt, ports, supplyFlow, ventFlow, params }) => {
    const a = ports.A ?? 'blocked'
    let delta = 0
    if (a === 'pressure') delta = (dt * (supplyFlow?.A ?? 1)) / numParam(params, 'strokeTime', CYLINDER_STROKE_SECONDS)
    else if (a === 'exhaust') delta = -(dt * (ventFlow?.A ?? 1)) / numParam(params, 'returnTime', CYLINDER_STROKE_SECONDS)
    if (delta === 0) return state
    const piston = Math.min(1, Math.max(0, state.piston + delta))
    return piston === state.piston ? state : { piston }
  },
})
