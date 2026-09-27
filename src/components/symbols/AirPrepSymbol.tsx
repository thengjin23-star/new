import { SYMBOL_STROKE } from '../../theme'
import { numParam } from '../../engine'
import { Diamond, PortLabel, Spring, Stub, ValueText } from './parts'
import type { SymbolDef, SymbolProps } from './types'

/*
 * 氣源處理元件：IN 在左、OUT 在右（ISO 1219 簡化畫法）。
 * - 過濾器：菱形內一條虛線（濾芯）
 * - 給油器：菱形內一條實線與油滴
 * - 調壓閥：方格＋可調彈簧＋出口回饋引導線（虛線）
 * - 三點組合：虛線框內依序為過濾、調壓、給油
 * - 壓力錶：圓內指針，模擬中顯示壓力值
 */

const formatMPa = (v: number) => `${v.toFixed(2)} MPa`

function InOutLabels({ width, y, rotation, flip, labels }: { width: number; y: number } & Pick<SymbolProps, 'rotation' | 'flip' | 'labels'>) {
  return (
    <>
      <PortLabel x={9} y={y - 9} rotation={rotation} flip={flip}>
        {labels?.IN ?? 'IN'}
      </PortLabel>
      <PortLabel x={width - 11} y={y - 9} rotation={rotation} flip={flip}>
        {labels?.OUT ?? 'OUT'}
      </PortLabel>
    </>
  )
}

// ---- 過濾器 ----
const F_W = 72
const F_H = 48
const F_MID = 26

function Filter({ ports, rotation, flip, labels }: SymbolProps) {
  const cx = F_W / 2
  return (
    <g>
      <Stub x1={0} y1={F_MID} x2={cx - 16} y2={F_MID} state={ports?.IN} />
      <Stub x1={cx + 16} y1={F_MID} x2={F_W} y2={F_MID} state={ports?.OUT} />
      <Diamond cx={cx} cy={F_MID} r={16} />
      <line x1={cx} y1={F_MID - 12} x2={cx} y2={F_MID + 12} stroke={SYMBOL_STROKE} strokeWidth={1.5} strokeDasharray="3 3" />
      <InOutLabels width={F_W} y={F_MID} rotation={rotation} flip={flip} labels={labels} />
    </g>
  )
}

export const filterSymbol: SymbolDef = {
  width: F_W,
  height: F_H,
  ports: { IN: { x: 0, y: F_MID, side: 'left' }, OUT: { x: F_W, y: F_MID, side: 'right' } },
  Symbol: Filter,
}

// ---- 給油器 ----
function Lubricator({ ports, rotation, flip, labels }: SymbolProps) {
  const cx = F_W / 2
  return (
    <g>
      <Stub x1={0} y1={F_MID} x2={cx - 16} y2={F_MID} state={ports?.IN} />
      <Stub x1={cx + 16} y1={F_MID} x2={F_W} y2={F_MID} state={ports?.OUT} />
      <Diamond cx={cx} cy={F_MID} r={16} />
      <line x1={cx} y1={F_MID - 12} x2={cx} y2={F_MID + 4} stroke={SYMBOL_STROKE} strokeWidth={1.5} />
      <polygon points={`${cx},${F_MID + 4} ${cx - 4},${F_MID + 11} ${cx + 4},${F_MID + 11}`} fill={SYMBOL_STROKE} />
      <InOutLabels width={F_W} y={F_MID} rotation={rotation} flip={flip} labels={labels} />
    </g>
  )
}

export const lubricatorSymbol: SymbolDef = { ...filterSymbol, Symbol: Lubricator }

// ---- 調壓閥 ----
const R_W = 80
const R_H = 84
const R_MID = 42
const R_BOX = 36

function RegulatorBody({ cx, cy, size, ports }: { cx: number; cy: number; size: number; ports?: SymbolProps['ports'] }) {
  const half = size / 2
  return (
    <g>
      <rect x={cx - half} y={cy - half} width={size} height={size} fill="white" stroke={SYMBOL_STROKE} strokeWidth={2} />
      {/* 通道：略為偏移的箭頭表示節流調壓 */}
      <line x1={cx - half} y1={cy} x2={cx - half / 3} y2={cy} stroke={SYMBOL_STROKE} strokeWidth={2} />
      <line x1={cx + half / 3} y1={cy} x2={cx + half} y2={cy} stroke={SYMBOL_STROKE} strokeWidth={2} />
      <line
        x1={cx - half / 3}
        y1={cy + half * 0.45}
        x2={cx + half / 3}
        y2={cy + half * 0.45}
        stroke={ports ? '#2563eb' : SYMBOL_STROKE}
        strokeWidth={2}
      />
      <polygon
        points={`${cx + half / 3 + 1},${cy + half * 0.45} ${cx + half / 3 - 6},${cy + half * 0.45 - 4} ${cx + half / 3 - 6},${cy + half * 0.45 + 4}`}
        fill={ports ? '#2563eb' : SYMBOL_STROKE}
      />
      {/* 可調彈簧 */}
      <g transform={`rotate(-90 ${cx} ${cy - half})`}>
        <Spring x={cx} y={cy - half} dir={1} length={16} amplitude={6} />
      </g>
      <line x1={cx - 9} y1={cy - half - 2} x2={cx + 9} y2={cy - half - 16} stroke={SYMBOL_STROKE} strokeWidth={1.5} />
      <polygon points={`${cx + 11},${cy - half - 18} ${cx + 4},${cy - half - 15} ${cx + 8},${cy - half - 11}`} fill={SYMBOL_STROKE} />
    </g>
  )
}

