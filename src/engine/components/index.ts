import type { ComponentDefinition } from '../definition'
import { airSupply } from './airSupply'
import { cylinderDouble } from './cylinderDouble'
import { exhaust } from './exhaust'
import { valve52Manual } from './valve52Manual'

export { airSupply } from './airSupply'
export { cylinderDirection, cylinderDouble, type CylinderState } from './cylinderDouble'
export { exhaust } from './exhaust'
export { VALVE52_PATHS, valve52Manual, type Valve52State } from './valve52Manual'

/**
 * 內建元件清單。新增元件：在此資料夾新增一個檔案，並加進這個陣列。
 * 順序即為元件面板中的顯示順序。
 */
export const builtinComponents: readonly ComponentDefinition<unknown>[] = [
  airSupply,
  valve52Manual,
  cylinderDouble,
  exhaust,
]
