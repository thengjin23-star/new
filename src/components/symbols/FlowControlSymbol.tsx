import { numParam } from '../../engine'
import { SYMBOL_STROKE } from '../../theme'
import { PortLabel, Stub, ValueText } from './parts'
import type { SymbolDef, SymbolProps } from './types'

/*
 * 流量控制元件（直立畫法）：2 在上（接氣缸側）、1 在下（接閥側），
 * 單向閥與速度控制閥的自由流動方向都是 1 → 2（由下往上）。
 */

/** 節流記號：兩條相對的弧線，加上可調箭頭 */
function Restriction({ x, y1, y2, adjustable = true }: { x: number; y1: number; y2: number; adjustable?: boolean }) {
  const mid = (y1 + y2) / 2
  return (
    <g stroke={SYMBOL_STROKE} fill="none" strokeWidth={2}>
      <line x1={x} y1={y1} x2={x} y2={y2} />
      <path d={`M ${x - 9} ${y1} Q ${x - 1} ${mid} ${x - 9} ${y2}`} />
      <path d={`M ${x + 9} ${y1} Q ${x + 1} ${mid} ${x + 9} ${y2}`} />
      {adjustable && (
        <>
          <line x1={x - 14} y1={y2 + 4} x2={x + 12} y2={y1 - 2} strokeWidth={1.5} />
          <polygon points={`${x + 15},${y1 - 6} ${x + 7},${y1 - 3} ${x + 12},${y1 + 3}`} fill={SYMBOL_STROKE} stroke="none" />
        </>
      )}
    </g>
  )
}

/** 單向閥記號：球（上）坐在 V 形閥座（下）；由下往上可推開 */
function CheckMark({ x, y }: { x: number; y: number }) {
  return (
    <g stroke={SYMBOL_STROKE} fill="none" strokeWidth={2}>
      <polyline points={`${x - 10},${y - 4} ${x},${y + 10} ${x + 10},${y - 4}`} />
      <circle cx={x} cy={y - 6} r={7} fill="white" />
    </g>
  )
}

function PortLabels12({ x, height, rotation, flip, labels }: { x: number; height: number } & Pick<SymbolProps, 'rotation' | 'flip' | 'labels'>) {
  return (
    <>
      <PortLabel x={x + 9} y={7} rotation={rotation} flip={flip}>
        {labels?.['2'] ?? '2'}
      </PortLabel>
      <PortLabel x={x + 9} y={height - 7} rotation={rotation} flip={flip}>
        {labels?.['1'] ?? '1'}
      </PortLabel>
    </>
  )
}

// ---- 單向閥 ----
const C_W = 40
const C_H = 80

function Check({ ports, rotation, flip, labels }: SymbolProps) {
  const x = C_W / 2
  return (
    <g>
      <Stub x1={x} y1={0} x2={x} y2={C_H / 2 - 13} state={ports?.['2']} />
      <Stub x1={x} y1={C_H / 2 + 10} x2={x} y2={C_H} state={ports?.['1']} />
      <CheckMark x={x} y={C_H / 2} />
      <PortLabels12 x={x} height={C_H} rotation={rotation} flip={flip} labels={labels} />
    </g>
  )
}

export const checkValveSymbol: SymbolDef = {
  width: C_W,
  height: C_H,
  ports: { '2': { x: C_W / 2, y: 0, side: 'top' }, '1': { x: C_W / 2, y: C_H, side: 'bottom' } },
  Symbol: Check,
}

// ---- 節流閥（雙向） ----
const T_W = 64
const T_H = 80
const T_X = 24

function Throttle({ ports, rotation, flip, labels, params }: SymbolProps) {
  const x = T_X
  return (
    <g>
      <Stub x1={x} y1={0} x2={x} y2={26} state={ports?.['2']} />
      <Stub x1={x} y1={54} x2={x} y2={T_H} state={ports?.['1']} />
      <Restriction x={x} y1={26} y2={54} />
      <ValueText x={x + 26} y={T_H / 2} rotation={rotation} flip={flip} size={9} color="#64748b">
        {`${numParam(params, 'opening', 50)}%`}
      </ValueText>
      <PortLabel x={x - 9} y={7} rotation={rotation} flip={flip}>
        {labels?.['2'] ?? '2'}
      </PortLabel>
      <PortLabel x={x - 9} y={T_H - 7} rotation={rotation} flip={flip}>
        {labels?.['1'] ?? '1'}
      </PortLabel>
    </g>
  )
}

export const throttleSymbol: SymbolDef = {
  width: T_W,
  height: T_H,
  ports: { '2': { x: T_X, y: 0, side: 'top' }, '1': { x: T_X, y: T_H, side: 'bottom' } },
  Symbol: Throttle,
}

// ---- 速度控制閥（單向節流） ----
const S_W = 88
const S_H = 100
const S_X = 44
const TOP_BUS = 22
const BOTTOM_BUS = 78

function FlowControl({ ports, rotation, flip, labels, params }: SymbolProps) {
  const left = 26
  const right = 62
  return (
    <g>
      <Stub x1={S_X} y1={0} x2={S_X} y2={TOP_BUS} state={ports?.['2']} />
      <Stub x1={S_X} y1={BOTTOM_BUS} x2={S_X} y2={S_H} state={ports?.['1']} />
      <rect x={8} y={12} width={S_W - 16} height={S_H - 24} fill="none" stroke={SYMBOL_STROKE} strokeWidth={1} strokeDasharray="6 3" />
      <g stroke={SYMBOL_STROKE} strokeWidth={2} fill="none">
        <polyline points={`${left},${TOP_BUS + 12} ${left},${TOP_BUS} ${right},${TOP_BUS} ${right},${TOP_BUS + 10}`} />
        <polyline points={`${left},${BOTTOM_BUS - 12} ${left},${BOTTOM_BUS} ${right},${BOTTOM_BUS} ${right},${BOTTOM_BUS - 14}`} />
      </g>
      <Restriction x={left} y1={TOP_BUS + 12} y2={BOTTOM_BUS - 12} />
      <line x1={right} y1={TOP_BUS + 10} x2={right} y2={S_H / 2 - 13} stroke={SYMBOL_STROKE} strokeWidth={2} />
      <CheckMark x={right} y={S_H / 2 + 2} />
      <line x1={right} y1={S_H / 2 + 12} x2={right} y2={BOTTOM_BUS - 14} stroke={SYMBOL_STROKE} strokeWidth={2} />
      <ValueText x={22} y={S_H - 6} rotation={rotation} flip={flip} size={9} color="#64748b">
        {`${numParam(params, 'opening', 50)}%`}
      </ValueText>
      <PortLabels12 x={S_X} height={S_H} rotation={rotation} flip={flip} labels={labels} />
    </g>
  )
}

export const flowControlSymbol: SymbolDef = {
  width: S_W,
  height: S_H,
  ports: { '2': { x: S_X, y: 0, side: 'top' }, '1': { x: S_X, y: S_H, side: 'bottom' } },
  Symbol: FlowControl,
}
