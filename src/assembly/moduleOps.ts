import { Matrix4 } from 'three'
import type { Product, ProductPort } from '../catalog/types'
import { checkMate, type MateResult } from '../threads'
import { newId } from '../utils/id'
import { fromMatrix, mateTransform, toMatrix } from './frames'
import type { Mat4, Mate, ModuleDoc, PortRef } from './types'

export type ProductMap = Readonly<Record<string, Product>>

export function createModule(name = '未命名模組'): ModuleDoc {
  const now = Date.now()
  return { id: newId('mod'), name, instances: [], mates: [], placements: {}, createdAt: now, updatedAt: now }
}

const touch = (doc: ModuleDoc, patch: Partial<ModuleDoc>): ModuleDoc => ({ ...doc, ...patch, updatedAt: Date.now() })

export function getPort(doc: ModuleDoc, products: ProductMap, ref: PortRef): ProductPort | undefined {
  const inst = doc.instances.find((i) => i.id === ref.instance)
  return inst && products[inst.productId]?.ports.find((p) => p.id === ref.port)
}

export const parentMateOf = (doc: ModuleDoc, instance: string): Mate | undefined =>
  doc.mates.find((m) => m.child.instance === instance)

/** 與某零件相連（直接或間接）的所有零件 */
export function groupOf(doc: ModuleDoc, instance: string): Set<string> {
  const group = new Set([instance])
  const queue = [instance]
  while (queue.length) {
    const cur = queue.pop()!
    for (const m of doc.mates) {
      const other = m.parent.instance === cur ? m.child.instance : m.child.instance === cur ? m.parent.instance : null
      if (other && !group.has(other)) {
        group.add(other)
        queue.push(other)
      }
    }
  }
  return group
}

/** 已經被鎖合使用的埠（instance:port） */
export function usedPorts(doc: ModuleDoc): Set<string> {
  return new Set(doc.mates.flatMap((m) => [`${m.parent.instance}:${m.parent.port}`, `${m.child.instance}:${m.child.port}`]))
}

export interface TransformResult {
  transforms: Record<string, Mat4>
  /** 引用的埠已不存在（例如產品的埠被刪除）的鎖合 */
  broken: string[]
}

/** 由根零件的位置與鎖合關係推導每個零件的世界矩陣 */
export function computeTransforms(doc: ModuleDoc, products: ProductMap): TransformResult {
  const transforms: Record<string, Mat4> = {}
  const broken: string[] = []
  const children = new Map<string, Mate[]>()
  for (const m of doc.mates) children.set(m.parent.instance, [...(children.get(m.parent.instance) ?? []), m])
  const hasParent = new Set(doc.mates.map((m) => m.child.instance))

  const visit = (instance: string, world: Matrix4) => {
    transforms[instance] = fromMatrix(world)
    for (const m of children.get(instance) ?? []) {
      if (transforms[m.child.instance]) continue
      const pp = getPort(doc, products, m.parent)
      const cp = getPort(doc, products, m.child)
      if (!pp || !cp) {
        // 埠已被刪除：先放在父零件的位置，讓使用者看得到並重新連接
        broken.push(m.id)
        visit(m.child.instance, world.clone())
        continue
      }
      visit(m.child.instance, mateTransform(world, pp.frame, cp.frame, m.angle))
    }
  }
  for (const inst of doc.instances) {
    if (!hasParent.has(inst.id)) visit(inst.id, toMatrix(doc.placements[inst.id]))
  }
  // 保險：若資料不一致（例如出現迴圈），仍給每個零件一個位置
  for (const inst of doc.instances) transforms[inst.id] ??= fromMatrix(toMatrix(doc.placements[inst.id]))
  return { transforms, broken }
}

export function addInstance(doc: ModuleDoc, productId: string, placement?: Mat4): { doc: ModuleDoc; instanceId: string } {
  const instanceId = newId('i')
  return {
    instanceId,
    doc: touch(doc, {
      instances: [...doc.instances, { id: instanceId, productId }],
      placements: { ...doc.placements, [instanceId]: placement ?? fromMatrix(new Matrix4()) },
    }),
  }
}

/** 移除零件：與它相連的子零件會變成獨立的根零件，並保持原本的位置 */
export function removeInstance(doc: ModuleDoc, products: ProductMap, instance: string): ModuleDoc {
  const { transforms } = computeTransforms(doc, products)
  const placements = { ...doc.placements }
  delete placements[instance]
  const orphans = doc.mates.filter((m) => m.parent.instance === instance).map((m) => m.child.instance)
  for (const o of orphans) placements[o] = transforms[o]
  return touch(doc, {
    instances: doc.instances.filter((i) => i.id !== instance),
    mates: doc.mates.filter((m) => m.parent.instance !== instance && m.child.instance !== instance),
    placements,
  })
}

