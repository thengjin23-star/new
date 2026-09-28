import { defineComponent, type ComponentCategory, type ComponentDefinition, type InteractAction, type ParamDef } from '../definition'
import { numParam } from '../params'
import { coilParam, strParam, TRIGGER_PARAM } from '../signals'
import type { Params, PortDef } from '../types'

/** 閥的操作記號（由方格往外依序繪製） */
export type ValveActuator = 'lever' | 'detent' | 'solenoid' | 'spring' | 'button' | 'pilot' | 'roller'

/** 埠組：5 口（P A B EA EB）、3 口（P A R）、2 口（P A） */
export type ValvePortSet = 5 | 3 | 2

/**
 * 切換方式：
 * - toggle：手動定位（點一下換到另一個閥位並保持）
 * - springReturn：單電控，線圈通電 → 作動位，斷電 → 彈簧回到靜止位
 * - double：雙電控記憶型，左／右線圈通電切到對應閥位並保持
 * - doubleCentered：5/3 雙電控彈簧中位，左／右線圈通電 → 左／右閥位，都斷電 → 中位
 * - button：按鈕，按住作動、放開彈簧復歸（只接受 press／release）
 * - pilot：單氣控，先導埠有壓 → 作動位，洩壓 → 彈簧復歸
 * - pilotDouble：雙氣控記憶型，14 有壓 → 1→4、12 有壓 → 1→2，兩邊都有壓時保持
 * - roller：滾輪（機械操作），氣缸到達指定位置（例如 a1）時作動
 * - timer：延時閥，先導壓力持續「延遲時間」後才作動，洩壓後立即復歸
 */
export type ValveMode = 'toggle' | 'springReturn' | 'double' | 'doubleCentered' | 'button' | 'pilot' | 'pilotDouble' | 'roller' | 'timer'

/** 閥內一條通道：氣流由 from 到 to（繪製箭頭用；模擬時雙向相通） */
export type ValvePassage = readonly [string, string]

export interface ValveSpec {
  type: string
  label: string
  portSet: ValvePortSet
  /** 各方格（由左到右）的內部通道；沒有出現在通道中的埠在該方格內封閉 */
  boxes: readonly (readonly ValvePassage[])[]
  /** 每個閥位（state.position）對應哪一個方格；未指定時閥位 = 方格索引 */
  positionBox?: readonly number[]
  /** 初始閥位；外部埠畫在這個閥位的方格上 */
  rest: number
  /** 左側、右側的操作記號（由方格往外） */
  left: readonly ValveActuator[]
  right: readonly ValveActuator[]
  mode: ValveMode
  /** 先導埠（氣控閥、延時閥）：左／右側先導操作的埠號（ISO 5599：14 → 1→4、12 → 1→2） */
  pilots?: { readonly l?: string; readonly r?: string }
  /** 元件面板的分類；預設為方向控制閥 */
  category?: ComponentCategory
}

export interface ValveState {
  /** 目前閥位 */
  position: number
  /** 電磁線圈通電狀態 */
  coils?: { readonly l?: boolean; readonly r?: boolean }
  /** 按鈕是否按住 */
  pressed?: boolean
  /** 5/3：點擊本體時下一次要往哪一側 */
  next?: 'l' | 'r'
  /** 延時閥：先導壓力已持續的秒數 */
  elapsed?: number
}

const PORTS: Record<ValvePortSet, readonly PortDef[]> = {
  5: [
    { id: 'P', role: 'supply', iso: '1' },
    { id: 'A', role: 'working', iso: '4' },
    { id: 'B', role: 'working', iso: '2' },
    { id: 'EA', role: 'exhaust', iso: '5' },
    { id: 'EB', role: 'exhaust', iso: '3' },
  ],
  3: [
    { id: 'P', role: 'supply', iso: '1' },
    { id: 'A', role: 'working', iso: '2' },
    { id: 'R', role: 'exhaust', iso: '3' },
  ],
  2: [
    { id: 'P', role: 'supply', iso: '1' },
    { id: 'A', role: 'working', iso: '2' },
  ],
}

/** 閥的全部埠：管路埠加上先導埠（12、14） */
export function valvePorts(spec: Pick<ValveSpec, 'portSet' | 'pilots'>): readonly PortDef[] {
  const pilots = [spec.pilots?.l, spec.pilots?.r].filter((p): p is string => !!p)
  return [...PORTS[spec.portSet], ...pilots.map((id): PortDef => ({ id, role: 'pilot', iso: id }))]
}

