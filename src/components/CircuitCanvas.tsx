import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  ConnectionMode,
  Controls,
  Panel,
  ReactFlow,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeTypes,
  type NodeTypes,
} from '@xyflow/react'
import { useCallback, useEffect, type DragEvent, type MouseEvent } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useLibraryStore } from '../catalog/library'
import { effectivePneumatic } from '../catalog/pneumatic'
import { registry } from '../engine'
import { useCircuitStore } from '../store/circuitStore'
import { isPneumaticNode, isValidTube, type CircuitFlowNode, type TubeFlowEdge } from '../store/flow'
import { COMPONENT_DRAG_MIME, FIT_VIEW_OPTIONS, parseDragPayload } from './canvasConfig'
import { TubeEdge } from './edges/TubeEdge'
import { WarningIcon } from './icons'
import { Legend } from './Legend'
import { NoteNode } from './nodes/NoteNode'
import { PneumaticNode } from './nodes/PneumaticNode'
import { getSymbol } from './symbols/symbolRegistry'

const nodeTypes: NodeTypes = { pneumatic: PneumaticNode, note: NoteNode }
const edgeTypes: EdgeTypes = { tube: TubeEdge }
const DELETE_KEYS = ['Delete', 'Backspace']

/** 點擊位置對應的操作：符號內標了 data-action 的部位（例如電磁線圈），否則為點擊本體 */
function actionAt(e: MouseEvent): string | undefined {
  const target = e.target as Element | null
  if (target?.closest('[data-momentary]')) return undefined
  return target?.closest('[data-action]')?.getAttribute('data-action') ?? 'toggle'
}

export function CircuitCanvas() {
  const { nodes, edges, status, onNodesChange, onEdgesChange, onConnect, addComponent, interact, beginDrag } =
    useCircuitStore(
      useShallow((s) => ({
        nodes: s.nodes,
        edges: s.edges,
        status: s.status,
        onNodesChange: s.onNodesChange,
        onEdgesChange: s.onEdgesChange,
        onConnect: s.onConnect,
        addComponent: s.addComponent,
        interact: s.interact,
        beginDrag: s.beginDrag,
      })),
    )
  const warningCount = useCircuitStore((s) => s.unconnectedExhausts.length)
  const { screenToFlowPosition, fitView } = useReactFlow<CircuitFlowNode, TubeFlowEdge>()
  const editing = status === 'idle'

  // 開啟時若有存檔的電路就縮放到全貌。不使用 <ReactFlow fitView>：畫布為空時
  // React Flow 會把 fitView 排隊到第一個節點出現，導致放下第一個元件時畫面突然跳動。
  useEffect(() => {
    if (useCircuitStore.getState().nodes.length > 0) void fitView({ ...FIT_VIEW_OPTIONS, duration: 0 })
  }, [fitView])

  const isValidConnection = useCallback(
    (c: Connection | Edge) => isValidTube(c, useCircuitStore.getState().edges),
    [],
  )

  const onDragOver = useCallback((e: DragEvent) => {
    if (!e.dataTransfer.types.includes(COMPONENT_DRAG_MIME)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const onDrop = useCallback(
    (e: DragEvent) => {
      const payload = parseDragPayload(e.dataTransfer.getData(COMPONENT_DRAG_MIME))
      if (!payload || !registry.has(payload.type)) return
      e.preventDefault()
      const { width, height } = getSymbol(payload.type)
      const p = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      const product = payload.productId ? useLibraryStore.getState().products[payload.productId] : undefined
      addComponent(
        payload.type,
        { x: p.x - width / 2, y: p.y - height / 2 },
        product && {
          product: { id: product.id, modelCode: product.modelCode, name: product.name },
          params: effectivePneumatic(product)?.params,
        },
      )
    },
    [addComponent, screenToFlowPosition],
  )

  const onNodeClick = useCallback(
    (e: MouseEvent, node: CircuitFlowNode) => {
      const action = actionAt(e)
      if (action && isPneumaticNode(node)) interact(node.id, action)
    },
    [interact],
  )

  const hasInteractive = nodes.some((n) => isPneumaticNode(n) && registry.get(n.data.componentType).onInteract)

  return (
    <ReactFlow<CircuitFlowNode, TubeFlowEdge>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeDragStart={beginDrag}
      isValidConnection={isValidConnection}
      connectionMode={ConnectionMode.Loose}
      connectionLineType={ConnectionLineType.SmoothStep}
      connectionLineStyle={{ stroke: '#64748b', strokeWidth: 2.5, strokeDasharray: '6 4' }}
      nodesDraggable={editing}
      nodesConnectable={editing}
      elementsSelectable={editing}
      deleteKeyCode={editing ? DELETE_KEYS : null}
      onNodeClick={editing ? undefined : onNodeClick}
      onDragOver={onDragOver}
      onDrop={onDrop}
      snapToGrid
      snapGrid={[8, 8]}
      minZoom={0.2}
      maxZoom={2.5}
    >
      <Background variant={BackgroundVariant.Dots} gap={16} size={1.2} color="#cbd5e1" />
      <Controls showInteractive={false} />
      <Panel position="bottom-right">
        <Legend />
      </Panel>

      {!editing && warningCount > 0 && (
        <Panel position="top-center">
          <div className="mt-10 flex max-w-md items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 shadow-sm lg:mt-0">
            <WarningIcon />
            <span>
              有 {warningCount} 個排氣埠未連接排氣口（琥珀色標記處）。未接的排氣埠視為封閉，氣缸可能無法動作。
            </span>
          </div>
        </Panel>
      )}
      {!editing && warningCount === 0 && hasInteractive && (
        <Panel position="top-center">
          <div className="mt-10 rounded-md bg-slate-800/85 px-3 py-1.5 text-sm text-white shadow-sm lg:mt-0">
            點擊閥門或電磁線圈切換；按鈕閥要按住
          </div>
        </Panel>
      )}

      {nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <div className="max-w-sm rounded-lg border border-dashed border-slate-300 bg-white/80 px-6 py-5 text-center text-slate-500">
            <p className="font-medium text-slate-700">畫布是空的</p>
            <p className="mt-1 text-sm">
              從左側「元件」或「產品庫」拖拉（或點一下）加入，或從上方「範例」開啟一個範例迴路。
            </p>
          </div>
        </div>
      )}
    </ReactFlow>
  )
}
