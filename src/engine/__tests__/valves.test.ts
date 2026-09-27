import { describe, expect, it } from 'vitest'
import { VALVE_SPECS, type ValveState } from '../components'
import { solve } from '../solve'
import { createInitialState, interact } from '../step'
import type { Circuit, PortState, SimState } from '../types'

/** 氣源接 P、排氣口接所有排氣埠、A/B 接壓力錶，方便觀察各埠狀態 */
function bench(type: string, portSet: 5 | 3 | 2): Circuit {
  const nodes = [
    { id: 's', type: 'airSupply' },
    { id: 'v', type },
    { id: 'ga', type: 'pressureGauge' },
  ]
  const tubes = [
    { id: 'tP', from: 's:P', to: 'v:P' },
    { id: 'tA', from: 'v:A', to: 'ga:P' },
  ]
  if (portSet === 5) {
    nodes.push({ id: 'gb', type: 'pressureGauge' }, { id: 'ea', type: 'silencer' }, { id: 'eb', type: 'silencer' })
    tubes.push(
      { id: 'tB', from: 'v:B', to: 'gb:P' },
      { id: 'tEA', from: 'v:EA', to: 'ea:E' },
      { id: 'tEB', from: 'v:EB', to: 'eb:E' },
    )
  }
  if (portSet === 3) {
    nodes.push({ id: 'r', type: 'silencer' })
    tubes.push({ id: 'tR', from: 'v:R', to: 'r:E' })
  }
  return { nodes, tubes }
}

const ab = (s: SimState): [PortState, PortState] => [s.portStates['v:A'], s.portStates['v:B']]
const valve = (s: SimState) => s.componentStates.v as ValveState

function start(type: string, portSet: 5 | 3 | 2) {
  const circuit = bench(type, portSet)
  const initial = createInitialState(circuit)
  const act = (s: SimState, action?: string) => interact(circuit, s, 'v', undefined, action)
  return { circuit, s: { ...initial, ...solve(circuit, initial.componentStates) }, act }
}

describe('5/2 單電控閥', () => {
  it('靜止（斷電）：P→B、A→EA（ISO 1→2）', () => {
    const { s } = start('valve52Single', 5)
    expect(ab(s)).toEqual(['exhaust', 'pressure'])
  })

  it('點線圈通電：P→A；再點一次斷電，彈簧復歸', () => {
    const { s, act } = start('valve52Single', 5)
    const on = act(s, 'coil:l')
    expect(valve(on).coils?.l).toBe(true)
    expect(ab(on)).toEqual(['pressure', 'exhaust'])
    const off = act(on, 'coil:l')
    expect(ab(off)).toEqual(['exhaust', 'pressure'])
  })

  it('點本體與點線圈效果相同', () => {
    const { s, act } = start('valve52Single', 5)
    expect(ab(act(s))).toEqual(['pressure', 'exhaust'])
  })
})

describe('5/2 雙電控閥（記憶）', () => {
  it('點左線圈 → P→A 並保持；點右線圈 → P→B', () => {
    const { s, act } = start('valve52Double', 5)
    const left = act(s, 'coil:l')
    expect(ab(left)).toEqual(['pressure', 'exhaust'])
    expect(act(left, 'coil:l')).toBe(left) // 已在該閥位：狀態不變
    expect(ab(act(left, 'coil:r'))).toEqual(['exhaust', 'pressure'])
  })
})

describe('5/3 閥的三種中位', () => {
  it.each`
    type                 | a             | b
    ${'valve53Closed'}   | ${'blocked'}  | ${'blocked'}
    ${'valve53Exhaust'}  | ${'exhaust'}  | ${'exhaust'}
    ${'valve53Pressure'} | ${'pressure'} | ${'pressure'}
  `('$type：中位 A=$a、B=$b', ({ type, a, b }) => {
    const { s } = start(type, 5)
    expect(valve(s).position).toBe(1)
    expect(ab(s)).toEqual([a, b])
  })

  it('左線圈 → P→A；再點一次回中位；右線圈 → P→B', () => {
    const { s, act } = start('valve53Closed', 5)
    const left = act(s, 'coil:l')
    expect(ab(left)).toEqual(['pressure', 'exhaust'])
    expect(ab(act(left, 'coil:l'))).toEqual(['blocked', 'blocked'])
    const right = act(left, 'coil:r')
    expect(valve(right).coils).toEqual({ l: false, r: true })
    expect(ab(right)).toEqual(['exhaust', 'pressure'])
  })

  it('點本體輪流：中位 → 左 → 中位 → 右 → 中位', () => {
    const { s, act } = start('valve53Exhaust', 5)
    const positions: number[] = []
    let cur = s
    for (let i = 0; i < 5; i++) {
      cur = act(cur)
      positions.push(valve(cur).position)
    }
    expect(positions).toEqual([0, 1, 2, 1, 0])
  })
})

describe('3/2 與 2/2 閥', () => {
  it('3/2 常閉：靜止 A→R 排氣；通電 P→A', () => {
    const { s, act } = start('valve32NC', 3)
    expect(s.portStates['v:A']).toBe('exhaust')
    expect(act(s, 'coil:l').portStates['v:A']).toBe('pressure')
  })

  it('3/2 常開：靜止 P→A；通電 A→R', () => {
    const { s, act } = start('valve32NO', 3)
    expect(s.portStates['v:A']).toBe('pressure')
    expect(act(s, 'coil:l').portStates['v:A']).toBe('exhaust')
  })

  it('2/2 常閉：靜止 A 封閉；通電 P→A', () => {
    const { s, act } = start('valve22NC', 2)
    expect(s.portStates['v:A']).toBe('blocked')
    expect(act(s, 'coil:l').portStates['v:A']).toBe('pressure')
  })

  it('按鈕閥：按住作動、放開復歸；重複放開不改變狀態', () => {
    const { s, act } = start('valve32Button', 3)
    const pressed = act(s, 'press')
    expect(pressed.portStates['v:A']).toBe('pressure')
    const released = act(pressed, 'release')
    expect(released.portStates['v:A']).toBe('exhaust')
    expect(act(released, 'release')).toBe(released)
    // 放開後瀏覽器送出的點擊不會再把按鈕按下
    expect(act(released, 'toggle')).toBe(released)
  })
})

describe('閥規格', () => {
  it.each(Object.values(VALVE_SPECS).map((spec) => [spec.type, spec] as const))(
    '%s：方格數與閥位對應正確，初始閥位的方格存在',
    (_, spec) => {
      const count = spec.boxes.length
      expect(count).toBeGreaterThanOrEqual(2)
      const map: readonly number[] = 'positionBox' in spec ? spec.positionBox : [...Array(count).keys()]
      expect(map.length).toBe(count)
      expect(map[spec.rest]).toBeLessThan(count)
    },
  )
})
