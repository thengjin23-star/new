import { lastCycle, type Trace } from './trace'

/**
 * 位移－步驟圖／位移－時間圖的幾何（px，y 向下），畫面與出圖共用：
 * - 步驟圖：最近一個程序循環，每一步佔相同寬度，步驟內依時間比例換算
 * - 時間圖：整段記錄，橫軸為秒
 * 每支氣缸一列（下緣 = 縮回 0、上緣 = 伸出 1），每個電氣輸出一列（ON／OFF）。
 */
export type DiagramMode = 'step' | 'time'

export interface DiagramRow {
  label: string
  /** 顯示用的標籤：一行放不下時分成兩行（代號、說明），說明太長時截斷 */
  lines: string[]
  kind: 'cylinder' | 'output'
  top: number
  height: number
  points: [number, number][]
}

export interface DiagramLine {
  x: number
  label?: string
  /** 步驟邊界（實線）或時間格線、步驟記號（虛線） */
  style: 'step' | 'grid' | 'mark'
}

export interface DiagramGeometry {
  mode: DiagramMode
  width: number
  height: number
  /** 圖區左右邊界 */
  left: number
  right: number
  rows: DiagramRow[]
  lines: DiagramLine[]
  /** 步驟圖：每一步的名稱（A+…），置中在該步驟的欄 */
  columns: { x: number; text: string }[]
  /** 畫不出來時的說明 */
  note?: string
}

export const DIAGRAM_LEFT = 78
const RIGHT_PAD = 14
const TOP = 32
const CYL_H = 34
const OUT_H = 14
const GAP = 12

const TIME_TICKS = [0.5, 1, 2, 5, 10, 20, 30, 60, 120]

/** 標籤欄的字級（px）：第一行、第二行（說明） */
export const LABEL_SIZE = 11
export const LABEL_SUB_SIZE = 9

/** 估計文字寬度（px）：中日韓文字與全形符號約一個字寬，其他約 0.6 個字寬 */
export function textWidth(text: string, size: number): number {
  let w = 0
  for (const ch of text) w += (ch.codePointAt(0) ?? 0) >= 0x2e80 ? size : size * 0.6
  return w
}

function fitText(text: string, max: number, size: number): string {
  if (textWidth(text, size) <= max) return text
  const chars = [...text]
  while (chars.length > 1 && textWidth(`${chars.join('')}…`, size) > max) chars.pop()
  return `${chars.join('')}…`
}

/** 列的標籤：放得下就一行；否則「A（DEMO-CYL-16-50）」分成代號與說明兩行，太長的截斷 */
export function labelLines(label: string, max: number, twoLines = true): string[] {
  if (textWidth(label, LABEL_SIZE) <= max) return [label]
  const m = /^(.*?)（(.*)）$/.exec(label)
  if (!m || !twoLines) return [fitText(label, max, LABEL_SIZE)]
  return [fitText(m[1], max, LABEL_SIZE), fitText(m[2], max, LABEL_SUB_SIZE)]
}

export interface DiagramOptions {
  /** 步驟圖優先畫最近一個完整的循環（出圖用） */
  preferComplete?: boolean
  /** 氣缸列與輸出列的高度（px） */
  cylinderHeight?: number
  outputHeight?: number
}

export function diagramGeometry(trace: Trace, mode: DiagramMode, width: number, now: number, options: DiagramOptions = {}): DiagramGeometry {
  const left = DIAGRAM_LEFT
  const right = Math.max(left + 40, width - RIGHT_PAD)
  const plotW = right - left
  const rows: DiagramRow[] = []
  let y = TOP
  for (const r of trace.rows) {
    const h = r.kind === 'cylinder' ? (options.cylinderHeight ?? CYL_H) : (options.outputHeight ?? OUT_H)
    // 兩行標籤需要約 24 px 的列高
    rows.push({ label: r.label, lines: labelLines(r.label, left - 12, h >= 24), kind: r.kind, top: y, height: h, points: [] })
    y += h + GAP
  }
  const height = y + 4
  const base = { width, height, left, right, rows, lines: [] as DiagramLine[], columns: [] as DiagramGeometry['columns'] }

  const cycle = mode === 'step' ? lastCycle(trace, now, options.preferComplete) : undefined
  if (mode === 'step' && (!cycle || !cycle.steps.length)) {
    return { ...base, mode, note: '還沒有執行程序：按「自動」或「單步」執行後，這裡會畫出位移－步驟圖' }
  }

  let xOf: (t: number) => number | undefined
  if (cycle) {
    const n = cycle.steps.length
    const colW = plotW / n
    xOf = (t) => {
      const k = cycle.steps.findIndex((s, i) => t >= s.t0 - 1e-9 && (t < s.t1 || (i === n - 1 && t <= s.t1 + 1e-9)))
      if (k < 0) return undefined
      const s = cycle.steps[k]
      const f = s.t1 > s.t0 ? (t - s.t0) / (s.t1 - s.t0) : 1
      return left + (k + Math.min(1, Math.max(0, f))) * colW
    }
    for (let k = 0; k <= n; k++) {
      const label = k === n && cycle.complete ? `${n + 1}=1` : `${k + 1}`
      base.lines.push({ x: left + k * colW, label, style: 'step' })
    }
    cycle.steps.forEach((s, k) => base.columns.push({ x: left + (k + 0.5) * colW, text: s.label }))
  } else {
    const t0 = trace.samples[0]?.t ?? 0
    const t1 = Math.max(t0 + 1, trace.samples[trace.samples.length - 1]?.t ?? t0)
    const span = t1 - t0
    xOf = (t) => left + ((t - t0) / span) * plotW
    const tick = TIME_TICKS.find((d) => span / d <= plotW / 56) ?? 300
    for (let t = 0; t <= span + 1e-9; t += tick) base.lines.push({ x: xOf(t0 + t)!, label: `${+t.toFixed(1)} s`, style: 'grid' })
    for (const m of trace.marks) if (m.t >= t0 && m.t <= t1) base.lines.push({ x: xOf(m.t)!, label: m.index >= 0 ? m.label : undefined, style: 'mark' })
  }

  trace.rows.forEach((r, i) => {
    const row = rows[i]
    const yOf = (v: number) => row.top + (1 - v) * row.height
    let prev: number | undefined
    for (const s of trace.samples) {
      const x = xOf(s.t)
      if (x === undefined) continue
      const v = s.v[i] ?? 0
      // 電氣輸出畫成方波：切換時先水平再垂直
      if (r.kind === 'output' && prev !== undefined && prev !== v) row.points.push([x, yOf(prev)])
      row.points.push([x, yOf(v)])
      prev = v
    }
  })
  return { ...base, mode }
}
