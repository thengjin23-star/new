import { describe, expect, it } from 'vitest'
import { registry, resolveParams, type Sequence } from '../../engine'
import type { Trace } from '../../store/trace'
import {
  compressionRatio,
  computeSizing,
  cycleTimeOf,
  cylinderSpecOf,
  loadSpecOf,
  motionsPerCycle,
  recommendTube,
  sizeAir,
  sizeBore,
  subsonicFactor,
  type CylinderSpec,
  type SizingInput,
} from '../sizing'

const cyl32: CylinderSpec = { bore: 32, rod: 0, stroke: 100, strokeTime: 1.2 }
const noTube = { extend: 0, retract: 0 }

const steps = (...labels: string[]): Sequence => ({ steps: labels.map((label) => ({ label, set: {}, until: [] })) })

describe('選型計算：缸徑', () => {
  it('300 N、負載率 0.5：Ø32 不足（402 N），建議 Ø40（628 N）', () => {
    const r = sizeBore(cyl32, { load: 300, loadFactor: 0.5, direction: 'extend' }, 0.5)!
    expect(r.required).toBeCloseTo(600, 6)
    expect(r.force.extend).toBeCloseTo(402.1, 1)
    expect(r.ratio).toBeCloseTo(0.746, 3)
    expect(r.ok).toBe(false)
    expect(r.recommended).toBe(40)
    expect(r.recommendedForce!.extend).toBeCloseTo(628.3, 1)
  })

  it('縮回方向扣掉活塞桿面積，會選出較大的缸徑；兩方向取較嚴格者', () => {
    const load = { load: 300, loadFactor: 0.5 }
    expect(sizeBore(cyl32, { ...load, direction: 'retract' }, 0.5)!.recommended).toBe(50)
    expect(sizeBore(cyl32, { ...load, direction: 'both' }, 0.5)!.recommended).toBe(50)
  })

  it('負載率夠時判定合格；沒有負載時不檢核', () => {
    expect(sizeBore({ ...cyl32, bore: 50 }, { load: 300, loadFactor: 0.5, direction: 'extend' }, 0.5)!.ok).toBe(true)
    expect(sizeBore(cyl32, { load: 0, loadFactor: 0.5, direction: 'extend' }, 0.5)).toBeUndefined()
  })

  it('單動氣缸只看伸出', () => {
    const r = sizeBore({ ...cyl32, single: true }, { load: 300, loadFactor: 0.5, direction: 'retract' }, 0.5)!
    expect(r.force.retract).toBe(0)
    expect(r.recommended).toBe(40)
  })

  it('由元件參數讀出規格與負載（套用預設值）', () => {
    const params = resolveParams(registry.get('cylinderDouble'), { bore: 40, load: 250, loadDir: 'both' })
    expect(cylinderSpecOf('cylinderDouble', params)).toEqual({ bore: 40, rod: 0, stroke: 100, strokeTime: 1.2, single: false })
    expect(loadSpecOf(params)).toEqual({ load: 250, loadFactor: 0.5, direction: 'both' })
    expect(cylinderSpecOf('cylinderSingle', resolveParams(registry.get('cylinderSingle'), undefined)).single).toBe(true)
  })
})

describe('選型計算：耗氣量、流量、閥與管徑', () => {
  it('Ø32×100、0.5 MPa：每次伸出 0.477 NL、縮回 0.410 NL', () => {
    expect(compressionRatio(0.5)).toBeCloseTo(5.9358, 4)
    const air = sizeAir(cyl32, 0.5, 0.5, noTube)
    expect(air.extend).toBeCloseTo(0.4774, 4)
    expect(air.retract).toBeCloseTo(0.4103, 4)
  })

  it('配管容積：該側管路每次充氣時計入', () => {
    const air = sizeAir(cyl32, 0.5, 0.5, { extend: 10000, retract: 5000 })
    expect(air.tubeExtend).toBeCloseTo(0.01 * compressionRatio(0.5), 6)
    expect(air.extend - sizeAir(cyl32, 0.5, 0.5, noTube).extend).toBeCloseTo(air.tubeExtend, 9)
    expect(air.tubeRetract).toBeCloseTo(0.005 * compressionRatio(0.5), 6)
  })

  it('沒有配管長度時以建議管徑 × 1 m 估算；單動氣缸縮回不耗氣', () => {
    const air = sizeAir(cyl32, 0.5, 0.5)
    expect(air.tube.od).toBe(6)
    expect(air.dead.extend).toBeCloseTo((Math.PI / 4) * 16 * 1000, 3)
    const single = sizeAir({ ...cyl32, single: true }, 0.5, 0.5)
    expect(single.retract).toBe(0)
    expect(single.dead.retract).toBe(0)
  })

  it('所需流量與閥的音速傳導（次音速修正）', () => {
    const air = sizeAir(cyl32, 0.5, 0.5, noTube)
    expect(air.flow.extend).toBeCloseTo(23.87, 2)
    expect(subsonicFactor(0.2)).toBe(1)
    expect(subsonicFactor(1)).toBe(0)
    expect(subsonicFactor(0.35 / 0.6)).toBeCloseTo(0.9144, 4)
    expect(air.valve.C).toBeCloseTo(0.0725, 4)
    expect(air.valve.S).toBeCloseTo(5 * air.valve.C, 9)
    expect(air.valve.Cv).toBeCloseTo(air.valve.S / 18, 9)
  })

  it('管徑：流速不超過 20 m/s，且不小於缸徑的常用配管', () => {
    // 慢速時流速不大，依缸徑的常用配管（Ø32 → Ø6）
    expect(recommendTube(sizeAir(cyl32, 0.5, 0.5, noTube).flow.extend, 0.5, 32).od).toBe(6)
    // 0.2 秒走完 100 mm：Ø6、Ø8 都超過 20 m/s
    const fast = sizeAir({ ...cyl32, strokeTime: 0.2 }, 0.5, 0.5, noTube)
    expect(fast.tube.od).toBe(10)
    expect(fast.tube.velocity).toBeLessThanOrEqual(20)
    expect(recommendTube(1, 0.5, 16).od).toBe(4)
    expect(recommendTube(1, 0.5, 100).od).toBe(12)
  })
})