/** 閥位 → 方格索引 */
export const boxOfPosition = (spec: ValveSpec, position: number): number => spec.positionBox?.[position] ?? position

/** 兩位置彈簧復歸閥的作動位：不是靜止位的那一個 */
const actuatedOf = (spec: ValveSpec) => (spec.rest === 0 ? 1 : 0)

const SOLENOID_MODES: ReadonlySet<ValveMode> = new Set(['springReturn', 'double', 'doubleCentered'])

/** 有命名的電磁線圈（例如左線圈接 Y1）；沒有命名的一側為空字串 */
export function coilNames(spec: ValveSpec, params: Params | undefined): { l: string; r: string } {
  if (!SOLENOID_MODES.has(spec.mode)) return { l: '', r: '' }
  return {
    l: spec.left.includes('solenoid') ? strParam(params, 'coilL') : '',
    r: spec.right.includes('solenoid') ? strParam(params, 'coilR') : '',
  }
}

/** 依兩側的操作訊號（線圈通電、先導有壓、滾輪壓下）決定閥位 */
function positionFromSides(spec: ValveSpec, prev: number, l: boolean, r: boolean): number {
  switch (spec.mode) {
    case 'double':
    case 'pilotDouble':
      return l && !r ? 0 : r && !l ? 1 : prev
    case 'doubleCentered':
      // 方格 0 = 左側作動、1 = 中位、2 = 右側作動
      return l && !r ? 0 : r && !l ? 2 : !l && !r ? 1 : prev
    default:
      return l ? actuatedOf(spec) : spec.rest
  }
}

/** 沒有命名線圈時的手動操作（點本體、點線圈） */
function interactValve(spec: ValveSpec, state: ValveState, action: InteractAction): ValveState {
  switch (spec.mode) {
    case 'toggle':
      if (action === 'press' || action === 'release') return state
      return { ...state, position: state.position === 0 ? 1 : 0 }

    case 'springReturn': {
      if (action !== 'toggle' && action !== 'coil:l') return state
      const on = !state.coils?.l
      return { ...state, coils: { l: on }, position: on ? actuatedOf(spec) : spec.rest }
    }

    case 'double': {
      // 記憶型：線圈是脈衝，切換後閥位保持
      if (action === 'coil:l') return state.position === 0 ? state : { ...state, position: 0 }
      if (action === 'coil:r') return state.position === 1 ? state : { ...state, position: 1 }
      if (action === 'toggle') return { ...state, position: state.position === 0 ? 1 : 0 }
      return state
    }

    case 'doubleCentered': {
      const coils = state.coils ?? {}
      let l = !!coils.l
      let r = !!coils.r
      let next = state.next ?? 'l'
      if (action === 'coil:l') {
        l = !l
        r = false
      } else if (action === 'coil:r') {
        r = !r
        l = false
      } else if (action === 'toggle') {
        // 點本體：中位 → 左 → 中位 → 右 → 中位…
        if (l || r) {
          next = l ? 'r' : 'l'
          l = r = false
        } else if (next === 'l') l = true
        else r = true
      } else return state
      return { ...state, position: positionFromSides(spec, state.position, l, r), coils: { l, r }, next }
    }

    case 'button': {
      // 只接受按住／放開；放開後瀏覽器接著送出的點擊（toggle）不可再把按鈕按下去
      let pressed: boolean
      if (action === 'press') pressed = true
      else if (action === 'release') pressed = false
      else return state
      if (pressed === !!state.pressed) return state
      return { ...state, pressed, position: pressed ? actuatedOf(spec) : spec.rest }
    }

    default:
      return state
  }
}

/**
 * 有命名的線圈：點擊切換的是線圈（保持通電），閥位依線圈決定。
 * 雙電控閥點一側的線圈時，另一側自動斷電，操作起來與手動相同。
 */
function latchCoils(spec: ValveSpec, state: ValveState, action: InteractAction): ValveState {
  const l = !!state.coils?.l
  const r = !!state.coils?.r
  let coils: { l: boolean; r: boolean }
  let next = state.next
  if (spec.mode === 'springReturn') {
    if (action !== 'toggle' && action !== 'coil:l') return state
    coils = { l: !l, r: false }
  } else if (action === 'coil:l') coils = { l: !l, r: false }
  else if (action === 'coil:r') coils = { l: false, r: !r }
  else if (action === 'toggle') {
    if (spec.mode === 'double') coils = state.position === 0 ? { l: false, r: true } : { l: true, r: false }
    else {
      const cycled = interactValve(spec, state, 'toggle')
      coils = { l: !!cycled.coils?.l, r: !!cycled.coils?.r }
      next = cycled.next
    }
  } else return state
  return { ...state, coils, position: positionFromSides(spec, state.position, coils.l, coils.r), ...(next && { next }) }
}

