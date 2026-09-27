/**
 * 在背景執行緒把模組的網格投影成前、上、右、左、等角五個視圖（隱藏線演算法見 projection.ts），
 * 大型模組也不會讓畫面卡住。網格與邊的分析結果都留在 worker 裡，改選項重新產生時不必再傳。
 */
import type { Vec3 } from '../geometry/vec3'
import { projectView, standardViews, type EdgeCache, type ProjectedView, type StandardView } from './projection'

export interface MeshGeometry {
  positions: Float32Array
  indices: Uint32Array
  faceRanges: Uint32Array
}

export interface ProjectRequest {
  id: number
  /** worker 還沒有的網格 */
  geometries: Record<string, MeshGeometry>
  instances: { key: string; matrix: number[]; item: number }[]
  front: Vec3
  up: Vec3
  /** 要判斷是否看得到的點（對外接口的位置，世界座標） */
  points: Vec3[]
}

export type ProjectReply =
  | { id: number; ok: true; views: Record<StandardView, ProjectedView> }
  | { id: number; ok: false; error: string; missing?: string[] }

const geometries = new Map<string, MeshGeometry>()
const edgeCache: EdgeCache = new Map()
const VIEWS: StandardView[] = ['front', 'top', 'right', 'left', 'iso']

self.onmessage = (event: MessageEvent<ProjectRequest>) => {
  const req = event.data
  try {
    for (const [key, g] of Object.entries(req.geometries)) geometries.set(key, g)
    const missing = [...new Set(req.instances.filter((i) => !geometries.has(i.key)).map((i) => i.key))]
    if (missing.length) {
      self.postMessage({ id: req.id, ok: false, error: 'missing', missing } satisfies ProjectReply)
      return
    }
    const meshes = req.instances.map((i) => ({ key: i.key, ...geometries.get(i.key)!, matrix: i.matrix, item: i.item }))
    const bases = standardViews(req.front, req.up)
    const views = {} as Record<StandardView, ProjectedView>
    for (const name of VIEWS) {
      // 等角圖不畫隱藏線，也不需要判斷接口的點
      views[name] = projectView(meshes, bases[name], { hidden: name !== 'iso', points: name === 'iso' ? [] : req.points }, edgeCache)
    }
    const transfer = VIEWS.flatMap((name) => [views[name].visible.buffer, views[name].hidden.buffer])
    self.postMessage({ id: req.id, ok: true, views } satisfies ProjectReply, { transfer })
  } catch (err) {
    self.postMessage({ id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) } satisfies ProjectReply)
  }
}
