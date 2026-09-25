import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'

/** 檔案內容的 SHA-256（不用 crypto.subtle：它只在 https／localhost 可用） */
export function sha256Hex(bytes: Uint8Array): string {
  return bytesToHex(sha256(bytes))
}
