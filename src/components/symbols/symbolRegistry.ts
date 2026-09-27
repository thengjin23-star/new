import { filterSymbol, frlSymbol, lubricatorSymbol, pressureGaugeSymbol, regulatorSymbol } from './AirPrepSymbol'
import { airSupplySymbol } from './AirSupplySymbol'
import { cylinderDoubleSymbol } from './CylinderDoubleSymbol'
import { cylinderSingleSymbol } from './CylinderSingleSymbol'
import { exhaustSymbol, plugSymbol, silencerSymbol } from './ExhaustSymbol'
import { checkValveSymbol, flowControlSymbol, throttleSymbol } from './FlowControlSymbol'
import type { SymbolDef } from './types'
import { valveSymbols } from './ValveSymbol'

/**
 * 元件外觀註冊表：以與引擎註冊表（src/engine/registry.ts）相同的 type 為 key。
 * 新增元件時兩邊各加一筆；symbolRegistry.test.ts 會檢查兩者一致。
 */
export const symbolRegistry: Readonly<Record<string, SymbolDef>> = {
  airSupply: airSupplySymbol,
  filter: filterSymbol,
  regulator: regulatorSymbol,
  lubricator: lubricatorSymbol,
  frl: frlSymbol,
  pressureGauge: pressureGaugeSymbol,
  ...valveSymbols,
  checkValve: checkValveSymbol,
  flowControl: flowControlSymbol,
  throttle: throttleSymbol,
  cylinderDouble: cylinderDoubleSymbol,
  cylinderSingle: cylinderSingleSymbol,
  exhaust: exhaustSymbol,
  silencer: silencerSymbol,
  plug: plugSymbol,
}

export function getSymbol(type: string): SymbolDef {
  const def = symbolRegistry[type]
  if (!def) throw new Error(`元件 ${type} 沒有對應的符號`)
  return def
}
