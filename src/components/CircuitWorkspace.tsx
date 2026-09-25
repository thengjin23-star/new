import { ReactFlowProvider } from '@xyflow/react'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { useSimulationLoop } from '../hooks/useSimulationLoop'
import { CircuitCanvas } from './CircuitCanvas'
import { Palette } from './Palette'
import { Toolbar } from './Toolbar'

/** 2D 迴路圖編輯與模擬（第一階段） */
export function CircuitWorkspace() {
  useSimulationLoop()
  useKeyboardShortcuts()

  return (
    <ReactFlowProvider>
      <div className="flex h-full flex-col">
        <Toolbar />
        {/* 桌機：左側面板；手機：面板改為底部橫向捲動列 */}
        <div className="flex min-h-0 flex-1 flex-col-reverse md:flex-row">
          <Palette />
          <main className="relative min-h-0 flex-1 bg-slate-50">
            <CircuitCanvas />
          </main>
        </div>
      </div>
    </ReactFlowProvider>
  )
}
