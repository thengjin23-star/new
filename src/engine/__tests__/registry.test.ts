import { describe, expect, it } from 'vitest'
import { builtinComponents } from '../components'
import { defineComponent, type ComponentDefinition } from '../definition'
import { createRegistry, registry } from '../registry'
import { solve } from '../solve'
import { createInitialState, interact, step } from '../step'
import type { Circuit } from '../types'

/** 列出元件可能出現的狀態：初始狀態，以及連續互動後的各狀態 */
function reachableStates(def: ComponentDefinition<unknown>): unknown[] {
  const states = [def.createState()]
  if (def.onInteract) for (let i = 0; i < 4; i++) states.push(def.onInteract(states[states.length - 1]))
  return states
}

describe('內建元件定義', () => {
  it.each(builtinComponents.map((d) => [d.type, d] as const))('%s：結構正確', (_, def) => {
    const ids = def.ports.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every((id) => !id.includes(':'))).toBe(true)
    expect(def.label).not.toBe('')

    for (const state of reachableStates(def)) {
      for (const [a, b] of def.getInternalPaths(state)) {
        expect(ids).toContain(a)
        expect(ids).toContain(b)
      }
      for (const p of def.getSourcePorts?.(state) ?? []) expect(ids).toContain(p)
      for (const p of def.getExhaustPorts?.(state) ?? []) expect(ids).toContain(p)
    }
  })

  it('type 不重複，且預設註冊表依序包含全部內建元件', () => {
    expect(registry.list().map((d) => d.type)).toEqual(['airSupply', 'valve52Manual', 'cylinderDouble', 'exhaust'])
  })
})

describe('createRegistry', () => {
  it('type 重複時丟出錯誤', () => {
    expect(() => createRegistry([...builtinComponents, builtinComponents[0]])).toThrow('元件 type 重複')
  })

  it('查詢不存在的 type 丟出錯誤', () => {
    expect(registry.has('nope')).toBe(false)
    expect(() => registry.get('nope')).toThrow('未知的元件 type')
  })
})

/**
 * 擴充性示範：只新增元件定義、不改引擎，就能模擬新的元件。
 * 這裡用第二階段會加入的 3/2 常閉手動閥 + 單動彈簧回位氣缸當例子。
 */
describe('擴充性：以註冊表加入新元件', () => {
  const valve32 = defineComponent<{ open: boolean }>({
    type: 'valve32Manual',
    label: '3/2 手動閥（常閉）',
    category: 'valve',
    ports: [
      { id: 'P', role: 'supply' },
      { id: 'A', role: 'working' },
      { id: 'R', role: 'exhaust' },
    ],
    createState: () => ({ open: false }),
    getInternalPaths: (s) => (s.open ? [['P', 'A']] : [['A', 'R']]),
    onInteract: (s) => ({ open: !s.open }),
  })

  const cylinderSingle = defineComponent<{ piston: number }>({
    type: 'cylinderSingle',
    label: '單動氣缸',
    category: 'actuator',
    ports: [{ id: 'A', role: 'working' }],
    createState: () => ({ piston: 0 }),
    getInternalPaths: () => [],
    update: ({ state, dt, ports }) => {
      const dir = ports.A === 'pressure' ? 1 : ports.A === 'exhaust' ? -1 : 0
      return { piston: Math.min(1, Math.max(0, state.piston + dir * dt)) }
    },
  })

  const reg = createRegistry([...builtinComponents, valve32, cylinderSingle])
  const circuit: Circuit = {
    nodes: [
      { id: 's', type: 'airSupply' },
      { id: 'v', type: 'valve32Manual' },
      { id: 'c', type: 'cylinderSingle' },
      { id: 'r', type: 'exhaust' },
    ],
    tubes: [
      { id: 't1', from: 's:P', to: 'v:P' },
      { id: 't2', from: 'v:A', to: 'c:A' },
      { id: 't3', from: 'v:R', to: 'r:E' },
    ],
  }

  it('新元件的內部通路參與 solve', () => {
    expect(solve(circuit, { v: { open: false } }, reg).tubeStates.t2).toBe('exhaust')
    expect(solve(circuit, { v: { open: true } }, reg).tubeStates.t2).toBe('pressure')
  })

  it('新元件的 update / onInteract 由 step / interact 驅動', () => {
    let s = createInitialState(circuit, reg)
    s = interact(circuit, s, 'v', reg)
    for (let i = 0; i < 20; i++) s = step(circuit, s, 0.1, reg)
    expect(s.componentStates.c).toEqual({ piston: 1 })

    s = interact(circuit, s, 'v', reg)
    for (let i = 0; i < 20; i++) s = step(circuit, s, 0.1, reg)
    expect(s.componentStates.c).toEqual({ piston: 0 })
  })
})
