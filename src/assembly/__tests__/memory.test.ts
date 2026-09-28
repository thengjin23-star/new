/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { portsFromDefs, type SampleManifest } from '../../catalog/samples'
import type { Product } from '../../catalog/types'
import { exactKey, mateStatKeys, specStatKey, suggestPartners } from '../memory'
import { addInstance, connect, createModule, replaceProduct, type ProductMap } from '../moduleOps'

const manifest: SampleManifest = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../public/samples/manifest.json', import.meta.url)), 'utf8'),
)
const PRODUCTS: ProductMap = Object.fromEntries(
  manifest.parts.map((def): [string, Product] => [
    def.modelCode,
    {
      id: def.modelCode,
      modelCode: def.modelCode,
      name: def.name,
      category: def.category,
      source: { fileName: def.file, sha256: def.modelCode, format: 'step', bytes: 100 },
      ports: portsFromDefs(def.ports),
      createdAt: 0,
      updatedAt: 0,
    },
  ]),
)
const port = (model: string, name: string) => PRODUCTS[model].ports.find((p) => p.name === name)!

describe('搭配記錄', () => {
  it('一次鎖合記下兩個方向，以及兩邊的規格', () => {
    const a = { product: 'V', port: 'pA', spec: port('DEMO-VALVE-52-01', 'A').spec }
    const b = { product: 'F', port: 'p1', spec: port('DEMO-FITTING-R18-D6', '1').spec }
    const keys = mateStatKeys(a, b)
    expect(keys).toHaveLength(4)
    expect(keys).toContain('V:pA>F:p1')
    expect(keys).toContain('F:p1>V:pA')
    expect(keys.filter((k) => k.startsWith('spec:'))).toHaveLength(2)
  })
})

describe('suggestPartners', () => {
  const valve = PRODUCTS['DEMO-VALVE-52-01']
  const from = { product: valve, port: port('DEMO-VALVE-52-01', 'A') }
  const all = Object.values(PRODUCTS)

  it('沒有記錄時，列出規格相容的產品（Rc1/8 母 → R1/8 公）', () => {
    const list = suggestPartners(from, all, {})
    const codes = list.map((s) => s.product.modelCode)
    expect(codes).toContain('DEMO-FITTING-R18-D6')
    expect(codes).toContain('DEMO-SILENCER-R18')
    expect(codes).not.toContain('DEMO-FITTING-NPT18-D6') // NPT 與 PT 不相容
    expect(list.every((s) => s.level === 'ok' || s.level === 'warn')).toBe(true)
  })

  it('用過的搭配排在最前面；同規格的記錄也會加分', () => {
    const fitting = PRODUCTS['DEMO-FITTING-R18-D6']
    const silencer = PRODUCTS['DEMO-SILENCER-R18']
    const stats = {
      [exactKey({ product: valve.id, port: from.port.id }, { product: silencer.id, port: port('DEMO-SILENCER-R18', '1').id })]: 1,
      [specStatKey(from.port.spec!, { product: fitting.id, port: port('DEMO-FITTING-R18-D6', '1').id })]: 5,
    }
    const list = suggestPartners(from, all, stats)
    expect(list[0].product.modelCode).toBe('DEMO-FITTING-R18-D6')
    expect(list[0].score).toBe(15)
    expect(list[1]).toMatchObject({ uses: 1, score: 10 })
    expect(list[1].product.modelCode).toBe('DEMO-SILENCER-R18')
  })

  it('沒有 3D 檔的產品不列入（無法加入模組）', () => {
    const noModel = { ...PRODUCTS['DEMO-SILENCER-R18'], id: 'x', source: { ...PRODUCTS['DEMO-SILENCER-R18'].source, bytes: 0 } }
    expect(suggestPartners(from, [noModel], {})).toEqual([])
  })
})

describe('replaceProduct', () => {
  it('換成埠名相同的產品：鎖合全部保留', () => {
    let doc = createModule()
    const v = addInstance(doc, 'DEMO-VALVE-52-01')
    doc = v.doc
    const f = addInstance(doc, 'DEMO-FITTING-R18-D6')
    doc = f.doc
    const r = connect(doc, PRODUCTS, { instance: v.instanceId, port: port('DEMO-VALVE-52-01', 'A').id }, {
      instance: f.instanceId,
      port: port('DEMO-FITTING-R18-D6', '1').id,
    })
    if ('error' in r) throw new Error(r.error)
    const out = replaceProduct(r.doc, PRODUCTS, f.instanceId, 'DEMO-FITTING-NPT18-D6')
    expect(out.kept).toBe(1)
    expect(out.dropped).toEqual([])
    expect(out.doc.instances.find((i) => i.id === f.instanceId)?.productId).toBe('DEMO-FITTING-NPT18-D6')
    expect(out.doc.mates[0].child.port).toBe(port('DEMO-FITTING-NPT18-D6', '1').id)
  })

  it('新產品沒有對應的埠時拆開鎖合，並列出埠名', () => {
    let doc = createModule()
    const v = addInstance(doc, 'DEMO-VALVE-52-01')
    doc = v.doc
    const s = addInstance(doc, 'DEMO-SILENCER-R18')
    doc = s.doc
    const r = connect(doc, PRODUCTS, { instance: v.instanceId, port: port('DEMO-VALVE-52-01', 'EA').id }, {
      instance: s.instanceId,
      port: port('DEMO-SILENCER-R18', '1').id,
    })
    if ('error' in r) throw new Error(r.error)
    // 氣缸的埠是 M5，和閥的 Rc1/8 不相容，名稱也不同
    const out = replaceProduct(r.doc, PRODUCTS, s.instanceId, 'DEMO-CYL-16-50')
    expect(out.kept).toBe(0)
    expect(out.dropped).toEqual(['1'])
    expect(out.doc.mates).toHaveLength(0)
    expect(out.doc.placements[s.instanceId]).toBeDefined()
  })
})
