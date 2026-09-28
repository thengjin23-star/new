/**
 * 用 HarfBuzz（WebAssembly）把字型縮減成只含用到的字：Noto Sans TC 全檔約 7 MB，
 * 一張圖面通常只用到幾百個字，縮減後約 50–200 KB，PDF 檔才不會太大。
 *
 * harfbuzz-subset.wasm 不需要任何 import，直接用 WebAssembly.instantiate 載入；
 * 純函式，瀏覽器與 Node（測試）都能用。
 */
interface HbExports {
  memory: WebAssembly.Memory
  malloc(size: number): number
  free(ptr: number): void
  hb_blob_create(data: number, length: number, mode: number, userData: number, destroy: number): number
  hb_blob_destroy(blob: number): void
  hb_blob_get_data(blob: number, length: number): number
  hb_blob_get_length(blob: number): number
  hb_face_create(blob: number, index: number): number
  hb_face_destroy(face: number): void
  hb_face_reference_blob(face: number): number
  hb_subset_input_create_or_fail(): number
  hb_subset_input_destroy(input: number): void
  hb_subset_input_unicode_set(input: number): number
  hb_set_add(set: number, codepoint: number): void
  hb_subset_or_fail(face: number, input: number): number
}

const HB_MEMORY_MODE_READONLY = 2

let cached: { wasm: ArrayBuffer | Uint8Array; exports: Promise<HbExports> } | undefined

async function instantiate(wasm: ArrayBuffer | Uint8Array): Promise<HbExports> {
  if (cached?.wasm === wasm) return cached.exports
  const source = WebAssembly.instantiate(wasm as BufferSource) as Promise<WebAssembly.WebAssemblyInstantiatedSource>
  const exports = source.then(({ instance }) => instance.exports as unknown as HbExports)
  cached = { wasm, exports }
  return exports
}

/** 縮減字型：只保留 text 裡出現的字（另外加上空白與常用標點，避免對齊用的字寬缺字） */
export async function subsetFont(wasm: ArrayBuffer | Uint8Array, font: Uint8Array, text: string): Promise<Uint8Array> {
  const hb = await instantiate(wasm)
  const ptr = hb.malloc(font.byteLength)
  new Uint8Array(hb.memory.buffer).set(font, ptr)
  const blob = hb.hb_blob_create(ptr, font.byteLength, HB_MEMORY_MODE_READONLY, 0, 0)
  const face = hb.hb_face_create(blob, 0)
  hb.hb_blob_destroy(blob)
  const input = hb.hb_subset_input_create_or_fail()
  if (!input) {
    hb.hb_face_destroy(face)
    hb.free(ptr)
    throw new Error('字型縮減失敗（記憶體不足）')
  }
  const unicodes = hb.hb_subset_input_unicode_set(input)
  for (const ch of new Set(text + ' 0123456789.-')) hb.hb_set_add(unicodes, ch.codePointAt(0)!)
  const subset = hb.hb_subset_or_fail(face, input)
  hb.hb_subset_input_destroy(input)
  if (!subset) {
    hb.hb_face_destroy(face)
    hb.free(ptr)
    throw new Error('字型縮減失敗')
  }
  const out = hb.hb_face_reference_blob(subset)
  const offset = hb.hb_blob_get_data(out, 0)
  const length = hb.hb_blob_get_length(out)
  // 先複製出來再釋放（memory.buffer 可能在之後的配置中被換掉）
  const result = new Uint8Array(hb.memory.buffer).slice(offset, offset + length)
  hb.hb_blob_destroy(out)
  hb.hb_face_destroy(subset)
  hb.hb_face_destroy(face)
  hb.free(ptr)
  return result
}
