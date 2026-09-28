import { getSymbol } from '../components/symbols/symbolRegistry'
import { planSequence, type Params, type Sequence } from '../engine'
import { newId, toCircuit, type CircuitFlowNode, type PneumaticFlowNode, type TubeFlowEdge } from '../store/flow'

export interface CircuitExample {
  id: string
  name: string
  description: string
  build(): { nodes: CircuitFlowNode[]; edges: TubeFlowEdge[]; sequence?: Sequence }
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
  const valveUnder = (valveType: string, cyl: PneumaticFlowNode, gap: number, tag: string, params?: Params) => {
    const sym = getSymbol(valveType)
    const mid = (at(cyl, 'A').x + at(cyl, 'B').x) / 2
    return place(valveType, 'A', mid - (sym.ports.B.x - sym.ports.A.x) / 2, at(cyl, 'A').y + gap, { tag, params })
  }
  /** 在某個埠下方放一個消音器 */
  const silence = (node: PneumaticFlowNode, port: string, dx = 0, dy = 40) => {
    const p = at(node, port)
    tube(node, port, place('silencer', 'E', p.x + dx, p.y + dy), 'E')
  }
  /** 閥的 P 下方放一個氣源符號（稍微偏左，讓出排氣口的位置） */
  const supplyUnder = (node: PneumaticFlowNode, tag?: string) => {
    const p = at(node, 'P')
    tube(place('airSupply', 'P', p.x - 22, p.y + 56, { tag }), 'P', node, 'P')
  }
  return { nodes, edges, place, at, tube, valveUnder, silence, supplyUnder }
}

