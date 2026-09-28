import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { planSequence, registry, stepComplete, conditionMet, type SequenceStep } from '../../engine'
import { circuitSignalNames, describeSignal } from '../../store/circuitSignals'
import { useCircuitStore } from '../../store/circuitStore'
import { useCircuitUi } from '../../store/circuitUi'
import { isPneumaticNode, toCircuit } from '../../store/flow'
import type { DiagramMode } from '../../store/traceDiagram'
import { Button } from '../ui'
import { DisplacementDiagram } from './DisplacementDiagram'

/**
 * 程序控制面板（畫布下方）：以動作順序（A+ B+ B- A-）產生步驟、編輯步驟，
 * 自動／單步／停止／復歸，並顯示訊號燈與位移－步驟圖。
 */
export function SequencePanel() {
  const open = useCircuitUi((u) => u.sequenceOpen)
  if (!open) return null
  return (
    <section
      aria-label="程序控制"
      className="flex h-[60vh] shrink-0 flex-col border-t border-slate-300 bg-white text-sm shadow-[0_-2px_6px_rgba(15,23,42,0.06)] md:h-72"
    >
      <Controls />
      {/* 手機：步驟表與圖上下排、整塊捲動；寬螢幕：左右並排，各自捲動 */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
        <StepList />
        <DiagramPane />
      </div>
    </section>
  )
}

function Controls() {
  const s = useCircuitStore(
    useShallow((st) => ({
      status: st.status,
      steps: st.sequence.steps.length,
      notation: st.sequence.notation,
      mode: st.seq.mode,
      index: st.seq.index,
      waiting: st.seq.waiting,
      continuous: st.seq.continuous,
      cycles: st.seq.cycles,
    })),
  )
  const { seqAuto, seqStep, seqStop, seqHome, setContinuous } = useCircuitStore.getState()
  const running = s.mode !== 'off'
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-slate-200 px-3 py-2">
      <h2 className="text-sm font-semibold text-slate-800">程序控制</h2>
      <NotationInput key={s.notation ?? ''} initial={s.notation ?? ''} disabled={running} />
      <div className="flex items-center gap-1">
        <Button size="sm" variant="primary" disabled={!s.steps || s.mode === 'auto'} onClick={seqAuto} title="依序自動執行每一步">
          ▶ 自動
        </Button>
        <Button size="sm" disabled={!s.steps} onClick={seqStep} title="執行一步：條件成立後按一下進入下一步">
          ⏭ 單步
        </Button>
        <Button size="sm" disabled={!running} onClick={seqStop} title="停止程序（輸出保持）；再按自動從目前步驟繼續">
          ■ 停止
        </Button>
        <Button size="sm" disabled={s.status === 'idle'} onClick={seqHome} title="停止程序、輸出全部 OFF、氣缸回到初始位置">
          ⟲ 復歸
        </Button>
      </div>
      <label className="flex items-center gap-1 text-xs text-slate-600">
        <input type="checkbox" checked={s.continuous} onChange={(e) => setContinuous(e.target.checked)} />
        連續循環
      </label>
      <StatusText />
      <button
        type="button"
        onClick={() => useCircuitUi.getState().toggleSequence(false)}
        className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-100"
        aria-label="關閉程序控制"
      >
        ✕
      </button>
      <SignalLamps />
    </div>
  )
}

