import type { PaperSize, Projection } from '../settings/settings'
import { fitText, textWidth } from './text'
import { LINE, type Layer, type Primitive, type Pt } from './types'

export const PAPER: Record<PaperSize, { width: number; height: number }> = {
  A3: { width: 420, height: 297 },
  A4: { width: 297, height: 210 },
}

/** 圖框離紙邊的距離（mm） */
export const MARGIN = 10

/** 中心線（細鏈線）：長劃、間隔、點、間隔 */
export const CENTER_DASH = [6, 1, 0.5, 1] as const

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export const rectRight = (r: Rect) => r.x + r.w
export const rectBottom = (r: Rect) => r.y + r.h

export function rectsOverlap(a: Rect, b: Rect, gap = 0): boolean {
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap
}

export interface TextOptions {
  layer?: Layer
  align?: 'left' | 'center' | 'right'
  valign?: 'baseline' | 'middle' | 'top' | 'bottom'
  angle?: number
  color?: string
}

/** 產生圖元的小工具：全部寫進同一個陣列 */
export class Draw {
  readonly out: Primitive[]

  constructor(out: Primitive[] = []) {
    this.out = out
  }

  line(a: Pt, b: Pt, layer: Layer, width: number = LINE.thin, dash?: readonly number[]) {
    this.out.push({ kind: 'polyline', layer, points: [a, b], width, dash })
  }

  poly(points: Pt[], layer: Layer, width: number, opts: { closed?: boolean; dash?: readonly number[]; fill?: string; color?: string } = {}) {
    this.out.push({ kind: 'polyline', layer, points, width, ...opts })
  }

  rect(r: Rect, layer: Layer, width: number, fill?: string) {
    this.poly(
      [
        [r.x, r.y],
        [r.x + r.w, r.y],
        [r.x + r.w, r.y + r.h],
        [r.x, r.y + r.h],
      ],
      layer,
      width,
      { closed: true, fill },
    )
  }

  circle(center: Pt, r: number, layer: Layer, width: number, fill?: string) {
    this.out.push({ kind: 'circle', layer, center, r, width, fill })
  }

  text(at: Pt, text: string, size: number, opts: TextOptions = {}) {
    if (!text) return
    const { layer = 'TEXT', ...rest } = opts
    this.out.push({ kind: 'text', layer, at, text, size, ...rest })
  }

  /** 放進寬度 maxWidth 的文字（太長時縮小或截斷） */
  fittedText(at: Pt, text: string, size: number, maxWidth: number, opts: TextOptions = {}) {
    const fit = fitText(text, size, maxWidth)
    this.text(at, fit.text, fit.size, opts)
  }

  /** 實心箭頭：尖端在 tip，朝 dir 方向 */
  arrow(tip: Pt, dir: Pt, layer: Layer, length = 2.5, halfWidth = 0.45) {
    const [dx, dy] = dir
    const l = Math.hypot(dx, dy) || 1
    const ux = dx / l
    const uy = dy / l
    const bx = tip[0] - ux * length
    const by = tip[1] - uy * length
    this.poly(
      [
        [tip[0], tip[1]],
        [bx - uy * halfWidth, by + ux * halfWidth],
        [bx + uy * halfWidth, by - ux * halfWidth],
      ],
      layer,
      0.1,
      { closed: true, fill: '#000000' },
    )
  }
}

/** 圖框與中心標記（ISO 5457） */
export function drawFrame(d: Draw, width: number, height: number) {
  d.rect({ x: MARGIN, y: MARGIN, w: width - 2 * MARGIN, h: height - 2 * MARGIN }, 'FRAME', LINE.frame)
  const cx = width / 2
  const cy = height / 2
  d.line([cx, 0], [cx, MARGIN + 5], 'FRAME', LINE.frame)
  d.line([cx, height], [cx, height - MARGIN - 5], 'FRAME', LINE.frame)
  d.line([0, cy], [MARGIN + 5, cy], 'FRAME', LINE.frame)
  d.line([width, cy], [width - MARGIN - 5, cy], 'FRAME', LINE.frame)
}

/**
 * 投影法符號（ISO 5456-2）：截頭圓錐的側視圖（梯形）與端視圖（兩個同心圓）。
 * 第三角法：梯形窄的一端朝向圓；第一角法：寬的一端朝向圓。
 * (x, y) 為符號左端的中心，size 為大圓直徑。
 */
