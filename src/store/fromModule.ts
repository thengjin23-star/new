import { SUPPLY_NODE, type ModuleCircuit, type NetEndpoint } from '../assembly/moduleCircuit'
import type { ProductMap } from '../assembly/moduleOps'
import type { ModuleDoc } from '../assembly/types'
import { getSymbol } from '../components/symbols/symbolRegistry'
import { CYLINDER_LETTERS, OUTPUT_NAMES, registry, VALVE_SPECS, type CircuitNode, type Params, type ValveSpec } from '../engine'
import { today } from '../utils/date'
import { newId, type CircuitFlowNode, type PneumaticFlowNode, type TubeFlowEdge } from './flow'

/**
 * 由 3D 模組推出的迴路（deriveModuleCircuit）產生迴路圖：
 *
 * - 由上到下：致動器、流量控制、方向控制閥、排氣（消音器）、氣源處理、氣源
 * - 每顆閥與它驅動的速控閥、氣缸排成一欄；速控閥對齊氣缸的埠，閥置中在兩條管線之間
 * - 標號依 ISO 1219-2：第 n 欄的氣缸 nA1、閥 nV1、速控閥 nV2、nV3…；氣源 0Z1、氣源處理 0Z2…
 * - 接頭、集裝座不畫（以管線表示）；同一個網路的埠以管線串接（分歧處顯示分歧點）
 */

type Role = 'actuator' | 'flow' | 'valve' | 'vent' | 'prep' | 'supply' | 'other'

interface Placed {
  node: CircuitNode
  role: Role
  x: number
  y: number
  tag?: string
  labelSide?: 'left' | 'right'
}

const GAP_X = 150

function roleOf(node: CircuitNode): Role {
  if (node.id === SUPPLY_NODE || node.type === 'airSupply') return 'supply'
  const def = registry.get(node.type)
  if (node.type === 'silencer' || node.type === 'exhaust') return 'vent'
  switch (def.category) {
    case 'actuator':
      return 'actuator'
    case 'flow':
      return 'flow'
    case 'valve':
      return 'valve'
    case 'source':
      return 'prep'
    default:
      return 'other'
  }
}

export interface CircuitFromModule {
  nodes: CircuitFlowNode[]
  edges: TubeFlowEdge[]
}

