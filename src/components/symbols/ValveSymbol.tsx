import type { ReactNode } from 'react'
import {
  boxOfPosition,
  numParam,
  strParam,
  VALVE_SPECS,
  type Params,
  type PortState,
  type ValveActuator,
  type ValvePassage,
  type ValvePortSet,
  type ValveSpec,
  type ValveState,
} from '../../engine'
import type { Rotation } from '../../store/flow'
import { CHAMBER_PRESSURE_FILL, portColor, SYMBOL_STROKE } from '../../theme'
import { Arrow, BlockedMark, PortLabel, Spring, Stub, ValueText } from './parts'
import type { PortGeometry, SymbolDef, SymbolProps } from './types'

/*
 * ISO 1219 風格的方向控制閥，由引擎的閥規格（VALVE_SPECS）產生。
 * 外部埠固定在「窗口」位置（X0 ~ X0+S）；切換閥位時所有方格整體左右平移，
 * 讓目前作用中的方格對準外部埠。左右兩側畫操作記號（手動、定位、電磁、彈簧、按鈕）。
 *
 *        A   B              ← 上方工作埠
 *   ⊡ [ 閥位… | 靜止位 ] ⋀  ← 操作記號跟著方格移動
 *       EA  P  EB           ← 下方供氣與排氣埠
 *
 * 氣控閥的先導埠（12、14）固定在符號的左右兩端，以虛線（控制線）連到先導操作記號。
 */
const S = 64
const PAD = 4
const TOP = 20
const BOTTOM = TOP + S
const HEIGHT = BOTTOM + 20
const MID = TOP + S / 2

/** 電磁線圈通電時的填色 */
const COIL_ON_FILL = '#fde68a'
const COIL_ON_STROKE = '#b45309'

const ACTUATOR_WIDTH: Record<ValveActuator, number> = {
  lever: 22,
  detent: 16,
  solenoid: 24,
  spring: 20,
  button: 22,
  pilot: 22,
  roller: 26,
}

/** 控制線（先導）的虛線樣式 */
const PILOT_DASH = '5 3'

interface LocalPort {
  x: number
  top: boolean
}

/** 各埠在單一方格內的 x 座標，以及位於上緣或下緣 */
const LOCAL: Record<ValvePortSet, Record<string, LocalPort>> = {
  5: {
    A: { x: 16, top: true },
    B: { x: 48, top: true },
    EA: { x: 16, top: false },
    P: { x: 32, top: false },
    EB: { x: 48, top: false },
  },
  3: {
    A: { x: 22, top: true },
    P: { x: 22, top: false },
    R: { x: 42, top: false },
  },
  2: {
    A: { x: 32, top: true },
    P: { x: 32, top: false },
  },
}

function Box({
  x,
  passages,
  local,
  ports,
}: {
  x: number
  passages: readonly ValvePassage[]
  local: Record<string, LocalPort>
  ports?: Readonly<Record<string, PortState>>
}) {
  const used = new Set<string>(passages.flat())
  const at = (p: string) => ({ x: local[p].x, y: local[p].top ? 0 : S })
  return (
    <g transform={`translate(${x} ${TOP})`}>
      <rect width={S} height={S} fill="white" stroke={SYMBOL_STROKE} strokeWidth={2} />
      {passages.map(([from, to]) => {
        const a = at(from)
        const b = at(to)
        return (
          <Arrow
            key={from + to}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            color={ports ? portColor(ports[from]) : SYMBOL_STROKE}
          />
        )
      })}
      {Object.keys(local)
        .filter((p) => !used.has(p))
        .map((p) => (
          <BlockedMark key={p} x={local[p].x} y={local[p].top ? 0 : S} inward={local[p].top ? 1 : -1} />
        ))}
    </g>
  )
}

interface ActuatorContext {
  spec: ValveSpec
  state: ValveState
  params?: Params
  ports?: Readonly<Record<string, PortState>>
  rotation: Rotation
  flip?: boolean
}

