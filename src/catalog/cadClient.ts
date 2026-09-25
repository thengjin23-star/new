import type { CadParser } from './importer'
import type { Tessellation } from './tessellation'

type Reply = { id: number; ok: true; tessellation: Tessellation } | { id: number; ok: false; error: string }

let worker: Worker | undefined
let nextId = 0
const pending = new Map<number, { resolve: (t: Tessellation) => void; reject: (e: Error) => void }>()

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./cad.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<Reply>) => {
    const reply = event.data
    const request = pending.get(reply.id)
    if (!request) return
    pending.delete(reply.id)
    if (reply.ok) request.resolve(reply.tessellation)
    else request.reject(new Error(reply.error))
  }
  worker.onerror = () => {
    for (const request of pending.values()) request.reject(new Error('3D 解析元件載入失敗，請重新整理後再試'))
    pending.clear()
    worker?.terminate()
    worker = undefined
  }
  return worker
}

/** 在 Web Worker 中解析 CAD 檔（bytes 會被複製，呼叫端之後仍可使用原本的陣列） */
export const parseCadInWorker: CadParser = (bytes, format) =>
  new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ id, bytes, format })
  })
