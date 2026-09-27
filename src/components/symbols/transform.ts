import type { Rotation } from '../../store/flow'

/**
 * 讓文字在節點旋轉、鏡射後仍保持正立可讀的 transform。
 * 節點外層依序套用「鏡射 → 旋轉」，這裡以錨點為中心反向抵銷。
 */
export function uprightTransform(x: number, y: number, rotation: Rotation, flip?: boolean): string | undefined {
  if (!rotation && !flip) return undefined
  const parts = [`translate(${x} ${y})`]
  if (flip) parts.push('scale(-1 1)')
  if (rotation) parts.push(`rotate(${-rotation})`)
  parts.push(`translate(${-x} ${-y})`)
  return parts.join(' ')
}
