import { numParam, strParam, type QuickExhaustState, type ShuttleState } from '../../engine'
import { CHAMBER_PRESSURE_FILL, portColor, SYMBOL_STROKE } from '../../theme'
import { Arrow, PortLabel, Stub, ValueText } from './parts'
import type { SymbolDef, SymbolProps } from './types'

/*
 * 訊號與邏輯元件：梭動閥（OR）、雙壓閥（AND）、快速排氣閥、壓力開關。
 * 梭動閥與雙壓閥的入口 X、Y 在左右兩側，出口 A 在上方；內部的球／滑軸依狀態移動。
 */

const LOGIC_W = 96
const LOGIC_H = 56
const BODY_Y = 18
const BODY_H = 24
const BODY_MID = BODY_Y + BODY_H / 2
const BODY_X0 = 16
const BODY_X1 = LOGIC_W - 16

function LogicValve({ state, ports, rotation, flip, labels, kind }: SymbolProps & { kind: 'or' | 'and' }) {
  const { open } = state as ShuttleState
  // 梭動閥：球被推向「沒有接通」的一側；雙壓閥：滑軸封住先到的一側（接通的是另一側）
  const ballX = open === 'X' ? BODY_X1 - 12 : BODY_X0 + 12
  const color = (p: string) => portColor(ports?.[p])
  return (
    <g>
      <Stub x1={0} y1={BODY_MID} x2={BODY_X0} y2={BODY_MID} state={ports?.X} />
      <Stub x1={BODY_X1} y1={BODY_MID} x2={LOGIC_W} y2={BODY_MID} state={ports?.Y} />
      <Stub x1={LOGIC_W / 2} y1={0} x2={LOGIC_W / 2} y2={BODY_Y} state={ports?.A} />
      <rect x={BODY_X0} y={BODY_Y} width={BODY_X1 - BODY_X0} height={BODY_H} fill="white" stroke={SYMBOL_STROKE} strokeWidth={2} />
      {/* 兩端的閥座 */}
      <polyline points={`${BODY_X0 + 4},${BODY_Y + 4} ${BODY_X0 + 10},${BODY_MID} ${BODY_X0 + 4},${BODY_Y + BODY_H - 4}`} fill="none" stroke={SYMBOL_STROKE} strokeWidth={1.5} />
      <polyline points={`${BODY_X1 - 4},${BODY_Y + 4} ${BODY_X1 - 10},${BODY_MID} ${BODY_X1 - 4},${BODY_Y + BODY_H - 4}`} fill="none" stroke={SYMBOL_STROKE} strokeWidth={1.5} />
      {kind === 'or' ? (
        <circle cx={ballX} cy={BODY_MID} r={6} fill={SYMBOL_STROKE} style={{ transition: 'cx 150ms ease-out' }} />
      ) : (
        <g style={{ transform: `translateX(${ballX - LOGIC_W / 2}px)`, transition: 'transform 150ms ease-out' }}>
          <rect x={LOGIC_W / 2 - 10} y={BODY_MID - 6} width={20} height={12} fill={SYMBOL_STROKE} />
        </g>
      )}
      <line x1={LOGIC_W / 2} y1={BODY_Y} x2={LOGIC_W / 2} y2={BODY_Y + 5} stroke={color('A')} strokeWidth={2} />
      <ValueText x={LOGIC_W / 2} y={LOGIC_H - 6} rotation={rotation} flip={flip} size={9} color="#64748b">
        {kind === 'or' ? '≥1（OR）' : '&（AND）'}
      </ValueText>
      <PortLabel x={7} y={BODY_Y - 6} rotation={rotation} flip={flip}>
        {labels?.X ?? 'X'}
      </PortLabel>
      <PortLabel x={LOGIC_W - 7} y={BODY_Y - 6} rotation={rotation} flip={flip}>
        {labels?.Y ?? 'Y'}
      </PortLabel>
      <PortLabel x={LOGIC_W / 2 + 9} y={7} rotation={rotation} flip={flip}>
        {labels?.A ?? 'A'}
      </PortLabel>
    </g>
  )
}

const logicPorts = {
  X: { x: 0, y: BODY_MID, side: 'left' },
  Y: { x: LOGIC_W, y: BODY_MID, side: 'right' },
  A: { x: LOGIC_W / 2, y: 0, side: 'top' },
} as const

export const shuttleValveSymbol: SymbolDef = {
  width: LOGIC_W,
  height: LOGIC_H,
  ports: logicPorts,
  Symbol: (props) => <LogicValve {...props} kind="or" />,
}

export const twoPressureValveSymbol: SymbolDef = {
  width: LOGIC_W,
  height: LOGIC_H,
  ports: logicPorts,
  Symbol: (props) => <LogicValve {...props} kind="and" />,
}

// ---- 快速排氣閥：P 在左、A 在右、R 在下（排氣三角形） ----

