import { fmtNum } from './specs'
import { ISO_PIPE, METRIC_COARSE_PITCH, MM_PER_INCH, NPT_SIZES, TUBE_INCH, TUBE_METRIC_OD, UNIFIED_SIZES } from './tables'
import type { Gender, InterfaceSpec, PortSpec, ThreadStandard, TubeSpec } from './types'

export type ParseResult = { ok: true; spec: PortSpec; notes: string[] } | { ok: false; error: string }

export interface ParseOptions {
  /** 由 3D 模型判斷的公母（孔 = 母、凸柱 = 公）；文字中沒寫時使用 */
  gender?: Gender
  /** 安裝面的角色（沒寫時預設為對接面） */
  interfaceRole?: InterfaceSpec['role']
}

const GL: Record<Gender, string> = { male: '公', female: '母' }

// 注意順序：FEMALE 要比 MALE 先比對；「公制」不是公牙
const FEMALE_WORDS = /(母牙|內牙|内牙|內螺紋|内螺纹|母|\bFEMALE\b)/g
const MALE_WORDS = /(公牙|外牙|外螺紋|外螺纹|公(?!制)|\bMALE\b)/g
const SOCKET_WORDS = /(快插接頭|快插|快速接頭|快速接头|插管口|SOCKET)/g
const STEM_WORDS = /(插管端|插管式|插管|STEM)/g
const TUBE_WORDS = /(管外徑|管徑|管径|管子|TUBE|管)/g
const NOISE_WORDS = /(公制|英制|螺紋|螺纹|螺牙|牙|接口|埠|口|\s)/g

