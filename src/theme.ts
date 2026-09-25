import type { PortState } from './engine'

/** 管線與埠的顏色：有壓藍色、排氣淺灰、無壓深灰 */
export const PORT_STATE_COLOR: Record<PortState, string> = {
  pressure: '#2563eb',
  exhaust: '#cbd5e1',
  blocked: '#475569',
}

export const PORT_STATE_LABEL: Record<PortState, string> = {
  pressure: '有壓',
  exhaust: '排氣',
  blocked: '無壓',
}

export const WARNING_COLOR = '#f59e0b'

/** 符號本體的線條色 */
export const SYMBOL_STROKE = '#1e293b'

/** 氣缸腔室有壓時的填色 */
export const CHAMBER_PRESSURE_FILL = '#dbeafe'

/** 編輯模式（沒有壓力資訊）時用符號線條色，模擬中依壓力狀態上色 */
export function portColor(state: PortState | undefined): string {
  return state ? PORT_STATE_COLOR[state] : SYMBOL_STROKE
}
