import { describe, expect, it } from 'vitest'
import { formatSpec, specKey } from '../specs'
import { suggestByDiameter } from '../suggest'
import { spec } from './helpers'

const first = (d: number, shape: 'hole' | 'boss') => suggestByDiameter(d, shape)[0]

describe('依直徑建議規格', () => {
  it('凸柱：比對大徑', () => {
    expect(first(9.73, 'boss').spec).toEqual(spec('R1/8'))
    expect(first(13.2, 'boss').spec).toEqual(spec('R1/4'))
    expect(first(5.0, 'boss').spec).toEqual(spec('M5 公'))
    expect(first(4.83, 'boss').spec).toEqual(spec('10-32UNF 公'))
  })

  it('NPT 與 PT 外徑相近時兩者都列出，PT 排前面', () => {
    const list = suggestByDiameter(13.3, 'boss').map((s) => formatSpec(s.spec))
    expect(list[0]).toBe('R1/4 公（PT）')
    expect(list).toContain('NPT1/4 公')
  })

  it('孔：可比對小徑、攻牙徑或大徑', () => {
    expect(first(8.57, 'hole')).toMatchObject({ spec: spec('Rc1/8'), basis: 'minor' })
    expect(first(11.2, 'hole')).toMatchObject({ spec: spec('Rc1/4'), basis: 'tapDrill' })
    expect(first(4.2, 'hole')).toMatchObject({ spec: spec('M5 母'), basis: 'tapDrill' })
    expect(first(13.16, 'hole')).toMatchObject({ spec: spec('Rc1/4'), basis: 'major' })
  })

  it('Ø6 的孔會建議 Ø6 快插', () => {
    const list = suggestByDiameter(6.0, 'hole').map((s) => formatSpec(s.spec))
    expect(list).toContain('Ø6 快插')
  })

  it('差值由小到大、沒有重複、數量有上限', () => {
    const list = suggestByDiameter(9.7, 'hole', 3)
    expect(list.length).toBeLessThanOrEqual(3)
    expect(new Set(list.map((s) => specKey(s.spec))).size).toBe(list.length)
    for (let i = 1; i < list.length; i++) expect(list[i].delta).toBeGreaterThanOrEqual(list[i - 1].delta - 0.005)
  })

  it('沒有接近的規格時回傳空陣列', () => {
    expect(suggestByDiameter(100, 'boss')).toEqual([])
  })
})
