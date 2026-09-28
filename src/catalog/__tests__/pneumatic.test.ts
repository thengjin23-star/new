import { describe, expect, it } from 'vitest'
import { parseSpec } from '../../threads'
import { effectivePneumatic, FITTING_TYPE, inferPneumatic, MANIFOLD_TYPE, matchPortsByName, parseBoreStroke } from '../pneumatic'
import { pneumaticFromDef, portsFromDefs } from '../samples'
import type { Product, ProductCategory, ProductPort } from '../types'
import { sampleManifest } from './nodeHelpers'

function port(name: string, spec?: string): ProductPort {
  const parsed = spec ? parseSpec(spec, { gender: 'male' }) : undefined
  return {
    id: `p_${name}`,
    name,
    spec: parsed?.ok ? parsed.spec : undefined,
    frame: { origin: [0, 0, 0], axis: [0, 0, 1], ref: [1, 0, 0] },
    rotation: 'free',
  }
}

function product(category: ProductCategory, ports: ProductPort[], modelCode = 'X', name = ''): Product {
  return {
    id: `id_${modelCode}`,
    modelCode,
    name,
    category,
    source: { fileName: 'x.step', sha256: modelCode, format: 'step', bytes: 1 },
    ports,
    createdAt: 0,
    updatedAt: 0,
  }
}

describe('parseBoreStroke', () => {
  it.each`
    text                          | bore   | stroke
    ${'範例氣缸 Ø16 × 50（M5）'}  | ${16}  | ${50}
    ${'φ20x100'}                  | ${20}  | ${100}
    ${'CDJ2B16-50'}               | ${16}  | ${50}
    ${'CM2B20-100'}               | ${20}  | ${100}
    ${'MB32-100'}                 | ${32}  | ${100}
    ${'SC32X100'}                 | ${32}  | ${100}
    ${'DSBC-32-100-PPVA'}         | ${32}  | ${100}
    ${'MB1-32-100'}               | ${32}  | ${100}
  `('$text → Ø$bore × $stroke', ({ text, bore, stroke }) => {
    expect(parseBoreStroke(text)).toEqual({ bore, stroke })
  })

  it('找不到標準缸徑時回傳 undefined', () => {
    expect(parseBoreStroke('氣缸')).toBeUndefined()
    expect(parseBoreStroke('ABC7-13')).toBeUndefined()
  })
})

describe('matchPortsByName', () => {
  it('5 口閥：字母、ISO 數字與 R1/R2 都認得', () => {
    const letters = [port('P'), port('A'), port('B'), port('EA'), port('EB')]
    expect(matchPortsByName('valve52Single', letters)).toEqual({ P: 'p_P', A: 'p_A', B: 'p_B', EA: 'p_EA', EB: 'p_EB' })
    const numbers = [port('1'), port('2'), port('3'), port('4'), port('5')]
    expect(matchPortsByName('valve52Single', numbers)).toEqual({ P: 'p_1', A: 'p_4', B: 'p_2', EA: 'p_5', EB: 'p_3' })
    const r = [port('P'), port('A'), port('B'), port('R1'), port('R2')]
    expect(matchPortsByName('valve52Double', r)).toMatchObject({ EA: 'p_R1', EB: 'p_R2' })
  })

  it('3 口閥的 A = 2、R = 3', () => {
    expect(matchPortsByName('valve32NC', [port('1'), port('2'), port('3')])).toEqual({ P: 'p_1', A: 'p_2', R: 'p_3' })
  })

  it('單埠功能對應到唯一的管路埠', () => {
    expect(matchPortsByName('silencer', [port('1', 'R1/8')])).toEqual({ E: 'p_1' })
  })

  it('每個產品埠只用一次；安裝面不列入', () => {
    const ports = [port('安裝面', '安裝面：DEMO-VB 閥座'), port('A'), port('B')]
    expect(matchPortsByName('cylinderDouble', ports)).toEqual({ A: 'p_A', B: 'p_B' })
  })
})

