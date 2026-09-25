import { defineComponent } from '../definition'

export interface Valve52State {
  position: 0 | 1
}

/**
 * 各閥位的內部通路。
 * - 位置 0：P→A，B→EB
 * - 位置 1：P→B，A→EA
 */
export const VALVE52_PATHS = {
  0: [
    ['P', 'A'],
    ['B', 'EB'],
  ],
  1: [
    ['P', 'B'],
    ['A', 'EA'],
  ],
} as const satisfies Record<Valve52State['position'], readonly (readonly [string, string])[]>

/** 5/2 手動閥：點擊在兩個閥位之間切換 */
export const valve52Manual = defineComponent<Valve52State>({
  type: 'valve52Manual',
  label: '5/2 手動閥',
  category: 'valve',
  ports: [
    { id: 'P', role: 'supply' },
    { id: 'A', role: 'working' },
    { id: 'B', role: 'working' },
    { id: 'EA', role: 'exhaust' },
    { id: 'EB', role: 'exhaust' },
  ],
  createState: () => ({ position: 0 }),
  getInternalPaths: (state) => VALVE52_PATHS[state.position],
  onInteract: (state) => ({ position: state.position === 0 ? 1 : 0 }),
})
