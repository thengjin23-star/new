/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { pneumaticFromDef, portsFromDefs, type SampleManifest } from '../../catalog/samples'
import type { Product } from '../../catalog/types'
import { addInstance, connect, createModule, type ProductMap } from '../moduleOps'
import type { ModuleDoc, PortRef } from '../types'

const manifest: SampleManifest = JSON.parse(readFileSync(fileURLToPath(new URL('../../../public/samples/manifest.json', import.meta.url)), 'utf8'))
export const PRODUCTS: ProductMap = Object.fromEntries(
  manifest.parts.map((def): [string, Product] => {
    const ports = portsFromDefs(def.ports)
    return [
      def.modelCode,
      {
        id: def.modelCode,
        modelCode: def.modelCode,
        name: def.name,
        category: def.category,
        source: { fileName: def.file, sha256: def.modelCode, format: 'step', bytes: 1 },
        ports,
        ...(def.pneumatic && { pneumatic: pneumaticFromDef(def.pneumatic, ports) }),
        createdAt: 0,
        updatedAt: 0,
      },
    ]
  }),
)

export const portId = (code: string, name: string) => PRODUCTS[code].ports.find((p) => p.name === name)!.id

/** 小工具：加入零件、以埠名稱鎖合 */
export function builder() {
  let doc: ModuleDoc = createModule('測試')
  const ids: Record<string, string> = {}
  const add = (alias: string, code: string) => {
    const r = addInstance(doc, code)
    doc = r.doc
    ids[alias] = r.instanceId
    return r.instanceId
  }
  const ref = (alias: string, name: string): PortRef => {
    const inst = doc.instances.find((i) => i.id === ids[alias])!
    return { instance: inst.id, port: portId(inst.productId, name) }
  }
  const mate = (a: string, pa: string, b: string, pb: string) => {
    const r = connect(doc, PRODUCTS, ref(a, pa), ref(b, pb))
    if ('error' in r) throw new Error(`${a}.${pa} ↔ ${b}.${pb}：${r.error}`)
    doc = r.doc
  }
  return { add, ref, mate, get doc() { return doc }, set doc(d: ModuleDoc) { doc = d }, ids }
}

/** 閥島：集裝座＋2 顆底板閥＋A1、B1 接頭＋EA、EB 消音器，供氣接在集裝座 P */
export function valveIsland(withSilencers = true) {
  const b = builder()
  b.add('m', 'DEMO-MANIFOLD-4')
  b.add('v1', 'DEMO-VALVE-VB')
  b.add('v2', 'DEMO-VALVE-VB')
  b.mate('m', '站1', 'v1', '安裝面')
  b.mate('m', '站2', 'v2', '安裝面')
  b.add('fa', 'DEMO-FITTING-R18-D6')
  b.add('fb', 'DEMO-FITTING-R18-D6')
  b.mate('m', 'A1', 'fa', '1')
  b.mate('m', 'B1', 'fb', '1')
  if (withSilencers) {
    b.add('sa', 'DEMO-SILENCER-R18')
    b.add('sb', 'DEMO-SILENCER-R18')
    b.mate('m', 'EA', 'sa', '1')
    b.mate('m', 'EB', 'sb', '1')
  }
  b.doc = { ...b.doc, supply: { ...b.ref('m', 'P'), pressure: 0.5 } }
  return b
}

/** 管接式閥 → Ø4 接頭 → PU 管 → 速控閥 → 氣缸；P 接 Ø6 接頭當供氣口、EA／EB 消音器 */
export function valveCylinder() {
  const b = builder()
  b.add('v', 'DEMO-VALVE-52-01')
  b.add('fa', 'DEMO-FITTING-R18-D4')
  b.add('fb', 'DEMO-FITTING-R18-D4')
  b.add('fp', 'DEMO-FITTING-R18-D6')
  b.add('ea', 'DEMO-SILENCER-R18')
  b.add('eb', 'DEMO-SILENCER-R18')
  b.mate('v', 'A', 'fa', '1')
  b.mate('v', 'B', 'fb', '1')
  b.mate('v', 'P', 'fp', '1')
  b.mate('v', 'EA', 'ea', '1')
  b.mate('v', 'EB', 'eb', '1')
  b.add('c', 'DEMO-CYL-16-50')
  b.add('sa', 'DEMO-SC-M5-D4')
  b.add('sb', 'DEMO-SC-M5-D4')
  b.mate('c', 'A', 'sa', '1')
  b.mate('c', 'B', 'sb', '1')
  b.doc = {
    ...b.doc,
    tubes: [
      { id: 't1', a: b.ref('fa', '2'), b: b.ref('sa', '2'), od: 4 },
      { id: 't2', a: b.ref('fb', '2'), b: b.ref('sb', '2'), od: 4 },
    ],
    supply: b.ref('fp', '2'),
  }
  return b
}
