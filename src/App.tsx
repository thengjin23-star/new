import { ReactFlowProvider } from '@xyflow/react'
import { CircuitCanvas } from './components/CircuitCanvas'
import { Palette } from './components/Palette'
import { Toolbar } from './components/Toolbar'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useSimulationLoop } from './hooks/useSimulationLoop'

export default function App() {
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
