import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { ModuleDoc } from '../assembly/types'
import type { CircuitDoc } from '../store/circuitDoc'
import type { Tessellation } from './tessellation'
import type { Product } from './types'

export interface StoredFile {
  sha256: string
  fileName: string
  bytes: Uint8Array
}

export interface StoredMesh {
  sha256: string
  tessellation: Tessellation
}

/** 產品縮圖（PNG），以原始檔 sha256 為 key */
export interface StoredThumb {
  sha256: string
  png: Uint8Array
}

/** 設定（key-value） */
export interface StoredSetting {
  key: string
  value: unknown
}

/**
 * 搭配記錄：「A 產品的某個埠」接過「B 產品的某個埠」幾次。
 * key 為 `${productA}:${portA}>${productB}:${portB}`（兩個方向各存一筆）；
 * 另以 `spec:${規格}>${productB}:${portB}` 記錄「這種規格的埠常接哪個產品」，換產品時也能參考。
 */
export interface StoredStat {
  key: string
  count: number
  lastUsed: number
}

interface CatalogSchema extends DBSchema {
  products: { key: string; value: Product; indexes: { 'by-sha': string } }
  /** 原始 STEP／IGES 檔（M2 產生圖面與 STEP 組立檔時需要） */
  files: { key: string; value: StoredFile }
  /** 三角化結果快取，避免每次開啟都重新解析 */
  meshes: { key: string; value: StoredMesh }
  modules: { key: string; value: ModuleDoc }
  /** 迴路圖（v2） */
  circuits: { key: string; value: CircuitDoc }
  /** 產品縮圖（v3） */
  thumbs: { key: string; value: StoredThumb }
  /** 設定（v3） */
  settings: { key: string; value: StoredSetting }
  /** 搭配記錄（v3） */
  stats: { key: string; value: StoredStat }
}

export const CATALOG_DB = 'pneumatic-catalog'
const DB_VERSION = 3

/** 產品庫與模組的本機儲存（IndexedDB） */
export class CatalogStore {
  private readonly db: IDBPDatabase<CatalogSchema>

  private constructor(db: IDBPDatabase<CatalogSchema>) {
    this.db = db
  }

