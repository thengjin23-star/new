import type { Params, ParamValue, PortDef, PortState, Signals } from './types'

/**
 * 元件分類（元件面板依此分組）
 * - source：氣源與氣源處理（過濾、調壓、給油、壓力錶）
 * - valve：方向控制閥
 * - flow：流量控制（單向閥、節流閥、速度控制閥）
 * - actuator：致動器
 * - logic：訊號與邏輯（梭動閥、雙壓閥、延時閥、壓力開關）
 * - misc：其他（排氣口、消音器、塞頭）
 */
export type ComponentCategory = 'source' | 'valve' | 'flow' | 'logic' | 'actuator' | 'misc'

/** 元件參數的定義（屬性面板依此產生表單） */
export interface ParamDef {
  key: string
  label: string
  /** 顯示用單位，例如 'MPa'、'mm'、's'、'%' */
  unit?: string
  kind: 'number' | 'select' | 'boolean'
  default: ParamValue
  min?: number
  max?: number
  step?: number
  options?: readonly { value: string; label: string }[]
  /** 模擬中可即時調整（例如節流開度、設定壓力） */
  live?: boolean
  hint?: string
  /** 只在迴路圖設定（訊號名稱等），產品的氣動功能不列出 */
  circuitOnly?: boolean
  /** 屬性面板的分組：'sizing' = 選型（負載、負載率），不列在一般參數表 */
  group?: 'sizing'
}

/**
 * 內部通路的完整寫法。簡寫 `[a, b]` 等同 `{ from: a, to: b }`：雙向、全開。
 */
export interface FlowPath {
  from: string
  to: string
  /** 只允許 from → to 方向流動（單向閥） */
  oneWay?: boolean
  /** 通過能力 0–1（節流開度），預設 1；0 視為關閉 */
  capacity?: number
  /** from → to 方向的出口壓力上限（MPa，調壓閥）；反方向不受限 */
  maxPressure?: number
}

export type InternalPath = readonly [string, string] | FlowPath

export interface UpdateContext<S> {
  state: S
  /** 本幀經過的秒數 */
  dt: number
  /** 本元件各埠在本幀開始時的壓力狀態，以埠代號為 key */
  ports: Readonly<Record<string, PortState>>
  /** 各埠的供氣能力 0–1（未提供時視為全開） */
  supplyFlow?: Readonly<Record<string, number>>
  /** 各埠的排氣能力 0–1（未提供時視為全開） */
  ventFlow?: Readonly<Record<string, number>>
  /** 各埠的壓力（MPa） */
  pressure?: Readonly<Record<string, number>>
  /** 已套用預設值的參數 */
  params?: Params
  /** 本幀開始時的訊號（感測器與電氣輸出），例如電磁線圈依 Y1、滾輪閥依 a1 動作 */
  signals?: Signals
}

/** 元件讀取自己的埠（產生訊號時用，例如壓力開關） */
export interface PortReading {
  ports: Readonly<Record<string, PortState>>
  pressure: Readonly<Record<string, number>>
}

/**
 * 使用者操作：
 * - 'toggle'：點擊元件本體
 * - 'press'／'release'：按住／放開（按鈕閥）
 * - 'coil:l'／'coil:r'：點擊左／右側電磁線圈
 */
export type InteractAction = string

/**
 * 元件定義：新增一種元件只需要寫一個符合此介面的物件並加入註冊表，引擎本身不必修改。
 *
 * 注意：下列成員刻意使用 method 語法（而非屬性 + 箭頭函式型別），
 * 讓 `ComponentDefinition<ValveState>` 可以放進 `ComponentDefinition<unknown>[]`。
 * 引擎呼叫時一律傳入已套用預設值的 params；直接呼叫（例如測試）時可以省略。
 */
export interface ComponentDefinition<S = unknown> {
  type: string
  /** 顯示名稱（繁體中文） */
  label: string
  category: ComponentCategory
  ports: readonly PortDef[]
  /** 可調整的參數與預設值 */
  params?: readonly ParamDef[]
  /** 不列在元件面板（例如只供產品對應用的內部元件） */
  hidden?: boolean

  createState(params?: Params): S

  /** 依目前狀態決定的內部通路：哪些埠彼此連通 */
  getInternalPaths(state: S, params?: Params): readonly InternalPath[]

  /** 恆定供壓的埠（例如氣源的 P） */
  getSourcePorts?(state: S, params?: Params): readonly string[]

  /** 氣源壓力（MPa）；未定義時使用 DEFAULT_SUPPLY_PRESSURE */
  sourcePressure?(params?: Params): number

  /** 直接通往大氣的埠（例如排氣口） */
  getExhaustPorts?(state: S, params?: Params): readonly string[]

  /** 使用者操作時的行為；有定義就代表此元件可互動 */
  onInteract?(state: S, action?: InteractAction, params?: Params): S

  /**
   * 依埠的壓力狀態決定的通路（梭動閥、雙壓閥、快速排氣閥）。solve 會反覆計算到穩定為止，
   * 因此邏輯元件的輸出在同一幀內就正確，不會有一幀的誤動作。
   * 第一次呼叫時還不知道埠狀態（ports 為空物件），請依 state（上一幀的狀態）決定。
   */
  portPaths?(ports: Readonly<Record<string, PortState>>, state: S, params?: Params): readonly InternalPath[]

  /** 本元件產生的訊號（例如氣缸的 a0／a1、壓力開關） */
  getSignals?(state: S, params: Params | undefined, reading: PortReading): Signals

  /**
   * 手動操作後，本元件帶動的電氣輸出：有命名的電磁線圈（例如 Y1）被點擊時，
   * 切換的是輸出 Y1，所有接在 Y1 的線圈一起動作。
   */
  manualOutputs?(state: S, params?: Params): Signals

  /**
   * 每幀的物理更新。狀態沒有變化時應回傳原本的 state 物件，
   * 讓畫面端可以用參考相等判斷而略過重繪。
   */
  update?(ctx: UpdateContext<S>): S
}

/** 保留定義端型別推導的小工具 */
export function defineComponent<S>(def: ComponentDefinition<S>): ComponentDefinition<S> {
  return def
}

/** 沒有內部狀態的元件使用 */
export type NoState = Readonly<Record<string, never>>

export const NO_STATE: NoState = Object.freeze({})

/** 把兩種通路寫法統一成 FlowPath */
export function normalizePath(path: InternalPath): FlowPath {
  return 'from' in path ? path : { from: path[0], to: path[1] }
}
