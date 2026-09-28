import type { InteractAction } from './definition'
import { resolveParams } from './params'
import { registry as defaultRegistry, type ComponentRegistry } from './registry'
import { solve } from './solve'
import { portKey, type Circuit, type ComponentStates, type PortState, type Signals, type SimState, type SolveResult } from './types'

const NO_SIGNALS: Signals = Object.freeze({})

/** 建立模擬起始狀態：每個元件回到初始狀態，尚未計算壓力；電氣輸出全部 OFF */
export function createInitialState(circuit: Circuit, reg: ComponentRegistry = defaultRegistry): SimState {
  const componentStates: Record<string, unknown> = {}
  for (const node of circuit.nodes) {
    const def = reg.get(node.type)
    componentStates[node.id] = def.createState(resolveParams(def, node.params))
  }
  return {
    time: 0,
    componentStates,
    portStates: {},
    tubeStates: {},
    supplyFlow: {},
    ventFlow: {},
    pressure: {},
    outputs: NO_SIGNALS,
    signals: NO_SIGNALS,
  }
}

/**
 * 目前的所有訊號：電氣輸出（Y1…），加上各元件依自己的狀態與埠產生的訊號
 * （氣缸的 a0／a1、壓力開關…）。
 */
export function collectSignals(
  circuit: Circuit,
  componentStates: ComponentStates,
  solved: SolveResult,
  outputs: Signals,
  reg: ComponentRegistry = defaultRegistry,
): Signals {
  let signals: Record<string, boolean> | undefined
  for (const node of circuit.nodes) {
    const def = reg.get(node.type)
    if (!def.getSignals) continue
    const params = resolveParams(def, node.params)
    const state = componentStates[node.id] ?? def.createState(params)
    const ports: Record<string, PortState> = {}
    const pressure: Record<string, number> = {}
    for (const p of def.ports) {
      ports[p.id] = solved.portStates[portKey(node.id, p.id)] ?? 'blocked'
      pressure[p.id] = solved.pressure[portKey(node.id, p.id)] ?? 0
    }
    for (const [name, on] of Object.entries(def.getSignals(state, params, { ports, pressure }))) {
      signals ??= { ...outputs }
      // 同名的訊號（例如兩個壓力開關都叫 PS1）任一成立即成立
      signals[name] = !!signals[name] || on
    }
  }
  return signals ?? outputs
}

/**
 * 推進模擬一幀（純函式：不修改輸入，相同輸入必得相同輸出）。
 *
 * 1. 以目前的元件狀態 solve，得到本幀開始時各埠的壓力，並收集訊號（感測器＋電氣輸出）
 * 2. 依這些壓力與訊號呼叫各元件的 update（例如氣缸活塞移動、電磁線圈依 Y1 動作、氣控閥依先導壓力切換）
 * 3. 以更新後的元件狀態再 solve 一次，並重新收集訊號
 *
 * 第 3 步確保回傳的 portStates 與 signals 描述的就是回傳的 componentStates。
 * dt = 0 時只讓元件依目前的壓力與訊號切換（活塞不動、計時不增加），用於立即套用新的電氣輸出。
 */
export function step(
  circuit: Circuit,
  state: SimState,
  dt: number,
  reg: ComponentRegistry = defaultRegistry,
): SimState {
  const seconds = Number.isFinite(dt) && dt > 0 ? dt : 0
  const outputs = state.outputs ?? NO_SIGNALS
  const before = solve(circuit, state.componentStates, reg)
  const signals = collectSignals(circuit, state.componentStates, before, outputs, reg)

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
    componentStates[node.id] = def.update({ state: current, dt: seconds, ports, supplyFlow, ventFlow, pressure, params, signals })
  }

  const after = solve(circuit, componentStates, reg)
  return {
    time: state.time + seconds,
    componentStates,
    outputs,
    signals: collectSignals(circuit, componentStates, after, outputs, reg),
    ...after,
  }
}

/**
 * 設定電氣輸出（程序控制每一步、或點擊有命名的線圈），並立即讓元件依新的輸出切換。
 * patch 中沒有列出的輸出保持不變。
 */
export function setOutputs(
  circuit: Circuit,
  state: SimState,
  patch: Signals,
  reg: ComponentRegistry = defaultRegistry,
): SimState {
  const current = state.outputs ?? NO_SIGNALS
  if (Object.entries(patch).every(([k, v]) => !!current[k] === v)) return state
  return step(circuit, { ...state, outputs: { ...current, ...patch } }, 0, reg)
}

/**
 * 使用者操作某個元件（點擊閥門、點擊線圈、按住按鈕…）。
 * 回傳新的模擬狀態並立即重算壓力，暫停中操作也能馬上看到管線顏色變化。
 * 元件有命名的電磁線圈時，操作切換的是對應的電氣輸出（接在同一個輸出的線圈一起動作）。
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
  const driven = def.manualOutputs?.(next, params)
  if (driven && Object.keys(driven).length) {
    return step(circuit, { ...state, componentStates, outputs: { ...(state.outputs ?? NO_SIGNALS), ...driven } }, 0, reg)
  }
  const solved = solve(circuit, componentStates, reg)
  return {
    ...state,
    componentStates,
    ...solved,
    signals: collectSignals(circuit, componentStates, solved, state.outputs ?? NO_SIGNALS, reg),
  }
}

export function isInteractive(type: string, reg: ComponentRegistry = defaultRegistry): boolean {
  return reg.has(type) && reg.get(type).onInteract !== undefined
}
