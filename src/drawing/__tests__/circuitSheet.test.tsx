import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CIRCUIT_EXAMPLES } from '../../fixtures/examples'
import { circuitSheetInput } from '../circuitExport'
import { layoutCircuitSheet, nodeMatrix } from '../circuitSheet'
import { sheetToDxf } from '../dxf'
import { sheetToSvg } from '../svg'
import { apply, markupToPrimitives, parseMarkup, pathToPolylines, IDENTITY } from '../svgMarkup'

const title = { company: { name: '公司' }, title: '測試迴路', date: '2026-09-27', customer: '客戶' }

describe('svgMarkup', () => {
  it('解析標記：巢狀 g 的 transform、繼承線寬、略過 title 與註解', () => {
    const prims = markupToPrimitives(
      '<svg><g transform="translate(10 20)" stroke="#123" stroke-width="2"><title>說明</title><line x1="0" y1="0" x2="5" y2="0"></line>' +
        '<rect x="0" y="0" width="4" height="2" fill="white"></rect><text x="1" y="2" font-size="10" text-anchor="middle" dominant-baseline="central">0.50<!-- --> MPa</text></g></svg>',
      IDENTITY,
    )
    expect(prims.map((p) => p.kind)).toEqual(['polyline', 'polyline', 'text'])
    const [line, rect, text] = prims
    expect(line).toMatchObject({ points: [[10, 20], [15, 20]], width: 2 })
    expect(rect).toMatchObject({ closed: true, fill: '#ffffff' })
    expect(text).toMatchObject({ text: '0.50 MPa', at: [11, 22], size: 10, align: 'center', valign: 'middle' })
  })

  it('fill 為 transparent、沒有描邊的形狀不輸出；其他填色改成黑色', () => {
    const prims = markupToPrimitives('<rect width="5" height="5" fill="transparent"></rect><polygon points="0,0 1,0 1,1" fill="#2563eb"></polygon>', IDENTITY)
    expect(prims).toHaveLength(1)
    expect(prims[0]).toMatchObject({ fill: '#000000' })
  })

  it('path：Q 曲線與 A 圓弧近似成折線，端點正確', () => {
    const [q] = pathToPolylines('M 0 0 Q 5 10 10 0')
    expect(q.points[0]).toEqual([0, 0])
    expect(q.points[q.points.length - 1]).toEqual([10, 0])
    const [arc] = pathToPolylines('M 0 -9 A 9 9 0 0 1 0 9 Z')
    expect(arc.closed).toBe(true)
    // 半圓往右凸：最右點約在 x = 9
    expect(Math.max(...arc.points.map((p) => p[0]))).toBeCloseTo(9, 1)
  })

  it('style 中的 CSS transform（閥位視窗的 translateX）優先於 transform 屬性', () => {
    const [line] = markupToPrimitives('<g transform="translate(5 0)" style="transform:translateX(28px);transition:transform 180ms"><line x1="0" y1="0" x2="1" y2="0" stroke="#000"></line></g>', IDENTITY)
    expect(line).toMatchObject({ points: [[28, 0], [29, 0]] })
  })

  it('每個符號畫出來的範圍都在節點外框內（與畫面相同）', () => {
    for (const ex of CIRCUIT_EXAMPLES) {
      const { nodes, edges } = ex.build()
      const input = circuitSheetInput(nodes, edges, { paper: 'A3', title, portLabels: 'letter', showTags: true })
      for (const n of input.nodes) {
        const quarter = n.rotation === 90 || n.rotation === 270
        const [w, h] = quarter ? [n.height, n.width] : [n.width, n.height]
        for (const p of markupToPrimitives(n.markup, nodeMatrix(n)))
          if (p.kind === 'polyline')
            for (const [x, y] of p.points) {
              expect(x, `${n.tag} x`).toBeGreaterThanOrEqual(n.x - 12)
              expect(x, `${n.tag} x`).toBeLessThanOrEqual(n.x + w + 12)
              expect(y, `${n.tag} y`).toBeGreaterThanOrEqual(n.y - 12)
              expect(y, `${n.tag} y`).toBeLessThanOrEqual(n.y + h + 12)
            }
      }
    }
  })

  it('parseMarkup：實體與自閉合標籤', () => {
    const root = parseMarkup('<g a="x &amp; y"><line/><text>A&lt;B</text></g>')
    expect(root.children[0].attrs.a).toBe('x & y')
    expect(root.children[0].children.map((c) => c.tag)).toEqual(['line', 'text'])
    expect(root.children[0].children[1].text).toBe('A<B')
  })

  it('節點轉換：旋轉 90° 時埠的位置與畫面相同', () => {
    // 寬 100、高 40 的符號轉 90° 後外框 40 × 100；原本右上角 (100, 0) 轉到外框右下角
    const m = nodeMatrix({ x: 0, y: 0, width: 100, height: 40, rotation: 90 })
    const [x, y] = apply(m, 100, 0)
    expect(x).toBeCloseTo(40, 9)
    expect(y).toBeCloseTo(100, 9)
    // 鏡射：左上角 (0, 0) 變成右上角
    const f = nodeMatrix({ x: 10, y: 10, width: 100, height: 40, rotation: 0, flip: true })
    expect(apply(f, 0, 0)).toEqual([110, 10])
  })
})

