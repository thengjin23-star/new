import type { Connection, Edge, Node } from '@xyflow/react'
import { portKey, type Circuit, type Params } from '../engine'

export type Rotation = 0 | 90 | 180 | 270

/** 迴路圖元件對應的產品（快照：產品從產品庫刪除後仍能顯示型號） */
export interface ProductRef {
  id: string
  modelCode: string
  name: string
}

export type PneumaticNodeData = {
  /** 元件註冊表中的 type */
  componentType: string
  rotation: Rotation
  /** 水平鏡射 */
  flip?: boolean
  /** 元件標號，例如 1V1、1A1 */
  tag?: string
  /** 指定的產品 */
  product?: ProductRef
  /** 元件參數（加入產品時帶入產品的參數，之後可在屬性面板修改） */
  params?: Params
  /** 備註 */
  note?: string
}

export type NoteNodeData = {
  /** 註解文字（可多行） */
  text: string
}

export type PneumaticFlowNode = Node<PneumaticNodeData, 'pneumatic'>
export type NoteFlowNode = Node<NoteNodeData, 'note'>
/** 畫布上的節點：氣動元件或文字註解 */
export type CircuitFlowNode = PneumaticFlowNode | NoteFlowNode
export type TubeFlowEdge = Edge<Record<string, never>, 'tube'>

export const isPneumaticNode = (n: CircuitFlowNode): n is PneumaticFlowNode => n.type === 'pneumatic'

export function nextRotation(rotation: Rotation): Rotation {
  return ((rotation + 90) % 360) as Rotation
}

/** 把 React Flow 的節點／邊轉成引擎用的拓樸（文字註解不參與模擬） */
export function toCircuit(nodes: readonly CircuitFlowNode[], edges: readonly TubeFlowEdge[]): Circuit {
  return {
    nodes: nodes.filter(isPneumaticNode).map((n) => ({ id: n.id, type: n.data.componentType, params: n.data.params })),
    tubes: edges.map((e) => ({
      id: e.id,
      from: portKey(e.source, e.sourceHandle ?? ''),
      to: portKey(e.target, e.targetHandle ?? ''),
    })),
  }
}

/** 管線是否可建立：不可接到同一個元件自己的埠，也不可與既有管線重複 */
export function isValidTube(connection: Connection | Edge, edges: readonly TubeFlowEdge[]): boolean {
  const { source, target, sourceHandle, targetHandle } = connection
  if (!sourceHandle || !targetHandle || source === target) return false
  const a = portKey(source, sourceHandle)
  const b = portKey(target, targetHandle)
  return !edges.some((e) => {
    const x = portKey(e.source, e.sourceHandle ?? '')
    const y = portKey(e.target, e.targetHandle ?? '')
    return (x === a && y === b) || (x === b && y === a)
  })
}

export { newId } from '../utils/id'
