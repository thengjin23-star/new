import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { arrangeBalloons, choosePortView, freeRects, layoutAssemblyDrawing, simplify, type AssemblySheet } from '../assemblyLayout'
import { MARGIN, rectsOverlap, STANDARD_SCALES, type Rect } from '../sheet'
import { sheetToSvg } from '../svg'
import type { Primitive } from '../types'
import { assemblyInput } from './moduleFixture'

/** 設定 SHEET_OUT=目錄 時把 SVG 寫出來，方便人工檢查版面 */
const dump = (name: string, svg: string) => {
  const dir = process.env.SHEET_OUT
  if (dir) writeFileSync(`${dir}/${name}.svg`, svg)
}

const noOverlap = (sheet: AssemblySheet) => {
  for (let i = 0; i < sheet.regions.length; i++) {
    for (let j = i + 1; j < sheet.regions.length; j++) {
      const a = sheet.regions[i]
      const b = sheet.regions[j]
      // 零件表緊貼標題欄（共用邊線），其他區塊不可重疊
      expect(rectsOverlap(a.rect, b.rect, -0.01), `${a.id} × ${b.id}`).toBe(false)
    }
  }
}

const pointsOf = (p: Primitive): [number, number][] => {
  switch (p.kind) {
    case 'polyline':
      return p.points.map(([x, y]) => [x, y])
    case 'circle':
      return [
        [p.center[0] - p.r, p.center[1] - p.r],
        [p.center[0] + p.r, p.center[1] + p.r],
      ]
    case 'text':
    case 'image':
      return [[p.at[0], p.at[1]]]
  }
}

describe('layoutAssemblySheet', () => {
  for (const projection of ['third', 'first'] as const) {
    it(`${projection === 'third' ? '第三角法' : '第一角法'}：所有區塊都在圖框內、互不重疊，比例為標準比例`, () => {
      const drawing = layoutAssemblyDrawing(assemblyInput(projection))
      expect(drawing.sheets).toHaveLength(1)
      const sheet = drawing.sheets[0]
      dump(`assembly-${projection}`, sheetToSvg(sheet))
      expect(drawing.warnings).toEqual([])
      expect(STANDARD_SCALES).toContain(sheet.scale)
      expect(sheet.isoScale).toBeDefined()
      expect(sheet.isoScale!).toBeLessThanOrEqual(sheet.scale)
      const inner: Rect = { x: MARGIN, y: MARGIN, w: sheet.width - 2 * MARGIN, h: sheet.height - 2 * MARGIN }
      for (const { id, rect } of sheet.regions) {
        expect(rect.x, id).toBeGreaterThanOrEqual(inner.x - 1e-6)
        expect(rect.y, id).toBeGreaterThanOrEqual(inner.y - 1e-6)
        expect(rect.x + rect.w, id).toBeLessThanOrEqual(inner.x + inner.w + 1e-6)
        expect(rect.y + rect.h, id).toBeLessThanOrEqual(inner.y + inner.h + 1e-6)
      }
      const ids = sheet.regions.map((r) => r.id)
      expect(ids).toEqual(expect.arrayContaining(['title', 'bom0', 'ports', 'notes', 'view0', 'view1', 'view2', 'iso']))
      noOverlap(sheet)
      for (const p of sheet.primitives) {
        for (const [x, y] of pointsOf(p)) {
          expect(x).toBeGreaterThanOrEqual(0)
          expect(y).toBeGreaterThanOrEqual(0)
          expect(x).toBeLessThanOrEqual(sheet.width)
          expect(y).toBeLessThanOrEqual(sheet.height)
        }
      }
    })
  }

  it('標題欄、零件表、對外接口與尺寸都有寫出來', () => {
    const sheet = layoutAssemblyDrawing(assemblyInput('third')).sheets[0]
    const texts = sheet.primitives.flatMap((p) => (p.kind === 'text' ? [p.text] : []))
    expect(texts).toEqual(expect.arrayContaining(['閥島模組 VI-04', 'VI-2026-001', '第三角法', 'SY5120-5LZD-01', '對外接口', '備註', '前視圖', '右側視圖', '俯視圖']))
    // 外形尺寸：寬 140（含右側消音器）、深 51（含前方接頭）、高 65
    expect(texts).toEqual(expect.arrayContaining(['140', '51', '65']))
    // 比例寫在標題欄
    expect(texts.some((t) => /^\d+(\.\d+)?:\d+(\.\d+)?$/.test(t))).toBe(true)
    // 4 個件號氣球
    const balloons = sheet.primitives.filter((p) => p.kind === 'circle' && p.layer === 'BALLOON' && p.r > 3)
    expect(balloons).toHaveLength(4)
    // 9 個對外接口記號（六角形）
    const tags = sheet.primitives.filter((p) => p.kind === 'polyline' && p.layer === 'BALLOON' && p.points.length === 6)
    expect(tags).toHaveLength(9)
  })

  it('A4 也放得下；不要氣球、尺寸、記號時只有視圖與表格', () => {
    const drawing = layoutAssemblyDrawing(assemblyInput('third', { paper: 'A4', balloons: false, dimensions: false, portTags: false, notes: '' }))
    const sheet = drawing.sheets[0]
    dump('assembly-a4-plain', sheetToSvg(sheet))
    expect(sheet.width).toBe(297)
    expect(drawing.warnings).toEqual([])
    expect(sheet.primitives.some((p) => p.layer === 'DIM')).toBe(false)
    expect(sheet.primitives.some((p) => p.layer === 'BALLOON')).toBe(false)
  })

  it('零件很多時：零件表後段、對外接口表、備註移到第 2 張，第 1 張仍有三視圖', () => {
    const input = assemblyInput('third')
    const bom = Array.from({ length: 45 }, (_, i) => ({ item: i + 1, modelCode: `PART-${i + 1}`, name: `零件 ${i + 1}`, quantity: 1 }))
    const drawing = layoutAssemblyDrawing({ ...input, bom })
    drawing.sheets.forEach((sheet, i) => dump(`assembly-long-bom-${i + 1}`, sheetToSvg(sheet)))
    expect(drawing.sheets).toHaveLength(2)
    expect(drawing.warnings).toEqual([])
    const [first, second] = drawing.sheets
    expect(first.regions.map((r) => r.id)).toEqual(expect.arrayContaining(['view0', 'iso', 'bom0']))
    expect(first.regions.some((r) => r.id === 'ports')).toBe(false)
    expect(second.regions.map((r) => r.id)).toEqual(expect.arrayContaining(['title', 'bom0', 'ports', 'notes']))
    const texts = (sheet: AssemblySheet) => sheet.primitives.flatMap((p) => (p.kind === 'text' ? [p.text] : []))
    expect(texts(first)).toEqual(expect.arrayContaining(['1/2', 'PART-1', '零件表（續）、對外接口表、備註見第 2 張']))
    expect(texts(second)).toEqual(expect.arrayContaining(['2/2', 'PART-45']))
    expect(texts(second)).not.toContain('PART-1')
    noOverlap(first)
    noOverlap(second)
  })

  it('沒有 3D 模型時仍輸出標題欄與零件表', () => {
    const input = assemblyInput('third')
    const empty = { visible: new Float32Array(), hidden: new Float32Array(), bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 }, anchors: [], points: [] }
    const sheet = layoutAssemblyDrawing({ ...input, views: { front: empty, top: empty, side: empty }, ports: [] }).sheets[0]
    const texts = sheet.primitives.flatMap((p) => (p.kind === 'text' ? [p.text] : []))
    expect(texts).toEqual(expect.arrayContaining(['（這個模組沒有 3D 模型可繪製）', 'SY5120-5LZD-01', '—']))
  })
})

