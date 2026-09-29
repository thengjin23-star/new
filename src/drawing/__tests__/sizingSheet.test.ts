import { describe, expect, it } from 'vitest'
import { computeSizing, type SizingInput } from '../../sizing/sizing'
import { layoutSizingSheets, sizingRowsPerSheet, sizingSheetCount } from '../sizingSheet'
import type { Sheet } from '../types'

const input = (i: number, load = 0): SizingInput => ({
  id: `c${i}`,
  label: `${String.fromCharCode(65 + (i % 8))}（${i + 1}A1）`,
  letter: String.fromCharCode(65 + (i % 8)),
  model: i === 0 ? 'CDJ2B16-50' : undefined,
  cylinder: { bore: 32, rod: 0, stroke: 100, strokeTime: 1.2 },
  load: { load, loadFactor: 0.5, direction: 'extend' },
  pressure: 0.5,
})

const texts = (s: Sheet) => s.primitives.flatMap((p) => (p.kind === 'text' ? [p.text] : []))

const inBounds = (s: Sheet) => {
  for (const p of s.primitives) {
    const pts = p.kind === 'polyline' ? p.points : p.kind === 'text' ? [p.at] : p.kind === 'circle' ? [p.center] : []
    for (const [x, y] of pts) expect(x >= 0 && x <= s.width && y >= 0 && y <= s.height, `${p.kind} (${x}, ${y})`).toBe(true)
  }
}

describe('選型計算書', () => {
  const title = { company: { name: '測試公司' }, title: '夾持模組', date: '2026-09-28' }

  it('氣缸選型表、耗氣量表、合計與計算說明', () => {
    const summary = computeSizing([input(0, 300), input(1)], { steps: [{ label: 'A+', set: {}, until: [] }, { label: 'A−', set: {}, until: [] }] }, { cyclesPerMinute: 10 })
    const [sheet, ...more] = layoutSizingSheets({ paper: 'A4', title, summary, sheetLabel: () => '3/3' })
    expect(more).toHaveLength(0)
    const t = texts(sheet)
    for (const s of ['選型計算書', '氣缸選型', '耗氣量與配管', 'A（1A1）', 'CDJ2B16-50', 'Ø32 × 100', '不足', 'Ø40', '3/3', '夾持模組（選型計算書）'])
      expect(t, s).toContain(s)
    expect(t.some((x) => x.startsWith('合計：每循環') && x.includes('10 次') && x.includes('NL/min'))).toBe(true)
    // B 不在程序中：伸縮次數加註 *，並有說明
    expect(t).toContain('1／1 *')
    expect(t.some((x) => x.startsWith('* 程序中沒有這支氣缸'))).toBe(true)
    // 迴路圖沒有實際的管：依建議管徑估算
    expect(t.some((x) => x.startsWith('Ø6 × 1 m／條'))).toBe(true)
    inBounds(sheet)
  })

  it('A3 同樣放在圖框內', () => {
    const summary = computeSizing([input(0, 200)])
    const [sheet] = layoutSizingSheets({ paper: 'A3', title, summary })
    expect(sheet.width).toBe(420)
    inBounds(sheet)
  })

  it('氣缸很多時分成多張，合計只在最後一張', () => {
    const per = sizingRowsPerSheet('A4')
    expect(per).toBeGreaterThanOrEqual(6)
    const summary = computeSizing(Array.from({ length: per + 3 }, (_, i) => input(i)))
    expect(sizingSheetCount(summary, 'A4')).toBe(2)
    const sheets = layoutSizingSheets({ paper: 'A4', title, summary, sheetLabel: (p) => `${p + 2}/3` })
    expect(sheets).toHaveLength(2)
    expect(texts(sheets[0]).some((x) => x.startsWith('合計'))).toBe(false)
    expect(texts(sheets[1]).some((x) => x.startsWith('合計'))).toBe(true)
    expect(texts(sheets[0])).toContain('2/3')
    expect(texts(sheets[1])).toContain('3/3')
    for (const s of sheets) inBounds(s)
  })
})
