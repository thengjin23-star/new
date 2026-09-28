import { useMemo, useState } from 'react'
import { bomColumns, bomTotal, buildBom } from '../assembly/bom'
import { formatMoney } from '../utils/money'
import { suggestPartners } from '../assembly/memory'
import { getPort, mateChecks, mateRotation, usedPorts } from '../assembly/moduleOps'
import { useLibraryStore } from '../catalog/library'
import { effectivePneumatic, isCircuitType, pneumaticTypeLabel } from '../catalog/pneumatic'
import { CATEGORY_LABEL, hasModel, type Product, type ProductCategory } from '../catalog/types'
import { PneumaticFunctionDialog } from '../components/PneumaticFunctionEditor'
import { SymbolPreview } from '../components/SymbolPreview'
import { formatSpec, type MateLevel } from '../threads'
import { portLabel } from './labels'
import { useModuleStore } from './moduleStore'
import { LEVEL_COLOR } from '../components/levels'
import { Button, Dialog, Empty, LevelBadge } from '../components/ui'

type Tab = 'part' | 'check' | 'bom'

export function Inspector() {
  const [tab, setTab] = useState<Tab>('part')
  const doc = useModuleStore((s) => s.doc)
  const products = useModuleStore((s) => s.products)
  const checks = useMemo(() => mateChecks(doc, products), [doc, products])
  const problems = checks.filter((c) => c.result.level === 'error' || c.result.level === 'warn').length

  const tabs: { id: Tab; label: string }[] = [
    { id: 'part', label: '零件' },
    { id: 'check', label: `檢查${checks.length ? `（${checks.length}）` : ''}` },
    { id: 'bom', label: 'BOM' },
  ]
  const open = useModuleStore((s) => s.drawer === 'inspector')
  return (
    <aside
      className={`${open ? 'flex' : 'hidden'} absolute inset-y-0 right-0 z-20 w-80 max-w-full flex-col border-l border-slate-200 bg-white shadow-xl lg:static lg:z-auto lg:flex lg:shrink-0 lg:shadow-none`}
      aria-label="屬性"
    >
      <nav className="flex border-b border-slate-200" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`relative flex-1 py-2.5 text-sm font-medium ${tab === t.id ? 'border-b-2 border-blue-600 text-blue-700' : 'text-slate-500 hover:text-slate-800'}`}
          >
            {t.label}
            {t.id === 'check' && problems > 0 && (
              <span className="ml-1 rounded-full bg-red-600 px-1.5 text-[10px] text-white">{problems}</span>
            )}
          </button>
        ))}
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'part' && <PartTab />}
        {tab === 'check' && <CheckTab />}
        {tab === 'bom' && <BomTab />}
      </div>
    </aside>
  )
}

// ---------------- 零件 ----------------

function PartTab() {
  const selected = useModuleStore((s) => s.selected)
  const doc = useModuleStore((s) => s.doc)
  const products = useModuleStore((s) => s.products)
  const mode = useModuleStore((s) => s.mode)
  const setMode = useModuleStore((s) => s.setMode)
  const removeSelected = useModuleStore((s) => s.removeSelected)
  const inst = doc.instances.find((i) => i.id === selected)
  const product = inst && products[inst.productId]
  if (!inst || !product) {
    return (
      <Empty>
        點選 3D 畫面中的零件，就能在這裡編輯型號、名稱與埠。
        <br />
        點選零件上的<strong>埠（箭頭或標籤）</strong>開始連接。
      </Empty>
    )
  }
  return (
    <div className="space-y-4 p-3">
      <ProductForm key={product.id} product={product} />
      <PneumaticSection product={product} />
      <section>
        <header className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">埠（{product.ports.length}）</h3>
          <Button size="sm" variant={mode === 'define-port' ? 'primary' : 'default'} onClick={() => setMode(mode === 'define-port' ? 'select' : 'define-port')}>
            {mode === 'define-port' ? '完成新增' : '＋ 新增埠'}
          </Button>
        </header>
        {mode === 'define-port' && (
          <p className="mb-2 rounded-md bg-blue-50 p-2 text-xs leading-5 text-blue-800">
            在 3D 畫面點選零件上的<strong>孔、凸柱或平面</strong>，系統會自動抓出位置、方向與直徑，並建議規格。
          </p>
        )}
        {product.ports.length === 0 && mode !== 'define-port' && (
          <p className="text-xs leading-5 text-slate-500">這個產品還沒有定義任何埠。按「新增埠」後點選模型上的孔即可。</p>
        )}
        <ul className="space-y-1.5">
          {product.ports.map((p) => (
            <PortRow key={p.id} instanceId={inst.id} product={product} portId={p.id} />
          ))}
        </ul>
      </section>
      <PartActions instanceId={inst.id} product={product} />
      <Button variant="danger" size="sm" onClick={removeSelected}>
        從模組移除這個零件
      </Button>
    </div>
  )
}

