import { describe, expect, it } from 'vitest'
import { manifoldLayout } from '../../catalog/manifold'
import { createInitialState, interact, portKey, step } from '../../engine'
import { deriveModuleCircuit, SUPPLY_NODE } from '../moduleCircuit'
import { builder, portId, PRODUCTS, valveCylinder, valveIsland } from './sampleModules'

describe('manifoldLayout', () => {
  it('範例集裝座：共用 P／EA／EB，4 站各有 A、B', () => {
    const layout = manifoldLayout(PRODUCTS['DEMO-MANIFOLD-4'])!
    const name = (id?: string) => PRODUCTS['DEMO-MANIFOLD-4'].ports.find((p) => p.id === id)?.name
    expect([name(layout.common.P), name(layout.common.EA), name(layout.common.EB)]).toEqual(['P', 'EA', 'EB'])
    expect(layout.stations.map((s) => [s.number, name(s.mount), name(s.A), name(s.B)])).toEqual([
      [1, '站1', 'A1', 'B1'],
      [2, '站2', 'A2', 'B2'],
      [3, '站3', 'A3', 'B3'],
      [4, '站4', 'A4', 'B4'],
    ])
  })
})

describe('deriveModuleCircuit', () => {
  it('閥島：底板式閥經由集裝座接到供氣與消音器；線圈通電後 A／B 互換', () => {
    const b = valveIsland()
    const mc = deriveModuleCircuit(b.doc, PRODUCTS)
    const types = mc.circuit.nodes.map((n) => n.type).sort()
    expect(types).toEqual(['airSupply', 'silencer', 'silencer', 'valve52Single', 'valve52Single'])
    expect(mc.warnings.map((w) => w.kind)).not.toContain('no-supply')
    // A1、B1 接頭的快插端與站 2 的 A2、B2 空著：提醒並視為封閉
    expect(mc.warnings.filter((w) => w.kind === 'open-port').map((w) => w.text)).toEqual([
      '「DEMO-FITTING-R18-D6」的 2 沒有接（模擬時視為封閉）',
      '「DEMO-FITTING-R18-D6」的 2 沒有接（模擬時視為封閉）',
      '「DEMO-MANIFOLD-4」的 A2 沒有接（模擬時視為封閉）',
      '「DEMO-MANIFOLD-4」的 B2 沒有接（模擬時視為封閉）',
    ])

    let state = step(mc.circuit, createInitialState(mc.circuit), 0.01)
    const v1 = b.ids.v1
    // 單電控靜止位：P → B、A → EA
    expect(state.portStates[portKey(v1, 'B')]).toBe('pressure')
    expect(state.portStates[portKey(v1, 'A')]).toBe('exhaust')
    expect(state.pressure[portKey(v1, 'B')]).toBeCloseTo(0.5, 6)
    // 產品埠 → 網路：B1 接頭的快插端與閥的 B 同一個網路
    const net = mc.netOfPort[`${b.ids.fb}:${portId('DEMO-FITTING-R18-D6', '2')}`]
    expect(mc.nets[net]).toEqual(expect.arrayContaining([{ node: v1, port: 'B' }]))
    state = interact(mc.circuit, state, v1)
    expect(state.portStates[portKey(v1, 'A')]).toBe('pressure')
    expect(state.portStates[portKey(v1, 'B')]).toBe('exhaust')
    expect(mc.nodeInstance[v1]).toBe(v1)
    expect(mc.nodeInstance[SUPPLY_NODE]).toBeUndefined()
  })

  it('沒有指定供氣口：提醒，迴路沒有氣源', () => {
    const b = valveIsland()
    const mc = deriveModuleCircuit({ ...b.doc, supply: undefined }, PRODUCTS)
    expect(mc.warnings[0]).toMatchObject({ kind: 'no-supply' })
    expect(mc.circuit.nodes.some((n) => n.type === 'airSupply')).toBe(false)
  })

  it('排氣口空著：直接排大氣（加一個排氣口），並建議加裝消音器', () => {
    const b = valveIsland(false)
    const mc = deriveModuleCircuit(b.doc, PRODUCTS)
    expect(mc.circuit.nodes.filter((n) => n.type === 'exhaust')).toHaveLength(2)
    expect(mc.warnings.filter((w) => w.kind === 'open-exhaust').map((w) => w.text)).toEqual([
      '「DEMO-MANIFOLD-4」的 EA 直接排大氣（建議加裝消音器）',
      '「DEMO-MANIFOLD-4」的 EB 直接排大氣（建議加裝消音器）',
    ])
    const state = step(mc.circuit, createInitialState(mc.circuit), 0.01)
    expect(state.portStates[portKey(b.ids.v1, 'A')]).toBe('exhaust')
  })

  it('管接式閥 → 接頭 → PU 管 → 速控閥 → 氣缸：線圈通電後氣缸伸出', () => {
    const b = valveCylinder()
    const mc = deriveModuleCircuit(b.doc, PRODUCTS)
    expect(mc.warnings.filter((w) => w.kind !== 'open-port')).toEqual([])
    expect(mc.circuit.nodes.map((n) => n.type).sort()).toEqual(['airSupply', 'cylinderDouble', 'flowControl', 'flowControl', 'silencer', 'silencer', 'valve52Single'])
    expect(mc.netOfTube.t1).toBe(mc.netOfPort[`${b.ids.sa}:${portId('DEMO-SC-M5-D4', '2')}`])
    let state = step(mc.circuit, createInitialState(mc.circuit), 0.01)
    const piston = () => (state.componentStates[b.ids.c] as { piston: number }).piston
    for (let i = 0; i < 20; i++) state = step(mc.circuit, state, 0.05)
    expect(piston()).toBe(0)
    state = interact(mc.circuit, state, b.ids.v)
    for (let i = 0; i < 60; i++) state = step(mc.circuit, state, 0.05)
    expect(piston()).toBeGreaterThan(0.99)
  })

  it('底板式閥沒有裝在集裝座上：提醒', () => {
    const b = builder()
    b.add('v', 'DEMO-VALVE-VB')
    const mc = deriveModuleCircuit(b.doc, PRODUCTS)
    expect(mc.warnings.map((w) => w.kind)).toEqual(expect.arrayContaining(['unmounted-valve', 'no-supply']))
  })
})