function Regulator({ ports, rotation, flip, labels, params }: SymbolProps) {
  const cx = R_W / 2
  const half = R_BOX / 2
  const setting = numParam(params, 'setting', 0.5)
  return (
    <g>
      <Stub x1={0} y1={R_MID} x2={cx - half} y2={R_MID} state={ports?.IN} />
      <Stub x1={cx + half} y1={R_MID} x2={R_W} y2={R_MID} state={ports?.OUT} />
      {/* 出口回饋引導線 */}
      <polyline
        points={`${cx + half + 8},${R_MID} ${cx + half + 8},${R_MID + half + 8} ${cx},${R_MID + half + 8} ${cx},${R_MID + half}`}
        fill="none"
        stroke={SYMBOL_STROKE}
        strokeWidth={1.5}
        strokeDasharray="4 3"
      />
      <RegulatorBody cx={cx} cy={R_MID} size={R_BOX} ports={ports} />
      <ValueText x={cx} y={R_H - 6} rotation={rotation} flip={flip}>
        {formatMPa(setting)}
      </ValueText>
      <InOutLabels width={R_W} y={R_MID} rotation={rotation} flip={flip} labels={labels} />
    </g>
  )
}

export const regulatorSymbol: SymbolDef = {
  width: R_W,
  height: R_H,
  ports: { IN: { x: 0, y: R_MID, side: 'left' }, OUT: { x: R_W, y: R_MID, side: 'right' } },
  Symbol: Regulator,
}

// ---- 三點組合 ----
const U_W = 148
const U_H = 84
const U_MID = 42
/** 虛線外框左右內縮，讓 IN／OUT 文字落在框外 */
const U_INSET = 22

function Frl({ ports, rotation, flip, labels, params }: SymbolProps) {
  const setting = numParam(params, 'setting', 0.5)
  const fx = 40
  const rx = 74
  const lx = 108
  return (
    <g>
      <Stub x1={0} y1={U_MID} x2={fx - 11} y2={U_MID} state={ports?.IN} />
      <Stub x1={lx + 11} y1={U_MID} x2={U_W} y2={U_MID} state={ports?.OUT} />
      <line x1={fx + 11} y1={U_MID} x2={rx - 12} y2={U_MID} stroke={SYMBOL_STROKE} strokeWidth={2} />
      <line x1={rx + 12} y1={U_MID} x2={lx - 11} y2={U_MID} stroke={SYMBOL_STROKE} strokeWidth={2} />
      <rect
        x={U_INSET}
        y={12}
        width={U_W - 2 * U_INSET}
        height={U_H - 30}
        rx={4}
        fill="none"
        stroke={SYMBOL_STROKE}
        strokeWidth={1.2}
        strokeDasharray="8 3 2 3"
      />
      <Diamond cx={fx} cy={U_MID} r={11} />
      <line x1={fx} y1={U_MID - 8} x2={fx} y2={U_MID + 8} stroke={SYMBOL_STROKE} strokeWidth={1.2} strokeDasharray="2 2" />
      <RegulatorBody cx={rx} cy={U_MID} size={24} ports={ports} />
      <Diamond cx={lx} cy={U_MID} r={11} />
      <line x1={lx} y1={U_MID - 8} x2={lx} y2={U_MID + 2} stroke={SYMBOL_STROKE} strokeWidth={1.2} />
      <polygon points={`${lx},${U_MID + 2} ${lx - 3},${U_MID + 7} ${lx + 3},${U_MID + 7}`} fill={SYMBOL_STROKE} />
      <ValueText x={U_W / 2} y={U_H - 8} rotation={rotation} flip={flip}>
        {formatMPa(setting)}
      </ValueText>
      <InOutLabels width={U_W} y={U_MID} rotation={rotation} flip={flip} labels={labels} />
    </g>
  )
}

export const frlSymbol: SymbolDef = {
  width: U_W,
  height: U_H,
  ports: { IN: { x: 0, y: U_MID, side: 'left' }, OUT: { x: U_W, y: U_MID, side: 'right' } },
  Symbol: Frl,
}

// ---- 壓力錶 ----
const G_W = 92
const G_H = 64
const G_CX = 24
const G_CY = 24
const G_R = 16

function Gauge({ ports, pressure, rotation, flip }: SymbolProps) {
  const value = pressure?.P
  return (
    <g>
      <Stub x1={G_CX} y1={G_CY + G_R} x2={G_CX} y2={G_H} state={ports?.P} />
      <circle cx={G_CX} cy={G_CY} r={G_R} fill="white" stroke={SYMBOL_STROKE} strokeWidth={2} />
      <line x1={G_CX - 9} y1={G_CY + 9} x2={G_CX + 8} y2={G_CY - 8} stroke={SYMBOL_STROKE} strokeWidth={1.8} />
      <polygon points={`${G_CX + 11},${G_CY - 11} ${G_CX + 3},${G_CY - 8} ${G_CX + 8},${G_CY - 3}`} fill={SYMBOL_STROKE} />
      {value !== undefined && (
        <ValueText x={G_CX + G_R + 30} y={G_CY} rotation={rotation} flip={flip} color="#1d4ed8" size={11}>
          {formatMPa(value)}
        </ValueText>
      )}
    </g>
  )
}

export const pressureGaugeSymbol: SymbolDef = {
  width: G_W,
  height: G_H,
  ports: { P: { x: G_CX, y: G_H, side: 'bottom' } },
  Symbol: Gauge,
}
