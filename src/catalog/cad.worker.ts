/**
 * 在背景執行緒解析 STEP／IGES（occt-import-js，約 7.6 MB 的 WebAssembly），避免畫面卡住。
 * WASM 只在第一次匯入時下載，之後由 service worker 快取。
 */
import occtimportjs from 'occt-import-js'
import wasmUrl from 'occt-import-js/dist/occt-import-js.wasm?url'
import { readCad, type OcctModule } from './cad'
import type { CadFormat } from './types'

export interface CadRequest {
  id: number
  bytes: Uint8Array
  format: CadFormat
}

let occt: Promise<OcctModule> | undefined

self.onmessage = async (event: MessageEvent<CadRequest>) => {
  const { id, bytes, format } = event.data
  try {
    occt ??= occtimportjs({ locateFile: () => wasmUrl })
    const tessellation = readCad(await occt, bytes, format)
    const transfer = tessellation.parts.flatMap((p) => [p.positions.buffer, p.normals.buffer, p.indices.buffer, p.faceRanges.buffer])
    self.postMessage({ id, ok: true, tessellation }, { transfer })
  } catch (err) {
    self.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
