import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react'
import type { MateLevel } from '../threads'
import { LEVEL_STYLE } from './levels'

type Variant = 'default' | 'primary' | 'danger' | 'warn' | 'ghost'

const VARIANT: Record<Variant, string> = {
  default: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
  primary: 'bg-blue-600 text-white hover:bg-blue-500',
  danger: 'border border-red-300 bg-white text-red-700 hover:bg-red-50',
  warn: 'bg-amber-500 text-white hover:bg-amber-400',
  ghost: 'text-slate-600 hover:bg-slate-100',
}

export function Button({
  variant = 'default',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      {...props}
      className={[
        'inline-flex items-center justify-center gap-1 rounded-md font-medium transition disabled:cursor-not-allowed disabled:opacity-40',
        size === 'sm' ? 'h-7 px-2 text-xs' : 'h-9 px-3 text-sm',
        VARIANT[variant],
        className,
      ].join(' ')}
    />
  )
}

/** 深色工具列上的按鈕 */
export function BarButton({ label, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      {...props}
      className="h-9 rounded-md px-2.5 text-sm font-medium whitespace-nowrap text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
    >
      {label}
    </button>
  )
}

export function Dialog({
  title,
  onClose,
  children,
  footer,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-lg bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold text-slate-800">{title}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="關閉">
            ✕
          </button>
        </header>
        <div className="overflow-y-auto px-4 py-3">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-4 py-3">{footer}</footer>}
      </div>
    </div>
  )
}

export function LevelBadge({ level }: { level: MateLevel }) {
  const s = LEVEL_STYLE[level]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${s.box} ${s.text}`}>
      <span aria-hidden>{s.icon}</span>
      {s.label}
    </span>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="p-4 text-sm leading-6 text-slate-500">{children}</p>
}
