import { useReactFlow } from '@xyflow/react'
import { useMemo, useState, type DragEvent } from 'react'
import { useLibraryStore } from '../catalog/library'
import { effectivePneumatic, FITTING_TYPE, isCircuitType, MANIFOLD_TYPE } from '../catalog/pneumatic'
import { CATEGORY_LABEL, productLabel, type Product } from '../catalog/types'
import { registry, type ComponentCategory, type Params } from '../engine'
import { useCircuitStore, type AddOptions } from '../store/circuitStore'
import { COMPONENT_DRAG_MIME, type ComponentDragPayload } from './canvasConfig'
import { NoteIcon } from './icons'
import { NewProductDialog } from './NewProductDialog'
import { findFreeSpot } from './placement'
import { PneumaticFunctionDialog } from './PneumaticFunctionEditor'
import { SymbolPreview } from './SymbolPreview'
import { getSymbol } from './symbols/symbolRegistry'

const CATEGORY_LABELS: Record<ComponentCategory, string> = {
  source: '氣源與氣源處理',
  valve: '方向控制閥',
  flow: '流量控制',
  actuator: '致動器',
  misc: '其他',
}
const CATEGORY_ORDER: ComponentCategory[] = ['source', 'valve', 'flow', 'actuator', 'misc']

type Tab = 'components' | 'products'
const TAB_KEY = 'pneumatic-circuit:palette-tab'

function readTab(): Tab {
  try {
    return localStorage.getItem(TAB_KEY) === 'products' ? 'products' : 'components'
  } catch {
    return 'components'
  }
}

const matches = (query: string, ...texts: (string | undefined)[]) => {
  const q = query.trim().toLowerCase()
  return !q || texts.some((t) => t?.toLowerCase().includes(q))
}

/** 點一下：放到畫面中央（觸控裝置不支援 HTML5 拖放，這是主要的放置方式） */
function useAddAtCenter() {
  const { screenToFlowPosition } = useReactFlow()
  const addComponent = useCircuitStore((s) => s.addComponent)
  return (type: string, options?: AddOptions) => {
    const rect = document.querySelector('.react-flow')?.getBoundingClientRect()
    if (!rect) return
    const { width, height } = getSymbol(type)
    const center = screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
    // 放在畫面中央附近、不會蓋到其他元件的位置
    const spot = findFreeSpot({ x: center.x - width / 2, y: center.y - height / 2 }, { width, height }, useCircuitStore.getState().nodes)
    addComponent(type, spot, options)
  }
}

function startDrag(e: DragEvent, payload: ComponentDragPayload) {
  e.dataTransfer.setData(COMPONENT_DRAG_MIME, JSON.stringify(payload))
  e.dataTransfer.effectAllowed = 'copy'
}

const itemClass =
  'flex w-28 shrink-0 cursor-grab flex-col items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-2 text-xs text-slate-700 transition hover:border-blue-400 hover:bg-blue-50 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40 md:w-full'

function ComponentList({ query, editing }: { query: string; editing: boolean }) {
  const addAtCenter = useAddAtCenter()
  const { screenToFlowPosition } = useReactFlow()
  const addNote = useCircuitStore((s) => s.addNote)
  const [collapsed, setCollapsed] = useState<Partial<Record<ComponentCategory, boolean>>>({})

  const addNoteAtCenter = () => {
    const rect = document.querySelector('.react-flow')?.getBoundingClientRect()
    if (!rect) return
    const center = screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
    addNote(findFreeSpot({ x: center.x - 60, y: center.y - 20 }, { width: 120, height: 40 }, useCircuitStore.getState().nodes))
  }

  return (
    <>
      {CATEGORY_ORDER.map((category) => {
        const defs = registry.list().filter((d) => d.category === category && !d.hidden && matches(query, d.label, d.type))
        if (defs.length === 0) return null
        const isCollapsed = !query && collapsed[category]
        return (
          <section key={category} className="flex shrink-0 gap-2 md:flex-col">
            <button
              type="button"
              onClick={() => setCollapsed((c) => ({ ...c, [category]: !c[category] }))}
              className="hidden items-center justify-between text-left text-xs text-slate-400 hover:text-slate-600 md:flex"
              aria-expanded={!isCollapsed}
            >
              <span>{CATEGORY_LABELS[category]}</span>
              <span aria-hidden>{isCollapsed ? '＋' : '－'}</span>
            </button>
            {!isCollapsed &&
              defs.map((def) => (
                <button
                  key={def.type}
                  type="button"
                  draggable={editing}
                  disabled={!editing}
                  onDragStart={(e) => startDrag(e, { type: def.type })}
                  onClick={() => addAtCenter(def.type)}
                  className={itemClass}
                  title={`${def.label}：拖拉到畫布，或點一下加入`}
                  data-component={def.type}
                >
                  <SymbolPreview type={def.type} />
                  <span className="text-center leading-tight">{def.label}</span>
                </button>
              ))}
          </section>
        )
      })}
      {matches(query, '文字註解', '註解', 'note') && (
        <section className="flex shrink-0 gap-2 md:flex-col">
          <h3 className="hidden text-xs text-slate-400 md:block">標註</h3>
          <button type="button" disabled={!editing} onClick={addNoteAtCenter} className={itemClass} title="在畫布中央加入文字註解">
            <span className="flex h-10 items-center text-slate-500">
              <NoteIcon />
            </span>
            <span>文字註解</span>
          </button>
        </section>
      )}
    </>
  )
}

