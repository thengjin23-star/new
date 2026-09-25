import { useWorkspace, type WorkspaceId } from './workspace'

const TABS: { id: WorkspaceId; label: string; hash: string }[] = [
  { id: 'circuit', label: '迴路圖', hash: '#/circuit' },
  { id: 'module', label: '模組組立', hash: '#/module' },
]

/** 深色工具列左側的工作區切換 */
export function WorkspaceTabs() {
  const current = useWorkspace()
  return (
    <nav className="mr-2 flex shrink-0 rounded-md bg-white/10 p-0.5" aria-label="工作區">
      {TABS.map((t) => (
        <a
          key={t.id}
          href={t.hash}
          aria-current={current === t.id ? 'page' : undefined}
          className={`rounded px-2.5 py-1 text-sm font-medium whitespace-nowrap ${current === t.id ? 'bg-white text-slate-800' : 'text-slate-200 hover:bg-white/10'}`}
        >
          {t.label}
        </a>
      ))}
    </nav>
  )
}