describe('layoutCircuitSheet', () => {
  for (const ex of CIRCUIT_EXAMPLES) {
    it(`範例「${ex.name}」：符號、管線、標號、零件表都在圖紙內`, () => {
      const { nodes, edges } = ex.build()
      const input = circuitSheetInput(nodes, edges, { paper: 'A3', title, portLabels: 'letter', showTags: true, remarks: '使用壓力 0.5 MPa' })
      const sheet = layoutCircuitSheet(input)
      if (process.env.SHEET_OUT) writeFileSync(`${process.env.SHEET_OUT}/circuit-${ex.id}.svg`, sheetToSvg(sheet))
      expect(sheet.factor).toBeGreaterThan(0.1)
      const tubes = sheet.primitives.filter((p) => p.layer === 'TUBE' && p.kind === 'polyline')
      expect(tubes.length).toBeGreaterThanOrEqual(edges.length)
      const texts = sheet.primitives.flatMap((p) => (p.kind === 'text' ? [p.text] : []))
      const tags = nodes.flatMap((n) => (n.type === 'pneumatic' && n.data.tag ? [n.data.tag] : []))
      for (const t of tags) expect(texts).toContain(t)
      expect(texts).toEqual(expect.arrayContaining(['測試迴路', '項次', '標號', '備註', '—']))
      for (const p of sheet.primitives) {
        const pts = p.kind === 'polyline' ? p.points : p.kind === 'circle' ? [p.center] : [p.at]
        for (const [x, y] of pts) {
          expect(x).toBeGreaterThanOrEqual(0)
          expect(x).toBeLessThanOrEqual(420)
          expect(y).toBeGreaterThanOrEqual(0)
          expect(y).toBeLessThanOrEqual(297)
        }
      }
      // 符號的文字保持正立
      expect(sheet.primitives.filter((p) => p.kind === 'text' && p.angle).length).toBe(0)
      expect(sheetToDxf(sheet)).toContain('TUBE')
    })
  }

  it('ISO 數字埠號、A4、不顯示標號', () => {
    const { nodes, edges } = CIRCUIT_EXAMPLES[1].build()
    const sheet = layoutCircuitSheet(circuitSheetInput(nodes, edges, { paper: 'A4', title, portLabels: 'iso', showTags: false }))
    const texts = sheet.primitives.flatMap((p) => (p.kind === 'text' ? [p.text] : []))
    expect(texts).toEqual(expect.arrayContaining(['1', '2', '4']))
    // 標號只出現在零件表，不標在符號旁
    expect(texts.filter((t) => t === '1V1')).toHaveLength(1)
    expect(sheet.width).toBe(297)
  })

  it('空的迴路圖', () => {
    const sheet = layoutCircuitSheet(circuitSheetInput([], [], { paper: 'A3', title, portLabels: 'letter', showTags: true }))
    expect(sheet.primitives.some((p) => p.kind === 'text' && p.text === '（迴路圖是空的）')).toBe(true)
  })
})
