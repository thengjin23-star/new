import { ReactFlowProvider } from '@xyflow/react'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { useSimulationLoop } from '../hooks/useSimulationLoop'
import { CircuitCanvas } from './CircuitCanvas'
import { CircuitDialogs, CircuitToast } from './CircuitDialogs'
import { CircuitInspector } from './CircuitInspector'
import { PanelIcon } from './icons'
import { Palette } from './Palette'
import { SequencePanel } from './sequence/SequencePanel'
import { Toolbar } from './Toolbar'
import { useCircuitUi } from '../store/circuitUi'
import { useEffect } from 'react'
import { useCircuitStore } from '../store/circuitStore'

/** 2D 迴路圖編輯與模擬 */
export function CircuitWorkspace() {
  useSimulationLoop()
  useKeyboardShortcuts()
  useTestHook()

  return (
    <ReactFlowProvider>
      <div className="flex h-full flex-col">
        <Toolbar />
        {/* 桌機：左側元件面板、右側屬性面板；手機：元件面板改為底部橫向捲動列，屬性面板為抽屜 */}
        <div className="relative flex min-h-0 flex-1 flex-col-reverse md:flex-row">
          <Palette />
          <main className="relative flex min-h-0 flex-1 flex-col bg-slate-50">
            <div className="relative min-h-0 flex-1">
              <CircuitCanvas />
              <CircuitToast />
              {/* 窄螢幕：屬性面板改為抽屜，以畫布右上角的按鈕開關 */}
              <button
                type="button"
                onClick={() => useCircuitUi.getState().toggleInspector()}
                className="absolute top-2 left-2 z-10 flex h-9 items-center gap-1 rounded-md border border-slate-200 bg-white/95 px-2.5 text-sm text-slate-700 shadow-sm hover:bg-white lg:hidden"
                aria-label="屬性"
                title="屬性面板"
              >
                <PanelIcon />
                屬性
              </button>
            </div>
            <SequencePanel />
          </main>
          <CircuitInspector />
        </div>
        <CircuitDialogs />
      </div>
    </ReactFlowProvider>
  )
}

/** 開發模式專用：讓自動化測試讀取迴路圖的狀態 */
function useTestHook() {
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    w.__pneumaticCircuit = { state: () => useCircuitStore.getState() }
    return () => {
      delete w.__pneumaticCircuit
    }
  }, [])
}
