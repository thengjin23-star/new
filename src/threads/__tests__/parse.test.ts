import { describe, expect, it } from 'vitest'
import { parseSpec } from '../parse'

const ok = (text: string, options?: Parameters<typeof parseSpec>[1]) => {
  const r = parseSpec(text, options)
  if (!r.ok) throw new Error(r.error)
  return r
}
const err = (text: string, options?: Parameters<typeof parseSpec>[1]) => {
  const r = parseSpec(text, options)
  if (r.ok) throw new Error(`應該失敗：${text}`)
  return r.error
}

describe('管螺紋（含台灣常用的 PT／PF／PS 寫法）', () => {
  it('PT 依公母轉為 R／Rc', () => {
    expect(ok('PT1/4 母').spec).toEqual({ kind: 'thread', standard: 'Rc', size: '1/4', gender: 'female' })
    expect(ok('PT1/4 公').spec).toEqual({ kind: 'thread', standard: 'R', size: '1/4', gender: 'male' })
    expect(ok('PT1/8', { gender: 'male' }).spec).toMatchObject({ standard: 'R', gender: 'male' })
    expect(ok('PT1/4 母').notes.join()).toContain('Rc')
  })

  it('PT 沒有公母時要求補上', () => {
    expect(err('PT1/4')).toContain('公牙或母牙')
  })

  it('PF = G、PS = Rp', () => {
    expect(ok('PF1/8 公').spec).toEqual({ kind: 'thread', standard: 'G', size: '1/8', gender: 'male' })
    expect(ok('PF1/8', { gender: 'female' }).spec).toMatchObject({ standard: 'G', gender: 'female' })
    expect(ok('PS1/4').spec).toEqual({ kind: 'thread', standard: 'Rp', size: '1/4', gender: 'female' })
    expect(err('PS1/4 公')).toContain('母牙規格')
  })

  it('R 只有公牙、Rc 只有母牙', () => {
    expect(ok('R1/8').spec).toMatchObject({ standard: 'R', gender: 'male' })
    expect(ok('Rc1/8').spec).toMatchObject({ standard: 'Rc', gender: 'female' })
    expect(err('R1/8 母')).toContain('公牙規格')
  })

  it('NPT、倒寫、G 的 A/B 等級、外牙／內牙寫法', () => {
    expect(ok('1/4NPT 公').spec).toEqual({ kind: 'thread', standard: 'NPT', size: '1/4', gender: 'male' })
    expect(ok('1/4"NPT', { gender: 'female' }).spec).toMatchObject({ standard: 'NPT', gender: 'female' })
    expect(ok('NPTF1/8 內牙').spec).toMatchObject({ standard: 'NPTF', gender: 'female' })
    expect(ok('G1/4A 外牙').spec).toMatchObject({ standard: 'G', size: '1/4', gender: 'male' })
    expect(err('NPT1/8')).toContain('公牙或母牙')
  })

  it('全形字也能辨識', () => {
    expect(ok('ＰＴ１／８ 公').spec).toMatchObject({ standard: 'R', size: '1/8' })
  })

  it('不支援的尺寸', () => {
    expect(err('PT5/16 公')).toContain('不支援的管螺紋尺寸')
  })

  it('模型判斷的公母與輸入不同時提醒', () => {
    const r = ok('R1/8', { gender: 'female' })
    expect(r.spec).toMatchObject({ gender: 'male' })
    expect(r.notes.join()).toContain('請再確認')
  })
})

describe('公制與統一螺紋', () => {
  it('省略牙距時使用粗牙，且不另存 pitch', () => {
    expect(ok('M5', { gender: 'female' }).spec).toEqual({ kind: 'thread', standard: 'M', size: '5', gender: 'female' })
    expect(ok('M5x0.8 母').spec).not.toHaveProperty('pitch')
    expect(ok('公制 M5 母').spec).toMatchObject({ standard: 'M', gender: 'female' })
  })

  it('細牙會記錄牙距', () => {
    expect(ok('M6×0.75 公').spec).toMatchObject({ size: '6', pitch: 0.75 })
    expect(ok('m8*1', { gender: 'male' }).spec).toMatchObject({ size: '8', pitch: 1 })
  })

  it('沒有標準粗牙的直徑要求寫牙距', () => {
    expect(err('M7 公')).toContain('牙距')
  })

  it('統一螺紋依牙數判斷 UNF／UNC', () => {
    expect(ok('10-32UNF 母').spec).toEqual({ kind: 'thread', standard: 'UNF', size: '10-32', gender: 'female' })
    expect(ok('10-32', { gender: 'male' }).spec).toMatchObject({ standard: 'UNF' })
    expect(ok('1/4-20 公').spec).toMatchObject({ standard: 'UNC', size: '1/4-20' })
  })
})

describe('管徑與安裝面', () => {
  it('公制管徑：Ø、φ、mm；快插／插管決定角色', () => {
    expect(ok('Ø6 快插').spec).toEqual({ kind: 'tube', od: 6, system: 'metric', role: 'socket' })
    expect(ok('φ6', { gender: 'male' }).spec).toMatchObject({ od: 6, role: 'stem' })
    expect(ok('6mm').spec).toMatchObject({ kind: 'tube', od: 6, role: 'socket' })
    expect(ok('Ø8 插管').spec).toMatchObject({ od: 8, role: 'stem' })
  })

  it('英制管徑換算成 mm', () => {
    expect(ok('Ø1/4"').spec).toEqual({ kind: 'tube', od: 6.35, system: 'inch', role: 'socket' })
    expect(ok('1/4" 管').spec).toMatchObject({ kind: 'tube', od: 6.35 })
  })

  it('有歧義的寫法要求說清楚', () => {
    expect(err('1/4"')).toContain('可能是管徑或螺紋')
    expect(err('6')).toContain('Ø')
  })

  it('安裝面保留原本的名稱與大小寫', () => {
    expect(ok('安裝面：SY3000 閥座').spec).toEqual({ kind: 'interface', key: 'SY3000 閥座', role: 'mutual' })
    expect(ok('interface: FRL-40', { interfaceRole: 'socket' }).spec).toMatchObject({ key: 'FRL-40', role: 'socket' })
  })

  it('空白與無法辨識', () => {
    expect(err('  ')).toContain('請輸入')
    expect(err('abc')).toContain('無法辨識')
  })
})
