import { Matrix4 } from 'three'
import { describe, expect, it } from 'vitest'
import type { ModuleDoc } from '../../assembly/types'
import type { Tessellation } from '../../catalog/tessellation'
import type { Product } from '../../catalog/types'
import { formatMm, moduleBounds } from '../bounds'

const cube = (size: number): Tessellation => {
  const s = size / 2
  const positions = new Float32Array([-s, -s, -s, s, s, s, -s, s, -s, s, -s, s])
  return {
    parts: [{ name: 'c', color: null, positions, normals: new Float32Array(12), indices: new Uint32Array([0, 1, 2]), faceRanges: new Uint32Array([0, 0]) }],
    bbox: { min: [-s, -s, -s], max: [s, s, s] },
    triangleCount: 1,
  }
}

describe('moduleBounds', () => {
  it('依每個零件的世界矩陣轉換頂點後取範圍', () => {
    const product = { id: 'p', source: { sha256: 'sha' } } as unknown as Product
    const doc = {
      instances: [
        { id: 'a', productId: 'p' },
        { id: 'b', productId: 'p' },
      ],
    } as unknown as ModuleDoc
    const transforms = {
      a: new Matrix4().toArray(),
      b: new Matrix4().makeTranslation(100, 0, 30).toArray(),
    }
    const b = moduleBounds(doc, { p: product }, { sha: cube(10) }, transforms)
    expect(b).toEqual({ min: [-5, -5, -5], max: [105, 5, 35] })
  })

  it('沒有網格時回傳 undefined', () => {
    expect(moduleBounds({ instances: [] } as unknown as ModuleDoc, {}, {}, {})).toBeUndefined()
  })

  it('formatMm 保留一位小數、整數不顯示 .0', () => {
    expect(formatMm(12)).toBe('12')
    expect(formatMm(12.345)).toBe('12.3')
  })
})
