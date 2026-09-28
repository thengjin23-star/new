import { create } from 'zustand'

/** 迴路圖分頁的介面狀態（不存檔） */
export type CircuitDialog = 'files' | 'saveAs' | 'drawing' | undefined

interface CircuitUiState {
  /** 窄螢幕時屬性面板以抽屜方式開關 */
  inspectorOpen: boolean
  /** 畫布下方的程序控制面板 */
  sequenceOpen: boolean
  dialog: CircuitDialog
  /** 右下角短暫提示 */
  toast?: { kind: 'info' | 'error'; text: string }
  toggleInspector(open?: boolean): void
  toggleSequence(open?: boolean): void
  openDialog(dialog: CircuitDialog): void
  notify(text: string, kind?: 'info' | 'error'): void
  dismissToast(): void
}

let toastTimer: ReturnType<typeof setTimeout> | undefined

export const useCircuitUi = create<CircuitUiState>()((set, get) => ({
  inspectorOpen: false,
  sequenceOpen: false,
  dialog: undefined,
  toggleInspector(open) {
    set({ inspectorOpen: open ?? !get().inspectorOpen })
  },
  toggleSequence(open) {
    set({ sequenceOpen: open ?? !get().sequenceOpen })
  },
  openDialog(dialog) {
    set({ dialog })
  },
  notify(text, kind = 'info') {
    clearTimeout(toastTimer)
    set({ toast: { kind, text } })
    toastTimer = setTimeout(() => set({ toast: undefined }), kind === 'error' ? 8000 : 4000)
  },
  dismissToast() {
    set({ toast: undefined })
  },
}))
