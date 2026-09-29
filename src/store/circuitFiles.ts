import { getCatalog, useLibraryStore } from '../catalog/library'
import { downloadFile, safeFileName } from '../utils/download'
import { buildCircuitBom, circuitBomToCsv } from './circuitBom'
import {
  createCircuitInfo,
  parsePcir,
  PCIR_EXT,
  sanitizeCircuit,
  sanitizeSequence,
  stripEdge,
  stripNode,
  toPcir,
  type CircuitDoc,
  type CircuitInfo,
} from './circuitDoc'
import { useCircuitStore } from './circuitStore'

/** 電路清單中的一列 */
export interface CircuitSummary extends CircuitInfo {
  components: number
}

const summarize = ({ nodes, edges: _edges, sequence: _sequence, ...info }: CircuitDoc): CircuitSummary => ({
  ...info,
  components: nodes.filter((n) => n.type === 'pneumatic').length,
})

export async function listCircuits(): Promise<CircuitSummary[]> {
  const catalog = await getCatalog()
  return (await catalog.listCircuits()).map(summarize).sort((a, b) => b.updatedAt - a.updatedAt)
}

function currentDoc(info: CircuitInfo): CircuitDoc {
  const { nodes, edges, sequence } = useCircuitStore.getState()
  return { ...info, nodes: nodes.map(stripNode), edges: edges.map(stripEdge), ...(sequence.steps.length > 0 && { sequence }) }
}

/** 儲存目前電路到電路清單；asNew = 另存新檔（新的 id 與名稱） */
export async function saveCircuit(options?: { asNew?: { name: string; customer?: string } }): Promise<CircuitInfo> {
  const catalog = await getCatalog()
  const { info } = useCircuitStore.getState()
  const now = Date.now()
  const next: CircuitInfo = options?.asNew
    ? { ...createCircuitInfo(options.asNew.name), customer: options.asNew.customer, notes: info.notes, ...(info.sizing && { sizing: info.sizing }) }
    : { ...info, updatedAt: now }
  await catalog.putCircuit(currentDoc(next))
  useCircuitStore.getState().markStored(next)
  return next
}

export async function openCircuit(id: string): Promise<void> {
  const catalog = await getCatalog()
  const doc = await catalog.getCircuit(id)
  if (!doc) throw new Error('找不到這份迴路圖，可能已被刪除')
  const { nodes, edges } = sanitizeCircuit(doc.nodes, doc.edges)
  const { nodes: _n, edges: _e, sequence, ...info } = doc
  useCircuitStore.getState().replaceCircuit(nodes, edges, info, true, sanitizeSequence(sequence))
}

export async function deleteCircuit(id: string): Promise<void> {
  const catalog = await getCatalog()
  await catalog.deleteCircuit(id)
  const store = useCircuitStore.getState()
  if (store.info.id === id) useCircuitStore.setState({ stored: false, dirty: true })
}

export async function renameCircuit(id: string, name: string): Promise<void> {
  const catalog = await getCatalog()
  const doc = await catalog.getCircuit(id)
  if (!doc) return
  await catalog.putCircuit({ ...doc, name, updatedAt: Date.now() })
  const store = useCircuitStore.getState()
  if (store.info.id === id) useCircuitStore.setState({ info: { ...store.info, name } })
}

export function exportCircuitFile(): void {
  const { info } = useCircuitStore.getState()
  downloadFile(toPcir(currentDoc({ ...info, updatedAt: Date.now() })), `${safeFileName(info.name)}${PCIR_EXT}`, 'application/json')
}

/** 匯入 .pcir：以新電路開啟（尚未存進電路清單） */
export async function importCircuitFile(file: File): Promise<void> {
  const doc = parsePcir(await file.text())
  const { nodes, edges } = sanitizeCircuit(doc.nodes, doc.edges)
  const { nodes: _n, edges: _e, sequence, ...info } = doc
  useCircuitStore.getState().replaceCircuit(nodes, edges, info, false, sequence)
  useCircuitStore.setState({ dirty: true })
}

export function exportCircuitBom(): void {
  const { info, nodes } = useCircuitStore.getState()
  const products = useLibraryStore.getState().products
  downloadFile(circuitBomToCsv(info, buildCircuitBom(nodes, products)), `${safeFileName(info.name)}-BOM.csv`, 'text/csv;charset=utf-8')
}
