import { useMemo, useState } from 'react'
import { makePort } from '../catalog/ports'
import type { Product, ProductCategory, ProductPort } from '../catalog/types'
import { fmtNum, formatSpec, parseSpec, specToText, suggestByDiameter, type InterfaceSpec } from '../threads'
import { useModuleStore } from './moduleStore'
import { Button, Dialog } from './ui'

const NAME_HINTS: Record<ProductCategory, string[]> = {
  valve: ['P', 'A', 'B', 'EA', 'EB', 'R1', 'R2', '安裝面'],
  cylinder: ['A', 'B'],
  fitting: ['1', '2', '3'],
  silencer: ['1'],
  speedController: ['1', '2'],
  frl: ['IN', 'OUT', '壓力錶'],
  manifold: ['P', 'EA', 'EB', 'A1', 'B1', '站1'],
  other: ['1', '2', '3'],
}

const ROLE_LABEL: Record<InterfaceSpec['role'], string> = { plug: '元件側（例如閥的底面）', socket: '底座側（例如集裝座站位）', mutual: '對接面（兩側相同）' }

/** 新增或編輯埠的對話框 */
export function PortEditor() {
  const draft = useModuleStore((s) => s.draftPort)
  const editing = useModuleStore((s) => s.editingPort)
  const products = useModuleStore((s) => s.products)
  const productId = draft?.productId ?? editing?.productId
  const product = productId ? products[productId] : undefined
  const existing = editing && product?.ports.find((p) => p.id === editing.portId)
  if (!product || (!draft && !existing)) return null
  return <PortForm key={draft ? JSON.stringify(draft.proposal.origin) : existing!.id} product={product} existing={existing} />
}

