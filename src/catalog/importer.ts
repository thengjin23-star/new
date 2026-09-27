import { newId } from '../utils/id'
import { detectCadFormat } from './cad'
import type { CatalogStore } from './db'
import { sha256Hex } from './hash'
import type { Tessellation } from './tessellation'
import type { CadFormat, Product, ProductCategory, ProductPneumatic } from './types'

/** 解析 CAD 檔的函式：瀏覽器中由 Web Worker 執行，測試時直接呼叫 occt-import-js */
export type CadParser = (bytes: Uint8Array, format: CadFormat) => Promise<Tessellation>

export interface ImportOutcome {
  product: Product
  /** new = 新產品；existing = 產品庫已經有同一個檔案（沿用已記住的埠） */
  status: 'new' | 'existing'
}

/** 型號預設取檔名（去掉副檔名） */
export function guessModelCode(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName
  return base.replace(/\.(step|stp|iges|igs)$/i, '').trim() || '未命名'
}

/**
 * 匯入一個 CAD 檔：以 SHA-256 判斷是否已在產品庫。
 * 已存在就直接回傳記住的產品；否則解析、建立新產品，並保存原始檔與網格。
 */
export async function importCadFile(
  store: CatalogStore,
  fileName: string,
  bytes: Uint8Array,
  parse: CadParser,
): Promise<ImportOutcome> {
  const format = detectCadFormat(fileName)
  if (!format) throw new Error(`不支援的檔案格式：${fileName}（請使用 STEP 或 IGES）`)
  const sha256 = sha256Hex(bytes)
  const existing = await store.getProductBySha(sha256)
  if (existing) return { product: existing, status: 'existing' }

  const tessellation = await parse(bytes, format)
  const now = Date.now()
  const product: Product = {
    id: newId('prod'),
    modelCode: guessModelCode(fileName),
    name: '',
    category: 'other',
    source: { fileName, sha256, format, bytes: bytes.length },
    ports: [],
    createdAt: now,
    updatedAt: now,
  }
  try {
    await store.addProductWithData(product, { sha256, fileName, bytes }, { sha256, tessellation })
  } catch (err) {
    // 同一個檔案被同時匯入兩次：唯一索引衝突時改用已寫入的那一筆
    const raced = await store.getProductBySha(sha256)
    if (raced) return { product: raced, status: 'existing' }
    throw err
  }
  return { product, status: 'new' }
}

export interface ModelOnlyInput {
  modelCode: string
  name?: string
  category: ProductCategory
  maker?: string
  price?: number
  pneumatic?: ProductPneumatic
}

/**
 * 建立只有型號、還沒有 3D 檔的產品（例如只放進迴路圖或 BOM 的元件）。
 * source.sha256 用 `none:` 開頭的唯一值佔位，之後可用 attachCadFile 補上 3D 檔。
 */
export async function createModelOnlyProduct(store: CatalogStore, input: ModelOnlyInput): Promise<Product> {
  const now = Date.now()
  const id = newId('prod')
  const product: Product = {
    id,
    modelCode: input.modelCode.trim(),
    name: input.name?.trim() ?? '',
    category: input.category,
    source: { fileName: '', sha256: `none:${id}`, format: 'step', bytes: 0 },
    ports: [],
    ...(input.maker && { maker: input.maker }),
    ...(input.price !== undefined && { price: input.price }),
    ...(input.pneumatic && { pneumatic: input.pneumatic }),
    createdAt: now,
    updatedAt: now,
  }
  await store.putProduct(product)
  return product
}

/**
 * 替只有型號的產品附加 3D 檔。這個檔案若已經是另一個產品，丟出錯誤（避免同一個檔案出現兩次）。
 */
export async function attachCadFile(
  store: CatalogStore,
  product: Product,
  fileName: string,
  bytes: Uint8Array,
  parse: CadParser,
): Promise<Product> {
  const format = detectCadFormat(fileName)
  if (!format) throw new Error(`不支援的檔案格式：${fileName}（請使用 STEP 或 IGES）`)
  const sha256 = sha256Hex(bytes)
  const other = await store.getProductBySha(sha256)
  if (other && other.id !== product.id) throw new Error(`這個 3D 檔已經是產品「${other.modelCode}」`)
  const tessellation = await parse(bytes, format)
  const next: Product = { ...product, source: { fileName, sha256, format, bytes: bytes.length }, updatedAt: Date.now() }
  await store.putFile({ sha256, fileName, bytes })
  await store.putMesh({ sha256, tessellation })
  await store.putProduct(next)
  return next
}
