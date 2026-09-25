import { useEffect } from 'react'
import { useCircuitStore } from '../store/circuitStore'

/** R：旋轉選取的元件（刪除鍵由 React Flow 處理） */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (e.key === 'r' || e.key === 'R') useCircuitStore.getState().rotateSelected()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
