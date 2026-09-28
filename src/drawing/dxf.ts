import { baselineOffset } from './text'
import type { Layer, Primitive, Sheet } from './types'

/**
 * 圖紙 → DXF（AutoCAD R12 格式，幾乎所有 CAD 都能開）。
 *
 * - 單位 mm。視圖以 1:1 實際尺寸輸出，圖框、表格、文字依圖面比例放大（除以 scale），
 *   在 CAD 裡量到的就是實際尺寸；出圖時以同樣比例列印即可。
 * - 中文字以 \U+XXXX 表示（與字碼頁無關），文字樣式預設使用微軟正黑體（msjh.ttc）。
 * - 圖層：OUTLINE 外形線、HIDDEN 隱藏線、CENTER 中心線、DIM 尺寸、TEXT 文字、TITLE 標題欄與表格、
 *   FRAME 圖框、BALLOON 件號、SYMBOL 迴路符號、TUBE 管路。
 */

/** 圖層的顏色（AutoCAD 色號）與線型 */
const LAYERS: Record<Layer, { color: number; linetype: 'CONTINUOUS' | 'HIDDEN' | 'CENTER' }> = {
  OUTLINE: { color: 7, linetype: 'CONTINUOUS' },
  HIDDEN: { color: 2, linetype: 'HIDDEN' },
  CENTER: { color: 1, linetype: 'CENTER' },
  DIM: { color: 3, linetype: 'CONTINUOUS' },
  TEXT: { color: 7, linetype: 'CONTINUOUS' },
  TITLE: { color: 7, linetype: 'CONTINUOUS' },
  FRAME: { color: 7, linetype: 'CONTINUOUS' },
  BALLOON: { color: 3, linetype: 'CONTINUOUS' },
  SYMBOL: { color: 7, linetype: 'CONTINUOUS' },
  TUBE: { color: 5, linetype: 'CONTINUOUS' },
}

const num = (v: number) => {
  const r = Math.round(v * 10000) / 10000
  return Object.is(r, -0) ? '0' : String(r)
}

/** 非 ASCII 字元改寫成 \U+XXXX；AutoCAD 的控制碼 %% 前面再加一個 % 避免被解讀 */
export function dxfText(text: string): string {
  let out = ''
  for (const ch of text) {
    const code = ch.codePointAt(0)!
    if (code < 32) continue
    if (code < 128) out += ch
    else if (code <= 0xffff) out += `\\U+${code.toString(16).toUpperCase().padStart(4, '0')}`
    else out += '?'
  }
  return out.replace(/%%/g, '%%%')
}

export interface DxfOptions {
  /** 文字樣式的字型檔名（例如 msjh.ttc） */
  font?: string
}

/** 產生 DXF 檔的內容 */
export function sheetToDxf(sheet: Sheet, options: DxfOptions = {}): string {
  return sheetsToDxf([sheet], options)
}

