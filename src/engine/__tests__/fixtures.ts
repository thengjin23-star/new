import type { Circuit, Tube } from '../types'

/**
 * 驗收情境電路：
 *   氣源 P ── 閥 P
 *   閥 A ──── 氣缸 A（後端）
 *   閥 B ──── 氣缸 B（前端）
 *   閥 EA ─── 排氣口 ea
 *   閥 EB ─── 排氣口 eb
 */
export function acceptanceCircuit({ withExhausts = true } = {}): Circuit {
  const nodes = [
    { id: 'src', type: 'airSupply' },
    { id: 'v', type: 'valve52Manual' },
    { id: 'c', type: 'cylinderDouble' },
  ]
  const tubes: Tube[] = [
    { id: 'tP', from: 'src:P', to: 'v:P' },
    { id: 'tA', from: 'v:A', to: 'c:A' },
    { id: 'tB', from: 'v:B', to: 'c:B' },
  ]
  if (withExhausts) {
    nodes.push({ id: 'ea', type: 'exhaust' }, { id: 'eb', type: 'exhaust' })
    tubes.push({ id: 'tEA', from: 'v:EA', to: 'ea:E' }, { id: 'tEB', from: 'v:EB', to: 'eb:E' })
  }
  return { nodes, tubes }
}

/** 以固定幀率跑一段時間 */
export const FPS = 60
export const frames = (seconds: number) => Math.round(seconds * FPS)
