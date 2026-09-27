import { create } from 'zustand'
import { CatalogStore } from './db'
import type { Product } from './types'

/**
 * 共用的產品庫：「迴路圖」與「模組組立」兩個分頁讀寫同一份資料。
 * 放在主 chunk（不含 three.js／STEP 解析），迴路圖不必載入 3D 分頁就能列出產品。
 */

let catalogPromise: Promise<CatalogStore> | undefined

/** 共用的資料庫連線（第一次呼叫時開啟） */
export function getCatalog(): Promise<CatalogStore> {
  catalogPromise ??= CatalogStore.open(undefined, () =>
    useLibraryStore.setState({
      error: '資料庫需要升級：請關閉其他開著本程式的分頁或視窗（或重新整理它們），這裡會自動繼續。',
    }),
  ).catch((err: unknown) => {
    catalogPromise = undefined
    throw err
  })
  return catalogPromise
}

/** 其他瀏覽器分頁修改產品庫時互相通知 */
const CHANNEL_NAME = 'pneumatic-catalog'
let channel: BroadcastChannel | undefined

function broadcast() {
  try {
    channel?.postMessage({ type: 'products-changed' })
  } catch {
    /* 不支援 BroadcastChannel 的環境：略過 */
  }
}

export interface LibraryState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  error?: string
  products: Record<string, Product>
  /** 產品縮圖：原始檔 sha256 → 圖片網址（object URL） */
  thumbs: Record<string, string>

  /** 第一次載入（重複呼叫只執行一次） */
  load(): Promise<void>
  /** 重新讀取產品清單；notify = 同時通知其他分頁（自己寫入資料庫之後使用） */
  reload(notify?: boolean): Promise<void>
  /** 儲存產品（更新 updatedAt），回傳存入的內容 */
  saveProduct(product: Product): Promise<Product>
  /** 刪除產品及其原始檔與網格 */
  removeProduct(id: string): Promise<void>
  /** 儲存縮圖（PNG）並更新畫面 */
  saveThumb(sha256: string, png: Uint8Array): Promise<void>
}

const thumbUrl = (png: Uint8Array) => URL.createObjectURL(new Blob([new Uint8Array(png)], { type: 'image/png' }))

let loadPromise: Promise<void> | undefined

export const useLibraryStore = create<LibraryState>()((set, get) => ({
  status: 'idle',
  products: {},
  thumbs: {},

  load() {
    loadPromise ??= (async () => {
      set({ status: 'loading' })
      try {
        if (typeof BroadcastChannel !== 'undefined' && !channel) {
          channel = new BroadcastChannel(CHANNEL_NAME)
          channel.onmessage = () => void get().reload()
        }
        // 請瀏覽器不要在空間不足時自動清除產品庫
        void navigator.storage?.persist?.()
        await get().reload()
        set({ status: 'ready', error: undefined })
      } catch (err) {
        loadPromise = undefined
        set({ status: 'error', error: err instanceof Error ? err.message : String(err) })
      }
    })()
    return loadPromise
  },

  async reload(notify = false) {
    const catalog = await getCatalog()
    const [list, thumbs] = await Promise.all([catalog.listProducts(), catalog.listThumbs()])
    // 縮圖：只為新出現的建立網址，已有的沿用（避免圖片閃爍）
    const current = get().thumbs
    const next: Record<string, string> = {}
    for (const t of thumbs) next[t.sha256] = current[t.sha256] ?? thumbUrl(t.png)
    for (const [sha, url] of Object.entries(current)) if (!next[sha]) URL.revokeObjectURL(url)
    set({ products: Object.fromEntries(list.map((p) => [p.id, p])), thumbs: next })
    if (notify) broadcast()
  },

  async saveProduct(product) {
    const catalog = await getCatalog()
    const next = { ...product, updatedAt: Date.now() }
    await catalog.putProduct(next)
    set((s) => ({ products: { ...s.products, [next.id]: next } }))
    broadcast()
    return next
  },

  async saveThumb(sha256, png) {
    const catalog = await getCatalog()
    await catalog.putThumb({ sha256, png })
    const old = get().thumbs[sha256]
    if (old) URL.revokeObjectURL(old)
    set((s) => ({ thumbs: { ...s.thumbs, [sha256]: thumbUrl(png) } }))
    broadcast()
  },

  async removeProduct(id) {
    const catalog = await getCatalog()
    await catalog.deleteProduct(id)
    set((s) => {
      const products = { ...s.products }
      delete products[id]
      return { products }
    })
    broadcast()
  },
}))

/** 測試用：重設共用狀態 */
export function resetLibraryForTests(): void {
  catalogPromise = undefined
  loadPromise = undefined
  channel?.close()
  channel = undefined
  useLibraryStore.setState({ status: 'idle', error: undefined, products: {}, thumbs: {} })
}
