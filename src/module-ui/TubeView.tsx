import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { CubicBezierCurve3, TubeGeometry, Vector3 } from 'three'
import { tubeControlPoints } from '../assembly/tubes'
import type { ModuleTube } from '../assembly/types'
import { PORT_STATE_COLOR } from '../theme'
import { tubeFrames, useModuleStore, useTransforms } from './moduleStore'
import { useSimTubeState } from './simulation'

/** PU 管的顏色（半透明藍，與一般氣動配管相同）；模擬時依壓力狀態上色 */
const TUBE_COLOR = '#38bdf8'

export function TubeView({ tube }: { tube: ModuleTube }) {
  const simState = useSimTubeState(tube.id)
  const color = simState ? PORT_STATE_COLOR[simState] : undefined
  const doc = useModuleStore((s) => s.doc)
  const products = useModuleStore((s) => s.products)
  const selected = useModuleStore((s) => s.selectedTube === tube.id)
  const { transforms } = useTransforms()
  const frames = tubeFrames(doc, products, tube, transforms)
  const key = frames ? JSON.stringify(frames) : ''
  const geometry = useMemo(() => {
    if (!frames) return undefined
    const pts = tubeControlPoints(frames[0], frames[1]).map((p) => new Vector3(...p))
    return new TubeGeometry(new CubicBezierCurve3(pts[0], pts[1], pts[2], pts[3]), 64, tube.od / 2, 12, false)
    // frames 以 key 比較（每次重新計算的陣列內容相同時不重建）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tube.od])
  useEffect(() => () => geometry?.dispose(), [geometry])
  if (!geometry) return null

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return
    e.stopPropagation()
    const s = useModuleStore.getState()
    if (s.mode === 'select' || s.mode === 'tube') s.selectTube(tube.id)
  }
  return (
    <mesh geometry={geometry} onClick={onClick} name={`tube:${tube.id}`}>
      <meshStandardMaterial
        color={color ?? (selected ? '#2563eb' : TUBE_COLOR)}
        roughness={0.4}
        metalness={0}
        transparent
        opacity={0.85}
        emissive={selected ? '#1d4ed8' : '#000000'}
        emissiveIntensity={selected ? 0.3 : 0}
      />
    </mesh>
  )
}
