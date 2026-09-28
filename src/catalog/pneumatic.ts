import { registry, type ComponentDefinition, type ParamValue } from '../engine'
import type { Product, ProductPneumatic, ProductPort } from './types'

/** 接頭、轉接頭、接管座：氣流直接通過，不畫在迴路圖 */
export const FITTING_TYPE = 'fitting'
/** 集裝座：迴路圖中不單獨畫出 */
export const MANIFOLD_TYPE = 'manifold'

export const SPECIAL_TYPE_LABEL: Record<string, string> = {
  [FITTING_TYPE]: '接頭／通過型（迴路圖以管線表示）',
  [MANIFOLD_TYPE]: '集裝座（迴路圖不單獨畫出）',
}

/** 這個功能 type 能不能放進迴路圖 */
export const isCircuitType = (type: string | undefined): type is string => !!type && registry.has(type)

/** 功能 type 的顯示名稱 */
export function pneumaticTypeLabel(type: string): string {
  return SPECIAL_TYPE_LABEL[type] ?? (registry.has(type) ? registry.get(type).label : type)
}

const normalize = (s: string) => s.trim().toUpperCase().replace(/[\s_\-．.]/g, '')

/** 功能埠在產品上常見的其他名稱（埠代號與 ISO 數字之外） */
const EXTRA_ALIASES: Record<string, readonly string[]> = {
  P: ['IN', 'SUP', 'P1', '供氣', '進氣'],
  EA: ['R1', 'E1', 'EXA'],
  EB: ['R2', 'E2', 'EXB'],
  R: ['E', 'EA', 'EXH', 'EX', 'R1', '排氣'],
  IN: ['P', '入口', '進氣', 'INLET'],
  OUT: ['A', '出口', '出氣', 'OUTLET'],
  E: ['R', 'EXH', '排氣'],
  // 梭動閥、雙壓閥的兩個入口與出口
  X: ['IN1', 'P1', '1'],
  Y: ['IN2', 'P2'],
  A: ['OUT', 'OUTLET', '出口'],
  // 氣控閥的先導埠
  '14': ['Z', 'PILOT', '先導', 'X'],
  '12': ['Y', 'PILOT2'],
}

/** 缸體的 A（後端、無桿側）／B（前端、有桿側）常見名稱 */
const CYLINDER_ALIASES: Record<string, readonly string[]> = {
  A: ['HEAD', 'CAP', '後', '後端', '無桿側', '1'],
  B: ['ROD', '前', '前端', '有桿側', '2'],
}

function aliasesOf(def: ComponentDefinition<unknown>, portId: string): string[] {
  const port = def.ports.find((p) => p.id === portId)
  const list = [portId, ...(port?.iso ? [port.iso] : []), ...(EXTRA_ALIASES[portId] ?? [])]
  if (def.category === 'actuator') list.push(...(CYLINDER_ALIASES[portId] ?? []))
  return list.map(normalize)
}

/** 管路用的埠（排除集裝座站位這類安裝面） */
const pipingPorts = (ports: readonly ProductPort[]) => ports.filter((p) => p.spec?.kind !== 'interface')

/**
 * 依名稱把功能埠對應到產品埠：每個產品埠只用一次；
 * 功能只有一個埠而產品也只有一個管路埠時，直接對應。
 */
export function matchPortsByName(type: string, ports: readonly ProductPort[]): Record<string, string> {
  if (!registry.has(type)) return {}
  const def = registry.get(type)
  const candidates = pipingPorts(ports)
  const used = new Set<string>()
  const result: Record<string, string> = {}
  for (const port of def.ports) {
    const aliases = aliasesOf(def, port.id)
    // 依別名的優先順序找：先比埠代號，再比 ISO 數字，最後比其他名稱
    for (const alias of aliases) {
      const hit = candidates.find((p) => !used.has(p.id) && normalize(p.name) === alias)
      if (hit) {
        result[port.id] = hit.id
        used.add(hit.id)
        break
      }
    }
  }
  if (def.ports.length === 1 && candidates.length === 1 && Object.keys(result).length === 0) {
    result[def.ports[0].id] = candidates[0].id
  }
  return result
}

