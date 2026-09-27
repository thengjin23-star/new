import { beforeEach, describe, expect, it } from 'vitest'
import { buildCircuitBom, circuitBomToCsv } from '../circuitBom'
import { checkCircuit } from '../circuitChecks'
import { parsePcir, sanitizeCircuit, toPcir, type CircuitDoc } from '../circuitDoc'
import { useCircuitStore } from '../circuitStore'
import { isPneumaticNode, toCircuit, type PneumaticFlowNode } from '../flow'
import { nextTag } from '../tags'
import type { Product } from '../../catalog/types'
import { parseSpec } from '../../threads'

/** 讓 pushHistory 的「同一事件迴圈只記一次」重設 */
const tick = () => new Promise<void>((r) => queueMicrotask(r))

const store = () => useCircuitStore.getState()
const pneumatic = () => store().nodes.filter(isPneumaticNode)

beforeEach(async () => {
  store().replaceCircuit([], [])
  await tick()
})

describe('加入元件與標號', () => {
  it('依類別自動編號：致動器 1A1、2A1；閥 1V1、1V2；氣源 0Z1', async () => {
    store().addComponent('cylinderDouble', { x: 0, y: 0 })
    await tick()
    store().addComponent('cylinderSingle', { x: 0, y: 0 })
    await tick()
    store().addComponent('valve52Single', { x: 0, y: 0 })
    await tick()
    store().addComponent('flowControl', { x: 0, y: 0 })
    await tick()
    store().addComponent('airSupply', { x: 0, y: 0 })
    await tick()
    store().addComponent('silencer', { x: 0, y: 0 })
    expect(pneumatic().map((n) => n.data.tag)).toEqual(['1A1', '2A1', '1V1', '1V2', '0Z1', undefined])
  })

  it('帶入產品與參數，並吸附格點', () => {
    const id = store().addComponent('cylinderDouble', { x: 13, y: 21 }, {
      product: { id: 'p1', modelCode: 'CDJ2B16-50', name: '' },
      params: { bore: 16, stroke: 50 },
    })
    const node = store().nodes.find((n) => n.id === id) as PneumaticFlowNode
    expect(node.position).toEqual({ x: 16, y: 24 })
    expect(node.data.product?.modelCode).toBe('CDJ2B16-50')
    expect(toCircuit(store().nodes, store().edges).nodes[0].params).toEqual({ bore: 16, stroke: 50 })
  })

  it('nextTag 跳過已使用的編號', () => {
    store().addComponent('valve52Single', { x: 0, y: 0 })
    expect(nextTag(store().nodes, 'valve32NC')).toBe('1V2')
    expect(nextTag(store().nodes, 'exhaust')).toBeUndefined()
  })
})

describe('復原／重做', () => {
  it('加入、旋轉可以逐步復原與重做', async () => {
    store().addComponent('valve52Single', { x: 0, y: 0 })
    await tick()
    store().rotateSelected()
    await tick()
    expect(pneumatic()[0].data.rotation).toBe(90)
    store().undo()
    expect(pneumatic()[0].data.rotation).toBe(0)
    store().undo()
    expect(store().nodes).toHaveLength(0)
    store().redo()
    store().redo()
    expect(pneumatic()[0].data.rotation).toBe(90)
  })

  it('連續輸入同一個欄位只記一步', async () => {
    const id = store().addComponent('valve52Single', { x: 0, y: 0 })!
    await tick()
    for (const tag of ['X', 'XY', 'XYZ']) {
      store().updateNode(id, { tag }, 'tag')
      await tick()
    }
    expect(pneumatic()[0].data.tag).toBe('XYZ')
    store().undo()
    expect(pneumatic()[0].data.tag).toBe('1V1')
  })

  it('開新電路會清除復原記錄', async () => {
    store().addComponent('valve52Single', { x: 0, y: 0 })
    await tick()
    store().replaceCircuit([], [])
    expect(store().past).toEqual([])
  })
})

