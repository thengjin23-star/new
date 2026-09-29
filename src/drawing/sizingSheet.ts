import { tubeInnerDiameter } from '../assembly/tubes'
import type { PaperSize } from '../settings/settings'
import { fmt, plain, type SizingRow, type SizingSummary } from '../sizing/sizing'
import { Draw, drawFrame, drawTable, drawTitleBlock, MARGIN, PAPER, tableHeight, TITLE_BLOCK_HEIGHT, type TableColumn, type TableStyle, type TitleInfo } from './sheet'
import type { Sheet } from './types'

/**
 * 選型計算書：氣缸選型表（負載、負載率、建議缸徑）、耗氣量與配管表（每次耗氣、流量、建議閥與管徑）、
 * 合計（每循環、每分鐘、峰值流量）與計算說明。氣缸很多時分成多張。
 */
export interface SizingSheetInput {
  paper: PaperSize
  title: Omit<TitleInfo, 'scale' | 'projection' | 'sheet'>
  summary: SizingSummary
  /** 第 page 張（0 起算）的張數，例如「3/3」 */
  sheetLabel?: (page: number) => string | undefined
}

const HEADING = '選型計算書'
const INSET = 6
const GAP = 6
const TABLE_TOP = MARGIN + INSET + 10

const styleOf = (paper: PaperSize, caption: string): TableStyle => ({ rowHeight: 6, headerHeight: 7, textSize: paper === 'A3' ? 3 : 2.6, caption })

/** 每張最多幾支氣缸：兩個表格都要放在標題欄上方 */
export function sizingRowsPerSheet(paper: PaperSize): number {
  const p = PAPER[paper]
  const available = p.height - MARGIN - TITLE_BLOCK_HEIGHT - 4 - TABLE_TOP
  const style = styleOf(paper, ' ')
  const fixed = 2 * tableHeight(0, style) + GAP
  return Math.max(1, Math.floor((available - fixed) / (2 * style.rowHeight)))
}

export function sizingSheetCount(summary: SizingSummary, paper: PaperSize): number {
  return Math.max(1, Math.ceil(summary.rows.length / sizingRowsPerSheet(paper)))
}

const DIRECTION: Record<string, string> = { extend: '伸出', retract: '縮回', both: '兩方向' }

function selectionRow(r: SizingRow): string[] {
  const b = r.bore
  const force = b?.force
  return [
    r.label,
    r.model ?? '—',
    `Ø${plain(r.cylinder.bore)} × ${plain(r.cylinder.stroke)}`,
    plain(r.pressure),
    r.load.load > 0 ? plain(r.load.load) : '—',
    r.cylinder.single ? '伸出' : DIRECTION[r.load.direction],
    String(r.load.loadFactor),
    b ? fmt(b.required) : '—',
    force ? `${fmt(force.extend)}／${r.cylinder.single ? '—' : fmt(force.retract)}` : '—',
    b && Number.isFinite(b.ratio) ? b.ratio.toFixed(2) : '—',
    b ? (b.ok ? '合格' : '不足') : '—',
    b ? (b.recommended !== undefined ? `Ø${b.recommended}` : '無標準缸徑') : '—',
  ]
}

/** 配管：模組列出實際的 PU 管；迴路圖依建議管徑與設定的長度估算 */
function tubingText(r: SizingRow): string {
  if (r.tubing) return r.tubing
  const area = (Math.PI / 4) * tubeInnerDiameter(r.air.tube.od) ** 2
  const length = area > 0 ? r.air.dead.extend / area / 1000 : 0
  return `Ø${r.air.tube.od} × ${plain(Math.round(length * 100) / 100)} m／條（估算）`
}

function airRow(r: SizingRow): string[] {
  return [
    r.label,
    fmt(r.air.extend),
    r.cylinder.single ? '—' : fmt(r.air.retract),
    tubingText(r),
    `${r.motions.extend}／${r.motions.retract}${r.motions.fromSequence ? '' : ' *'}`,
    fmt(r.perCycle),
    fmt(Math.max(r.air.flow.extend, r.air.flow.retract)),
    `≥ ${fmt(r.air.valve.C)}`,
    `Ø${r.air.tube.od}`,
  ]
}

/** 欄寬依可用寬度等比放大 */
function fitColumns(columns: TableColumn[], width: number): TableColumn[] {
  const sum = columns.reduce((s, c) => s + c.width, 0)
  return columns.map((c) => ({ ...c, width: (c.width * width) / sum }))
}

