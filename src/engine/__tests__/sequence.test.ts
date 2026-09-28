import { describe, expect, it } from 'vitest'
import {
  parseNotation,
  planSequence,
  runSequence,
  SEQUENCER_IDLE,
  stepSequence,
  stopSequence,
  tickSequence,
  type Sequence,
  type SequencerState,
} from '../sequence'
import { createInitialState, setOutputs, step } from '../step'
import type { Circuit, SimState, Tube } from '../types'
import { FPS } from './fixtures'

/** 兩支雙動氣缸 A、B，各由一顆 5/2 單電控閥（Y1、Y2）控制；A 的閥經速度控制閥接到氣缸 */
function twoCylinders(valveB = 'valve52Single', paramsB: Record<string, string> = { coilL: 'Y2' }): Circuit {
  const tubes: Tube[] = []
  const t = (from: string, to: string) => tubes.push({ id: `t${tubes.length}`, from, to })
  t('s:P', 'va:P')
  t('s:P', 'vb:P')
  t('va:A', 'fa:1')
  t('fa:2', 'ca:A')
  t('va:B', 'ca:B')
  t('vb:A', 'cb:A')
  t('vb:B', 'cb:B')
  for (const v of ['va', 'vb']) {
    t(`${v}:EA`, `${v}ea:E`)
    t(`${v}:EB`, `${v}eb:E`)
  }
  return {
    nodes: [
      { id: 's', type: 'airSupply' },
      { id: 'va', type: 'valve52Single', params: { coilL: 'Y1' } },
      { id: 'vb', type: valveB, params: paramsB },
      { id: 'fa', type: 'flowControl', params: { opening: 100 } },
      { id: 'ca', type: 'cylinderDouble', params: { sensor: 'A', strokeTime: 0.5 } },
      { id: 'cb', type: 'cylinderDouble', params: { sensor: 'B', strokeTime: 0.5 } },
      ...['vaea', 'vaeb', 'vbea', 'vbeb'].map((id) => ({ id, type: 'silencer' })),
    ],
    tubes,
  }
}

/** 模擬＋程序控制，記錄每一步開始的時間與兩支氣缸的位置 */
function runWithSequence(circuit: Circuit, seq: Sequence, seconds: number, continuous = false) {
  let sim: SimState = step(circuit, createInitialState(circuit), 0)
  const start = runSequence(seq, SEQUENCER_IDLE, continuous)
  let st: SequencerState = start.state
  if (start.set) sim = setOutputs(circuit, sim, start.set)
  const entered: { index: number; time: number }[] = [{ index: 0, time: 0 }]
  const pos = (id: string) => (sim.componentStates[id] as { piston: number }).piston
  const history: { a: number; b: number }[] = []
  for (let i = 0; i < seconds * FPS; i++) {
    sim = step(circuit, sim, 1 / FPS)
    const r = tickSequence(seq, st, sim.signals, 1 / FPS)
    if (r.state.index !== st.index && r.state.index >= 0) entered.push({ index: r.state.index, time: sim.time })
    st = r.state
    if (r.set) sim = setOutputs(circuit, sim, r.set)
    history.push({ a: pos('ca'), b: pos('cb') })
  }
  return { sim, st, entered, history }
}

