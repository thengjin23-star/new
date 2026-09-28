import { registry, resolveParams, sensorName, strParam } from '../engine'
import { isPneumaticNode, type CircuitFlowNode } from './flow'

/** 電路中可用的訊號：電氣輸出（線圈 Y1…）與感測訊號（a0、a1…、PS1…） */
export interface CircuitSignalNames {
  outputs: string[]
  sensors: string[]
}

const byNumber = (a: string, b: string) => (Number(a.replace(/\D/g, '')) || 0) - (Number(b.replace(/\D/g, '')) || 0) || a.localeCompare(b)

export function circuitSignalNames(nodes: readonly CircuitFlowNode[]): CircuitSignalNames {
  const outputs = new Set<string>()
  const sensors = new Set<string>()
  const switches = new Set<string>()
  for (const n of nodes) {
    if (!isPneumaticNode(n) || !registry.has(n.data.componentType)) continue
    const def = registry.get(n.data.componentType)
    const params = resolveParams(def, n.data.params)
    for (const key of ['coilL', 'coilR']) {
      const name = strParam(params, key)
      if (name && def.params?.some((p) => p.key === key)) outputs.add(name)
    }
    const letter = strParam(params, 'sensor')
    if (letter && def.category === 'actuator') {
      sensors.add(sensorName(letter, 0))
      sensors.add(sensorName(letter, 1))
    }
    if (n.data.componentType === 'pressureSwitch') {
      const name = strParam(params, 'signal')
      if (name) switches.add(name)
    }
  }
  return { outputs: [...outputs].sort(byNumber), sensors: [...[...sensors].sort(), ...[...switches].sort(byNumber)] }
}

/** 訊號的說明（提示文字） */
export function describeSignal(name: string): string {
  const neg = name.startsWith('!')
  const base = neg ? name.slice(1) : name
  let text = base
  const sensor = /^([a-h])([01])$/.exec(base)
  if (sensor) text = `氣缸 ${sensor[1].toUpperCase()} ${sensor[2] === '0' ? '縮回端' : '伸出端'}（${base}）`
  else if (/^Y\d+$/.test(base)) text = `輸出 ${base}`
  else if (/^PS\d+$/.test(base)) text = `壓力開關 ${base}`
  return neg ? `${text}不成立` : text
}
