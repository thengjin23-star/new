import { Html } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useMemo } from 'react'
import { Quaternion, Vector3 } from 'three'
import type { ProductPort } from '../catalog/types'
import { formatSpec, formatSpecShort } from '../threads'
import { LEVEL_COLOR } from '../components/levels'
import { getPort } from '../assembly/moduleOps'
import { isTubeSocket, tubeCheck } from '../assembly/tubes'
import { compatibilityWith, useModuleStore } from './moduleStore'
import { useSimPortState } from './simulation'
import { PORT_STATE_COLOR } from '../theme'

const Y = new Vector3(0, 1, 0)

/** 埠的標記：貼在埠口的圓片＋朝外的箭頭，以及可點選的名稱標籤 */
export function PortMarker({ instanceId, port, showLabel }: { instanceId: string; port: ProductPort; showLabel: boolean }) {
  const connectFrom = useModuleStore((s) => s.connectFrom)
  const is = (r: { instance: string; port: string }) => r.instance === instanceId && r.port === port.id
  const used = useModuleStore(
    (s) => s.doc.mates.some((m) => is(m.parent) || is(m.child)) || (s.doc.tubes ?? []).some((t) => is(t.a) || is(t.b)),
  )
  const clickPort = useModuleStore((s) => s.clickPort)
  const tubeMode = useModuleStore((s) => s.mode === 'tube')
  const tubeFrom = useModuleStore((s) => s.tubeFrom)
  const tubeFromPort = useModuleStore((s) => (s.tubeFrom ? getPort(s.doc, s.products, s.tubeFrom) : undefined))
  const isSupply = useModuleStore((s) => !!s.doc.supply && is(s.doc.supply))
  const simState = useSimPortState(instanceId, port.id)

  const quaternion = useMemo(() => new Quaternion().setFromUnitVectors(Y, new Vector3(...port.frame.axis)), [port.frame.axis])
  const isFrom = (connectFrom && is(connectFrom)) || (tubeFrom && is(tubeFrom))
  const candidate = !!connectFrom && !isFrom && connectFrom.instance !== instanceId && !used
  const result = candidate ? compatibilityWith(connectFrom, { instance: instanceId, port: port.id }) : undefined
  // 接 PU 管：可接的快插接頭（已選第一端時，管徑相同的才標綠色）
  const socket = isTubeSocket(port) && !used
  const tubeCandidate = tubeMode && socket && !isFrom
  const tubeOk = tubeCandidate && tubeFrom ? tubeCheck(tubeFromPort, port).ok : tubeCandidate

  const color = simState
    ? PORT_STATE_COLOR[simState]
    : isSupply
      ? '#dc2626'
      : used
      ? '#16a34a'
      : isFrom
        ? '#2563eb'
        : result
          ? LEVEL_COLOR[result.level]
          : tubeMode
            ? tubeOk
              ? '#0ea5e9'
              : '#94a3b8'
            : port.spec
              ? '#334155'
              : '#f59e0b'
  const r = Math.min(7, Math.max(2, (port.detected?.diameter ?? 6) * 0.5))
  const s = Math.max(1, r / 3)
  const stem = used ? 0 : r * 1.6 + 4

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return
    e.stopPropagation()
    const s = useModuleStore.getState()
    if (s.mode === 'simulate') return
    // 量測模式：以埠的中心為量測點
    if (s.mode === 'measure') s.addMeasurePortPoint({ instance: instanceId, port: port.id })
    else clickPort({ instance: instanceId, port: port.id })
  }

  // 標籤保持精簡（安裝面只顯示名稱），完整規格放在提示文字
  const base = !port.spec ? `${port.name} ？` : port.spec.kind === 'interface' ? port.name : `${port.name} ${formatSpecShort(port.spec)}`
  const label = isSupply ? `${base}（供氣）` : base
  const tip = tubeMode
    ? socket
      ? tubeFrom
        ? tubeOk
          ? '點選以接上 PU 管'
          : '管徑不同，需要變徑接頭'
        : '點選 PU 管的第一端'
      : 'PU 管只能接在快插接頭的插管端'
    : result
      ? result.summary
      : port.spec
        ? `${formatSpec(port.spec)}：點選以連接`
        : '尚未設定規格：選取零件後可在右側編輯'
  return (
    <group position={port.frame.origin} quaternion={quaternion}>
      <mesh position={[0, 0.35, 0]} onClick={onClick} renderOrder={2}>
        <cylinderGeometry args={[r * 1.05, r * 1.05, 0.7, 32]} />
        <meshBasicMaterial color={color} transparent opacity={used ? 0.55 : 0.8} />
      </mesh>
      {!used && (
        <group onClick={onClick}>
          <mesh position={[0, stem / 2, 0]}>
            <cylinderGeometry args={[0.35 * s, 0.35 * s, stem, 12]} />
            <meshBasicMaterial color={color} />
          </mesh>
          <mesh position={[0, stem + 1.4 * s, 0]}>
            <coneGeometry args={[1.2 * s, 2.8 * s, 16]} />
            <meshBasicMaterial color={color} />
          </mesh>
        </group>
      )}
      {!simState && (showLabel || isFrom || candidate || tubeCandidate || isSupply) && (
        <Html position={[0, stem + 4 * s + 2, 0]} center zIndexRange={[20, 0]}>
          <button
            type="button"
            data-port-label={`${instanceId}:${port.id}`}
            onClick={(e) => {
              e.stopPropagation()
              const s = useModuleStore.getState()
              if (s.mode === 'measure') s.addMeasurePortPoint({ instance: instanceId, port: port.id })
              else clickPort({ instance: instanceId, port: port.id })
            }}
            className="rounded-full border-2 bg-white/95 px-1.5 py-px text-[10px] leading-4 font-medium whitespace-nowrap text-slate-700 shadow-sm hover:bg-white"
            style={{ borderColor: color }}
            title={tip}
          >
            {label}
          </button>
        </Html>
      )}
    </group>
  )
}
