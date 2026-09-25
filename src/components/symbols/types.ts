import type { ComponentType } from 'react'
import type { PortState } from '../../engine'
import type { Rotation } from '../../store/flow'

export type Side = 'top' | 'right' | 'bottom' | 'left'

/** 埠在「未旋轉的符號本體座標」中的位置，以及管線從哪一側出線 */
export interface PortGeometry {
  x: number
  y: number
  side: Side
}

export interface SymbolProps {
  /** 元件狀態（型別由各元件定義決定，符號內自行轉型） */
  state: unknown
  /** 各埠壓力狀態；編輯模式下為 undefined，符號以一般線條色繪製 */
  ports?: Readonly<Record<string, PortState>>
  /** 節點旋轉角度，用來讓埠代號文字保持正立 */
  rotation: Rotation
}

/**
 * 元件的外觀定義：與引擎的行為定義（src/engine）以相同的 type 配對。
 * 每個 *Symbol.tsx 同時匯出繪圖元件與埠座標（刻意放在一起），因此 .oxlintrc.json
 * 對這些檔案關閉 only-export-components（代價只是修改符號時開發伺服器整頁重載）。
 */
export interface SymbolDef {
  width: number
  height: number
  ports: Readonly<Record<string, PortGeometry>>
  Symbol: ComponentType<SymbolProps>
}

const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left']

export function rotateSide(side: Side, rotation: Rotation): Side {
  return SIDES[(SIDES.indexOf(side) + rotation / 90) % 4]
}