/**
 * 速度控制閥：螺紋側鎖在氣缸上（功能埠 2），快插側接往閥（功能埠 1）。
 * 規格不足以判斷時改用名稱對應。
 */
function flowControlPorts(ports: readonly ProductPort[]): Record<string, string> {
  const candidates = pipingPorts(ports)
  const thread = candidates.find((p) => p.spec?.kind === 'thread')
  const tube = candidates.find((p) => p.spec?.kind === 'tube')
  if (thread && tube) return { '2': thread.id, '1': tube.id }
  return matchPortsByName('flowControl', ports)
}

/** 切換功能 type 時自動產生的埠對應 */
export function autoPortMap(type: string, ports: readonly ProductPort[]): Record<string, string> {
  return type === 'flowControl' ? flowControlPorts(ports) : matchPortsByName(type, ports)
}

const STANDARD_BORES = [2.5, 4, 6, 8, 10, 12, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 140, 160, 180, 200, 250, 300]

/**
 * 從名稱或型號解析缸徑與行程，例如：
 * 「Ø16 × 50」、「φ20x100」、「CDJ2B16-50」、「MB32-100」、「SC32X100」、「DSBC-32-100-PPVA」
 * 依序嘗試「Ø 缸徑 × 行程」、「缸徑 × 行程」、「缸徑-行程」，缸徑必須是標準尺寸。
 */
export function parseBoreStroke(text: string): { bore: number; stroke: number } | undefined {
  // 以 lookahead 找出所有（可重疊的）候選，例如 MB1-32-100 的 32-100
  const patterns = [
    /[ØφΦ⌀]\s*(\d+(?:\.\d+)?)\s*[×xX*]\s*(\d+)/g,
    /(?=(\d+(?:\.\d+)?)\s*[×xX*]\s*(\d+))/g,
    /(?=(\d+(?:\.\d+)?)-(\d+))/g,
  ]
  for (const pattern of patterns) {
    for (const m of text.matchAll(pattern)) {
      const bore = Number(m[1])
      const stroke = Number(m[2])
      if (STANDARD_BORES.includes(bore) && stroke >= 1 && stroke <= 3000) return { bore, stroke }
    }
  }
  return undefined
}

const has = (text: string, ...words: string[]) => words.some((w) => text.includes(w))

function valveType(product: Product, text: string): string | undefined {
  const count = pipingPorts(product.ports).length
  const upper = text.toUpperCase()
  // 邏輯與訊號元件（依名稱）
  if (has(text, '梭動') || has(upper, 'SHUTTLE')) return 'shuttleValve'
  if (has(text, '雙壓') || has(upper, 'TWO PRESSURE', 'TWO-PRESSURE')) return 'twoPressureValve'
  if (has(text, '快速排氣', '快排') || has(upper, 'QUICK EXHAUST')) return 'quickExhaust'
  if (has(text, '延時') || has(upper, 'TIME DELAY', 'TIMER')) return 'valve32Timer'
  if (has(text, '壓力開關') || has(upper, 'PRESSURE SWITCH')) return 'pressureSwitch'
  const pilot = has(text, '氣控', '氣導') || has(upper, 'PILOT')
  const is53 = has(upper, '5/3', '5-3', '53') && has(text, '中位', '5/3')
  if (is53 || has(text, '5/3')) {
    if (has(text, '排氣', 'EXHAUST', 'ABR')) return 'valve53Exhaust'
    if (has(text, '加壓', 'PRESSURE', 'PAB')) return 'valve53Pressure'
    return 'valve53Closed'
  }
  if (count >= 5 || has(upper, '5/2', '5-2')) {
    if (pilot) return has(text, '雙氣控', '雙頭') || has(upper, 'DOUBLE') ? 'valve52DoublePilot' : 'valve52Pilot'
    if (has(text, '雙電控', '雙頭', 'DOUBLE')) return 'valve52Double'
    if (has(text, '手動', '手扳', 'MANUAL', 'LEVER')) return 'valve52Manual'
    return 'valve52Single'
  }
  if (count === 3 || has(upper, '3/2', '3-2')) {
    if (has(text, '滾輪') || has(upper, 'ROLLER')) return 'valve32Roller'
    if (pilot) return 'valve32Pilot'
    if (has(text, '按鈕', 'BUTTON', 'PUSH')) return 'valve32Button'
    if (has(text, '常開', 'N.O', 'NO型', 'NORMALLY OPEN')) return 'valve32NO'
    return 'valve32NC'
  }
  if (count === 2 || has(upper, '2/2', '2-2')) return 'valve22NC'
  // 只有安裝面的底板式閥（集裝座用）：最常見的是 5/2 電磁閥
  if (count === 0 && product.ports.length > 0) return 'valve52Single'
  return undefined
}

