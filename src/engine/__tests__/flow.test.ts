import { describe, expect, it } from 'vitest'
import type { CylinderState } from '../components'
import { CYLINDER_STROKE_SECONDS } from '../constants'
import { widestPaths, type FlowEdge } from '../graph'
import { resolveParams } from '../params'
import { registry } from '../registry'
import { solve } from '../solve'
import { createInitialState, interact, step } from '../step'
import type { Circuit, SimState } from '../types'
import { FPS, frames } from './fixtures'

function run(circuit: Circuit, state: SimState, seconds: number): SimState {
  let s = state
  for (let i = 0; i < frames(seconds); i++) s = step(circuit, s, 1 / FPS)
  return s
}

const piston = (s: SimState, id = 'c') => (s.componentStates[id] as CylinderState).piston

/** 跑到活塞到達 target（或超過 limit 秒），回傳花費秒數 */
function timeUntil(circuit: Circuit, state: SimState, done: (s: SimState) => boolean, limit = 20): number {
  let s = state
  for (let i = 1; i <= limit * FPS; i++) {
    s = step(circuit, s, 1 / FPS)
    if (done(s)) return i / FPS
  }
  return Infinity
}

describe('widestPaths', () => {
  const edge = (to: string, capacity: number): FlowEdge => ({ to, capacity, maxPressure: Infinity })

  it('取沿途最窄處，並在並聯路徑中取較寬的一條', () => {
    const graph = new Map<string, FlowEdge[]>([
      ['s', [edge('a', 0.3), edge('b', 1)]],
      ['a', [edge('t', 1)]],
      ['b', [edge('t', 0.6)]],
      ['t', []],
    ])
    const best = widestPaths(graph, new Map([['s', 1]]), (e) => e.capacity)
    expect(best.get('a')).toBe(0.3)
    expect(best.get('t')).toBe(0.6)
  })

  it('到不了的節點不在結果中；單向邊不能反走', () => {
    const graph = new Map<string, FlowEdge[]>([
      ['s', []],
      ['x', [edge('s', 1)]],
    ])
    expect(widestPaths(graph, new Map([['s', 1]]), (e) => e.capacity).has('x')).toBe(false)
  })
})

describe('單向閥', () => {
  const circuit: Circuit = {
    nodes: [
      { id: 's', type: 'airSupply' },
      { id: 'k', type: 'checkValve' },
      { id: 'e', type: 'exhaust' },
    ],
    tubes: [{ id: 't1', from: 's:P', to: 'k:1' }],
  }

  it('1 → 2 可以通過', () => {
    expect(solve(circuit, {}).portStates['k:2']).toBe('pressure')
  })

  it('2 → 1 不能通過：從 2 側供氣時 1 側無壓', () => {
    const reversed: Circuit = { ...circuit, tubes: [{ id: 't1', from: 's:P', to: 'k:2' }] }
    expect(solve(reversed, {}).portStates['k:1']).toBe('blocked')
  })

  it('排氣也受方向限制：1 側接排氣口時，2 側不能經由它排氣', () => {
    const vent: Circuit = { ...circuit, tubes: [{ id: 't1', from: 'k:1', to: 'e:E' }] }
    const { portStates } = solve(vent, {})
    expect(portStates['k:1']).toBe('exhaust')
    expect(portStates['k:2']).toBe('blocked')
  })
})

/** 氣源 → 5/2 手動閥 → 兩個速度控制閥（排氣節流）→ 雙動氣缸 */
function meterOutCircuit(opening: number): Circuit {
  return {
    nodes: [
      { id: 'src', type: 'airSupply' },
      { id: 'v', type: 'valve52Manual' },
      { id: 'fa', type: 'flowControl', params: { opening } },
      { id: 'fb', type: 'flowControl', params: { opening } },
      { id: 'c', type: 'cylinderDouble' },
      { id: 'ea', type: 'silencer' },
      { id: 'eb', type: 'silencer' },
    ],
    tubes: [
      { id: 'tP', from: 'src:P', to: 'v:P' },
      { id: 'tA1', from: 'v:A', to: 'fa:1' },
      { id: 'tA2', from: 'fa:2', to: 'c:A' },
      { id: 'tB1', from: 'v:B', to: 'fb:1' },
      { id: 'tB2', from: 'fb:2', to: 'c:B' },
      { id: 'tEA', from: 'v:EA', to: 'ea:E' },
      { id: 'tEB', from: 'v:EB', to: 'eb:E' },
    ],
  }
}

