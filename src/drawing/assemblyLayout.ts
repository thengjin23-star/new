import type { PaperSize, Projection } from '../settings/settings'
import { chainSegments, type ProjectedView } from './projection'
import {
  Draw,
  MARGIN,
  PAPER,
  TITLE_BLOCK_HEIGHT,
  drawBalloon,
  drawFrame,
  drawHorizontalDim,
  drawPortTag,
  drawTable,
  drawTitleBlock,
  drawVerticalDim,
  formatDim,
  rectsOverlap,
  scaleLabel,
  STANDARD_SCALES,
  standardScale,
  tableHeight,
  type Rect,
  type TableColumn,
  type TableStyle,
  type TitleInfo,
} from './sheet'
import { textWidth, wrapText } from './text'
import { HIDDEN_DASH, LINE, type Pt, type Sheet } from './types'

export type OrthoView = 'front' | 'top' | 'side'

export interface BomLine {
  item: number
  modelCode: string
  name: string
  maker?: string
  /** 數量；PU 管為總長（例如「1.25 m」） */
  quantity: number | string
}

/** 對外接口在一個視圖中的投影 */
export interface PortInView {
  x: number
  y: number
  visible: boolean
  /** 埠軸線（朝外）在視圖上的投影 */
  dx: number
  dy: number
  /** 埠軸線與「朝向觀察者」方向的內積：接近 1 表示埠口正對觀察者 */
  facing: number
}

export interface ExternalPort {
  tag: number
  item: number
  modelCode: string
  port: string
  spec: string
  views: Partial<Record<OrthoView, PortInView>>
}

export interface AssemblySheetInput {
  paper: PaperSize
  projection: Projection
  /** side：第三角法為右側視圖、第一角法為左側視圖 */
  views: Record<OrthoView, ProjectedView> & { iso?: ProjectedView }
  bom: readonly BomLine[]
  ports: readonly ExternalPort[]
  title: Omit<TitleInfo, 'scale' | 'projection'>
  notes?: string
  balloons?: boolean
  dimensions?: boolean
  portTags?: boolean
  /** 接在組立圖後面的其他圖紙張數（例如選型計算書），張數標示「1/3」會算進去 */
  extraSheets?: number
}

export interface AssemblySheet extends Sheet {
  isoScale?: number
  warnings: string[]
  /** 各區塊的位置（表格、視圖），供測試與除錯 */
  regions: { id: string; rect: Rect }[]
}

const GAP = 5 // 表格、視圖區塊之間的最小間距
const PAD = 3 // 視圖離圖框的最小距離
const ROW = 6
const HEADER = 7
const TEXT = 2.8
const LABEL_ZONE = 7
const BALLOON_R = 4
const TAG_R = 3.3

/** 視圖名稱 */
const VIEW_LABEL: Record<Projection, Record<OrthoView, string>> = {
  third: { front: '前視圖', top: '俯視圖', side: '右側視圖' },
  first: { front: '前視圖', top: '俯視圖', side: '左側視圖' },
}

interface Block {
  id: string
  w: number
  h: number
  /** 零件表的分段：緊貼前一段（或標題欄） */
  attach?: boolean
  draw(d: Draw, x: number, y: number): void
}

type Arrangement = 'column' | 'band' | 'wide'

const viewSize = (v: ProjectedView) => ({ w: v.bounds.maxX - v.bounds.minX, h: v.bounds.maxY - v.bounds.minY })
const isEmpty = (v: ProjectedView | undefined) => !v || (v.visible.length === 0 && v.hidden.length === 0)

// ---------------------------------------------------------------------------------------------
// 表格區塊

interface TableContent {
  bom: readonly BomLine[]
  maxBomRows: number
  ports: boolean
  notes: boolean
}

