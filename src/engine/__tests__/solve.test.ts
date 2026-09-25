import { describe, expect, it } from 'vitest'
import { solve } from '../solve'
import type { Circuit } from '../types'
import { acceptanceCircuit } from './fixtures'

const at = (position: 0 | 1) => ({ v: { position } })

describe('solve — 驗收電路', () => {
  it('閥位 0：P→A 有壓、B→EB 排氣', () => {
    const { portStates, tubeStates } = solve(acceptanceCircuit(), at(0))

    expect(portStates['c:A']).toBe('pressure')
    expect(portStates['c:B']).toBe('exhaust')
    expect(tubeStates).toEqual({
      tP: 'pressure',
      tA: 'pressure',
      tB: 'exhaust',
      tEB: 'exhaust',
      // EA 只接著排氣口、沒接其他東西：通大氣
      tEA: 'exhaust',
    })
  })

  it('閥位 1：P→B 有壓、A→EA 排氣', () => {
    const { portStates, tubeStates } = solve(acceptanceCircuit(), at(1))

    expect(portStates['c:A']).toBe('exhaust')
    expect(portStates['c:B']).toBe('pressure')
    expect(tubeStates.tA).toBe('exhaust')
    expect(tubeStates.tB).toBe('pressure')
    expect(tubeStates.tEA).toBe('exhaust')
  })

  it('沒有提供元件狀態時，使用元件的初始狀態（閥位 0）', () => {
    expect(solve(acceptanceCircuit(), {}).portStates['c:A']).toBe('pressure')
  })

  it('每條管線的狀態都等於它兩端埠的狀態', () => {
    for (const position of [0, 1] as const) {
      const circuit = acceptanceCircuit()
      const { portStates, tubeStates } = solve(circuit, at(position))
      for (const tube of circuit.tubes) {
        expect(portStates[tube.from]).toBe(tubeStates[tube.id])
        expect(portStates[tube.to]).toBe(tubeStates[tube.id])
      }
    }
  })
})

describe('solve — 嚴格排氣語意', () => {
  it('EA/EB 未接排氣口時，氣缸的回氣端是封閉而非排氣', () => {
    const { portStates } = solve(acceptanceCircuit({ withExhausts: false }), at(0))

    expect(portStates['c:A']).toBe('pressure')
    expect(portStates['c:B']).toBe('blocked')
    expect(portStates['v:EB']).toBe('blocked')
  })
})

describe('solve — 邊界情況', () => {
  it('沒接任何管線的元件，所有埠都是封閉', () => {
    const { portStates } = solve({ nodes: [{ id: 'c', type: 'cylinderDouble' }], tubes: [] }, {})
    expect(portStates).toEqual({ 'c:A': 'blocked', 'c:B': 'blocked' })
  })

  it('氣源本身的埠即使沒接管線也是有壓', () => {
    const { portStates } = solve({ nodes: [{ id: 's', type: 'airSupply' }], tubes: [] }, {})
    expect(portStates['s:P']).toBe('pressure')
  })

  it('沒有氣源時，接到排氣口的部分為排氣、其餘封閉', () => {
    const circuit = acceptanceCircuit()
    const noSupply: Circuit = {
      nodes: circuit.nodes.filter((n) => n.id !== 'src'),
      tubes: circuit.tubes.filter((t) => t.id !== 'tP'),
    }
    const { portStates } = solve(noSupply, at(0))

    expect(portStates['c:A']).toBe('blocked') // A 接到 P，而 P 什麼都沒接
    expect(portStates['c:B']).toBe('exhaust')
  })

  it('氣源直接接排氣口：有壓優先', () => {
    const { tubeStates } = solve(
      {
        nodes: [
          { id: 's', type: 'airSupply' },
          { id: 'e', type: 'exhaust' },
        ],
        tubes: [{ id: 't', from: 's:P', to: 'e:E' }],
      },
      {},
    )
    expect(tubeStates.t).toBe('pressure')
  })

  it('一個埠可以接多條管線（等同三通接頭）', () => {
    const { portStates } = solve(
      {
        nodes: [
          { id: 's', type: 'airSupply' },
          { id: 'v1', type: 'valve52Manual' },
          { id: 'v2', type: 'valve52Manual' },
        ],
        tubes: [
          { id: 't1', from: 's:P', to: 'v1:P' },
          { id: 't2', from: 's:P', to: 'v2:P' },
        ],
      },
      { v1: { position: 0 }, v2: { position: 1 } },
    )
    expect(portStates['v1:A']).toBe('pressure')
    expect(portStates['v2:B']).toBe('pressure')
    expect(portStates['v2:A']).toBe('blocked')
  })

  it('忽略端點不存在的管線，不丟錯', () => {
    const circuit = acceptanceCircuit()
    const dangling: Circuit = {
      ...circuit,
      tubes: [...circuit.tubes, { id: 'ghost', from: 'v:A', to: 'deleted:P' }],
    }
    const { portStates, tubeStates } = solve(dangling, at(0))

    expect(portStates['c:A']).toBe('pressure')
    expect(portStates['deleted:P']).toBeUndefined()
    expect(tubeStates.ghost).toBe('pressure') // 取自存在的那一端
  })

  it('未知的元件 type 會丟出錯誤', () => {
    expect(() => solve({ nodes: [{ id: 'x', type: 'nope' }], tubes: [] }, {})).toThrow('未知的元件 type')
  })
})