export function drawProjectionSymbol(d: Draw, x: number, y: number, size: number, projection: Projection) {
  const big = size / 2
  const small = size / 4
  const length = size
  const left = projection === 'third' ? big : small
  const right = projection === 'third' ? small : big
  d.poly(
    [
      [x, y - left],
      [x + length, y - right],
      [x + length, y + right],
      [x, y + left],
    ],
    'TITLE',
    LINE.thin,
    { closed: true },
  )
  const cx = x + length + size * 0.45 + big
  d.circle([cx, y], big, 'TITLE', LINE.thin)
  d.circle([cx, y], small, 'TITLE', LINE.thin)
  d.line([x - 1, y], [cx + big + 1, y], 'CENTER', 0.18, [3, 0.6, 0.4, 0.6])
  d.line([cx, y - big - 1], [cx, y + big + 1], 'CENTER', 0.18, [3, 0.6, 0.4, 0.6])
}

/** 投影法符號的總寬度 */
export const projectionSymbolWidth = (size: number) => size * 2.45

export interface TitleInfo {
  company: { name: string; address?: string; phone?: string; email?: string; logo?: string }
  title: string
  drawingNo?: string
  customer?: string
  revision?: string
  date: string
  drawer?: string
  scale: string
  /** 迴路圖等示意圖沒有投影法：'none' */
  projection: Projection | 'none'
  /** 張數，例如「1/2」 */
  sheet?: string
}

export const TITLE_BLOCK_HEIGHT = 32

/** 標題欄每一格：標籤（小字）在左上、內容在下方 */
function cell(d: Draw, x: number, y: number, w: number, h: number, label: string, value: string, size = 3) {
  d.rect({ x, y, w, h }, 'TITLE', LINE.thin)
  d.text([x + 1, y + 0.9], label, 1.7, { layer: 'TITLE', valign: 'top', color: '#475569' })
  if (value) d.fittedText([x + 1.4, y + h - 1.5], value, size, w - 2.8, { layer: 'TITLE' })
}

/**
 * CNS 風格的標題欄，放在 (x, y)（左上角），寬 w（A3 為 180 mm）。回傳高度。
 * 第 1 列：公司（Logo、名稱、地址電話）｜圖名
 * 第 2 列：客戶｜圖號｜版次｜張數｜日期｜繪圖
 * 第 3 列：比例｜單位｜投影法｜審核｜核准
 */
export function drawTitleBlock(d: Draw, x: number, y: number, w: number, info: TitleInfo): number {
  const k = w / 180
  const row1 = 16
  const row2 = 8
  const row3 = 8
  d.rect({ x, y, w, h: row1 + row2 + row3 }, 'TITLE', LINE.frame)

  // 第 1 列
  const companyW = 72 * k
  d.rect({ x, y, w: companyW, h: row1 }, 'TITLE', LINE.thin)
  let textX = x + 1.6
  const logo = info.company.logo
  if (logo) {
    const box = { w: Math.min(22 * k, 20), h: row1 - 3 }
    d.out.push({ kind: 'image', layer: 'TITLE', at: [x + 1.5, y + 1.5], width: box.w, height: box.h, dataUrl: logo })
    textX = x + 1.5 + box.w + 1.5
  }
  const textW = x + companyW - textX - 1.2
  const contact = [info.company.address, [info.company.phone, info.company.email].filter(Boolean).join('  ')].filter(Boolean) as string[]
  if (info.company.name) d.fittedText([textX, y + (contact.length ? 6.2 : 9.6)], info.company.name, 4.2, textW, { layer: 'TITLE' })
  contact.forEach((line, i) => d.fittedText([textX, y + 10.2 + i * 3], line, 2.1, textW, { layer: 'TITLE', color: '#334155' }))

  d.rect({ x: x + companyW, y, w: w - companyW, h: row1 }, 'TITLE', LINE.thin)
  d.text([x + companyW + 1, y + 0.9], '圖名', 1.7, { layer: 'TITLE', valign: 'top', color: '#475569' })
  d.fittedText([x + companyW + (w - companyW) / 2, y + row1 / 2 + 1.2], info.title, 5, w - companyW - 6, {
    layer: 'TITLE',
    align: 'center',
    valign: 'middle',
  })

  // 第 2 列
  const y2 = y + row1
  const c2 = [45, 45, 15, 15, 30, 30].map((v) => v * k)
  const v2: [string, string][] = [
    ['客戶', info.customer ?? ''],
    ['圖號', info.drawingNo ?? ''],
    ['版次', info.revision ?? ''],
    ['張數', info.sheet ?? '1/1'],
    ['日期', info.date],
    ['繪圖', info.drawer ?? ''],
  ]
  let cx = x
  v2.forEach(([label, value], i) => {
    cell(d, cx, y2, c2[i], row2, label, value)
    cx += c2[i]
  })

  // 第 3 列
  const y3 = y2 + row2
  const c3 = [25, 20, 45, 45, 45].map((v) => v * k)
  cell(d, x, y3, c3[0], row3, '比例', info.scale)
  cell(d, x + c3[0], y3, c3[1], row3, '單位', 'mm')
  const px = x + c3[0] + c3[1]
  if (info.projection === 'none') {
    cell(d, px, y3, c3[2], row3, '投影法', '—')
  } else {
    cell(d, px, y3, c3[2], row3, '投影法', '')
    const symbolSize = 4.2
    const label = info.projection === 'third' ? '第三角法' : '第一角法'
    const symbolX = px + c3[2] - projectionSymbolWidth(symbolSize) - 1.6
    d.fittedText([px + 1.4, y3 + row3 - 1.5], label, 2.6, symbolX - px - 2.4, { layer: 'TITLE' })
    drawProjectionSymbol(d, symbolX, y3 + row3 / 2 + 0.6, symbolSize, info.projection)
  }
  cell(d, px + c3[2], y3, c3[3], row3, '審核', '')
  cell(d, px + c3[2] + c3[3], y3, c3[4], row3, '核准', '')
  return row1 + row2 + row3
}

