import { useEffect } from 'react'
import { saveCircuit } from '../store/circuitFiles'
import { useCircuitStore } from '../store/circuitStore'
import { useCircuitUi } from '../store/circuitUi'

/**
 * 迴路圖的快捷鍵（刪除鍵由 React Flow 處理）：
 * R 旋轉、H 鏡射、Ctrl+Z／Ctrl+Y（Ctrl+Shift+Z）復原／重做、
 * Ctrl+C／V／D 複製／貼上／複製一份、Ctrl+A 全選、Ctrl+S 儲存
 */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (document.querySelector('[role="dialog"]')) return
      const store = useCircuitStore.getState()
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()

      if (mod && !e.altKey) {
        const actions: Record<string, (() => void) | undefined> = {
          z: e.shiftKey ? store.redo : store.undo,
          y: store.redo,
          c: store.copySelected,
          v: store.paste,
          d: store.duplicateSelected,
          a: store.selectAll,
          s: () => {
            if (store.stored) {
              saveCircuit()
                .then(() => useCircuitUi.getState().notify('已儲存'))
                .catch((err: unknown) => useCircuitUi.getState().notify(err instanceof Error ? err.message : String(err), 'error'))
            } else useCircuitUi.getState().openDialog('saveAs')
          },
        }
        const action = actions[key]
        if (!action) return
        e.preventDefault()
        action()
        return
      }
      if (e.altKey || mod) return
      if (key === 'r') store.rotateSelected()
      else if (key === 'h') store.flipSelected()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