function tableBlocks(input: AssemblySheetInput, tw: number, content: TableContent): Block[] {
  const k = tw / 180
  const hasMaker = input.bom.some((r) => r.maker)
  const bomColumns: TableColumn[] = hasMaker
    ? [
        { title: '項次', width: 12 * k, align: 'center' },
        { title: '型號', width: 50 * k },
        { title: '名稱', width: 62 * k },
        { title: '廠牌', width: 34 * k },
        { title: '數量', width: 22 * k, align: 'center' },
      ]
    : [
        { title: '項次', width: 12 * k, align: 'center' },
        { title: '型號', width: 58 * k },
        { title: '名稱', width: 88 * k },
        { title: '數量', width: 22 * k, align: 'center' },
      ]
  const bomRows = content.bom.map((r) => [String(r.item), r.modelCode, r.name, ...(hasMaker ? [r.maker ?? ''] : []), String(r.quantity)])
  const bomStyle: TableStyle = { rowHeight: ROW, headerHeight: HEADER, textSize: TEXT, headerAtBottom: true }
  const blocks: Block[] = [
    {
      id: 'title',
      w: tw,
      h: TITLE_BLOCK_HEIGHT,
      draw: () => undefined, // 比例確定後才畫
    },
  ]
  const chunks: string[][][] = []
  for (let i = 0; i < bomRows.length; i += content.maxBomRows) chunks.push(bomRows.slice(i, i + content.maxBomRows))
  chunks.forEach((rows, i) =>
    blocks.push({
      id: `bom${i}`,
      w: tw,
      h: tableHeight(rows.length, bomStyle),
      attach: true,
      draw: (d, x, y) => drawTable(d, x, y, bomColumns, rows, bomStyle),
    }),
  )

  if (content.ports && input.ports.length) {
    const columns: TableColumn[] = [
      { title: '記號', width: 14 * k, align: 'center' },
      { title: '零件', width: 72 * k },
      { title: '埠', width: 30 * k, align: 'center' },
      { title: '規格', width: 64 * k },
    ]
    const rows = input.ports.map((p) => [String(p.tag), `${p.item}．${p.modelCode}`, p.port, p.spec])
    const style: TableStyle = { rowHeight: ROW, headerHeight: HEADER, textSize: TEXT, caption: '對外接口' }
    blocks.push({ id: 'ports', w: tw, h: tableHeight(rows.length, style), draw: (d, x, y) => drawTable(d, x, y, columns, rows, style) })
  }

  const notes = content.notes ? input.notes?.trim() : ''
  if (notes) {
    const size = 2.8
    const lineH = 4.6
    const lines = wrapText(notes, size, tw - 5)
    const h = HEADER + lines.length * lineH + 2
    blocks.push({
      id: 'notes',
      w: tw,
      h,
      draw: (d, x, y) => {
        d.rect({ x, y, w: tw, h }, 'TITLE', LINE.table)
        d.text([x + 2, y + HEADER / 2], '備註', TEXT + 0.3, { layer: 'TITLE', valign: 'middle' })
        d.line([x, y + HEADER], [x + tw, y + HEADER], 'TITLE', LINE.thin)
        lines.forEach((line, i) => d.text([x + 2.5, y + HEADER + 1 + (i + 0.5) * lineH], line, size, { layer: 'TEXT', valign: 'middle' }))
      },
    })
  }
  return blocks
}

/** 依排列方式放置表格：回傳每個區塊的位置（放不下的區塊不列出） */
function placeTables(inner: Rect, blocks: readonly Block[], arrangement: Arrangement): Map<string, Rect> {
  const placed = new Map<string, Rect>()
  const right = inner.x + inner.w
  const bottom = inner.y + inner.h
  const fits = (r: Rect) =>
    r.x >= inner.x - 1e-6 &&
    r.y >= inner.y - 1e-6 &&
    r.x + r.w <= right + 1e-6 &&
    r.y + r.h <= bottom + 1e-6 &&
    [...placed.values()].every((p) => !rectsOverlap(r, p, -1e-6))
  const clear = (r: Rect) => fits(r) && [...placed.values()].every((p) => !rectsOverlap(r, p, GAP - 1e-6))

  let lastBom: Rect | undefined
  for (const b of blocks) {
    if (b.id === 'title') {
      const r = { x: right - b.w, y: bottom - b.h, w: b.w, h: b.h }
      placed.set(b.id, r)
      lastBom = r
      continue
    }
    const candidates: Rect[] = []
    if (b.attach && lastBom) {
      const first = placed.get('title') === lastBom
      if (arrangement === 'wide') {
        // 零件表放在標題欄（或前一段）的左邊，底部對齊
        candidates.push({ x: lastBom.x - b.w, y: bottom - b.h, w: b.w, h: b.h })
      } else if (first) {
        candidates.push({ x: lastBom.x, y: lastBom.y - b.h, w: b.w, h: b.h })
      } else {
        // 第二段以後：放在前一段的左邊，底部對齊第一段
        candidates.push({ x: lastBom.x - b.w, y: lastBom.y + lastBom.h - b.h, w: b.w, h: b.h })
      }
      const ok = candidates.find(fits)
      if (ok) {
        placed.set(b.id, ok)
        lastBom = ok
      }
      continue
    }
    // 右側一欄往上疊
    const column = [...placed.values()].filter((r) => r.x + r.w >= right - 1e-6)
    const top = Math.min(...column.map((r) => r.y))
    const above: Rect = { x: right - b.w, y: top - GAP - b.h, w: b.w, h: b.h }
    // 沿著底邊往左排
    const bottomRow = [...placed.values()].filter((r) => r.y + r.h >= bottom - 1e-6)
    const leftmost = Math.min(...bottomRow.map((r) => r.x))
    const left: Rect = { x: leftmost - GAP - b.w, y: bottom - b.h, w: b.w, h: b.h }
    const order = arrangement === 'column' ? [above, left] : [left, above]
    let ok = order.find(clear)
    if (!ok) {
      // 最後手段：由右下往左上找空位
      for (let y = bottom - b.h; y >= inner.y && !ok; y -= 5) {
        for (let x = right - b.w; x >= inner.x && !ok; x -= 5) {
          const r = { x, y, w: b.w, h: b.h }
          if (clear(r)) ok = r
        }
      }
    }
    if (ok) placed.set(b.id, ok)
  }
  return placed
}

