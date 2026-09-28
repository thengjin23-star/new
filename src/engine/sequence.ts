import { coilNames, VALVE_SPECS, type ValveSpec } from './components'
import { resolveParams } from './params'
import { registry as defaultRegistry, type ComponentRegistry } from './registry'
import { sensorName, strParam } from './signals'
import { portKey, type Circuit, type PortKey, type Signals } from './types'

/**
 * 程序控制（順序控制）：每一步設定電氣輸出（Y1 ON、Y2 OFF…），等轉移條件成立
 * （感測器 a1…、計時）後進入下一步。純函式，畫面端每幀呼叫 tickSequence。
 */
export interface SequenceStep {
  /** 顯示用，例如「A+」「A+ B+」 */
  label?: string
  /** 這一步開始時設定的電氣輸出（true = ON、false = OFF；沒列出的保持） */
  set: Readonly<Record<string, boolean>>
  /** 轉移條件：這些訊號都成立才進入下一步；名稱前加「!」表示不成立（例如「!b0」） */
  until: readonly string[]
  /** 至少停留的秒數（計時）；與訊號條件都成立才進入下一步 */
  delay?: number
}

export interface Sequence {
  steps: readonly SequenceStep[]
  /** 產生步驟用的動作順序（例如「A+ B+ B- A-」），方便再修改 */
  notation?: string
}

export interface SequencerState {
  /** off：停止；auto：自動執行；step：單步（每一步的條件成立後停住，按「單步」才往下） */
  mode: 'off' | 'auto' | 'step'
  /** 目前步驟（0 起算）；-1 = 尚未開始或已完成一個循環 */
  index: number
  /** 在目前步驟經過的秒數 */
  elapsed: number
  /** 單步模式：目前步驟的條件已成立，等使用者按「單步」 */
  waiting: boolean
  /** 連續循環 */
  continuous: boolean
  /** 已完成的循環數 */
  cycles: number
}

export const SEQUENCER_IDLE: SequencerState = Object.freeze({
  mode: 'off',
  index: -1,
  elapsed: 0,
  waiting: false,
  continuous: false,
  cycles: 0,
}) as SequencerState

export interface SequencerTick {
  state: SequencerState
  /** 進入新的一步時要設定的輸出 */
  set?: Readonly<Record<string, boolean>>
}

export const conditionMet = (cond: string, signals: Signals): boolean =>
  cond.startsWith('!') ? !signals[cond.slice(1)] : !!signals[cond]

/** 這一步的轉移條件是否成立 */
export function stepComplete(step: SequenceStep, elapsed: number, signals: Signals): boolean {
  return step.until.every((c) => conditionMet(c, signals)) && elapsed >= (step.delay ?? 0) - 1e-9
}

function enter(seq: Sequence, st: SequencerState, index: number): SequencerTick {
  return { state: { ...st, index, elapsed: 0, waiting: false }, set: seq.steps[index].set }
}

function advance(seq: Sequence, st: SequencerState): SequencerTick {
  const next = st.index + 1
  if (next < seq.steps.length) return enter(seq, st, next)
  const cycles = st.cycles + 1
  if (st.continuous && st.mode === 'auto') return enter(seq, { ...st, cycles }, 0)
  return { state: { ...st, mode: 'off', index: -1, elapsed: 0, waiting: false, cycles } }
}

/** 自動執行：尚未開始時從第 1 步開始，停在中途時從目前步驟繼續 */
export function runSequence(seq: Sequence, st: SequencerState, continuous = st.continuous): SequencerTick {
  if (!seq.steps.length) return { state: st }
  const running = { ...st, mode: 'auto' as const, continuous, waiting: false }
  return st.index < 0 ? enter(seq, running, 0) : { state: running }
}

/** 單步：尚未開始時進入第 1 步；目前步驟的條件成立時進入下一步；否則切成單步模式等條件成立 */
export function stepSequence(seq: Sequence, st: SequencerState, signals: Signals): SequencerTick {
  if (!seq.steps.length) return { state: st }
  const stepping = { ...st, mode: 'step' as const }
  if (st.index < 0) return enter(seq, stepping, 0)
  if (!stepComplete(seq.steps[st.index], st.elapsed, signals)) return { state: { ...stepping, waiting: false } }
  return advance(seq, stepping)
}

/** 停止：保留目前步驟（再按自動從這一步繼續）；輸出保持不變 */
export const stopSequence = (st: SequencerState): SequencerState => ({ ...st, mode: 'off', waiting: false })

