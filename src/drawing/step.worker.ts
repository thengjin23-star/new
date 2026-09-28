/**
 * STEP 組立檔輸出（OpenCascade／replicad，WASM 約 23 MB）：第一次使用時下載，之後由 service worker 快取。
 * 每次輸出使用一個新的 worker，完成或取消後結束，釋放 OpenCascade 佔用的記憶體。
 */
import { setOC } from 'replicad'
import opencascade from 'replicad-opencascadejs'
import wasmUrl from 'replicad-opencascadejs/wasm?url'
import { buildAssemblyStep, type StepPart } from './stepAssembly'

export interface StepRequest {
  files: Record<string, Uint8Array>
  parts: StepPart[]
}

export type StepMessage =
  | { type: 'loading' }
  | { type: 'progress'; done: number; total: number }
  | { type: 'done'; bytes: Uint8Array }
  | { type: 'error'; error: string }

const post = (message: StepMessage, transfer: Transferable[] = []) => self.postMessage(message, { transfer })

self.onmessage = async (event: MessageEvent<StepRequest>) => {
  const { files, parts } = event.data
  try {
    post({ type: 'loading' })
    // OpenCascade 會輸出大量記錄訊息：關掉
    const oc = await opencascade({ locateFile: () => wasmUrl, print: () => undefined, printErr: () => undefined })
    setOC(oc)
    post({ type: 'progress', done: 0, total: parts.length })
    const bytes = await buildAssemblyStep(new Map(Object.entries(files)), parts, (done, total) => post({ type: 'progress', done, total }))
    post({ type: 'done', bytes }, [bytes.buffer])
  } catch (err) {
    post({ type: 'error', error: err instanceof Error ? err.message : String(err) })
  }
}
