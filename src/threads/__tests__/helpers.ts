import { parseSpec, type ParseOptions } from '../parse'
import type { PortSpec } from '../types'

/** 測試用：解析失敗直接丟錯 */
export function spec(text: string, options?: ParseOptions): PortSpec {
  const r = parseSpec(text, options)
  if (!r.ok) throw new Error(`${text}: ${r.error}`)
  return r.spec
}
