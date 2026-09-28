import { registry, type CircuitNode } from '../engine'
import { SUPPLY_NODE, type ModuleCircuit, type NetEndpoint } from './moduleCircuit'
import type { ModuleDoc } from './types'

/**
 * 由模組推出的迴路分欄：每顆方向控制閥一欄，加上它驅動的速控閥、氣缸與排氣消音器；
 * 沒有閥驅動的氣缸（或速控閥）各自一欄。欄的順序依閥在模組中的順序。
 * 「產生迴路圖」依欄排版與標號，訊號名稱（氣缸代號、線圈 Y1…）也依欄的順序指定。
 */
export type ModuleRole = 'actuator' | 'flow' | 'valve' | 'vent' | 'prep' | 'supply' | 'other'

export function moduleRoleOf(node: CircuitNode): ModuleRole {
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

export interface ModuleColumn {
  valve?: CircuitNode
  actuator?: CircuitNode
  flows: { node: CircuitNode; actuatorPort?: string; valvePort?: string }[]
  vents: { node: CircuitNode; valvePort: string }[]
}

export interface ModuleColumns {
  columns: ModuleColumn[]
  roles: Map<string, ModuleRole>
  /** 相鄰關係：同一個網路中的兩個端點 */
  neighbors: Map<string, { port: string; other: NetEndpoint }[]>
  /** 零件在模組中的順序（虛擬節點排最後） */
  rank: (id: string) => number
}

export function moduleColumns(mc: ModuleCircuit, doc: Pick<ModuleDoc, 'instances'>): ModuleColumns {
  const nodes = mc.circuit.nodes
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const order = new Map(doc.instances.map((i, k) => [i.id, k]))
  const rank = (id: string) => order.get(id) ?? 1e6
  const roles = new Map(nodes.map((n) => [n.id, moduleRoleOf(n)]))

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

  const assigned = new Set<string>()
  const columns: ModuleColumn[] = []
  const valves = nodes.filter((n) => roles.get(n.id) === 'valve').sort((a, b) => rank(a.id) - rank(b.id))
  for (const valve of valves) {
    const col: ModuleColumn = { valve, flows: [], vents: [] }
    assigned.add(valve.id)
    const def = registry.get(valve.type)
    for (const port of def.ports) {
      for (const other of neighborsVia(valve.id, port.id)) {
        const role = roles.get(other.node)
        const node = byId.get(other.node)!
        if (assigned.has(node.id)) continue
        if (port.role === 'working' && role === 'flow') {
          assigned.add(node.id)
          const entry: ModuleColumn['flows'][number] = { node, valvePort: port.id }
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
  return { columns, roles, neighbors, rank }
}

/**
 * 指定訊號名稱的順序：依欄（每欄先氣缸、再閥），其他元件（壓力開關、氣控閥…）依模組中的順序排在後面。
 * 這樣第 1 欄的氣缸是 A、它的電磁閥線圈是 Y1，與產生的迴路圖一致。
 */
export function signalOrder(mc: ModuleCircuit, layout: Pick<ModuleColumns, 'columns' | 'rank'>): CircuitNode[] {
  const seen = new Set<string>()
  const out: CircuitNode[] = []
  const push = (n: CircuitNode | undefined) => {
    if (!n || seen.has(n.id)) return
    seen.add(n.id)
    out.push(n)
  }
  for (const col of layout.columns) {
    push(col.actuator)
    push(col.valve)
  }
  for (const n of [...mc.circuit.nodes].sort((a, b) => layout.rank(a.id) - layout.rank(b.id))) push(n)
  return out
}