function PortForm({ product, existing }: { product: Product; existing?: ProductPort }) {
  const draft = useModuleStore((s) => s.draftPort)
  const close = useModuleStore((s) => s.closePortEditor)
  const savePort = useModuleStore((s) => s.savePort)
  const deletePort = useModuleStore((s) => s.deletePort)
  const flipPort = useModuleStore((s) => s.flipPort)
  const rotatePortRef = useModuleStore((s) => s.rotatePortRef)
  const arrayCopyPort = useModuleStore((s) => s.arrayCopyPort)

  const proposal = existing ? undefined : draft?.proposal
  const shape = proposal?.shape ?? existing?.detected?.shape
  const diameter = proposal?.diameter ?? existing?.detected?.diameter
  const gender = shape === 'hole' ? 'female' : shape === 'boss' ? 'male' : undefined

  const used = new Set(product.ports.map((p) => p.name))
  const hints = NAME_HINTS[product.category]
  const [name, setName] = useState(existing?.name ?? hints.find((h) => !used.has(h)) ?? `${product.ports.length + 1}`)
  const [kind, setKind] = useState<'thread' | 'interface'>(existing?.spec?.kind === 'interface' || shape === 'plane' ? 'interface' : 'thread')
  const [text, setText] = useState(existing?.spec && existing.spec.kind !== 'interface' ? specToText(existing.spec) : '')
  const [key, setKey] = useState(existing?.spec?.kind === 'interface' ? existing.spec.key : '')
  const [role, setRole] = useState<InterfaceSpec['role']>(existing?.spec?.kind === 'interface' ? existing.spec.role : 'mutual')
  const [array, setArray] = useState({ open: false, axis: 'x', sign: 1, pitch: 20, count: 4 })

  // 注意：selector 必須回傳穩定的參考（zustand v5），陣列在 useMemo 中計算
  const products = useModuleStore((s) => s.products)
  const knownKeys = useMemo(
    () => [...new Set(Object.values(products).flatMap((p) => p.ports.flatMap((x) => (x.spec?.kind === 'interface' ? [x.spec.key] : []))))],
    [products],
  )
  const suggestions = useMemo(
    () => (diameter && shape !== 'plane' ? suggestByDiameter(diameter, shape === 'hole' ? 'hole' : 'boss') : []),
    [diameter, shape],
  )

  const input = kind === 'interface' ? (key.trim() ? `安裝面：${key.trim()}` : '') : text.trim()
  const parsed = input ? parseSpec(input, { gender, interfaceRole: role }) : undefined
  const invalid = parsed && !parsed.ok

  const save = () => {
    if (invalid || !name.trim()) return
    const spec = parsed?.ok ? parsed.spec : undefined
    const rotation = spec?.kind === 'interface' ? (existing?.rotation === 'free' || !existing ? 'fixed' : existing.rotation) : 'free'
    const port: ProductPort = existing
      ? { ...existing, name: name.trim(), spec, rotation }
      : makePort({
          name: name.trim(),
          spec,
          origin: proposal!.origin,
          axis: proposal!.axis,
          rotation,
          detected: { shape: proposal!.shape, diameter: proposal!.diameter },
        })
    void savePort(product.id, port)
  }

  const measured =
    shape === 'hole'
      ? `孔 Ø${fmtNum(diameter ?? 0, 2)}${proposal?.length ? `，深 ${fmtNum(proposal.length, 1)} mm` : ''}`
      : shape === 'boss'
        ? `凸柱 Ø${fmtNum(diameter ?? 0, 2)}${proposal?.length ? `，長 ${fmtNum(proposal.length, 1)} mm` : ''}`
        : '平面'

  return (
    <Dialog
      title={existing ? `編輯埠：${product.modelCode}．${existing.name}` : `新增埠：${product.modelCode}`}
      onClose={close}
      footer={
        <>
          {existing && (
            <Button variant="danger" className="mr-auto" onClick={() => void deletePort(product.id, existing.id)}>
              刪除埠
            </Button>
          )}
          <Button onClick={close}>取消</Button>
          <Button variant="primary" onClick={save} disabled={invalid || !name.trim()}>
            儲存埠
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="rounded-md bg-slate-100 px-2 py-1.5 text-xs text-slate-600">
          量測：{measured}
          {gender && `（${gender === 'female' ? '母牙／快插口' : '公牙／插管端'}）`}
        </p>

        <label className="block text-xs text-slate-500">
          埠名稱
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-0.5 h-8 w-full rounded-md border border-slate-300 px-2 text-sm text-slate-800"
            aria-label="埠名稱"
          />
        </label>
        <div className="flex flex-wrap gap-1">
          {hints.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setName(h)}
              disabled={used.has(h) && h !== existing?.name}
              className="rounded border border-slate-300 px-1.5 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-30"
            >
              {h}
            </button>
          ))}
        </div>

        <div className="flex gap-1 rounded-md bg-slate-100 p-0.5 text-xs" role="radiogroup" aria-label="埠類型">
          {(['thread', 'interface'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={`flex-1 rounded py-1 ${kind === k ? 'bg-white font-semibold text-slate-800 shadow-sm' : 'text-slate-500'}`}
            >
              {k === 'thread' ? '螺紋／快插' : '安裝面（閥座、模組面）'}
            </button>
          ))}
        </div>

        {kind === 'thread' ? (
          <>
            <label className="block text-xs text-slate-500">
              規格（可留空，之後再補）
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && save()}
                placeholder="例如 PT1/4 母、Rc1/8、M5、NPT1/8、Ø6 快插"
                className="mt-0.5 h-8 w-full rounded-md border border-slate-300 px-2 text-sm text-slate-800"
                aria-label="規格"
                autoFocus
              />
            </label>
            {suggestions.length > 0 && (
              <div>
                <div className="mb-1 text-xs text-slate-500">依量測直徑建議：</div>
                <div className="flex flex-wrap gap-1">
                  {suggestions.map((s) => (
                    <button
                      key={formatSpec(s.spec)}
                      type="button"
                      onClick={() => setText(specToText(s.spec))}
                      className="rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 text-xs text-blue-800 hover:bg-blue-100"
                      title={`參考直徑 ${fmtNum(s.reference, 2)} mm（${{ major: '大徑', minor: '小徑', tapDrill: '攻牙徑', od: '管外徑' }[s.basis]}），差 ${fmtNum(s.delta, 2)} mm`}
                    >
                      {formatSpec(s.spec)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <label className="block text-xs text-slate-500">
              安裝面名稱（兩個零件名稱相同才能結合）
              <input
                value={key}
                onChange={(e) => setKey(e.target.value)}
                list="interface-keys"
                placeholder="例如 SY3000 閥座面、FRL-40 模組面"
                className="mt-0.5 h-8 w-full rounded-md border border-slate-300 px-2 text-sm text-slate-800"
                aria-label="安裝面名稱"
              />
              <datalist id="interface-keys">
                {knownKeys.map((k) => (
                  <option key={k} value={k} />
                ))}
              </datalist>
            </label>
            <fieldset className="space-y-1 text-xs text-slate-600">
              {(Object.keys(ROLE_LABEL) as InterfaceSpec['role'][]).map((r) => (
                <label key={r} className="flex items-center gap-2">
                  <input type="radio" checked={role === r} onChange={() => setRole(r)} />
                  {ROLE_LABEL[r]}
                </label>
              ))}
            </fieldset>
          </>
        )}

        {parsed && (
          <p className={`text-xs ${parsed.ok ? 'text-green-700' : 'text-red-600'}`} role="status">
            {parsed.ok ? `✓ ${formatSpec(parsed.spec)}` : `✕ ${parsed.error}`}
            {parsed.ok && parsed.notes.map((n) => <span key={n} className="block text-slate-500">{n}</span>)}
          </p>
        )}

        {existing && (
          <div className="space-y-2 border-t border-slate-200 pt-3">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void flipPort(product.id, existing.id)} title="自動判斷的方向相反時使用">
                翻轉方向
              </Button>
              {existing.spec?.kind === 'interface' && (
                <Button size="sm" onClick={() => void rotatePortRef(product.id, existing.id)} title="調整安裝面的對齊方向">
                  旋轉對齊基準 90°
                </Button>
              )}
              <Button size="sm" onClick={() => setArray((a) => ({ ...a, open: !a.open }))}>
                陣列複製…
              </Button>
            </div>
            {array.open && (
              <div className="grid grid-cols-3 gap-2 rounded-md bg-slate-50 p-2 text-xs text-slate-600">
                <label>
                  方向
                  <select
                    value={`${array.sign > 0 ? '+' : '-'}${array.axis}`}
                    onChange={(e) => setArray((a) => ({ ...a, sign: e.target.value[0] === '+' ? 1 : -1, axis: e.target.value[1] }))}
                    className="mt-0.5 h-7 w-full rounded border border-slate-300"
                  >
                    {['+x', '-x', '+y', '-y', '+z', '-z'].map((d) => (
                      <option key={d} value={d}>
                        {d.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  間距 mm
                  <input
                    type="number"
                    value={array.pitch}
                    onChange={(e) => setArray((a) => ({ ...a, pitch: Number(e.target.value) }))}
                    className="mt-0.5 h-7 w-full rounded border border-slate-300 px-1"
                  />
                </label>
                <label>
                  總數
                  <input
                    type="number"
                    min={2}
                    value={array.count}
                    onChange={(e) => setArray((a) => ({ ...a, count: Number(e.target.value) }))}
                    className="mt-0.5 h-7 w-full rounded border border-slate-300 px-1"
                  />
                </label>
                <Button
                  size="sm"
                  variant="primary"
                  className="col-span-3"
                  onClick={() => {
                    const dir = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[array.axis]!.map((v) => v * array.sign) as [number, number, number]
                    void arrayCopyPort(product.id, existing.id, dir, array.pitch, Math.round(array.count))
                    setArray((a) => ({ ...a, open: false }))
                  }}
                >
                  複製成 {Math.round(array.count)} 個（含原本這個）
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  )
}
