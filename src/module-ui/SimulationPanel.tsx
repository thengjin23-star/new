import { useEffect, useState } from 'react'
import { Button } from '../components/ui'
import { DEFAULT_SUPPLY_PRESSURE } from '../engine'
import { PORT_STATE_COLOR, PORT_STATE_LABEL } from '../theme'
import { useModuleStore } from './moduleStore'

/**
 * 3D 模擬的控制面板（右上角）：暫停／重置／結束、供氣壓力、由模組推出迴路時的提醒。
 * 面板顯示期間以 requestAnimationFrame 推進模擬。
 */
export function SimulationPanel() {
  const sim = useModuleStore((s) => s.sim)
  const supply = useModuleStore((s) => s.doc.supply)
  const tick = useModuleStore((s) => s.tickSimulation)
  const { stopSimulation, resetSimulation, toggleSimulationPause, setSupply } = useModuleStore.getState()
  const [showAll, setShowAll] = useState(false)
  const running = !!sim && !sim.paused

  useEffect(() => {
    if (!running) return
    let frame = 0
    let last = performance.now()
    const loop = (now: number) => {
      // 分頁切到背景後回來時不要一次跳太多
      tick(Math.min(0.05, (now - last) / 1000))
      last = now
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [running, tick])

  if (!sim) return null
  const warnings = sim.mc.warnings
  const shown = showAll ? warnings : warnings.slice(0, 4)
  return (
    <section
      className="absolute top-3 right-3 z-10 w-72 max-w-[calc(100%-1.5rem)] space-y-2 rounded-lg border border-slate-200 bg-white/95 p-3 text-xs text-slate-700 shadow-lg"
      aria-label="3D 模擬"
    >
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800">{sim.paused ? '模擬已暫停' : '模擬中'}</h2>
        <span className="tabular-nums text-slate-400">{sim.state.time.toFixed(1)} s</span>
      </header>
      <p className="leading-5 text-slate-500">點選閥切換（按鈕閥要按住）。埠與 PU 管的顏色：</p>
      <p className="flex flex-wrap gap-x-3 gap-y-1">
        {(['pressure', 'exhaust', 'blocked'] as const).map((k) => (
          <span key={k} className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: PORT_STATE_COLOR[k] }} />
            {PORT_STATE_LABEL[k]}
          </span>
        ))}
      </p>
      {supply && (
        <label className="flex items-center gap-2">
          供氣壓力
          <input
            type="number"
            min={0.05}
            max={1.6}
            step={0.05}
            value={supply.pressure ?? DEFAULT_SUPPLY_PRESSURE}
            onChange={(e) => {
              const v = Number(e.target.value)
              if (v > 0) setSupply(supply, v)
            }}
            className="h-7 w-20 rounded border border-slate-300 px-1.5 text-right tabular-nums"
            aria-label="供氣壓力（MPa）"
          />
          MPa
        </label>
      )}
      {warnings.length > 0 && (
        <ul className="space-y-1" aria-label="模擬提醒">
          {shown.map((w, i) => (
            <li key={i} className={`rounded px-2 py-1 leading-4 ${w.kind === 'no-supply' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>
              {w.text}
            </li>
          ))}
          {warnings.length > shown.length && (
            <li>
              <button type="button" className="text-blue-700 hover:underline" onClick={() => setShowAll(true)}>
                還有 {warnings.length - shown.length} 項…
              </button>
            </li>
          )}
        </ul>
      )}
      {!supply && <p className="leading-5 text-slate-500">在「零件」頁選一個埠按「設為供氣口」，模擬就會從那裡供氣。</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={toggleSimulationPause}>
          {sim.paused ? '繼續' : '暫停'}
        </Button>
        <Button size="sm" onClick={resetSimulation}>
          重置
        </Button>
        <Button size="sm" variant="primary" className="ml-auto" onClick={stopSimulation}>
          結束模擬
        </Button>
      </div>
    </section>
  )
}
