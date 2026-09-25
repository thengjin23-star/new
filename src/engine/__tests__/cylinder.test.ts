import { describe, expect, it } from 'vitest'
import { cylinderDirection, cylinderDouble, type CylinderState } from '../components/cylinderDouble'
import { CYLINDER_STROKE_SECONDS } from '../constants'
import type { PortState } from '../types'

const update = (piston: number, A: PortState, B: PortState, dt = 0.1) =>
  cylinderDouble.update!({ state: { piston }, dt, ports: { A, B } })

describe('cylinderDirection', () => {
  it.each`
    a             | b             | dir   | why
    ${'pressure'} | ${'exhaust'}  | ${1}  | ${'A 有壓、B 排氣 → 伸出'}
    ${'exhaust'}  | ${'pressure'} | ${-1} | ${'B 有壓、A 排氣 → 縮回'}
    ${'pressure'} | ${'pressure'} | ${0}  | ${'兩端都有壓 → 停止'}
    ${'blocked'}  | ${'blocked'}  | ${0}  | ${'兩端都沒壓 → 停止'}
    ${'exhaust'}  | ${'exhaust'}  | ${0}  | ${'兩端都排氣 → 停止'}
    ${'pressure'} | ${'blocked'}  | ${0}  | ${'B 被封住（空氣關在裡面）→ 停止'}
    ${'blocked'}  | ${'pressure'} | ${0}  | ${'A 被封住 → 停止'}
  `('$why', ({ a, b, dir }) => {
    expect(cylinderDirection(a, b)).toBe(dir)
  })
})

describe('雙動氣缸 update', () => {
  it('以固定速度伸出', () => {
    const next = update(0, 'pressure', 'exhaust', 0.3)
    expect(next.piston).toBeCloseTo(0.3 / CYLINDER_STROKE_SECONDS)
  })

  it('以固定速度縮回', () => {
    const next = update(1, 'exhaust', 'pressure', 0.3)
    expect(next.piston).toBeCloseTo(1 - 0.3 / CYLINDER_STROKE_SECONDS)
  })

  it('伸出到底後停在 1', () => {
    expect(update(0.99, 'pressure', 'exhaust', 1).piston).toBe(1)
  })

  it('縮回到底後停在 0', () => {
    expect(update(0.01, 'exhaust', 'pressure', 1).piston).toBe(0)
  })

  it('停止時回傳同一個狀態物件（讓畫面可略過重繪）', () => {
    const state: CylinderState = { piston: 0.5 }
    expect(cylinderDouble.update!({ state, dt: 0.1, ports: { A: 'pressure', B: 'pressure' } })).toBe(state)
  })

  it('已在行程端點時也回傳同一個狀態物件', () => {
    const state: CylinderState = { piston: 1 }
    expect(cylinderDouble.update!({ state, dt: 0.1, ports: { A: 'pressure', B: 'exhaust' } })).toBe(state)
  })

  it('初始狀態為完全縮回', () => {
    expect(cylinderDouble.createState()).toEqual({ piston: 0 })
  })
})