/** 每幀呼叫：累計時間，條件成立時進入下一步（單步模式則停住等待） */
export function tickSequence(seq: Sequence, st: SequencerState, signals: Signals, dt: number): SequencerTick {
  if (st.mode === 'off' || st.index < 0 || st.index >= seq.steps.length) return { state: st }
  const elapsed = st.elapsed + Math.max(0, dt)
  if (!stepComplete(seq.steps[st.index], elapsed, signals)) return { state: { ...st, elapsed, waiting: false } }
  if (st.mode === 'step') return { state: st.waiting && st.elapsed === elapsed ? st : { ...st, elapsed, waiting: true } }
  return advance(seq, { ...st, elapsed })
}

// ---------------------------------------------------------------------------------------------
// 動作順序（A+ B+ B- A-）→ 步驟

export interface Motion {
  letter: string
  dir: 1 | -1
}

/** 解讀動作順序：「A+ B+ B- A-」「A+B+B-A-」，括號表示同時動作：「A+ (B+ C+) A-」 */
export function parseNotation(text: string): { groups: Motion[][]; error?: string } {
  const src = text.normalize('NFKC').replace(/[−–—]/g, '-').toUpperCase()
  const groups: Motion[][] = []
  let open: Motion[] | undefined
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (/[\s,，、;；→>]/.test(ch)) {
      i++
      continue
    }
    if (ch === '(' || ch === '（') {
      if (open) return { groups, error: '括號不能重疊' }
      open = []
      i++
      continue
    }
    if (ch === ')' || ch === '）') {
      if (!open) return { groups, error: '多了一個右括號' }
      if (open.length) groups.push(open)
      open = undefined
      i++
      continue
    }
    const m = /^([A-H])\s*([+-])/.exec(src.slice(i))
    if (!m) return { groups, error: `無法解讀「${text.normalize('NFKC').slice(i, i + 3).trim()}」：動作寫成 A+、B- 這樣（氣缸代號 A～H）` }
    const motion: Motion = { letter: m[1], dir: m[2] === '+' ? 1 : -1 }
    if (open) {
      if (open.some((x) => x.letter === motion.letter)) return { groups, error: `同一組動作中氣缸 ${motion.letter} 出現兩次` }
      open.push(motion)
    } else groups.push([motion])
    i += m[0].length
  }
  if (open) return { groups, error: '缺少右括號' }
  if (!groups.length) return { groups, error: '請輸入動作順序，例如 A+ B+ B- A-' }
  return { groups }
}

export const motionLabel = (m: Motion) => `${m.letter}${m.dir > 0 ? '+' : '−'}`

export interface PlanResult {
  steps: SequenceStep[]
  errors: string[]
}

/** 找出驅動某個氣缸埠的閥與閥的埠：沿管線與流量控制元件（速控閥、快速排氣閥…）往回找 */
function drivingValvePort(circuit: Circuit, start: PortKey, reg: ComponentRegistry): { node: string; port: string } | undefined {
  const adjacency = new Map<PortKey, PortKey[]>()
  const link = (a: PortKey, b: PortKey) => {
    adjacency.set(a, [...(adjacency.get(a) ?? []), b])
    adjacency.set(b, [...(adjacency.get(b) ?? []), a])
  }
  for (const t of circuit.tubes) link(t.from, t.to)
  const nodeOf = new Map(circuit.nodes.map((n) => [n.id, n]))
  for (const n of circuit.nodes) {
    const def = reg.get(n.type)
    if (def.category !== 'flow') continue
    const through = def.ports.filter((p) => p.role !== 'vent').map((p) => portKey(n.id, p.id))
    for (let i = 1; i < through.length; i++) link(through[0], through[i])
  }
  const seen = new Set<PortKey>([start])
  const queue = [start]
  while (queue.length) {
    const cur = queue.shift()!
    for (const next of adjacency.get(cur) ?? []) {
      if (seen.has(next)) continue
      seen.add(next)
      const [nodeId, port] = [next.slice(0, next.indexOf(':')), next.slice(next.indexOf(':') + 1)]
      const node = nodeOf.get(nodeId)
      if (node && reg.get(node.type).category === 'valve') {
        if (reg.get(node.type).ports.find((p) => p.id === port)?.role === 'working') return { node: nodeId, port }
        continue
      }
      queue.push(next)
    }
  }
  return undefined
}

