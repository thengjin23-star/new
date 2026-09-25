import { describe, expect, it } from 'vitest'
import { findUnconnectedExhaustPorts } from '../diagnostics'
import { acceptanceCircuit } from './fixtures'

describe('findUnconnectedExhaustPorts', () => {
  it('EA/EB 都接了排氣口：沒有警告', () => {
    expect(findUnconnectedExhaustPorts(acceptanceCircuit())).toEqual([])
  })

  it('EA/EB 都沒接：兩個都列出', () => {
    expect(findUnconnectedExhaustPorts(acceptanceCircuit({ withExhausts: false }))).toEqual(['v:EA', 'v:EB'])
  })

  it('只接了其中一個：列出另一個', () => {
    const circuit = acceptanceCircuit()
    const partial = { ...circuit, tubes: circuit.tubes.filter((t) => t.id !== 'tEB') }
    expect(findUnconnectedExhaustPorts(partial)).toEqual(['v:EB'])
  })

  it('排氣口元件本身的埠沒接時不算警告', () => {
    expect(findUnconnectedExhaustPorts({ nodes: [{ id: 'e', type: 'exhaust' }], tubes: [] })).toEqual([])
  })
})
