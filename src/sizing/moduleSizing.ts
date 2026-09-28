import { deriveModuleCircuit } from '../assembly/moduleCircuit'
import { computeTransforms, tubeLength, type ProductMap } from '../assembly/moduleOps'
import { formatMeters, tubeInnerDiameter, tubeLabelOf } from '../assembly/tubes'
import type { Mat4, ModuleDoc, ModuleTube } from '../assembly/types'
import { productLabel } from '../catalog/types'
import { portKey, registry, resolveParams, strParam, traceLine } from '../engine'
import { circuitPressure, sortInputs } from './circuitSizing'
import { cylinderSpecOf, loadSpecOf, type SizingInput, type SizingSettings } from './sizing'

/**
 * 3D 模組的氣缸 → 選型計算的輸入。配管容積用實際的 PU 管：從氣缸埠沿著網路、經過速度控制閥
 * 找到驅動它的閥，沿途網路上的 PU 管都算進去（管長用指定值，沒有時依位置估算）。
 */
export function moduleSizingInputs(
  doc: ModuleDoc,
  products: ProductMap,
  settings: SizingSettings = {},
  transforms: Readonly<Record<string, Mat4>> = computeTransforms(doc, products).transforms,
): SizingInput[] {
  const mc = deriveModuleCircuit(doc, products)
  const pressure = circuitPressure(mc.circuit)
  const netOf = new Map<string, number>()
  mc.nets.forEach((net, i) => net.forEach((e) => netOf.set(portKey(e.node, e.port), i)))
  const tubesOfNet = new Map<number, ModuleTube[]>()
  for (const t of doc.tubes ?? []) {
    const net = mc.netOfTube[t.id]
    if (net !== undefined) tubesOfNet.set(net, [...(tubesOfNet.get(net) ?? []), t])
  }
  const lengthOf = (t: ModuleTube) => tubeLength(doc, products, t, transforms) ?? 0
  const volume = (tubes: readonly ModuleTube[]) => tubes.reduce((s, t) => s + (Math.PI / 4) * tubeInnerDiameter(t.od) ** 2 * lengthOf(t), 0)

  const out: SizingInput[] = []
  for (const node of mc.circuit.nodes) {
    if (!registry.has(node.type)) continue
    const def = registry.get(node.type)
    if (def.category !== 'actuator') continue
    // 這一側（A 或 B）從氣缸到閥之間的 PU 管
    const sideTubes = (port: string): ModuleTube[] => {
      if (!def.ports.some((p) => p.id === port)) return []
      const nets = new Set(traceLine(mc.circuit, portKey(node.id, port)).ports.flatMap((k) => (netOf.has(k) ? [netOf.get(k)!] : [])))
      return [...nets].flatMap((n) => tubesOfNet.get(n) ?? [])
    }
    const a = sideTubes('A')
    const b = sideTubes('B')
    const params = resolveParams(def, node.params)
    const letter = strParam(params, 'sensor') || undefined
    const inst = doc.instances.find((i) => i.id === mc.nodeInstance[node.id])
    const product = inst && products[inst.productId]
    const model = product ? product.modelCode || productLabel(product) : undefined
    const describe = (side: string, tubes: readonly ModuleTube[]) =>
      tubes.length ? `${side}：${tubes.map((t) => `${tubeLabelOf(t)} × ${formatMeters(lengthOf(t))}`).join('＋')}` : undefined
    const tubing = [describe('A', a), describe('B', b)].filter(Boolean).join('；')
    out.push({
      id: node.id,
      label: letter ? `${letter}${model ? `（${model}）` : ''}` : (model ?? def.label),
      letter,
      model,
      cylinder: cylinderSpecOf(node.type, params),
      load: loadSpecOf(params),
      pressure: settings.pressure ?? pressure(node.id, def.ports.map((p) => p.id)),
      dead: { extend: volume(a), retract: volume(b) },
      tubing: tubing || '（沒有 PU 管）',
    })
  }
  return sortInputs(out)
}
