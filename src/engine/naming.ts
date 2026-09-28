import { resolveParams } from './params'
import { registry as defaultRegistry, type ComponentRegistry } from './registry'
import type { Params } from './types'

/**
 * 訊號名稱的自動指定：電磁線圈接下一個沒用過的輸出（Y1、Y2…）、氣缸給下一個代號（A、B…）、
 * 壓力開關給下一個 PS 編號。同一個命名空間內的名稱不重複。
 */
export type SignalNamespace = 'coil' | 'sensor' | 'switch'

/** 訊號名稱參數 → 命名空間 */
export const SIGNAL_PARAM_NAMESPACE: Readonly<Record<string, SignalNamespace>> = {
  coilL: 'coil',
  coilR: 'coil',
  sensor: 'sensor',
  signal: 'switch',
}

export type UsedSignalNames = Record<SignalNamespace, Set<string>>

export const emptySignalNames = (): UsedSignalNames => ({ coil: new Set(), sensor: new Set(), switch: new Set() })

export interface NamedNode {
  id: string
  type: string
  params?: Params
}

/** 已使用的名稱（含預設值），except 內的元件不計 */
export function collectSignalNames(nodes: readonly NamedNode[], reg: ComponentRegistry = defaultRegistry, except?: ReadonlySet<string>): UsedSignalNames {
  const used = emptySignalNames()
  for (const n of nodes) {
    if (except?.has(n.id) || !reg.has(n.type)) continue
    const def = reg.get(n.type)
    const params = resolveParams(def, n.params)
    for (const p of def.params ?? []) {
      const ns = SIGNAL_PARAM_NAMESPACE[p.key]
      const v = params[p.key]
      if (ns && typeof v === 'string' && v) used[ns].add(v)
    }
  }
  return used
}

/**
 * 回傳加上（或修正）訊號名稱後的參數：名稱有效且還沒被用過就保留（並寫明，之後預設值改變也不影響），
 * 否則取第一個沒用過的。用掉的名稱會加入 used。沒有訊號參數的元件原樣回傳。
 */
export function withSignalNames(type: string, params: Params | undefined, used: UsedSignalNames, reg: ComponentRegistry = defaultRegistry): Params | undefined {
  if (!reg.has(type)) return params
  const def = reg.get(type)
  const keys = (def.params ?? []).filter((p) => SIGNAL_PARAM_NAMESPACE[p.key])
  if (!keys.length) return params
  const resolved = resolveParams(def, params)
  const next: Record<string, Params[string]> = { ...params }
  for (const p of keys) {
    const pool = used[SIGNAL_PARAM_NAMESPACE[p.key]]
    const current = resolved[p.key]
    if (typeof current === 'string' && current && !pool.has(current)) {
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

/**
 * 一次替多個元件補上缺少的訊號名稱（依陣列順序）：參數中已經寫明的名稱（包括刻意留空的「手動」「無」）
 * 一律保留，只替沒有寫明的補上預設值或第一個沒用過的名稱。
 * 回傳每個元件新補上的名稱（沒有要補的元件不在結果中）。
 */
export function fillSignalNames(nodes: readonly NamedNode[], reg: ComponentRegistry = defaultRegistry): Map<string, Record<string, string>> {
  const used = emptySignalNames()
  const missing: { id: string; key: string; ns: SignalNamespace; fallback: string; options: readonly string[] }[] = []
  for (const n of nodes) {
    if (!reg.has(n.type)) continue
    for (const p of reg.get(n.type).params ?? []) {
      const ns = SIGNAL_PARAM_NAMESPACE[p.key]
      if (!ns) continue
      const v = n.params?.[p.key]
      if (typeof v === 'string') {
        if (v) used[ns].add(v)
        continue
      }
      missing.push({
        id: n.id,
        key: p.key,
        ns,
        fallback: typeof p.default === 'string' ? p.default : '',
        options: (p.options ?? []).map((o) => o.value),
      })
    }
  }
  const result = new Map<string, Record<string, string>>()
  for (const m of missing) {
    const pool = used[m.ns]
    const name = m.fallback && !pool.has(m.fallback) ? m.fallback : m.options.find((v) => v && !pool.has(v))
    if (!name) continue
    pool.add(name)
    result.set(m.id, { ...result.get(m.id), [m.key]: name })
  }
  return result
}
