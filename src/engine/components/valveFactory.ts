import { defineComponent, type ComponentDefinition, type InteractAction } from '../definition'
import type { PortDef } from '../types'

/** 閥的操作記號（由方格往外依序繪製） */
export type ValveActuator = 'lever' | 'detent' | 'solenoid' | 'spring' | 'button'

/** 埠組：5 口（P A B EA EB）、3 口（P A R）、2 口（P A） */
export type ValvePortSet = 5 | 3 | 2

/**
 * 切換方式：
 * - toggle：手動定位（點一下換到另一個閥位並保持）
 * - springReturn：單電控，線圈通電 → 作動位，斷電 → 彈簧回到靜止位
 * - double：雙電控記憶型，點左／右線圈切到對應閥位並保持
 * - doubleCentered：5/3 雙電控彈簧中位，左／右線圈通電 → 左／右閥位，都斷電 → 中位
 * - button：按鈕，按住作動、放開彈簧復歸（只接受 press／release）
 */
export type ValveMode = 'toggle' | 'springReturn' | 'double' | 'doubleCentered' | 'button'

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

export const valvePorts = (portSet: ValvePortSet): readonly PortDef[] => PORTS[portSet]

/** 閥位 → 方格索引 */
export const boxOfPosition = (spec: ValveSpec, position: number): number => spec.positionBox?.[position] ?? position

/** 兩位置彈簧復歸閥的作動位：不是靜止位的那一個 */
const actuatedOf = (spec: ValveSpec) => (spec.rest === 0 ? 1 : 0)

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
      // 方格 0 = 左線圈作動、1 = 中位、2 = 右線圈作動
      const position = l ? 0 : r ? 2 : 1
      return { position, coils: { l, r }, next }
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
  }
}

/** 由規格產生閥的引擎定義（符號端以同一份規格繪製） */
export function defineValve(spec: ValveSpec): ComponentDefinition<ValveState> {
  const passagesByPosition = (position: number) => spec.boxes[boxOfPosition(spec, position)] ?? []
  return defineComponent<ValveState>({
    type: spec.type,
    label: spec.label,
    category: 'valve',
    ports: PORTS[spec.portSet],
    createState: () => ({ position: spec.rest }),
    getInternalPaths: (state) => passagesByPosition(state.position),
    onInteract: (state, action = 'toggle') => interactValve(spec, state, action),
  })
}
