import { specKey } from './specs'
import { ISO_PIPE, METRIC_COARSE_PITCH, METRIC_COMMON, MM_PER_INCH, NPT_SIZES, PIPE_SIZE_ORDER, TUBE_INCH, TUBE_METRIC_OD, UNIFIED_SIZES } from './tables'
import type { Gender, PortSpec, ThreadSpec } from './types'

export type MeasuredShape = 'hole' | 'boss'

export interface Suggestion {
  spec: PortSpec
  /** 比對到的參考直徑（mm） */
  reference: number
  /** 參考直徑的依據：大徑、小徑、攻牙徑或管外徑 */
  basis: 'major' | 'minor' | 'tapDrill' | 'od'
  /** 量測值與參考直徑的差（mm，絕對值） */
  delta: number
}

interface Candidate {
  spec: PortSpec
  refs: { value: number; basis: Suggestion['basis'] }[]
  /** 差值相同時的排序：數字小者優先（台灣氣動最常見的 R／Rc 排最前） */
  priority: number
}

/**
 * 依 3D 模型量到的直徑建議埠規格。
 * - 凸柱（公牙）：與螺紋大徑、管外徑比對
 * - 孔（母牙）：CAD 模型的螺孔常畫成小徑或攻牙徑，也可能畫成大徑，三者都比對；快插口比對管外徑
 * 容許誤差為 max(0.35 mm, 直徑的 4.5%)。
 */
export function suggestByDiameter(diameter: number, shape: MeasuredShape, limit = 5): Suggestion[] {
  const gender: Gender = shape === 'boss' ? 'male' : 'female'
  const female = gender === 'female'
  const candidates: Candidate[] = []
  const thread = (spec: Omit<ThreadSpec, 'kind' | 'gender'>): ThreadSpec => ({ kind: 'thread', gender, ...spec })

  for (const size of PIPE_SIZE_ORDER) {
    const p = ISO_PIPE[size]
    const taper = female ? [p.major, p.minor, p.tapDrillTaper] : [p.major]
    const parallel = female ? [p.major, p.minor, p.tapDrillParallel] : [p.major]
    candidates.push({ spec: thread({ standard: female ? 'Rc' : 'R', size }), refs: refs(taper, female), priority: 0 })
    candidates.push({ spec: thread({ standard: 'G', size }), refs: refs(parallel, female), priority: 1 })
    const n = NPT_SIZES[size]
    candidates.push({
      spec: thread({ standard: 'NPT', size }),
      refs: female ? [{ value: n.od, basis: 'major' }, { value: n.tapDrill, basis: 'tapDrill' }] : [{ value: n.od, basis: 'major' }],
      priority: 3,
    })
  }

  for (const { d, p } of METRIC_COMMON) {
    const size = String(d)
    const spec = thread({ standard: 'M', size })
    if (p !== METRIC_COARSE_PITCH[size]) spec.pitch = p
    candidates.push({ spec, refs: refs(female ? [d, d - 1.0825 * p, d - p] : [d], female), priority: 2 })
  }

  for (const [size, u] of Object.entries(UNIFIED_SIZES)) {
    const pitch = MM_PER_INCH / u.tpi
    const values = female ? [u.major, u.major - 1.0825 * pitch, u.major - pitch] : [u.major]
    // 同外徑時 UNF 優先：10-32UNF 是氣動元件最常見的英制螺紋
    const priority = u.standard === 'UNF' ? 4 : 4.5
    candidates.push({ spec: thread({ standard: u.standard, size }), refs: refs(values, female), priority })
  }

  const role = female ? 'socket' : 'stem'
  for (const od of TUBE_METRIC_OD) {
    candidates.push({ spec: { kind: 'tube', od, system: 'metric', role }, refs: [{ value: od, basis: 'od' }], priority: 5 })
  }
  for (const t of TUBE_INCH) {
    candidates.push({ spec: { kind: 'tube', od: t.od, system: 'inch', role }, refs: [{ value: t.od, basis: 'od' }], priority: 6 })
  }

  const tolerance = Math.max(0.35, diameter * 0.045)
  const scored: (Suggestion & { priority: number })[] = []
  for (const c of candidates) {
    let best = c.refs[0]
    for (const r of c.refs) if (Math.abs(r.value - diameter) < Math.abs(best.value - diameter)) best = r
    const delta = Math.abs(best.value - diameter)
    if (delta <= tolerance) scored.push({ spec: c.spec, reference: best.value, basis: best.basis, delta, priority: c.priority })
  }
  scored.sort((a, b) => Math.round((a.delta - b.delta) * 100) || a.priority - b.priority)

  const seen = new Set<string>()
  const out: Suggestion[] = []
  for (const { priority: _priority, ...s } of scored) {
    const key = specKey(s.spec)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
    if (out.length >= limit) break
  }
  return out
}

function refs(values: number[], female: boolean): Candidate['refs'] {
  const bases: Suggestion['basis'][] = female ? ['major', 'minor', 'tapDrill'] : ['major']
  return values.map((value, i) => ({ value, basis: bases[i] }))
}
