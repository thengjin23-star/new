import { setOutputs, step, tickSequence, type Circuit, type Sequence, type SequencerState, type SequencerTick, type SimState } from '../engine'
import { recordTrace, type Trace } from './trace'

/**
 * 模擬＋程序控制＋位移－步驟圖記錄的推進，迴路圖與 3D 模組共用（純函式）。
 */
export interface RunState {
  sim: SimState
  seq: SequencerState
  trace?: Trace
}

/** 推進 dt 秒：模擬一步；程序執行中時更新步驟並設定新一步的輸出；再記錄到位移－步驟圖 */
export function advanceRun(circuit: Circuit, sequence: Sequence, run: RunState, dt: number): RunState {
  let sim = step(circuit, run.sim, dt)
  let seq = run.seq
  if (seq.mode !== 'off') {
    const r = tickSequence(sequence, seq, sim.signals, dt)
    seq = r.state
    if (r.set) sim = setOutputs(circuit, sim, r.set)
  }
  return { sim, seq, trace: run.trace && recordTrace(run.trace, sim, seq, sequence) }
}

/** 套用程序控制的操作結果（自動、單步）：更新狀態、設定新一步的輸出，並記錄 */
export function applySequencerTick(circuit: Circuit, sequence: Sequence, run: RunState, r: SequencerTick): RunState {
  const sim = r.set ? setOutputs(circuit, run.sim, r.set) : run.sim
  return { sim, seq: r.state, trace: run.trace && recordTrace(run.trace, sim, r.state, sequence) }
}