/** 第一版的驗收範例：氣源 → 5/2 手動閥 → 雙動氣缸，閥的 EA/EB 各接一個排氣口 */
function manualValve() {
  const { nodes, edges, place, at, tube, valveUnder } = builder()
  const cyl = place('cylinderDouble', 'A', 18, 64, { tag: '1A1', params: { sensor: 'A' } })
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
  const cyl = place('cylinderDouble', 'A', 18, 64, { tag: '1A1', params: { sensor: 'A' } })
  const fa = place('flowControl', '2', at(cyl, 'A').x, at(cyl, 'A').y + 40, { tag: '1V2', params: { opening: 40 } })
  const fb = place('flowControl', '2', at(cyl, 'B').x, at(cyl, 'B').y + 40, { tag: '1V3', params: { opening: 40 } })
  const valve = valveUnder('valve52Single', cyl, at(fa, '1').y - at(cyl, 'A').y + 64, '1V1', { coilL: 'Y1' })
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
  const cyl = place('cylinderDouble', 'A', 18, 64, { tag: '1A1', params: { sensor: 'A' } })
  const valve = valveUnder('valve53Closed', cyl, 96, '1V1', { coilL: 'Y1', coilR: 'Y2' })
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

/** 兩支氣缸 A、B，各由一顆單電控閥（Y1、Y2）控制，程序 A+ B+ B- A- */
function sequenceAB() {
  const { nodes, edges, place, at, tube, valveUnder, silence } = builder()
  const cylA = place('cylinderDouble', 'A', 18, 64, { tag: '1A1', params: { sensor: 'A' } })
  const cylB = place('cylinderDouble', 'A', 418, 64, { tag: '2A1', params: { sensor: 'B' } })
  const va = valveUnder('valve52Single', cylA, 96, '1V1', { coilL: 'Y1' })
  const vb = valveUnder('valve52Single', cylB, 96, '2V1', { coilL: 'Y2' })
  for (const [v, c] of [
    [va, cylA],
    [vb, cylB],
  ] as const) {
    tube(v, 'A', c, 'A')
    tube(v, 'B', c, 'B')
    silence(v, 'EA', -44)
    silence(v, 'EB', 44)
  }
  const supply = place('airSupply', 'P', (at(va, 'P').x + at(vb, 'P').x) / 2, at(va, 'P').y + 110, { tag: '0Z1' })
  tube(supply, 'P', va, 'P')
  tube(supply, 'P', vb, 'P')
  const notation = 'A+ B+ B- A-'
  return { nodes, edges, sequence: { steps: planSequence(toCircuit(nodes, edges), notation).steps, notation } }
}

/**
 * 雙手按鈕安全迴路：兩個按鈕閥經雙壓閥（AND）送出先導壓力，兩手同時按住氣缸才伸出，
 * 放開任一個立即縮回。各閥的 P 各畫一個氣源符號（教科書畫法，不必拉長的供氣管線）。
 */
function twoHand() {
  const { nodes, edges, place, at, tube, valveUnder, silence, supplyUnder } = builder()
  const cyl = place('cylinderDouble', 'A', 18, 64, { tag: '1A1', params: { sensor: 'A' } })
  const valve = valveUnder('valve52Pilot', cyl, 96, '1V1')
  tube(valve, 'A', cyl, 'A')
  tube(valve, 'B', cyl, 'B')
  silence(valve, 'EA', -30)
  silence(valve, 'EB', 30)
  supplyUnder(valve, '0Z1')
  const pilot = at(valve, '14')
  const and = place('twoPressureValve', 'A', pilot.x - 76, pilot.y + 228, { tag: '1V2' })
  tube(and, 'A', valve, '14')
  const x = at(and, 'X')
  const y = at(and, 'Y')
  const left = place('valve32Button', 'A', x.x - 132, x.y + 90, { tag: '1S1' })
  const right = place('valve32Button', 'A', y.x + 132, y.y + 90, { tag: '1S2' })
  tube(left, 'A', and, 'X')
  tube(right, 'A', and, 'Y')
  for (const b of [left, right]) {
    silence(b, 'R', 26)
    supplyUnder(b)
  }
  return { nodes, edges }
}

/**
 * 滾輪閥自動往復：按啟動按鈕 → 氣缸伸出；到達 a1 壓下滾輪閥，經延時閥 2 秒後
 * 把雙氣控閥切回，氣缸自動縮回。
 */
function autoReturn() {
  const { nodes, edges, place, at, tube, valveUnder, silence, supplyUnder } = builder()
  const cyl = place('cylinderDouble', 'A', 18, 64, { tag: '1A1', params: { sensor: 'A' } })
  const valve = valveUnder('valve52DoublePilot', cyl, 96, '1V1')
  tube(valve, 'A', cyl, 'A')
  tube(valve, 'B', cyl, 'B')
  silence(valve, 'EA', -30)
  silence(valve, 'EB', 30)
  supplyUnder(valve, '0Z1')
  const p14 = at(valve, '14')
  const start = place('valve32Button', 'A', p14.x - 110, p14.y + 180, { tag: '1S1' })
  tube(start, 'A', valve, '14')
  const p12 = at(valve, '12')
  const timer = place('valve32Timer', 'A', p12.x + 120, p12.y + 120, { tag: '1V2', params: { delay: 2 } })
  tube(timer, 'A', valve, '12')
  const t12 = at(timer, '12')
  const roller = place('valve32Roller', 'A', t12.x - 90, t12.y + 150, { tag: '1S2', params: { trigger: 'a1' } })
  tube(roller, 'A', timer, '12')
  for (const v of [start, timer, roller]) {
    silence(v, 'R', 26)
    supplyUnder(v)
  }
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
  {
    id: 'sequence',
    name: '程序控制：A+ B+ B− A−',
    description: '兩支氣缸依序動作；在「程序」面板按「自動」，看位移－步驟圖',
    build: sequenceAB,
  },
  {
    id: 'two-hand',
    name: '雙手按鈕安全迴路（AND）',
    description: '兩個按鈕都按住（雙壓閥）氣缸才伸出，放開任一個立即縮回',
    build: twoHand,
  },
  {
    id: 'auto-return',
    name: '滾輪閥自動往復（延時 2 秒）',
    description: '按啟動按鈕伸出，到達 a1 後停 2 秒自動縮回',
    build: autoReturn,
  },
]
