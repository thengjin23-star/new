import type { NodeProps } from '@xyflow/react'
import { memo, useState } from 'react'
import { useCircuitStore } from '../../store/circuitStore'
import type { NoteFlowNode } from '../../store/flow'

/** 文字註解：雙擊編輯（也可在屬性面板修改） */
function NoteNodeImpl({ id, data, selected }: NodeProps<NoteFlowNode>) {
  const editing = useCircuitStore((s) => s.status === 'idle')
  const updateNote = useCircuitStore((s) => s.updateNote)
  const [draft, setDraft] = useState<string | undefined>()

  if (draft !== undefined) {
    return (
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== data.text) updateNote(id, draft)
          setDraft(undefined)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setDraft(undefined)
          e.stopPropagation()
        }}
        className="nodrag nowheel block min-h-10 min-w-40 rounded border border-blue-400 bg-white p-1.5 text-[13px] leading-5 text-slate-800 shadow-sm outline-none"
        rows={Math.max(2, draft.split('\n').length)}
        aria-label="註解文字"
      />
    )
  }
  return (
    <div
      onDoubleClick={() => editing && setDraft(data.text)}
      className={[
        'max-w-72 min-w-16 rounded px-1.5 py-1 text-[13px] leading-5 whitespace-pre-wrap text-slate-700',
        selected ? 'outline-2 outline-offset-2 outline-blue-500 outline-dashed' : '',
      ].join(' ')}
      title={editing ? '雙擊編輯文字' : undefined}
      data-note
    >
      {data.text || <span className="text-slate-400">（空白註解）</span>}
    </div>
  )
}

export const NoteNode = memo(NoteNodeImpl)