/**
 * 找出 area 中不與 occupied 重疊的矩形（包含所有「最大空白矩形」）。
 * 做法：取所有區塊的左右邊界當作候選 x，對每一對 x 區間求出沒有被擋住的 y 區間。
 */
export function freeRects(area: Rect, occupied: readonly Rect[], gap: number): Rect[] {
  const blocks = occupied.map((r) => ({ x0: r.x - gap, x1: r.x + r.w + gap, y0: r.y - gap, y1: r.y + r.h + gap }))
  const x0 = area.x
  const x1 = area.x + area.w
  const xs = [...new Set([x0, x1, ...blocks.flatMap((b) => [b.x0, b.x1])])].filter((x) => x >= x0 - 1e-9 && x <= x1 + 1e-9).sort((a, b) => a - b)
  const out: Rect[] = []
  for (let i = 0; i < xs.length; i++) {
    for (let j = i + 1; j < xs.length; j++) {
      const xa = xs[i]
      const xb = xs[j]
      const blocking = blocks
        .filter((b) => b.x0 < xb - 1e-9 && b.x1 > xa + 1e-9)
        .map((b) => [Math.max(b.y0, area.y), Math.min(b.y1, area.y + area.h)] as const)
        .filter(([a, b]) => b > a)
        .sort((a, b) => a[0] - b[0])
      let y = area.y
      for (const [ya, yb] of blocking) {
        if (ya > y + 1e-9) out.push({ x: xa, y, w: xb - xa, h: ya - y })
        y = Math.max(y, yb)
      }
      if (area.y + area.h > y + 1e-9) out.push({ x: xa, y, w: xb - xa, h: area.y + area.h - y })
    }
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// 三視圖的排列

interface GridPlacement {
  /** 每個視圖左上角（圖紙座標） */
  pos: Record<OrthoView, Pt>
  /** 視圖（含尺寸、名稱）所占的範圍 */
  blocks: Rect[]
  width: number
  height: number
}

interface GridSpec {
  a: number
  fa: number
  b: number
  fb: number
  /** 尺寸線離視圖的距離（有接口記號時再往外移，避免與記號重疊） */
  dimOffset: number
  /** 視圖名稱的中心離「視圖＋尺寸區」下緣的距離 */
  labelOffset: number
  /** 尺寸區的寬度（沒有尺寸時為 0） */
  dimZone: number
  place(x: number, y: number, s: number): GridPlacement
}

function gridSpec(input: AssemblySheetInput): GridSpec {
  const f = viewSize(input.views.front)
  const t = viewSize(input.views.top)
  const sd = viewSize(input.views.side)
  const dz = input.dimensions === false ? 0 : 13
  const lz = LABEL_ZONE
  const tags = input.portTags !== false && input.ports.length > 0
  const pad = tags ? 8 : 0
  const g = 10 + (tags ? 8 : 0)
  const colW = Math.max(f.w, t.w)
  const offsets = { dimOffset: pad + 9, labelOffset: pad + 3.5, dimZone: dz }
  if (input.projection === 'third') {
    // 俯視圖｜（空）
    // 前視圖｜右側視圖
    return {
      ...offsets,
      a: colW + sd.w,
      fa: dz + g + 2 * pad,
      b: t.h + Math.max(f.h, sd.h),
      fb: 2 * lz + g + dz + 2 * pad,
      place(x, y, s) {
        const cx = x + pad + dz
        const topY = y + pad
        const rowY = topY + t.h * s + lz + g
        const sideX = cx + colW * s + g
        const rowH = Math.max(f.h, sd.h) * s
        return {
          pos: { top: [cx, topY], front: [cx, rowY], side: [sideX, rowY] },
          blocks: [
            { x: cx - pad, y: topY - pad, w: t.w * s + 2 * pad, h: t.h * s + lz + 2 * pad },
            { x: cx - dz - pad, y: rowY - pad, w: f.w * s + dz + 2 * pad, h: rowH + dz + lz + 2 * pad },
            { x: sideX - pad, y: rowY - pad, w: sd.w * s + 2 * pad, h: rowH + dz + lz + 2 * pad },
          ],
          width: dz + g + 2 * pad + (colW + sd.w) * s,
          height: 2 * lz + g + dz + 2 * pad + (t.h + Math.max(f.h, sd.h)) * s,
        }
      },
    }
  }
  // 第一角法：
  // 前視圖｜左側視圖
  // 俯視圖｜（空）
  return {
    ...offsets,
    a: colW + sd.w,
    fa: dz + g + 2 * pad,
    b: Math.max(f.h, sd.h) + t.h,
    fb: 2 * dz + 2 * lz + g + 2 * pad,
    place(x, y, s) {
      const cx = x + pad + dz
      const rowY = y + pad
      const rowH = Math.max(f.h, sd.h) * s
      const sideX = cx + colW * s + g
      const topY = rowY + rowH + dz + lz + g
      return {
        pos: { front: [cx, rowY], side: [sideX, rowY], top: [cx, topY] },
        blocks: [
          { x: cx - dz - pad, y: rowY - pad, w: f.w * s + dz + 2 * pad, h: rowH + dz + lz + 2 * pad },
          { x: sideX - pad, y: rowY - pad, w: sd.w * s + 2 * pad, h: rowH + dz + lz + 2 * pad },
          { x: cx - pad, y: topY - pad, w: t.w * s + 2 * pad, h: t.h * s + dz + lz + 2 * pad },
        ],
        width: dz + g + 2 * pad + (colW + sd.w) * s,
        height: 2 * dz + 2 * lz + g + 2 * pad + (Math.max(f.h, sd.h) + t.h) * s,
      }
    },
  }
}

/** 等角圖外圍放氣球所需的邊距 */
function isoMargin(w: number, h: number, balloons: number): number {
  if (!balloons) return 2
  const spacing = BALLOON_R * 2 + 1.5
  // 氣球排在視圖外圍的圈上：圈的周長要夠放所有氣球
  const needed = (balloons * spacing - 2 * (w + h)) / 8
  return Math.max(7, needed) + BALLOON_R + 1
}

interface Layout {
  arrangement: Arrangement
  tables: Map<string, Rect>
  scale: number
  grid?: GridPlacement
  iso?: { rect: Rect; scale: number; margin: number }
}

/** 比較版面：先求表格全部放得下，再求三視圖、等角圖的比例大 */
function scoreOf(l: Layout): number[] {
  return [l.tables.size, l.grid ? l.scale : 0, l.iso?.scale ?? 0]
}

const better = (a: number[], b: number[]) => {
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-9) return a[i] > b[i]
  return false
}

// ---------------------------------------------------------------------------------------------

interface SheetContext {
  input: AssemblySheetInput
  paper: { width: number; height: number }
  inner: Rect
  area: Rect
  tw: number
}

/** 一張圖紙的版面：試三種表格排列，選「表格都放得下、三視圖與等角圖比例最大」的 */
function layoutOne(ctx: SheetContext, blocks: readonly Block[], withViews: boolean): Layout {
  const { input, inner, area } = ctx
  const iso = withViews && input.views.iso && !isEmpty(input.views.iso) ? input.views.iso : undefined
  const balloonItems = input.balloons === false || !iso ? 0 : iso.anchors.length
  const spec = gridSpec(input)
  let best: Layout | undefined
  for (const arrangement of ['column', 'band', 'wide'] as Arrangement[]) {
    const tables = placeTables(inner, blocks, arrangement)
    const layout: Layout = { arrangement, tables, scale: 1 }
    const occupied = [...tables.values()]
    if (withViews) {
      // 三視圖：找能用最大標準比例放下的空白區
      let bestGrid: { rect: Rect; scale: number } | undefined
      for (const r of freeRects(area, occupied, GAP)) {
        const max = Math.min((r.w - spec.fa) / spec.a, (r.h - spec.fb) / spec.b)
        if (!(max > 0)) continue
        const s = standardScale(max)
        if (s > max * (1 + 1e-9)) continue
        const key = [s, -(r.x + r.y)]
        if (!bestGrid || better(key, [bestGrid.scale, -(bestGrid.rect.x + bestGrid.rect.y)])) bestGrid = { rect: r, scale: s }
      }
      if (bestGrid) {
        layout.scale = bestGrid.scale
        layout.grid = spec.place(bestGrid.rect.x, bestGrid.rect.y, bestGrid.scale)
      }
      // 等角圖：剩下的空白中能放最大比例的位置（不大於三視圖的比例）
      if (iso && layout.grid) {
        const { w: iw, h: ih } = viewSize(iso)
        const taken = [...occupied, ...layout.grid.blocks]
        let bestIso: Layout['iso']
        for (const r of freeRects(area, taken, GAP)) {
          for (const s of STANDARD_SCALES) {
            if (s > layout.scale + 1e-9) continue
            const m = isoMargin(iw * s, ih * s, balloonItems)
            if (iw * s + 2 * m <= r.w && ih * s + 2 * m + LABEL_ZONE <= r.h) {
              // 同樣比例時放在比較上面（通常是右上角的空白），再來選空間大的
              const key = [s, -Math.round(r.y / 10), r.w * r.h]
              if (!bestIso || better(key, [bestIso.scale, -Math.round(bestIso.rect.y / 10), bestIso.rect.w * bestIso.rect.h]))
                bestIso = { rect: r, scale: s, margin: m }
              break
            }
          }
        }
        layout.iso = bestIso
      }
    }
    if (!best || better(scoreOf(layout), scoreOf(best))) best = layout
  }
  return best!
}

/** 依版面畫出一張圖紙 */
function renderSheet(
  ctx: SheetContext,
  blocks: readonly Block[],
  layout: Layout,
  withViews: boolean,
  sheetLabel: string,
  note?: string,
): AssemblySheet {
  const { input, paper, area } = ctx
  const warnings: string[] = []
  const d = new Draw()
  drawFrame(d, paper.width, paper.height)
  const regions: AssemblySheet['regions'] = [...layout.tables.entries()].map(([id, rect]) => ({ id, rect }))
  layout.grid?.blocks.forEach((rect, i) => regions.push({ id: `view${i}`, rect }))

  // ---- 表格 ----
  for (const b of blocks) {
    const r = layout.tables.get(b.id)
    if (!r) {
      warnings.push(b.id.startsWith('bom') ? '零件表太長，部分項目放不下' : b.id === 'ports' ? '對外接口表放不下' : '備註放不下')
      continue
    }
    if (b.id === 'title') {
      drawTitleBlock(d, r.x, r.y, r.w, {
        ...input.title,
        scale: layout.grid ? scaleLabel(layout.scale) : '—',
        projection: input.projection,
        sheet: sheetLabel,
      })
    } else b.draw(d, r.x, r.y)
  }

  const s = layout.scale
  const hasViews = !isEmpty(input.views.front)
  const iso = input.views.iso && !isEmpty(input.views.iso) ? input.views.iso : undefined
  if (!withViews) {
    // 續頁：只有表格
  } else if (!hasViews) {
    const r = freeRects(area, [...layout.tables.values()], GAP).sort((a, b) => b.w * b.h - a.w * a.h)[0]
    if (r) d.text([r.x + r.w / 2, r.y + r.h / 2], '（這個模組沒有 3D 模型可繪製）', 5, { align: 'center', valign: 'middle', color: '#64748b' })
  } else if (!layout.grid) {
    warnings.push('圖紙放不下三視圖，請改用較大的圖紙')
  } else {
    const grid = layout.grid
    const spec = gridSpec(input)
    const views = input.views
    const labels = VIEW_LABEL[input.projection]
    const toSheet = (v: ProjectedView, origin: Pt, scale: number) => (x: number, y: number): Pt => [
      origin[0] + (x - v.bounds.minX) * scale,
      origin[1] + (v.bounds.maxY - y) * scale,
    ]
    for (const name of ['front', 'top', 'side'] as OrthoView[]) {
      drawViewLines(d, views[name], toSheet(views[name], grid.pos[name], s), true)
    }
    const rectOf = (name: OrthoView): Rect => {
      const { w, h } = viewSize(views[name])
      return { x: grid.pos[name][0], y: grid.pos[name][1], w: w * s, h: h * s }
    }
    const front = rectOf('front')
    const top = rectOf('top')
    const side = rectOf('side')
    // 外形尺寸：高（前視圖左側）、寬（第三角法在前視圖下方；第一角法在俯視圖下方）、深（側視圖下方）
    const off = spec.dimOffset
    if (input.dimensions !== false) {
      const size = viewSize(views.front)
      drawVerticalDim(d, front.y, front.y + front.h, front.x, front.x - off, formatDim(size.h))
      const widthView = input.projection === 'third' ? front : top
      const wb = widthView.y + widthView.h
      drawHorizontalDim(d, widthView.x, widthView.x + widthView.w, wb, wb + off, formatDim(size.w))
      drawHorizontalDim(d, side.x, side.x + side.w, side.y + side.h, side.y + side.h + off, formatDim(viewSize(views.side).w))
    }
    // 視圖名稱
    const rowBottom = Math.max(front.y + front.h, side.y + side.h)
    const labelAt = (r: Rect, y: number, text: string) => d.text([r.x + r.w / 2, y], text, 3, { align: 'center', valign: 'middle', color: '#334155' })
    labelAt(front, rowBottom + spec.dimZone + spec.labelOffset, labels.front)
    labelAt(side, rowBottom + spec.dimZone + spec.labelOffset, labels.side)
    labelAt(top, top.y + top.h + (input.projection === 'first' ? spec.dimZone : 0) + spec.labelOffset, labels.top)

    // 對外接口記號
    if (input.portTags !== false && input.ports.length) {
      const placedTags: Pt[] = []
      for (const port of input.ports) {
        const choice = choosePortView(port)
        if (!choice) continue
        const [name, pv] = choice
        const p = toSheet(views[name], grid.pos[name], s)(pv.x, pv.y)
        placedTags.push(placeTag(d, p, pv, rectOf(name), String(port.tag), placedTags))
      }
    }

    // ---- 等角圖（不畫隱藏線） ----
    if (iso && layout.iso) {
      const { rect, scale: is, margin } = layout.iso
      const { w: iw, h: ih } = viewSize(iso)
      const blockW = iw * is + 2 * margin
      const blockH = ih * is + 2 * margin + LABEL_ZONE
      const ox = rect.x + (rect.w - blockW) / 2 + margin
      const oy = rect.y + (rect.h - blockH) / 2 + margin
      regions.push({ id: 'iso', rect: { x: ox - margin, y: oy - margin, w: blockW, h: blockH } })
      const map = toSheet(iso, [ox, oy], is)
      drawViewLines(d, iso, map, false)
      const isoRect: Rect = { x: ox, y: oy, w: iw * is, h: ih * is }
      if (input.balloons !== false) {
        const anchors = iso.anchors.map((a) => ({ item: a.item, at: map(a.x, a.y) }))
        for (const b of arrangeBalloons(isoRect, anchors, margin - BALLOON_R - 1)) drawBalloon(d, b.center, BALLOON_R, String(b.item), b.anchor)
      }
      const label = is === s ? '等角圖' : `等角圖（${scaleLabel(is)}）`
      d.text([ox + isoRect.w / 2, oy + isoRect.h + margin + 3.5], label, 3, { align: 'center', valign: 'middle', color: '#334155' })
    } else if (iso) {
      warnings.push('圖紙沒有空間放等角圖')
    }
  }

  if (note) {
    // 「…見第 2 張」：放在最靠近圖紙下緣的空白處
    const size = 2.8
    const w = textWidth(note, size) + 2
    const spot = freeRects(area, regions.map((r) => r.rect), 1.5)
      .filter((r) => r.w >= w && r.h >= size + 2)
      .sort((a, b) => b.y + b.h - (a.y + a.h) || a.x - b.x)[0]
    if (spot) d.text([spot.x + 1, spot.y + spot.h - 1], note, size, { valign: 'bottom', color: '#334155' })
    else warnings.push(note)
  }

  return {
    width: paper.width,
    height: paper.height,
    primitives: d.out,
    scale: s,
    title: input.title.title,
    isoScale: withViews ? layout.iso?.scale : undefined,
    warnings,
    regions,
  }
}

export interface AssemblyDrawing {
  sheets: AssemblySheet[]
  /** 三視圖的比例 */
  scale: number
  isoScale?: number
  warnings: string[]
}

/**
 * 組立圖：三視圖＋等角圖、外形尺寸、件號氣球、零件表、對外接口表、備註、標題欄。
 * 表格太多、三視圖放不下（或比例因此小很多）時，把零件表的後段、對外接口表、備註移到第 2 張（續頁）。
 */
export function layoutAssemblyDrawing(input: AssemblySheetInput): AssemblyDrawing {
  const paper = PAPER[input.paper]
  const inner: Rect = { x: MARGIN, y: MARGIN, w: paper.width - 2 * MARGIN, h: paper.height - 2 * MARGIN }
  const ctx: SheetContext = {
    input,
    paper,
    inner,
    area: { x: inner.x + PAD, y: inner.y + PAD, w: inner.w - 2 * PAD, h: inner.h - 2 * PAD },
    tw: input.paper === 'A3' ? 180 : 130,
  }
  const hasViews = !isEmpty(input.views.front)
  // 第一張的零件表最多幾列：保留至少 60 mm 給視圖
  const maxBomRows = Math.max(5, Math.floor((inner.h - TITLE_BLOCK_HEIGHT - 60 - HEADER) / ROW))
  // 續頁：整張都給表格
  const maxRestRows = Math.max(5, Math.floor((inner.h - TITLE_BLOCK_HEIGHT - HEADER) / ROW))

  const single = tableBlocks(input, ctx.tw, { bom: input.bom, maxBomRows, ports: true, notes: true })
  const singleLayout = layoutOne(ctx, single, hasViews)
  const canSplit = hasViews && (input.bom.length > maxBomRows || input.ports.length > 0 || !!input.notes?.trim())
  let useSplit = false
  let first: { blocks: Block[]; layout: Layout } = { blocks: single, layout: singleLayout }
  let rest: { blocks: Block[]; layout: Layout } | undefined
  if (canSplit && (!singleLayout.grid || singleLayout.tables.size < single.length)) useSplit = true
  if (canSplit && !useSplit) {
    // 分成兩張時三視圖可以大 2.5 倍以上才分
    const blocks = tableBlocks(input, ctx.tw, { bom: input.bom.slice(0, maxBomRows), maxBomRows, ports: false, notes: false })
    const layout = layoutOne(ctx, blocks, true)
    if (layout.grid && singleLayout.grid && layout.scale / singleLayout.scale >= 2.5 - 1e-9) useSplit = true
  }
  if (useSplit) {
    const blocks = tableBlocks(input, ctx.tw, { bom: input.bom.slice(0, maxBomRows), maxBomRows, ports: false, notes: false })
    first = { blocks, layout: layoutOne(ctx, blocks, true) }
    const restBlocks = tableBlocks(input, ctx.tw, { bom: input.bom.slice(maxBomRows), maxBomRows: maxRestRows, ports: true, notes: true })
    rest = { blocks: restBlocks, layout: layoutOne(ctx, restBlocks, false) }
  }
  const count = (rest ? 2 : 1) + (input.extraSheets ?? 0)
  const moved = [
    input.bom.length > maxBomRows ? '零件表（續）' : '',
    input.ports.length ? '對外接口表' : '',
    input.notes?.trim() ? '備註' : '',
  ].filter(Boolean)
  const sheets = [renderSheet(ctx, first.blocks, first.layout, true, `1/${count}`, rest && moved.length ? `${moved.join('、')}見第 2 張` : undefined)]
  // 續頁沒有視圖；比例沿用第 1 張（DXF 依比例放大時兩張圖框一樣大）
  if (rest) sheets.push({ ...renderSheet(ctx, rest.blocks, rest.layout, false, `2/${count}`), scale: sheets[0].scale })
  return {
    sheets,
    scale: sheets[0].scale,
    isoScale: sheets[0].isoScale,
    warnings: [...new Set(sheets.flatMap((s) => s.warnings))],
  }
}

/** 把一個視圖的可見線（與隱藏線）畫到圖紙上 */
function drawViewLines(d: Draw, view: ProjectedView, map: (x: number, y: number) => Pt, hidden: boolean) {
  if (hidden) {
    for (const chain of chainSegments(view.hidden)) {
      d.poly(simplify(toPoints(chain, map), 0.02), 'HIDDEN', LINE.hidden, { dash: HIDDEN_DASH })
    }
  }
  for (const chain of chainSegments(view.visible)) {
    d.poly(simplify(toPoints(chain, map), 0.02), 'OUTLINE', LINE.visible)
  }
}

function toPoints(chain: number[], map: (x: number, y: number) => Pt): Pt[] {
  const pts: Pt[] = []
  for (let i = 0; i < chain.length; i += 2) pts.push(map(chain[i], chain[i + 1]))
  return pts
}

/** Douglas–Peucker：去掉幾乎共線的點 */
export function simplify(points: Pt[], tolerance: number): Pt[] {
  if (points.length <= 2) return points
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    const [ax, ay] = points[a]
    const [bx, by] = points[b]
    const dx = bx - ax
    const dy = by - ay
    const len = Math.hypot(dx, dy)
    let maxD = -1
    let idx = -1
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i]
      const dist = len < 1e-12 ? Math.hypot(px - ax, py - ay) : Math.abs(dy * px - dx * py + bx * ay - by * ax) / len
      if (dist > maxD) {
        maxD = dist
        idx = i
      }
    }
    if (maxD > tolerance && idx > 0) {
      keep[idx] = 1
      stack.push([a, idx], [idx, b])
    }
  }
  return points.filter((_, i) => keep[i])
}