interface ProductEntry {
  product: Product
  type?: string
  inferred: boolean
  params?: Params
}

function ProductList({ query, editing }: { query: string; editing: boolean }) {
  const products = useLibraryStore((s) => s.products)
  const thumbs = useLibraryStore((s) => s.thumbs)
  const status = useLibraryStore((s) => s.status)
  const error = useLibraryStore((s) => s.error)
  const addAtCenter = useAddAtCenter()
  const [setup, setSetup] = useState<Product | undefined>()
  const [creating, setCreating] = useState(false)

  const { usable, unset, passive } = useMemo(() => {
    const usable: ProductEntry[] = []
    const unset: ProductEntry[] = []
    const passive: ProductEntry[] = []
    const all = Object.values(products).sort(
      (a, b) => a.category.localeCompare(b.category) || a.modelCode.localeCompare(b.modelCode, 'zh-Hant'),
    )
    for (const product of all) {
      const pn = effectivePneumatic(product)
      const entry: ProductEntry = { product, type: pn?.type, inferred: !!pn?.inferred, params: pn?.params }
      if (isCircuitType(pn?.type)) usable.push(entry)
      else if (pn?.type === FITTING_TYPE || pn?.type === MANIFOLD_TYPE) passive.push(entry)
      else unset.push(entry)
    }
    return { usable, unset, passive }
  }, [products])

  const options = (entry: ProductEntry): AddOptions => ({
    product: { id: entry.product.id, modelCode: entry.product.modelCode, name: entry.product.name },
    params: entry.params,
  })

  const total = usable.length + unset.length + passive.length
  if (error) return <p className="w-64 shrink-0 p-2 text-xs leading-5 text-red-700 md:w-auto">{error}</p>
  if (status !== 'ready' && total === 0) {
    return <p className="p-2 text-xs text-slate-500">讀取產品庫…</p>
  }
  const newProduct = (
    <>
      <button
        type="button"
        disabled={!editing}
        onClick={() => setCreating(true)}
        className="w-28 shrink-0 rounded-md border border-dashed border-slate-300 px-2 py-1.5 text-xs text-slate-600 hover:border-blue-400 hover:bg-blue-50 disabled:opacity-40 md:w-full"
      >
        ＋ 新增產品（無 3D 檔）
      </button>
      {creating && (
        <NewProductDialog
          onClose={() => setCreating(false)}
          onCreated={(product) => {
            const pn = effectivePneumatic(product)
            if (pn && isCircuitType(pn.type)) {
              addAtCenter(pn.type, { product: { id: product.id, modelCode: product.modelCode, name: product.name }, params: pn.params })
            }
          }}
        />
      )}
    </>
  )

  if (total === 0) {
    return (
      <>
        <div className="w-64 shrink-0 space-y-2 p-1 text-xs leading-5 text-slate-500 md:w-auto">
          <p>產品庫是空的。</p>
          <p>
            到「模組組立」匯入公司產品的 3D 檔（STEP／IGES）或安裝範例產品，這裡就會出現可以放進迴路圖的產品；
            也可以先只建型號。
          </p>
          <a href="#/module" className="inline-block rounded-md bg-blue-600 px-2.5 py-1 font-medium text-white hover:bg-blue-500">
            前往模組組立
          </a>
        </div>
        {newProduct}
      </>
    )
  }

  const shown = (list: ProductEntry[]) =>
    list.filter((e) => matches(query, e.product.modelCode, e.product.name, e.product.notes, CATEGORY_LABEL[e.product.category]))

  return (
    <>
      {shown(usable).map((entry) => (
        <button
          key={entry.product.id}
          type="button"
          draggable={editing}
          disabled={!editing}
          onDragStart={(e) =>
            startDrag(e, { type: entry.type!, productId: entry.product.id })
          }
          onClick={() => addAtCenter(entry.type!, options(entry))}
          className={`${itemClass} relative`}
          title={`${productLabel(entry.product)}（${registry.get(entry.type!).label}）：拖拉到畫布，或點一下加入`}
          data-product={entry.product.modelCode}
        >
          {thumbs[entry.product.source.sha256] && (
            <img
              src={thumbs[entry.product.source.sha256]}
              alt=""
              className="absolute top-1 right-1 h-6 w-8 rounded border border-slate-200 bg-white object-contain"
            />
          )}
          <SymbolPreview type={entry.type!} params={entry.params} />
          <span className="w-full truncate text-center font-mono text-[11px] font-semibold text-slate-800">
            {entry.product.modelCode}
          </span>
          <span className="w-full truncate text-center text-[11px] text-slate-500">
            {entry.product.name || registry.get(entry.type!).label}
          </span>
          {entry.inferred && <span className="rounded bg-sky-100 px-1 text-[10px] text-sky-700">自動判斷</span>}
        </button>
      ))}
      {shown(unset).map((entry) => (
        <button
          key={entry.product.id}
          type="button"
          disabled={!editing}
          onClick={() => setSetup(entry.product)}
          className={`${itemClass} border-dashed`}
          title="還沒設定這個產品在迴路圖中是哪種元件：點一下設定"
          data-product={entry.product.modelCode}
        >
          <span className="flex h-10 items-center text-lg text-slate-300">?</span>
          <span className="w-full truncate text-center font-mono text-[11px] font-semibold text-slate-800">
            {entry.product.modelCode}
          </span>
          <span className="rounded bg-amber-100 px-1 text-[10px] text-amber-800">設定氣動功能</span>
        </button>
      ))}
      {passive.length > 0 && !query && (
        <p className="w-40 shrink-0 self-center text-[11px] leading-4 text-slate-400 md:w-auto">
          另有 {passive.length} 個接頭／集裝座：迴路圖以管線表示，不需要放置。
        </p>
      )}
      {newProduct}
      {setup && (
        <PneumaticFunctionDialog
          product={setup}
          saveLabel="儲存並加入迴路圖"
          onClose={() => setSetup(undefined)}
          onSaved={(saved) => {
            const pn = effectivePneumatic(saved)
            if (pn && isCircuitType(pn.type)) {
              addAtCenter(pn.type, {
                product: { id: saved.id, modelCode: saved.modelCode, name: saved.name },
                params: pn.params,
              })
            }
          }}
        />
      )}
    </>
  )
}

