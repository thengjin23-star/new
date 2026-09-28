import { describe, expect, it } from 'vitest'
import { layoutDiagramSheet } from '../../drawing/diagramSheet'
import { createInitialState, SEQUENCER_IDLE, step, type Sequence, type SequencerState, type SimState } from '../../engine'
import { CIRCUIT_EXAMPLES } from '../../fixtures/examples'
import { toCircuit } from '../flow'
import { createTrace, lastCycle, recordTrace, type Trace } from '../trace'
import { DIAGRAM_LEFT, diagramGeometry } from '../traceDiagram'

const sequence: Sequence = {
  steps: [
    { label: 'A+', set: { Y1: true }, until: ['a1'] },
    { label: 'A−', set: { Y1: false }, until: ['a0'] },
  ],
}

/** 手動組一段記錄：氣缸 A 在 0～1 秒伸出、1～2 秒縮回 */
function syntheticTrace(): Trace {
  let trace: Trace = {
    rows: [
      { key: 'c', label: 'A（1A1）', kind: 'cylinder' },
      { key: 'Y1', label: 'Y1', kind: 'output' },
    ],
    samples: [],
    marks: [],
    lastIndex: -1,
  }
  const at = (t: number, piston: number, y1: boolean, index: number) => {
    const sim = { time: t, componentStates: { c: { piston } }, outputs: { Y1: y1 } } as unknown as SimState
    trace = recordTrace(trace, sim, { ...SEQUENCER_IDLE, index } as SequencerState, sequence)
  }
  at(0, 0, true, 0)
  for (let i = 1; i <= 30; i++) at(i / 30, i / 30, true, 0)
  at(1, 1, false, 1)
  for (let i = 1; i <= 30; i++) at(1 + i / 30, 1 - i / 30, false, 1)
  at(2, 0, false, -1)
  return trace
}

describe('位移－步驟圖的記錄', () => {
  it('氣缸依代號排序、輸出依編號；每 1/30 秒取樣，步驟改變時一定記錄', () => {
    const { nodes, edges } = CIRCUIT_EXAMPLES.find((e) => e.id === 'sequence')!.build()
    const circuit = toCircuit(nodes, edges)
    const sim = step(circuit, createInitialState(circuit), 0)
    let trace = createTrace(nodes, circuit, sim)
    expect(trace.rows.map((r) => r.label)).toEqual(['A（1A1）', 'B（2A1）', 'Y1', 'Y2'])
    const later = { ...sim, time: 0.01 }
    expect(recordTrace(trace, later, SEQUENCER_IDLE, sequence)).toBe(trace)
    trace = recordTrace(trace, later, { ...SEQUENCER_IDLE, index: 0 }, sequence)
    expect(trace.marks).toEqual([{ t: 0.01, index: 0, label: 'A+' }])
    expect(trace.samples).toHaveLength(2)
  })

  it('最近一個循環：每一步的起訖時間', () => {
    const cycle = lastCycle(syntheticTrace(), 2)!
    expect(cycle.complete).toBe(true)
    expect(cycle.steps.map((s) => [s.label, s.t0, s.t1])).toEqual([
      ['A+', 0, 1],
      ['A−', 1, 2],
    ])
  })

  it('步驟圖：每步等寬，氣缸在步驟 1 結束時到達上緣（伸出）', () => {
    const g = diagramGeometry(syntheticTrace(), 'step', 400, 2)
    expect(g.columns.map((c) => c.text)).toEqual(['A+', 'A−'])
    expect(g.lines.filter((l) => l.style === 'step').map((l) => l.label)).toEqual(['1', '2', '3=1'])
    const colW = (g.right - g.left) / 2
    const row = g.rows[0]
    const atEnd = row.points.find(([x]) => Math.abs(x - (DIAGRAM_LEFT + colW)) < 0.5)!
    expect(atEnd[1]).toBeCloseTo(row.top, 5)
    // 輸出畫成方波：Y1 在第 2 步開始時由 ON 變 OFF
    const y1 = g.rows[1]
    expect(y1.points.some(([x, y]) => Math.abs(x - (DIAGRAM_LEFT + colW)) < 0.5 && Math.abs(y - y1.top) < 1e-6)).toBe(true)
  })

  it('時間圖：橫軸為秒，步驟以虛線標示', () => {
    const g = diagramGeometry(syntheticTrace(), 'time', 400, 2)
    expect(g.lines.filter((l) => l.style === 'grid').map((l) => l.label)).toEqual(['0 s', '0.5 s', '1 s', '1.5 s', '2 s'])
    expect(g.lines.filter((l) => l.style === 'mark').map((l) => l.label)).toEqual(['A+', 'A−', undefined])
  })

  it('出圖時優先用最近一個完整的循環（連續循環中途停止）', () => {
    const trace = syntheticTrace()
    const partial = { ...trace, marks: [...trace.marks, { t: 2.1, index: 0, label: 'A+' }] }
    expect(lastCycle(partial, 2.5)!.steps).toHaveLength(1)
    const complete = lastCycle(partial, 2.5, true)!
    expect(complete.complete).toBe(true)
    expect(complete.steps.map((s) => s.label)).toEqual(['A+', 'A−'])
  })

  it('還沒有執行程序時，步驟圖說明原因', () => {
    const trace = { ...syntheticTrace(), marks: [] }
    expect(diagramGeometry(trace, 'step', 400, 2).note).toContain('還沒有執行程序')
  })

  it('出圖：位移－步驟圖的圖紙含圖名、步驟表與曲線', () => {
    const sheet = layoutDiagramSheet({
      paper: 'A4',
      title: { company: { name: '測試公司' }, title: '測試迴路', date: '2026-09-28', sheet: '2/2' },
      geometry: diagramGeometry(syntheticTrace(), 'step', 1100, 2),
      steps: sequence.steps,
    })
    const texts = sheet.primitives.flatMap((p) => (p.kind === 'text' ? [p.text] : []))
    expect(texts).toContain('位移－步驟圖')
    expect(texts).toContain('Y1 ON')
    expect(texts).toContain('a1')
    const curves = sheet.primitives.filter((p) => p.kind === 'polyline' && p.layer === 'OUTLINE')
    expect(curves.length).toBe(2)
    for (const p of sheet.primitives)
      if (p.kind === 'polyline') for (const [x, y] of p.points) expect(x >= 0 && x <= sheet.width && y >= 0 && y <= sheet.height).toBe(true)
  })
})
