import type { InteractAction } from './definition'
import { resolveParams } from './params'
import { registry as defaultRegistry, type ComponentRegistry } from './registry'
import { solve } from './solve'
import { portKey, type Circuit, type PortState, type SimState } from './types'

/** 建立模擬起始狀態：每個元件回到初始狀態，尚未計算壓力 */
export function createInitialState(circuit: Circuit, reg: ComponentRegistry = defaultRegistry): SimState {
  const componentStates: Record<string, unknown> = {}
  for (const node of circuit.nodes) {
    const def = reg.get(node.type)
    componentStates[node.id] = def.createState(resolveParams(def, node.params))
  }
  return { time: 0, componentStates, portStates: {}, tubeStates: {}, supplyFlow: {}, ventFlow: {}, pressure: {} }
}

/**
 * 推進模擬一幀（純函式：不修改輸入，相同輸入必得相同輸出）。
 *
 * 1. 以目前的元件狀態 solve，得到本幀開始時各埠的壓力
 * 2. 依這些壓力呼叫各元件的 update（例如氣缸活塞移動）
 * 3. 以更新後的元件狀態再 solve 一次
 *
 * 第 3 步確保回傳的 portStates 描述的就是回傳的 componentStates；
 * 之後加入會改變連通關係的元件（如極限開關）時，這個順序才正確。
 */
export function step(
  circuit: Circuit,
  state: SimState,
  dt: number,
  reg: ComponentRegistry = defaultRegistry,
): SimState {
  const seconds = Number.isFinite(dt) && dt > 0 ? dt : 0
  const before = solve(circuit, state.componentStates, reg)

  const componentStates: Record<string, unknown> = {}
  for (const node of circuit.nodes) {
    const def = reg.get(node.type)
    const params = resolveParams(def, node.params)
    const current = state.componentStates[node.id] ?? def.createState(params)
    if (!def.update) {
      componentStates[node.id] = current
      continue
    }
    const ports: Record<string, PortState> = {}
    const supplyFlow: Record<string, number> = {}
    const ventFlow: Record<string, number> = {}
    const pressure: Record<string, number> = {}
    for (const port of def.ports) {
      const key = portKey(node.id, port.id)
      ports[port.id] = before.portStates[key] ?? 'blocked'
      supplyFlow[port.id] = before.supplyFlow[key] ?? 0
      ventFlow[port.id] = before.ventFlow[key] ?? 0
      pressure[port.id] = before.pressure[key] ?? 0
    }
    componentStates[node.id] = def.update({ state: current, dt: seconds, ports, supplyFlow, ventFlow, pressure, params })
  }

  return { time: state.time + seconds, componentStates, ...solve(circuit, componentStates, reg) }
}

/**
 * 使用者操作某個元件（點擊閥門、點擊線圈、按住按鈕…）。
 * 回傳新的模擬狀態並立即重算壓力，暫停中操作也能馬上看到管線顏色變化。
 * 元件不可互動或不存在時，原封不動回傳 state。
 */
export function interact(
  circuit: Circuit,
  state: SimState,
  nodeId: string,
  reg: ComponentRegistry = defaultRegistry,
  action: InteractAction = 'toggle',
): SimState {
  const node = circuit.nodes.find((n) => n.id === nodeId)
  if (!node) return state
  const def = reg.get(node.type)
  if (!def.onInteract) return state

  const params = resolveParams(def, node.params)
  const current = state.componentStates[nodeId] ?? def.createState(params)
  const next = def.onInteract(current, action, params)
  if (next === current) return state
  const componentStates = { ...state.componentStates, [nodeId]: next }
  return { ...state, componentStates, ...solve(circuit, componentStates, reg) }
}

export function isInteractive(type: string, reg: ComponentRegistry = defaultRegistry): boolean {
  return reg.has(type) && reg.get(type).onInteract !== undefined
}
