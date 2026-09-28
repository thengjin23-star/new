import { registry } from '../engine'
import { newId } from '../utils/id'
import { isPneumaticNode, type CircuitFlowNode, type TubeFlowEdge } from './flow'

/** 存檔時只保留的節點欄位（不含選取、量測等畫面狀態） */
export type StoredNode = Pick<CircuitFlowNode, 'id' | 'type' | 'position' | 'data'>
export type StoredEdge = Pick<TubeFlowEdge, 'id' | 'type' | 'source' | 'sourceHandle' | 'target' | 'targetHandle'>

export interface CircuitInfo {
  id: string
  name: string
  customer?: string
  notes?: string
  /** 出圖用：圖號、版次、圖紙大小 */
  drawingNo?: string
  revision?: string
  paper?: 'A3' | 'A4'
  createdAt: number
  updatedAt: number
}

/** 一份迴路圖（存在 IndexedDB 的 circuits，或匯出成 .pcir） */
export interface CircuitDoc extends CircuitInfo {
  nodes: StoredNode[]
  edges: StoredEdge[]
}

export const PCIR_EXT = '.pcir'
const PCIR_FORMAT = 'pneumatic-circuit'

export function createCircuitInfo(name = '未命名迴路'): CircuitInfo {
  const now = Date.now()
  return { id: newId('c'), name, createdAt: now, updatedAt: now }
}

export const stripNode = ({ id, type, position, data }: CircuitFlowNode): StoredNode =>
  ({ id, type, position: { x: position.x, y: position.y }, data }) as StoredNode

export const stripEdge = ({ id, type, source, sourceHandle, target, targetHandle }: TubeFlowEdge): StoredEdge => ({
  id,
  type,
  source,
  sourceHandle,
  target,
  targetHandle,
})

/**
 * 讀回存檔時的清理：丟掉已不存在的元件 type、格式不對的節點與懸空的管線，
 * 避免舊存檔或別人傳來的檔案讓畫面崩潰。
 */
export function sanitizeCircuit(
  nodes: readonly unknown[] | undefined,
  edges: readonly unknown[] | undefined,
): { nodes: CircuitFlowNode[]; edges: TubeFlowEdge[] } {
  const validNodes: CircuitFlowNode[] = []
  for (const raw of nodes ?? []) {
    const n = raw as Partial<CircuitFlowNode> | null
    if (!n || typeof n.id !== 'string' || !n.position || !n.data) continue
    const position = { x: Number(n.position.x) || 0, y: Number(n.position.y) || 0 }
    if (n.type === 'note') {
      const text = (n.data as { text?: unknown }).text
      validNodes.push({ id: n.id, type: 'note', position, data: { text: typeof text === 'string' ? text : '' } })
      continue
    }
    const node = { ...n, type: 'pneumatic', position } as CircuitFlowNode
    if (isPneumaticNode(node) && registry.has(node.data.componentType)) {
      const rotation = [0, 90, 180, 270].includes(node.data.rotation) ? node.data.rotation : 0
      validNodes.push({ id: node.id, type: 'pneumatic', position, data: { ...node.data, rotation } })
    }
  }
  const ids = new Set(validNodes.filter(isPneumaticNode).map((n) => n.id))
  const validEdges: TubeFlowEdge[] = []
  for (const raw of edges ?? []) {
    const e = raw as Partial<TubeFlowEdge> | null
    if (!e || typeof e.id !== 'string' || !e.source || !e.target) continue
    if (!ids.has(e.source) || !ids.has(e.target) || !e.sourceHandle || !e.targetHandle) continue
    validEdges.push({
      id: e.id,
      type: 'tube',
      source: e.source,
      sourceHandle: e.sourceHandle,
      target: e.target,
      targetHandle: e.targetHandle,
    })
  }
  return { nodes: validNodes, edges: validEdges }
}

/** 匯出成 .pcir（JSON） */
export function toPcir(doc: CircuitDoc): string {
  return JSON.stringify({ format: PCIR_FORMAT, version: 1, exportedAt: Date.now(), circuit: doc }, null, 1)
}

/** 解析 .pcir；格式不對時丟出錯誤。匯入的電路一律給新的 id，避免覆蓋本機同名電路 */
export function parsePcir(text: string): CircuitDoc {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('檔案不是有效的迴路圖（.pcir）')
  }
  const root = data as { format?: unknown; circuit?: Partial<CircuitDoc> }
  if (root?.format !== PCIR_FORMAT || !root.circuit) throw new Error('檔案不是有效的迴路圖（.pcir）')
  const c = root.circuit
  const { nodes, edges } = sanitizeCircuit(c.nodes, c.edges)
  const info = createCircuitInfo(typeof c.name === 'string' && c.name ? c.name : '匯入的迴路')
  return {
    ...info,
    customer: typeof c.customer === 'string' ? c.customer : undefined,
    notes: typeof c.notes === 'string' ? c.notes : undefined,
    drawingNo: typeof c.drawingNo === 'string' ? c.drawingNo : undefined,
    revision: typeof c.revision === 'string' ? c.revision : undefined,
    paper: c.paper === 'A3' || c.paper === 'A4' ? c.paper : undefined,
    nodes: nodes.map(stripNode),
    edges: edges.map(stripEdge),
  }
}
