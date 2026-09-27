import { readFileSync } from 'node:fs'
import occtimportjs from 'occt-import-js'
import opencascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { Matrix4, Vector3 } from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildAssemblyStep } from '../stepAssembly'

const VALVE = new Uint8Array(readFileSync('public/samples/DEMO-VALVE-52-01.step'))
const SILENCER = new Uint8Array(readFileSync('public/samples/DEMO-SILENCER-R18.step'))

beforeAll(async () => {
  const oc = await opencascade({
    locateFile: () => new URL('../../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm', import.meta.url).pathname,
    print: () => undefined,
    printErr: () => undefined,
  } as never)
  setOC(oc)
}, 60_000)

interface OcctNode {
  name: string
  meshes: number[]
  children: OcctNode[]
}
interface OcctMeshOut {
  name: string
  color?: number[]
  attributes: { position: { array: number[] } }
}

/** 用 occt-import-js 讀回 STEP：每個頂層零件的名稱、顏色與外框（零件可能由數個實體組成） */
async function readBack(bytes: Uint8Array) {
  const occt = await occtimportjs()
  const result = occt.ReadStepFile(bytes, null) as { success: boolean; root: OcctNode; meshes: OcctMeshOut[] }
  expect(result.success).toBe(true)
  const collect = (node: OcctNode): number[] => [...node.meshes, ...node.children.flatMap(collect)]
  const nodes = result.root.children.length ? result.root.children : [result.root]
  return nodes.map((node) => {
    const min = [Infinity, Infinity, Infinity]
    const max = [-Infinity, -Infinity, -Infinity]
    const meshes = collect(node).map((i) => result.meshes[i])
    for (const m of meshes) {
      const p = m.attributes.position.array
      for (let i = 0; i < p.length; i += 3)
        for (let k = 0; k < 3; k++) {
          min[k] = Math.min(min[k], p[i + k])
          max[k] = Math.max(max[k], p[i + k])
        }
    }
    return { name: node.name, color: meshes[0]?.color, min, max }
  })
}

describe('buildAssemblyStep', () => {
  it('每個零件一個實體：名稱、顏色、位置（旋轉＋平移）都正確', async () => {
    const files = new Map([
      ['valve', VALVE],
      ['silencer', SILENCER],
    ])
    const moved = new Matrix4().makeRotationZ(Math.PI / 2).setPosition(100, 0, 0)
    const progress: number[] = []
    const bytes = await buildAssemblyStep(
      files,
      [
        { name: '1_VALVE', source: 'valve', matrix: new Matrix4().elements },
        { name: '1_VALVE_2', source: 'valve', matrix: moved.elements, color: '#ff0000' },
        { name: '2_SILENCER', source: 'silencer', matrix: new Matrix4().makeTranslation(0, 0, 200).elements },
      ],
      (done) => progress.push(done),
    )
    expect(progress).toEqual([1, 2, 3])
    const text = new TextDecoder().decode(bytes.slice(0, 20000))
    expect(text).toContain('ISO-10303-21')
    const parts = await readBack(bytes)
    expect(parts.map((p) => p.name)).toEqual(['1_VALVE', '1_VALVE_2', '2_SILENCER'])
    const [a, b, c] = parts
    // 第二顆閥：繞 Z 轉 90° 後平移 (100, 0, 0)：外框的 x 範圍 = 原本的 y 範圍 + 100
    const expectMin = new Vector3(a.min[0], a.min[1], a.min[2])
    const corners = [
      [a.min[0], a.min[1]],
      [a.max[0], a.max[1]],
    ].map(([x, y]) => new Vector3(x, y, 0).applyMatrix4(moved))
    expect(b.min[0]).toBeCloseTo(Math.min(corners[0].x, corners[1].x), 1)
    expect(b.max[1]).toBeCloseTo(Math.max(corners[0].y, corners[1].y), 1)
    expect(b.min[2]).toBeCloseTo(expectMin.z, 1)
    expect(b.color?.[0]).toBeCloseTo(1, 2)
    expect(c.min[2]).toBeGreaterThan(190)
  }, 60_000)

  it('缺少原始檔時提示是哪個零件', async () => {
    await expect(buildAssemblyStep(new Map(), [{ name: '3_X', source: 'nope', matrix: new Matrix4().elements }])).rejects.toThrow('3_X')
  })
})
