/** 從元件面板拖拉時使用的 dataTransfer 類型 */
export const COMPONENT_DRAG_MIME = 'application/x-pneumatic-component'

/** 拖拉時傳遞的資料（JSON）：元件 type，以及來自產品庫時的產品 id */
export interface ComponentDragPayload {
  type: string
  productId?: string
}

/** 解析拖拉資料；也接受舊版只放 type 字串的格式 */
export function parseDragPayload(raw: string): ComponentDragPayload | undefined {
  if (!raw) return undefined
  try {
    const data = JSON.parse(raw) as Partial<ComponentDragPayload>
    return typeof data.type === 'string' ? { type: data.type, productId: data.productId } : undefined
  } catch {
    return { type: raw }
  }
}

/** 縮放到能看到整個電路 */
export const FIT_VIEW_OPTIONS = { padding: 0.2, maxZoom: 1.25, duration: 300 }
