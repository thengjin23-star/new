import { SYMBOL_STROKE } from '../../theme'
import { Stub } from './parts'
import type { SymbolDef, SymbolProps } from './types'

/* 排氣口：短管末端一個朝外的空心三角形（不接管、直接通大氣） */
const E_W = 40
const E_H = 44
const E_CX = E_W / 2

function Exhaust({ ports }: SymbolProps) {
  return (
    <g>
      <Stub x1={E_CX} y1={0} x2={E_CX} y2={22} state={ports?.E} />
      <polygon
        points={`${E_CX - 10},${22} ${E_CX + 10},${22} ${E_CX},${38}`}
        fill="white"
        stroke={SYMBOL_STROKE}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </g>
  )
}

export const exhaustSymbol: SymbolDef = {
  width: E_W,
  height: E_H,
  ports: { E: { x: E_CX, y: 0, side: 'top' } },
  Symbol: Exhaust,
}

/* 消音器：短管接到內含斜線的消音器本體 */
const BODY_Y = 16
const BODY_W = 24
const BODY_H = 22

function Silencer({ ports }: SymbolProps) {
  const left = E_CX - BODY_W / 2
  return (
    <g>
      <Stub x1={E_CX} y1={0} x2={E_CX} y2={BODY_Y} state={ports?.E} />
      <rect x={left} y={BODY_Y} width={BODY_W} height={BODY_H} fill="white" stroke={SYMBOL_STROKE} strokeWidth={2} />
      <g stroke={SYMBOL_STROKE} strokeWidth={1.5}>
        {[0, 8, 16].map((dx) => (
          <line key={dx} x1={left + dx + 2} y1={BODY_Y + BODY_H - 3} x2={left + dx + 8} y2={BODY_Y + 3} />
        ))}
      </g>
    </g>
  )
}

export const silencerSymbol: SymbolDef = { ...exhaustSymbol, Symbol: Silencer }

/* 塞頭：短管末端一條粗橫線 */
const P_W = 32
const P_H = 28

function Plug({ ports }: SymbolProps) {
  return (
    <g>
      <Stub x1={P_W / 2} y1={0} x2={P_W / 2} y2={16} state={ports?.P} />
      <line x1={P_W / 2 - 10} y1={17} x2={P_W / 2 + 10} y2={17} stroke={SYMBOL_STROKE} strokeWidth={4} />
    </g>
  )
}

export const plugSymbol: SymbolDef = {
  width: P_W,
  height: P_H,
  ports: { P: { x: P_W / 2, y: 0, side: 'top' } },
  Symbol: Plug,
}