export function Palette() {
  const editing = useCircuitStore((s) => s.status === 'idle')
  const productCount = useLibraryStore((s) => Object.keys(s.products).length)
  const [tab, setTab] = useState<Tab>(readTab)
  const [query, setQuery] = useState('')

  const choose = (next: Tab) => {
    setTab(next)
    try {
      localStorage.setItem(TAB_KEY, next)
    } catch {
      /* 略過 */
    }
  }

  const tabClass = (active: boolean) =>
    `flex-1 rounded px-2 py-1 text-xs font-medium whitespace-nowrap ${active ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`

  return (
    <aside className="flex shrink-0 flex-col border-slate-200 bg-white md:w-56 md:border-r" aria-label="元件面板">
      <div className="flex items-center gap-2 px-2 pt-2 md:flex-col md:items-stretch md:px-3 md:pt-3">
        <div className="flex shrink-0 rounded-md bg-slate-100 p-0.5" role="tablist" aria-label="元件來源">
          <button type="button" role="tab" aria-selected={tab === 'components'} onClick={() => choose('components')} className={tabClass(tab === 'components')}>
            元件
          </button>
          <button type="button" role="tab" aria-selected={tab === 'products'} onClick={() => choose('products')} className={tabClass(tab === 'products')}>
            產品庫{productCount ? `（${productCount}）` : ''}
          </button>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tab === 'products' ? '搜尋型號、名稱' : '搜尋元件'}
          aria-label="搜尋"
          className="h-8 min-w-0 flex-1 rounded-md border border-slate-300 px-2 text-sm md:flex-none"
        />
      </div>
      <div className="flex gap-2 overflow-x-auto p-2 md:flex-col md:overflow-y-auto md:p-3 md:pt-2">
        {tab === 'components' ? <ComponentList query={query} editing={editing} /> : <ProductList query={query} editing={editing} />}
      </div>
      {!editing && <p className="hidden px-3 pb-3 text-xs text-slate-500 md:block">模擬中無法編輯，請先按「重置」。</p>}
    </aside>
  )
}