describe('inferPneumatic', () => {
  it('速度控制閥：螺紋側 = 2（氣缸側）、快插側 = 1（閥側）', () => {
    const p = product('speedController', [port('1', 'M5'), port('2', 'Ø4 快插')])
    expect(inferPneumatic(p)).toEqual({ type: 'flowControl', portMap: { '2': 'p_1', '1': 'p_2' } })
  })

  it('氣缸：帶入缸徑與行程', () => {
    const p = product('cylinder', [port('A', 'M5'), port('B', 'M5')], 'CDJ2B16-50')
    expect(inferPneumatic(p)).toMatchObject({ type: 'cylinderDouble', params: { bore: 16, stroke: 50 } })
  })

  it.each`
    category     | name                     | ports                       | type
    ${'valve'}   | ${'5/2 雙電控閥'}        | ${['P', 'A', 'B', 'EA', 'EB']} | ${'valve52Double'}
    ${'valve'}   | ${'5/3 中位排氣'}        | ${['P', 'A', 'B', 'EA', 'EB']} | ${'valve53Exhaust'}
    ${'valve'}   | ${'3/2 常開電磁閥'}      | ${['1', '2', '3']}          | ${'valve32NO'}
    ${'valve'}   | ${''}                    | ${['1', '2']}               | ${'valve22NC'}
    ${'cylinder'} | ${'單動氣缸'}           | ${['A']}                    | ${'cylinderSingle'}
    ${'frl'}     | ${'調壓閥'}              | ${['IN', 'OUT']}            | ${'regulator'}
    ${'frl'}     | ${'空氣過濾器'}          | ${['IN', 'OUT']}            | ${'filter'}
    ${'fitting'} | ${'快插接頭'}            | ${['1', '2']}               | ${FITTING_TYPE}
    ${'manifold'} | ${'集裝座'}             | ${['P']}                    | ${MANIFOLD_TYPE}
    ${'valve'}   | ${'5/2 單氣控閥'}        | ${['P', 'A', 'B', 'EA', 'EB', '14']} | ${'valve52Pilot'}
    ${'valve'}   | ${'5/2 雙氣控閥'}        | ${['P', 'A', 'B', 'EA', 'EB', '14', '12']} | ${'valve52DoublePilot'}
    ${'valve'}   | ${'3/2 滾輪閥'}          | ${['1', '2', '3']}          | ${'valve32Roller'}
    ${'valve'}   | ${'3/2 氣控閥'}          | ${['1', '2', '3', '12']}    | ${'valve32Pilot'}
    ${'valve'}   | ${'梭動閥'}              | ${['X', 'Y', 'A']}          | ${'shuttleValve'}
    ${'valve'}   | ${'雙壓閥'}              | ${['1', '1', '2']}          | ${'twoPressureValve'}
    ${'valve'}   | ${'快速排氣閥'}          | ${['1', '2', '3']}          | ${'quickExhaust'}
    ${'valve'}   | ${'氣動延時閥'}          | ${['1', '2', '3', '12']}    | ${'valve32Timer'}
  `('$category「$name」→ $type', ({ category, name, ports, type }) => {
    const p = product(category, (ports as string[]).map((n) => port(n)), 'M', name)
    expect(inferPneumatic(p)?.type).toBe(type)
  })

  it('氣控閥的先導埠、梭動閥的兩個入口依名稱對應', () => {
    const pilot = product('valve', ['P', 'A', 'B', 'EA', 'EB', 'Z'].map((n) => port(n)), 'M', '5/2 單氣控閥')
    expect(inferPneumatic(pilot)?.portMap['14']).toBe('p_Z')
    const shuttle = product('valve', ['IN1', 'IN2', 'OUT'].map((n) => port(n)), 'M', '梭動閥')
    expect(inferPneumatic(shuttle)?.portMap).toEqual({ X: 'p_IN1', Y: 'p_IN2', A: 'p_OUT' })
  })

  it('分類為「其他」時不推斷', () => {
    expect(inferPneumatic(product('other', [port('1')]))).toBeUndefined()
  })

  it('所有範例零件都能推斷出功能，且與 manifest 中寫明的功能一致', () => {
    for (const part of sampleManifest().parts) {
      const ports = portsFromDefs(part.ports)
      const p = product(part.category, ports, part.modelCode, part.name)
      const inferred = inferPneumatic(p)
      expect(inferred?.type, part.modelCode).toBe(part.pneumatic?.type)
      // manifest 寫明的埠對應，與自動推斷的結果相同
      if (part.pneumatic) expect(inferred?.portMap, part.modelCode).toEqual(pneumaticFromDef(part.pneumatic, ports).portMap)
    }
  })
})

describe('effectivePneumatic', () => {
  it('使用者設定優先；否則標記為推斷', () => {
    const p = product('silencer', [port('1')])
    expect(effectivePneumatic(p)).toMatchObject({ type: 'silencer', inferred: true })
    const set = { ...p, pneumatic: { type: 'exhaust', portMap: {} } }
    expect(effectivePneumatic(set)).toEqual({ type: 'exhaust', portMap: {}, inferred: false })
  })
})

describe('pneumaticTypeOptions', () => {
  it('每個可放進迴路圖的元件都在某個分組中（含訊號與邏輯）', async () => {
    const { pneumaticTypeOptions } = await import('../pneumatic')
    const { registry } = await import('../../engine')
    const listed = new Set(pneumaticTypeOptions().flatMap((g) => g.options.map((o) => o.value)))
    for (const d of registry.list()) if (!d.hidden && d.type !== 'airSupply') expect(listed.has(d.type), d.type).toBe(true)
    expect(pneumaticTypeOptions().some((g) => g.group === '訊號與邏輯')).toBe(true)
  })
})