describe('版面工具', () => {
  it('freeRects：扣掉右下角的表格後，左側與上方都是空白區', () => {
    const area = { x: 0, y: 0, w: 100, h: 100 }
    const rects = freeRects(area, [{ x: 60, y: 60, w: 40, h: 40 }], 0)
    const has = (r: Rect) => rects.some((q) => Math.abs(q.x - r.x) < 1e-9 && Math.abs(q.y - r.y) < 1e-9 && Math.abs(q.w - r.w) < 1e-9 && Math.abs(q.h - r.h) < 1e-9)
    expect(has({ x: 0, y: 0, w: 60, h: 100 })).toBe(true)
    expect(has({ x: 0, y: 0, w: 100, h: 60 })).toBe(true)
    expect(rects.every((r) => !rectsOverlap(r, { x: 60, y: 60, w: 40, h: 40 }, -1e-9))).toBe(true)
  })

  it('arrangeBalloons：氣球不重疊，而且依方位排列', () => {
    const view = { x: 0, y: 0, w: 100, h: 60 }
    const anchors = Array.from({ length: 12 }, (_, i) => ({ item: i + 1, at: [50 + (i % 3), 30 + i * 0.1] as [number, number] }))
    const placed = arrangeBalloons(view, anchors, 10)
    for (let i = 0; i < placed.length; i++)
      for (let j = i + 1; j < placed.length; j++)
        expect(Math.hypot(placed[i].center[0] - placed[j].center[0], placed[i].center[1] - placed[j].center[1])).toBeGreaterThan(8)
    // 兩個氣球在圈的接縫兩側（±180°）時往兩邊推開，不會卡在一起
    const two = arrangeBalloons(view, [
      { item: 1, at: [-1, 30.1] },
      { item: 2, at: [-1, 29.9] },
    ], 10)
    expect(Math.hypot(two[0].center[0] - two[1].center[0], two[0].center[1] - two[1].center[1])).toBeGreaterThan(8)
  })

  it('simplify：去掉共線點、保留轉角', () => {
    expect(
      simplify(
        [
          [0, 0],
          [1, 0],
          [2, 0.001],
          [3, 0],
          [3, 3],
        ],
        0.01,
      ),
    ).toEqual([
      [0, 0],
      [3, 0],
      [3, 3],
    ])
  })

  it('choosePortView：選埠口正對觀察者的視圖；都看不到時選側向的', () => {
    const port = {
      tag: 1,
      item: 1,
      modelCode: 'X',
      port: 'A',
      spec: '',
      views: {
        front: { x: 0, y: 0, visible: true, dx: 0, dy: 0, facing: 1 },
        top: { x: 0, y: 0, visible: true, dx: 0, dy: -1, facing: 0 },
      },
    }
    expect(choosePortView(port)?.[0]).toBe('front')
    expect(choosePortView({ ...port, views: { ...port.views, front: { ...port.views.front, visible: false } } })?.[0]).toBe('top')
  })
})

describe('layoutAssemblyDrawing：後面接其他圖紙', () => {
  it('張數標示算進後面的圖紙（例如選型計算書）', () => {
    const drawing = layoutAssemblyDrawing({ ...assemblyInput(), extraSheets: 1 })
    expect(drawing.sheets).toHaveLength(1)
    const texts = drawing.sheets[0].primitives.flatMap((p) => (p.kind === 'text' ? [p.text] : []))
    expect(texts).toContain('1/2')
  })
})
