import { registry, resolveParams, type Params } from '../engine'
import { getSymbol } from './symbols/symbolRegistry'

/** 元件面板用的小型符號預覽 */
export function SymbolPreview({ type, params, className = 'h-10 w-full' }: { type: string; params?: Params; className?: string }) {
  const { width, height, Symbol } = getSymbol(type)
  const def = registry.get(type)
  const resolved = resolveParams(def, params)
  return (
    <svg viewBox={`-4 -4 ${width + 8} ${height + 8}`} className={className} preserveAspectRatio="xMidYMid meet" aria-hidden>
      <Symbol state={def.createState(resolved)} rotation={0} params={resolved} />
    </svg>
  )
}