  /**
   * @param onBlocked 升級資料庫時，其他分頁（舊版程式）仍開著資料庫：提醒使用者關閉它們
   */
  static async open(name = CATALOG_DB, onBlocked?: () => void): Promise<CatalogStore> {
    let opened: IDBPDatabase<CatalogSchema> | undefined
    const db = await openDB<CatalogSchema>(name, DB_VERSION, {
      // 依版本逐步升級：舊資料原封不動，只補上新的 object store
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const products = db.createObjectStore('products', { keyPath: 'id' })
          products.createIndex('by-sha', 'source.sha256', { unique: true })
          db.createObjectStore('files', { keyPath: 'sha256' })
          db.createObjectStore('meshes', { keyPath: 'sha256' })
          db.createObjectStore('modules', { keyPath: 'id' })
        }
        if (oldVersion < 2) db.createObjectStore('circuits', { keyPath: 'id' })
        if (oldVersion < 3) {
          db.createObjectStore('thumbs', { keyPath: 'sha256' })
          db.createObjectStore('settings', { keyPath: 'key' })
          db.createObjectStore('stats', { keyPath: 'key' })
        }
      },
      // 另一個分頁要升級資料庫時，先關閉這裡的連線，避免對方卡住
      blocking() {
        opened?.close()
      },
      blocked() {
        onBlocked?.()
      },
    })
    opened = db
    return new CatalogStore(db)
  }

  close(): void {
    this.db.close()
  }

  // ---- 產品 ----
  listProducts(): Promise<Product[]> {
    return this.db.getAll('products')
  }
  getProduct(id: string): Promise<Product | undefined> {
    return this.db.get('products', id)
  }
  getProductBySha(sha256: string): Promise<Product | undefined> {
    return this.db.getFromIndex('products', 'by-sha', sha256)
  }
  async putProduct(product: Product): Promise<void> {
    await this.db.put('products', product)
  }

  /** 在同一個交易中寫入產品、原始檔與網格 */
  async addProductWithData(product: Product, file?: StoredFile, mesh?: StoredMesh): Promise<void> {
    const tx = this.db.transaction(['products', 'files', 'meshes'], 'readwrite')
    await Promise.all([
      tx.objectStore('products').add(product),
      file && tx.objectStore('files').put(file),
      mesh && tx.objectStore('meshes').put(mesh),
      tx.done,
    ])
  }

  /** 刪除產品及其原始檔與網格 */
  async deleteProduct(id: string): Promise<void> {
    const product = await this.getProduct(id)
    if (!product) return
    const tx = this.db.transaction(['products', 'files', 'meshes', 'thumbs'], 'readwrite')
    await Promise.all([
      tx.objectStore('products').delete(id),
      tx.objectStore('files').delete(product.source.sha256),
      tx.objectStore('meshes').delete(product.source.sha256),
      tx.objectStore('thumbs').delete(product.source.sha256),
      tx.done,
    ])
  }

  // ---- 原始檔與網格 ----
  getFile(sha256: string): Promise<StoredFile | undefined> {
    return this.db.get('files', sha256)
  }
  async putFile(file: StoredFile): Promise<void> {
    await this.db.put('files', file)
  }
  getMesh(sha256: string): Promise<StoredMesh | undefined> {
    return this.db.get('meshes', sha256)
  }
  async putMesh(mesh: StoredMesh): Promise<void> {
    await this.db.put('meshes', mesh)
  }

  // ---- 模組 ----
  listModules(): Promise<ModuleDoc[]> {
    return this.db.getAll('modules')
  }
  getModule(id: string): Promise<ModuleDoc | undefined> {
    return this.db.get('modules', id)
  }
  async putModule(module: ModuleDoc): Promise<void> {
    await this.db.put('modules', module)
  }
  async deleteModule(id: string): Promise<void> {
    await this.db.delete('modules', id)
  }

  // ---- 迴路圖 ----
  listCircuits(): Promise<CircuitDoc[]> {
    return this.db.getAll('circuits')
  }
  getCircuit(id: string): Promise<CircuitDoc | undefined> {
    return this.db.get('circuits', id)
  }
  async putCircuit(circuit: CircuitDoc): Promise<void> {
    await this.db.put('circuits', circuit)
  }
  async deleteCircuit(id: string): Promise<void> {
    await this.db.delete('circuits', id)
  }

  // ---- 縮圖 ----
  getThumb(sha256: string): Promise<StoredThumb | undefined> {
    return this.db.get('thumbs', sha256)
  }
  listThumbs(): Promise<StoredThumb[]> {
    return this.db.getAll('thumbs')
  }
  async putThumb(thumb: StoredThumb): Promise<void> {
    await this.db.put('thumbs', thumb)
  }

  // ---- 設定 ----
  async getSetting<T>(key: string): Promise<T | undefined> {
    return (await this.db.get('settings', key))?.value as T | undefined
  }
  async putSetting(key: string, value: unknown): Promise<void> {
    await this.db.put('settings', { key, value })
  }

  // ---- 搭配記錄 ----
  listStats(): Promise<StoredStat[]> {
    return this.db.getAll('stats')
  }
  /** 把多筆記錄的次數各加一（同一個交易） */
  async bumpStats(keys: readonly string[], at = Date.now()): Promise<StoredStat[]> {
    const tx = this.db.transaction('stats', 'readwrite')
    const result: StoredStat[] = []
    for (const key of keys) {
      const prev = await tx.store.get(key)
      const next = { key, count: (prev?.count ?? 0) + 1, lastUsed: at }
      await tx.store.put(next)
      result.push(next)
    }
    await tx.done
    return result
  }
  async putStats(stats: readonly StoredStat[]): Promise<void> {
    const tx = this.db.transaction('stats', 'readwrite')
    await Promise.all([...stats.map((s) => tx.store.put(s)), tx.done])
  }

  /** 使用到某個產品的模組（刪除產品前提醒用） */
  async modulesUsingProduct(productId: string): Promise<ModuleDoc[]> {
    return (await this.listModules()).filter((m) => m.instances.some((i) => i.productId === productId))
  }
}