describe('複製、貼上、更換類型', () => {
  it('貼上時產生新 id、位移、保留選取範圍內的管線，標號重新編號', async () => {
    const a = store().addComponent('valve52Single', { x: 0, y: 0 })!
    await tick()
    const b = store().addComponent('cylinderDouble', { x: 0, y: -200 })!
    await tick()
    store().onConnect({ source: a, sourceHandle: 'A', target: b, targetHandle: 'A' })
    await tick()
    store().selectAll()
    store().copySelected()
    store().paste()
    expect(store().nodes).toHaveLength(4)
    expect(store().edges).toHaveLength(2)
    const copies = pneumatic().filter((n) => n.selected)
    expect(copies.map((n) => n.data.tag).sort()).toEqual(['1V2', '2A1'])
    expect(copies.find((n) => n.data.componentType === 'valve52Single')!.position).toEqual({ x: 24, y: 24 })
    const pastedEdge = store().edges[1]
    expect(new Set([pastedEdge.source, pastedEdge.target])).toEqual(new Set(copies.map((n) => n.id)))
  })

  it('更換成埠不同的類型時，只保留仍存在的埠上的管線', async () => {
    const v = store().addComponent('valve52Single', { x: 0, y: 0 })!
    const s = store().addComponent('silencer', { x: 0, y: 100 })!
    const c = store().addComponent('cylinderDouble', { x: 0, y: -200 })!
    await tick()
    store().onConnect({ source: v, sourceHandle: 'EA', target: s, targetHandle: 'E' })
    store().onConnect({ source: v, sourceHandle: 'A', target: c, targetHandle: 'A' })
    await tick()
    store().changeType(v, 'valve32NC')
    expect(store().edges.map((e) => e.sourceHandle)).toEqual(['A'])
  })
})

describe('模擬中即時調整參數', () => {
  it('節流開度改變後立即重新計算排氣能力', () => {
    const f = store().addComponent('flowControl', { x: 0, y: 0 })!
    const e = store().addComponent('exhaust', { x: 0, y: 0 })!
    store().onConnect({ source: f, sourceHandle: '1', target: e, targetHandle: 'E' })
    store().play()
    expect(store().sim.ventFlow[`${f}:2`]).toBeCloseTo(0.5)
    store().setLiveParam(f, 'opening', 20)
    expect(store().sim.ventFlow[`${f}:2`]).toBeCloseTo(0.2)
    store().reset()
  })
})

const product = (id: string, category: Product['category'], ports: Product['ports'], pneumatic?: Product['pneumatic']): Product => ({
  id,
  modelCode: id.toUpperCase(),
  name: '',
  category,
  source: { fileName: 'x.step', sha256: id, format: 'step', bytes: 1 },
  ports,
  pneumatic,
  createdAt: 0,
  updatedAt: 0,
})

const tubePort = (id: string, od: number) => {
  const parsed = parseSpec(`Ø${od} 快插`)
  if (!parsed.ok) throw new Error(parsed.error)
  return { id, name: id, spec: parsed.spec, frame: { origin: [0, 0, 0], axis: [0, 0, 1], ref: [1, 0, 0] }, rotation: 'free' } as Product['ports'][number]
}

describe('檢查清單與 BOM', () => {
  it('列出未接的埠、未接排氣埠、缺少氣源，以及兩端快插管徑不同', async () => {
    const products: Record<string, Product> = {
      sc4: product('sc4', 'speedController', [tubePort('t', 4)], { type: 'flowControl', portMap: { '1': 't' } }),
      sc6: product('sc6', 'speedController', [tubePort('t', 6)], { type: 'flowControl', portMap: { '1': 't' } }),
    }
    const a = store().addComponent('flowControl', { x: 0, y: 0 }, { product: { id: 'sc4', modelCode: 'SC4', name: '' } })!
    const b = store().addComponent('flowControl', { x: 0, y: 0 }, { product: { id: 'sc6', modelCode: 'SC6', name: '' } })!
    store().addComponent('valve52Single', { x: 0, y: 0 })
    await tick()
    store().onConnect({ source: a, sourceHandle: '1', target: b, targetHandle: '1' })
    const checks = checkCircuit(store().nodes, store().edges, products)
    const texts = checks.map((c) => c.text)
    expect(checks[0].level).toBe('error')
    expect(texts[0]).toContain('Ø4')
    expect(texts[0]).toContain('Ø6')
    expect(texts.some((t) => t.includes('沒有氣源'))).toBe(true)
    expect(texts.some((t) => t.includes('排氣埠 EA、EB'))).toBe(true)
  })

  it('BOM：有型號的依產品彙總、沒有型號的依類型，不列氣源與排氣口', () => {
    const ref = { id: 'v1', modelCode: 'SY3120', name: '電磁閥' }
    store().addComponent('valve52Single', { x: 0, y: 0 }, { product: ref })
    store().addComponent('valve52Single', { x: 0, y: 0 }, { product: ref })
    store().addComponent('cylinderDouble', { x: 0, y: 0 })
    store().addComponent('airSupply', { x: 0, y: 0 })
    store().addComponent('exhaust', { x: 0, y: 0 })
    const rows = buildCircuitBom(store().nodes)
    expect(rows.map((r) => [r.modelCode, r.quantity, r.tags.join(' ')])).toEqual([
      ['SY3120', 2, '1V1 1V2'],
      [undefined, 1, '1A1'],
    ])
    const csv = circuitBomToCsv({ name: '測試', customer: '甲公司' }, rows)
    expect(csv.startsWith('﻿迴路：測試\r\n客戶：甲公司\r\n')).toBe(true)
    expect(csv).toContain('1,SY3120,電磁閥,5/2 單電控閥,2,1V1 1V2')
  })
})

