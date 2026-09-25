import { useReactFlow } from '@xyflow/react'
import type { DragEvent } from 'react'
import { registry, type ComponentCategory } from '../engine'
import { useCircuitStore } from '../store/circuitStore'
import { COMPONENT_DRAG_MIME } from './canvasConfig'
import { getSymbol } from './symbols/symbolRegistry'

const CATEGORY_LABEL: Record<ComponentCategory, string> = {
  source: '氣源',
  valve: '方向控制閥',
  actuator: '致動器',
  misc: '其他',
}
const CATEGORY_ORDER: ComponentCategory[] = ['source', 'valve', 'actuator', 'misc']

function Preview({ type }: { type: string }) {
  const { width, height, Symbol } = getSymbol(type)
  const state = registry.get(type).createState()
  return (
    <svg viewBox={`-4 -4 ${width + 8} ${height + 8}`} className="h-10 w-full" preserveAspectRatio="xMidYMid meet">
      <Symbol state={state} rotation={0} />
    </svg>
  )
}

export function Palette() {
  const editing = useCircuitStore((s) => s.status === 'idle')
  const addComponent = useCircuitStore((s) => s.addComponent)
  const { screenToFlowPosition } = useReactFlow()

  /** 點一下：放到畫面中央（觸控裝置不支援 HTML5 拖放，這是主要的放置方式） */
  const addAtCenter = (type: string) => {
    const rect = document.querySelector('.react-flow')?.getBoundingClientRect()
    if (!rect) return
    const { width, height } = getSymbol(type)
    const count = useCircuitStore.getState().nodes.length
    const offset = (count % 6) * 24
    const center = screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
    addComponent(type, { x: center.x - width / 2 + offset, y: center.y - height / 2 + offset })
  }

  const onDragStart = (e: DragEvent, type: string) => {
    e.dataTransfer.setData(COMPONENT_DRAG_MIME, type)
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <aside className="flex shrink-0 flex-col border-slate-200 bg-white md:w-52 md:border-r">
      <h2 className="hidden px-3 pt-3 pb-1 text-xs font-semibold tracking-wide text-slate-500 md:block">元件</h2>
      <div className="flex gap-2 overflow-x-auto p-2 md:flex-col md:overflow-y-auto md:p-3 md:pt-1">
        {CATEGORY_ORDER.map((category) => {
          const defs = registry.list().filter((d) => d.category === category)
          if (defs.length === 0) return null
          return (
            <section key={category} className="flex shrink-0 gap-2 md:flex-col">
              <h3 className="hidden text-xs text-slate-400 md:block">{CATEGORY_LABEL[category]}</h3>
              {defs.map((def) => (
                <button
                  key={def.type}
                  type="button"
                  draggable={editing}
                  disabled={!editing}
                  onDragStart={(e) => onDragStart(e, def.type)}
                  onClick={() => addAtCenter(def.type)}
                  className="flex w-28 shrink-0 cursor-grab flex-col items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-2 text-xs text-slate-700 transition hover:border-blue-400 hover:bg-blue-50 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40 md:w-full"
                  title={`${def.label}：拖拉到畫布，或點一下加入`}
                >
                  <Preview type={def.type} />
                  <span>{def.label}</span>
                </button>
              ))}
            </section>
          )
        })}
      </div>
      {!editing && (
        <p className="hidden px-3 pb-3 text-xs text-slate-500 md:block">模擬中無法編輯，請先按「重置」。</p>
      )}
    </aside>
  )
}