export function circuitFromModule(mc: ModuleCircuit, doc: ModuleDoc, products: ProductMap, date = new Date()): CircuitFromModule {
  const nodes = mc.circuit.nodes
  const byId = new Map(nodes.map((n) => [n.id, n]))
  // 依模組中零件的順序
  const order = new Map(doc.instances.map((i, k) => [i.id, k]))
  const rank = (id: string) => order.get(id) ?? 1e6
  const roles = new Map(nodes.map((n) => [n.id, roleOf(n)]))

  // 相鄰關係：同一個網路中的兩個端點
  const neighbors = new Map<string, { port: string; other: NetEndpoint }[]>()
  for (const net of mc.nets) {
    for (const a of net) {
      for (const b of net) {
        if (a.node === b.node) continue
        const list = neighbors.get(a.node) ?? []
        list.push({ port: a.port, other: b })
        neighbors.set(a.node, list)
      }
    }
  }
  const neighborsVia = (id: string, port: string) => (neighbors.get(id) ?? []).filter((n) => n.port === port).map((n) => n.other)

  // ---- 分欄：每顆閥一欄 ----
  const assigned = new Set<string>()
  interface Column {
    valve?: CircuitNode
    actuator?: CircuitNode
    flows: { node: CircuitNode; actuatorPort?: string; valvePort?: string }[]
    vents: { node: CircuitNode; valvePort: string }[]
  }
  const columns: Column[] = []
  const valves = nodes.filter((n) => roles.get(n.id) === 'valve').sort((a, b) => rank(a.id) - rank(b.id))
  for (const valve of valves) {
    const col: Column = { valve, flows: [], vents: [] }
    assigned.add(valve.id)
    const def = registry.get(valve.type)
    for (const port of def.ports) {
      for (const other of neighborsVia(valve.id, port.id)) {
        const role = roles.get(other.node)
        const node = byId.get(other.node)!
        if (assigned.has(node.id)) continue
        if (port.role === 'working' && role === 'flow') {
          assigned.add(node.id)
          const entry: Column['flows'][number] = { node, valvePort: port.id }
          // 速控閥的另一端接的氣缸
          for (const p of registry.get(node.type).ports) {
            if (p.id === other.port) continue
            for (const far of neighborsVia(node.id, p.id)) {
              if (roles.get(far.node) !== 'actuator') continue
              if (!col.actuator) {
                col.actuator = byId.get(far.node)
                assigned.add(far.node)
              }
              if (col.actuator?.id === far.node) entry.actuatorPort = far.port
            }
          }
          col.flows.push(entry)
        } else if (port.role === 'working' && role === 'actuator' && !col.actuator) {
          col.actuator = node
          assigned.add(node.id)
        } else if ((port.role === 'exhaust' || port.role === 'supply') && role === 'vent') {
          assigned.add(node.id)
          col.vents.push({ node, valvePort: port.id })
        }
      }
    }
    columns.push(col)
  }
  // 沒有閥驅動的氣缸（或速控閥）：各自一欄
  for (const n of nodes.filter((n) => !assigned.has(n.id) && (roles.get(n.id) === 'actuator' || roles.get(n.id) === 'flow')).sort((a, b) => rank(a.id) - rank(b.id))) {
    assigned.add(n.id)
    columns.push(roles.get(n.id) === 'actuator' ? { actuator: n, flows: [], vents: [] } : { flows: [{ node: n }], vents: [] })
  }

  // ---- 各欄的座標 ----
  const placed = new Map<string, Placed>()
  const put = (node: CircuitNode, role: Role, x: number, y: number) => placed.set(node.id, { node, role, x, y })
  const sym = (node: CircuitNode) => getSymbol(node.type)
  const hasFlows = columns.some((c) => c.flows.length)
  const actuatorH = Math.max(0, ...columns.map((c) => (c.actuator ? sym(c.actuator).height : 0)))
  const flowH = Math.max(0, ...columns.flatMap((c) => c.flows.map((f) => sym(f.node).height)))
  const yActuator = 0
  const yFlow = actuatorH ? actuatorH + 60 : 0
  const yValve = (hasFlows ? yFlow + flowH : actuatorH) + (hasFlows || actuatorH ? 80 : 0)
  const valveH = Math.max(0, ...columns.map((c) => (c.valve ? sym(c.valve).height : 0)))
  const yVent = yValve + valveH + 50
  const ventH = Math.max(0, ...columns.flatMap((c) => c.vents.map((v) => sym(v.node).height)))

  let cursor = 0
  for (const col of columns) {
    // 以「氣缸（沒有氣缸時以閥）」定欄位；先算相對位置，最後整欄平移到 cursor
    const items: { node: CircuitNode; role: Role; x: number; y: number }[] = []
    const actSym = col.actuator && sym(col.actuator)
    if (col.actuator) items.push({ node: col.actuator, role: 'actuator', x: 0, y: yActuator })
    // 速控閥：對齊氣缸的埠；沒有氣缸時依閥埠的順序排開
    const flowXs: number[] = []
    col.flows
      .map((f, i) => ({ ...f, i }))
      .forEach((f) => {
        const fs = sym(f.node)
        const top = Object.values(fs.ports).find((p) => p.side === 'top') ?? { x: fs.width / 2 }
        const target = f.actuatorPort && actSym?.ports[f.actuatorPort] ? actSym.ports[f.actuatorPort].x : f.i * (fs.width + 40) + fs.width / 2
        const x = target - top.x
        flowXs.push(x + top.x)
        items.push({ node: f.node, role: 'flow', x, y: yFlow })
      })
    if (col.valve) {
      const vs = sym(col.valve)
      const working = registry.get(col.valve.type).ports.filter((p) => p.role === 'working' && vs.ports[p.id])
      const valveMid = working.length ? working.reduce((s, p) => s + vs.ports[p.id].x, 0) / working.length : vs.width / 2
      // 閥的工作埠中線對齊上方（速控閥或氣缸埠）的中線
      const targets = flowXs.length
        ? flowXs
        : col.actuator
          ? Object.values(actSym!.ports).map((p) => p.x)
          : [vs.width / 2]
      const targetMid = targets.reduce((s, v) => s + v, 0) / targets.length
      const vx = targetMid - valveMid
      items.push({ node: col.valve, role: 'valve', x: vx, y: yValve })
      // 消音器：對齊排氣埠，兩個以上時往外錯開
      const ventOrder = [...col.vents].sort((a, b) => (vs.ports[a.valvePort]?.x ?? 0) - (vs.ports[b.valvePort]?.x ?? 0))
      const ventXs = ventOrder.map((v) => vs.ports[v.valvePort]?.x ?? vs.width / 2)
      const ventMid = ventXs.reduce((s, x) => s + x, 0) / Math.max(1, ventXs.length)
      ventOrder.forEach((v, i) => {
        const ss = sym(v.node)
        // 一個時對齊排氣埠；多個時以排氣埠的中點為中心排開（中間留給 P 的管線）
        const px = ventOrder.length > 1 ? ventMid + (i - (ventOrder.length - 1) / 2) * (ss.width + 14) : ventXs[0]
        items.push({ node: v.node, role: 'vent', x: vx + px - (ss.ports.E?.x ?? ss.width / 2), y: yVent })
      })
    }
    const minX = Math.min(...items.map((it) => it.x))
    const maxX = Math.max(...items.map((it) => it.x + sym(it.node).width))
    for (const it of items) put(it.node, it.role, cursor + it.x - minX, it.y)
    cursor += maxX - minX + GAP_X
  }

  // ---- 其他元件（壓力錶、塞頭…）：放在閥的右邊 ----
  const others = nodes.filter((n) => !placed.has(n.id) && !['prep', 'supply', 'vent'].includes(roles.get(n.id)!))
  for (const n of others) {
    put(n, roles.get(n.id)!, cursor, yValve)
    cursor += sym(n).width + GAP_X
  }

  // ---- 氣源處理與氣源：最下面一列，依離氣源的遠近由左到右 ----
  const yPrep = (ventH ? yVent + ventH : yValve + valveH) + 70
  const prep = nodes.filter((n) => roles.get(n.id) === 'prep' || (roles.get(n.id) === 'vent' && !placed.has(n.id)))
  const distance = new Map<string, number>()
  const supply = nodes.find((n) => roles.get(n.id) === 'supply')
  if (supply) {
    const queue = [supply.id]
    distance.set(supply.id, 0)
    while (queue.length) {
      const cur = queue.shift()!
      for (const nb of neighbors.get(cur) ?? []) {
        if (distance.has(nb.other.node)) continue
        distance.set(nb.other.node, distance.get(cur)! + 1)
        queue.push(nb.other.node)
      }
    }
  }
  prep.sort((a, b) => (distance.get(a.id) ?? 99) - (distance.get(b.id) ?? 99) || rank(a.id) - rank(b.id))
  let px = 0
  const prepH = Math.max(0, ...prep.map((n) => sym(n).height))
  for (const n of prep) {
    put(n, roles.get(n.id)!, px, yPrep + (prepH - sym(n).height) / 2)
    px += sym(n).width + 70
  }
  if (supply) {
    // 氣源在最左下，出口朝上接到氣源處理（或閥）
    put(supply, 'supply', -sym(supply).width - 40, yPrep + prepH + 40)
  }

  // ---- 並排的速控閥、消音器：左邊的標號放左側、右邊的放右側，避免互相重疊 ----
  for (const col of columns) {
    for (const group of [col.flows.map((f) => f.node), col.vents.map((v) => v.node)]) {
      if (group.length < 2) continue
      const sorted = group.map((n) => placed.get(n.id)!).sort((a, b) => a.x - b.x)
      sorted.forEach((p, i) => (p.labelSide = i === 0 ? 'left' : 'right'))
    }
  }

  // ---- 標號 ----
  columns.forEach((col, k) => {
    const n = k + 1
    if (col.actuator) placed.get(col.actuator.id)!.tag = `${n}A1`
    if (col.valve) placed.get(col.valve.id)!.tag = `${n}V1`
    ;[...col.flows]
      .sort((a, b) => placed.get(a.node.id)!.x - placed.get(b.node.id)!.x)
      .forEach((f, i) => (placed.get(f.node.id)!.tag = `${n}V${col.valve ? i + 2 : i + 1}`))
  })
  let z = 1
  if (supply) placed.get(supply.id)!.tag = `0Z${z++}`
  for (const n of prep) if (roles.get(n.id) === 'prep') placed.get(n.id)!.tag = `0Z${z++}`

  // ---- 訊號名稱：依欄的順序，氣缸代號 A、B…，電磁線圈 Y1、Y2…（可直接用於程序控制） ----
  const signalParams = new Map<string, Params>()
  let letter = 0
  let coil = 0
  columns.forEach((col) => {
    if (col.actuator && CYLINDER_LETTERS[letter]) signalParams.set(col.actuator.id, { sensor: CYLINDER_LETTERS[letter++] })
    const valve = col.valve
    const spec = valve && (VALVE_SPECS as Readonly<Record<string, ValveSpec>>)[valve.type]
    if (!valve || !spec) return
    const names: Record<string, string> = {}
    if (spec.left.includes('solenoid') && OUTPUT_NAMES[coil]) names.coilL = OUTPUT_NAMES[coil++]
    if (spec.right.includes('solenoid') && OUTPUT_NAMES[coil]) names.coilR = OUTPUT_NAMES[coil++]
    if (Object.keys(names).length) signalParams.set(valve.id, names)
  })

  // ---- 節點 ----
  const flowNodes: CircuitFlowNode[] = []
  const idMap = new Map<string, string>()
  for (const p of placed.values()) {
    const id = newId('n')
    idMap.set(p.node.id, id)
    const instance = mc.nodeInstance[p.node.id]
    const inst = instance ? doc.instances.find((i) => i.id === instance) : undefined
    const product = inst ? products[inst.productId] : undefined
    const node: PneumaticFlowNode = {
      id,
      type: 'pneumatic',
      position: { x: Math.round(p.x), y: Math.round(p.y) },
      data: {
        componentType: p.node.type,
        rotation: 0,
        ...(p.tag && { tag: p.tag }),
        ...(p.labelSide && { labelSide: p.labelSide }),
        ...(product && { product: { id: product.id, modelCode: product.modelCode, name: product.name } }),
        ...((p.node.params && Object.keys(p.node.params).length) || signalParams.has(p.node.id)
          ? { params: { ...p.node.params, ...signalParams.get(p.node.id) } }
          : {}),
      },
    }
    flowNodes.push(node)
  }

  // ---- 管線：同一個網路的埠由左到右串接 ----
  const edges: TubeFlowEdge[] = []
  const portPos = (e: NetEndpoint) => {
    const p = placed.get(e.node)!
    const g = getSymbol(p.node.type).ports[e.port]
    return { x: p.x + (g?.x ?? 0), y: p.y + (g?.y ?? 0) }
  }
  for (const net of mc.nets) {
    const ends = net.filter((e) => placed.has(e.node) && getSymbol(placed.get(e.node)!.node.type).ports[e.port])
    if (ends.length < 2) continue
    ends.sort((a, b) => portPos(a).x - portPos(b).x || portPos(a).y - portPos(b).y)
    for (let i = 1; i < ends.length; i++) {
      edges.push({
        id: newId('t'),
        type: 'tube',
        source: idMap.get(ends[i - 1].node)!,
        sourceHandle: ends[i - 1].port,
        target: idMap.get(ends[i].node)!,
        targetHandle: ends[i].port,
      })
    }
  }

  // ---- 註解：來源 ----
  const top = Math.min(0, ...[...placed.values()].map((p) => p.y))
  const left = Math.min(0, ...[...placed.values()].map((p) => p.x))
  flowNodes.push({ id: newId('note'), type: 'note', position: { x: left, y: top - 70 }, data: { text: `由 3D 模組「${doc.name}」產生（${today(date)}）` } })

  return { nodes: flowNodes, edges }
}
