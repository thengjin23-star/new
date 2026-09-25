import { useReactFlow } from '@xyflow/react'
import type { ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { createDemoCircuit } from '../fixtures/demoCircuit'
import { useCircuitStore, type SimStatus } from '../store/circuitStore'
import { FIT_VIEW_OPTIONS } from './canvasConfig'
import { DemoIcon, NewIcon, PauseIcon, PlayIcon, ResetIcon, RotateIcon, TrashIcon } from './icons'

function ToolButton({
  onClick,
  disabled,
  title,
  icon,
  label,
  primary,
}: {
  onClick: () => void
  disabled?: boolean
  title?: string
  icon: ReactNode
  label: string
  primary?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      aria-label={label}
      className={[
        'flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-35',
        primary ? 'bg-blue-600 text-white hover:bg-blue-500' : 'text-slate-100 hover:bg-white/10',
      ].join(' ')}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
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
    <div className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs whitespace-nowrap text-slate-200">
      <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
      <span>{STATUS_TEXT[status]}</span>
      {status !== 'idle' && <span className="tabular-nums text-slate-400">{time.toFixed(1)} s</span>}
    </div>
  )
}

const Divider = () => <div className="mx-1 h-6 w-px bg-white/15" />

export function Toolbar() {
  const { status, hasSelection, hasNodes, play, pause, reset, rotateSelected, deleteSelected, replaceCircuit } =
    useCircuitStore(
      useShallow((s) => ({
        status: s.status,
        hasSelection: s.nodes.some((n) => n.selected) || s.edges.some((e) => e.selected),
        hasNodes: s.nodes.length > 0,
        play: s.play,
        pause: s.pause,
        reset: s.reset,
        rotateSelected: s.rotateSelected,
        deleteSelected: s.deleteSelected,
        replaceCircuit: s.replaceCircuit,
      })),
    )
  const { fitView } = useReactFlow()
  const editing = status === 'idle'

  const replace = (build: () => ReturnType<typeof createDemoCircuit>, message: string) => {
    if (hasNodes && !window.confirm(message)) return
    const { nodes, edges } = build()
    replaceCircuit(nodes, edges)
    // fitView 會等到新節點量測完成才執行；空電路不呼叫，否則會排隊到下一個元件放下時才觸發
    if (nodes.length > 0) void fitView(FIT_VIEW_OPTIONS)
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 bg-slate-800 px-2 text-white sm:px-3">
      <h1 className="mr-2 hidden text-sm font-semibold whitespace-nowrap lg:block">氣動迴路模擬器</h1>

      {status === 'running' ? (
        <ToolButton onClick={pause} icon={<PauseIcon />} label="暫停" primary />
      ) : (
        <ToolButton onClick={play} icon={<PlayIcon />} label={status === 'paused' ? '繼續' : '播放'} primary />
      )}
      <ToolButton onClick={reset} disabled={editing} icon={<ResetIcon />} label="重置" />

      <Divider />
      <ToolButton
        onClick={rotateSelected}
        disabled={!editing || !hasSelection}
        icon={<RotateIcon />}
        label="旋轉 90°"
        title="旋轉 90°（R）"
      />
      <ToolButton
        onClick={deleteSelected}
        disabled={!editing || !hasSelection}
        icon={<TrashIcon />}
        label="刪除"
        title="刪除（Delete）"
      />

      <Divider />
      <ToolButton
        onClick={() => replace(createDemoCircuit, '載入範例會取代目前的電路，確定嗎？')}
        icon={<DemoIcon />}
        label="載入範例"
      />
      <ToolButton
        onClick={() => replace(() => ({ nodes: [], edges: [] }), '要清空目前的電路嗎？')}
        disabled={!hasNodes}
        icon={<NewIcon />}
        label="新電路"
      />

      <div className="ml-auto">
        <StatusPill />
      </div>
    </header>
  )
}
