import { useMemo, useState } from 'react'
import { buildBom } from '../assembly/bom'
import { getPort, mateChecks, mateRotation } from '../assembly/moduleOps'
import { CATEGORY_LABEL, type Product, type ProductCategory } from '../catalog/types'
import { formatSpec, type MateLevel } from '../threads'
import { portLabel } from './labels'
import { useModuleStore } from './moduleStore'
import { LEVEL_COLOR } from './levels'
import { Button, Empty, LevelBadge } from './ui'

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
      <Button variant="danger" size="sm" onClick={removeSelected}>
        從模組移除這個零件
      </Button>
    </div>
  )
}

function ProductForm({ product }: { product: Product }) {
  const updateProduct = useModuleStore((s) => s.updateProduct)
  const [modelCode, setModelCode] = useState(product.modelCode)
  const [name, setName] = useState(product.name)
  const save = (patch: Partial<Product>) => void updateProduct({ ...product, ...patch })
  return (
    <section className="space-y-2">
      <label className="block text-xs text-slate-500">
        型號
        <input
          value={modelCode}
          onChange={(e) => setModelCode(e.target.value)}
          onBlur={() => modelCode.trim() && modelCode !== product.modelCode && save({ modelCode: modelCode.trim() })}
          className="mt-0.5 h-8 w-full rounded-md border border-slate-300 px-2 text-sm text-slate-800"
        />
      </label>
      <label className="block text-xs text-slate-500">
        名稱
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== product.name && save({ name: name.trim() })}
          placeholder="例如：直通快插接頭"
          className="mt-0.5 h-8 w-full rounded-md border border-slate-300 px-2 text-sm text-slate-800"
        />
      </label>
      <label className="block text-xs text-slate-500">
        類別
        <select
          value={product.category}
          onChange={(e) => save({ category: e.target.value as ProductCategory })}
          className="mt-0.5 h-8 w-full rounded-md border border-slate-300 px-2 text-sm text-slate-800"
        >
          {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <p className="text-[11px] text-slate-400">
        來源檔案：{product.source.fileName}（{(product.source.bytes / 1024).toFixed(0)} KB）
      </p>
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
  return (
    <div className="space-y-3 p-3">
      <table className="w-full text-xs" aria-label="BOM">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="py-1 pr-1">項次</th>
            <th className="py-1 pr-1">型號／名稱</th>
            <th className="py-1 text-right">數量</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.product.id} className="border-b border-slate-100 align-top">
              <td className="py-1 pr-1 text-slate-500">{r.index}</td>
              <td className="py-1 pr-1">
                <div className="font-medium text-slate-800">{r.product.modelCode}</div>
                <div className="text-slate-500">
                  {r.product.name || '—'}．{CATEGORY_LABEL[r.product.category]}
                </div>
              </td>
              <td className="py-1 text-right font-semibold">{r.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-slate-500">共 {doc.instances.length} 個零件、{rows.length} 種型號。</p>
      <Button size="sm" onClick={downloadBomCsv}>
        下載 CSV（可用 Excel 開啟）
      </Button>
    </div>
  )
}
