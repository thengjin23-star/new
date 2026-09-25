import { VALVE52_PATHS, type PortState, type Valve52State } from '../../engine'
import { portColor, SYMBOL_STROKE } from '../../theme'
import { Arrow, BlockedMark, PortLabel, Stub } from './parts'
import type { SymbolDef, SymbolProps } from './types'

/*
 * ISO 1219 風格的 5/2 閥：兩個方格並排，左格 = 閥位 1、右格 = 閥位 0。
 * 外部埠固定在「窗口」位置（X0 ~ X0+S），切換閥位時兩個方格整體左右平移，
 * 讓目前作用中的方格對準外部埠。
 *
 *        A   B              ← 上方工作埠
 *   ⊢ [ 位置1 | 位置0 ] ⋀   ← 左：手動操作、右：定位（切換後保持）
 *       EA  P  EB           ← 下方供氣與排氣埠
 */
const S = 64
const ACTUATOR = 22
const DETENT = 16
const PAD = 4
const X0 = PAD + ACTUATOR + S
const TOP = 20
const BOTTOM = TOP + S
const WIDTH = X0 + 2 * S + DETENT + PAD
const HEIGHT = BOTTOM + 20
const MID = TOP + S / 2

type ValvePort = 'P' | 'A' | 'B' | 'EA' | 'EB'
const ALL_PORTS: readonly ValvePort[] = ['A', 'B', 'EA', 'P', 'EB']

/** 各埠在單一方格內的 x 座標，以及位於上緣或下緣 */
const LOCAL: Record<ValvePort, { x: number; top: boolean }> = {
  A: { x: 16, top: true },
  B: { x: 48, top: true },
  EA: { x: 16, top: false },
  P: { x: 32, top: false },
  EB: { x: 48, top: false },
}

function Square({ x, position, ports }: { x: number; position: 0 | 1; ports?: Readonly<Record<string, PortState>> }) {
  const paths = VALVE52_PATHS[position]
  const used = new Set<string>(paths.flat())
  const at = (p: ValvePort) => ({ x: LOCAL[p].x, y: LOCAL[p].top ? 0 : S })

  return (
    <g transform={`translate(${x} ${TOP})`}>
      <rect width={S} height={S} fill="white" stroke={SYMBOL_STROKE} strokeWidth={2} />
      {paths.map(([from, to]) => {
        const a = at(from)
        const b = at(to)
        return <Arrow key={from + to} x1={a.x} y1={a.y} x2={b.x} y2={b.y} color={ports ? portColor(ports[from]) : SYMBOL_STROKE} />
      })}
      {ALL_PORTS.filter((p) => !used.has(p)).map((p) => (
        <BlockedMark key={p} x={LOCAL[p].x} y={LOCAL[p].top ? 0 : S} inward={LOCAL[p].top ? 1 : -1} />
      ))}
    </g>
  )
}

function Valve52({ state, ports, rotation }: SymbolProps) {
  const { position } = state as Valve52State
  // 閥位 0：右格對準窗口；閥位 1：左格對準窗口
  const shift = position === 0 ? X0 - S : X0

  return (
    <g>
      {ALL_PORTS.map((p) => {
        const x = X0 + LOCAL[p].x
        return LOCAL[p].top ? (
          <Stub key={p} x1={x} y1={0} x2={x} y2={TOP} state={ports?.[p]} />
        ) : (
          <Stub key={p} x1={x} y1={BOTTOM} x2={x} y2={HEIGHT} state={ports?.[p]} />
        )
      })}

      <g style={{ transform: `translateX(${shift}px)`, transition: 'transform 180ms ease-out' }}>
        {/* 手動操作（一般手動記號） */}
        <g stroke={SYMBOL_STROKE} strokeWidth={2}>
          <line x1={0} y1={MID} x2={-14} y2={MID} />
          <line x1={-14} y1={MID - 10} x2={-14} y2={MID + 10} />
        </g>
        <Square x={0} position={1} ports={position === 1 ? ports : undefined} />
        <Square x={S} position={0} ports={position === 0 ? ports : undefined} />
        {/* 定位（切換後保持在該閥位） */}
        <g stroke={SYMBOL_STROKE} strokeWidth={2} fill="none">
          <line x1={2 * S} y1={MID} x2={2 * S + 8} y2={MID} />
          <polyline points={`${2 * S + 8},${MID - 9} ${2 * S + 8},${MID + 9}`} />
          <polyline points={`${2 * S + 8},${MID - 5} ${2 * S + 14},${MID} ${2 * S + 8},${MID + 5}`} />
        </g>
      </g>

      <PortLabel x={X0 + 16 - 9} y={8} rotation={rotation}>A</PortLabel>
      <PortLabel x={X0 + 48 + 9} y={8} rotation={rotation}>B</PortLabel>
      <PortLabel x={X0 + 16 - 11} y={HEIGHT - 8} rotation={rotation}>EA</PortLabel>
      <PortLabel x={X0 + 32 + 7} y={HEIGHT - 8} rotation={rotation}>P</PortLabel>
      <PortLabel x={X0 + 48 + 11} y={HEIGHT - 8} rotation={rotation}>EB</PortLabel>
    </g>
  )
}

export const valve52Symbol: SymbolDef = {
  width: WIDTH,
  height: HEIGHT,
  ports: {
    A: { x: X0 + LOCAL.A.x, y: 0, side: 'top' },
    B: { x: X0 + LOCAL.B.x, y: 0, side: 'top' },
    EA: { x: X0 + LOCAL.EA.x, y: HEIGHT, side: 'bottom' },
    P: { x: X0 + LOCAL.P.x, y: HEIGHT, side: 'bottom' },
    EB: { x: X0 + LOCAL.EB.x, y: HEIGHT, side: 'bottom' },
  },
  Symbol: Valve52,
}
