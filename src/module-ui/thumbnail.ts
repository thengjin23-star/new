import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'
import type { Tessellation } from '../catalog/tessellation'

/** 縮圖尺寸（像素）：產品庫清單以約一半大小顯示，高解析螢幕也清楚 */
const W = 192
const H = 144
const DEFAULT_COLOR = '#94a3b8'

let renderer: WebGLRenderer | undefined

function getRenderer(): WebGLRenderer | undefined {
  if (renderer) return renderer
  try {
    const canvas = document.createElement('canvas')
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(1)
    renderer.setSize(W, H, false)
    renderer.setClearColor(0x000000, 0)
    return renderer
  } catch {
    return undefined
  }
}

/**
 * 以等角視角（Z 軸朝上、從右前上方看）畫出產品的縮圖，回傳 PNG。
 * 瀏覽器不支援 WebGL 時回傳 undefined（產品庫改顯示文字）。
 */
export async function renderThumbnail(mesh: Tessellation): Promise<Uint8Array | undefined> {
  const r = getRenderer()
  if (!r) return undefined
  const scene = new Scene()
  const disposables: { dispose(): void }[] = []
  for (const part of mesh.parts) {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(part.positions, 3))
    geometry.setAttribute('normal', new BufferAttribute(part.normals, 3))
    geometry.setIndex(new BufferAttribute(part.indices, 1))
    const material = new MeshStandardMaterial({ metalness: 0.15, roughness: 0.55 })
    if (part.color) material.color.setRGB(part.color[0], part.color[1], part.color[2])
    else material.color.set(DEFAULT_COLOR)
    scene.add(new Mesh(geometry, material))
    disposables.push(geometry, material)
  }
  scene.add(new AmbientLight(0xffffff, 1.1))
  const key = new DirectionalLight(0xffffff, 1.8)
  key.position.set(1, -1.2, 2)
  const fill = new DirectionalLight(0xffffff, 0.6)
  fill.position.set(-1.5, 1, 0.5)
  scene.add(key, fill)

  // 正交相機：沿等角方向看模型中心，視野剛好容納外框的 8 個角
  const { min, max } = mesh.bbox
  const center = new Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2)
  const dir = new Vector3(1, -1.25, 0.9).normalize()
  const size = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 1)
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.01, size * 20)
  camera.up.set(0, 0, 1)
  camera.position.copy(center).addScaledVector(dir, size * 4)
  camera.lookAt(center)
  camera.updateMatrixWorld()
  let halfW = 0
  let halfH = 0
  for (const x of [min[0], max[0]])
    for (const y of [min[1], max[1]])
      for (const z of [min[2], max[2]]) {
        const p = new Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse)
        halfW = Math.max(halfW, Math.abs(p.x))
        halfH = Math.max(halfH, Math.abs(p.y))
      }
  const aspect = W / H
  const half = Math.max(halfW / aspect, halfH) * 1.08
  camera.left = -half * aspect
  camera.right = half * aspect
  camera.top = half
  camera.bottom = -half
  camera.updateProjectionMatrix()

  r.render(scene, camera)
  const blob = await new Promise<Blob | null>((resolve) => r.domElement.toBlob(resolve, 'image/png'))
  for (const d of disposables) d.dispose()
  if (!blob) return undefined
  return new Uint8Array(await blob.arrayBuffer())
}
