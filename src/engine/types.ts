/**
 * 一個埠（或一條管線）目前的壓力狀態。
 *
 * - `pressure`：與氣源連通（有壓）
 * - `exhaust`：未與氣源連通，但與排氣口連通（通大氣／排氣中）
 * - `blocked`：兩者皆否（封閉、無壓）
 *
 * 刻意用字串 primitive 而非物件：UI 用 selector 訂閱時，值沒變就不會觸發重繪。
 */
export type PortState = 'pressure' | 'exhaust' | 'blocked'

/**
 * 埠的語意角色（僅作為中繼資料，solve 不依賴它）。
 *
 * - `supply`：供氣埠（氣源輸出、閥的 P）
 * - `working`：工作埠（閥的 A/B、氣缸的 A/B）
 * - `exhaust`：排氣埠，應以管線接到排氣口（閥的 EA/EB）；未接時 UI 會提出警告
 * - `vent`：本身就是通往大氣的開口（排氣口／消音器）
 */
export type PortRole = 'supply' | 'working' | 'exhaust' | 'vent'

export interface PortDef {
  /** 元件內唯一的埠代號，例如 'P'、'A'、'EA' */
  id: string
  role: PortRole
  /** ISO 5599 數字埠號（例如 P = 1、A = 4），畫面可切換以數字顯示 */
  iso?: string
}

/** 全域唯一的埠識別：`${nodeId}:${portId}` */
export type PortKey = string

export function portKey(nodeId: string, portId: string): PortKey {
  return `${nodeId}:${portId}`
}

/** 元件參數值（缸徑、節流開度、設定壓力…） */
export type ParamValue = number | string | boolean

/** 參數表：key 對應元件定義中的 ParamDef.key */
export type Params = Readonly<Record<string, ParamValue>>

export interface CircuitNode {
  id: string
  /** 元件註冊表中的 type */
  type: string
  /** 覆寫元件定義中預設值的參數；未提供的 key 使用預設值 */
  params?: Params
}

/** 管線：無方向，連接兩個埠 */
export interface Tube {
  id: string
  from: PortKey
  to: PortKey
}

/** 引擎看到的拓樸：只有「誰接誰」，不含座標、旋轉等畫面資訊 */
export interface Circuit {
  nodes: readonly CircuitNode[]
  tubes: readonly Tube[]
}

/** nodeId -> 該元件自己的狀態（型別由各元件定義決定） */
export type ComponentStates = Readonly<Record<string, unknown>>

export interface SolveResult {
  portStates: Readonly<Record<PortKey, PortState>>
  tubeStates: Readonly<Record<string, PortState>>
  /**
   * 各埠的供氣能力（0–1）：從氣源到此埠，沿途最窄處的通過能力（節流開度）。
   * 無壓的埠為 0。氣缸以它決定進氣側的速度。
   */
  supplyFlow: Readonly<Record<PortKey, number>>
  /** 各埠的排氣能力（0–1）：從此埠到排氣口，沿途最窄處的通過能力；無法排氣為 0 */
  ventFlow: Readonly<Record<PortKey, number>>
  /** 各埠的壓力（MPa）：氣源壓力經調壓閥限制後的值；無壓為 0 */
  pressure: Readonly<Record<PortKey, number>>
}

export interface SimState extends SolveResult {
  /** 模擬經過的秒數 */
  time: number
  componentStates: ComponentStates
}