/** 動作順序：輸入 A+ B+ B- A- 後產生步驟 */
function NotationInput({ initial, disabled }: { initial: string; disabled: boolean }) {
  const [text, setText] = useState(initial)
  const [errors, setErrors] = useState<string[]>([])
  const generate = () => {
    const { nodes, edges, setSequence } = useCircuitStore.getState()
    const tags = new Map(nodes.filter(isPneumaticNode).map((n) => [n.id, n.data.tag || registry.get(n.data.componentType).label]))
    const plan = planSequence(toCircuit(nodes, edges), text, registry, (id) => tags.get(id) ?? id)
    setErrors(plan.errors)
    if (!plan.errors.length) {
      setSequence({ steps: plan.steps, notation: text.trim() })
      useCircuitUi.getState().notify(`已產生 ${plan.steps.length} 個步驟`)
    }
  }
  return (
    <div className="relative flex items-center gap-1">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && !disabled && generate()}
        placeholder="動作順序，例如 A+ B+ B- A-"
        aria-label="動作順序"
        disabled={disabled}
        className="h-7 w-44 rounded border border-slate-300 px-2 font-mono text-xs disabled:bg-slate-100"
      />
      <Button size="sm" onClick={generate} disabled={disabled || !text.trim()} title="依動作順序與迴路中的電磁閥、感測器產生步驟">
        產生步驟
      </Button>
      {errors.length > 0 && (
        <ul
          role="alert"
          className="absolute top-full left-0 z-20 mt-1 w-80 space-y-0.5 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700 shadow"
          onClick={() => setErrors([])}
        >
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function StatusText() {
  const text = useCircuitStore((st) => {
    const { seq, sequence, status } = st
    if (seq.index >= 0) {
      const step = sequence.steps[seq.index]
      if (!step) return ''
      const waiting = step.until.filter((c) => !conditionMet(c, st.sim.signals))
      const remain = Math.max(0, (step.delay ?? 0) - seq.elapsed)
      const head = `步驟 ${seq.index + 1}／${sequence.steps.length}${step.label ? ` ${step.label}` : ''}`
      if (seq.mode === 'off') return `${head}：已停止`
      if (stepComplete(step, seq.elapsed, st.sim.signals)) return seq.waiting ? `${head}：條件成立，按「單步」繼續` : head
      return `${head}：等待 ${[...waiting, ...(remain > 0 ? [`${remain.toFixed(1)} s`] : [])].join('、')}`
    }
    if (seq.cycles > 0) return `完成 ${seq.cycles} 個循環`
    return status === 'idle' ? '' : '程序未啟動'
  })
  return (
    <span className="text-xs text-slate-600" role="status" data-sequence-status>
      {text}
    </span>
  )
}

/** 訊號燈：感測器與輸出目前的狀態（模擬中） */
function SignalLamps() {
  const nodes = useCircuitStore((st) => st.nodes)
  const names = useMemo(() => circuitSignalNames(nodes), [nodes])
  const all = useMemo(() => [...names.sensors, ...names.outputs], [names])
  // 只訂閱這些訊號的開關狀態：沒有變化時不重繪
  const lit = useCircuitStore(useShallow((st) => all.map((n) => st.status !== 'idle' && !!st.sim.signals[n])))
  if (!all.length) return null
  return (
    <ul className="flex w-full flex-wrap gap-x-2.5 gap-y-1 text-[11px] text-slate-600" aria-label="訊號">
      {all.map((n, i) => {
        const on = lit[i]
        return (
          <li key={n} className="flex items-center gap-1" title={describeSignal(n)} data-signal={n} data-on={on || undefined}>
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full border ${on ? (/^Y/.test(n) ? 'border-amber-600 bg-amber-400' : 'border-green-700 bg-green-500') : 'border-slate-400 bg-white'}`}
            />
            <span className="font-mono">{n}</span>
          </li>
        )
      })}
    </ul>
  )
}

function StepList() {
  const sequence = useCircuitStore((st) => st.sequence)
  const nodes = useCircuitStore((st) => st.nodes)
  const current = useCircuitStore((st) => (st.seq.index >= 0 ? st.seq.index : -1))
  const locked = useCircuitStore((st) => st.seq.mode !== 'off')
  const names = useMemo(() => circuitSignalNames(nodes), [nodes])
  const setSequence = useCircuitStore((st) => st.setSequence)
  const update = (steps: SequenceStep[]) => setSequence({ ...sequence, steps })
  const patch = (i: number, p: Partial<SequenceStep>) => update(sequence.steps.map((s, k) => (k === i ? { ...s, ...p } : s)))
  const move = (i: number, d: -1 | 1) => {
    const steps = [...sequence.steps]
    const [s] = steps.splice(i, 1)
    steps.splice(i + d, 0, s)
    update(steps)
  }

  return (
    <div className="shrink-0 border-slate-200 md:min-h-0 md:w-[30rem] md:overflow-y-auto md:border-r">
      {sequence.steps.length === 0 ? (
        <p className="p-3 text-xs leading-5 text-slate-500">
          還沒有步驟。在上方輸入動作順序（例如 <span className="font-mono">A+ B+ B- A-</span>）按「產生步驟」，
          系統會依迴路中氣缸的代號、驅動它的電磁閥與線圈（Y1…）產生每一步；也可以按下方「新增步驟」自己編。
        </p>
      ) : (
        <table className="w-full text-xs" aria-label="程序步驟">
          <thead className="sticky top-0 bg-slate-50 text-left text-[11px] text-slate-500">
            <tr>
              <th className="w-7 py-1 pl-2">#</th>
              <th className="w-14 py-1">動作</th>
              <th className="py-1">輸出</th>
              <th className="py-1">轉移條件</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody>
            {sequence.steps.map((step, i) => (
              <tr
                key={i}
                className={`border-t border-slate-100 align-top ${i === current ? 'bg-blue-50' : ''}`}
                data-step={i + 1}
                data-current={i === current || undefined}
              >
                <td className={`py-1.5 pl-2 font-semibold ${i === current ? 'text-blue-700' : 'text-slate-500'}`}>{i + 1}</td>
                <td className="py-1 pr-1">
                  <input
                    value={step.label ?? ''}
                    disabled={locked}
                    onChange={(e) => patch(i, { label: e.target.value || undefined })}
                    className="h-6 w-12 rounded border border-transparent px-1 font-mono hover:border-slate-200 focus:border-slate-300 disabled:bg-transparent"
                    aria-label={`步驟 ${i + 1} 名稱`}
                  />
                </td>
                <td className="py-1 pr-1">
                  <OutputChips step={step} outputs={names.outputs} disabled={locked} onChange={(set) => patch(i, { set })} />
                </td>
                <td className="py-1 pr-1">
                  <ConditionChips step={step} sensors={names.sensors} outputs={names.outputs} disabled={locked} onChange={(p) => patch(i, p)} />
                </td>
                <td className="py-1 pr-1 text-right whitespace-nowrap">
                  <IconButton label="上移" disabled={locked || i === 0} onClick={() => move(i, -1)}>
                    ↑
                  </IconButton>
                  <IconButton label="下移" disabled={locked || i === sequence.steps.length - 1} onClick={() => move(i, 1)}>
                    ↓
                  </IconButton>
                  <IconButton label="刪除這一步" disabled={locked} onClick={() => update(sequence.steps.filter((_, k) => k !== i))}>
                    ✕
                  </IconButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="flex gap-2 px-2 py-2">
        <Button size="sm" disabled={locked} onClick={() => update([...sequence.steps, { set: {}, until: [] }])}>
          ＋ 新增步驟
        </Button>
        {sequence.steps.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            disabled={locked}
            onClick={() => window.confirm('清除所有步驟？') && setSequence({ steps: [] })}
          >
            清除
          </Button>
        )}
      </div>
    </div>
  )
}

function IconButton({ label, children, ...props }: { label: string; children: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      {...props}
      aria-label={label}
      title={label}
      className="h-6 w-5 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30"
    >
      {children}
    </button>
  )
}

const chip = 'inline-flex items-center gap-0.5 rounded border px-1 py-px font-mono text-[11px]'

/** 這一步設定的輸出：點一下切換 ON／OFF，✕ 移除；下拉加入其他輸出 */
function OutputChips({
  step,
  outputs,
  disabled,
  onChange,
}: {
  step: SequenceStep
  outputs: readonly string[]
  disabled: boolean
  onChange: (set: Record<string, boolean>) => void
}) {
  const entries = Object.entries(step.set)
  const rest = outputs.filter((o) => !(o in step.set))
  return (
    <div className="flex flex-wrap items-center gap-1">
      {entries.map(([name, on]) => (
        <span key={name} className={`${chip} ${on ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-slate-300 bg-slate-50 text-slate-600'}`}>
          <button type="button" disabled={disabled} onClick={() => onChange({ ...step.set, [name]: !on })} title="切換 ON／OFF">
            {name} {on ? 'ON' : 'OFF'}
          </button>
          {!disabled && (
            <button
              type="button"
              className="text-slate-400 hover:text-red-600"
              aria-label={`移除 ${name}`}
              onClick={() => onChange(Object.fromEntries(entries.filter(([k]) => k !== name)))}
            >
              ×
            </button>
          )}
        </span>
      ))}
      {!disabled && rest.length > 0 && (
        <select
          value=""
          onChange={(e) => e.target.value && onChange({ ...step.set, [e.target.value]: true })}
          className="h-5 w-9 rounded border border-dashed border-slate-300 bg-white px-0.5 text-[11px] text-slate-500"
          aria-label="加入輸出"
        >
          <option value="">＋</option>
          {rest.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )}
      {entries.length === 0 && disabled && <span className="text-slate-400">—</span>}
    </div>
  )
}

/** 轉移條件：感測訊號（可取反）與計時 */
function ConditionChips({
  step,
  sensors,
  outputs,
  disabled,
  onChange,
}: {
  step: SequenceStep
  sensors: readonly string[]
  outputs: readonly string[]
  disabled: boolean
  onChange: (p: Partial<SequenceStep>) => void
}) {
  const options = [...sensors, ...outputs].filter((n) => !step.until.includes(n) && !step.until.includes(`!${n}`))
  return (
    <div className="flex flex-wrap items-center gap-1">
      {step.until.map((c) => (
        <span key={c} className={`${chip} border-green-300 bg-green-50 text-green-800`} title={describeSignal(c)}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange({ until: step.until.map((x) => (x === c ? (c.startsWith('!') ? c.slice(1) : `!${c}`) : x)) })}
            title="切換成立／不成立"
          >
            {c.startsWith('!') ? `${c.slice(1)} 不成立` : c}
          </button>
          {!disabled && (
            <button type="button" className="text-slate-400 hover:text-red-600" aria-label={`移除 ${c}`} onClick={() => onChange({ until: step.until.filter((x) => x !== c) })}>
              ×
            </button>
          )}
        </span>
      ))}
      {!disabled && options.length > 0 && (
        <select
          value=""
          onChange={(e) => e.target.value && onChange({ until: [...step.until, e.target.value] })}
          className="h-5 w-9 rounded border border-dashed border-slate-300 bg-white px-0.5 text-[11px] text-slate-500"
          aria-label="加入條件"
        >
          <option value="">＋</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {describeSignal(o)}
            </option>
          ))}
        </select>
      )}
      <label className="flex items-center gap-0.5 text-[11px] text-slate-500" title="這一步至少停留的秒數">
        ⏱
        <input
          type="number"
          min={0}
          step={0.1}
          value={step.delay ?? ''}
          disabled={disabled}
          placeholder="0"
          onChange={(e) => {
            const v = Number(e.target.value)
            onChange({ delay: e.target.value === '' || !(v > 0) ? undefined : v })
          }}
          className="h-5 w-10 rounded border border-slate-200 px-0.5 text-right tabular-nums disabled:bg-transparent"
          aria-label="計時（秒）"
        />
        s
      </label>
    </div>
  )
}

function DiagramPane() {
  const trace = useCircuitStore((st) => st.trace)
  const [mode, setMode] = useState<DiagramMode>('step')
  const now = trace?.samples[trace.samples.length - 1]?.t ?? 0
  return (
    <div className="flex min-h-56 min-w-0 shrink-0 flex-col border-t border-slate-200 md:min-h-0 md:flex-1 md:shrink md:border-t-0">
      <div className="flex items-center gap-2 px-3 pt-1.5 text-xs">
        <span className="font-semibold text-slate-700">{mode === 'step' ? '位移－步驟圖' : '位移－時間圖'}</span>
        <div className="ml-auto flex overflow-hidden rounded border border-slate-300" role="group" aria-label="圖表橫軸">
          {(['step', 'time'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={`px-2 py-0.5 ${mode === m ? 'bg-slate-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              {m === 'step' ? '步驟' : '時間'}
            </button>
          ))}
        </div>
      </div>
      <DisplacementDiagram trace={trace} mode={mode} now={now} />
    </div>
  )
}