function paramsOf(spec: ValveSpec): ParamDef[] {
  const params: ParamDef[] = []
  if (SOLENOID_MODES.has(spec.mode)) {
    const both = spec.left.includes('solenoid') && spec.right.includes('solenoid')
    if (spec.left.includes('solenoid')) params.push(coilParam('l', both ? '左線圈訊號' : '線圈訊號'))
    if (spec.right.includes('solenoid')) params.push(coilParam('r', '右線圈訊號'))
  }
  if (spec.mode === 'roller') params.push(TRIGGER_PARAM)
  if (spec.mode === 'timer')
    params.push({ key: 'delay', label: '延遲時間', unit: 's', kind: 'number', default: 2, min: 0.1, max: 60, step: 0.1, live: true })
  return params
}

/** 由規格產生閥的引擎定義（符號端以同一份規格繪製） */
export function defineValve(spec: ValveSpec): ComponentDefinition<ValveState> {
  const passagesByPosition = (position: number) => spec.boxes[boxOfPosition(spec, position)] ?? []
  const params = paramsOf(spec)
  const manual = spec.mode === 'toggle' || spec.mode === 'button' || SOLENOID_MODES.has(spec.mode)
  const pilotOn = (ports: Readonly<Record<string, string>>, side: 'l' | 'r') => {
    const port = spec.pilots?.[side]
    return !!port && ports[port] === 'pressure'
  }
  return defineComponent<ValveState>({
    type: spec.type,
    label: spec.label,
    category: spec.category ?? 'valve',
    ports: valvePorts(spec),
    ...(params.length && { params }),
    createState: () => ({ position: spec.rest }),
    getInternalPaths: (state) => passagesByPosition(state.position),
    ...(manual && {
      onInteract: (state: ValveState, action: InteractAction = 'toggle', p?: Params) => {
        const names = coilNames(spec, p)
        return names.l || names.r ? latchCoils(spec, state, action) : interactValve(spec, state, action)
      },
    }),
    ...(SOLENOID_MODES.has(spec.mode) && {
      manualOutputs: (state: ValveState, p?: Params) => {
        const names = coilNames(spec, p)
        const out: Record<string, boolean> = {}
        if (names.l) out[names.l] = !!state.coils?.l
        if (names.r) out[names.r] = !!state.coils?.r
        return out
      },
    }),
    update: ({ state, dt, ports, params: p, signals }) => {
      let l: boolean
      let r = false
      switch (spec.mode) {
        case 'springReturn':
        case 'double':
        case 'doubleCentered': {
          // 有命名的線圈跟著電氣輸出；沒有命名的線圈維持手動操作的狀態
          const names = coilNames(spec, p)
          if (!names.l && !names.r) return state
          l = names.l ? !!signals?.[names.l] : !!state.coils?.l
          r = names.r ? !!signals?.[names.r] : !!state.coils?.r
          const position = positionFromSides(spec, state.position, l, r)
          if (l === !!state.coils?.l && r === !!state.coils?.r && position === state.position) return state
          return { ...state, coils: { l, r }, position }
        }
        case 'pilot':
        case 'pilotDouble':
          l = pilotOn(ports, 'l')
          r = pilotOn(ports, 'r')
          break
        case 'roller': {
          const trigger = strParam(p, 'trigger')
          l = !!trigger && !!signals?.[trigger]
          break
        }
        case 'timer': {
          const delay = numParam(p, 'delay', 2)
          const on = pilotOn(ports, 'l')
          const elapsed = on ? Math.min(delay, (state.elapsed ?? 0) + dt) : 0
          const position = on && elapsed >= delay - 1e-9 ? actuatedOf(spec) : spec.rest
          if (elapsed === (state.elapsed ?? 0) && position === state.position) return state
          return { ...state, elapsed, position }
        }
        default:
          return state
      }
      const position = positionFromSides(spec, state.position, l, r)
      return position === state.position ? state : { ...state, position }
    },
  })
}
