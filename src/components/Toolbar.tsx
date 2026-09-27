import { useReactFlow } from '@xyflow/react'
import { useRef, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { CIRCUIT_EXAMPLES } from '../fixtures/examples'
import { PCIR_EXT } from '../store/circuitDoc'
import { exportCircuitBom, exportCircuitFile, importCircuitFile, saveCircuit } from '../store/circuitFiles'
import { useCircuitStore, type SimStatus } from '../store/circuitStore'
import { useCircuitUi } from '../store/circuitUi'
import { FIT_VIEW_OPTIONS } from './canvasConfig'
import { useSettingsStore } from '../settings/settings'
import {
  DemoIcon,
  FileIcon,
  FlipIcon,
  GearIcon,
  PauseIcon,
  PlayIcon,
  RedoIcon,
  ResetIcon,
  RotateIcon,
  TrashIcon,
  UndoIcon,
} from './icons'
import { Menu } from './Menu'
import { WorkspaceTabs } from './WorkspaceTabs'

function ToolButton({
  onClick,
  disabled,
  title,
  icon,
  label,
  primary,
  compact,
}: {
  onClick: () => void
  disabled?: boolean
  title?: string
  icon: ReactNode
  label: string
  primary?: boolean
  /** 只在寬螢幕顯示文字 */
  compact?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      aria-label={label}
      className={[
        'flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-35',
        primary ? 'bg-blue-600 text-white hover:bg-blue-500' : 'text-slate-100 hover:bg-white/10',
      ].join(' ')}
    >
      {icon}
      <span className={compact ? 'hidden xl:inline' : 'hidden sm:inline'}>{label}</span>
    </button>
  )
}

const STATUS_TEXT: Record<SimStatus, string> = { idle: '編輯中', running: '模擬中', paused: '已暫停' }
const STATUS_DOT: Record<SimStatus, string> = { idle: 'bg-slate-400', running: 'bg-emerald-400', paused: 'bg-amber-400' }

/** 獨立成元件：模擬時間每幀變化，只讓這一小塊重繪 */
function StatusPill() {
  const status = useCircuitStore((s) => s.status)
  const time = useCircuitStore((s) => s.sim.time)
  return (
    <div className="flex shrink-0 items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs whitespace-nowrap text-slate-200">
      <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
      <span>{STATUS_TEXT[status]}</span>
      {status !== 'idle' && <span className="tabular-nums text-slate-400">{time.toFixed(1)} s</span>}
    </div>
  )
}

const Divider = () => <div className="mx-1 h-6 w-px shrink-0 bg-white/15" />

export function Toolbar() {
  const s = useCircuitStore(
    useShallow((st) => ({
      status: st.status,
      hasSelection: st.nodes.some((n) => n.selected) || st.edges.some((e) => e.selected),
      hasNodes: st.nodes.length > 0,
      canUndo: st.past.length > 0,
      canRedo: st.future.length > 0,
      dirty: st.dirty,
      stored: st.stored,
      name: st.info.name,
      play: st.play,
      pause: st.pause,
      reset: st.reset,
      undo: st.undo,
      redo: st.redo,
      rotateSelected: st.rotateSelected,
      flipSelected: st.flipSelected,
      deleteSelected: st.deleteSelected,
      replaceCircuit: st.replaceCircuit,
    })),
  )
  const { openDialog, notify } = useCircuitUi(useShallow((u) => ({ openDialog: u.openDialog, notify: u.notify })))
  const { fitView } = useReactFlow()
  const fileInput = useRef<HTMLInputElement>(null)
  const editing = s.status === 'idle'

  /** 會取代目前電路的動作：有未儲存的變更時先確認 */
  const confirmReplace = (message: string) => !s.hasNodes || !s.dirty || window.confirm(message)

  const fitSoon = () => {
    // fitView 會等到新節點量測完成才執行；空電路不呼叫，否則會排隊到下一個元件放下時才觸發
    if (useCircuitStore.getState().nodes.length > 0) void fitView(FIT_VIEW_OPTIONS)
  }

  const save = async () => {
    if (!s.stored) {
      openDialog('saveAs')
      return
    }
    try {
      await saveCircuit()
      notify('已儲存')
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'error')
    }
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 overflow-x-auto bg-slate-800 px-2 text-white sm:px-3">
      <WorkspaceTabs />

      {s.status === 'running' ? (
        <ToolButton onClick={s.pause} icon={<PauseIcon />} label="暫停" primary />
      ) : (
        <ToolButton onClick={s.play} icon={<PlayIcon />} label={s.status === 'paused' ? '繼續' : '播放'} primary />
      )}
      <ToolButton onClick={s.reset} disabled={editing} icon={<ResetIcon />} label="重置" />

      <Divider />
      <Menu
        label="檔案"
        icon={<FileIcon />}
        items={[
          {
            label: '新電路',
            disabled: !editing,
            onSelect: () => {
              if (!confirmReplace('目前的電路有未儲存的變更，要開新電路嗎？')) return
              s.replaceCircuit([], [])
            },
          },
          { label: '開啟…', hint: '電路清單（存在這台裝置）', onSelect: () => openDialog('files') },
          { label: '儲存', shortcut: 'Ctrl+S', disabled: !s.hasNodes && !s.stored, onSelect: () => void save() },
          { label: '另存新檔…', onSelect: () => openDialog('saveAs') },
          { divider: true },
          { label: `匯入迴路圖（${PCIR_EXT}）…`, disabled: !editing, onSelect: () => fileInput.current?.click() },
          { label: `匯出迴路圖（${PCIR_EXT}）`, disabled: !s.hasNodes, hint: '可寄給同事或在其他裝置開啟', onSelect: exportCircuitFile },
          { label: '匯出 BOM（CSV）', disabled: !s.hasNodes, onSelect: exportCircuitBom },
        ]}
      />
      <Menu
        label="範例"
        icon={<DemoIcon />}
        items={CIRCUIT_EXAMPLES.map((ex) => ({
          label: ex.name,
          hint: ex.description,
          disabled: !editing,
          onSelect: () => {
            if (!confirmReplace('載入範例會取代目前未儲存的電路，確定嗎？')) return
            const { nodes, edges } = ex.build()
            s.replaceCircuit(nodes, edges)
            useCircuitStore.getState().setInfo({ name: `範例：${ex.name}` })
            useCircuitStore.setState({ dirty: false })
            fitSoon()
          },
        }))}
      />

      <Divider />
      <ToolButton onClick={s.undo} disabled={!editing || !s.canUndo} icon={<UndoIcon />} label="復原" title="復原（Ctrl+Z）" compact />
      <ToolButton onClick={s.redo} disabled={!editing || !s.canRedo} icon={<RedoIcon />} label="重做" title="重做（Ctrl+Y）" compact />
      <ToolButton
        onClick={s.rotateSelected}
        disabled={!editing || !s.hasSelection}
        icon={<RotateIcon />}
        label="旋轉 90°"
        title="旋轉 90°（R）"
        compact
      />
      <ToolButton onClick={s.flipSelected} disabled={!editing || !s.hasSelection} icon={<FlipIcon />} label="鏡射" title="左右鏡射（H）" compact />
      <ToolButton
        onClick={s.deleteSelected}
        disabled={!editing || !s.hasSelection}
        icon={<TrashIcon />}
        label="刪除"
        title="刪除（Delete）"
        compact
      />

      <div className="ml-auto flex min-w-0 items-center gap-2 pl-2">
        <span className="hidden max-w-48 truncate text-sm text-slate-300 md:inline" title={s.name} data-circuit-name>
          {s.name}
          {(s.dirty || !s.stored) && s.hasNodes && <span className="ml-1 text-amber-300" title="有未儲存的變更">●</span>}
        </span>
        <StatusPill />
        <ToolButton onClick={() => useSettingsStore.getState().openDialog(true)} icon={<GearIcon />} label="設定" compact />
      </div>

      <input
        ref={fileInput}
        type="file"
        accept={`${PCIR_EXT},application/json`}
        className="hidden"
        data-testid="circuit-file-input"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          if (!confirmReplace('匯入會取代目前未儲存的電路，確定嗎？')) return
          importCircuitFile(file)
            .then(() => {
              notify(`已匯入「${useCircuitStore.getState().info.name}」（尚未存進電路清單）`)
              fitSoon()
            })
            .catch((err: unknown) => notify(err instanceof Error ? err.message : String(err), 'error'))
        }}
      />
    </header>
  )
}
