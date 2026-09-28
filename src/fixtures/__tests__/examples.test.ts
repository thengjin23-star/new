import { describe, expect, it } from 'vitest'
import {
  createInitialState,
  interact,
  runSequence,
  SEQUENCER_IDLE,
  setOutputs,
  step,
  tickSequence,
  type Circuit,
  type SimState,
} from '../../engine'
import { isPneumaticNode, toCircuit } from '../../store/flow'
import { CIRCUIT_EXAMPLES } from '../examples'

const FPS = 60
const example = (id: string) => {
  const built = CIRCUIT_EXAMPLES.find((e) => e.id === id)!.build()
  const circuit = toCircuit(built.nodes, built.edges)
  const byTag = (tag: string) => built.nodes.filter(isPneumaticNode).find((n) => n.data.tag === tag)!.id
  return { ...built, circuit, byTag }
}
const run = (circuit: Circuit, s: SimState, seconds: number, each?: (s: SimState) => void) => {
  for (let i = 0; i < seconds * FPS; i++) {
    s = step(circuit, s, 1 / FPS)
    each?.(s)
  }
  return s
}
const piston = (s: SimState, id: string) => (s.componentStates[id] as { piston: number }).piston

describe('範例迴路', () => {
  it('所有範例的管線都接在存在的埠上', () => {
    for (const ex of CIRCUIT_EXAMPLES) {
      const { nodes, edges } = ex.build()
      const ids = new Set(nodes.map((n) => n.id))
      for (const e of edges) expect(ids.has(e.source) && ids.has(e.target), `${ex.id} ${e.id}`).toBe(true)
    }
  })

  it('程序控制 A+ B+ B- A-：內建的步驟可以自動跑完一個循環', () => {
    const { circuit, sequence, byTag } = example('sequence')
    expect(sequence?.steps.map((s) => s.label)).toEqual(['A+', 'B+', 'B−', 'A−'])
    let sim = step(circuit, createInitialState(circuit), 0)
    let r = runSequence(sequence!, SEQUENCER_IDLE)
    let seq = r.state
    sim = setOutputs(circuit, sim, r.set!)
    const order: string[] = []
    for (let i = 0; i < 7 * FPS; i++) {
      sim = step(circuit, sim, 1 / FPS)
      r = tickSequence(sequence!, seq, sim.signals, 1 / FPS)
      if (r.state.index !== seq.index) order.push(r.state.index >= 0 ? sequence!.steps[r.state.index].label! : '結束')
      seq = r.state
      if (r.set) sim = setOutputs(circuit, sim, r.set)
    }
    expect(order).toEqual(['B+', 'B−', 'A−', '結束'])
    expect(seq.cycles).toBe(1)
    expect(piston(sim, byTag('1A1'))).toBe(0)
    expect(piston(sim, byTag('2A1'))).toBe(0)
  })

  it('雙手按鈕：只按一個不動作，兩個都按住才伸出，放開一個就縮回', () => {
    const { circuit, byTag } = example('two-hand')
    const [left, right, cyl] = [byTag('1S1'), byTag('1S2'), byTag('1A1')]
    let sim = step(circuit, createInitialState(circuit), 0)
    sim = run(circuit, interact(circuit, sim, left, undefined, 'press'), 1.5)
    expect(piston(sim, cyl)).toBe(0)
    sim = run(circuit, interact(circuit, sim, right, undefined, 'press'), 1.5)
    expect(piston(sim, cyl)).toBe(1)
    sim = run(circuit, interact(circuit, sim, left, undefined, 'release'), 1.5)
    expect(piston(sim, cyl)).toBe(0)
  })

  it('滾輪閥自動往復：按一下啟動，伸出後停約 2 秒自動縮回', () => {
    const { circuit, byTag } = example('auto-return')
    const [start, cyl] = [byTag('1S1'), byTag('1A1')]
    let sim = step(circuit, createInitialState(circuit), 0)
    sim = run(circuit, interact(circuit, sim, start, undefined, 'press'), 0.2)
    sim = interact(circuit, sim, start, undefined, 'release')
    let reached = -1
    let left = -1
    sim = run(circuit, sim, 6, (s) => {
      if (reached < 0 && piston(s, cyl) === 1) reached = s.time
      if (reached >= 0 && left < 0 && piston(s, cyl) < 1) left = s.time
    })
    expect(reached).toBeGreaterThan(0)
    expect(left - reached).toBeGreaterThan(1.9)
    expect(left - reached).toBeLessThan(2.2)
    expect(piston(sim, cyl)).toBe(0)
  })
})
