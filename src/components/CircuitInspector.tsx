import { useReactFlow } from '@xyflow/react'
import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useLibraryStore } from '../catalog/library'
import { effectivePneumatic, isCircuitType, pneumaticTypeLabel } from '../catalog/pneumatic'
import { productLabel, type Product } from '../catalog/types'
import {
  cylinderForce,
  defaultRodDiameter,
  numParam,
  portKey,
  registry,
  resolveParams,
  type CylinderState,
  type ParamValue,
} from '../engine'
import { bomTotal } from '../assembly/bom'
import { buildCircuitBom } from '../store/circuitBom'
import { formatMoney } from '../utils/money'
import { checkCircuit, nodeTitle, type CheckLevel } from '../store/circuitChecks'
import { exportCircuitBom, saveCircuit } from '../store/circuitFiles'
import { useCircuitStore } from '../store/circuitStore'
import { useCircuitUi } from '../store/circuitUi'
import { isPneumaticNode, type NoteFlowNode, type PneumaticFlowNode } from '../store/flow'
import { ParamInput, PneumaticFunctionDialog } from './PneumaticFunctionEditor'
import { SymbolPreview } from './SymbolPreview'
import { Button } from './ui'

const inputClass = 'mt-0.5 h-8 w-full rounded-md border border-slate-300 px-2 text-sm text-slate-800'
const sectionTitle = 'mb-1.5 text-xs font-semibold tracking-wide text-slate-500'

/** 與某個元件類型的埠完全相同的其他類型（可以直接互換，不必重拉管線） */
function interchangeableTypes(type: string): string[] {
  const key = (t: string) =>
    registry
      .get(t)
      .ports.map((p) => p.id)
      .sort()
      .join(',')
  const k = key(type)
  return registry
    .list()
    .filter((d) => !d.hidden && key(d.type) === k)
    .map((d) => d.type)
}

// ---------------- 單一元件 ----------------