export interface TableColumn {
  title: string
  /** 欄寬（mm） */
  width: number
  align?: 'left' | 'center' | 'right'
}

export interface TableStyle {
  rowHeight: number
  headerHeight: number
  textSize: number
  /** 零件表：標題列在最下方、項次由下往上（ISO 7573） */
  headerAtBottom?: boolean
  /** 表格上方的名稱列 */
  caption?: string
}

export const tableHeight = (rows: number, style: TableStyle) =>
  rows * style.rowHeight + style.headerHeight + (style.caption ? style.headerHeight : 0)

/** 畫表格（x, y 為左上角），回傳所占的範圍 */
export function drawTable(d: Draw, x: number, y: number, columns: readonly TableColumn[], rows: readonly string[][], style: TableStyle): Rect {
  const width = columns.reduce((s, c) => s + c.width, 0)
  const height = tableHeight(rows.length, style)
  const { rowHeight: rh, headerHeight: hh, textSize } = style
  d.rect({ x, y, w: width, h: height }, 'TITLE', LINE.table)

  const rowTexts = (top: number, h: number, values: readonly string[], header: boolean) => {
    let cx = x
    columns.forEach((c, i) => {
      const align = header ? 'center' : (c.align ?? 'left')
      const tx = align === 'center' ? cx + c.width / 2 : align === 'right' ? cx + c.width - 1.2 : cx + 1.2
      d.fittedText([tx, top + h / 2], values[i] ?? '', textSize, c.width - 2.4, { layer: 'TITLE', align, valign: 'middle' })
      cx += c.width
    })
  }
  const hline = (yy: number, w: number = LINE.thin) => d.line([x, yy], [x + width, yy], 'TITLE', w)

  let cursor = y
  if (style.caption) {
    d.text([x + width / 2, cursor + hh / 2], style.caption, textSize + 0.3, { layer: 'TITLE', align: 'center', valign: 'middle' })
    cursor += hh
    hline(cursor)
  }
  const bodyTop = cursor
  const headerTop = style.headerAtBottom ? y + height - hh : cursor
  const firstRowTop = style.headerAtBottom ? headerTop - rh : cursor + hh
  // 直線（標題名稱列不分欄）
  let vx = x
  for (const c of columns.slice(0, -1)) {
    vx += c.width
    d.line([vx, bodyTop], [vx, y + height], 'TITLE', LINE.thin)
  }
  rowTexts(headerTop, hh, columns.map((c) => c.title), true)
  hline(style.headerAtBottom ? headerTop : headerTop + hh, LINE.table)
  rows.forEach((values, i) => {
    const top = style.headerAtBottom ? firstRowTop - i * rh : firstRowTop + i * rh
    rowTexts(top, rh, values, false)
    if (i < rows.length - 1) hline(style.headerAtBottom ? top : top + rh)
  })
  return { x, y, w: width, h: height }
}

/** 件號氣球：圓圈＋編號，引線從零件上的點（實心小圓點）拉到圓圈邊緣 */
export function drawBalloon(d: Draw, center: Pt, radius: number, label: string, anchor: Pt) {
  const dx = anchor[0] - center[0]
  const dy = anchor[1] - center[1]
  const dist = Math.hypot(dx, dy)
  if (dist > radius) {
    d.line([center[0] + (dx / dist) * radius, center[1] + (dy / dist) * radius], anchor, 'BALLOON', LINE.thin)
    d.circle(anchor, 0.55, 'BALLOON', 0.1, '#000000')
  }
  d.circle(center, radius, 'BALLOON', LINE.table, '#ffffff')
  d.fittedText(center, label, radius * 0.95, radius * 1.7, { layer: 'BALLOON', align: 'center', valign: 'middle' })
}

