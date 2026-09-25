import type { ReactNode } from 'react'
import type { PortState } from '../../engine'
import type { Rotation } from '../../store/flow'
import { portColor, SYMBOL_STROKE } from '../../theme'

/** 從符號本體連到埠的短管，依壓力狀態上色 */
export function Stub(props: { x1: number; y1: number; x2: number; y2: number; state?: PortState }) {
  const { state, ...line } = props
  return <line {...line} stroke={portColor(state)} strokeWidth={2.5} />
}

/** 埠代號文字；反向旋轉以保持正立 */
export function PortLabel({ x, y, rotation, children }: { x: number; y: number; rotation: Rotation; children: ReactNode }) {
  return (
    <text
      x={x}
      y={y}
      fontSize={10}
      fill="#64748b"
      textAnchor="middle"
      dominantBaseline="central"
      transform={rotation ? `rotate(${-rotation} ${x} ${y})` : undefined}
      style={{ userSelect: 'none', fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
    >
      {children}
    </text>
  )
}

/** 帶箭頭的直線（閥內部通路） */
export function Arrow({ x1, y1, x2, y2, color = SYMBOL_STROKE }: { x1: number; y1: number; x2: number; y2: number; color?: string }) {
  const len = Math.hypot(x2 - x1, y2 - y1)
  const [ux, uy] = [(x2 - x1) / len, (y2 - y1) / len]
  const head = 9
  const [bx, by] = [x2 - ux * head, y2 - uy * head]
  const [nx, ny] = [-uy * 4, ux * 4]
  return (
    <g>
      <line x1={x1} y1={y1} x2={bx} y2={by} stroke={color} strokeWidth={2} />
      <polygon points={`${x2},${y2} ${bx + nx},${by + ny} ${bx - nx},${by - ny}`} fill={color} />
    </g>
  )
}

/** 封閉埠記號（⊥） */
export function BlockedMark({ x, y, inward }: { x: number; y: number; inward: 1 | -1 }) {
  const tip = y + inward * 12
  return (
    <g stroke={SYMBOL_STROKE} strokeWidth={2}>
      <line x1={x} y1={y} x2={x} y2={tip} />
      <line x1={x - 6} y1={tip} x2={x + 6} y2={tip} />
    </g>
  )
}
