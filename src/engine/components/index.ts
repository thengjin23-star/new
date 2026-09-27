import type { ComponentDefinition } from '../definition'
import { filter, frl, lubricator, pressureGauge, regulator } from './airPrep'
import { airSupply } from './airSupply'
import { cylinderDouble } from './cylinderDouble'
import { cylinderSingle } from './cylinderSingle'
import { exhaust, plug, silencer } from './exhaust'
import { checkValve, flowControl, throttle } from './flowControls'
import {
  valve22NC,
  valve32Button,
  valve32NC,
  valve32NO,
  valve52Double,
  valve52Manual,
  valve52Single,
  valve53Closed,
  valve53Exhaust,
  valve53Pressure,
} from './valves'

export { filter, frl, lubricator, pressureGauge, regulator } from './airPrep'
export { airSupply } from './airSupply'
export {
  CYLINDER_PARAMS,
  cylinderDirection,
  cylinderDouble,
  cylinderForce,
  defaultRodDiameter,
  type CylinderState,
} from './cylinderDouble'
export { cylinderSingle } from './cylinderSingle'
export { exhaust, plug, silencer } from './exhaust'
export { checkValve, flowControl, throttle } from './flowControls'
export {
  boxOfPosition,
  defineValve,
  valvePorts,
  type ValveActuator,
  type ValveMode,
  type ValvePassage,
  type ValvePortSet,
  type ValveSpec,
  type ValveState,
} from './valveFactory'
export * from './valves'

/**
 * 內建元件清單。新增元件：在此資料夾新增一個檔案，並加進這個陣列。
 * 順序即為元件面板中的顯示順序（面板再依分類分組）。
 */
export const builtinComponents: readonly ComponentDefinition<unknown>[] = [
  airSupply,
  filter,
  regulator,
  lubricator,
  frl,
  pressureGauge,
  valve52Manual,
  valve52Single,
  valve52Double,
  valve53Closed,
  valve53Exhaust,
  valve53Pressure,
  valve32NC,
  valve32NO,
  valve32Button,
  valve22NC,
  checkValve,
  flowControl,
  throttle,
  cylinderDouble,
  cylinderSingle,
  exhaust,
  silencer,
  plug,
]
