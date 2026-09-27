import type { PortKey } from './types'

/** 有向圖上的一條邊（管線或元件內部通路的一個方向） */
export interface FlowEdge {
  to: PortKey
  /** 通過能力 0–1 */
  capacity: number
  /** 出口壓力上限（MPa）；沒有限制為 Infinity */
  maxPressure: number
}

export type FlowGraph = ReadonlyMap<PortKey, readonly FlowEdge[]>

/** 以陣列實作的二元最大堆積（值越大越先取出） */
class MaxHeap {
  private readonly values: number[] = []
  private readonly keys: PortKey[] = []

  get size(): number {
    return this.values.length
  }

  push(value: number, key: PortKey): void {
    const { values, keys } = this
    let i = values.length
    values.push(value)
    keys.push(key)
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (values[parent] >= value) break
      values[i] = values[parent]
      keys[i] = keys[parent]
      i = parent
    }
    values[i] = value
    keys[i] = key
  }

  pop(): [number, PortKey] {
    const { values, keys } = this
    const top: [number, PortKey] = [values[0], keys[0]]
    const lastValue = values.pop()!
    const lastKey = keys.pop()!
    const n = values.length
    if (n > 0) {
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let largest = i
        let largestValue = lastValue
        if (l < n && values[l] > largestValue) {
          largest = l
          largestValue = values[l]
        }
        if (r < n && values[r] > largestValue) largest = r
        if (largest === i) break
        values[i] = values[largest]
        keys[i] = keys[largest]
        i = largest
      }
      values[i] = lastValue
      keys[i] = lastKey
    }
    return top
  }
}

/**
 * 最寬路徑（瓶頸路徑）：從多個起點出發，求每個節點「沿途邊權重最小值」的最大可能值。
 * 起點的初始值由 starts 給定；到不了的節點不會出現在結果中。
 *
 * 用途：
 * - 供氣／排氣能力：權重 = 節流開度，起點值 = 1
 * - 壓力：權重 = 調壓閥出口壓力上限，起點值 = 氣源壓力
 */
export function widestPaths(
  graph: FlowGraph,
  starts: ReadonlyMap<PortKey, number>,
  weight: (edge: FlowEdge) => number,
): Map<PortKey, number> {
  const best = new Map<PortKey, number>()
  const heap = new MaxHeap()
  for (const [key, value] of starts) {
    if (value > 0 && value > (best.get(key) ?? 0)) {
      best.set(key, value)
      heap.push(value, key)
    }
  }
  while (heap.size > 0) {
    const [value, key] = heap.pop()
    if (value < (best.get(key) ?? 0)) continue // 已有更好的值（過期的項目）
    for (const edge of graph.get(key) ?? []) {
      const next = Math.min(value, weight(edge))
      if (next > (best.get(edge.to) ?? 0)) {
        best.set(edge.to, next)
        heap.push(next, edge.to)
      }
    }
  }
  return best
}