/**
 * 對外接口要標在哪個視圖：優先選埠口正對觀察者、而且看得到的視圖；
 * 都看不到時選埠口側向（位在外形輪廓上）的視圖。
 */
export function choosePortView(port: ExternalPort): [OrthoView, PortInView] | undefined {
  const entries = (Object.entries(port.views) as [OrthoView, PortInView][]).filter(([, v]) => v)
  if (!entries.length) return undefined
  const visible = entries.filter(([, v]) => v.visible)
  const facing = visible.filter(([, v]) => v.facing > 0.5).sort((a, b) => b[1].facing - a[1].facing)
  if (facing.length) return facing[0]
  const sideOn = visible.sort((a, b) => Math.abs(a[1].facing) - Math.abs(b[1].facing))
  if (sideOn.length) return sideOn[0]
  return entries.sort((a, b) => b[1].facing - a[1].facing)[0]
}

/** 對外接口記號的位置：沿埠軸線往外（埠口正對觀察者時往視圖外側），避開已經放好的記號 */
function placeTag(d: Draw, p: Pt, pv: PortInView, view: Rect, label: string, placed: readonly Pt[]): Pt {
  let dx = pv.dx
  let dy = -pv.dy // 圖紙 y 向下
  if (Math.hypot(dx, dy) < 0.35) {
    dx = p[0] - (view.x + view.w / 2)
    dy = p[1] - (view.y + view.h / 2)
    if (Math.hypot(dx, dy) < 1e-6) [dx, dy] = [1, -1]
  }
  const len = Math.hypot(dx, dy)
  const base = Math.atan2(dy / len, dx / len)
  const dist = 9
  let center: Pt = [p[0] + Math.cos(base) * dist, p[1] + Math.sin(base) * dist]
  for (let k = 1; k <= 12 && placed.some((q) => Math.hypot(q[0] - center[0], q[1] - center[1]) < TAG_R * 2 + 0.8); k++) {
    const a = base + Math.ceil(k / 2) * (k % 2 ? 1 : -1) * (Math.PI / 9)
    center = [p[0] + Math.cos(a) * (dist + (k > 8 ? 5 : 0)), p[1] + Math.sin(a) * (dist + (k > 8 ? 5 : 0))]
  }
  drawPortTag(d, center, TAG_R, label, p)
  return center
}