const QE_W = 88
const QE_H = 72
const QE_BODY = { x: 16, y: 12, w: 56, h: 32 }
const QE_MID = QE_BODY.y + QE_BODY.h / 2

function QuickExhaust({ state, ports, rotation, flip, labels }: SymbolProps) {
  const { supplying } = state as QuickExhaustState
  const b = QE_BODY
  const rx = b.x + b.w / 2
  return (
    <g>
      <Stub x1={0} y1={QE_MID} x2={b.x} y2={QE_MID} state={ports?.P} />
      <Stub x1={b.x + b.w} y1={QE_MID} x2={QE_W} y2={QE_MID} state={ports?.A} />
      <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="white" stroke={SYMBOL_STROKE} strokeWidth={2} />
      {supplying ? (
        <Arrow x1={b.x + 6} y1={QE_MID} x2={b.x + b.w - 6} y2={QE_MID} color={portColor(ports?.P)} />
      ) : (
        <>
          <Arrow x1={b.x + b.w - 6} y1={QE_MID} x2={rx + 2} y2={QE_MID} color={portColor(ports?.A)} />
          <Arrow x1={rx} y1={QE_MID} x2={rx} y2={b.y + b.h + 12} color={portColor(ports?.A)} />
        </>
      )}
      {/* 排氣口（開口三角形） */}
      <line x1={rx} y1={b.y + b.h} x2={rx} y2={b.y + b.h + 12} stroke={SYMBOL_STROKE} strokeWidth={2} />
      <polygon points={`${rx - 8},${b.y + b.h + 12} ${rx + 8},${b.y + b.h + 12} ${rx},${b.y + b.h + 24}`} fill="none" stroke={SYMBOL_STROKE} strokeWidth={2} />
      <Stub x1={rx} y1={b.y + b.h + 24} x2={rx} y2={QE_H} state={ports?.R} />
      <PortLabel x={8} y={QE_MID - 9} rotation={rotation} flip={flip}>
        {labels?.P ?? 'P'}
      </PortLabel>
      <PortLabel x={QE_W - 8} y={QE_MID - 9} rotation={rotation} flip={flip}>
        {labels?.A ?? 'A'}
      </PortLabel>
      <PortLabel x={rx + 16} y={b.y + b.h + 12} rotation={rotation} flip={flip}>
        {labels?.R ?? 'R'}
      </PortLabel>
    </g>
  )
}

export const quickExhaustSymbol: SymbolDef = {
  width: QE_W,
  height: QE_H,
  ports: {
    P: { x: 0, y: QE_MID, side: 'left' },
    A: { x: QE_W, y: QE_MID, side: 'right' },
    // 排氣口：通常直接排大氣，也可以接消音器
    R: { x: QE_BODY.x + QE_BODY.w / 2, y: QE_H, side: 'bottom' },
  },
  Symbol: QuickExhaust,
}

// ---- 壓力開關：感壓埠在下方；壓力達到設定值時訊號燈亮 ----

const PS_W = 64
const PS_H = 64

function PressureSwitch({ ports, pressure, params, rotation, flip, labels }: SymbolProps) {
  const name = strParam(params, 'signal') || 'PS'
  const setpoint = numParam(params, 'setpoint', 0.4)
  const on = !!ports && (pressure?.P ?? 0) >= setpoint - 1e-9
  return (
    <g>
      <Stub x1={PS_W / 2} y1={44} x2={PS_W / 2} y2={PS_H} state={ports?.P} />
      <line x1={PS_W / 2} y1={44} x2={PS_W / 2} y2={PS_H} stroke={portColor(ports?.P)} strokeWidth={2} strokeDasharray="5 3" />
      <rect x={12} y={14} width={PS_W - 24} height={30} fill={on ? CHAMBER_PRESSURE_FILL : 'white'} stroke={SYMBOL_STROKE} strokeWidth={2} />
      {/* 電氣接點 */}
      <polyline points={`18,34 28,34 40,24`} fill="none" stroke={SYMBOL_STROKE} strokeWidth={1.8} />
      <line x1={40} y1={34} x2={46} y2={34} stroke={SYMBOL_STROKE} strokeWidth={1.8} />
      <circle cx={PS_W - 8} cy={8} r={5} fill={on ? '#22c55e' : 'white'} stroke={SYMBOL_STROKE} strokeWidth={1.5} />
      <ValueText x={24} y={6} rotation={rotation} flip={flip} size={9}>
        {name}
      </ValueText>
      <PortLabel x={PS_W / 2 + 9} y={PS_H - 7} rotation={rotation} flip={flip}>
        {labels?.P ?? 'P'}
      </PortLabel>
    </g>
  )
}

export const pressureSwitchSymbol: SymbolDef = {
  width: PS_W,
  height: PS_H,
  ports: { P: { x: PS_W / 2, y: PS_H, side: 'bottom' } },
  Symbol: PressureSwitch,
}
