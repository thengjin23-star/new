import { createInitialState, DEFAULT_SUPPLY_PRESSURE, numParam, portKey, registry, resolveParams, step, strParam, type Circuit } from '../engine'
import { isPneumaticNode, toCircuit, type CircuitFlowNode, type TubeFlowEdge } from '../store/flow'
import { cylinderSpecOf, loadSpecOf, type SizingInput, type SizingSettings } from './sizing'

/**
 * 迴路圖的氣缸 → 選型計算的輸入。
 *
 * 計算壓力：設定中有指定就用指定值；否則取初始狀態下氣缸埠的壓力（會反映調壓閥的設定），
 * 氣缸埠都沒有壓力時（例如 5/3 中位封閉）改用氣源壓力。迴路圖沒有管長，配管容積依設定的長度估算。
 */
export function circuitSizingInputs(nodes: readonly CircuitFlowNode[], edges: readonly TubeFlowEdge[], settings: SizingSettings = {}): SizingInput[] {
  const circuit = toCircuit(nodes, edges)
  const pressure = circuitPressure(circuit)
  const out: SizingInput[] = []
  for (const n of nodes) {
    if (!isPneumaticNode(n) || !registry.has(n.data.componentType)) continue
    const def = registry.get(n.data.componentType)
    if (def.category !== 'actuator') continue
    const params = resolveParams(def, n.data.params)
    const letter = strParam(params, 'sensor') || undefined
    const tag = n.data.tag || undefined
    out.push({
      id: n.id,
      label: letter ? `${letter}${tag ? `（${tag}）` : ''}` : (tag ?? def.label),
      letter,
      model: n.data.product?.modelCode,
      cylinder: cylinderSpecOf(n.data.componentType, params),
      load: loadSpecOf(params),
      pressure: settings.pressure ?? pressure(n.id, def.ports.map((p) => p.id)),
    })
  }
  return sortInputs(out)
}

/** 由迴路算出每個元件的計算壓力：埠的最高壓力，沒有時用氣源壓力 */
export function circuitPressure(circuit: Circuit): (nodeId: string, ports: readonly string[]) => number {
  const state = circuit.nodes.length ? step(circuit, createInitialState(circuit), 0) : undefined
  const supplies = circuit.nodes.filter((n) => n.type === 'airSupply').map((n) => numParam(resolveParams(registry.get(n.type), n.params), 'pressure', DEFAULT_SUPPLY_PRESSURE))
  const supply = supplies.length ? Math.max(...supplies) : DEFAULT_SUPPLY_PRESSURE
  return (nodeId, ports) => {
    const p = Math.max(0, ...ports.map((port) => state?.pressure[portKey(nodeId, port)] ?? 0))
    return p > 0 ? p : supply
  }
}

/** 依氣缸代號排序，沒有代號的依名稱排在後面 */
export function sortInputs(inputs: SizingInput[]): SizingInput[] {
  return inputs.sort((a, b) => (a.letter ?? `~${a.label}`).localeCompare(b.letter ?? `~${b.label}`))
}
