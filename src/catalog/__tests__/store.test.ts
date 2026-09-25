import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { formatSpec, parseSpec } from '../../threads'
import { exportLibraryArchive, exportModuleArchive, importArchive } from '../archive'
import { CatalogStore } from '../db'
import { guessModelCode, importCadFile } from '../importer'
import { installSamples } from '../samples'
import { nodeParser, readSample, sampleManifest, uniqueDbName } from './nodeHelpers'

const open = () => CatalogStore.open(uniqueDbName())

async function withSamples() {
  const store = await open()
  await installSamples(store, sampleManifest(), readSample, nodeParser)
  return store
}

const byModel = async (store: CatalogStore, modelCode: string) => {
  const p = (await store.listProducts()).find((x) => x.modelCode === modelCode)
  if (!p) throw new Error(`找不到 ${modelCode}`)
  return p
}

describe('匯入 CAD 檔（以 SHA-256 認出同一個檔案）', () => {
  it('第一次建立新產品，第二次認出已記住的產品', async () => {
    const store = await open()
    const bytes = await readSample('DEMO-SILENCER-R18.step')
    const first = await importCadFile(store, 'DEMO-SILENCER-R18.step', bytes, nodeParser)
    expect(first.status).toBe('new')
    expect(first.product.modelCode).toBe('DEMO-SILENCER-R18')
    expect(await store.getMesh(first.product.source.sha256)).toBeDefined()
    expect((await store.getFile(first.product.source.sha256))?.bytes.length).toBe(bytes.length)

    // 檔名不同但內容相同 → 仍是同一個產品
    const again = await importCadFile(store, '另存的檔名.stp', bytes, nodeParser)
    expect(again).toMatchObject({ status: 'existing', product: { id: first.product.id } })
    expect(await store.listProducts()).toHaveLength(1)
  })

  it('不支援的格式', async () => {
    const store = await open()
    await expect(importCadFile(store, 'part.stl', new Uint8Array(4), nodeParser)).rejects.toThrow('不支援的檔案格式')
  })

  it('型號預設取檔名', () => {
    expect(guessModelCode('C:\\cad\\PC6-01.STEP')).toBe('PC6-01')
    expect(guessModelCode('SY3120-5LZD-M5.stp')).toBe('SY3120-5LZD-M5')
  })

  it('刪除產品時一併刪除原始檔與網格', async () => {
    const store = await open()
    const { product } = await importCadFile(store, 'x.step', await readSample('DEMO-SILENCER-R18.step'), nodeParser)
    await store.deleteProduct(product.id)
    expect(await store.listProducts()).toHaveLength(0)
    expect(await store.getFile(product.source.sha256)).toBeUndefined()
    expect(await store.getMesh(product.source.sha256)).toBeUndefined()
  })
})

describe('範例零件庫', () => {
  it('安裝 12 個範例，每個埠的規格都能解析', async () => {
    const store = await withSamples()
    const products = await store.listProducts()
    expect(products).toHaveLength(12)
    const valve = await byModel(store, 'DEMO-VALVE-52-01')
    expect(valve.ports.map((p) => `${p.name}:${formatSpec(p.spec!)}`)).toEqual([
      'A:Rc1/8 母（PT）',
      'B:Rc1/8 母（PT）',
      'EA:Rc1/8 母（PT）',
      'P:Rc1/8 母（PT）',
      'EB:Rc1/8 母（PT）',
    ])
    const manifold = await byModel(store, 'DEMO-MANIFOLD-4')
    expect(manifold.ports.find((p) => p.name === '站1')?.spec).toMatchObject({ kind: 'interface', role: 'socket' })
    expect(manifold.ports.find((p) => p.name === '站1')?.rotation).toBe('fixed')
  })

  it('再次安裝不會覆蓋使用者修改過的埠', async () => {
    const store = await withSamples()
    const silencer = await byModel(store, 'DEMO-SILENCER-R18')
    const edited = { ...silencer, ports: [{ ...silencer.ports[0], name: '我改過的名稱' }] }
    await store.putProduct(edited)
    const r = await installSamples(store, sampleManifest(), readSample, nodeParser)
    expect(r).toEqual({ added: 0, existing: 12 })
    expect((await store.getProduct(silencer.id))?.ports[0].name).toBe('我改過的名稱')
  })
})

