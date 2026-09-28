import { renderToStaticMarkup } from 'react-dom/server'
import { getSymbol } from '../components/symbols/symbolRegistry'
import { registry, resolveParams } from '../engine'
import type { Product } from '../catalog/types'
import { buildCircuitBom } from '../store/circuitBom'
import { isPneumaticNode, type CircuitFlowNode, type TubeFlowEdge } from '../store/flow'
import type { CircuitSheetInput } from './circuitSheet'

export interface CircuitExportOptions {
  paper: CircuitSheetInput['paper']
  title: CircuitSheetInput['title']
  portLabels: 'letter' | 'iso'
  showTags: boolean
  remarks?: string
  products?: Readonly<Record<string, Pick<Product, 'maker' | 'price'>>>
}

/**
 * 迴路圖 → 出圖用的資料：每個元件的符號以編輯模式（靜止位置、無壓力顏色）畫成 SVG 標記，
 * 與畫面上的符號完全相同。
 */
export function circuitSheetInput(nodes: readonly CircuitFlowNode[], edges: readonly TubeFlowEdge[], options: CircuitExportOptions): CircuitSheetInput {
  const sheetNodes: CircuitSheetInput['nodes'][number][] = []
  const notes: CircuitSheetInput['notes'][number][] = []
  for (const n of nodes) {
    if (!isPneumaticNode(n)) {
      notes.push({ x: n.position.x, y: n.position.y, text: n.data.text })
      continue
    }
    const type = n.data.componentType
    if (!registry.has(type)) continue
    const def = registry.get(type)
    const symbol = getSymbol(type)
    const params = resolveParams(def, n.data.params)
    const labels = options.portLabels === 'iso' ? Object.fromEntries(def.ports.filter((p) => p.iso).map((p) => [p.id, p.iso!])) : undefined
    const markup = renderToStaticMarkup(
      <svg>
        <symbol.Symbol state={def.createState(params)} rotation={n.data.rotation} flip={n.data.flip} params={params} labels={labels} />
      </svg>,
    )
    sheetNodes.push({
      id: n.id,
      x: n.position.x,
      y: n.position.y,
      width: symbol.width,
      height: symbol.height,
      rotation: n.data.rotation,
      flip: n.data.flip,
      markup,
      ports: symbol.ports,
      tag: n.data.tag,
      modelCode: n.data.product?.modelCode,
      labelSide: n.data.labelSide,
    })
  }
  return {
    paper: options.paper,
    title: options.title,
    nodes: sheetNodes,
    tubes: edges.map((e) => ({ source: e.source, sourcePort: e.sourceHandle ?? '', target: e.target, targetPort: e.targetHandle ?? '' })),
    notes,
    bom: buildCircuitBom(nodes, options.products).map((r) => ({ index: r.index, tags: r.tags, modelCode: r.modelCode, name: r.name, quantity: r.quantity })),
    showTags: options.showTags,
    remarks: options.remarks,
  }
}
