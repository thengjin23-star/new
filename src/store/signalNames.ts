import { collectSignalNames, withSignalNames, type NamedNode, type Params } from '../engine'
import { isPneumaticNode, type CircuitFlowNode } from './flow'

/**
 * 自動指定訊號名稱：新加入（或貼上）的元件，電磁線圈接下一個沒用過的輸出（Y1、Y2…）、
 * 氣缸給下一個代號（A、B…，感測器 a0／a1）、壓力開關給下一個 PS 編號。
 * 已經指定且沒有和別的元件重複的名稱保持不變。
 */
const namedNodes = (nodes: readonly CircuitFlowNode[]): NamedNode[] =>
  nodes.flatMap((n) => (isPneumaticNode(n) ? [{ id: n.id, type: n.data.componentType, params: n.data.params }] : []))

/** 回傳加上（或修正）訊號名稱後的參數；沒有訊號參數的元件原樣回傳 */
export function assignSignalNames(
  nodes: readonly CircuitFlowNode[],
  type: string,
  params: Params | undefined,
  except?: ReadonlySet<string>,
): Params | undefined {
  return withSignalNames(type, params, collectSignalNames(namedNodes(nodes), undefined, except))
}
