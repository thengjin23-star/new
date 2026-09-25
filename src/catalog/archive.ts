import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import type { ModuleDoc } from '../assembly/types'
import { distance } from '../geometry/vec3'
import { formatSpec, specKey } from '../threads'
import { newId } from '../utils/id'
import type { CatalogStore } from './db'
import { deserializeTessellation, serializeTessellation } from './tessellation'
import { productLabel, type Product, type ProductPort } from './types'

/** 產品庫匯出檔與模組匯出檔的副檔名 */
export const LIBRARY_EXT = '.plib'
export const MODULE_EXT = '.pmod'

interface ArchiveManifest {
  format: 'pneumatic-archive'
  version: 1
  kind: 'library' | 'module'
  exportedAt: number
  products: Product[]
  module?: ModuleDoc
}

export interface ArchiveImportReport {
  kind: ArchiveManifest['kind']
  productsAdded: number
  productsMerged: number
  /** 補進本機產品的新埠數 */
  portsAdded: number
  /** 本機埠原本沒有規格、由匯入檔補上的數量 */
  specsFilled: number
  /** 無法自動合併的差異（保留本機設定） */
  conflicts: string[]
  moduleId?: string
}

/** 匯出整個產品庫（或指定的產品）：原始 CAD 檔＋網格＋產品資料 */
export async function exportLibraryArchive(store: CatalogStore, productIds?: readonly string[]): Promise<Uint8Array> {
  const all = await store.listProducts()
  const products = productIds ? all.filter((p) => productIds.includes(p.id)) : all
  return buildArchive(store, products, 'library')
}

/** 匯出一個模組，連同它用到的產品，讓同事匯入後可以直接開啟 */
export async function exportModuleArchive(store: CatalogStore, moduleId: string): Promise<Uint8Array> {
  const module = await store.getModule(moduleId)
  if (!module) throw new Error('找不到這個模組')
  const ids = [...new Set(module.instances.map((i) => i.productId))]
  const products = (await Promise.all(ids.map((id) => store.getProduct(id)))).filter((p): p is Product => !!p)
  return buildArchive(store, products, 'module', module)
}

async function buildArchive(
  store: CatalogStore,
  products: Product[],
  kind: ArchiveManifest['kind'],
  module?: ModuleDoc,
): Promise<Uint8Array> {
  const manifest: ArchiveManifest = { format: 'pneumatic-archive', version: 1, kind, exportedAt: Date.now(), products, module }
  const entries: Zippable = { 'manifest.json': strToU8(JSON.stringify(manifest)) }
  for (const p of products) {
    const sha = p.source.sha256
    const [file, mesh] = await Promise.all([store.getFile(sha), store.getMesh(sha)])
    if (file) entries[`files/${sha}`] = file.bytes
    if (mesh) entries[`meshes/${sha}.bin`] = serializeTessellation(mesh.tessellation)
  }
  return zipSync(entries, { level: 6 })
}

/**
 * 匯入產品庫或模組檔，與本機產品庫合併：
 * - 本機沒有的產品（依原始檔 SHA-256 判斷）→ 新增
 * - 本機已有 → 保留本機設定；補上本機沒有的埠，以及本機尚未設定的規格；有差異的列入 conflicts
 * - 模組 → 依合併結果重新對應產品與埠；若本機已有相同 id 的模組，另存一份
 */
