import type { PortDef, PortState } from './types'

export type ComponentCategory = 'source' | 'valve' | 'actuator' | 'misc'

export interface UpdateContext<S> {
  state: S
  /** 本幀經過的秒數 */
  dt: number
  /** 本元件各埠在本幀開始時的壓力狀態，以埠代號為 key */
  ports: Readonly<Record<string, PortState>>
}

/**
 * 元件定義：新增一種元件只需要寫一個符合此介面的物件並加入註冊表，引擎本身不必修改。
 *
 * 注意：下列成員刻意使用 method 語法（而非屬性 + 箭頭函式型別），
 * 讓 `ComponentDefinition<ValveState>` 可以放進 `ComponentDefinition<unknown>[]`。
 */
export interface ComponentDefinition<S = unknown> {
  type: string
  /** 顯示名稱（繁體中文） */
  label: string
  category: ComponentCategory
  ports: readonly PortDef[]

  createState(): S

  /** 依目前狀態決定的內部通路：哪些埠彼此連通 */
  getInternalPaths(state: S): readonly (readonly [string, string])[]

  /** 恆定供壓的埠（例如氣源的 P） */
  getSourcePorts?(state: S): readonly string[]

  /** 直接通往大氣的埠（例如排氣口） */
  getExhaustPorts?(state: S): readonly string[]

  /** 使用者點擊時的行為；有定義就代表此元件可互動 */
  onInteract?(state: S): S

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