describe('電路檔案（.pcir）', () => {
  it('匯出再匯入後內容相同，並給新的 id', async () => {
    store().addComponent('valve52Single', { x: 0, y: 0 })
    store().addNote({ x: 100, y: 100 }, '說明文字')
    const info = store().info
    const doc: CircuitDoc = {
      ...info,
      name: '我的迴路',
      nodes: store().nodes.map(({ id, type, position, data }) => ({ id, type, position, data }) as CircuitDoc['nodes'][number]),
      edges: [],
    }
    const back = parsePcir(toPcir(doc))
    expect(back.id).not.toBe(info.id)
    expect(back.name).toBe('我的迴路')
    expect(back.nodes.map((n) => n.type)).toEqual(['pneumatic', 'note'])
  })

  it('格式錯誤時丟出錯誤', () => {
    expect(() => parsePcir('{}')).toThrow('不是有效的迴路圖')
    expect(() => parsePcir('not json')).toThrow('不是有效的迴路圖')
  })

  it('讀回時丟掉未知的元件與懸空的管線', () => {
    const { nodes, edges } = sanitizeCircuit(
      [
        { id: 'a', type: 'pneumatic', position: { x: 0, y: 0 }, data: { componentType: 'valve52Single', rotation: 45 } },
        { id: 'b', type: 'pneumatic', position: { x: 0, y: 0 }, data: { componentType: 'nope', rotation: 0 } },
      ],
      [
        { id: 't1', source: 'a', sourceHandle: 'A', target: 'b', targetHandle: 'P' },
        { id: 't2', source: 'a', sourceHandle: 'A', target: 'a', targetHandle: 'B' },
      ],
    )
    expect(nodes.map((n) => n.id)).toEqual(['a'])
    expect((nodes[0] as PneumaticFlowNode).data.rotation).toBe(0)
    expect(edges.map((e) => e.id)).toEqual(['t2'])
  })
})

describe('BOM 單價與合計', () => {
  it('產品有單價時加上單價、小計與合計欄；有廠牌時加上廠牌欄', () => {
    const ref = { id: 'v1', modelCode: 'SY3120', name: '電磁閥' }
    store().addComponent('valve52Single', { x: 0, y: 0 }, { product: ref })
    store().addComponent('valve52Single', { x: 0, y: 0 }, { product: ref })
    store().addComponent('cylinderDouble', { x: 0, y: 0 })
    const rows = buildCircuitBom(store().nodes, { v1: { maker: 'SMC', price: 1250 } })
    expect(rows[0]).toMatchObject({ maker: 'SMC', price: 1250, quantity: 2 })
    const csv = circuitBomToCsv({ name: '報價' }, rows)
    expect(csv).toContain('項次,型號,名稱,元件類型,廠牌,數量,標號,單價,小計')
    expect(csv).toContain('1,SY3120,電磁閥,5/2 單電控閥,SMC,2,1V1 1V2,1250,2500')
    expect(csv.trimEnd().endsWith('合計,2500')).toBe(true)
  })

  it('沒有任何單價時不加金額欄', () => {
    store().addComponent('cylinderDouble', { x: 0, y: 0 })
    expect(circuitBomToCsv({ name: 'x' }, buildCircuitBom(store().nodes))).not.toContain('單價')
  })
})
