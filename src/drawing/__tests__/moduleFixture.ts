import { projectView, standardViews, type ProjectionMesh, type ProjectedView } from '../projection'
import type { AssemblySheetInput, BomLine, ExternalPort, OrthoView } from '../assemblyLayout'
import type { Projection } from '../../settings/settings'
import type { Vec3 } from '../../geometry/vec3'
import { box, cylinder, translate } from './fixtures'

/** 繞 X 軸轉 90°（圓柱的 z 軸 → -y），再平移 */
const alongMinusY = (x: number, y: number, z: number) => [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, x, y, z, 1]
/** 繞 Y 軸轉 90°（圓柱的 z 軸 → +x），再平移 */
const alongPlusX = (x: number, y: number, z: number) => [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, x, y, z, 1]

/**
 * 測試用的閥島：集裝座 120×40×20、4 顆電磁閥、8 個快插接頭（前面）、1 個消音器（右側）
 */
export function valveIsland(): { meshes: ProjectionMesh[]; bom: BomLine[]; ports: { item: number; model: string; name: string; origin: Vec3; axis: Vec3 }[] } {
  const meshes: ProjectionMesh[] = []
  meshes.push({ key: 'base', ...box(120, 40, 20), matrix: translate(0, 0, 10), item: 1 })
  for (const x of [-45, -15, 15, 45]) meshes.push({ key: 'valve', ...box(18, 38, 45), matrix: translate(x, 0, 42.5), item: 2 })
  const ports: { item: number; model: string; name: string; origin: Vec3; axis: Vec3 }[] = []
  for (const x of [-45, -15, 15, 45]) {
    for (const [z, name] of [
      [36, 'A'],
      [52, 'B'],
    ] as const) {
      meshes.push({ key: 'fitting', ...cylinder(4, 12, 24), matrix: alongMinusY(x, -25, z), item: 3 })
      ports.push({ item: 3, model: 'KQ2H06-01', name, origin: [x, -31, z], axis: [0, -1, 0] })
    }
  }
  meshes.push({ key: 'silencer', ...cylinder(6, 20, 24), matrix: alongPlusX(70, 0, 10), item: 4 })
  ports.push({ item: 1, model: 'SS5Y5-20', name: 'P', origin: [-60, 0, 10], axis: [-1, 0, 0] })
  const bom: BomLine[] = [
    { item: 1, modelCode: 'SS5Y5-20-04', name: '集裝座', maker: 'SMC', quantity: 1 },
    { item: 2, modelCode: 'SY5120-5LZD-01', name: '5/2 單電控電磁閥', maker: 'SMC', quantity: 4 },
    { item: 3, modelCode: 'KQ2H06-01AS', name: '快插接頭 Ø6', maker: 'SMC', quantity: 8 },
    { item: 4, modelCode: 'AN20-02', name: '消音器', maker: 'SMC', quantity: 1 },
  ]
  return { meshes, bom, ports }
}

/** 把網格投影成組立圖需要的四個視圖 */
export function assemblyInput(projection: Projection = 'third', patch: Partial<AssemblySheetInput> = {}): AssemblySheetInput {
  const { meshes, bom, ports } = valveIsland()
  const bases = standardViews([0, -1, 0])
  const sideName = projection === 'third' ? 'right' : 'left'
  const cache = new Map()
  const points = ports.map((p) => p.origin)
  const views: Record<OrthoView | 'iso', ProjectedView> = {
    front: projectView(meshes, bases.front, { points }, cache),
    top: projectView(meshes, bases.top, { points }, cache),
    side: projectView(meshes, bases[sideName], { points }, cache),
    iso: projectView(meshes, bases.iso, {}, cache),
  }
  const basisOf = { front: bases.front, top: bases.top, side: bases[sideName] }
  const external: ExternalPort[] = ports.map((p, i) => ({
    tag: i + 1,
    item: p.item,
    modelCode: p.model,
    port: p.name,
    spec: p.name === 'P' ? 'Rc1/4 母牙' : 'Ø6 快插',
    views: Object.fromEntries(
      (['front', 'top', 'side'] as OrthoView[]).map((name) => {
        const b = basisOf[name]
        const pt = views[name].points[i]
        const dot = (u: Vec3, v: Vec3) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2]
        return [name, { x: pt.x, y: pt.y, visible: pt.visible, dx: dot(p.axis, b.right), dy: dot(p.axis, b.up), facing: dot(p.axis, b.forward) }]
      }),
    ),
  }))
  return {
    paper: 'A3',
    projection,
    views,
    bom,
    ports: external,
    title: { company: { name: '測試氣動股份有限公司', address: '台中市西屯區工業區一路 1 號', phone: '04-2345-6789' }, title: '閥島模組 VI-04', drawingNo: 'VI-2026-001', customer: '範例客戶', revision: 'A', date: '2026-09-27', drawer: '王小明' },
    notes: '1. 使用壓力 0.15～0.7 MPa。\n2. 流體：空氣。',
    ...patch,
  }
}
