import { describe, expect, it } from 'vitest'
import { PRODUCTS, valveCylinder, valveIsland } from '../../assembly/__tests__/sampleModules'
import type { ModuleDoc } from '../../assembly/types'
import { CIRCUIT_EXAMPLES } from '../../fixtures/examples'
import { circuitSizingInputs } from '../circuitSizing'
import { moduleSizingInputs } from '../moduleSizing'
import { computeSizing } from '../sizing'

const example = (id: string) => CIRCUIT_EXAMPLES.find((e) => e.id === id)!.build()

describe('迴路圖的選型輸入', () => {
  it('程序範例：兩支氣缸依代號排序，壓力取自氣源', () => {
    const { nodes, edges, sequence } = example('sequence')
    const inputs = circuitSizingInputs(nodes, edges)
    expect(inputs.map((i) => [i.label, i.letter, i.pressure])).toEqual([
      ['A（1A1）', 'A', 0.6],
      ['B（2A1）', 'B', 0.6],
    ])
    const s = computeSizing(inputs, sequence, { cyclesPerMinute: 10 })
    expect(s.rows.every((r) => r.motions.fromSequence && r.motions.extend === 1 && r.motions.retract === 1)).toBe(true)
    expect(s.perMinute).toBeCloseTo(s.perCycle * 10, 9)
  })

  it('三點組合（調壓 0.5 MPa）後的氣缸以 0.5 MPa 計算', () => {
    const { nodes, edges } = example('meter-out')
    expect(circuitSizingInputs(nodes, edges).map((i) => i.pressure)).toEqual([0.5])
  })

  it('5/3 中位封閉時氣缸埠沒有壓力：改用氣源壓力；設定可統一覆寫', () => {
    const { nodes, edges } = example('closed-center')
    expect(circuitSizingInputs(nodes, edges)[0].pressure).toBe(0.6)
    expect(circuitSizingInputs(nodes, edges, { pressure: 0.4 })[0].pressure).toBe(0.4)
  })

  it('負載參數由節點參數讀取', () => {
    const { nodes, edges } = example('manual')
    const withLoad = nodes.map((n) => (n.type === 'pneumatic' && n.data.componentType === 'cylinderDouble' ? { ...n, data: { ...n.data, params: { ...n.data.params, load: 250, loadDir: 'retract' } } } : n))
    expect(circuitSizingInputs(withLoad, edges)[0].load).toEqual({ load: 250, loadFactor: 0.5, direction: 'retract' })
  })
})

describe('3D 模組的選型輸入', () => {
  const withLengths = (doc: ModuleDoc): ModuleDoc => ({ ...doc, tubes: doc.tubes!.map((t) => ({ ...t, length: t.id === 't1' ? 350 : 300 })) })

  it('經過速控閥找到兩側的 PU 管，算出配管容積', () => {
    const b = valveCylinder()
    const [input] = moduleSizingInputs(withLengths(b.doc), PRODUCTS)
    expect(input.label).toBe('DEMO-CYL-16-50')
    expect(input.cylinder).toMatchObject({ bore: 16, stroke: 50 })
    expect(input.pressure).toBe(0.6)
    expect(input.dead!.extend).toBeCloseTo((Math.PI / 4) * 2.5 ** 2 * 350, 6)
    expect(input.dead!.retract).toBeCloseTo((Math.PI / 4) * 2.5 ** 2 * 300, 6)
    expect(input.tubing).toBe('A：Ø4 × 0.35 m；B：Ø4 × 0.30 m')
  })

  it('沒有指定管長時依位置估算；零件的模組參數（代號、負載）一起帶入', () => {
    const b = valveCylinder()
    const doc: ModuleDoc = { ...b.doc, instances: b.doc.instances.map((i) => (i.id === b.ids.c ? { ...i, params: { sensor: 'A', load: 60 } } : i)) }
    const [input] = moduleSizingInputs(doc, PRODUCTS)
    expect(input.dead!.extend).toBeGreaterThan(0)
    expect(input.label).toBe('A（DEMO-CYL-16-50）')
    expect(input.load.load).toBe(60)
  })

  it('沒有氣缸的模組沒有選型項目', () => {
    expect(moduleSizingInputs(valveIsland().doc, PRODUCTS)).toEqual([])
  })
})