const PIPE = /^(NPTF|NPT|PT|PF|PS|RC|RP|R|G)(\d+\/\d+|\d+)[AB]?$/
const PIPE_REVERSED = /^(\d+\/\d+|\d+)"?(NPTF|NPT|PT|PF|PS|RC|RP|R|G)$/
const METRIC = /^M(\d+(?:\.\d+)?)(?:[X×*](\d+(?:\.\d+)?))?$/
const UNIFIED = /^#?(\d+\/\d+|\d+)-(\d+)(UNF|UNC|UN)?$/
const TUBE_PREFIX = /^(Ø|Φ|⌀|OD)/
const TUBE_METRIC = /^(?:Ø|Φ|⌀|OD)?(\d+(?:\.\d+)?)(MM)?$/
const TUBE_INCH_RE = /^(?:Ø|Φ|⌀|OD)?(\d+\/\d+)("|″|INCH|IN|英吋|吋)?$/
const INTERFACE = /^(?:安裝面|介面|接合面|INTERFACE)\s*[:：]?\s*(.+)$/i

const fail = (error: string): ParseResult => ({ ok: false, error })

/**
 * 解析使用者輸入的埠規格。支援：
 * - 管螺紋：PT1/4（依公母轉為 R／Rc）、PF1/8（= G）、PS1/4（= Rp）、R、Rc、Rp、G、NPT、NPTF，以及 1/4NPT 這類倒寫
 * - 公制：M5、M5x0.8、M5×0.8
 * - 統一螺紋：10-32UNF、1/4-28
 * - 管徑：Ø6、φ6、6mm、Ø1/4"（英制）；加「快插」為快插口，加「插管」為插管端
 * - 安裝面：安裝面：SY3000 閥座
 * 公母可用「公／母、外牙／內牙、male／female」表示；沒寫時使用 options.gender。
 */
export function parseSpec(input: string, options: ParseOptions = {}): ParseResult {
  const raw = input.normalize('NFKC').trim()
  if (!raw) return fail('請輸入規格，例如 PT1/4 母、M5、Ø6 快插')

  const iface = INTERFACE.exec(raw)
  if (iface) {
    const key = iface[1].trim()
    if (!key) return fail('請輸入安裝面名稱，例如「安裝面：SY3000 閥座」')
    return { ok: true, spec: { kind: 'interface', key, role: options.interfaceRole ?? 'mutual' }, notes: [] }
  }

  let text = raw.toUpperCase()
  const has = (re: RegExp) => {
    re.lastIndex = 0
    return re.test(text)
  }
  const explicitGender: Gender | undefined = has(FEMALE_WORDS) ? 'female' : has(MALE_WORDS) ? 'male' : undefined
  const tubeRoleWord: TubeSpec['role'] | undefined = has(SOCKET_WORDS) ? 'socket' : has(STEM_WORDS) ? 'stem' : undefined
  const tubeHint = tubeRoleWord !== undefined || has(TUBE_WORDS)
  for (const re of [FEMALE_WORDS, MALE_WORDS, SOCKET_WORDS, STEM_WORDS, TUBE_WORDS, NOISE_WORDS]) {
    text = text.replace(re, '')
  }

  const notes: string[] = []
  type GenderResult = { gender: Gender; error?: undefined } | { gender?: undefined; error: string }
  const resolveGender = (implied?: Gender): GenderResult => {
    if (explicitGender && implied && explicitGender !== implied) {
      return { error: `${GL[implied]}牙規格不能標成${GL[explicitGender]}牙` }
    }
    const gender = explicitGender ?? implied ?? options.gender
    if (!gender) return { error: '請標示公牙或母牙，例如「G1/8 公」' }
    if (options.gender && options.gender !== gender) {
      notes.push(`模型上看起來是${GL[options.gender]}牙，但規格為${GL[gender]}牙，請再確認`)
    }
    return { gender }
  }

  // ---- 管螺紋 ----
  const pipe = matchPipe(text)
  if (pipe) {
    const [code, size] = pipe
    const isNpt = code === 'NPT' || code === 'NPTF'
    if (!(isNpt ? NPT_SIZES : ISO_PIPE)[size]) return fail(`不支援的管螺紋尺寸：${size}`)

    let standard: ThreadStandard
    let resolved: GenderResult
    switch (code) {
      case 'PT': {
        resolved = resolveGender()
        if (!resolved.gender) return fail('PT 請標示公牙或母牙（公牙 = R，母牙 = Rc）')
        const male = resolved.gender === 'male'
        standard = male ? 'R' : 'Rc'
        notes.push(`PT 為舊 JIS 標示，${male ? '公牙等同 R' : '母牙等同 Rc'}`)
        break
      }
      case 'PS':
        standard = 'Rp'
        resolved = resolveGender('female')
        notes.push('PS 為舊 JIS 標示，等同 Rp（平行母牙）')
        break
      case 'PF':
        standard = 'G'
        resolved = resolveGender()
        notes.push('PF 為舊 JIS 標示，等同 G（平行管螺紋）')
        break
      case 'R':
        standard = 'R'
        resolved = resolveGender('male')
        break
      case 'RC':
        standard = 'Rc'
        resolved = resolveGender('female')
        break
      case 'RP':
        standard = 'Rp'
        resolved = resolveGender('female')
        break
      default:
        standard = code as ThreadStandard
        resolved = resolveGender()
    }
    if (resolved.error !== undefined) return fail(resolved.error)
    const gender = resolved.gender
    return { ok: true, spec: { kind: 'thread', standard, size, gender }, notes }
  }

  // ---- 公制螺紋 ----
  const metric = METRIC.exec(text)
  if (metric) {
    const d = fmtNum(Number(metric[1]))
    const pitch = metric[2] !== undefined ? Number(metric[2]) : METRIC_COARSE_PITCH[d]
    if (pitch === undefined) return fail(`M${d} 請標示牙距，例如 M${d}×1`)
    if (!(pitch > 0)) return fail('牙距必須大於 0')
    const { gender, error } = resolveGender()
    if (error !== undefined) return fail(error)
    const spec: PortSpec = { kind: 'thread', standard: 'M', size: d, gender }
    if (metric[2] !== undefined && pitch !== METRIC_COARSE_PITCH[d]) spec.pitch = pitch
    return { ok: true, spec, notes }
  }

  // ---- 統一螺紋 ----
  const unified = UNIFIED.exec(text)
  if (unified && !tubeHint) {
    const designation = `${unified[1]}-${unified[2]}`
    const size = UNIFIED_SIZES[designation]
    if (!size) return fail(`不支援的統一螺紋：${designation}`)
    const { gender, error } = resolveGender()
    if (error !== undefined) return fail(error)
    return { ok: true, spec: { kind: 'thread', standard: size.standard, size: designation, gender }, notes }
  }

  // ---- 管徑 ----
  // 沒寫快插／插管時：公（凸柱）視為插管端，其餘視為快插口
  const tubeRole: TubeSpec['role'] = tubeRoleWord ?? ((explicitGender ?? options.gender) === 'male' ? 'stem' : 'socket')
  const inch = TUBE_INCH_RE.exec(text)
  if (inch) {
    const hasMarker = inch[2] !== undefined
    if (!TUBE_PREFIX.test(text) && !tubeHint) {
      return fail(`${inch[1]}${hasMarker ? '"' : ''} 可能是管徑或螺紋：管子請寫 Ø${inch[1]}"，螺紋請寫 PT${inch[1]} 或 NPT${inch[1]}`)
    }
    const [n, d] = inch[1].split('/').map(Number)
    const od = (n / d) * MM_PER_INCH
    if (!TUBE_INCH.some((t) => Math.abs(t.od - od) < 0.01)) notes.push('非常見的英制管徑，請再確認')
    return { ok: true, spec: { kind: 'tube', od: Number(od.toFixed(3)), system: 'inch', role: tubeRole }, notes }
  }
  const mm = TUBE_METRIC.exec(text)
  if (mm) {
    if (!TUBE_PREFIX.test(text) && mm[2] === undefined && !tubeHint) {
      return fail('請加上 Ø 表示管徑（例如 Ø6），或寫出螺紋種類（例如 M6、PT1/8）')
    }
    const od = Number(mm[1])
    if (!(od > 0)) return fail('管徑必須大於 0')
    if (!TUBE_METRIC_OD.includes(od)) notes.push('非常見的公制管徑，請再確認')
    return { ok: true, spec: { kind: 'tube', od, system: 'metric', role: tubeRole }, notes }
  }

  return fail('無法辨識的規格。範例：PT1/4 母、PF1/8 公、NPT1/8、M5、10-32UNF、Ø6 快插、安裝面：SY3000')
}

/** 回傳 [代號, 尺寸]，支援 PT1/4 與 1/4PT 兩種寫法 */
function matchPipe(text: string): [string, string] | null {
  const m = PIPE.exec(text)
  if (m) return [m[1], m[2]]
  const r = PIPE_REVERSED.exec(text)
  return r ? [r[2], r[1]] : null
}
