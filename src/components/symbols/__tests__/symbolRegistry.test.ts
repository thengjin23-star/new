import { describe, expect, it } from 'vitest'
import { registry } from '../../../engine'
import { symbolRegistry } from '../symbolRegistry'
import { rotateSide } from '../types'

describe('外觀註冊表與引擎註冊表一致', () => {
  it('兩邊的元件 type 完全相同', () => {
    expect(Object.keys(symbolRegistry).sort()).toEqual(registry.list().map((d) => d.type).sort())
  })

  it.each(registry.list().map((d) => [d.type, d] as const))('%s：每個埠都有座標，且座標在符號範圍內的邊緣', (type, def) => {
    const symbol = symbolRegistry[type]
    expect(Object.keys(symbol.ports).sort()).toEqual(def.ports.map((p) => p.id).sort())

    for (const g of Object.values(symbol.ports)) {
      expect(g.x).toBeGreaterThanOrEqual(0)
      expect(g.x).toBeLessThanOrEqual(symbol.width)
      expect(g.y).toBeGreaterThanOrEqual(0)
      expect(g.y).toBeLessThanOrEqual(symbol.height)
      const onEdge = { top: g.y === 0, bottom: g.y === symbol.height, left: g.x === 0, right: g.x === symbol.width }
      expect(onEdge[g.side]).toBe(true)
    }
  })
})

describe('rotateSide', () => {
  it('依順時針旋轉出線方向', () => {
    expect(rotateSide('top', 0)).toBe('top')
    expect(rotateSide('top', 90)).toBe('right')
    expect(rotateSide('bottom', 90)).toBe('left')
    expect(rotateSide('left', 180)).toBe('right')
    expect(rotateSide('right', 270)).toBe('top')
  })
})
