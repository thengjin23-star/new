import { tubeInnerDiameter } from '../assembly/tubes'
import {
  CYLINDER_STROKE_SECONDS,
  cylinderForce,
  defaultRodDiameter,
  numParam,
  parseNotation,
  STANDARD_BORES,
  strParam,
  type LoadDirection,
  type Params,
  type Sequence,
  type SequenceStep,
} from '../engine'
import { lastCycle, type Trace } from '../store/trace'

/**
 * 選型計算（純函式）：缸徑檢核、耗氣量、所需流量、建議的閥與管徑。
 *
 * - 壓力一律用表壓（MPa）；耗氣量以大氣壓下的體積（NL）表示
 * - 閥與管徑是簡化計算的參考值，實際選型請以廠商型錄或選型軟體確認
 */

/** 大氣壓（MPa，絕對） */
export const ATM = 0.1013
/** 壓縮比：表壓 p 的壓縮空氣換算成大氣壓下的體積倍數 */
export const compressionRatio = (p: number): number => (Math.max(0, p) + ATM) / ATM

/** 常用的負載率 */
export const LOAD_FACTOR_PRESETS: readonly { value: number; label: string }[] = [
  { value: 0.7, label: '0.7：靜態（夾持、壓入）' },
  { value: 0.5, label: '0.5：一般水平移動' },
  { value: 0.3, label: '0.3：高速、垂直上舉' },
]

/** 常用 PU 管外徑（mm） */
export const TUBE_SIZES: readonly number[] = [4, 6, 8, 10, 12, 16]
/** 建議的管內最大流速（m/s） */
export const MAX_TUBE_VELOCITY = 20
/** 音速傳導的臨界壓力比（次音速修正） */
export const CRITICAL_RATIO = 0.3
/** 迴路圖沒有管長：每條配管預設 1 m */
export const DEFAULT_TUBE_LENGTH = 1

/** 選型的設定（存在電路資訊或模組裡） */
export interface SizingSettings {
  /** 每分鐘循環數 */
  cyclesPerMinute?: number
  /** 計算壓力（MPa）；未指定時依迴路（氣缸埠的壓力） */
  pressure?: number
  /** 迴路圖：每條配管的長度（m） */
  tubeLength?: number
}

/** 讀回存檔的選型設定：只保留有效的正數 */
export function sanitizeSizing(raw: unknown): SizingSettings | undefined {
  const r = raw as Record<string, unknown> | null | undefined
  if (!r || typeof r !== 'object') return undefined
  const pick = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined)
  const out: SizingSettings = {}
  for (const key of ['cyclesPerMinute', 'pressure', 'tubeLength'] as const) {
    const v = pick(r[key])
    if (v !== undefined) out[key] = v
  }
  return Object.keys(out).length ? out : undefined
}

/** 缸徑的常用配管（型錄常見搭配）：建議管徑不小於這個 */
export function commonTubeForBore(bore: number): number {
  if (bore <= 16) return 4
  if (bore <= 32) return 6
  if (bore <= 50) return 8
  if (bore <= 80) return 10
  return 12
}

export interface CylinderSpec {
  bore: number
  /** 活塞桿徑；0 = 依缸徑的常用值 */
  rod: number
  stroke: number
  /** 全開時走完行程的秒數 */
  strokeTime: number
  /** 單動（彈簧復歸） */
  single?: boolean
}

export interface LoadSpec {
  load: number
  loadFactor: number
  direction: LoadDirection
}

export const rodOf = (c: Pick<CylinderSpec, 'bore' | 'rod'>): number => (c.rod > 0 ? c.rod : defaultRodDiameter(c.bore))

/** 由元件參數（已套用預設值）讀出氣缸規格 */
export function cylinderSpecOf(type: string, params: Params): CylinderSpec {
  return {
    bore: numParam(params, 'bore', 32),
    rod: numParam(params, 'rod', 0),
    stroke: numParam(params, 'stroke', 100),
    strokeTime: numParam(params, 'strokeTime', CYLINDER_STROKE_SECONDS),
    single: type === 'cylinderSingle',
  }
}