function NodeInspector({ node }: { node: PneumaticFlowNode }) {
  const { updateNode, changeType, rotateSelected, flipSelected, duplicateSelected, deleteSelected } = useCircuitStore(
    useShallow((s) => ({
      updateNode: s.updateNode,
      changeType: s.changeType,
      rotateSelected: s.rotateSelected,
      flipSelected: s.flipSelected,
      duplicateSelected: s.duplicateSelected,
      deleteSelected: s.deleteSelected,
    })),
  )
  const products = useLibraryStore((s) => s.products)
  const [editProduct, setEditProduct] = useState<Product | undefined>()
  const { componentType, tag, product: ref, params, note, labelSide } = node.data
  const update = (patch: Partial<PneumaticFlowNode['data']>, coalesce?: string) => updateNode(node.id, patch, coalesce)
  const def = registry.get(componentType)
  const product = ref && products[ref.id]
  const productPn = product && effectivePneumatic(product)
  const alternatives = interchangeableTypes(componentType)

  // 功能相同的產品排前面，其次是其他可放進迴路圖的產品
  const candidates = useMemo(() => {
    const list = Object.values(products)
      .map((p) => ({ p, pn: effectivePneumatic(p) }))
      .filter(({ pn }) => isCircuitType(pn?.type))
    const same = list.filter(({ pn }) => pn!.type === componentType).map(({ p }) => p)
    const others = list.filter(({ pn }) => pn!.type !== componentType).map(({ p }) => p)
    const byCode = (a: Product, b: Product) => a.modelCode.localeCompare(b.modelCode, 'zh-Hant')
    return { same: same.sort(byCode), others: others.sort(byCode) }
  }, [products, componentType])

  const assign = (id: string) => {
    if (!id) {
      update({ product: undefined })
      return
    }
    const p = products[id]
    const pn = effectivePneumatic(p)
    update({
      product: { id: p.id, modelCode: p.modelCode, name: p.name },
      params: { ...params, ...pn?.params },
    })
    if (pn && isCircuitType(pn.type) && pn.type !== componentType) changeType(node.id, pn.type)
  }

  const setParam = (key: string, raw: string | boolean) => {
    const next: Record<string, ParamValue> = { ...params }
    if (raw === '') delete next[key]
    else if (typeof raw === 'boolean') next[key] = raw
    else {
      const n = Number(raw)
      if (!Number.isFinite(n)) return
      next[key] = n
    }
    update({ params: Object.keys(next).length ? next : undefined }, `param:${key}`)
  }

  return (
    <div className="space-y-4 p-3">
      <div className="flex items-center gap-3">
        <div className="h-12 w-16 shrink-0 rounded border border-slate-200 bg-slate-50 p-1">
          <SymbolPreview type={componentType} params={params} className="h-full w-full" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800">{def.label}</p>
          {ref && <p className="truncate font-mono text-xs text-slate-500">{ref.modelCode}</p>}
        </div>
      </div>

      {alternatives.length > 1 && (
        <label className="block text-xs text-slate-500">
          元件類型（埠相同，可直接互換）
          <select value={componentType} onChange={(e) => changeType(node.id, e.target.value)} className={inputClass}>
            {alternatives.map((t) => (
              <option key={t} value={t}>
                {registry.get(t).label}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="block text-xs text-slate-500">
        標號
        <input
          value={tag ?? ''}
          onChange={(e) => update({ tag: e.target.value || undefined }, 'tag')}
          placeholder="例如 1V1、1A1"
          className={inputClass}
        />
      </label>

      <section>
        <h3 className={sectionTitle}>產品（型號）</h3>
        <select value={ref?.id ?? ''} onChange={(e) => assign(e.target.value)} className={inputClass.replace('mt-0.5 ', '')} aria-label="指定產品">
          <option value="">（未指定）</option>
          {ref && !product && <option value={ref.id}>{ref.modelCode}（已不在產品庫）</option>}
          {candidates.same.length > 0 && (
            <optgroup label={`功能為「${def.label}」的產品`}>
              {candidates.same.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.modelCode}
                  {p.name ? `　${p.name}` : ''}
                </option>
              ))}
            </optgroup>
          )}
          {candidates.others.length > 0 && (
            <optgroup label="其他產品（會一併改變元件類型）">
              {candidates.others.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.modelCode}（{pneumaticTypeLabel(effectivePneumatic(p)!.type)}）
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {ref && !product && <p className="mt-1 text-[11px] text-slate-400">這個產品已從產品庫刪除，仍保留型號供 BOM 使用。</p>}
        {product && productPn && productPn.type !== componentType && (
          <div className="mt-1.5 rounded-md bg-amber-50 p-2 text-[11px] leading-4 text-amber-900">
            產品功能為「{pneumaticTypeLabel(productPn.type)}」，與目前元件不同。
            {isCircuitType(productPn.type) && interchangeableTypes(componentType).includes(productPn.type) && (
              <button type="button" className="ml-1 underline" onClick={() => changeType(node.id, productPn.type)}>
                改成產品的類型
              </button>
            )}
          </div>
        )}
        {product && (
          <button type="button" onClick={() => setEditProduct(product)} className="mt-1 text-[11px] text-blue-700 hover:underline">
            編輯「{productLabel(product)}」的氣動功能…
          </button>
        )}
      </section>

      {def.params && def.params.length > 0 && (
        <section>
          <h3 className={sectionTitle}>參數</h3>
          <div className="grid grid-cols-2 gap-2">
            {def.params.map((p) => (
              <ParamInput key={p.key} def={p} value={params?.[p.key]} onChange={(raw) => setParam(p.key, raw)} />
            ))}
          </div>
          {def.category === 'actuator' && <CylinderInfo params={params} type={componentType} />}
        </section>
      )}

      <label className="block text-xs text-slate-500">
        標號位置
        <select
          value={labelSide ?? ''}
          onChange={(e) => update({ labelSide: (e.target.value || undefined) as PneumaticFlowNode['data']['labelSide'] })}
          className="mt-0.5 h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-800"
        >
          <option value="">自動（沒有埠的一側）</option>
          <option value="left">左</option>
          <option value="right">右</option>
          <option value="top">上</option>
          <option value="bottom">下</option>
        </select>
      </label>

      <label className="block text-xs text-slate-500">
        備註
        <textarea
          value={note ?? ''}
          onChange={(e) => update({ note: e.target.value || undefined }, 'note')}
          rows={2}
          className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-800"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={rotateSelected}>
          旋轉 90°
        </Button>
        <Button size="sm" onClick={flipSelected}>
          鏡射
        </Button>
        <Button size="sm" onClick={duplicateSelected}>
          複製一份
        </Button>
        <Button size="sm" variant="danger" onClick={deleteSelected}>
          刪除
        </Button>
      </div>

      {editProduct && <PneumaticFunctionDialog product={editProduct} onClose={() => setEditProduct(undefined)} />}
    </div>
  )
}

/** 缸徑推算的理論推力（以 0.5 MPa 為例） */
function CylinderInfo({ params, type }: { params: PneumaticFlowNode['data']['params']; type: string }) {
  const p = resolveParams(registry.get(type), params)
  const bore = numParam(p, 'bore', 32)
  const rod = numParam(p, 'rod', 0) || defaultRodDiameter(bore)
  const push = cylinderForce(0.5, bore, rod, 'extend')
  const pull = cylinderForce(0.5, bore, rod, 'retract')
  return (
    <p className="mt-2 rounded-md bg-slate-50 p-2 text-[11px] leading-4 text-slate-600">
      理論推力（0.5 MPa）：伸出 {push.toFixed(0)} N、縮回 {pull.toFixed(0)} N
      <br />
      （缸徑 Ø{bore}、桿徑 Ø{rod}；實際可用約為理論值的 50–70%）
    </p>
  )
}

function NoteInspector({ node }: { node: NoteFlowNode }) {
  const updateNote = useCircuitStore((s) => s.updateNote)
  const deleteSelected = useCircuitStore((s) => s.deleteSelected)
  return (
    <div className="space-y-3 p-3">
      <label className="block text-xs text-slate-500">
        註解文字
        <textarea
          value={node.data.text}
          onChange={(e) => updateNote(node.id, e.target.value)}
          rows={5}
          className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-800"
        />
      </label>
      <Button size="sm" variant="danger" onClick={deleteSelected}>
        刪除註解
      </Button>
    </div>
  )
}

// ---------------- 沒有選取：電路資訊、檢查、BOM ----------------

const LEVEL_STYLE: Record<CheckLevel, string> = {
  error: 'border-red-200 bg-red-50 text-red-800',
  warn: 'border-amber-200 bg-amber-50 text-amber-900',
  info: 'border-slate-200 bg-slate-50 text-slate-600',
}
const LEVEL_TEXT: Record<CheckLevel, string> = { error: '錯誤', warn: '注意', info: '提示' }

function CircuitInfoPanel() {
  const { info, stored, dirty, view, nodes, edges, setInfo, setView, selectOnly } = useCircuitStore(
    useShallow((s) => ({
      info: s.info,
      stored: s.stored,
      dirty: s.dirty,
      view: s.view,
      nodes: s.nodes,
      edges: s.edges,
      setInfo: s.setInfo,
      setView: s.setView,
      selectOnly: s.selectOnly,
    })),
  )
  const products = useLibraryStore((s) => s.products)
  const notify = useCircuitUi((s) => s.notify)
  const openDialog = useCircuitUi((s) => s.openDialog)
  const { fitView } = useReactFlow()
  const checks = useMemo(() => checkCircuit(nodes, edges, products), [nodes, edges, products])
  const bom = useMemo(() => buildCircuitBom(nodes, products), [nodes, products])
  const total = bomTotal(bom)

  const focus = (ids: string[]) => {
    if (!ids.length) return
    selectOnly(ids)
    void fitView({ nodes: ids.map((id) => ({ id })), padding: 0.6, maxZoom: 1.4, duration: 300 })
  }

  const save = async () => {
    if (!stored) {
      openDialog('saveAs')
      return
    }
    try {
      await saveCircuit()
      notify('已儲存')
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'error')
    }
  }

  return (
    <div className="space-y-5 p-3">
      <section className="space-y-2">
        <h3 className={sectionTitle}>電路資訊</h3>
        <label className="block text-xs text-slate-500">
          名稱
          <input value={info.name} onChange={(e) => setInfo({ name: e.target.value })} className={inputClass} />
        </label>
        <label className="block text-xs text-slate-500">
          客戶
          <input
            value={info.customer ?? ''}
            onChange={(e) => setInfo({ customer: e.target.value || undefined })}
            className={inputClass}
          />
        </label>
        <label className="block text-xs text-slate-500">
          備註
          <textarea
            value={info.notes ?? ''}
            onChange={(e) => setInfo({ notes: e.target.value || undefined })}
            rows={2}
            className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-800"
          />
        </label>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className={dirty || !stored ? 'text-amber-700' : 'text-emerald-700'}>
            {!stored ? '尚未存進電路清單' : dirty ? '有未儲存的變更' : '已儲存'}
          </span>
          <Button size="sm" variant="primary" onClick={() => void save()}>
            {stored ? '儲存' : '儲存到電路清單…'}
          </Button>
        </div>
      </section>

      <section>
        <h3 className={sectionTitle}>檢查（{checks.filter((c) => c.level !== 'info').length}）</h3>
        {checks.length === 0 ? (
          <p className="text-xs text-slate-500">{nodes.length ? '沒有發現問題。' : '加入元件後會在這裡列出檢查結果。'}</p>
        ) : (
          <ul className="space-y-1.5" aria-label="檢查結果">
            {checks.map((c, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => focus(c.nodeIds)}
                  className={`w-full rounded-md border px-2 py-1.5 text-left text-xs leading-4 ${LEVEL_STYLE[c.level]} ${c.nodeIds.length ? 'hover:brightness-95' : 'cursor-default'}`}
                >
                  <span className="mr-1 font-semibold">{LEVEL_TEXT[c.level]}</span>
                  {c.text}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <header className="mb-1.5 flex items-center justify-between">
          <h3 className={sectionTitle.replace('mb-1.5 ', '')}>BOM（{bom.reduce((n, r) => n + r.quantity, 0)} 件）</h3>
          <Button size="sm" variant="ghost" disabled={!bom.length} onClick={exportCircuitBom}>
            匯出 CSV
          </Button>
        </header>
        {bom.length === 0 ? (
          <p className="text-xs text-slate-500">還沒有元件。</p>
        ) : (
          <table className="w-full text-xs" aria-label="迴路 BOM">
            <tbody>
              {bom.map((r) => (
                <tr key={r.index} className="border-b border-slate-100 align-top">
                  <td className="py-1 pr-1 text-slate-400">{r.index}</td>
                  <td className="py-1 pr-1">
                    {r.modelCode ? <span className="font-mono text-slate-800">{r.modelCode}</span> : <span className="text-slate-500">{r.name}</span>}
                    {r.tags.length > 0 && <span className="block text-[10px] text-slate-400">{r.tags.join(' ')}</span>}
                  </td>
                  <td className="py-1 text-right tabular-nums text-slate-700">×{r.quantity}</td>
                  {total !== undefined && (
                    <td className="py-1 pl-1 text-right tabular-nums text-slate-500">
                      {r.price !== undefined ? formatMoney(r.price * r.quantity) : '—'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {total !== undefined && <p className="mt-1 text-right text-xs font-semibold text-slate-700">合計 {formatMoney(total)}</p>}
      </section>

      <section className="space-y-2">
        <h3 className={sectionTitle}>顯示</h3>
        <div className="flex items-center justify-between text-xs text-slate-600">
          <span>埠代號</span>
          <span className="flex rounded-md bg-slate-100 p-0.5">
            {(
              [
                ['letter', '字母 P A B'],
                ['iso', '數字 1 4 2'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                aria-pressed={view.portLabels === mode}
                onClick={() => setView({ portLabels: mode })}
                className={`rounded px-2 py-0.5 ${view.portLabels === mode ? 'bg-white shadow-sm' : 'text-slate-500'}`}
              >
                {label}
              </button>
            ))}
          </span>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={view.showTags} onChange={(e) => setView({ showTags: e.target.checked })} />
          在符號旁顯示標號與型號
        </label>
      </section>
    </div>
  )
}

// ---------------- 模擬中：監看與即時調整 ----------------

function SimMonitor() {
  const { circuit, nodes, sim, setLiveParam } = useCircuitStore(
    useShallow((s) => ({ circuit: s.circuit, nodes: s.nodes, sim: s.sim, setLiveParam: s.setLiveParam })),
  )
  const byId = new Map(nodes.filter(isPneumaticNode).map((n) => [n.id, n]))
  const rows = circuit.nodes.flatMap((cn) => {
    const node = byId.get(cn.id)
    return node ? [{ cn, node, def: registry.get(cn.type), params: resolveParams(registry.get(cn.type), cn.params) }] : []
  })
  const actuators = rows.filter((r) => r.def.category === 'actuator')
  const gauges = rows.filter((r) => r.cn.type === 'pressureGauge')
  const adjustable = rows.filter((r) => r.def.params?.some((p) => p.live))

  return (
    <div className="space-y-5 p-3">
      <p className="text-xs leading-5 text-slate-500">模擬中：點擊閥門或電磁線圈切換。這裡可即時調整節流開度與設定壓力。</p>
      {actuators.length > 0 && (
        <section>
          <h3 className={sectionTitle}>致動器</h3>
          <ul className="space-y-2">
            {actuators.map(({ cn, node, params }) => {
              const piston = (sim.componentStates[cn.id] as CylinderState | undefined)?.piston ?? 0
              const pa = sim.pressure[portKey(cn.id, 'A')] ?? 0
              const pb = sim.pressure[portKey(cn.id, 'B')] ?? 0
              const bore = numParam(params, 'bore', 32)
              const rod = numParam(params, 'rod', 0) || defaultRodDiameter(bore)
              const force = pa > pb ? cylinderForce(pa, bore, rod, 'extend') : pb > 0 ? cylinderForce(pb, bore, rod, 'retract') : 0
              return (
                <li key={cn.id} className="rounded-md border border-slate-200 p-2 text-xs">
                  <div className="flex justify-between">
                    <span className="font-semibold text-slate-700">{nodeTitle(node)}</span>
                    <span className="tabular-nums text-slate-600" data-piston={cn.id}>
                      {(piston * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${piston * 100}%` }} />
                  </div>
                  {force > 0 && (
                    <p className="mt-1 text-slate-500">
                      理論{pa > pb ? '推力' : '拉力'} {force.toFixed(0)} N（{Math.max(pa, pb).toFixed(2)} MPa）
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}
      {gauges.length > 0 && (
        <section>
          <h3 className={sectionTitle}>壓力錶</h3>
          <ul className="space-y-1 text-xs">
            {gauges.map(({ cn, node }) => (
              <li key={cn.id} className="flex justify-between">
                <span>{nodeTitle(node)}</span>
                <span className="tabular-nums">{(sim.pressure[portKey(cn.id, 'P')] ?? 0).toFixed(2)} MPa</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {adjustable.length > 0 && (
        <section>
          <h3 className={sectionTitle}>即時調整</h3>
          <ul className="space-y-3">
            {adjustable.map(({ cn, node, def, params }) =>
              def.params!
                .filter((p) => p.live)
                .map((p) => {
                  const value = numParam(params, p.key, Number(p.default))
                  return (
                    <li key={`${cn.id}:${p.key}`} className="text-xs">
                      <label className="block">
                        <span className="flex justify-between gap-2 text-slate-600">
                          <span className="truncate">
                            <span className="font-semibold text-slate-700">{node.data.tag ?? def.label}</span>
                            <span className="ml-1">{p.label}</span>
                          </span>
                          <span className="tabular-nums">
                            {value}
                            {p.unit}
                          </span>
                        </span>
                        <input
                          type="range"
                          min={p.min}
                          max={p.max}
                          step={p.step}
                          value={value}
                          onChange={(e) => setLiveParam(cn.id, p.key, Number(e.target.value))}
                          className="w-full"
                          aria-label={`${nodeTitle(node)} ${p.label}`}
                        />
                      </label>
                    </li>
                  )
                }),
            )}
          </ul>
        </section>
      )}
    </div>
  )
}

export function CircuitInspector() {
  const open = useCircuitUi((s) => s.inspectorOpen)
  const simulating = useCircuitStore((s) => s.status !== 'idle')
  const selectedIds = useCircuitStore(useShallow((s) => s.nodes.filter((n) => n.selected).map((n) => n.id)))
  const selectedNode = useCircuitStore((s) => (selectedIds.length === 1 ? s.nodes.find((n) => n.id === selectedIds[0]) : undefined))
  const selectedEdges = useCircuitStore((s) => s.edges.filter((e) => e.selected).length)
  const deleteSelected = useCircuitStore((s) => s.deleteSelected)
  const rotateSelected = useCircuitStore((s) => s.rotateSelected)
  const duplicateSelected = useCircuitStore((s) => s.duplicateSelected)

  let body
  if (simulating) body = <SimMonitor />
  else if (selectedNode && isPneumaticNode(selectedNode)) body = <NodeInspector key={selectedNode.id} node={selectedNode} />
  else if (selectedNode && selectedNode.type === 'note') body = <NoteInspector key={selectedNode.id} node={selectedNode} />
  else if (selectedIds.length > 1 || selectedEdges > 0)
    body = (
      <div className="space-y-3 p-3 text-sm text-slate-600">
        <p>
          已選取 {selectedIds.length} 個元件{selectedEdges ? `、${selectedEdges} 條管線` : ''}。
        </p>
        <div className="flex flex-wrap gap-2">
          {selectedIds.length > 0 && (
            <>
              <Button size="sm" onClick={rotateSelected}>
                旋轉 90°
              </Button>
              <Button size="sm" onClick={duplicateSelected}>
                複製一份
              </Button>
            </>
          )}
          <Button size="sm" variant="danger" onClick={deleteSelected}>
            刪除
          </Button>
        </div>
      </div>
    )
  else body = <CircuitInfoPanel />

  return (
    <aside
      className={`${open ? 'flex' : 'hidden'} absolute inset-y-0 right-0 z-20 w-80 max-w-full flex-col border-l border-slate-200 bg-white shadow-xl lg:static lg:z-auto lg:flex lg:w-72 lg:shrink-0 lg:shadow-none`}
      aria-label="迴路屬性"
    >
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-slate-200 px-3">
        <h2 className="text-sm font-semibold text-slate-700">
          {simulating ? '模擬監看' : selectedNode ? '元件屬性' : selectedIds.length > 1 ? '多選' : '迴路'}
        </h2>
        <button
          type="button"
          className="rounded p-1 text-slate-400 hover:bg-slate-100 lg:hidden"
          onClick={() => useCircuitUi.getState().toggleInspector(false)}
          aria-label="關閉屬性面板"
        >
          ✕
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
    </aside>
  )
}
