import { useState } from 'react'
import type { ParamValue, Params } from '../../engine'
import { fmt, LOAD_FACTOR_PRESETS, theoreticalForces, type SizingRow } from '../../sizing/sizing'
import { Button } from '../ui'

const inputClass = 'mt-0.5 h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-800'
const CUSTOM = 'custom'

/**
 * 一支氣缸的選型：輸入負載、負載率與方向，顯示理論出力、負載率判定、建議缸徑、
 * 每次動作的耗氣量、所需流量、建議的閥與管徑。迴路圖與 3D 模組共用。
 */
export function CylinderSizing({
  row,
  params,
  onParam,
  onApplyBore,
  pressureNote,
  applyNote,
}: {
  row: SizingRow
  /** 負載、負載率、方向目前的參數值（沒有設定時 undefined） */
  params: Params | undefined
  onParam: (key: 'load' | 'loadFactor' | 'loadDir', value: ParamValue | undefined) => void
  /** 套用建議缸徑（沒有提供時不顯示按鈕） */
  onApplyBore?: (bore: number) => void
  /** 計算壓力的來源說明，例如「依迴路」 */
  pressureNote?: string
  /** 套用缸徑時的提醒，例如已指定型號 */
  applyNote?: string
}) {
  const { cylinder: c, load, air, bore } = row
  const single = !!c.single
  const presetValue = LOAD_FACTOR_PRESETS.some((p) => Math.abs(p.value - load.loadFactor) < 1e-9) ? String(load.loadFactor) : CUSTOM
  const [custom, setCustom] = useState(presetValue === CUSTOM)
  const tubeNL = air.tubeExtend + air.tubeRetract
  const flow = Math.max(air.flow.extend, air.flow.retract)
  const force = bore?.force ?? theoreticalForces(c, row.pressure)

  return (
    <section className="space-y-2" aria-label="選型" data-sizing={row.id}>
      <div className="grid grid-cols-2 gap-2">
        <NumberInput
          label="負載（N）"
          value={typeof params?.load === 'number' ? params.load : undefined}
          placeholder="0"
          onCommit={(v) => onParam('load', v)}
          aria="負載（N）"
        />
        <label className="block text-xs text-slate-500" title="負載 ÷ 理論出力的上限">
          負載率
          <select
            value={custom ? CUSTOM : presetValue}
            onChange={(e) => {
              if (e.target.value === CUSTOM) {
                setCustom(true)
                return
              }
              setCustom(false)
              onParam('loadFactor', Number(e.target.value))
            }}
            className={inputClass}
            aria-label="負載率"
          >
            {LOAD_FACTOR_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
            <option value={CUSTOM}>自訂…</option>
          </select>
        </label>
        {custom && (
          <NumberInput
            label="自訂負載率"
            value={load.loadFactor}
            step={0.05}
            onCommit={(v) => onParam('loadFactor', v !== undefined ? Math.min(1, Math.max(0.05, v)) : undefined)}
            aria="自訂負載率"
          />
        )}
        {!single && (
          <label className="block text-xs text-slate-500">
            負載方向
            <select value={load.direction} onChange={(e) => onParam('loadDir', e.target.value)} className={inputClass} aria-label="負載方向">
              <option value="extend">伸出（推）</option>
              <option value="retract">縮回（拉）</option>
              <option value="both">兩方向</option>
            </select>
          </label>
        )}
      </div>

      <ul className="space-y-1 rounded-md bg-slate-50 p-2 text-[11px] leading-4 text-slate-600">
        <li>
          計算壓力 {fmt(row.pressure)} MPa{pressureNote ? `（${pressureNote}）` : ''}
        </li>
        <li>
          理論出力：伸出 {fmt(force.extend)} N{single ? '（未扣彈簧反力）' : `、縮回 ${fmt(force.retract)} N`}
        </li>
        {bore ? (
          <li data-load-ratio={bore.ratio.toFixed(3)} data-bore-ok={bore.ok || undefined}>
            <span className={bore.ok ? 'font-semibold text-emerald-700' : 'font-semibold text-red-700'}>
              負載率 {Number.isFinite(bore.ratio) ? bore.ratio.toFixed(2) : '—'} {bore.ok ? '✓' : '✕'}
            </span>
            （上限 {load.loadFactor}，需要出力 {fmt(bore.required)} N）
            {bore.recommended === undefined ? (
              <span className="block text-red-700">負載太大：標準缸徑都不夠，請降低負載或提高壓力。</span>
            ) : (
              bore.recommended !== c.bore && (
                <span className="mt-1 flex flex-wrap items-center gap-2" data-bore-recommended={bore.recommended}>
                  <span>
                    建議缸徑 <strong className="text-slate-800">Ø{bore.recommended}</strong>
                    {bore.ok ? '（目前的缸徑有餘裕）' : ''}
                  </span>
                  {onApplyBore && (
                    <Button size="sm" onClick={() => onApplyBore(bore.recommended!)}>
                      套用 Ø{bore.recommended}
                    </Button>
                  )}
                  {applyNote && <span className="w-full text-slate-500">{applyNote}</span>}
                </span>
              )
            )}
          </li>
        ) : (
          <li className="text-slate-500">輸入負載後會檢核缸徑並建議尺寸。</li>
        )}
        <li>
          耗氣量：每次伸出 {fmt(air.extend)} NL{single ? '' : `、縮回 ${fmt(air.retract)} NL`}
          {tubeNL > 0 && `（含配管 ${fmt(tubeNL)} NL）`}
        </li>
        <li>所需流量：{fmt(flow)} L/min（ANR）</li>
        <li data-valve-c={air.valve.C.toFixed(4)}>
          建議閥：C ≥ {fmt(air.valve.C)} dm³/(s·bar)（S ≈ {fmt(air.valve.S)} mm²、Cv ≈ {fmt(air.valve.Cv)}）
        </li>
        <li data-tube-od={air.tube.od}>
          建議管徑：Ø{air.tube.od}（管內流速 {fmt(air.tube.velocity)} m/s）
        </li>
        {row.tubing && <li>配管：{row.tubing}</li>}
      </ul>
      <p className="text-[10px] leading-4 text-slate-400">
        以理論出力 × 負載率檢核缸徑；耗氣量換算成大氣壓下的體積（ANR）。閥與管徑是簡化計算的參考值，實際選型請以廠商資料確認。
      </p>
    </section>
  )
}

/** 數值輸入：失去焦點或按 Enter 才寫入（打到一半的「0.」不會被改掉）；空白 = 未設定 */
export function NumberInput({
  label,
  value,
  placeholder,
  step,
  onCommit,
  aria,
}: {
  label: string
  value: number | undefined
  placeholder?: string
  step?: number
  onCommit: (value: number | undefined) => void
  aria: string
}) {
  const [text, setText] = useState(value === undefined ? '' : String(value))
  const [shown, setShown] = useState(value)
  // 外部的值改變（例如復原、套用建議值）時更新輸入框
  if (shown !== value) {
    setShown(value)
    setText(value === undefined ? '' : String(value))
  }
  const commit = () => {
    const t = text.trim()
    if (t === '') {
      if (value !== undefined) onCommit(undefined)
      return
    }
    const n = Number(t)
    if (Number.isFinite(n) && n >= 0 && n !== value) onCommit(n)
    else if (!Number.isFinite(n)) setText(value === undefined ? '' : String(value))
  }
  return (
    <label className="block text-xs text-slate-500">
      {label}
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step={step ?? 'any'}
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className={inputClass}
        aria-label={aria}
      />
    </label>
  )
}
