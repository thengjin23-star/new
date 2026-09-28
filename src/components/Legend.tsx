import { PORT_STATE_COLOR, PORT_STATE_LABEL, WARNING_COLOR } from '../theme'
import type { PortState } from '../engine'
import { useCircuitStore } from '../store/circuitStore'
import { isPilotTube, pilotPorts } from '../store/flow'

const STATES: PortState[] = ['pressure', 'exhaust', 'blocked']

export function Legend() {
  // 電路中有控制管線（接到先導埠）時才說明虛線
  const hasPilot = useCircuitStore((s) => {
    const pilots = pilotPorts(s.nodes)
    return pilots.size > 0 && s.edges.some((e) => isPilotTube(e, pilots))
  })
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-slate-200 bg-white/90 px-3 py-1.5 text-xs text-slate-600 shadow-sm">
      {STATES.map((s) => (
        <span key={s} className="flex items-center gap-1.5">
          <span className="inline-block h-1 w-5 rounded-full" style={{ background: PORT_STATE_COLOR[s] }} />
          {PORT_STATE_LABEL[s]}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: WARNING_COLOR }} />
        未連接的排氣埠
      </span>
      {hasPilot && (
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-5 border-t-2 border-dashed border-slate-500" />
          控制管線
        </span>
      )}
    </div>
  )
}
