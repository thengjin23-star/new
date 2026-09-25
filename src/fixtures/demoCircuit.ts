import { getSymbol } from '../components/symbols/symbolRegistry'
import { newId, type PneumaticFlowNode, type TubeFlowEdge } from '../store/flow'

/**
 * 驗收用範例電路：氣源 → 5/2 手動閥 → 雙動氣缸，閥的 EA/EB 各接一個排氣口。
 * 位置由符號的埠座標推算，讓管線盡量垂直對齊。
 */
export function createDemoCircuit(): { nodes: PneumaticFlowNode[]; edges: TubeFlowEdge[] } {
  const ids = {
    cylinder: newId('n'),
    valve: newId('n'),
    supply: newId('n'),
    exhaustA: newId('n'),
    exhaustB: newId('n'),
  }

  const cyl = getSymbol('cylinderDouble')
  const valve = getSymbol('valve52Manual')
  const supply = getSymbol('airSupply')
  const exhaust = getSymbol('exhaust')

  const cylPos = { x: 0, y: 0 }
  // 閥的 A 口對齊氣缸 A、B 口之間的中線附近
  const valvePos = {
    x: cylPos.x + (cyl.ports.A.x + cyl.ports.B.x) / 2 - (valve.ports.A.x + valve.ports.B.x) / 2,
    y: cylPos.y + cyl.height + 96,
  }
  const valveBottom = valvePos.y + valve.height
  const supplyPos = { x: valvePos.x + valve.ports.P.x - supply.ports.P.x, y: valveBottom + 72 }
  const exhaustY = valveBottom + 56
  const exhaustAPos = { x: valvePos.x + valve.ports.EA.x - exhaust.ports.E.x - 64, y: exhaustY }
  const exhaustBPos = { x: valvePos.x + valve.ports.EB.x - exhaust.ports.E.x + 64, y: exhaustY }

  const node = (id: string, componentType: string, position: { x: number; y: number }): PneumaticFlowNode => ({
    id,
    type: 'pneumatic',
    position,
    data: { componentType, rotation: 0 },
  })

  const tube = (source: string, sourceHandle: string, target: string, targetHandle: string): TubeFlowEdge => ({
    id: newId('t'),
    type: 'tube',
    source,
    sourceHandle,
    target,
    targetHandle,
  })

  return {
    nodes: [
      node(ids.cylinder, 'cylinderDouble', cylPos),
      node(ids.valve, 'valve52Manual', valvePos),
      node(ids.supply, 'airSupply', supplyPos),
      node(ids.exhaustA, 'exhaust', exhaustAPos),
      node(ids.exhaustB, 'exhaust', exhaustBPos),
    ],
    edges: [
      tube(ids.supply, 'P', ids.valve, 'P'),
      tube(ids.valve, 'A', ids.cylinder, 'A'),
      tube(ids.valve, 'B', ids.cylinder, 'B'),
      tube(ids.valve, 'EA', ids.exhaustA, 'E'),
      tube(ids.valve, 'EB', ids.exhaustB, 'E'),
    ],
  }
}
