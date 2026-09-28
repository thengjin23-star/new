import { getSmoothStepPath, Position } from '@xyflow/react'
import type { Side } from '../components/symbols/types'
import type { PaperSize } from '../settings/settings'
import type { Rotation } from '../store/flow'
import { freeRects } from './assemblyLayout'
import {
  Draw,
  MARGIN,
  PAPER,
  TITLE_BLOCK_HEIGHT,
  drawFrame,
  drawTable,
  drawTitleBlock,
  tableHeight,
  type Rect,
  type TableColumn,
  type TableStyle,
  type TitleInfo,
} from './sheet'
import { apply, markupToPrimitives, multiply, pathToPolylines, rotate, scale, translate, type Affine } from './svgMarkup'
import { textWidth, wrapText } from './text'
import type { Primitive, Pt, Sheet } from './types'

/**
 * 迴路圖出圖：符號（與畫面相同的 SVG）、管線（與畫面相同的直角折線）、分歧點、標號與型號、文字註解，
 * 加上零件表與標題欄。迴路圖不依比例，整張圖縮放到圖紙的空白區。
 */

export interface CircuitSheetNode {
  id: string
  /** 節點外框左上角（畫布座標，px） */
  x: number
  y: number
  /** 符號未旋轉時的寬高 */
  width: number
  height: number
  rotation: Rotation
  flip?: boolean
  /** 符號的 SVG 標記（符號座標） */
  markup: string
  ports: Readonly<Record<string, { x: number; y: number; side: Side }>>
  tag?: string
  modelCode?: string
  labelSide?: Side
}

export interface CircuitSheetInput {
  paper: PaperSize
  title: Omit<TitleInfo, 'scale' | 'projection'>
  nodes: readonly CircuitSheetNode[]
  tubes: readonly { source: string; sourcePort: string; target: string; targetPort: string }[]
  notes: readonly { x: number; y: number; text: string }[]
  bom: readonly { index: number; tags: readonly string[]; modelCode?: string; name: string; quantity: number }[]
  /** 顯示標號與型號 */
  showTags: boolean
  /** 圖面備註（電路資訊的備註） */
  remarks?: string
}

const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left']
const rotateSide = (side: Side, rotation: Rotation): Side => SIDES[(SIDES.indexOf(side) + rotation / 90) % 4]
const flipSide = (side: Side, flip?: boolean): Side => (!flip ? side : side === 'left' ? 'right' : side === 'right' ? 'left' : side)
const POSITION: Record<Side, Position> = { top: Position.Top, right: Position.Right, bottom: Position.Bottom, left: Position.Left }

/** 節點的符號座標 → 畫布座標（與 PneumaticNode 的 CSS 轉換相同：先鏡射、再以中心旋轉） */
export function nodeMatrix(n: Pick<CircuitSheetNode, 'x' | 'y' | 'width' | 'height' | 'rotation' | 'flip'>): Affine {
  const quarter = n.rotation === 90 || n.rotation === 270
  const outerW = quarter ? n.height : n.width
  const outerH = quarter ? n.width : n.height
  return multiply(
    translate(n.x + outerW / 2, n.y + outerH / 2),
    multiply(rotate(n.rotation), multiply(scale(n.flip ? -1 : 1, 1), translate(-n.width / 2, -n.height / 2))),
  )
}

const outerBox = (n: CircuitSheetNode) => {
  const quarter = n.rotation === 90 || n.rotation === 270
  return { x: n.x, y: n.y, w: quarter ? n.height : n.width, h: quarter ? n.width : n.height }
}

const LABEL_ORDER: readonly Side[] = ['left', 'right', 'top', 'bottom']

/** 圖元（線、圓）實際占的範圍 */
function drawnBox(primitives: readonly Primitive[]): Rect | undefined {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of primitives) {
    const pts: Pt[] = p.kind === 'polyline' ? p.points : p.kind === 'circle' ? [[p.center[0] - p.r, p.center[1] - p.r], [p.center[0] + p.r, p.center[1] + p.r]] : []
    for (const [x, y] of pts) {
      x0 = Math.min(x0, x)
      y0 = Math.min(y0, y)
      x1 = Math.max(x1, x)
      y1 = Math.max(y1, y)
    }
  }
  return Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : undefined
}

