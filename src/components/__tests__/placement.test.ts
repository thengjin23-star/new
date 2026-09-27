import { describe, expect, it } from 'vitest'
import type { CircuitFlowNode } from '../../store/flow'
import { findFreeSpot } from '../placement'

const node = (x: number, y: number, w = 100, h = 100): CircuitFlowNode => ({
  id: `n${x}_${y}`,
  type: 'note',
  position: { x, y },
  data: { text: '' },
  measured: { width: w, height: h },
})

describe('findFreeSpot', () => {
  it('沒有重疊時直接用指定位置', () => {
    expect(findFreeSpot({ x: 500, y: 500 }, { width: 50, height: 50 }, [node(0, 0)])).toEqual({ x: 500, y: 500 })
  })

  it('會重疊時找附近的空位，且不與既有元件重疊', () => {
    const nodes = [node(0, 0)]
    const spot = findFreeSpot({ x: 10, y: 10 }, { width: 80, height: 80 }, nodes)
    const overlap = spot.x < 100 + 24 && spot.x + 80 + 24 > 0 && spot.y < 100 + 24 && spot.y + 80 + 24 > 0
    expect(overlap).toBe(false)
    expect(Math.hypot(spot.x - 10, spot.y - 10)).toBeLessThan(250)
  })
})