function frlType(text: string): string | undefined {
  const upper = text.toUpperCase()
  // 先看組合件，再看單件；型號中的 FRL 常只是系列名稱，放在最後
  if (has(text, '三點', '組合')) return 'frl'
  if (has(text, '接管座', '轉接', '連接座') || has(upper, 'PORT BLOCK', 'SPACER')) return FITTING_TYPE
  if (has(text, '壓力錶', '壓力表') || has(upper, 'GAUGE')) return 'pressureGauge'
  if (has(text, '調壓') || has(upper, 'REGULATOR')) return 'regulator'
  if (has(text, '給油') || has(upper, 'LUBRICATOR')) return 'lubricator'
  if (has(text, '過濾') || has(upper, 'FILTER')) return 'filter'
  if (has(upper, 'FRL', 'F.R.L')) return 'frl'
  return undefined
}

/** 依分類、埠數與名稱推斷氣動功能；判斷不出來時回傳 undefined */
export function inferPneumatic(product: Product): ProductPneumatic | undefined {
  const text = `${product.modelCode} ${product.name} ${product.notes ?? ''}`
  let type: string | undefined
  let params: Record<string, ParamValue> | undefined
  switch (product.category) {
    case 'valve':
      type = valveType(product, text)
      break
    case 'cylinder': {
      const count = pipingPorts(product.ports).length
      type = count === 1 || has(text, '單動') ? 'cylinderSingle' : 'cylinderDouble'
      const size = parseBoreStroke(text)
      if (size) params = { bore: size.bore, stroke: size.stroke }
      break
    }
    case 'speedController':
      type = 'flowControl'
      break
    case 'silencer':
      type = 'silencer'
      break
    case 'frl':
      type = frlType(text)
      break
    case 'fitting':
      type = FITTING_TYPE
      break
    case 'manifold':
      type = MANIFOLD_TYPE
      break
    default:
      type = undefined
  }
  if (!type) return undefined
  const portMap = autoPortMap(type, product.ports)
  return params ? { type, portMap, params } : { type, portMap }
}

export interface EffectivePneumatic extends ProductPneumatic {
  /** true = 由系統推斷（使用者尚未確認） */
  inferred: boolean
}

const effectiveCache = new WeakMap<Product, EffectivePneumatic | null>()

/** 產品目前的氣動功能：使用者設定優先，否則用推斷結果 */
export function effectivePneumatic(product: Product): EffectivePneumatic | undefined {
  const cached = effectiveCache.get(product)
  if (cached !== undefined) return cached ?? undefined
  let result: EffectivePneumatic | undefined
  if (product.pneumatic) result = { ...product.pneumatic, inferred: false }
  else {
    const inferred = inferPneumatic(product)
    result = inferred && { ...inferred, inferred: true }
  }
  effectiveCache.set(product, result ?? null)
  return result
}

/** 可以選的功能 type：迴路元件（依分類）＋ 特殊 type */
export function pneumaticTypeOptions(): { group: string; options: { value: string; label: string }[] }[] {
  const groups: Record<string, string> = {
    source: '氣源與氣源處理',
    valve: '方向控制閥',
    flow: '流量控制',
    logic: '訊號與邏輯',
    actuator: '致動器',
    misc: '其他',
  }
  const result = Object.entries(groups).map(([category, group]) => ({
    group,
    options: registry
      .list()
      .filter((d) => d.category === category && !d.hidden && d.type !== 'airSupply')
      .map((d) => ({ value: d.type, label: d.label })),
  }))
  result.push({
    group: '不畫在迴路圖',
    options: Object.entries(SPECIAL_TYPE_LABEL).map(([value, label]) => ({ value, label })),
  })
  return result.filter((g) => g.options.length > 0)
}
