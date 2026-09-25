import { newId } from '../utils/id'
import { detectCadFormat } from './cad'
import type { CatalogStore } from './db'
import { sha256Hex } from './hash'
import type { Tessellation } from './tessellation'
import type { CadFormat, Product } from './types'

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
