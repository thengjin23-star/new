import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react'
import { memo, useEffect, useMemo, useRef, type PointerEvent } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { portKey, registry, resolveParams, type PortKey, type PortState } from '../../engine'
import { useCircuitStore } from '../../store/circuitStore'
import type { PneumaticFlowNode } from '../../store/flow'
import { portColor } from '../../theme'
import { getSymbol } from '../symbols/symbolRegistry'
import { flipSide, rotateSide, type Side } from '../symbols/types'

const SIDE_TO_POSITION: Record<Side, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
}

const NO_WARNINGS: PortKey[] = []
const NO_PRESSURE: Record<string, number> = {}

/** 標號與型號的位置：依序找左、右、上、下第一個沒有埠的一側，避免壓到管線 */
const LABEL_CLASS: Record<Side, string> = {
  left: 'top-1/2 right-full mr-2 -translate-y-1/2 text-right',
  right: 'top-1/2 left-full ml-2 -translate-y-1/2 text-left',
  top: 'bottom-full left-1/2 mb-1 -translate-x-1/2 text-center',
  bottom: 'top-full left-1/2 mt-1 -translate-x-1/2 text-center',
}
const LABEL_SIDES: readonly Side[] = ['left', 'right', 'top', 'bottom']

/**
 * 所有氣動元件共用的節點。外觀從符號註冊表取得、行為從引擎註冊表取得，
 * 模擬狀態則直接以 selector 訂閱 store 中屬於自己的那一小片（不經過 node.data），
 * 避免每一幀都讓 React Flow 比對全部節點。
 */
