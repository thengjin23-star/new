/** 不依賴 crypto.randomUUID（它只在 https／localhost 可用，用區網 IP 開手機測試時會失效） */
export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}
