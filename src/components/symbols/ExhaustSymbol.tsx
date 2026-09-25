import { SYMBOL_STROKE } from '../../theme'
import { Stub } from './parts'
import type { SymbolDef, SymbolProps } from './types'

/* 排氣口／消音器：短管接到內含斜線的消音器本體 */
const WIDTH = 40
const HEIGHT = 44
const CX = WIDTH / 2
const BODY_Y = 16
const BODY_W = 24
const BODY_H = 22

function Exhaust({ ports }: SymbolProps) {
  const left = CX - BODY_W / 2
  return (
    <g>
      <Stub x1={CX} y1={0} x2={CX} y2={BODY_Y} state={ports?.E} />
      <rect x={left} y={BODY_Y} width={BODY_W} height={BODY_H} fill="white" stroke={SYMBOL_STROKE} strokeWidth={2} />
      <g stroke={SYMBOL_STROKE} strokeWidth={1.5}>
        {[0, 8, 16].map((dx) => (
          <line key={dx} x1={left + dx + 2} y1={BODY_Y + BODY_H - 3} x2={left + dx + 8} y2={BODY_Y + 3} />
        ))}
      </g>
    </g>
  )
}

export const exhaustSymbol: SymbolDef = {
  width: WIDTH,
  height: HEIGHT,
  ports: { E: { x: CX, y: 0, side: 'top' } },
  Symbol: Exhaust,
}
