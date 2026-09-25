import type { Connection, Edge, Node } from '@xyflow/react'
import { portKey, type Circuit } from '../engine'

export type Rotation = 0 | 90 | 180 | 270

export type PneumaticNodeData = {
  /** 元件註冊表中的 type */
  componentType: string
  rotation: Rotation
}

export type PneumaticFlowNode = Node<PneumaticNodeData, 'pneumatic'>
export type TubeFlowEdge = Edge<Record<string, never>, 'tube'>

export function nextRotation(rotation: Rotation): Rotation {
  return ((rotation + 90) % 360) as Rotation
}

/** 把 React Flow 的節點／邊轉成引擎用的拓樸 */
export function toCircuit(nodes: readonly PneumaticFlowNode[], edges: readonly TubeFlowEdge[]): Circuit {
  return {
    nodes: nodes.map((n) => ({ id: n.id, type: n.data.componentType })),
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
