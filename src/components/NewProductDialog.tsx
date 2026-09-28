import { useState } from 'react'
import { getCatalog, useLibraryStore } from '../catalog/library'
import { createModelOnlyProduct } from '../catalog/importer'
import { pneumaticTypeOptions } from '../catalog/pneumatic'
import { CATEGORY_LABEL, type Product, type ProductCategory } from '../catalog/types'
import { Button, Dialog } from './ui'

const inputClass = 'mt-0.5 h-8 w-full rounded-md border border-slate-300 px-2 text-sm text-slate-800'

/** 依類別預先選好的迴路元件（使用者可改） */
const TYPE_BY_CATEGORY: Partial<Record<ProductCategory, string>> = {
  valve: 'valve52Single',
  cylinder: 'cylinderDouble',
  speedController: 'flowControl',
  silencer: 'silencer',
  frl: 'frl',
  fitting: 'fitting',
  manifold: 'manifold',
}

/**
 * 新增「只有型號」的產品：還沒有 3D 檔，也能放進迴路圖與 BOM；之後可在「模組組立」附加 3D 檔。
 */
export function NewProductDialog({ onClose, onCreated }: { onClose: () => void; onCreated?: (product: Product) => void }) {
  const [modelCode, setModelCode] = useState('')
  const [name, setName] = useState('')
  const [category, setCategory] = useState<ProductCategory>('valve')
  const [type, setType] = useState<string>(TYPE_BY_CATEGORY.valve!)
  const [maker, setMaker] = useState('')
  const [price, setPrice] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)

  const save = async () => {
    const code = modelCode.trim()
    if (!code) {
      setError('請輸入型號')
      return
    }
    const products = Object.values(useLibraryStore.getState().products)
    if (products.some((p) => p.modelCode.toUpperCase() === code.toUpperCase())) {
      setError(`產品庫已有型號「${code}」`)
      return
    }
    const priceValue = price.trim() === '' ? undefined : Number(price)
    if (priceValue !== undefined && !Number.isFinite(priceValue)) {
      setError('單價請輸入數字')
      return
    }
    setBusy(true)
    try {
      const product = await createModelOnlyProduct(await getCatalog(), {
        modelCode: code,
        name,
        category,
        maker: maker.trim() || undefined,
        price: priceValue,
        pneumatic: type ? { type, portMap: {} } : undefined,
      })
      await useLibraryStore.getState().reload(true)
      onCreated?.(product)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      title="新增產品（無 3D 檔）"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" disabled={busy} onClick={() => void save()}>
            新增
          </Button>
        </>
      }
    >
      <form
        className="grid grid-cols-2 gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <label className="col-span-2 block text-xs text-slate-500">
          型號 *
          <input autoFocus value={modelCode} onChange={(e) => setModelCode(e.target.value)} className={inputClass} />
        </label>
        <label className="col-span-2 block text-xs text-slate-500">
          名稱
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </label>
        <label className="block text-xs text-slate-500">
          類別
          <select
            value={category}
            onChange={(e) => {
              const next = e.target.value as ProductCategory
              setCategory(next)
              setType(TYPE_BY_CATEGORY[next] ?? '')
            }}
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
          在迴路圖中的元件
          <select value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>
            <option value="">（稍後設定）</option>
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
        <label className="block text-xs text-slate-500">
          廠牌
          <input value={maker} onChange={(e) => setMaker(e.target.value)} className={inputClass} />
        </label>
        <label className="block text-xs text-slate-500">
          單價（選填）
          <input value={price} inputMode="decimal" onChange={(e) => setPrice(e.target.value)} className={inputClass} />
        </label>
        {error && <p className="col-span-2 text-xs text-red-700">{error}</p>}
        <p className="col-span-2 text-[11px] leading-4 text-slate-400">
          沒有 3D 檔的產品可以放進迴路圖、列入 BOM；之後在「模組組立」的產品庫點它即可附加 3D 檔。
        </p>
      </form>
    </Dialog>
  )
}