const NOTES = [
  '1. 缸徑：理論出力 F = P × A（縮回扣除活塞桿面積）；負載 ÷ 理論出力 ≤ 負載率時合格，建議缸徑為符合條件的最小標準缸徑。',
  '2. 耗氣量（NL，換算成大氣壓下的體積）= 容積 × (P + 0.1013) ÷ 0.1013，含閥到氣缸之間的配管容積。',
  '3. 流量 Q = 活塞面積 × 行程 ÷ 行程時間（ANR）；閥的音速傳導 C = Q ÷ (600 × (P + 0.1) × φ)，φ 為次音速修正（b = 0.3）。',
  '4. 建議管徑：管內流速不超過 20 m/s，且不小於缸徑的常用配管。',
  '5. 閥與管徑為簡化計算的參考值，實際選型請以廠商型錄或選型軟體確認。',
]

export function layoutSizingSheets(input: SizingSheetInput): Sheet[] {
  const paper = PAPER[input.paper]
  const tw = input.paper === 'A3' ? 180 : 130
  const right = paper.width - MARGIN
  const bottom = paper.height - MARGIN
  const titleY = bottom - TITLE_BLOCK_HEIGHT
  const x0 = MARGIN + INSET
  const width = right - INSET - x0
  const perSheet = sizingRowsPerSheet(input.paper)
  const pages = sizingSheetCount(input.summary, input.paper)
  const { summary } = input

  const selection = fitColumns(
    [
      { title: '代號', width: 34 },
      { title: '型號', width: 32 },
      { title: '缸徑 × 行程', width: 22, align: 'center' },
      { title: '壓力 MPa', width: 15, align: 'right' },
      { title: '負載 N', width: 16, align: 'right' },
      { title: '方向', width: 13, align: 'center' },
      { title: '負載率上限', width: 17, align: 'right' },
      { title: '需要出力 N', width: 19, align: 'right' },
      { title: '理論出力 伸／縮 N', width: 28, align: 'center' },
      { title: '負載率', width: 14, align: 'right' },
      { title: '判定', width: 12, align: 'center' },
      { title: '建議缸徑', width: 20, align: 'center' },
    ],
    width,
  )
  const air = fitColumns(
    [
      { title: '代號', width: 34 },
      { title: '每次伸出 NL', width: 19, align: 'right' },
      { title: '每次縮回 NL', width: 19, align: 'right' },
      { title: '配管', width: 58 },
      { title: '每循環 伸／縮', width: 20, align: 'center' },
      { title: '每循環 NL', width: 17, align: 'right' },
      { title: '所需流量 L/min', width: 21, align: 'right' },
      { title: '建議閥 C', width: 21, align: 'center' },
      { title: '建議管徑', width: 16, align: 'center' },
    ],
    width,
  )

  const sheets: Sheet[] = []
  for (let page = 0; page < pages; page++) {
    const rows = summary.rows.slice(page * perSheet, (page + 1) * perSheet)
    const last = page === pages - 1
    const d = new Draw()
    drawFrame(d, paper.width, paper.height)
    drawTitleBlock(d, right - tw, titleY, tw, { ...input.title, title: `${input.title.title}（${HEADING}）`, scale: '—', projection: 'none', sheet: input.sheetLabel?.(page) })
    d.text([x0, MARGIN + INSET + 3], pages > 1 ? `${HEADING}（${page + 1}／${pages}）` : HEADING, 5, { valign: 'middle' })

    const t1 = drawTable(d, x0, TABLE_TOP, selection, rows.map(selectionRow), styleOf(input.paper, '氣缸選型'))
    drawTable(d, x0, t1.y + t1.h + GAP, air, rows.map(airRow), styleOf(input.paper, '耗氣量與配管'))

    // 標題欄左側：合計（最後一張）與計算說明
    const noteW = right - tw - INSET - x0
    let y = titleY + 3
    if (last) {
      const cpm = summary.cyclesPerMinute !== undefined ? `${plain(summary.cyclesPerMinute)} 次` : '—'
      const perMinute = summary.perMinute !== undefined ? `${fmt(summary.perMinute)} NL/min` : '—'
      d.fittedText([x0, y + 1.6], `合計：每循環 ${fmt(summary.perCycle)} NL　每分鐘 ${cpm}　平均耗氣量 ${perMinute}　峰值流量 ${fmt(summary.peak)} L/min（ANR）`, 3, noteW, {
        valign: 'middle',
      })
      y += 5
    }
    const notes = summary.rows.some((r) => !r.motions.fromSequence) ? [...NOTES, '* 程序中沒有這支氣缸，以伸、縮各一次計算。'] : NOTES
    const lineH = Math.min(3.6, (bottom - 1 - y) / notes.length)
    notes.forEach((line, i) => d.fittedText([x0, y + (i + 0.5) * lineH], line, Math.min(2.3, lineH * 0.72), noteW, { valign: 'middle', color: '#334155' }))
    sheets.push({ width: paper.width, height: paper.height, primitives: d.out, scale: 1, title: `${input.title.title}-${HEADING}${pages > 1 ? `-${page + 1}` : ''}` })
  }
  return sheets
}
