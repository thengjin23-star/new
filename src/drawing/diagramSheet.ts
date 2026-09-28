import type { SequenceStep } from '../engine'
import type { PaperSize } from '../settings/settings'
import type { DiagramGeometry } from '../store/traceDiagram'
import {
  Draw,
  drawFrame,
  drawTable,
  drawTitleBlock,
  MARGIN,
  PAPER,
  tableHeight,
  TITLE_BLOCK_HEIGHT,
  type TableColumn,
  type TableStyle,
  type TitleInfo,
} from './sheet'
import { LINE, type Sheet } from './types'

/**
 * 位移－步驟圖的圖紙（迴路圖的第 2 張）：模擬記錄的位移－步驟圖（或時間圖）、
 * 程序步驟表與標題欄。圖形由畫面用的同一份幾何（px）縮放到圖紙上。
 */
export interface DiagramSheetInput {
  paper: PaperSize
  title: Omit<TitleInfo, 'scale' | 'projection'>
  geometry: DiagramGeometry
  steps?: readonly SequenceStep[]
}

const outputsText = (s: SequenceStep) =>
  Object.entries(s.set)
    .map(([k, v]) => `${k} ${v ? 'ON' : 'OFF'}`)
    .join('、')
const untilText = (s: SequenceStep) =>
  [...s.until.map((c) => (c.startsWith('!') ? `${c.slice(1)} 不成立` : c)), ...(s.delay ? [`${s.delay} s`] : [])].join('＋') || '—'

export function layoutDiagramSheet(input: DiagramSheetInput): Sheet {
  const paper = PAPER[input.paper]
  const tw = input.paper === 'A3' ? 180 : 130
  const kk = tw / 180
  const d = new Draw()
  drawFrame(d, paper.width, paper.height)
  const right = paper.width - MARGIN
  const bottom = paper.height - MARGIN
  const titleY = bottom - TITLE_BLOCK_HEIGHT
  const heading = input.geometry.mode === 'step' ? '位移－步驟圖' : '位移－時間圖'
  drawTitleBlock(d, right - tw, titleY, tw, { ...input.title, title: `${input.title.title}（${heading}）`, scale: '—', projection: 'none' })

  // 程序步驟表：標題欄上方
  let top = titleY
  if (input.steps?.length) {
    const columns: TableColumn[] = [
      { title: '步驟', width: 14 * kk, align: 'center' },
      { title: '動作', width: 26 * kk, align: 'center' },
      { title: '輸出', width: 70 * kk },
      { title: '轉移條件', width: 70 * kk },
    ]
    const style: TableStyle = { rowHeight: 6, headerHeight: 7, textSize: 2.8, headerAtBottom: true }
    const rows = input.steps.map((s, i) => [String(i + 1), s.label ?? '', outputsText(s), untilText(s)])
    const h = tableHeight(rows.length, style)
    top = drawTable(d, right - tw, titleY - h, columns, rows, style).y
  }

  // 圖：放在標題欄左側與上方的空白區（取面積較大者）
  const g = input.geometry
  const heights = [top - MARGIN - 16, titleY - MARGIN - 16]
  const widths = [paper.width - 2 * MARGIN - 12, right - tw - MARGIN - 18]
  const k = Math.max(Math.min(widths[0] / g.width, heights[0] / g.height), Math.min(widths[1] / g.width, heights[1] / g.height))
  const ox = MARGIN + 6
  const oy = MARGIN + 12
  const X = (x: number) => ox + x * k
  const Y = (y: number) => oy + y * k
  const text = (px: number) => Math.max(2.2, Math.min(3.5, px * k))

  d.text([ox, MARGIN + 6], heading, 4.2, { valign: 'middle' })
  for (const l of g.lines) {
    d.line([X(l.x), Y(l.style === 'step' ? 14 : 20)], [X(l.x), Y(g.height - 4)], 'DIM', LINE.thin, l.style === 'step' ? undefined : [1.2, 1])
    if (l.label) d.text([X(l.x), Y(l.style === 'mark' ? 26 : 10)], l.label, text(10), { align: 'center', valign: 'middle', color: '#334155' })
  }
  for (const c of g.columns) d.text([X(c.x), Y(24)], c.text, text(10), { align: 'center', valign: 'middle' })
  for (const r of g.rows) {
    d.line([X(g.left), Y(r.top)], [X(g.right), Y(r.top)], 'DIM', 0.18)
    d.line([X(g.left), Y(r.top + r.height)], [X(g.right), Y(r.top + r.height)], 'DIM', 0.18)
    d.text([X(g.left - 8), Y(r.top + r.height / 2)], r.label, text(11), { align: 'right', valign: 'middle' })
    if (r.kind === 'cylinder') {
      d.text([X(g.left - 2), Y(r.top)], '1', text(8), { align: 'right', valign: 'middle', color: '#64748b' })
      d.text([X(g.left - 2), Y(r.top + r.height)], '0', text(8), { align: 'right', valign: 'middle', color: '#64748b' })
    }
    if (r.points.length > 1) d.poly(r.points.map(([x, y]) => [X(x), Y(y)] as const), 'OUTLINE', r.kind === 'cylinder' ? LINE.visible : 0.35)
  }
  return { width: paper.width, height: paper.height, primitives: d.out, scale: 1, title: `${input.title.title}-${heading}` }
}
