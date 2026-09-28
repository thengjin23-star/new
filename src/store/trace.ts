import { registry, resolveParams, strParam, type Circuit, type Sequence, type SequencerState, type SimState } from '../engine'
import { isPneumaticNode, type CircuitFlowNode } from './flow'

/**
 * 位移－步驟圖的記錄：模擬中每隔一小段時間記下各氣缸的活塞位置與電氣輸出，
 * 以及程序每一步開始的時間（畫步驟圖時用來換算橫軸）。
 */
export interface TraceRow {
  /** 氣缸的節點 id，或輸出名稱（Y1…） */
  key: string
  label: string
  kind: 'cylinder' | 'output'
}

export interface TraceSample {
  t: number
  /** 依 rows 的順序：活塞位置 0～1，或輸出 0／1 */
  v: readonly number[]
}

export interface TraceMark {
  t: number
  /** 進入的步驟（0 起算）；-1 = 一個循環結束 */
  index: number
  label: string
}

export interface Trace {
  rows: readonly TraceRow[]
  samples: readonly TraceSample[]
  marks: readonly TraceMark[]
  /** 上一次記錄時的步驟（偵測步驟變化） */
  lastIndex: number
}

/** 取樣間隔（秒）與最多保留的樣本數（約 2 分鐘） */
export const SAMPLE_INTERVAL = 1 / 30
const MAX_SAMPLES = 3600

const outputNumber = (name: string) => Number(name.replace(/\D/g, '')) || 0

/**
 * 依迴路的元件建立記錄：每支有代號的氣缸一列（依代號排序，沒有代號的排後面），每個電氣輸出一列（依編號）。
 * describe 提供元件的說明（迴路圖的標號、3D 模組的型號），顯示在代號後面。
 */
export function traceFromCircuit(circuit: Circuit, sim: SimState, describe: (nodeId: string) => string | undefined = () => undefined): Trace {
  const cylinders: (TraceRow & { order: string })[] = []
  const outputs = new Set<string>()
  for (const n of circuit.nodes) {
    if (!registry.has(n.type)) continue
    const def = registry.get(n.type)
    const params = resolveParams(def, n.params)
    if (def.category === 'actuator') {
      const letter = strParam(params, 'sensor')
      const text = describe(n.id)
      const label = letter ? `${letter}${text ? `（${text}）` : ''}` : (text ?? def.label)
      cylinders.push({ key: n.id, label, kind: 'cylinder', order: letter || `~${text ?? ''}` })
    }
    for (const key of ['coilL', 'coilR']) {
      const name = strParam(params, key)
      if (name) outputs.add(name)
    }
  }
  const rows: TraceRow[] = [
    ...cylinders.sort((a, b) => a.order.localeCompare(b.order)).map(({ key, label, kind }) => ({ key, label, kind })),
    ...[...outputs].sort((a, b) => outputNumber(a) - outputNumber(b)).map((name): TraceRow => ({ key: name, label: name, kind: 'output' })),
  ]
  return { rows, samples: [sampleOf(rows, sim)], marks: [], lastIndex: -1 }
}

/** 迴路圖：氣缸以標號說明 */
export function createTrace(nodes: readonly CircuitFlowNode[], circuit: Circuit, sim: SimState): Trace {
  const tags = new Map(nodes.flatMap((n) => (isPneumaticNode(n) && n.data.tag ? [[n.id, n.data.tag] as const] : [])))
  return traceFromCircuit(circuit, sim, (id) => tags.get(id))
}

function sampleOf(rows: readonly TraceRow[], sim: SimState): TraceSample {
  return {
    t: sim.time,
    v: rows.map((r) =>
      r.kind === 'cylinder' ? ((sim.componentStates[r.key] as { piston?: number } | undefined)?.piston ?? 0) : sim.outputs[r.key] ? 1 : 0,
    ),
  }
}

/** 加入一個樣本（距離上一個樣本太近時略過，但步驟改變時一定記錄） */
export function recordTrace(trace: Trace, sim: SimState, seq: SequencerState, sequence: Sequence): Trace {
  const stepChanged = seq.index !== trace.lastIndex
  const last = trace.samples[trace.samples.length - 1]
  if (!stepChanged && last && sim.time - last.t < SAMPLE_INTERVAL - 1e-9) return trace
  const samples = [...trace.samples, sampleOf(trace.rows, sim)]
  const marks = stepChanged
    ? [...trace.marks, { t: sim.time, index: seq.index, label: seq.index >= 0 ? (sequence.steps[seq.index]?.label ?? `${seq.index + 1}`) : '結束' }]
    : trace.marks
  return {
    ...trace,
    samples: samples.length > MAX_SAMPLES ? samples.slice(-MAX_SAMPLES) : samples,
    marks,
    lastIndex: seq.index,
  }
}

/** 最近一個（完成或進行中的）程序循環：步驟的起訖時間 */
export interface TraceCycle {
  steps: { index: number; label: string; t0: number; t1: number }[]
  /** 循環已結束 */
  complete: boolean
}

export function lastCycle(trace: Trace, now: number, preferComplete = false): TraceCycle | undefined {
  const marks = trace.marks
  const cycleAt = (start: number): TraceCycle => {
    const steps: TraceCycle['steps'] = []
    let complete = false
    for (let i = start; i < marks.length; i++) {
      const m = marks[i]
      if (m.index < 0 || (i > start && m.index === 0)) {
        complete = true
        break
      }
      const next = marks[i + 1]
      steps.push({ index: m.index, label: m.label, t0: m.t, t1: next ? next.t : now })
    }
    return { steps, complete }
  }
  let latest: TraceCycle | undefined
  for (let i = marks.length - 1; i >= 0; i--) {
    if (marks[i].index !== 0) continue
    const cycle = cycleAt(i)
    latest ??= cycle
    // 出圖時優先用最近一個完整的循環（例如連續循環中途停止時）
    if (!preferComplete || cycle.complete) return cycle
  }
  return latest
}
