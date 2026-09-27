import type { StepMessage, StepRequest } from './step.worker'

export type StepProgress = { stage: 'loading' } | { stage: 'parts'; done: number; total: number }

/** 在背景執行緒產生 STEP 組立檔；signal 中止時立即結束 worker */
export function exportAssemblyStep(request: StepRequest, onProgress: (p: StepProgress) => void, signal?: AbortSignal): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./step.worker.ts', import.meta.url), { type: 'module' })
    const finish = () => {
      worker.terminate()
      signal?.removeEventListener('abort', abort)
    }
    const abort = () => {
      finish()
      reject(new DOMException('已取消', 'AbortError'))
    }
    if (signal?.aborted) return abort()
    signal?.addEventListener('abort', abort)
    worker.onmessage = (event: MessageEvent<StepMessage>) => {
      const m = event.data
      if (m.type === 'loading') onProgress({ stage: 'loading' })
      else if (m.type === 'progress') onProgress({ stage: 'parts', done: m.done, total: m.total })
      else if (m.type === 'done') {
        finish()
        resolve(m.bytes)
      } else {
        finish()
        reject(new Error(m.error))
      }
    }
    worker.onerror = () => {
      finish()
      reject(new Error('STEP 輸出元件載入失敗，請確認網路連線後再試'))
    }
    // 原始檔會被複製一份到 worker（呼叫端的資料不受影響）
    worker.postMessage(request)
  })
}
