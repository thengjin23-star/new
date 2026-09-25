import type { Vec3 } from '../geometry/vec3'
import { parseSpec, type InterfaceSpec } from '../threads'
import type { CatalogStore } from './db'
import { importCadFile, type CadParser } from './importer'
import { makePort } from './ports'
import type { ProductCategory, ProductPort } from './types'

/** public/samples/manifest.json 的格式（由 scripts/make-sample-parts.mjs 產生） */
export interface SamplePortDef {
  name: string
  /** 規格文字，例如 Rc1/8、R1/8、Ø6 快插、安裝面：… */
  spec: string
  role?: InterfaceSpec['role']
  shape: 'hole' | 'boss'
  origin: Vec3
  axis: Vec3
}

export interface SamplePartDef {
  file: string
  modelCode: string
  name: string
  category: ProductCategory
  ports: SamplePortDef[]
}

export interface SampleManifest {
  version: number
  parts: SamplePartDef[]
}

export function portsFromDefs(defs: readonly SamplePortDef[]): ProductPort[] {
  return defs.map((d) => {
    const parsed = parseSpec(d.spec, { gender: d.shape === 'hole' ? 'female' : 'male', interfaceRole: d.role })
    if (!parsed.ok) throw new Error(`範例埠「${d.name}」的規格錯誤：${parsed.error}`)
    return makePort({ name: d.name, spec: parsed.spec, origin: d.origin, axis: d.axis, detected: { shape: d.shape } })
  })
}

/**
 * 安裝範例零件庫。已存在的範例（同一個檔案）若已經有埠設定就保留使用者的版本。
 * readFile 由呼叫端提供：瀏覽器用 fetch，測試用 fs。
 */
export async function installSamples(
  store: CatalogStore,
  manifest: SampleManifest,
  readFile: (file: string) => Promise<Uint8Array>,
  parse: CadParser,
): Promise<{ added: number; existing: number }> {
  let added = 0
  let existing = 0
  for (const def of manifest.parts) {
    const { product, status } = await importCadFile(store, def.file, await readFile(def.file), parse)
    if (status === 'existing' && product.ports.length > 0) {
      existing++
      continue
    }
    await store.putProduct({
      ...product,
      modelCode: def.modelCode,
      name: def.name,
      category: def.category,
      ports: portsFromDefs(def.ports),
      updatedAt: Date.now(),
    })
    if (status === 'new') added++
    else existing++
  }
  return { added, existing }
}
