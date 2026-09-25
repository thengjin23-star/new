import { SYMBOL_STROKE } from '../../theme'
import { PortLabel, Stub } from './parts'
import type { SymbolDef, SymbolProps } from './types'

/* 氣源：圓內一個空心三角形（空心 = 氣壓；實心為液壓），三角形指向輸出埠 P */
const WIDTH = 48
const HEIGHT = 60
const CX = WIDTH / 2
const CY = 38
const R = 18

function AirSupply({ ports, rotation }: SymbolProps) {
  return (
    <g>
      <Stub x1={CX} y1={0} x2={CX} y2={CY - R} state={ports?.P} />
      <circle cx={CX} cy={CY} r={R} fill="white" stroke={SYMBOL_STROKE} strokeWidth={2} />
      <polygon
        points={`${CX},${CY - 11} ${CX - 9},${CY + 6} ${CX + 9},${CY + 6}`}
        fill="white"
        stroke={SYMBOL_STROKE}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <PortLabel x={CX + 9} y={7} rotation={rotation}>P</PortLabel>
    </g>
  )
}

export const airSupplySymbol: SymbolDef = {
  width: WIDTH,
  height: HEIGHT,
  ports: { P: { x: CX, y: 0, side: 'top' } },
  Symbol: AirSupply,
}
