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
  type InteractAction,
  type Params,
  type ParamValue,
  type PortKey,
  type SimState,
} from '../engine'
import { createCircuitInfo, sanitizeCircuit, stripEdge, stripNode, type CircuitInfo } from './circuitDoc'
import {
  isPneumaticNode,
  isValidTube,
  newId,
  nextRotation,
  toCircuit,
  type CircuitFlowNode,
  type NoteFlowNode,
  type PneumaticFlowNode,
  type PneumaticNodeData,
  type ProductRef,
  type TubeFlowEdge,
} from './flow'
import { dedupeTag, nextTag } from './tags'

/**
 * - idle：編輯模式，可放元件、拉管線、旋轉、刪除
 * - running / paused：模擬模式，拓樸鎖定，點擊閥門可切換
 */
export type SimStatus = 'idle' | 'running' | 'paused'

/** 埠代號顯示方式：字母（P、A、B…）或 ISO 數字（1、4、2…） */
export type PortLabelMode = 'letter' | 'iso'

export interface ViewSettings {
  portLabels: PortLabelMode
  /** 在符號旁顯示標號與型號 */
  showTags: boolean
}

interface Snapshot {
  nodes: CircuitFlowNode[]
  edges: TubeFlowEdge[]
}

const EMPTY_SIM: SimState = {
  time: 0,
  componentStates: {},
  portStates: {},
  tubeStates: {},
  supplyFlow: {},
  ventFlow: {},
  pressure: {},
}
const EMPTY_CIRCUIT: Circuit = { nodes: [], tubes: [] }
const GRID = 8
const HISTORY_LIMIT = 100
/** 連續輸入同一個欄位時，這段時間內只記一步復原 */
const COALESCE_MS = 1500
const PASTE_OFFSET = 24

export interface AddOptions {
  product?: ProductRef
  params?: Params
}

export interface CircuitStore {
  nodes: CircuitFlowNode[]
  edges: TubeFlowEdge[]
  /** 目前電路的名稱、客戶等資訊 */
  info: CircuitInfo
  /** 目前電路是否已存在電路清單中（IndexedDB） */
  stored: boolean
  /** 上次儲存後是否有修改 */
  dirty: boolean
  past: Snapshot[]
  future: Snapshot[]
  view: ViewSettings

  status: SimStatus
  sim: SimState
  /** 按下播放時擷取的拓樸快照；模擬期間拓樸鎖定，因此不必每幀重新轉換 */
  circuit: Circuit
  /** 模擬時沒有接排氣口的排氣埠（UI 以琥珀色標示） */
  unconnectedExhausts: PortKey[]

  onNodesChange(changes: NodeChange<CircuitFlowNode>[]): void
  onEdgesChange(changes: EdgeChange<TubeFlowEdge>[]): void
  onConnect(connection: Connection): void
  /** 開始拖曳元件（記錄一步復原） */
  beginDrag(): void
  /** 加入元件，回傳新節點 id */
  addComponent(type: string, position: XYPosition, options?: AddOptions): string | undefined
  addNote(position: XYPosition, text?: string): string | undefined
  rotateSelected(): void
  flipSelected(): void
  deleteSelected(): void
  /** 修改元件資料；coalesce 相同且間隔很短的修改合併成一步復原（例如連續打字） */
  updateNode(id: string, patch: Partial<PneumaticNodeData>, coalesce?: string): void
  updateNote(id: string, text: string): void
  /** 更換元件類型：保留新類型也有的埠上的管線 */
  changeType(id: string, type: string): void
  selectOnly(ids: readonly string[]): void
  selectAll(): void
  copySelected(): void
  paste(): void
  duplicateSelected(): void
  undo(): void
  redo(): void
  /** 以新的電路取代目前的電路（開新電路、開啟檔案、載入範例）；清除復原記錄 */
  replaceCircuit(nodes: CircuitFlowNode[], edges: TubeFlowEdge[], info?: CircuitInfo, stored?: boolean): void
  setInfo(patch: Partial<Pick<CircuitInfo, 'name' | 'customer' | 'notes' | 'drawingNo' | 'revision' | 'paper'>>): void
  /** 已存進電路清單 */
  markStored(info: CircuitInfo): void
  setView(patch: Partial<ViewSettings>): void