export function loadSpecOf(params: Params): LoadSpec {
  const dir = strParam(params, 'loadDir')
  return {
    load: Math.max(0, numParam(params, 'load', 0)),
    loadFactor: Math.min(1, Math.max(0.05, numParam(params, 'loadFactor', 0.5))),
    direction: dir === 'retract' || dir === 'both' ? dir : 'extend',
  }
}

export interface Forces {
  extend: number
  retract: number
}

/** 理論出力（N）：伸出用無桿側面積，縮回扣掉活塞桿；單動氣缸縮回靠彈簧（0） */
export function theoreticalForces(c: CylinderSpec, pressure: number): Forces {
  const rod = rodOf(c)
  return { extend: cylinderForce(pressure, c.bore, rod, 'extend'), retract: c.single ? 0 : cylinderForce(pressure, c.bore, rod, 'retract') }
}

export interface BoreSizing {
  /** 需要的理論出力（N）＝負載 ÷ 負載率 */
  required: number
  /** 目前缸徑的理論出力 */
  force: Forces
  /** 目前缸徑在負載方向的負載率（兩方向取較大者） */
  ratio: number
  ok: boolean
  /** 建議缸徑（符合負載方向的最小標準缸徑）；負載太大時 undefined */
  recommended?: number
  recommendedForce?: Forces
}

const loadedDirections = (c: CylinderSpec, dir: LoadDirection): ('extend' | 'retract')[] =>
  c.single ? ['extend'] : dir === 'both' ? ['extend', 'retract'] : [dir]

/** 缸徑檢核；沒有負載時回傳 undefined */
export function sizeBore(c: CylinderSpec, l: LoadSpec, pressure: number): BoreSizing | undefined {
  if (!(l.load > 0) || !(pressure > 0)) return undefined
  const dirs = loadedDirections(c, l.direction)
  const required = l.load / l.loadFactor
  const force = theoreticalForces(c, pressure)
  const ratio = Math.max(...dirs.map((d) => (force[d] > 0 ? l.load / force[d] : Infinity)))
  // 換缸徑時活塞桿用該缸徑的常用值；目前的缸徑用實際桿徑
  const candidate = (bore: number): CylinderSpec => ({ ...c, bore, rod: bore === c.bore ? c.rod : 0 })
  const recommended = STANDARD_BORES.find((b) => dirs.every((d) => theoreticalForces(candidate(b), pressure)[d] >= required - 1e-9))
  return {
    required,
    force,
    ratio,
    ok: ratio <= l.loadFactor + 1e-9,
    ...(recommended !== undefined && { recommended, recommendedForce: theoreticalForces(candidate(recommended), pressure) }),
  }
}

/** 次音速修正（ISO 6358）：下游／上游絕對壓力比 r 超過臨界壓力比 b 時流量打折 */
export function subsonicFactor(r: number, b = CRITICAL_RATIO): number {
  if (r <= b) return 1
  if (r >= 1) return 0
  return Math.sqrt(1 - ((r - b) / (1 - b)) ** 2)
}

const circleArea = (d: number) => (Math.PI / 4) * d * d

/** 管內流速（m/s）：流量 Q（L/min ANR）在壓力 p 下通過內徑 id（mm）的管 */
export function tubeVelocity(flow: number, pressure: number, id: number): number {
  const actual = flow / compressionRatio(pressure) / 60000
  return actual / (circleArea(id) * 1e-6)
}

/** 建議管徑：管內流速不超過上限、且不小於缸徑常用配管的最小 PU 管 */
export function recommendTube(flow: number, pressure: number, bore: number): { od: number; velocity: number } {
  const floor = commonTubeForBore(bore)
  const od =
    TUBE_SIZES.find((o) => o >= floor && tubeVelocity(flow, pressure, tubeInnerDiameter(o)) <= MAX_TUBE_VELOCITY) ?? TUBE_SIZES[TUBE_SIZES.length - 1]
  return { od, velocity: tubeVelocity(flow, pressure, tubeInnerDiameter(od)) }
}

