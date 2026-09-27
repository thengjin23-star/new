import { getSymbol } from '../components/symbols/symbolRegistry'
import type { Params } from '../engine'
import { newId, type CircuitFlowNode, type PneumaticFlowNode, type TubeFlowEdge } from '../store/flow'

export interface CircuitExample {
  id: string
  name: string
  description: string
  build(): { nodes: CircuitFlowNode[]; edges: TubeFlowEdge[] }
}

/** 小工具：以「某個埠要落在哪個座標」來擺放元件（未旋轉），並記錄管線 */
function builder() {
  const nodes: PneumaticFlowNode[] = []
  const edges: TubeFlowEdge[] = []
  const place = (type: string, port: string, x: number, y: number, extra?: { tag?: string; params?: Params }) => {
    const g = getSymbol(type).ports[port]
    const node: PneumaticFlowNode = {
      id: newId('n'),
      type: 'pneumatic',
      position: { x: x - g.x, y: y - g.y },
      data: {
        componentType: type,
        rotation: 0,
        ...(extra?.tag && { tag: extra.tag }),
        ...(extra?.params && { params: extra.params }),
      },
    }
    nodes.push(node)
    return node
  }
  /** 元件上某個埠的絕對座標 */
  const at = (node: PneumaticFlowNode, port: string) => {
    const g = getSymbol(node.data.componentType).ports[port]
    return { x: node.position.x + g.x, y: node.position.y + g.y }
  }
  const tube = (a: PneumaticFlowNode, pa: string, b: PneumaticFlowNode, pb: string) => {
    edges.push({ id: newId('t'), type: 'tube', source: a.id, sourceHandle: pa, target: b.id, targetHandle: pb })
  }
  /** 讓閥的 A、B 中線對齊氣缸 A、B 的中線 */
  const valveUnder = (valveType: string, cyl: PneumaticFlowNode, gap: number, tag: string) => {
    const sym = getSymbol(valveType)
    const mid = (at(cyl, 'A').x + at(cyl, 'B').x) / 2
    return place(valveType, 'A', mid - (sym.ports.B.x - sym.ports.A.x) / 2, at(cyl, 'A').y + gap, { tag })
  }
  return { nodes, edges, place, at, tube, valveUnder }
}

/** 第一版的驗收範例：氣源 → 5/2 手動閥 → 雙動氣缸，閥的 EA/EB 各接一個排氣口 */
function manualValve() {
  const { nodes, edges, place, at, tube, valveUnder } = builder()
  const cyl = place('cylinderDouble', 'A', 18, 64, { tag: '1A1' })
  const valve = valveUnder('valve52Manual', cyl, 96, '1V1')
  const p = at(valve, 'P')
  const supply = place('airSupply', 'P', p.x, p.y + 72, { tag: '0Z1' })
  const ea = place('exhaust', 'E', at(valve, 'EA').x - 64, p.y + 56)
  const eb = place('exhaust', 'E', at(valve, 'EB').x + 64, p.y + 56)
  tube(supply, 'P', valve, 'P')
  tube(valve, 'A', cyl, 'A')
  tube(valve, 'B', cyl, 'B')
  tube(valve, 'EA', ea, 'E')
  tube(valve, 'EB', eb, 'E')
  return { nodes, edges }
}

/** 單電控閥＋兩個速度控制閥（排氣節流），氣源經三點組合 */
function solenoidMeterOut() {
  const { nodes, edges, place, at, tube, valveUnder } = builder()
  const cyl = place('cylinderDouble', 'A', 18, 64, { tag: '1A1' })
  const fa = place('flowControl', '2', at(cyl, 'A').x, at(cyl, 'A').y + 40, { tag: '1V2', params: { opening: 40 } })
  const fb = place('flowControl', '2', at(cyl, 'B').x, at(cyl, 'B').y + 40, { tag: '1V3', params: { opening: 40 } })
  const valve = valveUnder('valve52Single', cyl, at(fa, '1').y - at(cyl, 'A').y + 64, '1V1')
  const sa = place('silencer', 'E', at(valve, 'EA').x - 44, at(valve, 'EA').y + 40)
  const sb = place('silencer', 'E', at(valve, 'EB').x + 44, at(valve, 'EB').y + 40)
  const p = at(valve, 'P')
  const frl = place('frl', 'OUT', p.x - 48, p.y + 120, { tag: '0Z2' })
  const supply = place('airSupply', 'P', at(frl, 'IN').x - 64, at(frl, 'IN').y + 48, { tag: '0Z1' })
  tube(supply, 'P', frl, 'IN')
  tube(frl, 'OUT', valve, 'P')
  tube(valve, 'A', fa, '1')
  tube(fa, '2', cyl, 'A')
  tube(valve, 'B', fb, '1')
  tube(fb, '2', cyl, 'B')
  tube(valve, 'EA', sa, 'E')
  tube(valve, 'EB', sb, 'E')
  return { nodes, edges }
}

/** 5/3 中位封閉：雙電控，兩個線圈都斷電時氣缸停在中途 */
function closedCenter() {
  const { nodes, edges, place, at, tube, valveUnder } = builder()
  const cyl = place('cylinderDouble', 'A', 18, 64, { tag: '1A1' })
  const valve = valveUnder('valve53Closed', cyl, 96, '1V1')
  const p = at(valve, 'P')
  const supply = place('airSupply', 'P', p.x, p.y + 80, { tag: '0Z1' })
  const gauge = place('pressureGauge', 'P', p.x + 120, p.y + 80)
  const sa = place('silencer', 'E', at(valve, 'EA').x - 48, at(valve, 'EA').y + 40)
  const sb = place('silencer', 'E', at(valve, 'EB').x + 48, at(valve, 'EB').y + 40)
  tube(supply, 'P', valve, 'P')
  tube(supply, 'P', gauge, 'P')
  tube(valve, 'A', cyl, 'A')
  tube(valve, 'B', cyl, 'B')
  tube(valve, 'EA', sa, 'E')
  tube(valve, 'EB', sb, 'E')
  return { nodes, edges }
}

export const CIRCUIT_EXAMPLES: readonly CircuitExample[] = [
  {
    id: 'manual',
    name: '手動閥控制雙動氣缸',
    description: '最基本的迴路：點閥門切換，氣缸伸出／縮回',
    build: manualValve,
  },
  {
    id: 'meter-out',
    name: '單電控閥＋速度控制（排氣節流）',
    description: '點線圈通電／斷電；在屬性面板調整節流開度，看速度變化',
    build: solenoidMeterOut,
  },
  {
    id: 'closed-center',
    name: '5/3 中位封閉：中途停止',
    description: '點左／右線圈移動，再點一次回到中位，氣缸停在中途',
    build: closedCenter,
  },
]