/** 零件的快速操作：自動配上常用零件、更換零件、複製 */
function PartActions({ instanceId, product }: { instanceId: string; product: Product }) {
  const doc = useModuleStore((s) => s.doc)
  const products = useModuleStore((s) => s.products)
  const stats = useModuleStore((s) => s.stats)
  const autoFill = useModuleStore((s) => s.autoFill)
  const duplicateSelected = useModuleStore((s) => s.duplicateSelected)
  const [replacing, setReplacing] = useState(false)
  // 有幾個空著的埠有搭配記錄
  const fillable = useMemo(() => {
    const used = usedPorts(doc)
    return product.ports.filter(
      (port) =>
        !used.has(`${instanceId}:${port.id}`) &&
        suggestPartners({ product, port }, Object.values(products), stats).some((sug) => sug.score > 0),
    ).length
  }, [doc, products, stats, product, instanceId])
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={fillable ? 'primary' : 'default'}
          disabled={!fillable}
          onClick={() => void autoFill(instanceId)}
          title={fillable ? '依以前的搭配記錄，把空著的埠一次接上常用的接頭、消音器等' : '空著的埠還沒有搭配記錄'}
        >
          自動配上常用零件{fillable ? `（${fillable}）` : ''}
        </Button>
        <Button size="sm" onClick={() => setReplacing(true)}>
          更換零件…
        </Button>
        <Button size="sm" onClick={() => void duplicateSelected()}>
          複製
        </Button>
      </div>
      {replacing && <ReplaceDialog instanceId={instanceId} current={product} onClose={() => setReplacing(false)} />}
    </section>
  )
}

/** 更換零件：同類別的產品排在前面 */
function ReplaceDialog({ instanceId, current, onClose }: { instanceId: string; current: Product; onClose: () => void }) {
  const products = useModuleStore((s) => s.products)
  const thumbs = useLibraryStore((s) => s.thumbs)
  const replace = useModuleStore((s) => s.replaceInstanceProduct)
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const list = Object.values(products)
    .filter((p) => p.id !== current.id && hasModel(p))
    .filter((p) => !q || `${p.modelCode} ${p.name} ${p.maker ?? ''}`.toLowerCase().includes(q))
    .sort((a, b) => Number(b.category === current.category) - Number(a.category === current.category) || a.modelCode.localeCompare(b.modelCode))
  return (
    <Dialog title={`更換「${current.modelCode}」`} onClose={onClose} footer={<Button onClick={onClose}>取消</Button>}>
      <p className="mb-2 text-xs leading-5 text-slate-500">原本的鎖合會對應到新產品同名或規格相容的埠；對應不到的會拆開。</p>
      <input
        autoFocus
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="搜尋型號或名稱"
        className="mb-2 h-8 w-full rounded-md border border-slate-300 px-2 text-sm"
      />
      <ul className="max-h-80 space-y-1 overflow-y-auto">
        {list.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              data-replace={p.modelCode}
              onClick={() => {
                void replace(instanceId, p.id)
                onClose()
              }}
              className="flex w-full items-center gap-2 rounded-md border border-slate-200 px-2 py-1 text-left hover:border-blue-400 hover:bg-blue-50"
            >
              <span className="flex h-8 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-slate-50">
                {thumbs[p.source.sha256] && <img src={thumbs[p.source.sha256]} alt="" className="h-full w-full object-contain" />}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-800">{p.modelCode}</span>
                <span className="block truncate text-xs text-slate-500">
                  {[p.name, CATEGORY_LABEL[p.category]].filter(Boolean).join('．')}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  )
}

function ProductForm({ product }: { product: Product }) {
  const updateProduct = useModuleStore((s) => s.updateProduct)
  const [draft, setDraft] = useState({
    modelCode: product.modelCode,
    name: product.name,
    maker: product.maker ?? '',
    series: product.series ?? '',
    price: product.price === undefined ? '' : String(product.price),
    notes: product.notes ?? '',
  })
  const save = (patch: Partial<Product>) => void updateProduct({ ...product, ...patch })
  const field = (key: keyof typeof draft) => ({
    value: draft[key],
    onChange: (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [key]: e.target.value })),
  })
  const commitText = (key: 'name' | 'maker' | 'series' | 'notes') => {
    const value = draft[key].trim()
    if (value === (product[key] ?? '')) return
    save({ [key]: key === 'name' ? value : value || undefined })
  }
  const inputClass = 'mt-0.5 h-8 w-full rounded-md border border-slate-300 px-2 text-sm text-slate-800'
  return (
    <section className="space-y-2">
      <label className="block text-xs text-slate-500">
        型號
        <input
          {...field('modelCode')}
          onBlur={() => draft.modelCode.trim() && draft.modelCode !== product.modelCode && save({ modelCode: draft.modelCode.trim() })}
          className={inputClass}
        />
      </label>
      <label className="block text-xs text-slate-500">
        名稱
        <input {...field('name')} onBlur={() => commitText('name')} placeholder="例如：直通快插接頭" className={inputClass} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs text-slate-500">
          類別
          <select
            value={product.category}
            onChange={(e) => save({ category: e.target.value as ProductCategory })}
            className={inputClass}
          >
            {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-slate-500">
          廠牌
          <input {...field('maker')} onBlur={() => commitText('maker')} placeholder="SMC、AirTAC…" className={inputClass} />
        </label>
        <label className="block text-xs text-slate-500">
          系列
          <input {...field('series')} onBlur={() => commitText('series')} className={inputClass} />
        </label>
        <label className="block text-xs text-slate-500">
          單價（選填）
          <input
            {...field('price')}
            inputMode="decimal"
            onBlur={() => {
              const text = draft.price.trim()
              const price = text === '' ? undefined : Number(text)
              if (price !== undefined && !Number.isFinite(price)) return
              if (price !== product.price) save({ price })
            }}
            className={inputClass}
          />
        </label>
      </div>
      <label className="block text-xs text-slate-500">
        備註
        <textarea
          {...field('notes')}
          onBlur={() => commitText('notes')}
          rows={2}
          className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-800"
        />
      </label>
      <p className="text-[11px] text-slate-400">
        {product.source.bytes > 0
          ? `來源檔案：${product.source.fileName}（${(product.source.bytes / 1024).toFixed(0)} KB）`
          : '這個產品還沒有 3D 檔'}
      </p>
    </section>
  )
}

