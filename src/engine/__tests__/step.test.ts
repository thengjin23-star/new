import { describe, expect, it } from 'vitest'
import type { CylinderState } from '../components/cylinderDouble'
import type { Valve52State } from '../components/valve52Manual'
import { CYLINDER_STROKE_SECONDS } from '../constants'
import { createInitialState, interact, isInteractive, step } from '../step'
import type { Circuit, SimState } from '../types'
import { acceptanceCircuit, FPS, frames } from './fixtures'

function run(circuit: Circuit, state: SimState, seconds: number): SimState {
  let s = state
  for (let i = 0; i < frames(seconds); i++) s = step(circuit, s, 1 / FPS)
  return s
}

const piston = (s: SimState) => (s.componentStates.c as CylinderState).piston
const valve = (s: SimState) => (s.componentStates.v as Valve52State).position

/** 遞迴凍結，用來證明 step 不會修改輸入 */
function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object') {
    Object.values(obj).forEach(deepFreeze)
    Object.freeze(obj)
  }
  return obj
}

describe('驗收情境：氣源 → 5/2 手動閥 → 雙動氣缸', () => {
  it('點閥門 → 氣缸伸出；再點一次 → 縮回', () => {
    const circuit = acceptanceCircuit()
    let s = createInitialState(circuit)

    // 初始閥位 0：P→A。模擬開始後氣缸就會伸出
    s = run(circuit, s, CYLINDER_STROKE_SECONDS + 0.2)
    expect(piston(s)).toBe(1)
    expect(s.tubeStates.tA).toBe('pressure')
    expect(s.tubeStates.tB).toBe('exhaust')

    // 點閥門 → 閥位 1：P→B，氣缸縮回
    s = interact(circuit, s, 'v')
    expect(valve(s)).toBe(1)
    s = run(circuit, s, CYLINDER_STROKE_SECONDS + 0.2)
    expect(piston(s)).toBe(0)
    expect(s.tubeStates.tA).toBe('exhaust')
    expect(s.tubeStates.tB).toBe('pressure')

    // 再點一次 → 回到閥位 0，氣缸再次伸出
    s = interact(circuit, s, 'v')
    s = run(circuit, s, CYLINDER_STROKE_SECONDS + 0.2)
    expect(piston(s)).toBe(1)
  })

  it('活塞平滑移動：跑半個行程時間，位置約在一半', () => {
    const circuit = acceptanceCircuit()
    const s = run(circuit, createInitialState(circuit), CYLINDER_STROKE_SECONDS / 2)
    expect(piston(s)).toBeCloseTo(0.5, 1)
  })

  it('行程中途切換閥門，活塞從目前位置反向', () => {
    const circuit = acceptanceCircuit()
    let s = run(circuit, createInitialState(circuit), CYLINDER_STROKE_SECONDS / 2)
    const mid = piston(s)
    s = interact(circuit, s, 'v')
    s = step(circuit, s, 0.1)
    expect(piston(s)).toBeLessThan(mid)
  })

  it('EA/EB 沒接排氣口時氣缸不會動（嚴格語意）', () => {
    const circuit = acceptanceCircuit({ withExhausts: false })
    const s = run(circuit, createInitialState(circuit), 2)
    expect(piston(s)).toBe(0)
    expect(s.tubeStates.tA).toBe('pressure')
    expect(s.tubeStates.tB).toBe('blocked')
  })
})

describe('step 的純函式性質', () => {
  it('不修改輸入', () => {
    const circuit = deepFreeze(acceptanceCircuit())
    const state = deepFreeze(createInitialState(circuit))
    expect(() => step(circuit, state, 0.1)).not.toThrow()
    expect(piston(state)).toBe(0)
  })

  it('相同輸入得到相同輸出', () => {
    const circuit = acceptanceCircuit()
    const state = run(circuit, createInitialState(circuit), 0.3)
    expect(step(circuit, state, 0.05)).toEqual(step(circuit, state, 0.05))
  })

  it('時間會累加', () => {
    const circuit = acceptanceCircuit()
    expect(step(circuit, createInitialState(circuit), 0.25).time).toBe(0.25)
  })

  it('dt 為負數、NaN 或 0 時不推進', () => {
    const circuit = acceptanceCircuit()
    const state = createInitialState(circuit)
    for (const dt of [-1, Number.NaN, 0]) {
      const next = step(circuit, state, dt)
      expect(next.time).toBe(0)
      expect(piston(next)).toBe(0)
    }
  })

  it('回傳的壓力狀態與回傳的元件狀態一致', () => {
    const circuit = acceptanceCircuit()
    const s = step(circuit, createInitialState(circuit), 0.1)
    expect(s.portStates['c:A']).toBe('pressure')
    expect(s.tubeStates.tP).toBe('pressure')
  })

  it('沒有 update 的元件沿用同一個狀態物件', () => {
    const circuit = acceptanceCircuit()
    const state = createInitialState(circuit)
    expect(step(circuit, state, 0.1).componentStates.v).toBe(state.componentStates.v)
  })
})

describe('createInitialState', () => {
  it('每個元件都是初始狀態，尚未計算壓力', () => {
    const s = createInitialState(acceptanceCircuit())
    expect(s.time).toBe(0)
    expect(valve(s)).toBe(0)
    expect(piston(s)).toBe(0)
    expect(s.portStates).toEqual({})
    expect(s.tubeStates).toEqual({})
  })
})

describe('interact', () => {
  it('切換後立即重算壓力（暫停中點擊也看得到顏色變化）', () => {
    const circuit = acceptanceCircuit()
    const s = interact(circuit, createInitialState(circuit), 'v')
    expect(s.tubeStates.tB).toBe('pressure')
    expect(s.tubeStates.tA).toBe('exhaust')
  })

  it('不可互動的元件：回傳原本的 state', () => {
    const circuit = acceptanceCircuit()
    const state = createInitialState(circuit)
    expect(interact(circuit, state, 'c')).toBe(state)
  })

  it('不存在的元件：回傳原本的 state', () => {
    const circuit = acceptanceCircuit()
    const state = createInitialState(circuit)
    expect(interact(circuit, state, 'nope')).toBe(state)
  })

  it('isInteractive 只對手動閥為真', () => {
    expect(isInteractive('valve52Manual')).toBe(true)
    expect(isInteractive('cylinderDouble')).toBe(false)
    expect(isInteractive('airSupply')).toBe(false)
    expect(isInteractive('nope')).toBe(false)
  })
})
