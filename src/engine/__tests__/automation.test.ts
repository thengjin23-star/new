import { describe, expect, it } from 'vitest'
import type { ValveState } from '../components'
import { createInitialState, interact, setOutputs, step } from '../step'
import type { Circuit, SimState, Tube } from '../types'
import { FPS, frames } from './fixtures'

const t = (id: string, from: string, to: string): Tube => ({ id, from, to })

const run = (circuit: Circuit, s: SimState, seconds: number) => {
  for (let i = 0; i < frames(seconds); i++) s = step(circuit, s, 1 / FPS)
  return s
}
const start = (circuit: Circuit) => step(circuit, createInitialState(circuit), 0)
const piston = (s: SimState, id = 'c') => (s.componentStates[id] as { piston: number }).piston

/** 氣源 → 5/2 閥 → 雙動氣缸（感測器 A），閥的 EA/EB 接消音器 */
function cylinderBench(valve: { type: string; params?: Record<string, string | number> }): Circuit {
  return {
    nodes: [
      { id: 's', type: 'airSupply' },
      { id: 'v', ...valve },
      { id: 'c', type: 'cylinderDouble', params: { sensor: 'A' } },
      { id: 'ea', type: 'silencer' },
      { id: 'eb', type: 'silencer' },
    ],
    tubes: [t('tP', 's:P', 'v:P'), t('tA', 'v:A', 'c:A'), t('tB', 'v:B', 'c:B'), t('tEA', 'v:EA', 'ea:E'), t('tEB', 'v:EB', 'eb:E')],
  }
}

describe('氣缸位置感測器', () => {
  it('縮回端 a0、伸出端 a1；中途兩個都不成立', () => {
    const circuit = cylinderBench({ type: 'valve52Single', params: { coilL: 'Y1' } })
    let s = start(circuit)
    // 還沒設定過的輸出不在訊號中（視為 OFF）
    expect(s.signals).toEqual({ a0: true, a1: false })
    s = setOutputs(circuit, s, { Y1: true })
    s = run(circuit, s, 0.5)
    expect(piston(s)).toBeGreaterThan(0.1)
    expect(piston(s)).toBeLessThan(0.9)
    expect(s.signals).toMatchObject({ a0: false, a1: false, Y1: true })
    s = run(circuit, s, 1.5)
    expect(s.signals).toMatchObject({ a0: false, a1: true })
  })

  it('沒有指定氣缸代號時不產生訊號', () => {
    const circuit = cylinderBench({ type: 'valve52Single' })
    circuit.nodes = circuit.nodes.map((n) => (n.id === 'c' ? { id: 'c', type: 'cylinderDouble' } : n))
    expect(start(circuit).signals).toEqual({})
  })
})

