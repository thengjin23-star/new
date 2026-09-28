import type { CylinderState } from '../../engine'
import { SYMBOL_STROKE } from '../../theme'
import {
  BARREL_H,
  BARREL_W,
  BARREL_X,
  BARREL_Y,
  chamberFill,
  CYLINDER_HEIGHT,
  CYLINDER_WIDTH,
  PISTON_MIN_X,
  PISTON_W,
  PORT_A_X,
  ROD_H,
  ROD_LEN,
  SensorMarks,
  TRAVEL,
} from './CylinderDoubleSymbol'
import { PortLabel, Stub } from './parts'
import type { SymbolDef, SymbolProps } from './types'

/*
 * 單動氣缸（彈簧復歸）：與雙動氣缸同尺寸，只有後端 A 埠；
 * 有桿側畫彈簧，活塞伸出時彈簧被壓縮。
 */
function CylinderSingle({ state, ports, rotation, flip, labels, params }: SymbolProps) {
  const { piston } = state as CylinderState
  const px = PISTON_MIN_X + piston * TRAVEL
  const rodY = BARREL_Y + BARREL_H / 2 - ROD_H / 2
  const rodEnd = px + PISTON_W + ROD_LEN
  const springStart = px + PISTON_W
  const springEnd = BARREL_X + BARREL_W - 2
  const coils = 7
  const mid = BARREL_Y + BARREL_H / 2
  const points: string[] = [`${springStart},${mid}`]
  for (let i = 1; i < coils * 2; i++) {
    const x = springStart + ((springEnd - springStart) * i) / (coils * 2)
    points.push(`${x},${mid + (i % 2 ? -13 : 13)}`)
  }
  points.push(`${springEnd},${mid}`)

  return (
    <g>
      <Stub x1={PORT_A_X} y1={BARREL_Y + BARREL_H} x2={PORT_A_X} y2={CYLINDER_HEIGHT} state={ports?.A} />
      <rect x={BARREL_X} y={BARREL_Y} width={px - BARREL_X} height={BARREL_H} fill={chamberFill(ports?.A)} />
      <rect x={BARREL_X} y={BARREL_Y} width={BARREL_W} height={BARREL_H} fill="none" stroke={SYMBOL_STROKE} strokeWidth={2} />
      <polyline points={points.join(' ')} fill="none" stroke="#64748b" strokeWidth={1.3} strokeLinejoin="round" />
      <rect x={px + PISTON_W} y={rodY} width={ROD_LEN} height={ROD_H} fill={SYMBOL_STROKE} />
      <rect x={rodEnd - 4} y={rodY - 5} width={4} height={ROD_H + 10} fill={SYMBOL_STROKE} />
      <rect x={px} y={BARREL_Y + 1} width={PISTON_W} height={BARREL_H - 2} fill={SYMBOL_STROKE} />
      <SensorMarks params={params} piston={piston} simulating={!!ports} rotation={rotation} flip={flip} />
      <PortLabel x={PORT_A_X + 10} y={CYLINDER_HEIGHT - 8} rotation={rotation} flip={flip}>
        {labels?.A ?? 'A'}
      </PortLabel>
    </g>
  )
}

export const cylinderSingleSymbol: SymbolDef = {
  width: CYLINDER_WIDTH,
  height: CYLINDER_HEIGHT,
  ports: { A: { x: PORT_A_X, y: CYLINDER_HEIGHT, side: 'bottom' } },
  Symbol: CylinderSingle,
}
