/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { portsFromDefs, type SampleManifest } from '../../catalog/samples'
import type { Product } from '../../catalog/types'
import { bomToCsv, buildBom } from '../bom'
import { addInstance, addTube, connect, createModule, removeInstance, replaceProduct, setSupply, updateTube, usedPorts, type ProductMap } from '../moduleOps'
import { bezierLength, estimateTubeLength, formatMeters, tubeBom, tubeCheck, tubeControlPoints, tubeMesh } from '../tubes'
import type { ModuleDoc, PortRef } from '../types'

const manifest: SampleManifest = JSON.parse(readFileSync(fileURLToPath(new URL('../../../public/samples/manifest.json', import.meta.url)), 'utf8'))
const PRODUCTS: ProductMap = Object.fromEntries(
  manifest.parts.map((def): [string, Product] => [
    def.modelCode,
    {
      id: def.modelCode,
      modelCode: def.modelCode,
      name: def.name,
      category: def.category,
      source: { fileName: def.file, sha256: def.modelCode, format: 'step', bytes: 1 },
      ports: portsFromDefs(def.ports),
      createdAt: 0,
      updatedAt: 0,
    },
  ]),
)
const port = (code: string, name: string) => PRODUCTS[code].ports.find((p) => p.name === name)!

function twoFittings() {
  let doc: ModuleDoc = createModule('管')
  const a = addInstance(doc, 'DEMO-FITTING-R18-D6')
  doc = a.doc
  const b = addInstance(doc, 'DEMO-FITTING-R18-D6')
  doc = b.doc
  const c = addInstance(doc, 'DEMO-SC-M5-D4')
  doc = c.doc
  const ref = (instance: string, code: string, name: string): PortRef => ({ instance, port: port(code, name).id })
  return { doc, a: a.instanceId, b: b.instanceId, c: c.instanceId, ref }
}

describe('tubeCheck', () => {
  it('兩端都是同管徑的快插插座才能接', () => {
    expect(tubeCheck(port('DEMO-FITTING-R18-D6', '2'), port('DEMO-FITTING-R18-D6', '2'))).toEqual({ ok: true, od: 6, label: 'Ø6' })
    expect(tubeCheck(port('DEMO-FITTING-R18-D6', '2'), port('DEMO-SC-M5-D4', '2'))).toEqual({ ok: false, error: 'od-mismatch' })
    expect(tubeCheck(port('DEMO-FITTING-R18-D6', '1'), port('DEMO-FITTING-R18-D6', '2'))).toEqual({ ok: false, error: 'not-socket' })
  })
})