describe('有命名的電磁線圈（電氣輸出）', () => {
  it('單電控閥跟著 Y1：ON 伸出、OFF 彈簧復歸', () => {
    const circuit = cylinderBench({ type: 'valve52Single', params: { coilL: 'Y1' } })
    let s = setOutputs(circuit, start(circuit), { Y1: true })
    expect((s.componentStates.v as ValveState).coils?.l).toBe(true)
    expect(s.portStates['v:A']).toBe('pressure')
    s = run(circuit, s, 2)
    expect(piston(s)).toBe(1)
    s = setOutputs(circuit, s, { Y1: false })
    expect(s.portStates['v:B']).toBe('pressure')
    expect(piston(run(circuit, s, 2))).toBe(0)
  })

  it('點有命名的線圈 = 切換輸出；接在同一個輸出的另一顆閥一起動作', () => {
    const circuit = cylinderBench({ type: 'valve52Single', params: { coilL: 'Y1' } })
    circuit.nodes = [...circuit.nodes, { id: 'v2', type: 'valve32NC', params: { coilL: 'Y1' } }]
    let s = start(circuit)
    s = interact(circuit, s, 'v', undefined, 'coil:l')
    expect(s.outputs).toEqual({ Y1: true })
    expect((s.componentStates.v2 as ValveState).position).toBe(0)
    s = interact(circuit, s, 'v', undefined, 'coil:l')
    expect(s.outputs).toEqual({ Y1: false })
    expect((s.componentStates.v2 as ValveState).position).toBe(1)
  })

  it('雙電控閥：Y1 → P→A 並保持；Y1、Y2 都通電時維持原閥位', () => {
    const circuit = cylinderBench({ type: 'valve52Double', params: { coilL: 'Y1', coilR: 'Y2' } })
    let s = setOutputs(circuit, start(circuit), { Y1: true })
    expect(s.portStates['v:A']).toBe('pressure')
    s = setOutputs(circuit, s, { Y1: false })
    expect(s.portStates['v:A']).toBe('pressure')
    s = setOutputs(circuit, s, { Y1: true, Y2: true })
    expect(s.portStates['v:A']).toBe('pressure')
    s = setOutputs(circuit, s, { Y1: false })
    expect(s.portStates['v:B']).toBe('pressure')
  })

  it('雙電控閥點線圈：點左 → Y1 ON、Y2 OFF；點右 → 相反', () => {
    const circuit = cylinderBench({ type: 'valve52Double', params: { coilL: 'Y1', coilR: 'Y2' } })
    let s = interact(circuit, start(circuit), 'v', undefined, 'coil:l')
    expect(s.outputs).toEqual({ Y1: true, Y2: false })
    expect(s.portStates['v:A']).toBe('pressure')
    s = interact(circuit, s, 'v', undefined, 'coil:r')
    expect(s.outputs).toEqual({ Y1: false, Y2: true })
    expect(s.portStates['v:B']).toBe('pressure')
  })

  it('5/3 閥：兩個線圈都斷電回到中位', () => {
    const circuit = cylinderBench({ type: 'valve53Closed', params: { coilL: 'Y1', coilR: 'Y2' } })
    let s = setOutputs(circuit, start(circuit), { Y2: true })
    expect(s.portStates['v:B']).toBe('pressure')
    s = setOutputs(circuit, s, { Y2: false })
    expect((s.componentStates.v as ValveState).position).toBe(1)
    expect(s.portStates['v:B']).toBe('blocked')
  })

  it('沒有命名的線圈維持原本的手動操作', () => {
    const circuit = cylinderBench({ type: 'valve52Single' })
    const s = interact(circuit, start(circuit), 'v', undefined, 'coil:l')
    expect(s.outputs).toEqual({})
    expect(s.portStates['v:A']).toBe('pressure')
  })
})

describe('氣控閥', () => {
  /** 按鈕 3/2 閥的 A 接到氣控閥的先導埠 */
  function pilotBench(type: string, pilots: Record<string, string>): Circuit {
    const circuit = cylinderBench({ type })
    return {
      nodes: [...circuit.nodes, ...Object.keys(pilots).map((id) => ({ id, type: 'valve32Button' })), { id: 'r', type: 'silencer' }],
      tubes: [
        ...circuit.tubes,
        ...Object.entries(pilots).flatMap(([id, port]) => [t(`p${id}`, 's:P', `${id}:P`), t(`x${id}`, `${id}:A`, `v:${port}`), t(`r${id}`, `${id}:R`, 'r:E')]),
      ],
    }
  }

  it('單氣控：14 有壓 → P→A；洩壓 → 彈簧復歸', () => {
    const circuit = pilotBench('valve52Pilot', { b1: '14' })
    let s = start(circuit)
    expect(s.portStates['v:B']).toBe('pressure')
    s = interact(circuit, s, 'b1', undefined, 'press')
    expect(s.portStates['v:14']).toBe('pressure')
    s = step(circuit, s, 1 / FPS)
    expect(s.portStates['v:A']).toBe('pressure')
    s = interact(circuit, s, 'b1', undefined, 'release')
    s = step(circuit, s, 1 / FPS)
    expect(s.portStates['v:B']).toBe('pressure')
  })

  it('雙氣控（記憶）：14 脈衝 → P→A 並保持；12 脈衝 → P→B', () => {
    const circuit = pilotBench('valve52DoublePilot', { b1: '14', b2: '12' })
    const pulse = (s: SimState, id: string) => {
      s = step(circuit, interact(circuit, s, id, undefined, 'press'), 1 / FPS)
      return step(circuit, interact(circuit, s, id, undefined, 'release'), 1 / FPS)
    }
    let s = pulse(start(circuit), 'b1')
    expect(s.portStates['v:A']).toBe('pressure')
    s = pulse(s, 'b2')
    expect(s.portStates['v:B']).toBe('pressure')
  })
})

