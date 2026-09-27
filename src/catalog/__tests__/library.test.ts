import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { getCatalog, resetLibraryForTests, useLibraryStore } from '../library'
import type { Product } from '../types'

const product = (id: string, modelCode: string): Product => ({
  id,
  modelCode,
  name: '',
  category: 'fitting',
  source: { fileName: `${modelCode}.step`, sha256: `sha-${id}`, format: 'step', bytes: 1 },
  ports: [],
  createdAt: 1,
  updatedAt: 1,
})

describe('共用產品庫', () => {
  beforeEach(async () => {
    resetLibraryForTests()
    const catalog = await getCatalog()
    for (const p of await catalog.listProducts()) await catalog.deleteProduct(p.id)
  })

  it('load 讀入資料庫中的產品，重複呼叫只讀一次', async () => {
    const catalog = await getCatalog()
    await catalog.putProduct(product('a', 'A-1'))
    const first = useLibraryStore.getState().load()
    expect(useLibraryStore.getState().load()).toBe(first)
    await first
    expect(useLibraryStore.getState().status).toBe('ready')
    expect(Object.keys(useLibraryStore.getState().products)).toEqual(['a'])
  })

  it('saveProduct 寫入資料庫並更新 updatedAt', async () => {
    await useLibraryStore.getState().load()
    const saved = await useLibraryStore.getState().saveProduct(product('b', 'B-1'))
    expect(saved.updatedAt).toBeGreaterThan(1)
    expect(useLibraryStore.getState().products.b.modelCode).toBe('B-1')
    expect((await (await getCatalog()).getProduct('b'))?.updatedAt).toBe(saved.updatedAt)
  })

  it('removeProduct 從資料庫與清單移除', async () => {
    await useLibraryStore.getState().load()
    await useLibraryStore.getState().saveProduct(product('c', 'C-1'))
    await useLibraryStore.getState().removeProduct('c')
    expect(useLibraryStore.getState().products.c).toBeUndefined()
    expect(await (await getCatalog()).getProduct('c')).toBeUndefined()
  })

  it('其他程式直接寫入資料庫後，reload 讀到最新清單', async () => {
    await useLibraryStore.getState().load()
    await (await getCatalog()).putProduct(product('d', 'D-1'))
    await useLibraryStore.getState().reload()
    expect(useLibraryStore.getState().products.d).toBeDefined()
  })
})
