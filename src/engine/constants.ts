/** 雙動氣缸走完一次全行程所需秒數 */
export const CYLINDER_STROKE_SECONDS = 1.2

/**
 * 單一幀允許的最大時間步長（秒）。
 * 分頁切到背景再回來時 requestAnimationFrame 的間隔可能長達數秒，夾住它可避免活塞瞬移。
 */
export const MAX_FRAME_SECONDS = 0.05
