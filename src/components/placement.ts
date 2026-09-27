import type { XYPosition } from '@xyflow/react'
import { isPneumaticNode, type CircuitFlowNode } from '../store/flow'
import { getSymbol } from './symbols/symbolRegistry'

interface Box {
  x: number
  y: number
  w: number
  h: number
}

function boxOf(n: CircuitFlowNode): Box {
  const size = n.measured?.width
    ? { w: n.measured.width, h: n.measured.height ?? 0 }
    : isPneumaticNode(n)
      ? { w: getSymbol(n.data.componentType).width, h: getSymbol(n.data.componentType).height }
      : { w: 120, h: 40 }
  return { x: n.position.x, y: n.position.y, ...size }
}

const overlaps = (a: Box, b: Box, margin: number) =>
  a.x < b.x + b.w + margin && b.x < a.x + a.w + margin && a.y < b.y + b.h + margin && b.y < a.y + a.h + margin

/**
 * 在 preferred（左上角）附近找一個不會蓋到既有元件的位置：
 * 以同心方環由近到遠搜尋，找不到就退回 preferred。
 */
export function findFreeSpot(
  preferred: XYPosition,
  size: { width: number; height: number },
  nodes: readonly CircuitFlowNode[],
  step = 32,
  margin = 24,
): XYPosition {
  const boxes = nodes.map(boxOf)
  const fits = (p: XYPosition) => !boxes.some((b) => overlaps({ x: p.x, y: p.y, w: size.width, h: size.height }, b, margin))
  if (fits(preferred)) return preferred
  for (let ring = 1; ring <= 24; ring++) {
    const candidates: XYPosition[] = []
    for (let i = -ring; i <= ring; i++) {
      candidates.push(
        { x: preferred.x + i * step, y: preferred.y - ring * step },
        { x: preferred.x + i * step, y: preferred.y + ring * step },
        { x: preferred.x - ring * step, y: preferred.y + i * step },
        { x: preferred.x + ring * step, y: preferred.y + i * step },
      )
    }
    // 同一環中優先選離中心近的位置
    candidates.sort((a, b) => Math.hypot(a.x - preferred.x, a.y - preferred.y) - Math.hypot(b.x - preferred.x, b.y - preferred.y))
    const hit = candidates.find(fits)
    if (hit) return hit
  }
  return preferred
}