describe('速度控制閥（排氣節流）', () => {
  it('進氣自由流動、排氣經節流', () => {
    const { supplyFlow, ventFlow, portStates } = solve(meterOutCircuit(25), {})
    expect(portStates['c:A']).toBe('pressure')
    expect(supplyFlow['c:A']).toBe(1)
    expect(portStates['c:B']).toBe('exhaust')
    expect(ventFlow['c:B']).toBeCloseTo(0.25)
  })

  it('開度越小，伸出越慢（行程時間約為 全開時間 ÷ 開度）', () => {
    const full = meterOutCircuit(100)
    const quarter = meterOutCircuit(25)
    const extended = (s: SimState) => piston(s) >= 1
    const tFull = timeUntil(full, createInitialState(full), extended)
    const tQuarter = timeUntil(quarter, createInitialState(quarter), extended)
    expect(tFull).toBeCloseTo(CYLINDER_STROKE_SECONDS, 1)
    expect(tQuarter).toBeCloseTo(CYLINDER_STROKE_SECONDS * 4, 0)
  })

  it('開度 0 = 關閉：氣缸排氣側被封住而停止', () => {
    const closed = meterOutCircuit(0)
    const s = run(closed, createInitialState(closed), 1)
    expect(s.portStates['c:B']).toBe('blocked')
    expect(piston(s)).toBe(0)
  })

  it('氣缸的 strokeTime 參數改變全開速度', () => {
    const circuit = meterOutCircuit(100)
    const slow: Circuit = {
      ...circuit,
      nodes: circuit.nodes.map((n) => (n.id === 'c' ? { ...n, params: { strokeTime: 2.4 } } : n)),
    }
    const s = run(slow, createInitialState(slow), 1.2)
    expect(piston(s)).toBeCloseTo(0.5, 1)
  })
})

describe('壓力：氣源、調壓閥、壓力錶', () => {
  const circuit = (setting: number, supply = 0.7): Circuit => ({
    nodes: [
      { id: 's', type: 'airSupply', params: { pressure: supply } },
      { id: 'r', type: 'regulator', params: { setting } },
      { id: 'g1', type: 'pressureGauge' },
      { id: 'g2', type: 'pressureGauge' },
    ],
    tubes: [
      { id: 't1', from: 's:P', to: 'r:IN' },
      { id: 't2', from: 's:P', to: 'g1:P' },
      { id: 't3', from: 'r:OUT', to: 'g2:P' },
    ],
  })

  it('調壓閥出口不超過設定值，上游維持氣源壓力', () => {
    const { pressure } = solve(circuit(0.4), {})
    expect(pressure['g1:P']).toBeCloseTo(0.7)
    expect(pressure['g2:P']).toBeCloseTo(0.4)
  })

  it('設定值高於氣源時，出口等於氣源壓力', () => {
    expect(solve(circuit(0.9), {}).pressure['g2:P']).toBeCloseTo(0.7)
  })

  it('無壓的埠壓力為 0', () => {
    const { pressure } = solve({ nodes: [{ id: 'g', type: 'pressureGauge' }], tubes: [] }, {})
    expect(pressure['g:P']).toBe(0)
  })

  it('預設供氣壓力 0.6 MPa', () => {
    expect(solve({ nodes: [{ id: 's', type: 'airSupply' }], tubes: [] }, {}).pressure['s:P']).toBeCloseTo(0.6)
  })
})

describe('參數', () => {
  it('套用預設值並夾在範圍內；未知 key 原樣保留', () => {
    const def = registry.get('flowControl')
    expect(resolveParams(def)).toEqual({ opening: 50 })
    expect(resolveParams(def, { opening: 150, note: 'x' })).toEqual({ opening: 100, note: 'x' })
    expect(resolveParams(def, { opening: 'abc' })).toEqual({ opening: 50 })
  })

  it('相同的覆寫物件重複使用快取結果', () => {
    const def = registry.get('cylinderDouble')
    const overrides = { bore: 40 }
    expect(resolveParams(def, overrides)).toBe(resolveParams(def, overrides))
  })
})

describe('單動氣缸（彈簧復歸）', () => {
  const circuit: Circuit = {
    nodes: [
      { id: 's', type: 'airSupply' },
      { id: 'v', type: 'valve32Button' },
      { id: 'c', type: 'cylinderSingle' },
      { id: 'r', type: 'silencer' },
    ],
    tubes: [
      { id: 't1', from: 's:P', to: 'v:P' },
      { id: 't2', from: 'v:A', to: 'c:A' },
      { id: 't3', from: 'v:R', to: 'r:E' },
    ],
  }

  it('按住按鈕 → 伸出；放開 → 彈簧縮回', () => {
    let s = createInitialState(circuit)
    s = run(circuit, s, 0.5)
    expect(piston(s)).toBe(0)

    s = interact(circuit, s, 'v', undefined, 'press')
    s = run(circuit, s, CYLINDER_STROKE_SECONDS + 0.2)
    expect(piston(s)).toBe(1)

    s = interact(circuit, s, 'v', undefined, 'release')
    expect(s.portStates['c:A']).toBe('exhaust')
    s = run(circuit, s, CYLINDER_STROKE_SECONDS + 0.2)
    expect(piston(s)).toBe(0)
  })
})
