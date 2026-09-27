import { describe, expect, it } from 'vitest'
import { analyzeEdges, chainSegments, projectView, standardViews } from '../projection'

import { IDENTITY, box, cylinder, segments, totalLength, translate } from './fixtures'

const views = standardViews()

describe('analyzeEdges', () => {
  it('長方體：12 條特徵邊（面與面垂直），沒有輪廓候選以外的邊', () => {
    const b = box(10, 20, 30)
    const edges = analyzeEdges(b.positions, b.indices, b.faceRanges)
    expect(edges.feature.length / 2).toBe(12)
    // 每個面內的對角線是候選輪廓邊
    expect(edges.candidates.length / 4).toBe(6)
    expect(edges.welded.length / 3).toBe(8)
  })

  it('圓柱：側面內的邊是輪廓候選；上下兩圈是特徵邊', () => {
    const c = cylinder(5, 20, 32)
    const edges = analyzeEdges(c.positions, c.indices, c.faceRanges)
    expect(edges.feature.length / 2).toBe(64)
  })
})

describe('projectView', () => {
  it('前視圖：長方體的外框正好是 x ∈ [-5, 5]、z ∈ [-15, 15] 的矩形', () => {
    const v = projectView([{ key: 'b', ...box(10, 20, 30), matrix: IDENTITY, item: 1 }], views.front)
    expect(v.bounds).toMatchObject({ minX: -5, maxX: 5, minY: -15, maxY: 15 })
    const segs = segments(v.visible)
    expect(segs.length).toBeGreaterThan(0)
    const onEdge = (x: number, y: number) => Math.abs(Math.abs(x) - 5) < 1e-4 || Math.abs(Math.abs(y) - 15) < 1e-4
    expect(segs.every(([a, b, c, d]) => onEdge(a, b) && onEdge(c, d))).toBe(true)
    // 前面與後面的四條邊都落在外框上（重疊），總長 = 2 × 周長
    expect(totalLength(v.visible)).toBeCloseTo(2 * (20 + 60), 1)
    expect(v.anchors).toEqual([expect.objectContaining({ item: 1, visible: true })])
  })

  it('被前方零件完全擋住的零件：邊都是隱藏線，也沒有氣球錨點', () => {
    const front = { key: 'big', ...box(40, 10, 40), matrix: translate(0, -20, 0), item: 1 }
    const back = { key: 'small', ...box(10, 10, 10), matrix: translate(0, 20, 0), item: 2 }
    const v = projectView([front, back], views.front)
    const inner = (x: number, y: number) => Math.abs(x) <= 5.01 && Math.abs(y) <= 5.01
    expect(segments(v.visible).some(([a, b, c, d]) => inner(a, b) && inner(c, d))).toBe(false)
    expect(totalLength(v.hidden)).toBeGreaterThan(40 - 0.5)
    expect(v.anchors.map((a) => [a.item, a.visible])).toEqual([
      [1, true],
      [2, false],
    ])
    // 被擋住的零件：錨點取外框中心
    expect(v.anchors[1]).toMatchObject({ x: expect.closeTo(0, 5), y: expect.closeTo(0, 5) })
    const noHidden = projectView([front, back], views.front, { hidden: false })
    expect(noHidden.hidden.length).toBe(0)
  })

  it('指定的點：前方的點看得到、後方被擋住的看不到', () => {
    const v = projectView([{ key: 'b', ...box(10, 20, 30), matrix: IDENTITY, item: 1 }], views.front, {
      points: [
        [0, -10, 0],
        [0, 10, 0],
        [3, -10, 14],
      ],
    })
    expect(v.points.map((p) => p.visible)).toEqual([true, false, true])
    expect(v.points[2]).toMatchObject({ x: expect.closeTo(3, 5), y: expect.closeTo(14, 5) })
  })

  it('等角圖：長方體有 9 條可見邊、3 條隱藏邊', () => {
    const v = projectView([{ key: 'b', ...box(20, 20, 20), matrix: IDENTITY, item: 1 }], views.iso)
    // 正方體等角投影每條邊長 20·√(2/3)；隱藏邊在外框頂點附近約 0.2 mm 會被算成可見（容差）
    const edge = 20 * Math.sqrt(2 / 3)
    expect(Math.abs(totalLength(v.visible) - 9 * edge)).toBeLessThan(1)
    expect(Math.abs(totalLength(v.hidden) - 3 * edge)).toBeLessThan(1)
  })

  it('圓柱前視圖：左右兩條輪廓線、上下兩條端面線', () => {
    const v = projectView([{ key: 'c', ...cylinder(5, 20, 48), matrix: IDENTITY, item: 1 }], views.front)
    const segs = segments(v.visible)
    const vertical = segs.filter(([a, , c]) => Math.abs(a - c) < 0.2 && Math.abs(Math.abs(a) - 5) < 0.2)
    expect(vertical.reduce((s, [a, b, c, d]) => s + Math.hypot(c - a, d - b), 0)).toBeGreaterThan(2 * 20 - 1)
    expect(v.bounds.maxY - v.bounds.minY).toBeCloseTo(20, 3)
  })

  it('圓柱的小平面剛好側向時，輪廓線仍然畫得出來', () => {
    // 6 邊形的圓柱：從 +X 看時有兩個小平面的法向量與視線垂直
    const v = projectView([{ key: 'c6', ...cylinder(5, 20, 6), matrix: IDENTITY, item: 1 }], views.right)
    const edgeX = 5 * Math.sin(Math.PI / 3)
    const vertical = segments(v.visible).filter(([a, , c]) => Math.abs(a - c) < 1e-3 && Math.abs(Math.abs(a) - edgeX) < 1e-3)
    const left = vertical.filter(([a]) => a < 0).reduce((s, [a, b, c, d]) => s + Math.hypot(c - a, d - b), 0)
    const right = vertical.filter(([a]) => a > 0).reduce((s, [a, b, c, d]) => s + Math.hypot(c - a, d - b), 0)
    expect(left).toBeGreaterThan(19.5)
    expect(right).toBeGreaterThan(19.5)
  })

  it('視角：前視圖 x 向右、z 向上；俯視圖正面朝下；右視圖從 +X 看', () => {
    expect(views.front).toEqual({ forward: [0, -1, 0], right: [1, 0, 0], up: [0, 0, 1] })
    expect(views.top.up).toEqual([0, 1, 0])
    expect(views.right.forward).toEqual([1, 0, 0])
    expect(views.right.right).toEqual([0, 1, 0])
  })
})

describe('chainSegments', () => {
  it('四條首尾相接的線段串成一條封閉折線', () => {
    const square = Float32Array.from([0, 0, 1, 0, 1, 0, 1, 1, 1, 1, 0, 1, 0, 1, 0, 0])
    const chains = chainSegments(square)
    expect(chains).toHaveLength(1)
    expect(chains[0]).toHaveLength(10)
  })

  it('分叉處斷開', () => {
    const t = Float32Array.from([0, 0, 1, 0, 1, 0, 2, 0, 1, 0, 1, 1])
    expect(chainSegments(t)).toHaveLength(3)
  })
})
