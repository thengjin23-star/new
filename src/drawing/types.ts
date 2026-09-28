/**
 * 圖紙的圖元：單位 mm，原點在圖紙左上角、y 向下（與 SVG 相同）。
 * SVG、PDF、DXF 三種輸出都由同一份圖元產生。
 */
export type Pt = readonly [number, number]

/** DXF 圖層；SVG／PDF 依圖層決定線型 */
export type Layer = 'OUTLINE' | 'HIDDEN' | 'CENTER' | 'DIM' | 'TEXT' | 'TITLE' | 'FRAME' | 'BALLOON' | 'SYMBOL' | 'TUBE'

export type Primitive =
  | {
      kind: 'polyline'
      layer: Layer
      points: Pt[]
      closed?: boolean
      /** 線寬（mm） */
      width: number
      /** 虛線（mm）：線段、間隔… */
      dash?: readonly number[]
      color?: string
      fill?: string
    }
  | { kind: 'circle'; layer: Layer; center: Pt; r: number; width: number; color?: string; fill?: string }
  | {
      kind: 'text'
      layer: Layer
      at: Pt
      text: string
      /** 字高（mm，字的 em 大小） */
      size: number
      align?: 'left' | 'center' | 'right'
      valign?: 'baseline' | 'middle' | 'top' | 'bottom'
      /** 逆時針旋轉角度（度，以 at 為中心）；垂直尺寸的數字為 90 */
      angle?: number
      color?: string
    }
  | { kind: 'image'; layer: Layer; at: Pt; width: number; height: number; dataUrl: string }

export interface Sheet {
  /** 圖紙寬高（mm） */
  width: number
  height: number
  primitives: Primitive[]
  /** 主要視圖的比例（圖紙 mm ÷ 實際 mm）；DXF 以實際尺寸輸出時用來放大整張圖 */
  scale: number
  /** 檔名與文件標題 */
  title: string
}

/** 常用線寬（mm） */
export const LINE = {
  frame: 0.7,
  visible: 0.5,
  hidden: 0.25,
  thin: 0.25,
  table: 0.35,
} as const

export const HIDDEN_DASH = [2.5, 1.2] as const