/** 要讓閥的某個工作埠有壓，兩側線圈各要 ON 還是 OFF；閥不是電磁閥或線圈沒有命名時回傳錯誤 */
function coilsFor(spec: ValveSpec, params: ReturnType<typeof resolveParams>, port: string): Record<string, boolean> | string {
  const box = spec.boxes.findIndex((passages) => passages.some(([a, b]) => (a === 'P' && b === port) || (a === port && b === 'P')))
  if (box < 0) return `沒有讓 ${port} 供氣的閥位`
  const names = coilNames(spec, params)
  const hasSolenoid = spec.left.includes('solenoid') || spec.right.includes('solenoid')
  if (!hasSolenoid) return '不是電磁閥（由手動、氣控或機械操作）'
  if ((spec.left.includes('solenoid') && !names.l) || (spec.right.includes('solenoid') && !names.r)) return '線圈沒有指定訊號（Y1…）'
  const side = box === 0 ? 'l' : box === spec.boxes.length - 1 ? 'r' : undefined
  const set: Record<string, boolean> = {}
  if (side === 'l') {
    if (names.l) set[names.l] = true
    if (names.r) set[names.r] = false
  } else if (side === 'r') {
    if (spec.right.includes('solenoid')) {
      set[names.r] = true
      if (names.l) set[names.l] = false
    } else if (names.l) set[names.l] = false // 彈簧側：線圈斷電
  } else {
    // 中位
    if (names.l) set[names.l] = false
    if (names.r) set[names.r] = false
  }
  return set
}

/**
 * 由動作順序產生步驟：找出代號為 A、B… 的氣缸（位置感測器）、驅動它的電磁閥與線圈，
 * 「A+」= 讓氣缸 A 伸出的線圈 ON（雙電控時另一側 OFF），等 a1；「A-」同理等 a0。
 * describe 用來在錯誤訊息中顯示元件（例如標號 1V1）。
 */
export function planSequence(
  circuit: Circuit,
  notation: string,
  reg: ComponentRegistry = defaultRegistry,
  describe: (nodeId: string) => string = (id) => id,
): PlanResult {
  const { groups, error } = parseNotation(notation)
  if (error) return { steps: [], errors: [error] }
  const errors: string[] = []
  const cylinders = new Map<string, string>()
  for (const n of circuit.nodes) {
    const def = reg.get(n.type)
    if (def.category !== 'actuator') continue
    const letter = strParam(resolveParams(def, n.params), 'sensor')
    if (letter && !cylinders.has(letter)) cylinders.set(letter, n.id)
  }
  const motionSet = (m: Motion): Record<string, boolean> | undefined => {
    const cyl = cylinders.get(m.letter)
    if (!cyl) {
      errors.push(`找不到代號為 ${m.letter} 的氣缸：在氣缸的「位置感測器」選「氣缸 ${m.letter}」`)
      return undefined
    }
    const node = circuit.nodes.find((n) => n.id === cyl)!
    const ports = reg.get(node.type).ports.map((p) => p.id)
    // 伸出：A 有壓；縮回：B 有壓（單動氣缸沒有 B：讓 A 排氣）
    const target = m.dir > 0 || ports.includes('B') ? (m.dir > 0 ? 'A' : 'B') : 'A'
    const found = drivingValvePort(circuit, portKey(cyl, target), reg)
    if (!found) {
      errors.push(`氣缸 ${m.letter}（${describe(cyl)}）的 ${target} 埠沒有接到方向控制閥`)
      return undefined
    }
    const valve = circuit.nodes.find((n) => n.id === found.node)!
    const spec = (VALVE_SPECS as Readonly<Record<string, ValveSpec>>)[valve.type]
    const coils = spec && coilsFor(spec, resolveParams(reg.get(valve.type), valve.params), found.port)
    if (!coils || typeof coils === 'string') {
      errors.push(`控制氣缸 ${m.letter} 的閥 ${describe(valve.id)}${coils ? `：${coils}` : '不是電磁閥'}`)
      return undefined
    }
    if (m.dir < 0 && target === 'A') {
      // 單動氣缸縮回：把伸出時通電的線圈斷電
      return Object.fromEntries(Object.entries(coils).map(([k, v]) => [k, !v]))
    }
    return coils
  }
  const steps: SequenceStep[] = []
  for (const group of groups) {
    const set: Record<string, boolean> = {}
    for (const m of group) {
      const s = motionSet(m)
      if (!s) continue
      for (const [k, v] of Object.entries(s)) {
        if (k in set && set[k] !== v) errors.push(`同時動作 ${group.map(motionLabel).join(' ')} 需要 ${k} 同時 ON 與 OFF`)
        set[k] = v
      }
    }
    steps.push({
      label: group.map(motionLabel).join(' '),
      set,
      until: group.map((m) => sensorName(m.letter, m.dir > 0 ? 1 : 0)),
    })
  }
  return { steps, errors: [...new Set(errors)] }
}
