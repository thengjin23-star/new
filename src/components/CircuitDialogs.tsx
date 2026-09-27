import { useReactFlow } from '@xyflow/react'
import { useEffect, useState } from 'react'
import { deleteCircuit, listCircuits, openCircuit, renameCircuit, saveCircuit, type CircuitSummary } from '../store/circuitFiles'
import { useCircuitStore } from '../store/circuitStore'
import { useCircuitUi } from '../store/circuitUi'
import { FIT_VIEW_OPTIONS } from './canvasConfig'
import { Button, Dialog } from './ui'

const formatDate = (t: number) =>
  new Date(t).toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

/** 電路清單：開啟、改名、刪除 */
function FilesDialog({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState<CircuitSummary[] | undefined>()
  const [query, setQuery] = useState('')
  const notify = useCircuitUi((s) => s.notify)
  const current = useCircuitStore((s) => s.info.id)
  const { fitView } = useReactFlow()

  const refresh = () =>
    listCircuits()
      .then(setList)
      .catch((err: unknown) => notify(err instanceof Error ? err.message : String(err), 'error'))

  useEffect(() => {
    listCircuits()
      .then(setList)
      .catch((err: unknown) => notify(err instanceof Error ? err.message : String(err), 'error'))
  }, [notify])

  const open = async (id: string) => {
    const { dirty, nodes, stored } = useCircuitStore.getState()
    if (nodes.length && (dirty || !stored) && !window.confirm('目前的電路有未儲存的變更，確定要開啟其他電路嗎？')) return
    try {
      await openCircuit(id)
      onClose()
      if (useCircuitStore.getState().nodes.length) void fitView(FIT_VIEW_OPTIONS)
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'error')
    }
  }

  const q = query.trim().toLowerCase()
  const shown = (list ?? []).filter((c) => !q || c.name.toLowerCase().includes(q) || c.customer?.toLowerCase().includes(q))

  return (
    <Dialog title="開啟迴路圖" onClose={onClose} footer={<Button onClick={onClose}>關閉</Button>}>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="搜尋名稱或客戶"
        className="mb-3 h-8 w-full rounded-md border border-slate-300 px-2 text-sm"
        aria-label="搜尋電路"
      />
      {list === undefined ? (
        <p className="text-sm text-slate-500">讀取中…</p>
      ) : shown.length === 0 ? (
        <p className="text-sm leading-6 text-slate-500">
          {list.length === 0 ? '還沒有儲存的迴路圖。在「檔案 → 另存新檔」把目前的電路存進清單。' : '找不到符合的電路。'}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100" aria-label="電路清單">
          {shown.map((c) => (
            <li key={c.id} className="flex items-center gap-2 py-2">
              <button type="button" onClick={() => void open(c.id)} className="min-w-0 flex-1 text-left" data-circuit={c.name}>
                <span className="block truncate text-sm font-medium text-slate-800">
                  {c.name}
                  {c.id === current && <span className="ml-1 text-xs text-blue-600">（目前）</span>}
                </span>
                <span className="block truncate text-xs text-slate-500">
                  {[c.customer, `${c.components} 個元件`, formatDate(c.updatedAt)].filter(Boolean).join('・')}
                </span>
              </button>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  const name = window.prompt('新的名稱', c.name)?.trim()
                  if (!name) return
                  await renameCircuit(c.id, name)
                  void refresh()
                }}
              >
                改名
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  if (!window.confirm(`確定要刪除「${c.name}」嗎？刪除後無法復原。`)) return
                  await deleteCircuit(c.id)
                  void refresh()
                }}
              >
                刪除
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  )
}

/** 另存新檔：輸入名稱與客戶 */
function SaveAsDialog({ onClose }: { onClose: () => void }) {
  const info = useCircuitStore((s) => s.info)
  const stored = useCircuitStore((s) => s.stored)
  const notify = useCircuitUi((s) => s.notify)
  const [name, setName] = useState(stored ? `${info.name}（複本）` : info.name)
  const [customer, setCustomer] = useState(info.customer ?? '')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!name.trim()) return
    setBusy(true)
    try {
      await saveCircuit({ asNew: { name: name.trim(), customer: customer.trim() || undefined } })
      notify(`已儲存「${name.trim()}」`)
      onClose()
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      title="儲存到電路清單"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" disabled={busy || !name.trim()} onClick={() => void save()}>
            儲存
          </Button>
        </>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <label className="block text-xs text-slate-500">
          名稱
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="mt-0.5 h-9 w-full rounded-md border border-slate-300 px-2 text-sm" />
        </label>
        <label className="block text-xs text-slate-500">
          客戶（選填）
          <input value={customer} onChange={(e) => setCustomer(e.target.value)} className="mt-0.5 h-9 w-full rounded-md border border-slate-300 px-2 text-sm" />
        </label>
        <p className="text-xs leading-5 text-slate-400">電路存在這台裝置的瀏覽器中；要給別人或換裝置時，用「檔案 → 匯出迴路圖」。</p>
      </form>
    </Dialog>
  )
}

export function CircuitDialogs() {
  const dialog = useCircuitUi((s) => s.dialog)
  const close = () => useCircuitUi.getState().openDialog(undefined)
  if (dialog === 'files') return <FilesDialog onClose={close} />
  if (dialog === 'saveAs') return <SaveAsDialog onClose={close} />
  return null
}

/** 右下角的短暫提示 */
export function CircuitToast() {
  const toast = useCircuitUi((s) => s.toast)
  const dismiss = useCircuitUi((s) => s.dismissToast)
  if (!toast) return null
  return (
    <div
      role="status"
      className={`absolute bottom-16 left-1/2 z-30 max-w-md -translate-x-1/2 rounded-md px-3 py-2 text-sm shadow-lg ${toast.kind === 'error' ? 'bg-red-600 text-white' : 'bg-slate-800 text-white'}`}
    >
      {toast.text}
      <button type="button" onClick={dismiss} className="ml-3 text-white/70 hover:text-white" aria-label="關閉提示">
        ✕
      </button>
    </div>
  )
}
