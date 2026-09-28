import type { Vec3 } from '../geometry/vec3'
import type { MeshGeometry, ProjectReply, ProjectRequest } from './drawing.worker'
import type { ProjectedView, StandardView } from './projection'

let worker: Worker | undefined
let nextId = 0
/** worker 已經有的網格 */
const sent = new Set<string>()
const pending = new Map<number, { resolve: (r: ProjectReply) => void; reject: (e: Error) => void }>()

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./drawing.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<ProjectReply>) => {
    const request = pending.get(event.data.id)
    if (!request) return
    pending.delete(event.data.id)
    request.resolve(event.data)
  }
  worker.onerror = () => {
    for (const request of pending.values()) request.reject(new Error('圖面產生元件載入失敗，請重新整理後再試'))
    pending.clear()
    worker?.terminate()
    worker = undefined
    sent.clear()
  }
  return worker
}

function post(request: Omit<ProjectRequest, 'id'>): Promise<ProjectReply> {
  return new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ ...request, id })
  })
}

export interface ProjectInput {
  instances: { key: string; matrix: number[]; item: number }[]
  /** 依 key 取得網格（只有 worker 還沒有的才會讀取並傳送） */
  geometry: (key: string) => MeshGeometry | undefined
  front: Vec3
  up: Vec3
  points: Vec3[]
}

/** 在背景執行緒投影五個視圖 */
export async function projectModuleViews(input: ProjectInput): Promise<Record<StandardView, ProjectedView>> {
  const collect = (keys: Iterable<string>) => {
    const out: Record<string, MeshGeometry> = {}
    for (const key of keys) {
      const g = input.geometry(key)
      if (g) out[key] = g
    }
    return out
  }
  const request = { instances: input.instances, front: input.front, up: input.up, points: input.points }
  const fresh = collect(new Set(input.instances.map((i) => i.key).filter((k) => !sent.has(k))))
  let reply = await post({ ...request, geometries: fresh })
  Object.keys(fresh).forEach((k) => sent.add(k))
  if (!reply.ok && reply.missing) {
    // worker 重新啟動過：補傳缺少的網格
    reply = await post({ ...request, geometries: collect(reply.missing) })
    input.instances.forEach((i) => sent.add(i.key))
  }
  if (!reply.ok) throw new Error(reply.error)
  return reply.views
}