/** 產品的氣動功能：在迴路圖中是哪一種元件（兩個分頁共用） */
function PneumaticSection({ product }: { product: Product }) {
  const [editing, setEditing] = useState(false)
  const pn = effectivePneumatic(product)
  const mapped = pn ? Object.keys(pn.portMap).length : 0
  return (
    <section className="rounded-md border border-slate-200 p-2">
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-700">氣動功能</h3>
        <Button size="sm" onClick={() => setEditing(true)}>
          {pn ? '編輯' : '設定'}
        </Button>
      </header>
      {pn ? (
        <div className="mt-1.5 flex items-center gap-2">
          {isCircuitType(pn.type) && (
            <div className="h-10 w-14 shrink-0 rounded border border-slate-100 bg-slate-50 p-0.5">
              <SymbolPreview type={pn.type} params={pn.params} className="h-full w-full" />
            </div>
          )}
          <div className="min-w-0 text-xs leading-5 text-slate-600">
            <p className="truncate">{pneumaticTypeLabel(pn.type)}</p>
            <p className="text-slate-400">
              {pn.inferred ? '自動判斷，請確認' : isCircuitType(pn.type) ? `埠對應 ${mapped} 個` : '不畫在迴路圖'}
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-1 text-xs leading-5 text-slate-500">尚未設定：設定後這個產品就能放進「迴路圖」模擬。</p>
      )}
      {editing && <PneumaticFunctionDialog product={product} onClose={() => setEditing(false)} />}
    </section>
  )
}