export async function importArchive(store: CatalogStore, bytes: Uint8Array): Promise<ArchiveImportReport> {
  let entries: Record<string, Uint8Array>
  let manifest: ArchiveManifest
  try {
    entries = unzipSync(bytes)
    manifest = JSON.parse(strFromU8(entries['manifest.json']))
  } catch {
    throw new Error('檔案格式錯誤：不是有效的產品庫（.plib）或模組（.pmod）檔')
  }
  if (manifest?.format !== 'pneumatic-archive') throw new Error('檔案格式錯誤：不是有效的產品庫或模組檔')

  const report: ArchiveImportReport = {
    kind: manifest.kind,
    productsAdded: 0,
    productsMerged: 0,
    portsAdded: 0,
    specsFilled: 0,
    conflicts: [],
  }
  const productIdMap = new Map<string, string>()
  const portIdMaps = new Map<string, Map<string, string>>()

  for (const incoming of manifest.products) {
    const sha = incoming.source.sha256
    const fileBytes = entries[`files/${sha}`]
    const meshBytes = entries[`meshes/${sha}.bin`]
    const local = await store.getProductBySha(sha)

    if (!local) {
      if (!fileBytes && !meshBytes) {
        report.conflicts.push(`${productLabel(incoming)}：匯入檔缺少 3D 資料，已略過`)
        continue
      }
      const id = (await store.getProduct(incoming.id)) ? newId('prod') : incoming.id
      await store.addProductWithData(
        { ...incoming, id },
        fileBytes ? { sha256: sha, fileName: incoming.source.fileName, bytes: fileBytes } : undefined,
        meshBytes ? { sha256: sha, tessellation: deserializeTessellation(meshBytes) } : undefined,
      )
      productIdMap.set(incoming.id, id)
      portIdMaps.set(incoming.id, new Map(incoming.ports.map((p) => [p.id, p.id])))
      report.productsAdded++
      continue
    }

    report.productsMerged++
    const map = new Map<string, string>()
    const ports: ProductPort[] = local.ports.map((p) => ({ ...p }))
    let changed = false
    for (const port of incoming.ports) {
      const match =
        ports.find((p) => p.id === port.id) ??
        ports.find((p) => p.name === port.name && distance(p.frame.origin, port.frame.origin) < 0.5)
      if (!match) {
        const name = ports.some((p) => p.name === port.name) ? `${port.name}（匯入）` : port.name
        ports.push({ ...port, name })
        map.set(port.id, port.id)
        report.portsAdded++
        changed = true
        continue
      }
      map.set(port.id, match.id)
      if (port.spec && !match.spec) {
        match.spec = port.spec
        report.specsFilled++
        changed = true
      } else if (port.spec && match.spec && specKey(port.spec) !== specKey(match.spec)) {
        report.conflicts.push(
          `${productLabel(local)}「${match.name}」：本機為 ${formatSpec(match.spec)}，匯入檔為 ${formatSpec(port.spec)}，保留本機設定`,
        )
      }
    }
    if (changed) await store.putProduct({ ...local, ports, updatedAt: Date.now() })
    if (fileBytes && !(await store.getFile(sha))) {
      await store.putFile({ sha256: sha, fileName: incoming.source.fileName, bytes: fileBytes })
    }
    if (meshBytes && !(await store.getMesh(sha))) {
      await store.putMesh({ sha256: sha, tessellation: deserializeTessellation(meshBytes) })
    }
    productIdMap.set(incoming.id, local.id)
    portIdMaps.set(incoming.id, map)
  }

  if (manifest.module) report.moduleId = await importModule(store, manifest.module, productIdMap, portIdMaps, report)
  return report
}

async function importModule(
  store: CatalogStore,
  module: ModuleDoc,
  productIdMap: Map<string, string>,
  portIdMaps: Map<string, Map<string, string>>,
  report: ArchiveImportReport,
): Promise<string> {
  const archiveProductOf = new Map(module.instances.map((i) => [i.id, i.productId]))
  const instances = module.instances
    .filter((i) => productIdMap.has(i.productId))
    .map((i) => ({ ...i, productId: productIdMap.get(i.productId)! }))
  const kept = new Set(instances.map((i) => i.id))
  if (kept.size < module.instances.length) report.conflicts.push('模組中有零件缺少產品資料，已移除')

  const remap = (ref: { instance: string; port: string }) => {
    const product = archiveProductOf.get(ref.instance)!
    return { instance: ref.instance, port: portIdMaps.get(product)?.get(ref.port) ?? ref.port }
  }
  const mates = module.mates
    .filter((m) => kept.has(m.parent.instance) && kept.has(m.child.instance))
    .map((m) => ({ ...m, parent: remap(m.parent), child: remap(m.child) }))

  const exists = await store.getModule(module.id)
  const id = exists ? newId('mod') : module.id
  await store.putModule({
    ...module,
    id,
    name: exists ? `${module.name}（匯入）` : module.name,
    instances,
    mates,
    placements: Object.fromEntries(Object.entries(module.placements).filter(([k]) => kept.has(k))),
    updatedAt: Date.now(),
  })
  return id
}
