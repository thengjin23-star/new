import type { CylinderState, PortState } from '../../engine'
import { CHAMBER_PRESSURE_FILL, SYMBOL_STROKE } from '../../theme'
import { PortLabel, Stub } from './parts'
import type { SymbolDef, SymbolProps } from './types'

/*
 * 雙動氣缸：缸筒、活塞、活塞桿。A 為後端（無桿側）、B 為前端（有桿側）。
 * 活塞位置直接取自引擎（以 requestAnimationFrame 逐幀推進），因此不需要 CSS transition。
 */
const BARREL_X = 8
const BARREL_W = 140
const BARREL_Y = 6
const BARREL_H = 36
const PISTON_MIN_X = 24
const TRAVEL = 102
const PISTON_W = 6
const ROD_LEN = 150
const ROD_H = 6
const PORT_A_X = 18
const PORT_B_X = 138
const WIDTH = PISTON_MIN_X + TRAVEL + PISTON_W + ROD_LEN + 8
const HEIGHT = 64
const BARREL_BOTTOM = BARREL_Y + BARREL_H

const chamberFill = (state: PortState | undefined) => (state === 'pressure' ? CHAMBER_PRESSURE_FILL : 'white')

function CylinderDouble({ state, ports, rotation }: SymbolProps) {
  const { piston } = state as CylinderState
  const px = PISTON_MIN_X + piston * TRAVEL
  const rodY = BARREL_Y + BARREL_H / 2 - ROD_H / 2
  const rodEnd = px + PISTON_W + ROD_LEN

  return (
    <g>
      <Stub x1={PORT_A_X} y1={BARREL_BOTTOM} x2={PORT_A_X} y2={HEIGHT} state={ports?.A} />
      <Stub x1={PORT_B_X} y1={BARREL_BOTTOM} x2={PORT_B_X} y2={HEIGHT} state={ports?.B} />

      {/* 兩個腔室：有壓時填淺藍 */}
      <rect x={BARREL_X} y={BARREL_Y} width={px - BARREL_X} height={BARREL_H} fill={chamberFill(ports?.A)} />
      <rect
        x={px + PISTON_W}
        y={BARREL_Y}
        width={BARREL_X + BARREL_W - px - PISTON_W}
        height={BARREL_H}
        fill={chamberFill(ports?.B)}
      />
      <rect x={BARREL_X} y={BARREL_Y} width={BARREL_W} height={BARREL_H} fill="none" stroke={SYMBOL_STROKE} strokeWidth={2} />

      {/* 活塞桿（穿出前端蓋）與桿端 */}
      <rect x={px + PISTON_W} y={rodY} width={ROD_LEN} height={ROD_H} fill={SYMBOL_STROKE} />
      <rect x={rodEnd - 4} y={rodY - 5} width={4} height={ROD_H + 10} fill={SYMBOL_STROKE} />
      {/* 活塞 */}
      <rect x={px} y={BARREL_Y + 1} width={PISTON_W} height={BARREL_H - 2} fill={SYMBOL_STROKE} />

      <PortLabel x={PORT_A_X + 10} y={HEIGHT - 8} rotation={rotation}>A</PortLabel>
      <PortLabel x={PORT_B_X - 10} y={HEIGHT - 8} rotation={rotation}>B</PortLabel>
    </g>
  )
}

export const cylinderDoubleSymbol: SymbolDef = {
  width: WIDTH,
  height: HEIGHT,
  ports: {
    A: { x: PORT_A_X, y: HEIGHT, side: 'bottom' },
    B: { x: PORT_B_X, y: HEIGHT, side: 'bottom' },
  },
  Symbol: CylinderDouble,
}