/** 一個操作記號：edge = 貼著方格的一側，dir = 往外的方向 */
function Actuator({
  kind,
  edge,
  dir,
  side,
  ctx,
}: {
  kind: ValveActuator
  edge: number
  dir: 1 | -1
  side: 'l' | 'r'
  ctx: ActuatorContext
}): ReactNode {
  const { state, params, rotation, flip } = ctx
  const stroke = { stroke: SYMBOL_STROKE, strokeWidth: 2, fill: 'none' }
  switch (kind) {
    case 'lever':
      return (
        <g {...stroke}>
          <line x1={edge} y1={MID} x2={edge + dir * 14} y2={MID} />
          <line x1={edge + dir * 14} y1={MID - 10} x2={edge + dir * 14} y2={MID + 10} />
        </g>
      )
    case 'detent': {
      const bar = edge + dir * 8
      return (
        <g {...stroke}>
          <line x1={edge} y1={MID} x2={bar} y2={MID} />
          <polyline points={`${bar},${MID - 9} ${bar},${MID + 9}`} />
          <polyline points={`${bar},${MID - 5} ${edge + dir * 14},${MID} ${bar},${MID + 5}`} />
        </g>
      )
    }
    case 'spring':
      return <Spring x={edge} y={MID} dir={dir} length={18} />
    case 'solenoid': {
      const on = !!state.coils?.[side]
      const x0 = Math.min(edge + dir * 6, edge + dir * 20)
      const name = strParam(params, side === 'l' ? 'coilL' : 'coilR')
      return (
        <g data-action={`coil:${side}`} data-coil={name || undefined} style={{ cursor: 'pointer' }}>
          <title>{`${name ? `${name}：` : ''}${on ? '電磁線圈（通電）' : '電磁線圈（斷電）'}`}</title>
          {/* 放大點擊範圍 */}
          <rect x={Math.min(edge, edge + dir * 24)} y={MID - 16} width={24} height={32} fill="transparent" />
          <line x1={edge} y1={MID} x2={edge + dir * 6} y2={MID} stroke={SYMBOL_STROKE} strokeWidth={2} />
          <rect
            x={x0}
            y={MID - 10}
            width={14}
            height={20}
            fill={on ? COIL_ON_FILL : 'white'}
            stroke={on ? COIL_ON_STROKE : SYMBOL_STROKE}
            strokeWidth={2}
          />
          <line x1={x0} y1={MID + 10} x2={x0 + 14} y2={MID - 10} stroke={on ? COIL_ON_STROKE : SYMBOL_STROKE} strokeWidth={1.5} />
          {name && (
            <ValueText x={x0 + 7} y={MID - 17} rotation={rotation} flip={flip} size={9} color={on ? COIL_ON_STROKE : '#334155'}>
              {name}
            </ValueText>
          )}
        </g>
      )
    }
    case 'pilot': {
      // 氣控：貼著方格的小方框，內有指向閥的三角形；先導埠有壓時填色
      const port = ctx.spec.pilots?.[side]
      const on = !!port && ctx.ports?.[port] === 'pressure'
      const near = edge + dir * 2
      const far = edge + dir * 16
      const x0 = Math.min(near, far)
      const tip = near + dir * 3
      const base = far - dir * 3
      return (
        <g>
          <line x1={edge} y1={MID} x2={near} y2={MID} stroke={SYMBOL_STROKE} strokeWidth={2} />
          <rect x={x0} y={MID - 9} width={14} height={18} fill={on ? CHAMBER_PRESSURE_FILL : 'white'} stroke={SYMBOL_STROKE} strokeWidth={2} />
          <polygon points={`${tip},${MID} ${base},${MID - 5} ${base},${MID + 5}`} fill="none" stroke={SYMBOL_STROKE} strokeWidth={1.5} />
          <line x1={far} y1={MID} x2={edge + dir * ACTUATOR_WIDTH.pilot} y2={MID} stroke={portColor(port ? ctx.ports?.[port] : undefined)} strokeWidth={2} strokeDasharray={PILOT_DASH} />
        </g>
      )
    }
    case 'roller': {
      // 滾輪：桿＋滾輪，氣缸到達觸發位置時壓下（填色）
      const active = state.position !== ctx.spec.rest
      const cx = edge + dir * 18
      const trigger = strParam(params, 'trigger')
      return (
        <g>
          <line x1={edge} y1={MID} x2={edge + dir * 12} y2={MID} stroke={SYMBOL_STROKE} strokeWidth={2} />
          <circle cx={cx} cy={MID} r={6} fill={active ? COIL_ON_FILL : 'white'} stroke={active ? COIL_ON_STROKE : SYMBOL_STROKE} strokeWidth={2} />
          <ValueText x={cx} y={MID - 15} rotation={rotation} flip={flip} size={9} color={trigger ? '#334155' : '#dc2626'}>
            {trigger || '？'}
          </ValueText>
        </g>
      )
    }
    case 'button': {
      const on = !!state.pressed
      const stem = edge + dir * 12
      // 半圓按鈕頭朝外
      const sweep = dir > 0 ? 1 : 0
      return (
        <g data-momentary="true" style={{ cursor: 'pointer' }}>
          <title>按鈕（按住作動）</title>
          <rect x={Math.min(edge, edge + dir * 22)} y={MID - 16} width={22} height={32} fill="transparent" />
          <line x1={edge} y1={MID} x2={stem} y2={MID} stroke={SYMBOL_STROKE} strokeWidth={2} />
          <path
            d={`M ${stem} ${MID - 9} A 9 9 0 0 ${sweep} ${stem} ${MID + 9} Z`}
            fill={on ? COIL_ON_FILL : 'white'}
            stroke={on ? COIL_ON_STROKE : SYMBOL_STROKE}
            strokeWidth={2}
          />
        </g>
      )
    }
  }
}

function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0)
}

