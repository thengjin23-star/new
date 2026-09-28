import { useEffect, useMemo, useRef, useState } from 'react'
import type { Trace } from '../../store/trace'
import { diagramGeometry, LABEL_SIZE, LABEL_SUB_SIZE, type DiagramMode } from '../../store/traceDiagram'

/** 監看元素寬度（圖表依容器寬度重新排版） */
function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

const LINE_COLOR = { cylinder: '#2563eb', output: '#b45309' } as const

/** 位移－步驟圖（或位移－時間圖）：各氣缸的活塞位置與電氣輸出 */
export function DisplacementDiagram({ trace, mode, now }: { trace: Trace | undefined; mode: DiagramMode; now: number }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const geometry = useMemo(() => (trace && width > 0 ? diagramGeometry(trace, mode, width, now) : undefined), [trace, mode, width, now])

  return (
    <div ref={ref} className="relative min-h-0 w-full flex-1 overflow-auto">
      {!trace && <p className="p-3 text-xs leading-5 text-slate-500">按「播放」或「自動」開始模擬後，這裡會記錄各氣缸的位置與輸出。</p>}
      {trace && !trace.rows.length && <p className="p-3 text-xs leading-5 text-slate-500">電路中沒有氣缸或有命名的電磁線圈可以記錄。</p>}
      {geometry && trace && trace.rows.length > 0 && (
        <svg
          width={geometry.width}
          height={geometry.height}
          className="block"
          data-diagram={geometry.mode}
          data-steps={geometry.mode === 'step' ? geometry.columns.length : undefined}
          aria-label={geometry.mode === 'step' ? '位移－步驟圖' : '位移－時間圖'}
        >
          {geometry.lines.map((l, i) => (
            <g key={i}>
              <line
                x1={l.x}
                y1={l.style === 'step' ? 14 : 20}
                x2={l.x}
                y2={geometry.height - 4}
                stroke={l.style === 'mark' ? '#94a3b8' : '#cbd5e1'}
                strokeWidth={1}
                strokeDasharray={l.style === 'step' ? undefined : '3 3'}
              />
              {l.label && (
                <text x={l.x} y={l.style === 'mark' ? 26 : 10} fontSize={10} textAnchor="middle" fill={l.style === 'mark' ? '#64748b' : '#475569'}>
                  {l.label}
                </text>
              )}
            </g>
          ))}
          {geometry.columns.map((c, i) => (
            <text key={i} x={c.x} y={24} fontSize={10} textAnchor="middle" fill="#334155" fontWeight={600}>
              {c.text}
            </text>
          ))}
          {geometry.rows.map((r) => (
            <g key={r.label} data-row={r.label} data-points={r.points.length}>
              <line x1={geometry.left} y1={r.top} x2={geometry.right} y2={r.top} stroke="#e2e8f0" />
              <line x1={geometry.left} y1={r.top + r.height} x2={geometry.right} y2={r.top + r.height} stroke="#e2e8f0" />
              <text x={geometry.left - 8} y={r.top + r.height / 2 - (r.lines.length > 1 ? 6 : 0)} fontSize={LABEL_SIZE} textAnchor="end" dominantBaseline="central" fill="#334155">
                <title>{r.label}</title>
                {r.lines[0]}
              </text>
              {r.lines[1] && (
                <text x={geometry.left - 8} y={r.top + r.height / 2 + 7} fontSize={LABEL_SUB_SIZE} textAnchor="end" dominantBaseline="central" fill="#64748b">
                  {r.lines[1]}
                </text>
              )}
              {r.kind === 'cylinder' && (
                <>
                  <text x={geometry.left - 2} y={r.top} fontSize={8} textAnchor="end" dominantBaseline="central" fill="#94a3b8">
                    1
                  </text>
                  <text x={geometry.left - 2} y={r.top + r.height} fontSize={8} textAnchor="end" dominantBaseline="central" fill="#94a3b8">
                    0
                  </text>
                </>
              )}
              <polyline
                points={r.points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}
                fill="none"
                stroke={LINE_COLOR[r.kind]}
                strokeWidth={r.kind === 'cylinder' ? 2.2 : 1.6}
                strokeLinejoin="round"
              />
            </g>
          ))}
          {geometry.note && (
            <text x={geometry.left} y={geometry.height / 2} fontSize={11} fill="#64748b">
              {geometry.note}
            </text>
          )}
        </svg>
      )}
    </div>
  )
}
