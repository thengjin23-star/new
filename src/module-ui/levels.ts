import type { MateLevel } from '../threads'

/** 搭配檢查結果的顏色（3D 標記用） */
export const LEVEL_COLOR: Record<MateLevel, string> = {
  ok: '#16a34a',
  warn: '#f59e0b',
  error: '#dc2626',
  unknown: '#94a3b8',
}

/** 搭配檢查結果的文字與樣式（面板用） */
export const LEVEL_STYLE: Record<MateLevel, { label: string; icon: string; box: string; text: string }> = {
  ok: { label: '正確', icon: '✓', box: 'border-green-300 bg-green-50', text: 'text-green-700' },
  warn: { label: '注意', icon: '!', box: 'border-amber-300 bg-amber-50', text: 'text-amber-700' },
  error: { label: '不相容', icon: '✕', box: 'border-red-300 bg-red-50', text: 'text-red-700' },
  unknown: { label: '未檢查', icon: '?', box: 'border-slate-300 bg-slate-50', text: 'text-slate-600' },
}