function PneumaticNodeImpl({ id, data, selected }: NodeProps<PneumaticFlowNode>) {
  const { componentType, rotation, flip, tag, product } = data
  const def = registry.get(componentType)
  const symbol = getSymbol(componentType)
  const params = useMemo(() => resolveParams(def, data.params), [def, data.params])

  const simulating = useCircuitStore((s) => s.status !== 'idle')
  const view = useCircuitStore((s) => s.view)
  const interact = useCircuitStore((s) => s.interact)
  const componentState = useCircuitStore((s) => s.sim.componentStates[id])
  const ports = useCircuitStore(
    useShallow((s) => {
      const result: Record<string, PortState> = {}
      for (const p of def.ports) result[p.id] = s.sim.portStates[portKey(id, p.id)] ?? 'blocked'
      return result
    }),
  )
  const pressure = useCircuitStore(
    useShallow((s) => {
      if (s.status === 'idle') return NO_PRESSURE
      const result: Record<string, number> = {}
      for (const p of def.ports) result[p.id] = s.sim.pressure[portKey(id, p.id)] ?? 0
      return result
    }),
  )
  const warnings = useCircuitStore(
    useShallow((s) => (s.status === 'idle' ? NO_WARNINGS : s.unconnectedExhausts.filter((k) => k.startsWith(`${id}:`)))),
  )
  // 一個埠接了兩條以上的管線：畫分歧點（字串比較，管線沒變就不重繪）
  const branchPorts = useCircuitStore((s) => {
    const count: Record<string, number> = {}
    for (const e of s.edges) {
      if (e.source === id) count[e.sourceHandle ?? ''] = (count[e.sourceHandle ?? ''] ?? 0) + 1
      if (e.target === id) count[e.targetHandle ?? ''] = (count[e.targetHandle ?? ''] ?? 0) + 1
    }
    return Object.keys(count)
      .filter((k) => count[k] > 1)
      .sort()
      .join(',')
  })

  // 旋轉或鏡射後 handle 的螢幕位置改變，需通知 React Flow 重新量測。
  // 掛載時不呼叫：那會單獨量測這一個節點，讓排隊中的 fitView 只對它縮放。
  const updateNodeInternals = useUpdateNodeInternals()
  const measured = useRef(`${rotation}:${!!flip}`)
  useEffect(() => {
    const key = `${rotation}:${!!flip}`
    if (measured.current === key) return
    measured.current = key
    updateNodeInternals(id)
  }, [id, rotation, flip, updateNodeInternals])

  const labels = useMemo(() => {
    if (view.portLabels !== 'iso') return undefined
    return Object.fromEntries(def.ports.filter((p) => p.iso).map((p) => [p.id, p.iso!]))
  }, [def, view.portLabels])

  const { width, height } = symbol
  const quarterTurn = rotation === 90 || rotation === 270
  const outerW = quarterTurn ? height : width
  const outerH = quarterTurn ? width : height
  const interactive = simulating && def.onInteract !== undefined
  const transforms = [rotation ? `rotate(${rotation}deg)` : '', flip ? 'scaleX(-1)' : ''].filter(Boolean).join(' ')
  const branches = branchPorts ? branchPorts.split(',') : []

  // 按鈕閥：按住作動、放開復歸
  const onPointerDown = (e: PointerEvent) => {
    if (!simulating || !(e.target as Element).closest('[data-momentary]')) return
    e.stopPropagation()
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    interact(id, 'press')
  }
  const onPointerUp = (e: PointerEvent) => {
    if (!simulating) return
    const state = componentState as { pressed?: boolean } | undefined
    if (state?.pressed) {
      e.stopPropagation()
      interact(id, 'release')
    }
  }

  const title = [tag, product?.modelCode, def.label].filter(Boolean).join('　')
  const portSides = new Set(Object.values(symbol.ports).map((g) => rotateSide(flipSide(g.side, flip), rotation)))
  const labelSide = data.labelSide ?? LABEL_SIDES.find((side) => !portSides.has(side)) ?? 'left'

  return (
    <div
      className={[
        'pneumatic-node relative rounded-sm',
        selected ? 'outline-2 outline-offset-4 outline-blue-500 outline-dashed' : '',
        interactive ? 'cursor-pointer' : '',
        simulating ? 'is-simulating' : '',
      ].join(' ')}
      style={{ width: outerW, height: outerH }}
      title={interactive ? `${title}（點擊切換）` : title}
      data-type={componentType}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        className="absolute"
        style={{
          width,
          height,
          left: (outerW - width) / 2,
          top: (outerH - height) / 2,
          transform: transforms || undefined,
        }}
      >
        <svg width={width} height={height} className="block overflow-visible">
          <symbol.Symbol
            state={componentState ?? def.createState(params)}
            ports={simulating ? ports : undefined}
            pressure={simulating ? pressure : undefined}
            params={params}
            rotation={rotation}
            flip={flip}
            labels={labels}
          />
          {branches.map((p) => {
            const g = symbol.ports[p]
            if (!g) return null
            return <circle key={p} cx={g.x} cy={g.y} r={4.5} fill={simulating ? portColor(ports[p]) : '#1e293b'} />
          })}
        </svg>

        {def.ports.map((port) => {
          const g = symbol.ports[port.id]
          const warn = warnings.includes(portKey(id, port.id))
          const shown = labels?.[port.id] ?? port.id
          return (
            <Handle
              key={port.id}
              id={port.id}
              type="source"
              position={SIDE_TO_POSITION[rotateSide(flipSide(g.side, flip), rotation)]}
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
              title={warn ? `${shown}：排氣埠未連接排氣口` : shown}
            />
          )
        })}
      </div>

      {view.showTags && (tag || product) && (
        <div className={`pointer-events-none absolute leading-tight whitespace-nowrap ${LABEL_CLASS[labelSide]}`} data-node-label>
          {tag && <div className="text-[11px] font-semibold text-slate-700">{tag}</div>}
          {product && <div className="font-mono text-[10px] text-slate-500">{product.modelCode}</div>}
        </div>
      )}
    </div>
  )
}

export const PneumaticNode = memo(PneumaticNodeImpl)
