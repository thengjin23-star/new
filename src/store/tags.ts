import { registry, type ComponentCategory } from '../engine'
import { isPneumaticNode, type CircuitFlowNode } from './flow'

/**
 * 元件標號（ISO 1219-2 風格）：迴路編號 + 元件代碼 + 序號。
 * - 致動器 A：每支致動器一個迴路編號（1A1、2A1…）
 * - 閥與流量控制 V：1V1、1V2…
 * - 氣源與氣源處理 Z：0Z1、0Z2…
 * - 排氣口、消音器、塞頭不自動編號
 */
const CODE: Record<ComponentCategory, 'A' | 'V' | 'Z' | undefined> = {
  source: 'Z',
  valve: 'V',
  flow: 'V',
  actuator: 'A',
  misc: undefined,
}

function usedTags(nodes: readonly CircuitFlowNode[]): Set<string> {
  return new Set(nodes.filter(isPneumaticNode).flatMap((n) => (n.data.tag ? [n.data.tag.toUpperCase()] : [])))
}

/** 為新加入的元件產生不重複的標號；不需要標號的元件回傳 undefined */
export function nextTag(nodes: readonly CircuitFlowNode[], type: string): string | undefined {
  if (!registry.has(type)) return undefined
  const code = CODE[registry.get(type).category]
  if (!code) return undefined
  const used = usedTags(nodes)
  if (code === 'A') {
    for (let circuit = 1; ; circuit++) if (!used.has(`${circuit}A1`)) return `${circuit}A1`
  }
  const prefix = code === 'Z' ? '0Z' : '1V'
  for (let k = 1; ; k++) if (!used.has(`${prefix}${k}`)) return `${prefix}${k}`
}

/** 貼上時：標號與既有元件重複就重新編號 */
export function dedupeTag(nodes: readonly CircuitFlowNode[], type: string, tag: string | undefined): string | undefined {
  if (!tag) return tag
  return usedTags(nodes).has(tag.toUpperCase()) ? nextTag(nodes, type) : tag
}
