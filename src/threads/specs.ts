import { ISO_PIPE, METRIC_COARSE_PITCH, MM_PER_INCH, NPT_SIZES, TUBE_INCH, UNIFIED_SIZES } from './tables'
import type { Gender, InterfaceSpec, PortSpec, ThreadFamily, ThreadSpec, ThreadStandard, TubeSpec } from './types'

export function threadFamily(standard: ThreadStandard): ThreadFamily {
  switch (standard) {
    case 'R':
    case 'Rc':
    case 'Rp':
    case 'G':
      return 'iso-pipe'
    case 'NPT':
    case 'NPTF':
      return 'npt'
    case 'M':
      return 'metric'
    case 'UNF':
    case 'UNC':
      return 'unified'
  }
}

export const FAMILY_LABEL: Record<ThreadFamily, string> = {
  'iso-pipe': '管螺紋 R／Rc／G（PT／PF）',
  npt: 'NPT 美制錐管螺紋',
  metric: '公制螺紋',
  unified: '英制統一螺紋（UNF／UNC）',
}

/** 牙角（度） */
export const THREAD_ANGLE: Record<ThreadFamily, number> = { 'iso-pipe': 55, npt: 60, metric: 60, unified: 60 }

export const GENDER_LABEL: Record<Gender, string> = { male: '公', female: '母' }

export const INTERFACE_ROLE_LABEL: Record<InterfaceSpec['role'], string> = {
  plug: '元件側',
  socket: '底座側',
  mutual: '對接面',
}

/** 舊 JIS 寫法（台灣常用） */
const JIS_ALIAS: Partial<Record<ThreadStandard, string>> = { R: 'PT', Rc: 'PT', Rp: 'PS', G: 'PF' }

/** 數字格式：去掉多餘的 0（0.80 → 0.8） */
export function fmtNum(n: number, digits = 3): string {
  return Number(n.toFixed(digits)).toString()
}

/** 螺紋外徑（mm） */
export function threadMajor(spec: ThreadSpec): number {
  switch (threadFamily(spec.standard)) {
    case 'iso-pipe':
      return ISO_PIPE[spec.size].major
    case 'npt':
      return NPT_SIZES[spec.size].od
    case 'metric':
      return Number(spec.size)
    case 'unified':
      return UNIFIED_SIZES[spec.size].major
  }
}

/** 每吋牙數（管螺紋與統一螺紋；公制以牙距換算） */
export function threadTpi(spec: ThreadSpec): number {
  switch (threadFamily(spec.standard)) {
    case 'iso-pipe':
      return ISO_PIPE[spec.size].tpi
    case 'npt':
      return NPT_SIZES[spec.size].tpi
    case 'metric':
      return MM_PER_INCH / threadPitch(spec)
    case 'unified':
      return UNIFIED_SIZES[spec.size].tpi
  }
}

/** 牙距（mm） */
export function threadPitch(spec: ThreadSpec): number {
  if (threadFamily(spec.standard) === 'metric') return spec.pitch ?? METRIC_COARSE_PITCH[spec.size]
  return MM_PER_INCH / threadTpi(spec)
}

/** 螺紋標示，例如 Rc1/8、NPT1/4、M5×0.8、10-32UNF */
export function threadDesignation(spec: ThreadSpec): string {
  switch (threadFamily(spec.standard)) {
    case 'metric':
      return `M${spec.size}×${fmtNum(threadPitch(spec))}`
    case 'unified':
      return `${spec.size}${spec.standard}`
    default:
      return `${spec.standard}${spec.size}`
  }
}

export function tubeLabel(spec: TubeSpec): string {
  if (spec.system === 'inch') {
    const known = TUBE_INCH.find((t) => Math.abs(t.od - spec.od) < 0.01)
    return known ? `Ø${known.label}"` : `Ø${fmtNum(spec.od / MM_PER_INCH)}"`
  }
  return `Ø${fmtNum(spec.od)}`
}

/** 完整顯示，例如「Rc1/8 母（PT）」「Ø6 快插」「安裝面「SY3000」（底座側）」 */
export function formatSpec(spec: PortSpec): string {
  switch (spec.kind) {
    case 'thread': {
      const alias = JIS_ALIAS[spec.standard]
      return `${threadDesignation(spec)} ${GENDER_LABEL[spec.gender]}${alias ? `（${alias}）` : ''}`
    }
    case 'tube':
      return `${tubeLabel(spec)} ${spec.role === 'socket' ? '快插' : '插管'}`
    case 'interface':
      return `安裝面「${spec.key}」（${INTERFACE_ROLE_LABEL[spec.role]}）`
  }
}

/** 精簡顯示，用於 3D 標籤，例如「Rc1/8」「Ø6」「SY3000」 */
export function formatSpecShort(spec: PortSpec): string {
  switch (spec.kind) {
    case 'thread':
      return threadDesignation(spec)
    case 'tube':
      return tubeLabel(spec)
    case 'interface':
      return spec.key
  }
}

/** 與此規格完全相配的另一端（用來描述需要的轉接頭） */
export function complement(spec: PortSpec): PortSpec {
  switch (spec.kind) {
    case 'thread': {
      const flipped: Gender = spec.gender === 'male' ? 'female' : 'male'
      if (spec.standard === 'R') return { ...spec, standard: 'Rc', gender: 'female' }
      if (spec.standard === 'Rc' || spec.standard === 'Rp') return { ...spec, standard: 'R', gender: 'male' }
      return { ...spec, gender: flipped }
    }
    case 'tube':
      return { ...spec, role: spec.role === 'socket' ? 'stem' : 'socket' }
    case 'interface':
      return { ...spec, role: spec.role === 'plug' ? 'socket' : spec.role === 'socket' ? 'plug' : 'mutual' }
  }
}

/** 規格的唯一字串（用於去除重複） */
export function specKey(spec: PortSpec): string {
  switch (spec.kind) {
    case 'thread':
      return `thread:${threadDesignation(spec)}:${spec.gender}`
    case 'tube':
      return `tube:${fmtNum(spec.od)}:${spec.system}:${spec.role}`
    case 'interface':
      return `interface:${normalizeInterfaceKey(spec.key)}:${spec.role}`
  }
}

/** 安裝面名稱比對時忽略大小寫與空白 */
export function normalizeInterfaceKey(key: string): string {
  return key.normalize('NFKC').replace(/\s+/g, '').toUpperCase()
}
