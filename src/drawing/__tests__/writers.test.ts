import { readFileSync, writeFileSync } from 'node:fs'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { layoutAssemblyDrawing } from '../assemblyLayout'
import { dxfText, sheetToDxf } from '../dxf'
import { subsetFont } from '../fontSubset'
import { sheetsToPdf, sheetText } from '../pdf'
import { sheetToSvg } from '../svg'
import type { Sheet } from '../types'
import { assemblyInput } from './moduleFixture'

const FONT = new Uint8Array(readFileSync('public/fonts/NotoSansTC-Regular.ttf'))
const HB = new Uint8Array(readFileSync('node_modules/harfbuzzjs/dist/harfbuzz-subset.wasm'))
const out = process.env.SHEET_OUT

const small: Sheet = {
  width: 297,
  height: 210,
  scale: 0.5,
  title: '測試圖',
  primitives: [
    { kind: 'polyline', layer: 'OUTLINE', points: [[10, 10], [100, 10], [100, 50]], width: 0.5 },
    { kind: 'polyline', layer: 'HIDDEN', points: [[10, 20], [100, 20]], width: 0.25, dash: [2.5, 1.2] },
    { kind: 'polyline', layer: 'DIM', points: [[0, 0], [3, 1], [3, -1]], width: 0.1, closed: true, fill: '#000000' },
    { kind: 'circle', layer: 'BALLOON', center: [50, 50], r: 4, width: 0.35, fill: '#ffffff' },
    { kind: 'circle', layer: 'BALLOON', center: [60, 60], r: 0.5, width: 0.1, fill: '#000000' },
    { kind: 'text', layer: 'TEXT', at: [50, 50], text: '閥 Ø6 %%c', size: 3.5, align: 'center', valign: 'middle' },
    { kind: 'text', layer: 'DIM', at: [20, 100], text: '65', size: 3.2, align: 'center', valign: 'bottom', angle: 90 },
  ],
}

/** DXF 的「群組碼／值」配對 */
function dxfPairs(dxf: string): [number, string][] {
  const lines = dxf.split(/\r?\n/)
  const pairs: [number, string][] = []
  for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([Number(lines[i]), lines[i + 1]])
  return pairs
}

describe('DXF', () => {
  it('中文字轉成 \\U+XXXX，%% 控制碼加上跳脫', () => {
    expect(dxfText('閥 Ø6')).toBe('\\U+95A5 \\U+00D86')
    expect(dxfText('100%%c')).toBe('100%%%c')
  })

  it('R12 結構：圖層、線型、實體，視圖依比例放大成實際尺寸', () => {
    const dxf = sheetToDxf(small, { font: 'msjh.ttc' })
    const pairs = dxfPairs(dxf)
    expect(pairs[pairs.length - 1]).toEqual([0, 'EOF'])
    const values = (code: number) => pairs.filter(([c]) => c === code).map(([, v]) => v)
    expect(values(1)).toContain('AC1009')
    const entities = pairs.slice(pairs.findIndex(([c, v]) => c === 2 && v === 'ENTITIES'))
    const types = entities.filter(([c]) => c === 0).map(([, v]) => v)
    expect(types.filter((t) => t === 'POLYLINE')).toHaveLength(2) // 折線＋實心圓點
    expect(types.filter((t) => t === 'LINE')).toHaveLength(1)
    expect(types.filter((t) => t === 'SOLID')).toHaveLength(1)
    expect(types.filter((t) => t === 'CIRCLE')).toHaveLength(1)
    expect(types.filter((t) => t === 'TEXT')).toHaveLength(2)
    // 比例 1:2 → 圖紙上 90 mm 的線在 DXF 是 180
    const line = entities.findIndex(([c, v]) => c === 0 && v === 'LINE')
    const lineGroups = Object.fromEntries(entities.slice(line + 1, line + 8))
    expect(Number(lineGroups[11]) - Number(lineGroups[10])).toBeCloseTo(180, 6)
    expect(values(3)).toContain('msjh.ttc')
    for (const layer of ['OUTLINE', 'HIDDEN', 'DIM', 'TEXT', 'TITLE', 'BALLOON']) expect(values(2)).toContain(layer)
    expect(values(1)).toContain('\\U+95A5 \\U+00D86 %%%c')
    // 旋轉的尺寸數字
    expect(values(50)).toContain('90')
    // 只有 ASCII
    expect(/^[\x20-\x7e\r\n]*$/.test(dxf)).toBe(true)
  })
})

describe('SVG', () => {
  it('文字跳脫、旋轉與虛線', () => {
    const svg = sheetToSvg({ ...small, primitives: [...small.primitives, { kind: 'text', layer: 'TEXT', at: [1, 1], text: 'A<B & "C"', size: 3 }] })
    expect(svg).toContain('A&lt;B &amp; &quot;C&quot;')
    expect(svg).toContain('stroke-dasharray="2.5 1.2"')
    expect(svg).toContain('rotate(-90 20 100)')
    expect(svg).toContain('width="297mm" height="210mm"')
  })
})

describe('PDF', () => {
  it('縮減字型後嵌入：檔案小、頁面大小正確、多張圖紙多頁', async () => {
    const drawing = layoutAssemblyDrawing(assemblyInput('third'))
    const sheets = [...drawing.sheets, small]
    const text = sheetText(sheets)
    const font = await subsetFont(HB, FONT, text)
    expect(font.length).toBeLessThan(400_000)
    const pdf = await sheetsToPdf(sheets, { font, author: '王小明' })
    if (out) writeFileSync(`${out}/assembly-third.pdf`, pdf)
    expect(pdf.length).toBeLessThan(1_200_000)
    const doc = await PDFDocument.load(pdf)
    expect(doc.getPageCount()).toBe(2)
    const [w, h] = [doc.getPage(0).getWidth(), doc.getPage(0).getHeight()]
    expect(w).toBeCloseTo((420 * 72) / 25.4, 1)
    expect(h).toBeCloseTo((297 * 72) / 25.4, 1)
    expect(doc.getPage(1).getWidth()).toBeCloseTo((297 * 72) / 25.4, 1)
    expect(doc.getTitle()).toBe('閥島模組 VI-04')
  }, 30_000)

  it('縮減後的字型包含用到的中文字', async () => {
    const font = await subsetFont(HB, FONT, '氣動閥')
    const all = await subsetFont(HB, FONT, '氣動閥島模組組立圖面零件表對外接口規格')
    expect(all.length).toBeGreaterThan(font.length)
    expect(font.length).toBeLessThan(40_000)
  })
})