export interface AirSizing {
  /** 每次伸出、縮回的耗氣量（NL，含配管） */
  extend: number
  retract: number
  /** 其中配管的部分（NL） */
  tubeExtend: number
  tubeRetract: number
  /** 配管容積（mm³）：伸出側（A）、縮回側（B） */
  dead: { extend: number; retract: number }
  /** 所需流量（L/min ANR） */
  flow: { extend: number; retract: number }
  /** 建議閥：音速傳導 C（dm³/(s·bar)）、有效截面積 S（mm²）、Cv（參考值） */
  valve: { C: number; S: number; Cv: number }
  /** 建議管徑（外徑 mm）與這個管徑的管內流速（m/s） */
  tube: { od: number; velocity: number }
}

/**
 * 耗氣量與流量。dead：配管容積（mm³）；未提供時以建議管徑 × tubeLength（m）估算（迴路圖沒有管長）。
 * 閥的音速傳導 C = Q ÷ (600 × (P + 0.1) × φ)，φ 以「P × 負載率」為閥出口壓力做次音速修正。
 */
export function sizeAir(
  c: CylinderSpec,
  pressure: number,
  loadFactor: number,
  dead?: { extend: number; retract: number },
  tubeLength = DEFAULT_TUBE_LENGTH,
): AirSizing {
  const ratio = compressionRatio(pressure)
  const extendArea = circleArea(c.bore)
  const retractArea = c.single ? 0 : Math.max(0, extendArea - circleArea(rodOf(c)))
  const speed = c.stroke / Math.max(0.01, c.strokeTime)
  const flow = { extend: extendArea * speed * 60e-6 * ratio, retract: retractArea * speed * 60e-6 * ratio }
  const tube = recommendTube(Math.max(flow.extend, flow.retract), pressure, c.bore)
  const line = circleArea(tubeInnerDiameter(tube.od)) * tubeLength * 1000
  const d = { extend: dead?.extend ?? line, retract: c.single ? 0 : (dead?.retract ?? line) }
  const nl = (mm3: number) => mm3 * 1e-6 * ratio
  const tubeExtend = nl(d.extend)
  const tubeRetract = nl(d.retract)
  const phi = subsonicFactor((pressure * loadFactor + 0.1) / (pressure + 0.1))
  const C = pressure > 0 && phi > 0 ? Math.max(flow.extend, flow.retract) / (600 * (pressure + 0.1) * phi) : 0
  const S = 5 * C
  return {
    extend: nl(extendArea * c.stroke) + tubeExtend,
    retract: c.single ? 0 : nl(retractArea * c.stroke) + tubeRetract,
    tubeExtend,
    tubeRetract,
    dead: d,
    flow,
    valve: { C, S, Cv: S / 18 },
    tube,
  }
}

/**
 * 一步中動作的氣缸（代號 → 伸出 1／縮回 -1）：優先讀步驟名稱（A+、B−、A+ B+）；
 * 沒有可解讀的名稱時改看轉移條件（a1 = 伸出、a0 = 縮回）。
 */
export function stepMotions(step: SequenceStep): Map<string, Set<1 | -1>> {
  const out = new Map<string, Set<1 | -1>>()
  const add = (letter: string, dir: 1 | -1) => out.set(letter, (out.get(letter) ?? new Set<1 | -1>()).add(dir))
  const parsed = step.label ? parseNotation(step.label) : undefined
  if (parsed && !parsed.error) for (const m of parsed.groups.flat()) add(m.letter, m.dir)
  if (!out.size)
    for (const c of step.until) {
      const m = /^([a-h])([01])$/.exec(c)
      if (m) add(m[1].toUpperCase(), m[2] === '1' ? 1 : -1)
    }
  return out
}

export interface Motions {
  extend: number
  retract: number
  /** 依程序計算（否則是預設的伸、縮各一次） */
  fromSequence: boolean
}