/** 由閥規格產生符號 */
export function makeValveSymbol(spec: ValveSpec): SymbolDef {
  const count = spec.boxes.length
  const local = LOCAL[spec.portSet]
  const leftWidth = sum(spec.left.map((a) => ACTUATOR_WIDTH[a]))
  const rightWidth = sum(spec.right.map((a) => ACTUATOR_WIDTH[a]))
  const reachable = [...Array(count).keys()].map((p) => boxOfPosition(spec, p))
  const minBox = Math.min(...reachable)
  const maxBox = Math.max(...reachable)
  // 窗口左緣：方格向右移到底（最右邊的閥位作用中）時，左側操作記號剛好貼齊 PAD
  const X0 = PAD + leftWidth + maxBox * S
  const WIDTH = X0 - minBox * S + count * S + rightWidth + PAD
  const portIds = Object.keys(local)

  const ports: Record<string, PortGeometry> = {}
  for (const id of portIds) {
    const p = local[id]
    ports[id] = { x: X0 + p.x, y: p.top ? 0 : HEIGHT, side: p.top ? 'top' : 'bottom' }
  }
  // 先導埠固定在左右兩端
  if (spec.pilots?.l) ports[spec.pilots.l] = { x: 0, y: MID, side: 'left' }
  if (spec.pilots?.r) ports[spec.pilots.r] = { x: WIDTH, y: MID, side: 'right' }

  function ValveGraphic({ state, ports: portStates, rotation, flip, labels, params }: SymbolProps) {
    const valve = state as ValveState
    const box = boxOfPosition(spec, valve.position)
    const shift = X0 - box * S
    const ctx: ActuatorContext = { spec, state: valve, params, ports: portStates, rotation, flip }

    // 操作記號由方格往外依序排列
    const leftActuators: ReactNode[] = []
    let edge = 0
    spec.left.forEach((kind, i) => {
      leftActuators.push(<Actuator key={`l${i}`} kind={kind} edge={edge} dir={-1} side="l" ctx={ctx} />)
      edge -= ACTUATOR_WIDTH[kind]
    })
    const rightActuators: ReactNode[] = []
    edge = count * S
    spec.right.forEach((kind, i) => {
      rightActuators.push(<Actuator key={`r${i}`} kind={kind} edge={edge} dir={1} side="r" ctx={ctx} />)
      edge += ACTUATOR_WIDTH[kind]
    })
    // 控制線：由固定的先導埠連到跟著方格移動的操作記號外緣
    const leftOuter = shift - leftWidth
    const rightOuter = shift + count * S + rightWidth
    const pilotL = spec.pilots?.l
    const pilotR = spec.pilots?.r
    const delay = spec.mode === 'timer' ? numParam(params, 'delay', 2) : 0

    return (
      <g>
        {pilotL && (
          <line x1={0} y1={MID} x2={leftOuter} y2={MID} stroke={portColor(portStates?.[pilotL])} strokeWidth={2} strokeDasharray={PILOT_DASH} />
        )}
        {pilotR && (
          <line x1={rightOuter} y1={MID} x2={WIDTH} y2={MID} stroke={portColor(portStates?.[pilotR])} strokeWidth={2} strokeDasharray={PILOT_DASH} />
        )}
        {portIds.map((p) => {
          const x = X0 + local[p].x
          return local[p].top ? (
            <Stub key={p} x1={x} y1={0} x2={x} y2={TOP} state={portStates?.[p]} />
          ) : (
            <Stub key={p} x1={x} y1={BOTTOM} x2={x} y2={HEIGHT} state={portStates?.[p]} />
          )
        })}

        <g style={{ transform: `translateX(${shift}px)`, transition: 'transform 180ms ease-out' }}>
          {leftActuators}
          {spec.boxes.map((passages, k) => (
            <Box key={k} x={k * S} passages={passages} local={local} ports={k === box ? portStates : undefined} />
          ))}
          {rightActuators}
        </g>

        {portIds.map((p) => {
          const text = labels?.[p] ?? p
          const lx = local[p].x
          const dx = lx < S / 2 ? -(6 + 2.5 * text.length) : lx > S / 2 ? 6 + 2.5 * text.length : 7
          return (
            <PortLabel key={p} x={X0 + lx + dx} y={local[p].top ? 8 : HEIGHT - 8} rotation={rotation} flip={flip}>
              {text}
            </PortLabel>
          )
        })}
        {pilotL && (
          <PortLabel x={8} y={MID - 10} rotation={rotation} flip={flip}>
            {pilotL}
          </PortLabel>
        )}
        {pilotR && (
          <PortLabel x={WIDTH - 8} y={MID - 10} rotation={rotation} flip={flip}>
            {pilotR}
          </PortLabel>
        )}
        {spec.mode === 'timer' && (
          <ValueText x={36} y={9} rotation={rotation} flip={flip} size={9} color={valve.elapsed ? '#b45309' : '#334155'}>
            {portStates ? `${(valve.elapsed ?? 0).toFixed(1)}／${delay} s` : `延時 ${delay} s`}
          </ValueText>
        )}
      </g>
    )
  }

  return { width: WIDTH, height: HEIGHT, ports, Symbol: ValveGraphic }
}

/** 所有閥的符號，以 type 為 key */
export const valveSymbols: Readonly<Record<string, SymbolDef>> = Object.fromEntries(
  Object.values(VALVE_SPECS).map((spec) => [spec.type, makeValveSymbol(spec)]),
)
