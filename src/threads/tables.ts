/*
 * 螺紋與管徑的尺寸資料（mm）。用途：
 * 1. 說明不相容的原因（牙數、牙角、外徑）
 * 2. 依 3D 模型量到的直徑建議規格（母牙的 CAD 模型常畫成小徑或攻牙徑，公牙畫成大徑）
 */

export interface PipeThreadSize {
  /** 每吋牙數 */
  tpi: number
  /** 大徑（基準徑） */
  major: number
  /** 小徑 */
  minor: number
  /** 錐管母牙（Rc）攻牙鑽頭徑 */
  tapDrillTaper: number
  /** 平行母牙（G／Rp）攻牙鑽頭徑 */
  tapDrillParallel: number
}

/** ISO 7-1（R／Rc／Rp）與 ISO 228-1（G）管螺紋，牙角 55° */
export const ISO_PIPE: Readonly<Record<string, PipeThreadSize>> = {
  '1/16': { tpi: 28, major: 7.723, minor: 6.561, tapDrillTaper: 6.4, tapDrillParallel: 6.8 },
  '1/8': { tpi: 28, major: 9.728, minor: 8.566, tapDrillTaper: 8.4, tapDrillParallel: 8.8 },
  '1/4': { tpi: 19, major: 13.157, minor: 11.445, tapDrillTaper: 11.2, tapDrillParallel: 11.8 },
  '3/8': { tpi: 19, major: 16.662, minor: 14.95, tapDrillTaper: 14.75, tapDrillParallel: 15.25 },
  '1/2': { tpi: 14, major: 20.955, minor: 18.631, tapDrillTaper: 18.25, tapDrillParallel: 19 },
  '3/4': { tpi: 14, major: 26.441, minor: 24.117, tapDrillTaper: 23.75, tapDrillParallel: 24.5 },
  '1': { tpi: 11, major: 33.249, minor: 30.291, tapDrillTaper: 30, tapDrillParallel: 30.75 },
}

export interface NptThreadSize {
  tpi: number
  /** 管外徑 */
  od: number
  tapDrill: number
}

/** ASME B1.20.1 NPT 錐管螺紋，牙角 60° */
export const NPT_SIZES: Readonly<Record<string, NptThreadSize>> = {
  '1/16': { tpi: 27, od: 7.938, tapDrill: 6.15 },
  '1/8': { tpi: 27, od: 10.287, tapDrill: 8.73 },
  '1/4': { tpi: 18, od: 13.716, tapDrill: 11.11 },
  '3/8': { tpi: 18, od: 17.145, tapDrill: 14.68 },
  '1/2': { tpi: 14, od: 21.336, tapDrill: 18.26 },
  '3/4': { tpi: 14, od: 26.67, tapDrill: 23.42 },
  '1': { tpi: 11.5, od: 33.401, tapDrill: 29.37 },
}

/** 管螺紋尺寸的顯示順序 */
export const PIPE_SIZE_ORDER = ['1/16', '1/8', '1/4', '3/8', '1/2', '3/4', '1'] as const

/** 公制粗牙的標準牙距；省略牙距時（例如「M5」）使用 */
export const METRIC_COARSE_PITCH: Readonly<Record<string, number>> = {
  '2': 0.4,
  '2.5': 0.45,
  '3': 0.5,
  '4': 0.7,
  '5': 0.8,
  '6': 1,
  '8': 1.25,
  '10': 1.5,
  '12': 1.75,
  '14': 2,
  '16': 2,
  '20': 2.5,
}

/** 氣動元件常見的公制螺紋（用於依直徑建議） */
export const METRIC_COMMON: readonly { d: number; p: number }[] = [
  { d: 3, p: 0.5 },
  { d: 4, p: 0.7 },
  { d: 5, p: 0.8 },
  { d: 6, p: 1 },
  { d: 6, p: 0.75 },
  { d: 8, p: 1 },
  { d: 8, p: 1.25 },
  { d: 10, p: 1 },
  { d: 10, p: 1.25 },
  { d: 10, p: 1.5 },
  { d: 12, p: 1.25 },
  { d: 12, p: 1.5 },
  { d: 14, p: 1.5 },
  { d: 16, p: 1.5 },
  { d: 18, p: 1.5 },
  { d: 20, p: 1.5 },
]

export interface UnifiedThreadSize {
  standard: 'UNF' | 'UNC'
  major: number
  tpi: number
}

/** ASME B1.1 統一螺紋（常見於美規接頭），牙角 60° */
export const UNIFIED_SIZES: Readonly<Record<string, UnifiedThreadSize>> = {
  '10-24': { standard: 'UNC', major: 4.826, tpi: 24 },
  '10-32': { standard: 'UNF', major: 4.826, tpi: 32 },
  '1/4-20': { standard: 'UNC', major: 6.35, tpi: 20 },
  '1/4-28': { standard: 'UNF', major: 6.35, tpi: 28 },
  '5/16-18': { standard: 'UNC', major: 7.938, tpi: 18 },
  '5/16-24': { standard: 'UNF', major: 7.938, tpi: 24 },
  '3/8-16': { standard: 'UNC', major: 9.525, tpi: 16 },
  '3/8-24': { standard: 'UNF', major: 9.525, tpi: 24 },
  '7/16-20': { standard: 'UNF', major: 11.113, tpi: 20 },
  '1/2-13': { standard: 'UNC', major: 12.7, tpi: 13 },
  '1/2-20': { standard: 'UNF', major: 12.7, tpi: 20 },
  '9/16-18': { standard: 'UNF', major: 14.288, tpi: 18 },
  '3/4-16': { standard: 'UNF', major: 19.05, tpi: 16 },
}

/** 公制氣動管外徑（mm） */
export const TUBE_METRIC_OD: readonly number[] = [2, 3, 4, 6, 8, 10, 12, 16]

/** 英制氣動管外徑 */
export const TUBE_INCH: readonly { label: string; od: number }[] = [
  { label: '1/8', od: 3.175 },
  { label: '5/32', od: 3.969 },
  { label: '3/16', od: 4.763 },
  { label: '1/4', od: 6.35 },
  { label: '5/16', od: 7.938 },
  { label: '3/8', od: 9.525 },
  { label: '1/2', od: 12.7 },
  { label: '5/8', od: 15.875 },
]

export const MM_PER_INCH = 25.4
