import { registry as defaultRegistry, type ComponentRegistry } from './registry'
import { portKey, type Circuit, type PortKey } from './types'

function connectedPorts(circuit: Circuit): Set<PortKey> {
  const connected = new Set<PortKey>()
  for (const tube of circuit.tubes) {
    connected.add(tube.from)
    connected.add(tube.to)
  }
  return connected
}

/**
 * 找出沒有接任何管線的排氣埠（role 為 'exhaust'，例如 5/2 閥的 EA/EB）。
 *
 * 引擎採嚴格語意：排氣埠必須實際接到排氣口才算通大氣。
 * 這個函式讓 UI 在模擬時標示出來，使用者才知道氣缸為什麼不動。
 */
export function findUnconnectedExhaustPorts(
  circuit: Circuit,
  reg: ComponentRegistry = defaultRegistry,
): PortKey[] {
  const connected = connectedPorts(circuit)
  const result: PortKey[] = []
  for (const node of circuit.nodes) {
    for (const port of reg.get(node.type).ports) {
      const key = portKey(node.id, port.id)
      if (port.role === 'exhaust' && !connected.has(key)) result.push(key)
    }
  }
  return result
}

/** 找出所有沒有接管線的埠（編輯時的檢查清單用） */
export function findUnconnectedPorts(circuit: Circuit, reg: ComponentRegistry = defaultRegistry): PortKey[] {
  const connected = connectedPorts(circuit)
  const result: PortKey[] = []
  for (const node of circuit.nodes) {
    for (const port of reg.get(node.type).ports) {
      const key = portKey(node.id, port.id)
      if (!connected.has(key)) result.push(key)
    }
  }
  return result
}
