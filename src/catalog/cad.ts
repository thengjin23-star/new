import type { CadFormat } from './types'
import { fromOcctResult, type OcctResult, type Tessellation } from './tessellation'

/** occt-import-js 模組介面 */
export interface OcctModule {
  ReadStepFile(content: Uint8Array, params: object | null): OcctResult
  ReadIgesFile(content: Uint8Array, params: object | null): OcctResult
}

/**
 * 三角化參數：以包圍盒比例控制弦高誤差，角度誤差約 11°，
 * 小孔也能取得足夠的點做圓擬合，同時控制三角形數量。
 */
export const TRIANGULATION_PARAMS = {
  linearUnit: 'millimeter',
  linearDeflectionType: 'bounding_box_ratio',
  linearDeflection: 0.001,
  angularDeflection: 0.2,
}

export function detectCadFormat(fileName: string): CadFormat | null {
  const ext = fileName.toLowerCase().split('.').pop()
  if (ext === 'step' || ext === 'stp') return 'step'
  if (ext === 'iges' || ext === 'igs') return 'iges'
  return null
}

export function readCad(occt: OcctModule, bytes: Uint8Array, format: CadFormat): Tessellation {
  const result = format === 'step' ? occt.ReadStepFile(bytes, TRIANGULATION_PARAMS) : occt.ReadIgesFile(bytes, TRIANGULATION_PARAMS)
  return fromOcctResult(result)
}
