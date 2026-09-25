import { airSupplySymbol } from './AirSupplySymbol'
import { cylinderDoubleSymbol } from './CylinderDoubleSymbol'
import { exhaustSymbol } from './ExhaustSymbol'
import type { SymbolDef } from './types'
import { valve52Symbol } from './Valve52Symbol'

/**
 * 元件外觀註冊表：以與引擎註冊表（src/engine/registry.ts）相同的 type 為 key。
 * 新增元件時兩邊各加一筆；symbolRegistry.test.ts 會檢查兩者一致。
 */
export const symbolRegistry: Readonly<Record<string, SymbolDef>> = {
  airSupply: airSupplySymbol,
  valve52Manual: valve52Symbol,
  cylinderDouble: cylinderDoubleSymbol,
  exhaust: exhaustSymbol,
}

export function getSymbol(type: string): SymbolDef {
  const def = symbolRegistry[type]
  if (!def) throw new Error(`元件 ${type} 沒有對應的符號`)
  return def
}
