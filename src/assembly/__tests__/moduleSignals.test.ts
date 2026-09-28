import { describe, expect, it } from 'vitest'
import {
  createInitialState,
  fillSignalNames,
  planSequence,
  portKey,
  registry,
  runSequence,
  SEQUENCER_IDLE,
  step,
  traceLine,
  type Params,
} from '../../engine'
import { isPneumaticNode } from '../../store/flow'
import { circuitFromModule } from '../../store/fromModule'
import { advanceRun, applySequencerTick, type RunState } from '../../store/sequenceRun'
import { traceFromCircuit } from '../../store/trace'
import { deriveModuleCircuit } from '../moduleCircuit'
import { ensureModuleSignals } from '../moduleSignals'
import type { ModuleDoc } from '../types'
import { PRODUCTS, valveCylinder, valveIsland } from './sampleModules'

const withParams = (doc: ModuleDoc, id: string, params: Params): ModuleDoc => ({
  ...doc,
  instances: doc.instances.map((i) => (i.id === id ? { ...i, params: { ...i.params, ...params } } : i)),
})

describe('模組的訊號名稱', () => {
  it('補上氣缸代號與線圈輸出；已補齊時回傳同一個物件', () => {
    const b = valveCylinder()
    const doc = ensureModuleSignals(b.doc, PRODUCTS)
    const params = (id: string) => doc.instances.find((i) => i.id === id)?.params
    expect(params(b.ids.c)).toEqual({ sensor: 'A' })
    expect(params(b.ids.v)).toEqual({ coilL: 'Y1' })
    // 其他零件（接頭、速控閥、消音器）沒有訊號參數
    expect(params(b.ids.sa)).toBeUndefined()
    expect(ensureModuleSignals(doc, PRODUCTS)).toBe(doc)
  })

  it('閥島：依欄的順序編號 Y1、Y2', () => {
    const b = valveIsland()
    const doc = ensureModuleSignals(b.doc, PRODUCTS)
    expect(doc.instances.find((i) => i.id === b.ids.v1)?.params).toEqual({ coilL: 'Y1' })
    expect(doc.instances.find((i) => i.id === b.ids.v2)?.params).toEqual({ coilL: 'Y2' })
  })

  it('已經寫明的名稱（包括刻意留空）不改，缺少的跳過已用的名稱', () => {
    const b = valveIsland()
    let doc = withParams(b.doc, b.ids.v2, { coilL: 'Y1' })
    doc = ensureModuleSignals(doc, PRODUCTS)
    expect(doc.instances.find((i) => i.id === b.ids.v1)?.params).toEqual({ coilL: 'Y2' })
    expect(doc.instances.find((i) => i.id === b.ids.v2)?.params).toEqual({ coilL: 'Y1' })

    const manual = withParams(b.doc, b.ids.v1, { coilL: '' })
    const filled = ensureModuleSignals(manual, PRODUCTS)
    expect(filled.instances.find((i) => i.id === b.ids.v1)?.params).toEqual({ coilL: '' })
    expect(filled.instances.find((i) => i.id === b.ids.v2)?.params).toEqual({ coilL: 'Y1' })
  })

  it('零件在模組中的參數覆蓋產品的參數', () => {
    const b = valveCylinder()
    const mc = deriveModuleCircuit(withParams(b.doc, b.ids.c, { sensor: 'C', stroke: 40 }), PRODUCTS)
    expect(mc.circuit.nodes.find((n) => n.id === b.ids.c)?.params).toMatchObject({ bore: 16, stroke: 40, sensor: 'C' })
  })

  it('產生迴路圖時保留模組的名稱，缺少的依欄的順序補上', () => {
    const b = valveCylinder()
    const doc = withParams(b.doc, b.ids.c, { sensor: 'C' })
    const out = circuitFromModule(deriveModuleCircuit(doc, PRODUCTS), doc, PRODUCTS)
    const nodes = out.nodes.filter(isPneumaticNode)
    expect(nodes.find((n) => n.data.componentType === 'cylinderDouble')?.data.params).toMatchObject({ sensor: 'C' })
    expect(nodes.find((n) => n.data.componentType === 'valve52Single')?.data.params).toMatchObject({ coilL: 'Y1' })
  })

  it('fillSignalNames：預設值沒被用過時優先使用（壓力開關 PS1）', () => {
    const r = fillSignalNames([
      { id: 's1', type: 'pressureSwitch' },
      { id: 's2', type: 'pressureSwitch', params: { signal: 'PS3' } },
      { id: 's3', type: 'pressureSwitch' },
    ])
    expect(r.get('s1')).toEqual({ signal: 'PS1' })
    expect(r.has('s2')).toBe(false)
    expect(r.get('s3')).toEqual({ signal: 'PS2' })
  })
})

describe('3D 模組執行程序', () => {
  it('由氣缸埠經過速控閥找到驅動它的閥埠，並列出沿途的埠', () => {
    const b = valveCylinder()
    const mc = deriveModuleCircuit(b.doc, PRODUCTS)
    const line = traceLine(mc.circuit, portKey(b.ids.c, 'A'))
    expect(line.valve).toEqual({ node: b.ids.v, port: 'A' })
    expect(line.ports).toContain(portKey(b.ids.c, 'A'))
    expect(line.ports.some((k) => k.startsWith(`${b.ids.sa}:`) || k.startsWith(`${b.ids.sb}:`))).toBe(true)
    expect(line.ports.some((k) => k.startsWith(`${b.ids.v}:`))).toBe(false)
  })

  it('A+ A-：依程序自動跑完一個循環，位移－步驟圖記下每一步', () => {
    const b = valveCylinder()
    const doc = ensureModuleSignals(b.doc, PRODUCTS)
    const mc = deriveModuleCircuit(doc, PRODUCTS)
    const plan = planSequence(mc.circuit, 'A+ A-', registry)
    expect(plan.errors).toEqual([])
    expect(plan.steps.map((s) => [s.label, s.set, s.until])).toEqual([
      ['A+', { Y1: true }, ['a1']],
      ['A−', { Y1: false }, ['a0']],
    ])
    const sequence = { steps: plan.steps }
    const sim = step(mc.circuit, createInitialState(mc.circuit), 0)
    let run: RunState = { sim, seq: SEQUENCER_IDLE, trace: traceFromCircuit(mc.circuit, sim, (id) => (id === b.ids.c ? 'DEMO-CYL-16-50' : undefined)) }
    expect(run.trace!.rows.map((r) => r.label)).toEqual(['A（DEMO-CYL-16-50）', 'Y1'])
    run = applySequencerTick(mc.circuit, sequence, run, runSequence(sequence, run.seq))
    let extended = false
    for (let i = 0; i < 400 && run.seq.cycles === 0; i++) {
      run = advanceRun(mc.circuit, sequence, run, 0.02)
      extended ||= !!run.sim.signals.a1
    }
    expect(extended).toBe(true)
    expect(run.seq).toMatchObject({ mode: 'off', index: -1, cycles: 1 })
    expect(run.sim.signals.a0).toBe(true)
    expect(run.trace!.marks.map((m) => m.label)).toEqual(['A+', 'A−', '結束'])
  })
})
