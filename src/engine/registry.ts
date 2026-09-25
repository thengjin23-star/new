import { builtinComponents } from './components'
import type { ComponentDefinition } from './definition'

export interface ComponentRegistry {
  /** 取得元件定義；type 不存在時丟出錯誤 */
  get(type: string): ComponentDefinition<unknown>
  has(type: string): boolean
  list(): readonly ComponentDefinition<unknown>[]
}

export function createRegistry(defs: readonly ComponentDefinition<unknown>[]): ComponentRegistry {
  const map = new Map<string, ComponentDefinition<unknown>>()
  for (const def of defs) {
    if (map.has(def.type)) throw new Error(`元件 type 重複：${def.type}`)
    map.set(def.type, def)
  }
  const list = [...map.values()]
  return {
    get(type) {
      const def = map.get(type)
      if (!def) throw new Error(`未知的元件 type：${type}`)
      return def
    },
    has: (type) => map.has(type),
    list: () => list,
  }
}

/** 內建元件的預設註冊表 */
export const registry: ComponentRegistry = createRegistry(builtinComponents)