describe('產品庫與模組的匯出／匯入', () => {
  it('匯出整個產品庫，匯入到空的產品庫後完全相同', async () => {
    const a = await withSamples()
    const archive = await exportLibraryArchive(a)
    const b = await open()
    const report = await importArchive(b, archive)
    expect(report).toMatchObject({ kind: 'library', productsAdded: 12, productsMerged: 0, conflicts: [] })
    const [pa, pb] = [await a.listProducts(), await b.listProducts()]
    const sort = (list: typeof pa) => [...list].sort((x, y) => x.id.localeCompare(y.id))
    expect(sort(pb)).toEqual(sort(pa))
    const sha = pa[0].source.sha256
    expect((await b.getMesh(sha))?.tessellation.triangleCount).toBe((await a.getMesh(sha))?.tessellation.triangleCount)
    expect((await b.getFile(sha))?.bytes).toEqual((await a.getFile(sha))?.bytes)
  })

  it('重複匯入不會產生重複產品', async () => {
    const a = await withSamples()
    const archive = await exportLibraryArchive(a)
    const b = await open()
    await importArchive(b, archive)
    const again = await importArchive(b, archive)
    expect(again).toMatchObject({ productsAdded: 0, productsMerged: 12, portsAdded: 0, conflicts: [] })
    expect(await b.listProducts()).toHaveLength(12)
  })

  it('本機與匯入檔規格不同時保留本機並列出差異；本機未設定的規格會補上', async () => {
    const a = await withSamples()
    const archive = await exportLibraryArchive(a)
    const b = await open()
    await importArchive(b, archive)

    const bush = await byModel(b, 'DEMO-BUSH-R14-RC18')
    const npt = parseSpec('NPT1/4 公')
    if (!npt.ok) throw new Error()
    const ports = bush.ports.map((p, i) => (i === 0 ? { ...p, spec: npt.spec } : { ...p, spec: undefined }))
    await b.putProduct({ ...bush, ports })

    const report = await importArchive(b, archive)
    expect(report.conflicts).toHaveLength(1)
    expect(report.conflicts[0]).toContain('本機為 NPT1/4 公')
    expect(report.specsFilled).toBe(1)
    const after = await b.getProduct(bush.id)
    expect(formatSpec(after!.ports[0].spec!)).toBe('NPT1/4 公')
    expect(formatSpec(after!.ports[1].spec!)).toBe('Rc1/8 母（PT）')
  })

  it('模組檔包含用到的產品；匯入後引用正確，重複匯入時另存一份', async () => {
    const a = await withSamples()
    const valve = await byModel(a, 'DEMO-VALVE-52-01')
    const fitting = await byModel(a, 'DEMO-FITTING-R18-D6')
    const now = Date.now()
    await a.putModule({
      id: 'mod_1',
      name: '客戶 A 閥組',
      instances: [
        { id: 'i1', productId: valve.id },
        { id: 'i2', productId: fitting.id },
      ],
      mates: [{ id: 'm1', parent: { instance: 'i1', port: valve.ports[0].id }, child: { instance: 'i2', port: fitting.ports[0].id }, angle: 0 }],
      placements: { i1: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
      createdAt: now,
      updatedAt: now,
    })
    const archive = await exportModuleArchive(a, 'mod_1')

    const c = await open()
    const report = await importArchive(c, archive)
    expect(report).toMatchObject({ kind: 'module', productsAdded: 2, moduleId: 'mod_1' })
    const imported = await c.getModule('mod_1')
    expect(imported?.instances.map((i) => i.productId).sort()).toEqual([valve.id, fitting.id].sort())
    expect(imported?.mates[0].parent.port).toBe(valve.ports[0].id)

    const second = await importArchive(c, archive)
    expect(second.moduleId).not.toBe('mod_1')
    expect((await c.getModule(second.moduleId!))?.name).toBe('客戶 A 閥組（匯入）')
    expect(await c.listProducts()).toHaveLength(2)
  })

  it('不是匯出檔時丟出中文錯誤', async () => {
    const b = await open()
    await expect(importArchive(b, new Uint8Array([1, 2, 3]))).rejects.toThrow('檔案格式錯誤')
  })
})
