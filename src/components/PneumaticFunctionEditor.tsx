import { useState } from 'react'
import { useLibraryStore } from '../catalog/library'
import {
  autoPortMap,
  effectivePneumatic,
  isCircuitType,
  parseBoreStroke,
  pneumaticTypeOptions,
  SPECIAL_TYPE_LABEL,
} from '../catalog/pneumatic'
import { productLabel, type Product, type ProductPneumatic } from '../catalog/types'
import { registry, type ParamDef, type ParamValue } from '../engine'
import { formatSpecShort } from '../threads'
import { SymbolPreview } from './SymbolPreview'
import { Button, Dialog } from './ui'

const inputClass = 'h-8 w-full rounded-md border border-slate-300 px-2 text-sm text-slate-800'

/** 產品的「氣動功能」編輯表單（受控元件：value 由呼叫端保存） */
export function PneumaticFunctionEditor({
  product,
  value,
  onChange,
}: {
  product: Product
  value: ProductPneumatic | undefined
  onChange: (value: ProductPneumatic | undefined) => void
}) {
  const type = value?.type ?? ''
  const def = isCircuitType(type) ? registry.get(type) : undefined
  const pipingPorts = product.ports.filter((p) => p.spec?.kind !== 'interface')

  const setType = (next: string) => {
    if (!next) {
      onChange(undefined)
      return
    }
    const nextDef = isCircuitType(next) ? registry.get(next) : undefined
    const keys = new Set((nextDef?.params ?? []).map((p) => p.key))
    const params: Record<string, ParamValue> = Object.fromEntries(
      Object.entries(value?.params ?? {}).filter(([k]) => keys.has(k)),
    )
    if (nextDef?.category === 'actuator' && params.bore === undefined) {
      const size = parseBoreStroke(`${product.modelCode} ${product.name}`)
      if (size) Object.assign(params, size)
    }
    onChange({ type: next, portMap: autoPortMap(next, product.ports), ...(Object.keys(params).length && { params }) })
  }

  const setPort = (fnPort: string, productPort: string) => {
    if (!value) return
    const portMap = { ...value.portMap }
    if (productPort) portMap[fnPort] = productPort
    else delete portMap[fnPort]
    onChange({ ...value, portMap })
  }

  const setParam = (p: ParamDef, raw: string | boolean) => {
    if (!value) return
    const params = { ...value.params }
    if (raw === '' || raw === undefined) delete params[p.key]
    else if (p.kind === 'number') {
      const n = Number(raw)
      if (!Number.isFinite(n)) return
      params[p.key] = n
    } else params[p.key] = raw
    onChange({ ...value, params })
  }

  return (
    <div className="space-y-3">
      <label className="block text-xs text-slate-500">
        在迴路圖中的元件
        <select value={type} onChange={(e) => setType(e.target.value)} className={`mt-0.5 ${inputClass}`}>
          <option value="">（未設定）</option>
          {pneumaticTypeOptions().map((g) => (
            <optgroup key={g.group} label={g.group}>
              {g.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      {def && (
        <div className="flex items-center justify-center rounded-md border border-slate-200 bg-slate-50 p-2">
          <SymbolPreview type={def.type} params={value?.params} className="h-16 w-full" />
        </div>
      )}
      {type && !def && <p className="text-xs leading-5 text-slate-500">{SPECIAL_TYPE_LABEL[type]}。</p>}

      {def && (
        <section>
          <h4 className="mb-1 text-xs font-semibold text-slate-600">埠對應</h4>
          <p className="mb-1.5 text-[11px] leading-4 text-slate-400">
            元件的埠對應到這個產品的哪個埠（3D 模擬與「由模組產生迴路圖」會用到；只放進迴路圖時可以不設定）。
          </p>
          <table className="w-full text-sm">
            <tbody>
              {def.ports.map((port) => (
                <tr key={port.id}>
                  <td className="w-20 py-0.5 pr-2 font-mono text-xs text-slate-600">
                    {port.id}
                    {port.iso && port.iso !== port.id ? `（${port.iso}）` : ''}
                  </td>
                  <td className="py-0.5">
                    <select
                      aria-label={`功能埠 ${port.id}`}
                      value={value?.portMap[port.id] ?? ''}
                      onChange={(e) => setPort(port.id, e.target.value)}
                      className={inputClass}
                    >
                      <option value="">（不對應）</option>
                      {pipingPorts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {p.spec ? `　${formatSpecShort(p.spec)}` : ''}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pipingPorts.length === 0 && (
            <p className="mt-1 text-[11px] text-amber-700">這個產品還沒有定義管路埠（可在「模組組立」中新增）。</p>
          )}
        </section>
      )}

      {def?.params && def.params.some((p) => !p.circuitOnly) && (
        <section>
          <h4 className="mb-1 text-xs font-semibold text-slate-600">參數（空白 = 預設值）</h4>
          <div className="grid grid-cols-2 gap-2">
            {/* 訊號名稱（線圈 Y1、氣缸代號…）在迴路圖中設定，產品不列出 */}
            {def.params
              .filter((p) => !p.circuitOnly)
              .map((p) => (
                <ParamInput key={p.key} def={p} value={value?.params?.[p.key]} onChange={(raw) => setParam(p, raw)} />
              ))}
          </div>
        </section>
      )}
    </div>
  )
}

/** 單一參數的輸入欄位（產品功能與迴路圖屬性面板共用） */
export function ParamInput({
  def,
  value,
  onChange,
  placeholderValue,
}: {
  def: ParamDef
  value: ParamValue | undefined
  onChange: (raw: string | boolean) => void
  /** 空白時顯示的值（預設為參數預設值） */
  placeholderValue?: ParamValue
}) {
  const label = `${def.label}${def.unit ? `（${def.unit}）` : ''}`
  if (def.kind === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-xs text-slate-600" title={def.hint}>
        <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
        {label}
      </label>
    )
  }
  if (def.kind === 'select') {
    return (
      <label className="block text-xs text-slate-500" title={def.hint}>
        {label}
        <select value={String(value ?? def.default)} onChange={(e) => onChange(e.target.value)} className={`mt-0.5 ${inputClass}`}>
          {def.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    )
  }
  return (
    <label className="block text-xs text-slate-500" title={def.hint}>
      {label}
      <input
        type="number"
        inputMode="decimal"
        value={value === undefined ? '' : String(value)}
        placeholder={String(placeholderValue ?? def.default)}
        min={def.min}
        max={def.max}
        step={def.step ?? 'any'}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-0.5 ${inputClass}`}
      />
    </label>
  )
}

/**
 * 「設定氣動功能」對話框：編輯後存回共用產品庫。
 * onSaved 會收到存入的產品（例如迴路圖接著把它放上畫布）。
 */
export function PneumaticFunctionDialog({
  product,
  onClose,
  onSaved,
  saveLabel = '儲存',
}: {
  product: Product
  onClose: () => void
  onSaved?: (product: Product) => void
  saveLabel?: string
}) {
  const initial = effectivePneumatic(product)
  const [value, setValue] = useState<ProductPneumatic | undefined>(
    initial && { type: initial.type, portMap: initial.portMap, ...(initial.params && { params: initial.params }) },
  )
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      const saved = await useLibraryStore.getState().saveProduct({ ...product, pneumatic: value })
      onSaved?.(saved)
      onClose()
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      title={`設定氣動功能：${productLabel(product)}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" disabled={busy} onClick={() => void save()}>
            {saveLabel}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-xs leading-5 text-slate-500">
        型號 <span className="font-mono text-slate-700">{product.modelCode}</span>
        {initial?.inferred && '（目前的設定由系統依分類與埠名自動判斷，請確認）'}
      </p>
      <PneumaticFunctionEditor product={product} value={value} onChange={setValue} />
    </Dialog>
  )
}
