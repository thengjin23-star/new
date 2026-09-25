import { useState } from 'react'
import { WorkspaceTabs } from '../components/WorkspaceTabs'
import { useModuleStore } from './moduleStore'
import { BarButton, Button, Dialog } from './ui'

export function ModuleToolbar() {
  const doc = useModuleStore((s) => s.doc)
  const saved = useModuleStore((s) => s.saved)
  const busy = useModuleStore((s) => s.busy)
  const canUndo = useModuleStore((s) => s.past.length > 0)
  const canRedo = useModuleStore((s) => s.future.length > 0)
  const selected = useModuleStore((s) => s.selected)
  const drawer = useModuleStore((s) => s.drawer)
  const { newModule, undo, redo, requestFit, exportModuleFile, renameModule, toggleDrawer } = useModuleStore.getState()
  const [listOpen, setListOpen] = useState(false)

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 overflow-x-auto bg-slate-800 px-2 text-white sm:px-3">
      <WorkspaceTabs />
      {/* 窄螢幕：側邊面板改為抽屜 */}
      <span className="flex shrink-0 lg:hidden">
        <BarButton label="產品庫" onClick={() => toggleDrawer('library')} aria-pressed={drawer === 'library'} />
        <BarButton label="屬性" onClick={() => toggleDrawer('inspector')} aria-pressed={drawer === 'inspector'} />
      </span>
      <NameField key={`${doc.id}-name`} value={doc.name} placeholder="模組名稱" width="w-40" onCommit={(name) => renameModule({ name: name || '未命名模組' })} />
      <NameField key={`${doc.id}-customer`} value={doc.customer ?? ''} placeholder="客戶" width="w-28" onCommit={(customer) => renameModule({ customer })} />
      <div className="mx-1 h-6 w-px shrink-0 bg-white/15" />
      <BarButton label="新模組" onClick={newModule} />
      <BarButton label="開啟…" onClick={() => setListOpen(true)} />
      <BarButton label="復原" onClick={undo} disabled={!canUndo} title="Ctrl+Z" />
      <BarButton label="重做" onClick={redo} disabled={!canRedo} title="Ctrl+Y" />
      <BarButton label="顯示全部" onClick={() => requestFit()} />
      <BarButton label="對準選取" onClick={() => requestFit(selected)} disabled={!selected} title="縮放到選取的零件" />
      <BarButton label="匯出模組" onClick={() => void exportModuleFile()} disabled={doc.instances.length === 0} />
      <span className="ml-auto pl-2 text-xs whitespace-nowrap text-slate-300" role="status">
        {busy ?? (saved ? '已儲存' : '儲存中…')}
      </span>
      {listOpen && <ModuleList onClose={() => setListOpen(false)} />}
    </header>
  )
}

/** 失去焦點或按 Enter 時才寫入（避免每個字都產生一筆復原紀錄） */
function NameField({ value, placeholder, width, onCommit }: { value: string; placeholder: string; width: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value)
  const commit = () => text.trim() !== value && onCommit(text.trim())
  return (
    <input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      placeholder={placeholder}
      aria-label={placeholder}
      className={`${width} h-8 shrink-0 rounded-md border border-white/15 bg-white/5 px-2 text-sm text-white placeholder:text-slate-400 focus:bg-white/10 focus:outline-none`}
    />
  )
}

function ModuleList({ onClose }: { onClose: () => void }) {
  const modules = useModuleStore((s) => s.modules)
  const current = useModuleStore((s) => s.doc.id)
  const { openModule, deleteModule } = useModuleStore.getState()
  return (
    <Dialog title="開啟模組" onClose={onClose}>
      {modules.length === 0 ? (
        <p className="text-sm text-slate-500">還沒有儲存的模組。</p>
      ) : (
        <ul className="divide-y divide-slate-100 text-slate-800">
          {modules.map((m) => (
            <li key={m.id} className="flex items-center gap-2 py-2">
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  void openModule(m.id)
                  onClose()
                }}
              >
                <div className="truncate font-medium">
                  {m.name}
                  {m.id === current && <span className="ml-1 text-xs text-blue-600">（目前）</span>}
                </div>
                <div className="text-xs text-slate-500">
                  {m.customer ? `${m.customer}．` : ''}
                  {m.parts} 個零件．{new Date(m.updatedAt).toLocaleString('zh-TW')}
                </div>
              </button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => window.confirm(`刪除模組「${m.name}」？`) && void deleteModule(m.id)}
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