/**
 * 件號氣球的位置：排在視圖外圍一圈（近似圓角矩形），依錨點的方位角排序、互相推開避免重疊，
 * 這樣引線不會交叉。
 */
export function arrangeBalloons(
  view: Rect,
  anchors: readonly { item: number; at: Pt }[],
  offset: number,
): { item: number; center: Pt; anchor: Pt }[] {
  if (!anchors.length) return []
  const cx = view.x + view.w / 2
  const cy = view.y + view.h / 2
  const a = view.w / 2 + offset
  const b = view.h / 2 + offset
  const pointAt = (t: number): Pt => {
    const c = Math.cos(t)
    const s = Math.sin(t)
    return [cx + a * Math.sign(c) * Math.sqrt(Math.abs(c)), cy + b * Math.sign(s) * Math.sqrt(Math.abs(s))]
  }
  const items = anchors
    .map((an) => ({ ...an, t: Math.atan2((an.at[1] - cy) / Math.max(b, 1), (an.at[0] - cx) / Math.max(a, 1)) }))
    .sort((p, q) => p.t - q.t)
  const minDist = BALLOON_R * 2 + 1.2
  const n = items.length
  for (let iter = 0; iter < 800 && n > 1; iter++) {
    let moved = false
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      // 相鄰兩個氣球之間的角度（繞回起點時加一圈）；超過半圈的是「另一側」，不在這裡推開
      const gap = items[j].t - items[i].t + (j === 0 ? 2 * Math.PI : 0)
      if (gap > Math.PI) continue
      const p = pointAt(items[i].t)
      const q = pointAt(items[j].t)
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) < minDist) {
        items[i].t -= 0.006
        items[j].t += 0.006
        moved = true
      }
    }
    if (!moved) break
  }
  return items.map((it) => ({ item: it.item, center: pointAt(it.t), anchor: it.at }))
}
