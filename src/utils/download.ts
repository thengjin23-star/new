/** 讓瀏覽器下載一個檔案 */
export function downloadFile(data: Uint8Array | string, fileName: string, mime: string): void {
  const blob = new Blob([typeof data === 'string' ? data : new Uint8Array(data)], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** 檔名中不允許的字元換成底線 */
export const safeFileName = (name: string): string => name.replace(/[\\/:*?"<>|]+/g, '_').trim() || '未命名'
