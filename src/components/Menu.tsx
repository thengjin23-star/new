import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDownIcon } from './icons'

export type MenuItem =
  | { label: string; onSelect: () => void; disabled?: boolean; hint?: string; shortcut?: string }
  | { divider: true }
  | { heading: string }

/** 深色工具列上的下拉選單 */
export function Menu({ label, icon, items, align = 'left' }: { label: string; icon?: ReactNode; items: MenuItem[]; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-9 items-center gap-1 rounded-md px-2.5 text-sm font-medium text-slate-100 transition hover:bg-white/10 ${open ? 'bg-white/10' : ''}`}
      >
        {icon}
        <span className="hidden sm:inline">{label}</span>
        <ChevronDownIcon />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          className={`absolute top-full z-50 mt-1 max-h-[70vh] min-w-56 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 text-sm text-slate-700 shadow-lg ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {items.map((item, i) => {
            if ('divider' in item) return <div key={i} className="my-1 border-t border-slate-100" />
            if ('heading' in item)
              return (
                <div key={i} className="px-3 pt-2 pb-1 text-xs font-semibold text-slate-400">
                  {item.heading}
                </div>
              )
            return (
              <button
                key={i}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false)
                  item.onSelect()
                }}
                className="flex w-full items-start justify-between gap-4 px-3 py-1.5 text-left hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span>
                  <span className="block">{item.label}</span>
                  {item.hint && <span className="block text-xs text-slate-400">{item.hint}</span>}
                </span>
                {item.shortcut && <span className="shrink-0 text-xs text-slate-400">{item.shortcut}</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
