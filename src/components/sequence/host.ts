import { createContext, useContext } from 'react'
import type { PlanResult, Sequence, SequencerState, Signals } from '../../engine'
import type { CircuitSignalNames } from '../../store/circuitSignals'
import type { Trace } from '../../store/trace'

/**
 * 程序控制面板的資料來源：迴路圖與 3D 模組各提供一個 host，面板本身不直接依賴哪個 store。
 */
export interface SequenceView {
  /** 模擬狀態 */
  status: 'idle' | 'running' | 'paused'
  sequence: Sequence
  seq: SequencerState
  signals: Signals
  trace?: Trace
}

export interface SequenceHost {
  /** 訂閱程序相關的狀態；選取多個欄位時以 useShallow 包起來，避免每幀重繪 */
  useView<T>(selector: (v: SequenceView) => T): T
  /** 可用的訊號名稱（感測器、電氣輸出） */
  useNames(): CircuitSignalNames
  auto(): void
  step(): void
  stop(): void
  home(): void
  setContinuous(on: boolean): void
  setSequence(sequence: Sequence): void
  /** 由動作順序產生步驟：成功時直接套用；回傳結果（含錯誤說明） */
  plan(notation: string): PlanResult
  close(): void
  notify(text: string): void
  /** 說明文字中的「迴路」「模組」 */
  scope: string
}

export const SequenceHostContext = createContext<SequenceHost | null>(null)

export function useSequenceHost(): SequenceHost {
  const host = useContext(SequenceHostContext)
  if (!host) throw new Error('SequencePanel 需要 SequenceHostContext')
  return host
}
