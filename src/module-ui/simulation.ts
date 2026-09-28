import { effectivePneumatic } from '../catalog/pneumatic'
import type { Tessellation } from '../catalog/tessellation'
import type { Product } from '../catalog/types'
import { useShallow } from 'zustand/react/shallow'
import { numParam, portKey, registry, resolveParams, sensorName, strParam, VALVE_SPECS, type PortState } from '../engine'
import type { Vec3 } from '../geometry/vec3'
import { useModuleStore } from './moduleStore'

/** 模擬中某個產品埠所在網路的壓力狀態；不在模擬時為 undefined */
export function useSimPortState(instance: string, port: string): PortState | undefined {
  return useModuleStore((s) => {
    const sim = s.sim
    if (!sim) return undefined
    const net = sim.mc.netOfPort[`${instance}:${port}`]
    const ep = net === undefined ? undefined : sim.mc.nets[net][0]
    return ep ? (sim.state.portStates[portKey(ep.node, ep.port)] ?? 'blocked') : 'blocked'
  })
}

/** 模擬中 PU 管的壓力狀態 */
export function useSimTubeState(tubeId: string): PortState | undefined {
  return useModuleStore((s) => {
    const sim = s.sim
    if (!sim) return undefined
    const net = sim.mc.netOfTube[tubeId]
    const ep = net === undefined ? undefined : sim.mc.nets[net][0]
    return ep ? (sim.state.portStates[portKey(ep.node, ep.port)] ?? 'blocked') : 'blocked'
  })
}

/** 氣缸的活塞位置 0～1（模擬中；不是氣缸時 undefined） */
export function useSimPiston(nodeId: string): number | undefined {
  return useModuleStore((s) => {
    const st = s.sim?.state.componentStates[nodeId] as { piston?: number } | undefined
    return typeof st?.piston === 'number' ? st.piston : undefined
  })
}

/**
 * 模擬中零件的訊號標籤：氣缸顯示代號與 a0／a1 燈號，電磁閥顯示線圈的輸出（Y1…），壓力開關顯示 PS…。
 * 回傳 [標題, "名稱:0|1", …]（扁平陣列，訊號沒有變化時不重繪）；沒有訊號時 undefined。
 */
export function useSimSignalChip(nodeId: string): string[] | undefined {
  return useModuleStore(
    useShallow((s) => {
      const sim = s.sim
      const node = sim?.mc.circuit.nodes.find((n) => n.id === nodeId)
      if (!sim || !node || !registry.has(node.type)) return undefined
      const def = registry.get(node.type)
      const params = resolveParams(def, node.params)
      const lamp = (name: string) => `${name}:${sim.state.signals[name] ? 1 : 0}`
      if (def.category === 'actuator') {
        const letter = strParam(params, 'sensor')
        return letter ? [letter, lamp(sensorName(letter, 0)), lamp(sensorName(letter, 1))] : undefined
      }
      const coils = (['coilL', 'coilR'] as const).filter((k) => def.params?.some((p) => p.key === k)).map((k) => strParam(params, k)).filter(Boolean)
      if (coils.length) return ['', ...coils.map(lamp)]
      if (node.type === 'pressureSwitch') {
        const name = strParam(params, 'signal')
        return name ? ['', lamp(name)] : undefined
      }
      return undefined
    }),
  )
}

/** 網格的外框中心（零件座標），用來擺放標籤 */
export function meshCenter(mesh: Tessellation): Vec3 {
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const part of mesh.parts) {
    const pos = part.positions
    for (let k = 0; k < pos.length; k += 3) {
      for (let a = 0; a < 3; a++) {
        const v = pos[k + a]
        if (v < min[a]) min[a] = v
        if (v > max[a]) max[a] = v
      }
    }
  }
  return min[0] <= max[0] ? [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2] : [0, 0, 0]
}

/** 閥是否離開靜止位（通電或切換中），用來在 3D 上標示 */
export function useSimValveActive(nodeId: string): boolean {
  return useModuleStore((s) => {
    const sim = s.sim
    const node = sim?.mc.circuit.nodes.find((n) => n.id === nodeId)
    const spec = node && (VALVE_SPECS as Record<string, { rest: number }>)[node.type]
    const st = sim?.state.componentStates[nodeId] as { position?: number } | undefined
    return !!spec && st?.position !== undefined && st.position !== spec.rest
  })
}

/** 模擬中這個零件怎麼操作：切換（點一下）、按住（按鈕閥），或不能操作 */
export function interactionOf(nodeType: string | undefined): 'toggle' | 'momentary' | undefined {
  if (!nodeType || !registry.has(nodeType)) return undefined
  const def = registry.get(nodeType)
  if (!def.onInteract) return undefined
  const spec = (VALVE_SPECS as Record<string, { mode?: string }>)[nodeType]
  return spec?.mode === 'button' ? 'momentary' : 'toggle'
}

const MOVING = /rod|piston|shaft|plunger|桿|活塞|軸/i

/**
 * 氣缸的可動件與伸出方向：產品有設定時用設定；否則依網格零件名稱（ROD、PISTON、活塞桿…）判斷，
 * 方向取「本體中心 → 可動件中心」最接近的座標軸。行程取氣動功能的參數。
 */
export function cylinderMotion(product: Product, mesh: Tessellation | undefined): { parts: Set<number>; axis: Vec3; stroke: number } | undefined {
  const fn = effectivePneumatic(product)
  if (!fn || !registry.has(fn.type) || registry.get(fn.type).category !== 'actuator' || !mesh) return undefined
  const stroke = numParam(resolveParams(registry.get(fn.type), fn.params), 'stroke', 100)
  if (fn.motion?.parts.length) return { parts: new Set(fn.motion.parts), axis: fn.motion.axis, stroke }
  const moving = mesh.parts.flatMap((p, i) => (MOVING.test(p.name) ? [i] : []))
  if (!moving.length || moving.length === mesh.parts.length) return undefined
  const center = (indices: number[]) => {
    const sum: Vec3 = [0, 0, 0]
    let n = 0
    for (const i of indices) {
      const pos = mesh.parts[i].positions
      for (let k = 0; k < pos.length; k += 3) {
        sum[0] += pos[k]
        sum[1] += pos[k + 1]
        sum[2] += pos[k + 2]
        n++
      }
    }
    return n ? (sum.map((v) => v / n) as Vec3) : sum
  }
  const others = mesh.parts.map((_, i) => i).filter((i) => !moving.includes(i))
  const a = center(others)
  const b = center(moving)
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const k = [0, 1, 2].reduce((best, i) => (Math.abs(d[i]) > Math.abs(d[best]) ? i : best), 0)
  const axis: Vec3 = [0, 0, 0]
  axis[k] = Math.sign(d[k]) || 1
  return { parts: new Set(moving), axis, stroke }
}
