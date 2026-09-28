import { describe, expect, it } from 'vitest'
import { deriveModuleCircuit } from '../../assembly/moduleCircuit'
import { PRODUCTS, valveCylinder, valveIsland } from '../../assembly/__tests__/sampleModules'
import { getSymbol } from '../../components/symbols/symbolRegistry'
import { createInitialState, interact, step } from '../../engine'
import { isPneumaticNode, toCircuit, type PneumaticFlowNode } from '../flow'
import { circuitFromModule } from '../fromModule'

const box = (n: PneumaticFlowNode) => {
  const s = getSymbol(n.data.componentType)
  return { x0: n.position.x, y0: n.position.y, x1: n.position.x + s.width, y1: n.position.y + s.height }
}

function generate(b: ReturnType<typeof valveCylinder>) {
  const mc = deriveModuleCircuit(b.doc, PRODUCTS)
  const out = circuitFromModule(mc, b.doc, PRODUCTS, new Date(2026, 8, 28))
  const nodes = out.nodes.filter(isPneumaticNode)
  const byTag = (tag: string) => nodes.find((n) => n.data.tag === tag)
  return { ...out, pneumatic: nodes, byTag, mc }
}

describe('circuitFromModule', () => {
  it('閥＋速控閥＋氣缸：分層排列、ISO 標號、產品型號、管線', () => {
    const g = generate(valveCylinder())
    const types = g.pneumatic.map((n) => n.data.componentType).sort()
    expect(types).toEqual(['airSupply', 'cylinderDouble', 'flowControl', 'flowControl', 'silencer', 'silencer', 'valve52Single'])
    const cyl = g.byTag('1A1')!
    const valve = g.byTag('1V1')!
    const fc = [g.byTag('1V2')!, g.byTag('1V3')!]
    expect(cyl.data.componentType).toBe('cylinderDouble')
    expect(valve.data.product?.modelCode).toBe('DEMO-VALVE-52-01')
    expect(fc.map((n) => n.data.product?.modelCode)).toEqual(['DEMO-SC-M5-D4', 'DEMO-SC-M5-D4'])
    expect(g.byTag('0Z1')?.data.componentType).toBe('airSupply')
    // 由上到下：氣缸 → 速控閥 → 閥 → 氣源
    expect(cyl.position.y).toBeLessThan(fc[0].position.y)
    expect(fc[0].position.y).toBeLessThan(valve.position.y)
    expect(valve.position.y).toBeLessThan(g.byTag('0Z1')!.position.y)
    // 速控閥的上方埠對齊氣缸的 A、B 埠
    const cs = getSymbol('cylinderDouble')
    const fs = getSymbol('flowControl')
    expect(fc.map((n) => n.position.x + fs.ports['2'].x).sort((a, b) => a - b)).toEqual([cyl.position.x + cs.ports.A.x, cyl.position.x + cs.ports.B.x])
    // 氣缸參數帶入（缸徑 16、行程 50）
    expect(cyl.data.params).toMatchObject({ bore: 16, stroke: 50 })
    // 管線：A、B 各兩段（閥 → 速控閥 → 氣缸）、P、EA、EB
    expect(g.edges).toHaveLength(7)
    // 來源註解
    expect(g.nodes.some((n) => n.type === 'note' && n.data.text.includes('3D 模組'))).toBe(true)
  })

  it('產生的迴路圖可以直接模擬：線圈通電後氣缸伸出', () => {
    const g = generate(valveCylinder())
    const circuit = toCircuit(g.nodes, g.edges)
    let state = step(circuit, createInitialState(circuit), 0.01)
    state = interact(circuit, state, g.byTag('1V1')!.id)
    for (let i = 0; i < 100; i++) state = step(circuit, state, 0.05)
    expect((state.componentStates[g.byTag('1A1')!.id] as { piston: number }).piston).toBeGreaterThan(0.99)
  })

  it('閥島：每顆閥一欄，P／EA／EB 共用管線串接，元件不重疊', () => {
    const g = generate(valveIsland())
    expect(g.byTag('1V1')?.data.componentType).toBe('valve52Single')
    expect(g.byTag('2V1')?.data.componentType).toBe('valve52Single')
    expect(g.byTag('1V1')!.position.x).toBeLessThan(g.byTag('2V1')!.position.x)
    const circuit = toCircuit(g.nodes, g.edges)
    // 供氣接到兩顆閥的 P
    const pTubes = circuit.tubes.filter((t) => t.from.endsWith(':P') || t.to.endsWith(':P'))
    expect(pTubes.length).toBeGreaterThanOrEqual(2)
    const boxes = g.pneumatic.map(box)
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]
        const b = boxes[j]
        const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
        expect(overlap, `${g.pneumatic[i].data.componentType} × ${g.pneumatic[j].data.componentType}`).toBe(false)
      }
  })
})
