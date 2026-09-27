import type { ComponentDefinition, ParamDef } from './definition'
import type { Params, ParamValue } from './types'

const EMPTY: Params = Object.freeze({})
const defaultsCache = new WeakMap<ComponentDefinition<unknown>, Params>()
const resolvedCache = new WeakMap<object, Map<ComponentDefinition<unknown>, Params>>()

function coerce(def: ParamDef, value: ParamValue | undefined): ParamValue {
  if (value === undefined) return def.default
  switch (def.kind) {
    case 'number': {
      const n = typeof value === 'number' ? value : Number(value)
      if (!Number.isFinite(n)) return def.default
      return Math.min(def.max ?? Infinity, Math.max(def.min ?? -Infinity, n))
    }
    case 'boolean':
      return typeof value === 'boolean' ? value : value === 'true'
    case 'select': {
      const s = String(value)
      return def.options?.some((o) => o.value === s) ? s : def.default
    }
  }
}

function defaultsOf(def: ComponentDefinition<unknown>): Params {
  let result = defaultsCache.get(def)
  if (!result) {
    result = Object.freeze(Object.fromEntries((def.params ?? []).map((p) => [p.key, p.default])))
    defaultsCache.set(def, result)
  }
  return result
}

/**
 * 套用元件定義的預設值，並把數值夾在允許範圍內。
 * 定義中沒有的 key 原樣保留（例如產品帶來的額外資訊）。
 * 以覆寫物件本身為快取 key：模擬期間電路快照不變，每幀不必重算。
 */
export function resolveParams(def: ComponentDefinition<unknown>, overrides?: Params): Params {
  if (!def.params?.length && !overrides) return EMPTY
  if (!overrides) return defaultsOf(def)
  let byDef = resolvedCache.get(overrides)
  const cached = byDef?.get(def)
  if (cached) return cached
  const result: Record<string, ParamValue> = { ...overrides }
  for (const p of def.params ?? []) result[p.key] = coerce(p, overrides[p.key])
  const frozen = Object.freeze(result)
  if (!byDef) resolvedCache.set(overrides, (byDef = new Map()))
  byDef.set(def, frozen)
  return frozen
}

/** 讀取數值參數；缺少或型別不符時回傳 fallback */
export function numParam(params: Params | undefined, key: string, fallback: number): number {
  const v = params?.[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}
