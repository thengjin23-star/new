import { registry, resolveParams, type Params } from '../engine'
import { isPneumaticNode, type CircuitFlowNode } from './flow'

/**
 * 自動指定訊號名稱：新加入（或貼上）的元件，電磁線圈接下一個沒用過的輸出（Y1、Y2…）、
 * 氣缸給下一個代號（A、B…，感測器 a0／a1）、壓力開關給下一個 PS 編號。
 * 已經指定且沒有和別的元件重複的名稱保持不變。
 */
const NAMESPACE: Readonly<Record<string, 'coil' | 'sensor' | 'switch'>> = {
  coilL: 'coil',
  coilR: 'coil',
  sensor: 'sensor',
  signal: 'switch',
}

/** 電路中每一類名稱已使用的值 */
function usedNames(nodes: readonly CircuitFlowNode[], except?: ReadonlySet<string>): Record<'coil' | 'sensor' | 'switch', Set<string>> {
  const used = { coil: new Set<string>(), sensor: new Set<string>(), switch: new Set<string>() }
  for (const n of nodes) {
    if (!isPneumaticNode(n) || except?.has(n.id) || !registry.has(n.data.componentType)) continue
    const def = registry.get(n.data.componentType)
    const params = resolveParams(def, n.data.params)
    for (const p of def.params ?? []) {
      const ns = NAMESPACE[p.key]
      const v = params[p.key]
      if (ns && typeof v === 'string' && v) used[ns].add(v)
    }
  }
  return used
}

/** 回傳加上（或修正）訊號名稱後的參數；沒有訊號參數的元件原樣回傳 */
export function assignSignalNames(
  nodes: readonly CircuitFlowNode[],
  type: string,
  params: Params | undefined,
  except?: ReadonlySet<string>,
): Params | undefined {
  if (!registry.has(type)) return params
  const def = registry.get(type)
  const keys = (def.params ?? []).filter((p) => NAMESPACE[p.key])
  if (!keys.length) return params
  const used = usedNames(nodes, except)
  const resolved = resolveParams(def, params)
  const next: Record<string, Params[string]> = { ...params }
  for (const p of keys) {
    const pool = used[NAMESPACE[p.key]]
    const current = resolved[p.key]
    if (typeof current === 'string' && current && !pool.has(current)) {
      // 預設值也寫明，之後預設改變也不影響這個元件
      next[p.key] = current
      pool.add(current)
      continue
    }
    const free = p.options?.map((o) => o.value).find((v) => v && !pool.has(v))
    if (free) {
      next[p.key] = free
      pool.add(free)
    }
  }
  return next
}
