import { useEffect, useMemo } from 'react'

/** 等待釋放的網址：StrictMode 會先執行 effect 的 cleanup 再重跑，重跑時取消釋放 */
const pendingRevoke = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * 把文字內容（例如 SVG）變成 blob 網址給 <img> 使用；內容改變或元件卸載後釋放舊網址。
 */
export function useObjectUrl(content: string | undefined, type: string): string | undefined {
  const url = useMemo(() => (content === undefined ? undefined : URL.createObjectURL(new Blob([content], { type }))), [content, type])
  useEffect(() => {
    if (!url) return
    clearTimeout(pendingRevoke.get(url))
    pendingRevoke.delete(url)
    return () => {
      pendingRevoke.set(
        url,
        setTimeout(() => {
          pendingRevoke.delete(url)
          URL.revokeObjectURL(url)
        }, 0),
      )
    }
  }, [url])
  return url
}
