import { Line } from '@react-three/drei'
import { OverlayHtml } from './OverlayHtml'
import type { Vec3 } from '../geometry/vec3'
import { formatMm } from './bounds'
import { useModuleStore } from './moduleStore'
import { useModuleBounds } from './useModuleBounds'

const MEASURE_COLOR = '#db2777'
const DIM_COLOR = '#0f766e'

const labelClass = 'rounded px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap text-white shadow tabular-nums'

/** 量測：點選的點、連線與距離 */
export function MeasureOverlay() {
  const points = useModuleStore((s) => s.measure)
  const active = useModuleStore((s) => s.mode === 'measure')
  if (!active || points.length === 0) return null
  const [a, b] = points
  const size = 1.2
  return (
    <group>
      {points.map((p, i) => (
        <mesh key={i} position={p} renderOrder={5}>
          <sphereGeometry args={[size, 16, 12]} />
          <meshBasicMaterial color={MEASURE_COLOR} depthTest={false} />
        </mesh>
      ))}
      {b && (
        <>
          <Line points={[a, b]} color={MEASURE_COLOR} lineWidth={2} depthTest={false} renderOrder={5} />
          <OverlayHtml position={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]} center zIndexRange={[30, 0]}>
            <div className={labelClass} style={{ background: MEASURE_COLOR }} data-measure>
              {formatMm(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]))} mm
              <span className="ml-1.5 font-normal opacity-90">
                ΔX {formatMm(Math.abs(b[0] - a[0]))}　ΔY {formatMm(Math.abs(b[1] - a[1]))}　ΔZ {formatMm(Math.abs(b[2] - a[2]))}
              </span>
            </div>
          </OverlayHtml>
        </>
      )}
    </group>
  )
}

/** 外形尺寸線：沿外框底部前緣（X）、右緣（Y）與右前直角邊（Z） */
export function DimensionLines() {
  const show = useModuleStore((s) => s.showDims)
  const bounds = useModuleBounds()
  if (!show || !bounds) return null
  const { min, max } = bounds
  const gap = Math.max(4, Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) * 0.06)
  const x0: Vec3 = [min[0], min[1] - gap, min[2]]
  const x1: Vec3 = [max[0], min[1] - gap, min[2]]
  const y0: Vec3 = [max[0] + gap, min[1], min[2]]
  const y1: Vec3 = [max[0] + gap, max[1], min[2]]
  const z0: Vec3 = [max[0] + gap, min[1] - gap, min[2]]
  const z1: Vec3 = [max[0] + gap, min[1] - gap, max[2]]
  const dims: [Vec3, Vec3, string][] = [
    [x0, x1, `W ${formatMm(max[0] - min[0])}`],
    [y0, y1, `D ${formatMm(max[1] - min[1])}`],
    [z0, z1, `H ${formatMm(max[2] - min[2])}`],
  ]
  return (
    <group>
      {/* 外框（淡色） */}
      <mesh position={[(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]}>
        <boxGeometry args={[max[0] - min[0], max[1] - min[1], max[2] - min[2]]} />
        <meshBasicMaterial color={DIM_COLOR} wireframe transparent opacity={0.25} />
      </mesh>
      {dims.map(([a, b, text]) => (
        <group key={text}>
          <Line points={[a, b]} color={DIM_COLOR} lineWidth={1.5} />
          <OverlayHtml position={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]} center zIndexRange={[25, 0]}>
            <div className={labelClass} style={{ background: DIM_COLOR }}>
              {text} mm
            </div>
          </OverlayHtml>
        </group>
      ))}
    </group>
  )
}