/** 多張圖紙放在同一個 DXF：由左到右排列，間隔 20 mm（圖紙上的長度） */
export function sheetsToDxf(sheets: readonly Sheet[], options: DxfOptions = {}): string {
  const k = 1 / (sheets[0]?.scale || 1)
  const offsets: number[] = []
  let cursor = 0
  for (const s of sheets) {
    offsets.push(cursor)
    cursor += (s.width + 20) * k
  }
  const totalWidth = cursor - 20 * k
  const maxHeight = Math.max(...sheets.map((s) => s.height))
  const out: string[] = []
  const g = (code: number, value: string | number) => out.push(String(code), typeof value === 'number' ? num(value) : value)

  // ---- HEADER ----
  g(0, 'SECTION')
  g(2, 'HEADER')
  g(9, '$ACADVER')
  g(1, 'AC1009')
  g(9, '$INSBASE')
  g(10, 0)
  g(20, 0)
  g(30, 0)
  g(9, '$EXTMIN')
  g(10, 0)
  g(20, 0)
  g(30, 0)
  g(9, '$EXTMAX')
  g(10, totalWidth)
  g(20, maxHeight * k)
  g(30, 0)
  g(9, '$LIMMIN')
  g(10, 0)
  g(20, 0)
  g(9, '$LIMMAX')
  g(10, totalWidth)
  g(20, maxHeight * k)
  g(9, '$LTSCALE')
  g(40, 1)
  g(9, '$TEXTSTYLE')
  g(7, 'STANDARD')
  g(9, '$DWGCODEPAGE')
  g(3, 'ANSI_950')
  g(0, 'ENDSEC')

  // ---- TABLES：線型、圖層、文字樣式 ----
  g(0, 'SECTION')
  g(2, 'TABLES')
  const linetypes: [string, string, number[]][] = [
    ['CONTINUOUS', 'Solid line', []],
    // 虛線與鏈線的長度依圖紙上的 mm 設定，再依比例放大
    ['HIDDEN', 'Hidden __ __ __', [2.5, -1.2]],
    ['CENTER', 'Center ____ _ ____', [6, -1, 0.5, -1]],
  ]
  g(0, 'TABLE')
  g(2, 'LTYPE')
  g(70, linetypes.length)
  for (const [name, description, pattern] of linetypes) {
    g(0, 'LTYPE')
    g(2, name)
    g(70, 0)
    g(3, description)
    g(72, 65)
    g(73, pattern.length)
    g(40, pattern.reduce((s, v) => s + Math.abs(v), 0) * k)
    for (const v of pattern) g(49, v * k)
  }
  g(0, 'ENDTAB')
  g(0, 'TABLE')
  g(2, 'LAYER')
  const layerNames = Object.keys(LAYERS) as Layer[]
  g(70, layerNames.length + 1)
  g(0, 'LAYER')
  g(2, '0')
  g(70, 0)
  g(62, 7)
  g(6, 'CONTINUOUS')
  for (const name of layerNames) {
    g(0, 'LAYER')
    g(2, name)
    g(70, 0)
    g(62, LAYERS[name].color)
    g(6, LAYERS[name].linetype)
  }
  g(0, 'ENDTAB')
  g(0, 'TABLE')
  g(2, 'STYLE')
  g(70, 1)
  g(0, 'STYLE')
  g(2, 'STANDARD')
  g(70, 0)
  g(40, 0)
  g(41, 1)
  g(50, 0)
  g(71, 0)
  g(42, 2.5 * k)
  g(3, options.font || 'msjh.ttc')
  g(4, '')
  g(0, 'ENDTAB')
  g(0, 'ENDSEC')

  // ---- ENTITIES ----
  g(0, 'SECTION')
  g(2, 'ENTITIES')
  let X = (x: number) => x * k
  let Y = (y: number) => y * k
  const entity = (p: Primitive) => {
    const layer = p.layer
    switch (p.kind) {
      case 'polyline': {
        const dashed = !!p.dash?.length && LAYERS[layer].linetype === 'CONTINUOUS'
        const filledTriangle = p.fill && p.fill !== '#ffffff' && p.closed && (p.points.length === 3 || p.points.length === 4)
        if (filledTriangle) {
          // 實心箭頭：SOLID（第 3、4 點的順序與一般多邊形相反）
          const [a, b, c, d = c] = p.points
          g(0, 'SOLID')
          g(8, layer)
          g(10, X(a[0]))
          g(20, Y(a[1]))
          g(30, 0)
          g(11, X(b[0]))
          g(21, Y(b[1]))
          g(31, 0)
          g(12, X(d[0]))
          g(22, Y(d[1]))
          g(32, 0)
          g(13, X(c[0]))
          g(23, Y(c[1]))
          g(33, 0)
          return
        }
        if (p.points.length === 2 && !p.closed) {
          const [a, b] = p.points
          g(0, 'LINE')
          g(8, layer)
          if (dashed) g(6, 'HIDDEN')
          g(10, X(a[0]))
          g(20, Y(a[1]))
          g(30, 0)
          g(11, X(b[0]))
          g(21, Y(b[1]))
          g(31, 0)
          return
        }
        g(0, 'POLYLINE')
        g(8, layer)
        if (dashed) g(6, 'HIDDEN')
        g(66, 1)
        g(10, 0)
        g(20, 0)
        g(30, 0)
        // 1 = 封閉；128 = 線型連續穿過頂點（虛線不會在每個頂點重新開始）
        g(70, (p.closed ? 1 : 0) | 128)
        for (const [x, y] of p.points) {
          g(0, 'VERTEX')
          g(8, layer)
          g(10, X(x))
          g(20, Y(y))
          g(30, 0)
        }
        g(0, 'SEQEND')
        g(8, layer)
        return
      }
      case 'circle': {
        if (p.fill && p.fill !== '#ffffff') {
          // 實心小圓點：用寬度等於半徑的圓弧多段線（AutoCAD 的 DONUT）
          const r = p.r * k
          g(0, 'POLYLINE')
          g(8, layer)
          g(66, 1)
          g(10, 0)
          g(20, 0)
          g(30, 0)
          g(70, 1)
          g(40, r)
          g(41, r)
          for (const dx of [-r / 2, r / 2]) {
            g(0, 'VERTEX')
            g(8, layer)
            g(10, X(p.center[0]) + dx)
            g(20, Y(p.center[1]))
            g(30, 0)
            g(40, r)
            g(41, r)
            g(42, 1)
          }
          g(0, 'SEQEND')
          g(8, layer)
          return
        }
        g(0, 'CIRCLE')
        g(8, layer)
        g(10, X(p.center[0]))
        g(20, Y(p.center[1]))
        g(30, 0)
        g(40, p.r * k)
        return
      }
      case 'text': {
        const text = dxfText(p.text)
        if (!text) return
        // 以基線定位：自己算出基線的位置，對齊方式只用水平（左、中、右）
        const a = ((p.angle ?? 0) * Math.PI) / 180
        const off = baselineOffset(p.valign) * p.size
        // 圖紙座標 y 向下：基線在錨點「下方」off（沿文字的局部下方向）
        const bx = p.at[0] + off * Math.sin(a)
        const by = p.at[1] + off * Math.cos(a)
        const h = p.size * 0.75 * k
        const align = p.align === 'center' ? 1 : p.align === 'right' ? 2 : 0
        g(0, 'TEXT')
        g(8, layer)
        g(10, X(bx))
        g(20, Y(by))
        g(30, 0)
        g(40, h)
        g(1, text)
        if (p.angle) g(50, p.angle)
        g(7, 'STANDARD')
        if (align) {
          g(72, align)
          g(11, X(bx))
          g(21, Y(by))
          g(31, 0)
        }
        return
      }
      case 'image':
        // R12 不支援點陣圖（公司 Logo 只出現在 PDF／SVG）
        return
    }
  }
  sheets.forEach((sheet, i) => {
    X = (x: number) => offsets[i] + x * k
    Y = (y: number) => (sheet.height - y) * k
    for (const p of sheet.primitives) entity(p)
  })
  g(0, 'ENDSEC')
  g(0, 'EOF')
  return out.join('\r\n') + '\r\n'
}