describe('邏輯元件', () => {
  /** 兩個按鈕閥 → 邏輯閥 X、Y → 出口 A 接壓力錶 */
  function logicBench(type: string): Circuit {
    return {
      nodes: [
        { id: 's', type: 'airSupply' },
        { id: 'bx', type: 'valve32Button' },
        { id: 'by', type: 'valve32Button' },
        { id: 'l', type },
        { id: 'g', type: 'pressureGauge' },
        { id: 'rx', type: 'silencer' },
        { id: 'ry', type: 'silencer' },
      ],
      tubes: [
        t('1', 's:P', 'bx:P'),
        t('2', 's:P', 'by:P'),
        t('3', 'bx:A', 'l:X'),
        t('4', 'by:A', 'l:Y'),
        t('5', 'l:A', 'g:P'),
        t('6', 'bx:R', 'rx:E'),
        t('7', 'by:R', 'ry:E'),
      ],
    }
  }
  const truth = (type: string) => {
    const circuit = logicBench(type)
    const out = (pressX: boolean, pressY: boolean) => {
      let s = start(circuit)
      if (pressX) s = interact(circuit, s, 'bx', undefined, 'press')
      if (pressY) s = interact(circuit, s, 'by', undefined, 'press')
      s = step(circuit, s, 1 / FPS)
      return s.portStates['l:A']
    }
    return [out(false, false), out(true, false), out(false, true), out(true, true)]
  }

  it('梭動閥（OR）真值表', () => {
    expect(truth('shuttleValve')).toEqual(['exhaust', 'pressure', 'pressure', 'pressure'])
  })

  it('雙壓閥（AND）真值表', () => {
    expect(truth('twoPressureValve')).toEqual(['exhaust', 'exhaust', 'exhaust', 'pressure'])
  })

  it('雙壓閥：只按一邊時，出口在任何時刻都沒有壓力（沒有一幀的誤動作）', () => {
    const circuit = logicBench('twoPressureValve')
    let s = start(circuit)
    for (const [id, action] of [
      ['bx', 'press'],
      ['bx', 'release'],
      ['by', 'press'],
      ['by', 'release'],
      ['bx', 'press'],
    ] as const) {
      s = interact(circuit, s, id, undefined, action)
      expect(s.portStates['l:A']).not.toBe('pressure')
      s = step(circuit, s, 1 / FPS)
      expect(s.portStates['l:A']).not.toBe('pressure')
    }
    // 另一邊也按下：出口有壓；放開其中一邊立即洩壓
    s = interact(circuit, s, 'by', undefined, 'press')
    expect(s.portStates['l:A']).toBe('pressure')
    s = interact(circuit, s, 'bx', undefined, 'release')
    expect(s.portStates['l:A']).toBe('exhaust')
  })

  it('快速排氣閥：P 洩壓時 A 直接由 R 排氣，不經過方向閥', () => {
    const circuit: Circuit = {
      nodes: [
        { id: 's', type: 'airSupply' },
        { id: 'v', type: 'valve32NC', params: { coilL: 'Y1' } },
        { id: 'q', type: 'quickExhaust' },
        { id: 'c', type: 'cylinderSingle' },
      ],
      // 方向閥的排氣口沒有接：只能經快速排氣閥排氣
      tubes: [t('1', 's:P', 'v:P'), t('2', 'v:A', 'q:P'), t('3', 'q:A', 'c:A')],
    }
    let s = setOutputs(circuit, start(circuit), { Y1: true })
    expect(s.portStates['c:A']).toBe('pressure')
    s = run(circuit, s, 2)
    expect(piston(s)).toBe(1)
    s = setOutputs(circuit, s, { Y1: false })
    expect(s.portStates['c:A']).toBe('exhaust')
    expect(s.portStates['v:A']).toBe('blocked')
    expect(piston(run(circuit, s, 2))).toBe(0)
  })

  it('延時閥：先導壓力持續到設定時間才作動，洩壓立即復歸', () => {
    const circuit: Circuit = {
      nodes: [
        { id: 's', type: 'airSupply' },
        { id: 'b', type: 'valve32Button' },
        { id: 'd', type: 'valve32Timer', params: { delay: 1.5 } },
        { id: 'g', type: 'pressureGauge' },
        { id: 'r', type: 'silencer' },
      ],
      tubes: [t('1', 's:P', 'b:P'), t('2', 'b:A', 'd:12'), t('3', 's:P', 'd:P'), t('4', 'd:A', 'g:P'), t('5', 'b:R', 'r:E')],
    }
    let s = interact(circuit, start(circuit), 'b', undefined, 'press')
    s = run(circuit, s, 1.3)
    expect(s.portStates['d:A']).not.toBe('pressure')
    s = run(circuit, s, 0.3)
    expect(s.portStates['d:A']).toBe('pressure')
    s = step(circuit, interact(circuit, s, 'b', undefined, 'release'), 1 / FPS)
    expect(s.portStates['d:A']).not.toBe('pressure')
    expect((s.componentStates.d as ValveState).elapsed).toBe(0)
  })

  it('壓力開關：壓力達到設定值時輸出 PS1', () => {
    const circuit: Circuit = {
      nodes: [
        { id: 's', type: 'airSupply', params: { pressure: 0.6 } },
        { id: 'reg', type: 'regulator', params: { setting: 0.3 } },
        { id: 'ps', type: 'pressureSwitch', params: { setpoint: 0.4 } },
      ],
      tubes: [t('1', 's:P', 'reg:IN'), t('2', 'reg:OUT', 'ps:P')],
    }
    expect(start(circuit).signals).toEqual({ PS1: false })
    circuit.tubes = [t('1', 's:P', 'ps:P')]
    expect(start(circuit).signals).toEqual({ PS1: true })
  })
})