/** 每循環的伸出、縮回次數；程序中沒有這支氣缸時當作各一次 */
export function motionsPerCycle(sequence: Sequence | undefined, letter: string | undefined): Motions {
  let extend = 0
  let retract = 0
  const key = letter?.toUpperCase()
  if (key)
    for (const step of sequence?.steps ?? []) {
      const dirs = stepMotions(step).get(key)
      if (dirs?.has(1)) extend++
      if (dirs?.has(-1)) retract++
    }
  return extend || retract ? { extend, retract, fromSequence: true } : { extend: 1, retract: 1, fromSequence: false }
}

export interface SizingInput {
  id: string
  /** 顯示名稱，例如「A（1A1）」 */
  label: string
  /** 氣缸代號（A、B…） */
  letter?: string
  model?: string
  cylinder: CylinderSpec
  load: LoadSpec
  /** 計算壓力（MPa） */
  pressure: number
  /** 配管容積（mm³）；未提供時依設定的配管長度估算 */
  dead?: { extend: number; retract: number }
  /** 配管說明，例如「Ø4 × 0.35 m」 */
  tubing?: string
}

export interface SizingRow extends SizingInput {
  bore?: BoreSizing
  air: AirSizing
  motions: Motions
  /** 每循環耗氣量（NL） */
  perCycle: number
}

export interface SizingSummary {
  rows: SizingRow[]
  /** 每循環耗氣量合計（NL） */
  perCycle: number
  cyclesPerMinute?: number
  /** 平均耗氣量（NL/min） */
  perMinute?: number
  /** 峰值流量（L/min ANR）：同一步同時動作的氣缸加總 */
  peak: number
}

/** 峰值流量：程序中同一步動作的氣缸流量加總取最大；沒有程序（或對不到氣缸）時全部加總 */
export function peakFlow(rows: readonly Pick<SizingRow, 'letter' | 'air'>[], sequence?: Sequence): number {
  const byLetter = new Map(rows.flatMap((r) => (r.letter ? [[r.letter.toUpperCase(), r] as const] : [])))
  let peak = 0
  for (const step of sequence?.steps ?? []) {
    let sum = 0
    for (const [letter, dirs] of stepMotions(step)) {
      const r = byLetter.get(letter)
      if (r) sum += Math.max(dirs.has(1) ? r.air.flow.extend : 0, dirs.has(-1) ? r.air.flow.retract : 0)
    }
    peak = Math.max(peak, sum)
  }
  return peak > 0 ? peak : rows.reduce((s, r) => s + Math.max(r.air.flow.extend, r.air.flow.retract), 0)
}

export function computeSizing(inputs: readonly SizingInput[], sequence?: Sequence, settings: SizingSettings = {}): SizingSummary {
  const rows = inputs.map((input): SizingRow => {
    const air = sizeAir(input.cylinder, input.pressure, input.load.loadFactor, input.dead, settings.tubeLength ?? DEFAULT_TUBE_LENGTH)
    const motions = motionsPerCycle(sequence, input.letter)
    return { ...input, bore: sizeBore(input.cylinder, input.load, input.pressure), air, motions, perCycle: motions.extend * air.extend + motions.retract * air.retract }
  })
  const perCycle = rows.reduce((s, r) => s + r.perCycle, 0)
  const cpm = settings.cyclesPerMinute !== undefined && settings.cyclesPerMinute > 0 ? settings.cyclesPerMinute : undefined
  return { rows, perCycle, cyclesPerMinute: cpm, perMinute: cpm !== undefined ? perCycle * cpm : undefined, peak: peakFlow(rows, sequence) }
}

/** 模擬中最近一個完整程序循環的時間（秒）；還沒有完整循環時 undefined */
export function cycleTimeOf(trace: Trace | undefined, now: number): number | undefined {
  const cycle = trace && lastCycle(trace, now, true)
  if (!cycle?.complete || !cycle.steps.length) return undefined
  const t = cycle.steps[cycle.steps.length - 1].t1 - cycle.steps[0].t0
  return t > 0 ? t : undefined
}

/** 顯示用數值：依大小保留適當的小數位數 */
export function fmt(v: number): string {
  if (!Number.isFinite(v)) return '—'
  const a = Math.abs(v)
  return v.toFixed(a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3)
}
