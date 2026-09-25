import { registry as defaultRegistry, type ComponentRegistry } from './registry'
import {
  portKey,
  type Circuit,
  type ComponentStates,
  type PortKey,
  type PortState,
  type SolveResult,
} from './types'

/** 在無向圖上從多個起點做廣度優先走訪，回傳所有可達的節點 */
function reachable(adjacency: ReadonlyMap<PortKey, PortKey[]>, starts: readonly PortKey[]): Set<PortKey> {
  const seen = new Set<PortKey>(starts)
  const queue = [...starts]
  for (let i = 0; i < queue.length; i++) {
    for (const next of adjacency.get(queue[i]) ?? []) {
      if (!seen.has(next)) {
        seen.add(next)
        queue.push(next)
      }
    }
  }
  return seen
}

/**
 * 依目前的元件狀態，算出每個埠與每條管線的壓力狀態。
 *
 * 1. 建立無向圖：節點 = 所有埠；邊 = 管線 ∪ 各元件目前的內部通路
 * 2. 從所有氣源埠走訪 → 有壓集合
 * 3. 從所有排氣埠走訪 → 通大氣集合
 * 4. 有壓優先（氣源直接對著排氣口吹，仍視為有壓）
 *
 * 管線是圖上的一條邊，兩端必在同一個連通分量，因此管線狀態 = 端點狀態。
 * 端點找不到的管線（例如元件剛被刪除）會被忽略並視為封閉。
 */
export function solve(
  circuit: Circuit,
  componentStates: ComponentStates,
  reg: ComponentRegistry = defaultRegistry,
): SolveResult {
  const adjacency = new Map<PortKey, PortKey[]>()
  const sources: PortKey[] = []
  const vents: PortKey[] = []

  const link = (a: PortKey, b: PortKey) => {
    adjacency.get(a)!.push(b)
    adjacency.get(b)!.push(a)
  }

  for (const node of circuit.nodes) {
    const def = reg.get(node.type)
    const state = componentStates[node.id] ?? def.createState()
    const key = (portId: string) => portKey(node.id, portId)

    for (const port of def.ports) adjacency.set(key(port.id), [])
    for (const [a, b] of def.getInternalPaths(state)) link(key(a), key(b))
    for (const p of def.getSourcePorts?.(state) ?? []) sources.push(key(p))
    for (const p of def.getExhaustPorts?.(state) ?? []) vents.push(key(p))
  }

  for (const tube of circuit.tubes) {
    if (adjacency.has(tube.from) && adjacency.has(tube.to)) link(tube.from, tube.to)
  }

  const pressurized = reachable(adjacency, sources)
  const vented = reachable(adjacency, vents)

  const portStates: Record<PortKey, PortState> = {}
  for (const key of adjacency.keys()) {
    portStates[key] = pressurized.has(key) ? 'pressure' : vented.has(key) ? 'exhaust' : 'blocked'
  }

  const tubeStates: Record<string, PortState> = {}
  for (const tube of circuit.tubes) {
    tubeStates[tube.id] = portStates[tube.from] ?? 'blocked'
  }

  return { portStates, tubeStates }
}