/** 在畫布座標中產生所有圖元，並回傳範圍 */
function circuitPrimitives(input: CircuitSheetInput): { primitives: Primitive[]; bounds: Rect } {
  const out: Primitive[] = []
  const byId = new Map(input.nodes.map((n) => [n.id, n]))
  const matrices = new Map(input.nodes.map((n) => [n.id, nodeMatrix(n)]))

  // 管線（先畫，符號蓋在上面）
  const portUse = new Map<string, number>()
  for (const t of input.tubes) {
    const a = byId.get(t.source)
    const b = byId.get(t.target)
    const pa = a?.ports[t.sourcePort]
    const pb = b?.ports[t.targetPort]
    if (!a || !b || !pa || !pb) continue
    for (const k of [`${t.source}:${t.sourcePort}`, `${t.target}:${t.targetPort}`]) portUse.set(k, (portUse.get(k) ?? 0) + 1)
    const [sx, sy] = apply(matrices.get(a.id)!, pa.x, pa.y)
    const [tx, ty] = apply(matrices.get(b.id)!, pb.x, pb.y)
    const [path] = getSmoothStepPath({
      sourceX: sx,
      sourceY: sy,
      sourcePosition: POSITION[rotateSide(flipSide(pa.side, a.flip), a.rotation)],
      targetX: tx,
      targetY: ty,
      targetPosition: POSITION[rotateSide(flipSide(pb.side, b.flip), b.rotation)],
      borderRadius: 6,
      offset: 16,
    })
    for (const line of pathToPolylines(path)) out.push({ kind: 'polyline', layer: 'TUBE', points: line.points, width: 3, closed: false })
  }

  // 符號、分歧點、標號
  for (const n of input.nodes) {
    const m = matrices.get(n.id)!
    const symbol = markupToPrimitives(n.markup, m, { layer: 'SYMBOL' })
    out.push(...symbol)
    for (const [port, g] of Object.entries(n.ports)) {
      if ((portUse.get(`${n.id}:${port}`) ?? 0) > 1) out.push({ kind: 'circle', layer: 'TUBE', center: apply(m, g.x, g.y), r: 4.5, width: 0.5, fill: '#000000' })
    }
    const lines = input.showTags ? [n.tag, n.modelCode].filter((v): v is string => !!v) : []
    if (!lines.length) continue
    // 標號貼著實際畫出的符號（5/3 閥的節點外框含閥位移動的空間，比符號寬很多）
    const box = drawnBox(symbol) ?? outerBox(n)
    const used = new Set(Object.values(n.ports).map((g) => rotateSide(flipSide(g.side, n.flip), n.rotation)))
    const side = n.labelSide ?? LABEL_ORDER.find((s) => !used.has(s)) ?? 'left'
    const size = [11, 10]
    const lineH = 14
    const total = lines.length * lineH
    lines.forEach((text, i) => {
      const common = { layer: 'TEXT' as const, size: size[i] ?? 10, text, kind: 'text' as const, color: i ? '#334155' : undefined }
      if (side === 'left' || side === 'right') {
        const y = box.y + box.h / 2 - total / 2 + (i + 0.5) * lineH
        out.push({ ...common, at: [side === 'left' ? box.x - 8 : box.x + box.w + 8, y], align: side === 'left' ? 'right' : 'left', valign: 'middle' })
      } else {
        const y = side === 'top' ? box.y - 4 - total + (i + 0.5) * lineH : box.y + box.h + 4 + (i + 0.5) * lineH
        out.push({ ...common, at: [box.x + box.w / 2, y], align: 'center', valign: 'middle' })
      }
    })
  }

  // 文字註解（與畫面相同：13 px 字、行高 20 px、最寬 288 px）
  for (const note of input.notes) {
    wrapText(note.text, 13, 288 - 12).forEach((line, i) =>
      out.push({ kind: 'text', layer: 'TEXT', at: [note.x + 6, note.y + 4 + (i + 0.5) * 20], text: line, size: 13, valign: 'middle' }),
    )
  }

  // 範圍（文字依估計的字寬）
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const add = (x: number, y: number) => {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  for (const p of out) {
    if (p.kind === 'polyline') p.points.forEach(([x, y]) => add(x, y))
    else if (p.kind === 'circle') {
      add(p.center[0] - p.r, p.center[1] - p.r)
      add(p.center[0] + p.r, p.center[1] + p.r)
    } else if (p.kind === 'text') {
      const w = textWidth(p.text, p.size)
      const x0 = p.align === 'center' ? p.at[0] - w / 2 : p.align === 'right' ? p.at[0] - w : p.at[0]
      add(x0, p.at[1] - p.size * 0.6)
      add(x0 + w, p.at[1] + p.size * 0.6)
    }
  }
  for (const n of input.nodes) {
    const b = outerBox(n)
    add(b.x, b.y)
    add(b.x + b.w, b.y + b.h)
  }
  if (!Number.isFinite(minX)) return { primitives: out, bounds: { x: 0, y: 0, w: 0, h: 0 } }
  return { primitives: out, bounds: { x: minX, y: minY, w: maxX - minX, h: maxY - minY } }
}

/** 把畫布座標的圖元縮放、平移到圖紙上；線寬換成出圖用的粗細 */
function placePrimitives(primitives: readonly Primitive[], m: Affine, k: number): Primitive[] {
  const P = (p: Pt) => apply(m, p[0], p[1])
  return primitives.map((p): Primitive => {
    switch (p.kind) {
      case 'polyline':
        return {
          ...p,
          points: p.points.map(P),
          // 符號線 0.25～0.5 mm；管線 0.5 mm
          width: p.layer === 'TUBE' ? 0.5 : p.width <= 0.02 ? 0.01 : Math.min(0.5, Math.max(0.25, p.width * k)),
          dash: p.dash?.map((v) => v * k),
        }
      case 'circle':
        return { ...p, center: P(p.center), r: p.r * k, width: Math.min(0.5, Math.max(0.2, p.width * k)) }
      case 'text':
        return { ...p, at: P(p.at), size: Math.max(1.8, p.size * k) }
      case 'image':
        return { ...p, at: P(p.at), width: p.width * k, height: p.height * k }
    }
  })
}

/** 迴路圖的圖紙 */
export function layoutCircuitSheet(input: CircuitSheetInput): Sheet & { factor: number } {
  const paper = PAPER[input.paper]
  const tw = input.paper === 'A3' ? 180 : 130
  const kk = tw / 180
  const d = new Draw()
  drawFrame(d, paper.width, paper.height)
  const right = paper.width - MARGIN
  const bottom = paper.height - MARGIN
  const occupied: Rect[] = []

  // 標題欄
  const titleRect = { x: right - tw, y: bottom - TITLE_BLOCK_HEIGHT, w: tw, h: TITLE_BLOCK_HEIGHT }
  drawTitleBlock(d, titleRect.x, titleRect.y, tw, { ...input.title, scale: '—', projection: 'none' })
  occupied.push(titleRect)

  // 零件表（標題欄上方，項次由下往上）
  let top = titleRect.y
  if (input.bom.length) {
    const columns: TableColumn[] = [
      { title: '項次', width: 12 * kk, align: 'center' },
      { title: '標號', width: 30 * kk },
      { title: '型號', width: 48 * kk },
      { title: '名稱', width: 68 * kk },
      { title: '數量', width: 22 * kk, align: 'center' },
    ]
    const style: TableStyle = { rowHeight: 6, headerHeight: 7, textSize: 2.8, headerAtBottom: true }
    const maxRows = Math.max(3, Math.floor((titleRect.y - MARGIN - 80 - style.headerHeight) / style.rowHeight))
    const rows = input.bom.slice(0, maxRows).map((r) => [String(r.index), r.tags.join(', '), r.modelCode ?? '', r.name, String(r.quantity)])
    const h = tableHeight(rows.length, style)
    const rect = drawTable(d, titleRect.x, titleRect.y - h, columns, rows, style)
    occupied.push(rect)
    top = rect.y
    if (input.bom.length > rows.length) d.text([titleRect.x, top - 1.5], `（另有 ${input.bom.length - rows.length} 項，見 BOM）`, 2.6, { valign: 'bottom', color: '#334155' })
  }

  // 備註：放在零件表上方
  const remarks = input.remarks?.trim()
  if (remarks) {
    const lines = wrapText(remarks, 2.8, tw - 5).slice(0, 12)
    const h = 7 + lines.length * 4.6 + 2
    const y = top - 5 - h
    if (y > MARGIN + 40) {
      d.rect({ x: titleRect.x, y, w: tw, h }, 'TITLE', 0.35)
      d.text([titleRect.x + 2, y + 3.5], '備註', 3.1, { layer: 'TITLE', valign: 'middle' })
      d.line([titleRect.x, y + 7], [titleRect.x + tw, y + 7], 'TITLE', 0.25)
      lines.forEach((line, i) => d.text([titleRect.x + 2.5, y + 8 + (i + 0.5) * 4.6], line, 2.8, { valign: 'middle' }))
      occupied.push({ x: titleRect.x, y, w: tw, h })
    }
  }

  // 迴路：縮放到最大的空白區（最多 0.35 mm/px，太小的迴路不放大）
  const { primitives, bounds } = circuitPrimitives(input)
  let factor = 0
  if (bounds.w > 0 || bounds.h > 0) {
    const area = { x: MARGIN + 4, y: MARGIN + 4, w: paper.width - 2 * MARGIN - 8, h: paper.height - 2 * MARGIN - 8 }
    let best: { rect: Rect; k: number } | undefined
    for (const r of freeRects(area, occupied, 5)) {
      const k = Math.min(0.35, (r.w - 4) / Math.max(bounds.w, 1), (r.h - 4) / Math.max(bounds.h, 1))
      if (k > 0 && (!best || k > best.k)) best = { rect: r, k }
    }
    if (best) {
      factor = best.k
      const ox = best.rect.x + (best.rect.w - bounds.w * factor) / 2
      const oy = best.rect.y + (best.rect.h - bounds.h * factor) / 2
      const m = multiply(translate(ox, oy), multiply(scale(factor), translate(-bounds.x, -bounds.y)))
      d.out.push(...placePrimitives(primitives, m, factor))
    }
  } else {
    d.text([(MARGIN + titleRect.x) / 2, paper.height / 2], '（迴路圖是空的）', 5, { align: 'center', valign: 'middle', color: '#64748b' })
  }

  return { width: paper.width, height: paper.height, primitives: d.out, scale: 1, title: input.title.title, factor }
}