/**
 * 讓某個零件成為它所在群組的根：沿著它到原本根零件的路徑，把鎖合的父子對調。
 * 對調後各零件的世界位置不變（公式形式相同、角度不變）。
 */
export function reroot(doc: ModuleDoc, products: ProductMap, instance: string): ModuleDoc {
  if (!parentMateOf(doc, instance)) return doc
  const { transforms } = computeTransforms(doc, products)
  const flip = new Set<string>()
  let oldRoot = instance
  for (let cur = parentMateOf(doc, instance); cur; cur = parentMateOf(doc, cur.parent.instance)) {
    flip.add(cur.id)
    oldRoot = cur.parent.instance
  }
  const placements = { ...doc.placements, [instance]: transforms[instance] }
  delete placements[oldRoot]
  return touch(doc, {
    mates: doc.mates.map((m) => (flip.has(m.id) ? { ...m, parent: m.child, child: m.parent } : m)),
    placements,
  })
}

export type ConnectError = 'same-part' | 'already-connected' | 'port-in-use' | 'missing-port'

export const CONNECT_ERROR_TEXT: Record<ConnectError, string> = {
  'same-part': '不能把零件接到自己身上',
  'already-connected': '這兩個零件已經連在一起了（不支援形成迴圈的連接）',
  'port-in-use': '這個埠已經接了其他零件，請先拆開',
  'missing-port': '找不到這個埠',
}

/**
 * 鎖合：parent 所在的群組不動，child 所在的整個群組移過來。
 * （使用者先點的埠當 parent、後點的當 child）
 */
export function connect(
  doc: ModuleDoc,
  products: ProductMap,
  parent: PortRef,
  child: PortRef,
  angle = 0,
): { doc: ModuleDoc; mateId: string } | { error: ConnectError } {
  if (parent.instance === child.instance) return { error: 'same-part' }
  if (!getPort(doc, products, parent) || !getPort(doc, products, child)) return { error: 'missing-port' }
  if (groupOf(doc, parent.instance).has(child.instance)) return { error: 'already-connected' }
  const used = usedPorts(doc)
  if (used.has(`${parent.instance}:${parent.port}`) || used.has(`${child.instance}:${child.port}`)) return { error: 'port-in-use' }

  const rerooted = reroot(doc, products, child.instance)
  const placements = { ...rerooted.placements }
  delete placements[child.instance]
  const mateId = newId('m')
  return {
    mateId,
    doc: touch(rerooted, { mates: [...rerooted.mates, { id: mateId, parent, child, angle: normalizeAngle(angle) }], placements }),
  }
}

/** 拆開：子零件群組保持目前的位置，成為獨立的群組 */
export function disconnect(doc: ModuleDoc, products: ProductMap, mateId: string): ModuleDoc {
  const mate = doc.mates.find((m) => m.id === mateId)
  if (!mate) return doc
  const { transforms } = computeTransforms(doc, products)
  return touch(doc, {
    mates: doc.mates.filter((m) => m.id !== mateId),
    placements: { ...doc.placements, [mate.child.instance]: transforms[mate.child.instance] },
  })
}

export const normalizeAngle = (deg: number): number => ((Math.round(deg * 1000) / 1000) % 360 + 360) % 360

export function setMateAngle(doc: ModuleDoc, mateId: string, angle: number): ModuleDoc {
  return touch(doc, { mates: doc.mates.map((m) => (m.id === mateId ? { ...m, angle: normalizeAngle(angle) } : m)) })
}

/** 移動根零件（未鎖合的群組）的位置 */
export function setPlacement(doc: ModuleDoc, instance: string, placement: Mat4): ModuleDoc {
  return touch(doc, { placements: { ...doc.placements, [instance]: placement } })
}

/** 兩個埠鎖合後能否繞軸旋轉：任一端固定即固定；有等分限制時取步數較少者 */
export function mateRotation(a: ProductPort | undefined, b: ProductPort | undefined): 'free' | 'fixed' | { steps: number } {
  const rotations = [a?.rotation, b?.rotation]
  if (rotations.includes('fixed')) return 'fixed'
  const steps = rotations.flatMap((r) => (r && typeof r === 'object' ? [r.steps] : []))
  return steps.length ? { steps: Math.min(...steps) } : 'free'
}

export interface MateCheck {
  mate: Mate
  result: MateResult
}

/** 模組中每個鎖合的搭配檢查（產品規格修改後會自動重新檢查） */
export function mateChecks(doc: ModuleDoc, products: ProductMap): MateCheck[] {
  return doc.mates.map((mate) => ({
    mate,
    result: checkMate(getPort(doc, products, mate.parent)?.spec, getPort(doc, products, mate.child)?.spec),
  }))
}
