import { useMemo, useRef, useState } from 'react'
import { CATEGORY_LABEL } from '../catalog/types'
import { useModuleStore } from './moduleStore'
import { Button } from './ui'

export const ACCEPT_FILES = '.step,.stp,.iges,.igs,.plib,.pmod'

export function LibraryPanel() {
  const products = useModuleStore((s) => s.products)
  const importFiles = useModuleStore((s) => s.importFiles)
  const installSampleLibrary = useModuleStore((s) => s.installSampleLibrary)
  const exportLibraryFile = useModuleStore((s) => s.exportLibraryFile)
  const addProductToModule = useModuleStore((s) => s.addProductToModule)
  const deleteProduct = useModuleStore((s) => s.deleteProduct)
  const [query, setQuery] = useState('')
  const input = useRef<HTMLInputElement>(null)

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return Object.values(products)
      .filter((p) => !q || `${p.modelCode} ${p.name} ${CATEGORY_LABEL[p.category]}`.toLowerCase().includes(q))
      .sort((a, b) => a.modelCode.localeCompare(b.modelCode))
  }, [products, query])

  const open = useModuleStore((s) => s.drawer === 'library')
  return (
    <aside
      className={`${open ? 'flex' : 'hidden'} absolute inset-y-0 left-0 z-20 w-72 flex-col border-r border-slate-200 bg-white shadow-xl lg:static lg:z-auto lg:flex lg:w-64 lg:shrink-0 lg:shadow-none`}
      aria-label="產品庫"
    >
      <div className="space-y-2 border-b border-slate-200 p-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-slate-700">產品庫</h2>
          <span className="text-xs text-slate-400">{Object.keys(products).length} 個產品</span>
        </div>
        <Button variant="primary" className="w-full" onClick={() => input.current?.click()}>
          匯入 3D 檔（STEP／IGES）
        </Button>
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPT_FILES}
          hidden
          data-testid="library-file-input"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])]
            e.target.value = ''
            void importFiles(files)
          }}
        />
        <div className="flex gap-2">
          <Button size="sm" className="flex-1" onClick={() => void installSampleLibrary()}>
            安裝範例零件
          </Button>
          <Button size="sm" className="flex-1" onClick={() => void exportLibraryFile()} disabled={list.length === 0}>
            匯出產品庫
          </Button>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜尋型號、名稱或類別"
          className="h-8 w-full rounded-md border border-slate-300 px-2 text-sm"
        />
      </div>

      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {list.length === 0 && (
          <li className="p-2 text-xs leading-5 text-slate-500">
            產品庫是空的。匯入公司產品的 STEP 檔，或先安裝範例零件試用。
          </li>
        )}
        {list.map((p) => {
          const unset = p.ports.filter((x) => !x.spec).length
          return (
            <li key={p.id} className="group relative">
              <button
                type="button"
                onClick={() => void addProductToModule(p.id)}
                title="加入目前的模組"
                data-product={p.modelCode}
                className="w-full rounded-md border border-transparent px-2 py-1.5 text-left hover:border-blue-300 hover:bg-blue-50"
              >
                <div className="truncate pr-6 text-sm font-medium text-slate-800">{p.modelCode}</div>
                {p.name && <div className="truncate text-xs text-slate-500">{p.name}</div>}
                <div className="text-[11px] text-slate-400">
                  {CATEGORY_LABEL[p.category]}．埠 {p.ports.length}
                  {unset > 0 && <span className="text-amber-600">（{unset} 個未設定規格）</span>}
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`從產品庫刪除「${p.modelCode}」？（包含 3D 檔與已定義的埠）`)) void deleteProduct(p.id)
                }}
                className="absolute top-1.5 right-1 hidden rounded px-1 text-xs text-slate-400 group-hover:block hover:bg-red-50 hover:text-red-600"
                aria-label={`刪除 ${p.modelCode}`}
              >
                刪除
              </button>
            </li>
          )
        })}
      </ul>

      <p className="border-t border-slate-200 p-3 text-[11px] leading-5 text-slate-500">
        也可以直接把 STEP 檔拖進 3D 畫面。產品與埠記在這台電腦的瀏覽器裡，請定期「匯出產品庫」備份。
      </p>
    </aside>
  )
}
