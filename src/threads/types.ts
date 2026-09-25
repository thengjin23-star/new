export type Gender = 'male' | 'female'

/**
 * 螺紋標準。台灣／日本常見的舊 JIS 寫法對應如下（解析器會自動轉換）：
 * - PT（錐管螺紋）：公牙 = R、母牙 = Rc
 * - PS（平行母牙，搭配 R 公牙）= Rp
 * - PF（平行管螺紋）= G
 */
export type ThreadStandard = 'R' | 'Rc' | 'Rp' | 'G' | 'NPT' | 'NPTF' | 'M' | 'UNF' | 'UNC'

export type ThreadFamily = 'iso-pipe' | 'npt' | 'metric' | 'unified'

export interface ThreadSpec {
  kind: 'thread'
  standard: ThreadStandard
  /** 管螺紋：'1/8'、'1/4'…；公制：外徑 '5'；統一螺紋：'10-32'、'1/4-28'… */
  size: string
  /** 公制螺紋的牙距（mm） */
  pitch?: number
  gender: Gender
}

export interface TubeSpec {
  kind: 'tube'
  /** 管外徑（mm）；英制管也換算成 mm 存放 */
  od: number
  system: 'metric' | 'inch'
  /** socket = 快插口（插入管子的一側）；stem = 插管端（本身就像一段管子） */
  role: 'socket' | 'stem'
}

export interface InterfaceSpec {
  kind: 'interface'
  /** 安裝面名稱，例如「SY3000 閥座面」「FRL-40 模組面」；相同名稱才能結合 */
  key: string
  /** plug = 元件側（例如閥的底面）；socket = 底座側（例如集裝座的站位）；mutual = 兩側相同的對接面 */
  role: 'plug' | 'socket' | 'mutual'
}

/** 一個埠的規格（螺紋、快插管徑或安裝面） */
export type PortSpec = ThreadSpec | TubeSpec | InterfaceSpec

/**
 * - ok：正確搭配
 * - warn：可以結合，但有密封或可靠度疑慮
 * - error：無法結合（需要轉接頭或換型號）
 * - unknown：至少一端尚未設定規格，無法檢查
 */
export type MateLevel = 'ok' | 'warn' | 'error' | 'unknown'

export interface MateResult {
  level: MateLevel
  /** 一句話結論 */
  summary: string
  /** 補充說明（原因、密封方式、建議） */
  reasons: string[]
}
