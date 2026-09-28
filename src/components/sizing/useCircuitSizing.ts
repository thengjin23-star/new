import { useMemo } from 'react'
import { circuitSizingInputs } from '../../sizing/circuitSizing'
import { computeSizing, cycleTimeOf, type SizingSummary } from '../../sizing/sizing'
import { useCircuitStore } from '../../store/circuitStore'

/** 目前迴路圖的選型計算（元件、管線、程序或選型設定改變時重新計算） */
export function useCircuitSizing(): SizingSummary {
  const nodes = useCircuitStore((s) => s.nodes)
  const edges = useCircuitStore((s) => s.edges)
  const sequence = useCircuitStore((s) => s.sequence)
  const settings = useCircuitStore((s) => s.info.sizing)
  return useMemo(() => computeSizing(circuitSizingInputs(nodes, edges, settings), sequence, settings), [nodes, edges, sequence, settings])
}

/** 模擬中最近一個完整程序循環的時間（秒） */
export function useCircuitCycleTime(): number | undefined {
  const trace = useCircuitStore((s) => s.trace)
  return useMemo(() => cycleTimeOf(trace, trace?.samples[trace.samples.length - 1]?.t ?? 0), [trace])
}