function PortRow({ instanceId, product, portId }: { instanceId: string; product: Product; portId: string }) {
  const doc = useModuleStore((s) => s.doc)
  const products = useModuleStore((s) => s.products)
  const editPort = useModuleStore((s) => s.editPort)
  const clickPort = useModuleStore((s) => s.clickPort)
  const connectFrom = useModuleStore((s) => s.connectFrom)
  const port = product.ports.find((p) => p.id === portId)!
  const mate = doc.mates.find((m) => [m.parent, m.child].some((r) => r.instance === instanceId && r.port === portId))
  const other = mate && (mate.parent.instance === instanceId && mate.parent.port === portId ? mate.child : mate.parent)
  const isFrom = connectFrom?.instance === instanceId && connectFrom.port === portId
  return (
    <li className={`rounded-md border p-2 ${isFrom ? 'border-blue-400 bg-blue-50' : 'border-slate-200'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-semibold text-slate-800">{port.name}</span>
        {port.spec ? (
          <span className="truncate text-xs text-slate-600">{formatSpec(port.spec)}</span>
        ) : (
          <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-800">未設定規格</span>
        )}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-500">
        <span className="truncate">{other ? `已接：${portLabel(doc, products, other)}` : '未連接'}</span>
        <span className="flex shrink-0 gap-1">
          {!mate && (
            <Button size="sm" variant="ghost" onClick={() => clickPort({ instance: instanceId, port: portId })}>
              {isFrom ? '取消' : '連接'}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => editPort(product.id, portId)}>
            編輯
          </Button>
        </span>
      </div>
    </li>
  )
}

// ---------------- 檢查 ----------------

const ORDER: MateLevel[] = ['error', 'warn', 'unknown', 'ok']

function CheckTab() {
  const doc = useModuleStore((s) => s.doc)
  const products = useModuleStore((s) => s.products)
  const rotateMate = useModuleStore((s) => s.rotateMate)
  const disconnectMate = useModuleStore((s) => s.disconnectMate)
  const select = useModuleStore((s) => s.select)
  const checks = useMemo(
    () => mateChecks(doc, products).sort((a, b) => ORDER.indexOf(a.result.level) - ORDER.indexOf(b.result.level)),
    [doc, products],
  )
  if (checks.length === 0) {
    return <Empty>還沒有連接。點選一個零件的埠，再點選另一個零件的埠，就會檢查螺紋並鎖合。</Empty>
  }
  const count = (level: MateLevel) => checks.filter((c) => c.result.level === level).length
  return (
    <div className="space-y-3 p-3">
      <div className="flex flex-wrap gap-2 text-xs">
        {ORDER.map((l) => count(l) > 0 && (
          <span key={l} className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: LEVEL_COLOR[l] }} />
            {({ ok: '正確', warn: '注意', error: '不相容', unknown: '未檢查' } as const)[l]} {count(l)}
          </span>
        ))}
      </div>
      <ul className="space-y-2">
        {checks.map(({ mate, result }) => {
          const rotation = mateRotation(getPort(doc, products, mate.parent), getPort(doc, products, mate.child))
          const steps = rotation === 'fixed' ? [] : rotation === 'free' ? [-90, -15, 15, 90] : [360 / rotation.steps]
          return (
            <li key={mate.id} className="rounded-md border border-slate-200 p-2 text-xs" data-mate={mate.id}>
              <div className="mb-1 flex items-start justify-between gap-2">
                <button type="button" className="text-left text-slate-700 hover:underline" onClick={() => select(mate.child.instance)}>
                  {portLabel(doc, products, mate.parent)}
                  <br />↔ {portLabel(doc, products, mate.child)}
                </button>
                <LevelBadge level={result.level} />
              </div>
              <p className="font-medium text-slate-800">{result.summary}</p>
              {result.reasons.length > 0 && (
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-500">
                  {result.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-1">
                {steps.length > 0 && <span className="mr-1 text-slate-400">旋轉 {mate.angle}°</span>}
                {steps.map((d) => (
                  <Button key={d} size="sm" onClick={() => rotateMate(mate.id, d)}>
                    {d > 0 ? `+${d}°` : `${d}°`}
                  </Button>
                ))}
                <Button size="sm" variant="danger" className="ml-auto" onClick={() => disconnectMate(mate.id)}>
                  拆開
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ---------------- BOM ----------------

function BomTab() {
  const doc = useModuleStore((s) => s.doc)
  const products = useModuleStore((s) => s.products)
  const downloadBomCsv = useModuleStore((s) => s.downloadBomCsv)
  const rows = useMemo(() => buildBom(doc, products), [doc, products])
  if (rows.length === 0) return <Empty>模組中還沒有零件。</Empty>
  const cols = bomColumns(rows.map((r) => r.product))
  const total = bomTotal(rows.map((r) => ({ price: r.product.price, quantity: r.quantity })))
  return (
    <div className="space-y-3 p-3">
      <table className="w-full text-xs" aria-label="BOM">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="py-1 pr-1">項次</th>
            <th className="py-1 pr-1">型號／名稱</th>
            <th className="py-1 text-right">數量</th>
            {cols.price && <th className="py-1 pl-1 text-right">小計</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.product.id} className="border-b border-slate-100 align-top">
              <td className="py-1 pr-1 text-slate-500">{r.index}</td>
              <td className="py-1 pr-1">
                <div className="font-medium text-slate-800">{r.product.modelCode}</div>
                <div className="text-slate-500">
                  {[r.product.name || '—', CATEGORY_LABEL[r.product.category], r.product.maker].filter(Boolean).join('．')}
                </div>
              </td>
              <td className="py-1 text-right font-semibold">{r.quantity}</td>
              {cols.price && (
                <td className="py-1 pl-1 text-right tabular-nums text-slate-700">
                  {r.product.price !== undefined ? formatMoney(r.product.price * r.quantity) : '—'}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-slate-500">
        共 {doc.instances.length} 個零件、{rows.length} 種型號。
        {total !== undefined && <span className="ml-1 font-semibold text-slate-700">合計 {formatMoney(total)}</span>}
      </p>
      <Button size="sm" onClick={downloadBomCsv}>
        下載 CSV（可用 Excel 開啟）
      </Button>
    </div>
  )
}
