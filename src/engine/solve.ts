import { DEFAULT_SUPPLY_PRESSURE } from './constants'
import { normalizePath } from './definition'
import { widestPaths, type FlowEdge } from './graph'
import { resolveParams } from './params'
import { registry as defaultRegistry, type ComponentRegistry } from './registry'
import {
  portKey,
  type Circuit,
  type ComponentStates,
  type PortKey,
  type PortState,
  type SolveResult,
} from './types'

/**
 * 依目前的元件狀態，算出每個埠與每條管線的壓力狀態。
 *
 * 1. 建立有向圖：節點 = 所有埠；邊 = 管線（雙向）∪ 各元件目前的內部通路（可單向、可節流、可限壓）
 * 2. 從所有氣源埠往前走 → 有壓（供氣能力 > 0）
 * 3. 在反向圖上從所有排氣埠走 → 能排氣（排氣能力 > 0）
 * 4. 有壓優先（氣源直接對著排氣口吹，仍視為有壓）
 *
 * 供氣／排氣能力取沿途最窄處（節流開度），壓力取沿途調壓閥的最低設定，
 * 都以最寬路徑計算（多條並聯路徑取最好的一條）。
 *
 * 管線是雙向全開的邊，兩端必定得到相同結果，因此管線狀態 = 端點狀態。
 * 端點找不到的管線（例如元件剛被刪除）會被忽略並視為封閉。
 */
export function solve(
  circuit: Circuit,
  componentStates: ComponentStates,
  reg: ComponentRegistry = defaultRegistry,
): SolveResult {
  const forward = new Map<PortKey, FlowEdge[]>()
  const backward = new Map<PortKey, FlowEdge[]>()
  const sources = new Map<PortKey, number>()
  const vents = new Map<PortKey, number>()

  const addEdge = (from: PortKey, to: PortKey, capacity: number, maxPressure: number) => {
    if (!(capacity > 0)) return
    forward.get(from)!.push({ to, capacity, maxPressure })
    backward.get(to)!.push({ to: from, capacity, maxPressure })
  }

  for (const node of circuit.nodes) {
    const def = reg.get(node.type)
    const params = resolveParams(def, node.params)
    const state = componentStates[node.id] ?? def.createState(params)
    const key = (portId: string) => portKey(node.id, portId)

    for (const port of def.ports) {
      forward.set(key(port.id), [])
      backward.set(key(port.id), [])
    }
    for (const raw of def.getInternalPaths(state, params)) {
      const path = normalizePath(raw)
      const capacity = Math.min(1, path.capacity ?? 1)
      addEdge(key(path.from), key(path.to), capacity, path.maxPressure ?? Infinity)
      if (!path.oneWay) addEdge(key(path.to), key(path.from), capacity, Infinity)
    }
    const pressure = def.sourcePressure?.(params) ?? DEFAULT_SUPPLY_PRESSURE
    for (const p of def.getSourcePorts?.(state, params) ?? []) sources.set(key(p), pressure)
    for (const p of def.getExhaustPorts?.(state, params) ?? []) vents.set(key(p), 1)
  }

  for (const tube of circuit.tubes) {
    if (forward.has(tube.from) && forward.has(tube.to)) {
      addEdge(tube.from, tube.to, 1, Infinity)
      addEdge(tube.to, tube.from, 1, Infinity)
    }
  }

  const unit = new Map([...sources.keys()].map((k) => [k, 1]))
  const supply = widestPaths(forward, unit, (e) => e.capacity)
  const vent = widestPaths(backward, vents, (e) => e.capacity)
  const level = widestPaths(forward, sources, (e) => e.maxPressure)

  const portStates: Record<PortKey, PortState> = {}
  const supplyFlow: Record<PortKey, number> = {}
  const ventFlow: Record<PortKey, number> = {}
  const pressure: Record<PortKey, number> = {}
  for (const key of forward.keys()) {
    const s = supply.get(key) ?? 0
    const v = vent.get(key) ?? 0
    portStates[key] = s > 0 ? 'pressure' : v > 0 ? 'exhaust' : 'blocked'
    supplyFlow[key] = s
    ventFlow[key] = v
    pressure[key] = s > 0 ? (level.get(key) ?? 0) : 0
  }

  const tubeStates: Record<string, PortState> = {}
  for (const tube of circuit.tubes) {
    tubeStates[tube.id] = portStates[tube.from] ?? 'blocked'
  }

  return { portStates, tubeStates, supplyFlow, ventFlow, pressure }
}
