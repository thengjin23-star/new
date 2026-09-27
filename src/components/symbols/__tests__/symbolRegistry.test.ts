import { describe, expect, it } from 'vitest'
import { registry } from '../../../engine'
import { symbolRegistry } from '../symbolRegistry'
import { flipSide, rotateSide } from '../types'

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

describe('通用閥符號', () => {
  it('5/2 手動閥的尺寸與埠座標與第一版相同（既有電路的管線位置不變）', () => {
    const symbol = symbolRegistry.valve52Manual
    expect(symbol.width).toBe(238)
    expect(symbol.height).toBe(104)
    expect(symbol.ports).toEqual({
      A: { x: 106, y: 0, side: 'top' },
      B: { x: 138, y: 0, side: 'top' },
      EA: { x: 106, y: 104, side: 'bottom' },
      P: { x: 122, y: 104, side: 'bottom' },
      EB: { x: 138, y: 104, side: 'bottom' },
    })
  })

  it('5/3 閥的外部埠畫在中位方格上', () => {
    const symbol = symbolRegistry.valve53Closed
    // 左側：彈簧 20 + 電磁 24；中位方格 = 第 2 格
    expect(symbol.ports.P.x).toBe(4 + 44 + 2 * 64 + 32)
  })
})

describe('flipSide', () => {
  it('鏡射只交換左右', () => {
    expect(flipSide('left', true)).toBe('right')
    expect(flipSide('top', true)).toBe('top')
    expect(flipSide('left', false)).toBe('left')
  })
})
