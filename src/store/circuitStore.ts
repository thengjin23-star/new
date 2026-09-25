import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type XYPosition,
} from '@xyflow/react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  createInitialState,
  findUnconnectedExhaustPorts,
  interact,
  registry,
  solve,
  step,
  type Circuit,
  type PortKey,
  type SimState,
} from '../engine'
import { isValidTube, newId, nextRotation, toCircuit, type PneumaticFlowNode, type TubeFlowEdge } from './flow'

/**
 * - idle：編輯模式，可放元件、拉管線、旋轉、刪除
 * - running / paused：模擬模式，拓樸鎖定，點擊閥門可切換
 */
export type SimStatus = 'idle' | 'running' | 'paused'

const EMPTY_SIM: SimState = { time: 0, componentStates: {}, portStates: {}, tubeStates: {} }
const EMPTY_CIRCUIT: Circuit = { nodes: [], tubes: [] }
const GRID = 8

export interface CircuitStore {
  nodes: PneumaticFlowNode[]
  edges: TubeFlowEdge[]

  status: SimStatus
  sim: SimState
  /** 按下播放時擷取的拓樸快照；模擬期間拓樸鎖定，因此不必每幀重新轉換 */
  circuit: Circuit
  /** 模擬時沒有接排氣口的排氣埠（UI 以琥珀色標示） */
  unconnectedExhausts: PortKey[]

  onNodesChange(changes: NodeChange<PneumaticFlowNode>[]): void
  onEdgesChange(changes: EdgeChange<TubeFlowEdge>[]): void
  onConnect(connection: Connection): void
  addComponent(type: string, position: XYPosition): void
  rotateSelected(): void
  deleteSelected(): void
  /** 以新的電路取代目前的電路（載入範例、新電路） */
  replaceCircuit(nodes: PneumaticFlowNode[], edges: TubeFlowEdge[]): void

  play(): void
  pause(): void
  reset(): void
  tick(dt: number): void
  interact(nodeId: string): void
}

const snap = (v: number) => Math.round(v / GRID) * GRID

/** 模擬中只接受 React Flow 的量測類變更，擋掉新增／刪除 */
const EDITING_ONLY = new Set(['add', 'remove', 'replace'])

export const useCircuitStore = create<CircuitStore>()(
  persist(
    (set, get) => {
      const editable = () => get().status === 'idle'

      return {
        nodes: [],
        edges: [],
        status: 'idle',
        sim: EMPTY_SIM,
        circuit: EMPTY_CIRCUIT,
        unconnectedExhausts: [],

        onNodesChange(changes) {
          const allowed = editable() ? changes : changes.filter((c) => !EDITING_ONLY.has(c.type))
          set({ nodes: applyNodeChanges(allowed, get().nodes) })
        },

        onEdgesChange(changes) {
          const allowed = editable() ? changes : changes.filter((c) => !EDITING_ONLY.has(c.type))
          set({ edges: applyEdgeChanges(allowed, get().edges) })
        },

        onConnect(connection) {
          const { edges } = get()
          if (!editable() || !isValidTube(connection, edges)) return
          const edge: TubeFlowEdge = {
            id: newId('t'),
            type: 'tube',
            source: connection.source,
            sourceHandle: connection.sourceHandle,
            target: connection.target,
            targetHandle: connection.targetHandle,
          }
          set({ edges: [...edges, edge] })
        },

        addComponent(type, position) {
          if (!editable() || !registry.has(type)) return
          const node: PneumaticFlowNode = {
            id: newId('n'),
            type: 'pneumatic',
            position: { x: snap(position.x), y: snap(position.y) },
            data: { componentType: type, rotation: 0 },
            selected: true,
          }
          set({ nodes: [...get().nodes.map((n) => (n.selected ? { ...n, selected: false } : n)), node] })
        },

        rotateSelected() {
          if (!editable()) return
          set({
            nodes: get().nodes.map((n) =>
              n.selected ? { ...n, data: { ...n.data, rotation: nextRotation(n.data.rotation) } } : n,
            ),
          })
        },

        deleteSelected() {
          if (!editable()) return
          const { nodes, edges } = get()
          const removed = new Set(nodes.filter((n) => n.selected).map((n) => n.id))
          set({
            nodes: nodes.filter((n) => !removed.has(n.id)),
            edges: edges.filter((e) => !e.selected && !removed.has(e.source) && !removed.has(e.target)),
          })
        },

        replaceCircuit(nodes, edges) {
          get().reset()
          set({ nodes, edges })
        },

        play() {
          const { status, nodes, edges } = get()
          if (status === 'running') return
          if (status === 'paused') {
            set({ status: 'running' })
            return
          }
          const circuit = toCircuit(nodes, edges)
          const initial = createInitialState(circuit)
          set({
            status: 'running',
            circuit,
            // 先 solve 一次，讓按下播放的瞬間管線就有顏色
            sim: { ...initial, ...solve(circuit, initial.componentStates) },
            unconnectedExhausts: findUnconnectedExhaustPorts(circuit),
            // 進入模擬模式時取消選取，避免選取框干擾畫面
            nodes: nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
            edges: edges.map((e) => (e.selected ? { ...e, selected: false } : e)),
          })
        },

        pause() {
          if (get().status === 'running') set({ status: 'paused' })
        },

        reset() {
          set({ status: 'idle', sim: EMPTY_SIM, circuit: EMPTY_CIRCUIT, unconnectedExhausts: [] })
        },

        tick(dt) {
          const { status, circuit, sim } = get()
          if (status === 'running') set({ sim: step(circuit, sim, dt) })
        },

        interact(nodeId) {
          const { status, circuit, sim } = get()
          if (status !== 'idle') set({ sim: interact(circuit, sim, nodeId) })
        },
      }
    },
    {
      name: 'pneumatic-sim:circuit',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // 只保存拓樸；模擬狀態與選取狀態不保存
      partialize: (s) => ({
        nodes: s.nodes.map(({ id, type, position, data }) => ({ id, type, position, data })),
        edges: s.edges.map(({ id, type, source, sourceHandle, target, targetHandle }) => ({
          id,
          type,
          source,
          sourceHandle,
          target,
          targetHandle,
        })),
      }),
      // 讀回時丟掉已不存在的元件 type 與懸空的管線，避免舊存檔讓畫面崩潰
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<Pick<CircuitStore, 'nodes' | 'edges'>>
        const nodes = (saved.nodes ?? []).filter((n) => registry.has(n.data?.componentType))
        const ids = new Set(nodes.map((n) => n.id))
        const edges = (saved.edges ?? []).filter((e) => ids.has(e.source) && ids.has(e.target))
        return { ...current, nodes, edges }
      },
    },
  ),
)