  play(): void
  pause(): void
  reset(): void
  tick(dt: number): void
  interact(nodeId: string, action?: InteractAction): void
  /** 模擬中調整參數（節流開度、設定壓力），立即生效 */
  setLiveParam(nodeId: string, key: string, value: ParamValue): void
}

const snap = (v: number) => Math.round(v / GRID) * GRID

/** 模擬中只接受 React Flow 的量測類變更，擋掉新增／刪除 */
const EDITING_ONLY = new Set(['add', 'remove', 'replace'])

/** 剪貼簿：只在這個分頁內有效 */
let clipboard: Snapshot | undefined
let pasteCount = 0

export const useCircuitStore = create<CircuitStore>()(
  persist(
    (set, get) => {
      const editable = () => get().status === 'idle'

      let lastPush = { at: 0, key: undefined as string | undefined }
      let pushedThisTick = false

      /**
       * 在修改之前記錄一步復原。同一個事件迴圈內的多次修改（例如刪除元件時
       * React Flow 先後送出節點與管線的變更）只記一次。
       */
      const pushHistory = (coalesce?: string) => {
        const now = Date.now()
        if (pushedThisTick) return
        if (coalesce && lastPush.key === coalesce && now - lastPush.at < COALESCE_MS) {
          lastPush.at = now
          return
        }
        const { nodes, edges, past } = get()
        set({ past: [...past, { nodes, edges }].slice(-HISTORY_LIMIT), future: [], dirty: true })
        lastPush = { at: now, key: coalesce }
        pushedThisTick = true
        queueMicrotask(() => {
          pushedThisTick = false
        })
      }

      const deselected = <T extends { selected?: boolean }>(items: T[]): T[] =>
        items.map((x) => (x.selected ? { ...x, selected: false } : x))

      const mapPneumatic = (fn: (n: PneumaticFlowNode) => PneumaticFlowNode, only?: (n: CircuitFlowNode) => boolean) =>
        get().nodes.map((n) => (isPneumaticNode(n) && (!only || only(n)) ? fn(n) : n))

      return {
        nodes: [],
        edges: [],
        info: createCircuitInfo(),
        stored: false,
        dirty: false,
        past: [],
        future: [],
        view: { portLabels: 'letter', showTags: true },
        status: 'idle',
        sim: EMPTY_SIM,
        circuit: EMPTY_CIRCUIT,
        unconnectedExhausts: [],

        onNodesChange(changes) {
          const allowed = editable() ? changes : changes.filter((c) => !EDITING_ONLY.has(c.type))
          if (allowed.some((c) => c.type === 'remove')) pushHistory()
          set({ nodes: applyNodeChanges(allowed, get().nodes) })
        },

        onEdgesChange(changes) {
          const allowed = editable() ? changes : changes.filter((c) => !EDITING_ONLY.has(c.type))
          if (allowed.some((c) => c.type === 'remove')) pushHistory()
          set({ edges: applyEdgeChanges(allowed, get().edges) })
        },

        onConnect(connection) {
          const { edges } = get()
          if (!editable() || !isValidTube(connection, edges)) return
          pushHistory()
          const edge: TubeFlowEdge = {
            id: newId('t'),
            type: 'tube',
            source: connection.source,
            sourceHandle: connection.sourceHandle,
            target: connection.target,
            targetHandle: connection.targetHandle,
          }
          set({ edges: [...get().edges, edge] })
        },

        beginDrag() {
          if (editable()) pushHistory()
        },

        addComponent(type, position, options) {
          if (!editable() || !registry.has(type)) return undefined
          pushHistory()
          const { nodes } = get()
          const data: PneumaticNodeData = { componentType: type, rotation: 0 }
          const tag = nextTag(nodes, type)
          if (tag) data.tag = tag
          if (options?.product) data.product = options.product
          if (options?.params && Object.keys(options.params).length) data.params = { ...options.params }
          const node: PneumaticFlowNode = {
            id: newId('n'),
            type: 'pneumatic',
            position: { x: snap(position.x), y: snap(position.y) },
            data,
            selected: true,
          }
          set({ nodes: [...deselected(nodes), node], edges: deselected(get().edges) })
          return node.id
        },

        addNote(position, text = '註解') {
          if (!editable()) return undefined
          pushHistory()
          const node: NoteFlowNode = {
            id: newId('m'),
            type: 'note',
            position: { x: snap(position.x), y: snap(position.y) },
            data: { text },
            selected: true,
          }
          set({ nodes: [...deselected(get().nodes), node], edges: deselected(get().edges) })
          return node.id
        },

        rotateSelected() {
          if (!editable() || !get().nodes.some((n) => n.selected && isPneumaticNode(n))) return
          pushHistory()
          set({
            nodes: mapPneumatic(
              (n) => ({ ...n, data: { ...n.data, rotation: nextRotation(n.data.rotation) } }),
              (n) => !!n.selected,
            ),
          })
        },

        flipSelected() {
          if (!editable() || !get().nodes.some((n) => n.selected && isPneumaticNode(n))) return
          pushHistory()
          set({
            nodes: mapPneumatic((n) => ({ ...n, data: { ...n.data, flip: !n.data.flip } }), (n) => !!n.selected),
          })
        },

        deleteSelected() {
          if (!editable()) return
          const { nodes, edges } = get()
          const removed = new Set(nodes.filter((n) => n.selected).map((n) => n.id))
          if (removed.size === 0 && !edges.some((e) => e.selected)) return
          pushHistory()
          set({
            nodes: nodes.filter((n) => !removed.has(n.id)),
            edges: edges.filter((e) => !e.selected && !removed.has(e.source) && !removed.has(e.target)),
          })
        },

        updateNode(id, patch, coalesce) {
          if (!editable()) return
          pushHistory(coalesce ? `${id}:${coalesce}` : undefined)
          set({ nodes: mapPneumatic((n) => ({ ...n, data: { ...n.data, ...patch } }), (n) => n.id === id) })
        },

        updateNote(id, text) {
          if (!editable()) return
          pushHistory(`${id}:text`)
          set({
            nodes: get().nodes.map((n) => (n.id === id && n.type === 'note' ? { ...n, data: { ...n.data, text } } : n)),
          })
        },

        changeType(id, type) {
          if (!editable() || !registry.has(type)) return
          const node = get().nodes.find((n) => n.id === id)
          if (!node || !isPneumaticNode(node) || node.data.componentType === type) return
          pushHistory()
          const ports = new Set(registry.get(type).ports.map((p) => p.id))
          const keep = (nodeId: string, handle: string | null | undefined) => nodeId !== id || ports.has(handle ?? '')
          set({
            nodes: mapPneumatic((n) => ({ ...n, data: { ...n.data, componentType: type } }), (n) => n.id === id),
            edges: get().edges.filter((e) => keep(e.source, e.sourceHandle) && keep(e.target, e.targetHandle)),
          })
        },

        selectOnly(ids) {
          const wanted = new Set(ids)
          set({
            nodes: get().nodes.map((n) => (!!n.selected === wanted.has(n.id) ? n : { ...n, selected: wanted.has(n.id) })),
            edges: deselected(get().edges),
          })
        },

        selectAll() {
          if (!editable()) return
          set({
            nodes: get().nodes.map((n) => (n.selected ? n : { ...n, selected: true })),
            edges: get().edges.map((e) => (e.selected ? e : { ...e, selected: true })),
          })
        },

        copySelected() {
          const { nodes, edges } = get()
          const picked = nodes.filter((n) => n.selected)
          if (picked.length === 0) return
          const ids = new Set(picked.map((n) => n.id))
          clipboard = {
            nodes: picked.map((n) => ({ ...n })),
            edges: edges.filter((e) => ids.has(e.source) && ids.has(e.target)).map((e) => ({ ...e })),
          }
          pasteCount = 0
        },

        paste() {
          if (!editable() || !clipboard) return
          pushHistory()
          pasteCount++
          const offset = PASTE_OFFSET * pasteCount
          const idMap = new Map<string, string>()
          let nodes = deselected(get().nodes)
          for (const n of clipboard.nodes) {
            const id = newId(n.type === 'note' ? 'm' : 'n')
            idMap.set(n.id, id)
            const position = { x: n.position.x + offset, y: n.position.y + offset }
            const copy: CircuitFlowNode = isPneumaticNode(n)
              ? {
                  id,
                  type: 'pneumatic',
                  position,
                  data: { ...n.data, tag: dedupeTag(nodes, n.data.componentType, n.data.tag) },
                  selected: true,
                }
              : { id, type: 'note', position, data: { ...n.data }, selected: true }
            nodes = [...nodes, copy]
          }
          const edges = [
            ...deselected(get().edges),
            ...clipboard.edges.map((e) => ({
              ...e,
              id: newId('t'),
              source: idMap.get(e.source)!,
              target: idMap.get(e.target)!,
              selected: false,
            })),
          ]
          set({ nodes, edges })
        },

        duplicateSelected() {
          const saved = clipboard
          const savedCount = pasteCount
          get().copySelected()
          if (clipboard === saved) return
          get().paste()
          clipboard = saved
          pasteCount = savedCount
        },

        undo() {
          const { past, future, nodes, edges } = get()
          if (!editable() || past.length === 0) return
          const prev = past[past.length - 1]
          set({ nodes: prev.nodes, edges: prev.edges, past: past.slice(0, -1), future: [{ nodes, edges }, ...future], dirty: true })
          lastPush = { at: 0, key: undefined }
        },

        redo() {
          const { past, future, nodes, edges } = get()
          if (!editable() || future.length === 0) return
          const next = future[0]
          set({ nodes: next.nodes, edges: next.edges, past: [...past, { nodes, edges }], future: future.slice(1), dirty: true })
          lastPush = { at: 0, key: undefined }
        },

        replaceCircuit(nodes, edges, info = createCircuitInfo(), stored = false) {
          get().reset()
          set({ nodes, edges, info, stored, dirty: false, past: [], future: [] })
        },

        setInfo(patch) {
          set({ info: { ...get().info, ...patch }, dirty: true })
        },

        markStored(info) {
          set({ info, stored: true, dirty: false })
        },

        setView(patch) {
          set({ view: { ...get().view, ...patch } })
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
            nodes: deselected(nodes),
            edges: deselected(edges),
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

        interact(nodeId, action) {
          const { status, circuit, sim } = get()
          if (status !== 'idle') set({ sim: interact(circuit, sim, nodeId, undefined, action) })
        },

        setLiveParam(nodeId, key, value) {
          const { status, circuit, sim, nodes } = get()
          const withParam = (params: Params | undefined): Params => ({ ...params, [key]: value })
          set({
            nodes: nodes.map((n) =>
              n.id === nodeId && isPneumaticNode(n) ? { ...n, data: { ...n.data, params: withParam(n.data.params) } } : n,
            ),
            dirty: true,
          })
          if (status === 'idle') return
          const next: Circuit = {
            ...circuit,
            nodes: circuit.nodes.map((n) => (n.id === nodeId ? { ...n, params: withParam(n.params) } : n)),
          }
          set({ circuit: next, sim: { ...sim, ...solve(next, sim.componentStates) } })
        },
      }
    },
    {
      name: 'pneumatic-sim:circuit',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      // 只保存拓樸與電路資訊；模擬狀態、選取狀態與復原記錄不保存
      partialize: (s) => ({
        nodes: s.nodes.map(stripNode),
        edges: s.edges.map(stripEdge),
        info: s.info,
        stored: s.stored,
        dirty: s.dirty,
        view: s.view,
      }),
      // v1 只有 nodes／edges；其餘欄位用預設值
      migrate: (persisted) => persisted as object,
      // 讀回時丟掉已不存在的元件 type 與懸空的管線，避免舊存檔讓畫面崩潰
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<Pick<CircuitStore, 'nodes' | 'edges' | 'info' | 'stored' | 'dirty' | 'view'>>
        const { nodes, edges } = sanitizeCircuit(saved.nodes, saved.edges)
        return {
          ...current,
          nodes,
          edges,
          info: saved.info?.id ? saved.info : current.info,
          stored: !!saved.stored,
          dirty: !!saved.dirty,
          view: { ...current.view, ...saved.view },
        }
      },
    },
  ),
)