describe('滾輪閥', () => {
  it('氣缸到達 a1 時壓下滾輪 → 雙氣控閥的 12 有壓 → 氣缸自動縮回', () => {
    // 按鈕 → 14：伸出；a1 滾輪閥 → 12：縮回（單一氣缸自動往復）
    const circuit: Circuit = {
      nodes: [
        { id: 's', type: 'airSupply' },
        { id: 'v', type: 'valve52DoublePilot' },
        { id: 'c', type: 'cylinderDouble', params: { sensor: 'A' } },
        { id: 'ea', type: 'silencer' },
        { id: 'eb', type: 'silencer' },
        { id: 'start', type: 'valve32Button' },
        { id: 'a1', type: 'valve32Roller', params: { trigger: 'a1' } },
        { id: 'r1', type: 'silencer' },
        { id: 'r2', type: 'silencer' },
      ],
      tubes: [
        t('1', 's:P', 'v:P'),
        t('2', 'v:A', 'c:A'),
        t('3', 'v:B', 'c:B'),
        t('4', 'v:EA', 'ea:E'),
        t('5', 'v:EB', 'eb:E'),
        t('6', 's:P', 'start:P'),
        t('7', 'start:A', 'v:14'),
        t('8', 'start:R', 'r1:E'),
        t('9', 's:P', 'a1:P'),
        t('10', 'a1:A', 'v:12'),
        t('11', 'a1:R', 'r2:E'),
      ],
    }
    let s = interact(circuit, start(circuit), 'start', undefined, 'press')
    s = run(circuit, s, 0.2)
    s = interact(circuit, s, 'start', undefined, 'release')
    let peak = 0
    let back = false
    for (let i = 0; i < frames(4); i++) {
      s = step(circuit, s, 1 / FPS)
      peak = Math.max(peak, piston(s))
      if (peak === 1 && piston(s) === 0) back = true
    }
    expect(peak).toBe(1)
    expect(back).toBe(true)
    expect((s.componentStates.a1 as ValveState).position).toBe(1)
  })
})