describe('選型計算：依程序的耗氣量', () => {
  it('每循環的動作次數：讀步驟名稱，沒有名稱時看轉移條件', () => {
    const abba = steps('A+', 'B+', 'B−', 'A−')
    expect(motionsPerCycle(abba, 'A')).toEqual({ extend: 1, retract: 1, fromSequence: true })
    expect(motionsPerCycle(steps('A+', 'A-', 'A+', 'A-'), 'A')).toEqual({ extend: 2, retract: 2, fromSequence: true })
    expect(motionsPerCycle(abba, 'C')).toEqual({ extend: 1, retract: 1, fromSequence: false })
    expect(motionsPerCycle(undefined, 'A').fromSequence).toBe(false)
    const unnamed: Sequence = { steps: [{ set: {}, until: ['b1'] }, { set: {}, until: ['b0', 'a1'] }] }
    expect(motionsPerCycle(unnamed, 'B')).toEqual({ extend: 1, retract: 1, fromSequence: true })
    // 有名稱的步驟不把互鎖條件當成動作
    const interlock: Sequence = { steps: [{ label: 'B+', set: {}, until: ['b1', 'a1'] }] }
    expect(motionsPerCycle(interlock, 'A').fromSequence).toBe(false)
  })

  it('每循環與每分鐘耗氣量；峰值流量取同一步同時動作的氣缸', () => {
    const input = (id: string, letter: string, bore: number): SizingInput => ({
      id,
      label: letter,
      letter,
      cylinder: { ...cyl32, bore },
      load: { load: 0, loadFactor: 0.5, direction: 'extend' },
      pressure: 0.5,
      dead: noTube,
    })
    const inputs = [input('a', 'A', 32), input('b', 'B', 20)]
    const sequential = computeSizing(inputs, steps('A+', 'B+', 'B−', 'A−'), { cyclesPerMinute: 10 })
    const [a, b] = sequential.rows
    expect(sequential.perCycle).toBeCloseTo(a.air.extend + a.air.retract + b.air.extend + b.air.retract, 9)
    expect(sequential.perMinute).toBeCloseTo(sequential.perCycle * 10, 9)
    expect(sequential.peak).toBeCloseTo(a.air.flow.extend, 9)
    const together = computeSizing(inputs, steps('A+ B+', 'A− B−'))
    expect(together.peak).toBeCloseTo(a.air.flow.extend + b.air.flow.extend, 9)
    expect(together.perMinute).toBeUndefined()
    // 沒有程序：全部加總
    expect(computeSizing(inputs).peak).toBeCloseTo(a.air.flow.extend + b.air.flow.extend, 9)
  })

  it('循環時間取模擬中最近一個完整的循環', () => {
    const trace: Trace = {
      rows: [],
      samples: [],
      marks: [
        { t: 0.5, index: 0, label: 'A+' },
        { t: 1.5, index: 1, label: 'A−' },
        { t: 2.7, index: -1, label: '結束' },
      ],
      lastIndex: -1,
    }
    expect(cycleTimeOf(trace, 3)).toBeCloseTo(2.2, 9)
    expect(cycleTimeOf({ ...trace, marks: trace.marks.slice(0, 2) }, 3)).toBeUndefined()
    expect(cycleTimeOf(undefined, 0)).toBeUndefined()
  })
})
