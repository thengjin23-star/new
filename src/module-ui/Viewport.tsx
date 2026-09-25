import { GizmoHelper, GizmoViewport, OrbitControls } from '@react-three/drei'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Box3, Color, Matrix4, Vector3, type Group, type PerspectiveCamera } from 'three'
import { computeTransforms } from '../assembly/moduleOps'
import type { ModuleInstance } from '../assembly/types'
import { faceOfTriangle, type Tessellation } from '../catalog/tessellation'
import type { Product } from '../catalog/types'
import type { Vec3 } from '../geometry/vec3'
import { faceGeometry, geometriesFor } from './geometryCache'
import { useModuleStore, useTransforms } from './moduleStore'
import { PortMarker } from './PortMarker'

const DEFAULT_COLOR = new Color('#b9c1c9')

function InstanceView({ instance, product, mesh, matrix }: { instance: ModuleInstance; product: Product; mesh: Tessellation; matrix: number[] }) {
  const group = useRef<Group>(null)
  const geometries = geometriesFor(product.source.sha256, mesh)
  const selected = useModuleStore((s) => s.selected === instance.id)
  const connecting = useModuleStore((s) => !!s.connectFrom)
  const defining = useModuleStore((s) => s.mode === 'define-port')
  const [hover, setHover] = useState<{ part: number; face: number } | null>(null)
  const colors = useMemo(() => mesh.parts.map((p) => (p.color ? new Color(...p.color) : DEFAULT_COLOR)), [mesh])

  useLayoutEffect(() => {
    const g = group.current
    if (!g) return
    g.matrix.fromArray(matrix)
    g.matrixWorldNeedsUpdate = true
  }, [matrix])

  const onClick = (e: ThreeEvent<MouseEvent>, partIndex: number) => {
    if (e.delta > 4) return // 拖曳旋轉視角，不是點選
    e.stopPropagation()
    const s = useModuleStore.getState()
    if (s.mode === 'define-port' && e.faceIndex != null) {
      const local = e.object.worldToLocal(e.point.clone())
      s.pickFace(instance.id, partIndex, e.faceIndex, local.toArray() as Vec3)
    } else {
      s.select(instance.id)
    }
  }

  const onMove = (e: ThreeEvent<PointerEvent>, partIndex: number) => {
    if (!defining || e.faceIndex == null) return
    e.stopPropagation()
    const face = faceOfTriangle(mesh.parts[partIndex], e.faceIndex)
    if (!hover || hover.part !== partIndex || hover.face !== face) setHover({ part: partIndex, face })
  }

  return (
    <group ref={group} name={instance.id} matrixAutoUpdate={false}>
      {geometries.map((g, i) => (
        <mesh
          key={i}
          geometry={g}
          onClick={(e) => onClick(e, i)}
          onPointerMove={(e) => onMove(e, i)}
          onPointerOut={() => setHover(null)}
        >
          <meshStandardMaterial
            color={colors[i]}
            metalness={0.15}
            roughness={0.55}
            emissive={selected ? '#2563eb' : '#000000'}
            emissiveIntensity={selected ? 0.22 : 0}
            transparent={connecting}
            opacity={connecting ? 0.75 : 1}
          />
        </mesh>
      ))}
      {defining && hover && (
        <mesh geometry={faceGeometry(product.source.sha256, hover.part, mesh.parts[hover.part], hover.face)} renderOrder={3}>
          <meshBasicMaterial color="#2563eb" transparent opacity={0.45} depthTest={false} />
        </mesh>
      )}
      {product.ports.map((p) => (
        <PortMarker key={p.id} instanceId={instance.id} port={p} showLabel={selected} />
      ))}
    </group>
  )
}

/** 收到縮放要求時，把相機對準所有零件 */
function FitController({ root }: { root: React.RefObject<Group | null> }) {
  const fitRequest = useModuleStore((s) => s.fitRequest)
  const get = useThree((s) => s.get)
  useEffect(() => {
    const g = root.current
    if (!g) return
    const state = get()
    const camera = state.camera as PerspectiveCamera
    const controls = state.controls as unknown as { target: Vector3; update(): void } | null
    const target = useModuleStore.getState().fitTarget
    const box = new Box3().setFromObject((target && g.getObjectByName(target)) || g)
    if (box.isEmpty()) return
    const center = box.getCenter(new Vector3())
    const radius = Math.max(box.getSize(new Vector3()).length() / 2, 20)
    const distance = radius / Math.sin(((camera.fov / 2) * Math.PI) / 180)
    const dir = new Vector3(0.8, -1, 0.7).normalize()
    camera.position.copy(center).addScaledVector(dir, distance * 1.1)
    camera.near = Math.max(0.1, distance / 200)
    camera.far = distance * 50
    camera.updateProjectionMatrix()
    controls?.target.copy(center)
    controls?.update()
  }, [fitRequest, get, root])
  return null
}

/** 開發模式專用：讓自動化測試能把零件上的 3D 點換算成螢幕座標 */
function TestHook() {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    w.__pneumatic3d = {
      project(instanceId: string, local: Vec3) {
        const { doc, products } = useModuleStore.getState()
        const { transforms } = computeTransforms(doc, products)
        const p = new Vector3(...local).applyMatrix4(new Matrix4().fromArray(transforms[instanceId])).project(camera)
        const rect = gl.domElement.getBoundingClientRect()
        return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height }
      },
      state: () => useModuleStore.getState(),
    }
    return () => {
      delete w.__pneumatic3d
    }
  }, [camera, gl])
  return null
}

export function Viewport() {
  const doc = useModuleStore((s) => s.doc)
  const products = useModuleStore((s) => s.products)
  const meshes = useModuleStore((s) => s.meshes)
  const { transforms } = useTransforms()
  const root = useRef<Group>(null)

  return (
    <Canvas
      className="touch-none"
      camera={{ position: [260, -320, 220], up: [0, 0, 1], fov: 40, near: 0.5, far: 50000 }}
      onPointerMissed={(e) => {
        if (e.type !== 'click') return
        const s = useModuleStore.getState()
        if (s.connectFrom) s.cancelConnect()
        else if (s.mode === 'select') s.select(undefined)
      }}
    >
      <color attach="background" args={['#eef2f6']} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[300, -200, 500]} intensity={1.7} />
      <directionalLight position={[-300, 300, 200]} intensity={0.7} />
      <gridHelper args={[1200, 60, '#c3ccd6', '#dde3ea']} rotation={[Math.PI / 2, 0, 0]} />
      <group ref={root}>
        {doc.instances.map((inst) => {
          const product = products[inst.productId]
          const mesh = product && meshes[product.source.sha256]
          if (!product || !mesh || !transforms[inst.id]) return null
          return <InstanceView key={inst.id} instance={inst} product={product} mesh={mesh} matrix={transforms[inst.id]} />
        })}
      </group>
      <OrbitControls makeDefault enableDamping={false} />
      <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
        <GizmoViewport axisColors={['#dc2626', '#16a34a', '#2563eb']} labelColor="white" />
      </GizmoHelper>
      <FitController root={root} />
      <TestHook />
    </Canvas>
  )
}