describe('addTube / removeInstance / replaceProduct', () => {
  it('接管後兩端算已使用；不能再鎖合；刪除零件時一起移除管子與供氣口', () => {
    const t = twoFittings()
    const r = addTube(t.doc, PRODUCTS, t.ref(t.a, 'DEMO-FITTING-R18-D6', '2'), t.ref(t.b, 'DEMO-FITTING-R18-D6', '2'), 250)
    if ('error' in r) throw new Error(r.error)
    expect(r.doc.tubes).toEqual([expect.objectContaining({ od: 6, label: 'Ø6', length: 250 })])
    expect(usedPorts(r.doc).has(`${t.a}:${port('DEMO-FITTING-R18-D6', '2').id}`)).toBe(true)
    // 已接管的埠不能再接
    expect(addTube(r.doc, PRODUCTS, t.ref(t.a, 'DEMO-FITTING-R18-D6', '2'), t.ref(t.b, 'DEMO-FITTING-R18-D6', '2'))).toEqual({ error: 'port-in-use' })
    // 管徑不同
    expect(addTube(t.doc, PRODUCTS, t.ref(t.a, 'DEMO-FITTING-R18-D6', '2'), t.ref(t.c, 'DEMO-SC-M5-D4', '2'))).toEqual({ error: 'od-mismatch' })
    const withSupply = setSupply(r.doc, t.ref(t.a, 'DEMO-FITTING-R18-D6', '1'))
    const removed = removeInstance(withSupply, PRODUCTS, t.a)
    expect(removed.tubes).toEqual([])
    expect(removed.supply).toBeUndefined()
    expect(updateTube(r.doc, r.tubeId, { length: 300 }).tubes![0].length).toBe(300)
  })

  it('更換零件：管子依埠名稱接到新產品；找不到對應的埠就拿掉', () => {
    const t = twoFittings()
    const r = addTube(t.doc, PRODUCTS, t.ref(t.a, 'DEMO-FITTING-R18-D6', '2'), t.ref(t.b, 'DEMO-FITTING-R18-D6', '2'))
    if ('error' in r) throw new Error(r.error)
    const same = replaceProduct(r.doc, PRODUCTS, t.a, 'DEMO-FITTING-NPT18-D6')
    expect(same.doc.tubes).toHaveLength(1)
    expect(same.doc.tubes![0].a.port).toBe(port('DEMO-FITTING-NPT18-D6', '2').id)
    const gone = replaceProduct(r.doc, PRODUCTS, t.a, 'DEMO-SILENCER-R18')
    expect(gone.doc.tubes).toEqual([])
    expect(gone.dropped).toContain('PU 管 Ø6')
  })

  it('鎖合時已接管的埠算「使用中」', () => {
    const t = twoFittings()
    const r = addTube(t.doc, PRODUCTS, t.ref(t.a, 'DEMO-FITTING-R18-D6', '2'), t.ref(t.b, 'DEMO-FITTING-R18-D6', '2'))
    if ('error' in r) throw new Error(r.error)
    const v = addInstance(r.doc, 'DEMO-SC-M5-D4')
    expect(connect(v.doc, PRODUCTS, t.ref(t.a, 'DEMO-FITTING-R18-D6', '2'), { instance: v.instanceId, port: port('DEMO-SC-M5-D4', '2').id })).toEqual({ error: 'port-in-use' })
  })
})

describe('長度、BOM、網格', () => {
  it('曲線長度與建議長度（加插入長度、進位到 10 mm）', () => {
    const pts = tubeControlPoints({ origin: [0, 0, 0], axis: [0, 0, 1] }, { origin: [100, 0, 0], axis: [0, 0, 1] })
    const len = bezierLength(pts)
    expect(len).toBeGreaterThan(100)
    expect(estimateTubeLength(len, 6) % 10).toBe(0)
    expect(estimateTubeLength(len, 6)).toBeGreaterThanOrEqual(len + 24)
  })

  it('依管徑合計總長；CSV 列出 PU 管', () => {
    const t = twoFittings()
    let doc = t.doc
    const add = (x: string, y: string, length: number) => {
      const r = addTube(doc, PRODUCTS, t.ref(x, 'DEMO-FITTING-R18-D6', '2'), t.ref(y, 'DEMO-FITTING-R18-D6', '2'), length)
      if ('error' in r) throw new Error(r.error)
      doc = r.doc
    }
    add(t.a, t.b, 250)
    const d = addInstance(doc, 'DEMO-FITTING-R18-D6')
    const e = addInstance(d.doc, 'DEMO-FITTING-R18-D6')
    doc = e.doc
    add(d.instanceId, e.instanceId, 1000)
    expect(tubeBom(doc)).toEqual([{ label: 'Ø6', od: 6, count: 2, length: 1250 }])
    expect(formatMeters(1250)).toBe('1.25 m')
    const csv = bomToCsv(doc, buildBom(doc, PRODUCTS))
    expect(csv).toContain('PU 管 Ø6')
    expect(csv).toContain('1.25 m')
  })

  it('tubeMesh：頂點數與三角形數', () => {
    const pts = tubeControlPoints({ origin: [0, 0, 0], axis: [1, 0, 0] }, { origin: [0, 50, 0], axis: [-1, 0, 0] })
    const m = tubeMesh(pts, 3, 10, 8)
    expect(m.positions.length / 3).toBe(11 * 8)
    expect(m.indices.length / 3).toBe(10 * 8 * 2)
    // 每個頂點到曲線中心的距離都是半徑（取起點圓環）
    for (let k = 0; k < 8; k++) expect(Math.hypot(m.positions[k * 3], m.positions[k * 3 + 1], m.positions[k * 3 + 2])).toBeCloseTo(3, 5)
  })
})
