import { DEFAULT_TUBE_LENGTH, fmt, type SizingSettings, type SizingSummary } from '../../sizing/sizing'
import { Button } from '../ui'
import { NumberInput } from './CylinderSizing'

/**
 * 耗氣量合計：每支氣缸每循環的動作次數與耗氣量，每分鐘耗氣量與峰值流量。
 * 每分鐘循環數可依模擬的循環時間一鍵帶入。迴路圖與 3D 模組共用。
 */
export function AirSummary({
  summary,
  settings,
  onChange,
  cycleTime,
  tubeLengthEditable,
  onSelect,
}: {
  summary: SizingSummary
  settings: SizingSettings
  onChange: (patch: Partial<SizingSettings>) => void
  /** 模擬中最近一個完整循環的時間（秒） */
  cycleTime?: number
  /** 迴路圖：可以設定每條配管的長度 */
  tubeLengthEditable?: boolean
  /** 點選氣缸（選取元件） */
  onSelect?: (id: string) => void
}) {
  if (!summary.rows.length) return <p className="text-xs text-slate-500">沒有氣缸。</p>
  const suggested = cycleTime ? Math.round((60 / cycleTime) * 10) / 10 : undefined
  return (
    <div className="space-y-2" aria-label="耗氣量" data-air-summary>
      <div className="grid grid-cols-2 gap-2">
        <NumberInput label="每分鐘循環數" value={settings.cyclesPerMinute} placeholder="—" onCommit={(v) => onChange({ cyclesPerMinute: v })} aria="每分鐘循環數" />
        <NumberInput label="計算壓力（MPa）" value={settings.pressure} placeholder="依迴路" step={0.05} onCommit={(v) => onChange({ pressure: v })} aria="計算壓力（MPa）" />
        {tubeLengthEditable && (
          <NumberInput
            label="每條配管長度（m）"
            value={settings.tubeLength}
            placeholder={String(DEFAULT_TUBE_LENGTH)}
            step={0.1}
            onCommit={(v) => onChange({ tubeLength: v })}
            aria="每條配管長度（m）"
          />
        )}
      </div>
      {suggested !== undefined && suggested !== settings.cyclesPerMinute && (
        <p className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600" data-cycle-suggestion={suggested}>
          依模擬：一個循環 {fmt(cycleTime!)} 秒，約每分鐘 {suggested} 次
          <Button size="sm" onClick={() => onChange({ cyclesPerMinute: suggested })}>
            套用
          </Button>
        </p>
      )}
      <table className="w-full text-xs" aria-label="耗氣量明細">
        <thead className="text-left text-[11px] text-slate-500">
          <tr>
            <th className="py-1 font-normal">氣缸</th>
            <th className="py-1 font-normal">每循環</th>
            <th className="py-1 text-right font-normal">NL／循環</th>
          </tr>
        </thead>
        <tbody>
          {summary.rows.map((r) => (
            <tr key={r.id} className="border-t border-slate-100 align-top" data-air-row={r.label}>
              <td className="py-1 pr-1">
                {onSelect ? (
                  <button type="button" className="text-left text-slate-800 hover:underline" onClick={() => onSelect(r.id)}>
                    {r.label}
                  </button>
                ) : (
                  r.label
                )}
              </td>
              <td className="py-1 pr-1 text-slate-600" title={r.motions.fromSequence ? '依程序' : '沒有程序：伸、縮各一次'}>
                伸 {r.motions.extend}／縮 {r.motions.retract}
                {!r.motions.fromSequence && <span className="text-slate-400">*</span>}
              </td>
              <td className="py-1 text-right tabular-nums text-slate-700">{fmt(r.perCycle)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded-md bg-slate-50 p-2 text-xs">
        <dt className="text-slate-500">每循環</dt>
        <dd className="text-right tabular-nums text-slate-800" data-per-cycle={summary.perCycle.toFixed(4)}>
          {fmt(summary.perCycle)} NL
        </dd>
        <dt className="text-slate-500">平均耗氣量</dt>
        <dd className="text-right tabular-nums text-slate-800" data-per-minute={summary.perMinute?.toFixed(3)}>
          {summary.perMinute !== undefined ? `${fmt(summary.perMinute)} NL/min` : '輸入每分鐘循環數'}
        </dd>
        <dt className="text-slate-500">峰值流量</dt>
        <dd className="text-right tabular-nums text-slate-800" data-peak={summary.peak.toFixed(3)}>
          {fmt(summary.peak)} L/min（ANR）
        </dd>
      </dl>
      <p className="text-[10px] leading-4 text-slate-400">
        {summary.rows.some((r) => !r.motions.fromSequence) && '* 程序中沒有這支氣缸，以伸、縮各一次計算。'}
        峰值流量是同一步同時動作的氣缸所需流量的合計；空壓機與三點組合的流量應大於峰值，並有餘裕供應平均耗氣量。
      </p>
    </div>
  )
}
