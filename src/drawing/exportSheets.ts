import hbWasmUrl from 'harfbuzzjs/dist/harfbuzz-subset.wasm?url'
import { downloadFile, safeFileName } from '../utils/download'
import { sheetsToDxf } from './dxf'
import { sheetToSvg } from './svg'
import type { Sheet } from './types'

/** PDF 用的中文字型（Noto Sans TC，約 7 MB）：第一次輸出 PDF 時才下載，之後由 service worker 快取 */
const FONT_URL = `${import.meta.env.BASE_URL}fonts/NotoSansTC-Regular.ttf`

let fontFiles: Promise<{ font: Uint8Array; wasm: ArrayBuffer }> | undefined

function loadFontFiles() {
  fontFiles ??= Promise.all([
    fetch(FONT_URL).then((r) => {
      if (!r.ok) throw new Error(`字型下載失敗（${r.status}）`)
      return r.arrayBuffer()
    }),
    fetch(hbWasmUrl).then((r) => {
      if (!r.ok) throw new Error(`字型處理元件下載失敗（${r.status}）`)
      return r.arrayBuffer()
    }),
  ])
    .then(([font, wasm]) => ({ font: new Uint8Array(font), wasm }))
    .catch((err) => {
      fontFiles = undefined
      throw new Error(`無法取得 PDF 中文字型，請確認網路連線後再試（${err instanceof Error ? err.message : err}）`)
    })
  return fontFiles
}

/** 圖紙 → PDF 位元組（字型只嵌入用到的字） */
export async function sheetsPdfBytes(sheets: readonly Sheet[], author?: string): Promise<Uint8Array> {
  const [{ sheetsToPdf, sheetText }, { subsetFont }, files] = await Promise.all([import('./pdf'), import('./fontSubset'), loadFontFiles()])
  const font = await subsetFont(files.wasm, files.font, sheetText(sheets))
  return sheetsToPdf(sheets, { font, author })
}

export async function downloadPdf(sheets: readonly Sheet[], fileBase: string, author?: string) {
  const bytes = await sheetsPdfBytes(sheets, author)
  downloadFile(bytes, `${safeFileName(fileBase)}.pdf`, 'application/pdf')
}

export function downloadDxf(sheets: readonly Sheet[], fileBase: string, font?: string) {
  downloadFile(sheetsToDxf(sheets, { font }), `${safeFileName(fileBase)}.dxf`, 'application/dxf')
}

/** SVG 一張圖紙一個檔案 */
export function downloadSvg(sheets: readonly Sheet[], fileBase: string) {
  sheets.forEach((sheet, i) =>
    downloadFile(sheetToSvg(sheet), `${safeFileName(fileBase)}${sheets.length > 1 ? `-${i + 1}` : ''}.svg`, 'image/svg+xml'),
  )
}
