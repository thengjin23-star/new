import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react'
import { memo, useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { portKey, registry, type PortKey, type PortState } from '../../engine'
import { useCircuitStore } from '../../store/circuitStore'
import type { PneumaticFlowNode } from '../../store/flow'
import { portColor } from '../../theme'
import { getSymbol } from '../symbols/symbolRegistry'
import { rotateSide, type Side } from '../symbols/types'

const SIDE_TO_POSITION: Record<Side, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
}

const NO_WARNINGS: PortKey[] = []

/**
 * 所有氣動元件共用的節點。外觀從符號註冊表取得、行為從引擎註冊表取得，
 * 模擬狀態則直接以 selector 訂閱 store 中屬於自己的那一小片（不經過 node.data），
 * 避免每一幀都讓 React Flow 比對全部節點。
 */
function PneumaticNodeImpl({ id, data, selected }: NodeProps<PneumaticFlowNode>) {
  const { componentType, rotation } = data
  const def = registry.get(componentType)
  const symbol = getSymbol(componentType)

  const simulating = useCircuitStore((s) => s.status !== 'idle')
  const componentState = useCircuitStore((s) => s.sim.componentStates[id])
  const ports = useCircuitStore(
    useShallow((s) => {
      const result: Record<string, PortState> = {}
      for (const p of def.ports) result[p.id] = s.sim.portStates[portKey(id, p.id)] ?? 'blocked'
      return result
    }),
  )
  const warnings = useCircuitStore(
    useShallow((s) => (s.status === 'idle' ? NO_WARNINGS : s.unconnectedExhausts.filter((k) => k.startsWith(`${id}:`)))),
  )

  // 旋轉後 handle 的螢幕位置改變，需通知 React Flow 重新量測。
  // 掛載時不呼叫：那會單獨量測這一個節點，讓排隊中的 fitView 只對它縮放。
  const updateNodeInternals = useUpdateNodeInternals()
  const measuredRotation = useRef(rotation)
  useEffect(() => {
    if (measuredRotation.current === rotation) return
    measuredRotation.current = rotation
    updateNodeInternals(id)
  }, [id, rotation, updateNodeInternals])

  const { width, height } = symbol
  const quarterTurn = rotation === 90 || rotation === 270
  const outerW = quarterTurn ? height : width
  const outerH = quarterTurn ? width : height
  const interactive = simulating && def.onInteract !== undefined

  return (
    <div
      className={[
        'pneumatic-node relative rounded-sm',
        selected ? 'outline-2 outline-offset-4 outline-blue-500 outline-dashed' : '',
        interactive ? 'cursor-pointer' : '',
        simulating ? 'is-simulating' : '',
      ].join(' ')}
      style={{ width: outerW, height: outerH }}
      title={interactive ? `${def.label}（點擊切換）` : def.label}
    >
      <div
        className="absolute"
        style={{
          width,
          height,
          left: (outerW - width) / 2,
          top: (outerH - height) / 2,
          transform: rotation ? `rotate(${rotation}deg)` : undefined,
        }}
      >
        <svg width={width} height={height} className="block">
          <symbol.Symbol
            state={componentState ?? def.createState()}
            ports={simulating ? ports : undefined}
            rotation={rotation}
          />
        </svg>

        {def.ports.map((port) => {
          const g = symbol.ports[port.id]
          const warn = warnings.includes(portKey(id, port.id))
          return (
            <Handle
              key={port.id}
              id={port.id}
              type="source"
              position={SIDE_TO_POSITION[rotateSide(g.side, rotation)]}
              className={['port-handle', warn ? 'port-warning' : ''].join(' ')}
              style={{
                left: g.x,
                top: g.y,
                right: 'auto',
                bottom: 'auto',
                transform: 'translate(-50%, -50%)',
                // 模擬中把埠畫成與壓力同色的接頭，蓋住短管與管線之間的接縫
                ...(simulating && !warn && { background: portColor(ports[port.id]), borderColor: portColor(ports[port.id]) }),
              }}
              title={warn ? `${port.id}：排氣埠未連接排氣口` : port.id}
            />
          )
        })}
      </div>
    </div>
  )
}

export const PneumaticNode = memo(PneumaticNodeImpl)