describe('動作順序', () => {
  it('解讀 A+ B+ B- A-（大小寫、全形、連寫、括號同時動作）', () => {
    expect(parseNotation('A+ B+ B- A-').groups).toHaveLength(4)
    expect(parseNotation('a+b+b−a−').groups.map((g) => g.map((m) => `${m.letter}${m.dir}`))).toEqual([['A1'], ['B1'], ['B-1'], ['A-1']])
    expect(parseNotation('Ａ＋ （B+ C-） A-').groups.map((g) => g.length)).toEqual([1, 2, 1])
    expect(parseNotation('A+ X+').error).toContain('無法解讀')
    expect(parseNotation('(A+ A-)').error).toContain('出現兩次')
    expect(parseNotation('  ').error).toContain('請輸入')
  })

  it('由迴路找出線圈：單電控 A+ = Y1 ON、A- = Y1 OFF；雙電控另一側 OFF', () => {
    const plan = planSequence(twoCylinders('valve52Double', { coilL: 'Y2', coilR: 'Y3' }), 'A+ B+ B- A-')
    expect(plan.errors).toEqual([])
    expect(plan.steps).toEqual([
      { label: 'A+', set: { Y1: true }, until: ['a1'] },
      { label: 'B+', set: { Y2: true, Y3: false }, until: ['b1'] },
      { label: 'B−', set: { Y3: true, Y2: false }, until: ['b0'] },
      { label: 'A−', set: { Y1: false }, until: ['a0'] },
    ])
  })

  it('找不到氣缸、線圈沒有命名、閥不是電磁閥時說明原因', () => {
    const circuit = twoCylinders('valve52Single', {})
    expect(planSequence(circuit, 'C+').errors[0]).toContain('找不到代號為 C 的氣缸')
    expect(planSequence(circuit, 'B+', undefined, (id) => (id === 'vb' ? '2V1' : id)).errors[0]).toBe('控制氣缸 B 的閥 2V1：線圈沒有指定訊號（Y1…）')
    expect(planSequence(twoCylinders('valve52Manual', {}), 'B+').errors[0]).toContain('不是電磁閥')
  })
})

describe('程序控制', () => {
  const seq: Sequence = planSequence(twoCylinders(), 'A+ B+ B- A-')

  it('A+ B+ B- A-：依序動作，一個循環後停在原點', () => {
    const { st, entered, history, sim } = runWithSequence(twoCylinders(), seq, 4)
    expect(entered.map((e) => e.index)).toEqual([0, 1, 2, 3])
    expect(st).toMatchObject({ mode: 'off', index: -1, cycles: 1 })
    expect(sim.signals).toMatchObject({ a0: true, b0: true, Y1: false, Y2: false })
    // 氣缸 A 伸出到底之後 B 才開始動；B 回到原點之後 A 才縮回
    const firstB = history.findIndex((h) => h.b > 0)
    expect(history[firstB - 1].a).toBe(1)
    const aBack = history.findIndex((h, i) => i > firstB && h.a < 1)
    expect(history[aBack - 1].b).toBe(0)
    // 每一步約 0.5 秒（行程時間）
    expect(entered[3].time).toBeGreaterThan(1.4)
    expect(entered[3].time).toBeLessThan(1.7)
  })

  it('連續循環', () => {
    const { st } = runWithSequence(twoCylinders(), seq, 5, true)
    expect(st.cycles).toBeGreaterThanOrEqual(2)
    expect(st.mode).toBe('auto')
  })

  it('計時條件：這一步至少停留設定的秒數', () => {
    const timed: Sequence = { steps: [{ ...seq.steps[0], delay: 1 }, seq.steps[3]] }
    const { entered } = runWithSequence(twoCylinders(), timed, 3)
    expect(entered[1].time).toBeGreaterThan(0.99)
    expect(entered[1].time).toBeLessThan(1.05)
  })

  it('單步：條件成立後停住，按單步才進入下一步；停止後可從同一步繼續', () => {
    const circuit = twoCylinders()
    let sim = step(circuit, createInitialState(circuit), 0)
    let r = stepSequence(seq, SEQUENCER_IDLE, sim.signals)
    expect(r.state).toMatchObject({ mode: 'step', index: 0 })
    sim = setOutputs(circuit, sim, r.set!)
    let st = r.state
    for (let i = 0; i < FPS; i++) {
      sim = step(circuit, sim, 1 / FPS)
      st = tickSequence(seq, st, sim.signals, 1 / FPS).state
    }
    expect(st).toMatchObject({ index: 0, waiting: true })
    r = stepSequence(seq, st, sim.signals)
    expect(r.state.index).toBe(1)
    expect(r.set).toEqual({ Y2: true })
    // 停止 → 自動：從第 2 步繼續
    const resumed = runSequence(seq, stopSequence(r.state))
    expect(resumed.state).toMatchObject({ mode: 'auto', index: 1 })
    expect(resumed.set).toBeUndefined()
  })
})