/** 對外接口記號：六角形＋編號，引線拉到埠的位置（空心小圓） */
export function drawPortTag(d: Draw, center: Pt, radius: number, label: string, anchor: Pt) {
  const dx = anchor[0] - center[0]
  const dy = anchor[1] - center[1]
  const dist = Math.hypot(dx, dy)
  if (dist > radius) d.line([center[0] + (dx / dist) * radius * 0.87, center[1] + (dy / dist) * radius * 0.87], anchor, 'BALLOON', LINE.thin)
  d.circle(anchor, 0.8, 'BALLOON', LINE.thin, '#ffffff')
  const pts: Pt[] = []
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI / 3) * k
    pts.push([center[0] + radius * Math.cos(a), center[1] + radius * Math.sin(a)])
  }
  d.poly(pts, 'BALLOON', LINE.table, { closed: true, fill: '#ffffff' })
  d.fittedText(center, label, radius * 0.85, radius * 1.5, { layer: 'BALLOON', align: 'center', valign: 'middle' })
}

/** 尺寸數字：到 0.1 mm，整數不顯示小數點 */
export const formatDim = (n: number): string => {
  const v = Math.round(n * 10) / 10
  return (Object.is(v, -0) ? 0 : v).toFixed(1).replace(/\.0$/, '')
}

/**
 * 水平尺寸：量 x1~x2，被標註的物體邊緣在 fromY（尺寸界線由這裡開始），尺寸線在 atY。
 */
export function drawHorizontalDim(d: Draw, x1: number, x2: number, fromY: number, atY: number, text: string, size = 3.2) {
  const dir = Math.sign(atY - fromY) || 1
  for (const x of [x1, x2]) d.line([x, fromY + dir * 1.2], [x, atY + dir * 2], 'DIM', LINE.thin)
  d.line([x1, atY], [x2, atY], 'DIM', LINE.thin)
  const inside = x2 - x1 > 7
  d.arrow([x1, atY], inside ? [-1, 0] : [1, 0], 'DIM')
  d.arrow([x2, atY], inside ? [1, 0] : [-1, 0], 'DIM')
  const tw = textWidth(text, size)
  // 太窄時數字放在右側
  const tx = x2 - x1 > tw + 6 ? (x1 + x2) / 2 : x2 + 3 + tw / 2
  d.text([tx, atY - 0.8], text, size, { layer: 'DIM', align: 'center', valign: 'bottom' })
}

/** 垂直尺寸：量 y1~y2，物體邊緣在 fromX，尺寸線在 atX；數字轉 90°、寫在尺寸線左側 */
export function drawVerticalDim(d: Draw, y1: number, y2: number, fromX: number, atX: number, text: string, size = 3.2) {
  const dir = Math.sign(atX - fromX) || -1
  for (const y of [y1, y2]) d.line([fromX + dir * 1.2, y], [atX + dir * 2, y], 'DIM', LINE.thin)
  d.line([atX, y1], [atX, y2], 'DIM', LINE.thin)
  const lo = Math.min(y1, y2)
  const hi = Math.max(y1, y2)
  const inside = hi - lo > 7
  d.arrow([atX, lo], inside ? [0, -1] : [0, 1], 'DIM')
  d.arrow([atX, hi], inside ? [0, 1] : [0, -1], 'DIM')
  const tw = textWidth(text, size)
  const ty = hi - lo > tw + 6 ? (lo + hi) / 2 : lo - 3 - tw / 2
  d.text([atX - 0.8, ty], text, size, { layer: 'DIM', align: 'center', valign: 'bottom', angle: 90 })
}

/** 標準比例（CNS 3／ISO 5455），由大到小 */
export const STANDARD_SCALES = [10, 5, 2, 1, 1 / 1.5, 1 / 2, 1 / 2.5, 1 / 3, 1 / 4, 1 / 5, 1 / 10, 1 / 15, 1 / 20, 1 / 25, 1 / 50, 1 / 100]

/** 不超過 max 的最大標準比例 */
export function standardScale(max: number): number {
  return STANDARD_SCALES.find((s) => s <= max * (1 + 1e-9)) ?? STANDARD_SCALES[STANDARD_SCALES.length - 1]
}

export function scaleLabel(s: number): string {
  if (s >= 1) return `${Math.round(s * 100) / 100}:1`
  const inv = Math.round((1 / s) * 100) / 100
  return `1:${inv}`
}
