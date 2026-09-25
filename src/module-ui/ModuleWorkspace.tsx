import { useEffect, useState, type DragEvent } from 'react'
import { formatSpec } from '../threads'
import { Inspector } from './Inspector'
import { portLabel } from './labels'
import { LibraryPanel } from './LibraryPanel'
import { MateDialog } from './MateDialog'
import { ModuleToolbar } from './ModuleToolbar'
import { useModuleStore } from './moduleStore'
import { PortEditor } from './PortEditor'
import { Button } from './ui'
import { Viewport } from './Viewport'
import { getPort } from '../assembly/moduleOps'

/** 3D 模組組立工作區（延遲載入） */
export default function ModuleWorkspace() {
  const status = useModuleStore((s) => s.status)
  const error = useModuleStore((s) => s.error)
  const init = useModuleStore((s) => s.init)
  const importFiles = useModuleStore((s) => s.importFiles)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    void init()
  }, [init])

  useKeyboard()

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const files = [...e.dataTransfer.files]
    if (files.length) void importFiles(files)
  }

  if (status === 'error') {
    return (
      <div className="flex h-full flex-col">
        <ModuleToolbar />
        <p className="m-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">無法開啟產品庫：{error}</p>
      </div>
    )
  }

  return (
    <div
      className="flex h-full flex-col"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={onDrop}
    >
      <ModuleToolbar />
      <div className="relative flex min-h-0 flex-1">
        <LibraryPanel />
        <main className="relative min-w-0 flex-1 bg-slate-100">
          {status === 'loading' ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">載入產品庫…</div>
          ) : (
            <Viewport />
          )}
          <HintBar />
          <EmptyState />
          <Toast />
          {dragging && (
            <div className="pointer-events-none absolute inset-2 flex items-center justify-center rounded-lg border-2 border-dashed border-blue-500 bg-blue-50/70 text-lg font-medium text-blue-800">
              放開以匯入 STEP／IGES（或 .plib／.pmod）
            </div>
          )}
        </main>
        <Inspector />
      </div>
      <PortEditor />
      <MateDialog />
    </div>
  )
}

function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return
      const s = useModuleStore.getState()
      if (e.key === 'Escape') {
        if (s.connectFrom) s.cancelConnect()
        else if (s.mode !== 'select') s.setMode('select')
        else s.select(undefined)
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && s.selected) {
        e.preventDefault()
        s.removeSelected()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        s.redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

function HintBar() {
  const mode = useModuleStore((s) => s.mode)
  const connectFrom = useModuleStore((s) => s.connectFrom)
  const hasParts = useModuleStore((s) => s.doc.instances.length > 0)
  const doc = useModuleStore((s) => s.doc)
  const products = useModuleStore((s) => s.products)
  let text: string | undefined
  if (connectFrom) {
    const spec = getPort(doc, products, connectFrom)?.spec
    text = `已選 ${portLabel(doc, products, connectFrom)}${spec ? `（${formatSpec(spec)}）` : ''} → 點選另一個零件的埠：綠＝正確、黃＝注意、紅＝不相容、灰＝未設定（Esc 取消）`
  } else if (mode === 'define-port') {
    text = '新增埠：點選零件上的孔、凸柱或平面（Esc 結束）'
  } else if (hasParts) {
    text = '點選零件以編輯；點選埠的箭頭或標籤開始連接。拖曳旋轉視角、滾輪縮放。'
  }
  if (!text) return null
  return (
    <div className="pointer-events-none absolute top-3 left-1/2 max-w-[90%] -translate-x-1/2 rounded-md bg-slate-800/85 px-3 py-1.5 text-center text-xs text-white shadow">
      {text}
    </div>
  )
}

function EmptyState() {
  const empty = useModuleStore((s) => s.status === 'ready' && s.doc.instances.length === 0)
  const hasProducts = useModuleStore((s) => Object.keys(s.products).length > 0)
  const installSampleLibrary = useModuleStore((s) => s.installSampleLibrary)
  if (!empty) return null
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
      <div className="pointer-events-auto max-w-md rounded-lg border border-dashed border-slate-300 bg-white/90 px-6 py-5 text-center text-sm text-slate-600 shadow-sm">
        <p className="font-medium text-slate-800">把要組合的 STEP 檔拖進來</p>
        <p className="mt-1 leading-6">
          或從左側產品庫點選已記住的零件。第一次使用的零件，點選它的孔來定義埠與螺紋規格，系統會記住，下次直接沿用。
        </p>
        {!hasProducts && (
          <Button className="mt-3" onClick={() => void installSampleLibrary()}>
            先安裝範例零件試用
          </Button>
        )}
      </div>
    </div>
  )
}

function Toast() {
  const message = useModuleStore((s) => s.message)
  const dismiss = useModuleStore((s) => s.dismissMessage)
  useEffect(() => {
    if (message?.kind !== 'info') return
    const t = setTimeout(dismiss, 7000)
    return () => clearTimeout(t)
  }, [message, dismiss])
  if (!message) return null
  return (
    <div
      role="alert"
      className={`absolute bottom-3 left-3 z-10 flex max-w-lg items-start gap-2 rounded-md border px-3 py-2 text-sm shadow ${message.kind === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-slate-200 bg-white text-slate-700'}`}
    >
      <span className="flex-1">{message.text}</span>
      <button type="button" onClick={dismiss} className="text-slate-400 hover:text-slate-700" aria-label="關閉訊息">
        ✕
      </button>
    </div>
  )
}
