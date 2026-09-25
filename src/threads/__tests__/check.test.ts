import { describe, expect, it } from 'vitest'
import { adapterNeed, checkMate } from '../check'
import type { MateLevel } from '../types'
import { spec } from './helpers'

/** [公側或 A 端, 母側或 B 端, 預期結果] */
const MATRIX: [string, string, MateLevel][] = [
  // ISO 管螺紋（PT／PF／PS）
  ['R1/8', 'Rc1/8', 'ok'],
  ['PT1/4 公', 'PT1/4 母', 'ok'],
  ['R1/4', 'PS1/4', 'ok'],
  ['G1/8 公', 'G1/8 母', 'ok'],
  ['R1/4', 'G1/4 母', 'warn'],
  ['G1/4 公', 'Rc1/4', 'warn'],
  ['G1/4 公', 'Rp1/4', 'warn'],
  ['R1/4', 'Rc1/8', 'error'],
  ['R1/8', 'R1/8', 'error'],
  ['Rc1/8', 'PF1/8 母', 'error'],
  // NPT
  ['NPT1/8 公', 'NPT1/8 母', 'ok'],
  ['NPTF1/8 公', 'NPT1/8 母', 'ok'],
  ['NPT1/8 公', 'Rc1/8', 'error'],
  ['NPT1/4 公', 'Rc1/4', 'error'],
  ['NPT1/2 公', 'G1/2 母', 'error'],
  // 公制與統一螺紋
  ['M5 公', 'M5x0.8 母', 'ok'],
  ['M5 公', '10-32UNF 母', 'error'],
  ['M8 公', 'M8x1 母', 'error'],
  ['M5 公', 'M6 母', 'error'],
  ['10-32UNF 公', '10-32UNF 母', 'ok'],
  ['M5 公', 'Rc1/8', 'error'],
  // 管徑
  ['Ø6 快插', 'Ø6 插管', 'ok'],
  ['Ø6 快插', 'Ø1/4" 插管', 'error'],
  ['Ø6 快插', 'Ø6 快插', 'error'],
  ['Ø6 插管', 'Ø6 插管', 'error'],
  ['Rc1/8', 'Ø6 快插', 'error'],
]

describe('checkMate 相容矩陣', () => {
  it.each(MATRIX)('%s ↔ %s → %s', (a, b, level) => {
    expect(checkMate(spec(a), spec(b)).level).toBe(level)
  })

  it.each(MATRIX)('順序無關：%s ↔ %s', (a, b) => {
    const ab = checkMate(spec(a), spec(b))
    const ba = checkMate(spec(b), spec(a))
    expect(ba.level).toBe(ab.level)
    expect(ba.summary).toBe(ab.summary)
  })
})

describe('checkMate 的說明文字', () => {
  it('NPT 與 PT：說明牙角與牙數差異', () => {
    const r = checkMate(spec('NPT1/8 公'), spec('Rc1/8'))
    expect(r.summary).toContain('NPT 與 PT')
    const text = r.reasons.join('\n')
    expect(text).toContain('55°')
    expect(text).toContain('60°')
    expect(text).toContain('27 牙/吋')
    expect(text).toContain('28 牙/吋')
  })

  it('NPT1/2 與 G1/2 牙數都是 14，但牙角不同仍不相容', () => {
    const r = checkMate(spec('NPT1/2 公'), spec('G1/2 母'))
    expect(r.reasons.join()).toContain('14 牙/吋')
    expect(r.reasons[0]).toContain('牙角不同')
  })

  it('M5 與 10-32UNF：外觀相近但不可混用', () => {
    const r = checkMate(spec('M5 公'), spec('10-32UNF 母'))
    expect(r.summary).toContain('不可混用')
    expect(r.reasons.join()).toContain('牙距 0.8 mm')
    expect(r.reasons.join()).toContain('32 牙/吋')
  })

  it('錐管螺紋提醒止洩帶；G 提醒墊圈', () => {
    expect(checkMate(spec('R1/8'), spec('Rc1/8')).reasons.join()).toContain('止洩帶')
    expect(checkMate(spec('G1/8 公'), spec('G1/8 母')).reasons.join()).toContain('墊圈')
  })

  it('公公、母母、尺寸不同的說明', () => {
    expect(checkMate(spec('R1/8'), spec('R1/8')).summary).toContain('兩端都是公牙')
    expect(checkMate(spec('Rc1/8'), spec('Rc1/8')).reasons.join()).toContain('雙公')
    expect(checkMate(spec('R1/4'), spec('Rc1/8')).summary).toContain('尺寸不同')
  })

  it('公制與英制管徑相差 0.35 mm', () => {
    const r = checkMate(spec('Ø6 快插'), spec('Ø1/4" 插管'))
    expect(r.reasons.join()).toContain('0.35')
    expect(r.reasons.join()).toContain('公制與英制')
  })

  it('尚未設定規格 → unknown', () => {
    expect(checkMate(undefined, spec('R1/8')).level).toBe('unknown')
    expect(checkMate(spec('R1/8'), undefined).level).toBe('unknown')
  })
})

describe('安裝面', () => {
  const plug = spec('安裝面：SY3000 閥座', { interfaceRole: 'plug' })
  const socket = spec('安裝面：sy3000閥座', { interfaceRole: 'socket' })
  const mutual = spec('安裝面：FRL-40')

  it('元件側配底座側；名稱比對忽略大小寫與空白', () => {
    expect(checkMate(plug, socket).level).toBe('ok')
    expect(checkMate(socket, plug).level).toBe('ok')
  })

  it('對接面配對接面', () => {
    expect(checkMate(mutual, spec('安裝面：FRL-40')).level).toBe('ok')
  })

  it('訊息與點選先後無關', () => {
    const other = spec('安裝面：VF3000', { interfaceRole: 'socket' })
    for (const [x, y] of [
      [plug, other],
      [plug, plug],
      [plug, mutual],
      [socket, mutual],
    ]) {
      expect(checkMate(y, x)).toEqual(checkMate(x, y))
    }
  })

  it('方向不相配、名稱不同、與螺紋混接都不行', () => {
    expect(checkMate(plug, plug).level).toBe('error')
    expect(checkMate(plug, mutual).level).toBe('error')
    expect(checkMate(plug, spec('安裝面：VF3000', { interfaceRole: 'socket' })).summary).toContain('安裝面不同')
    expect(checkMate(plug, spec('Rc1/8')).level).toBe('error')
  })
})

describe('adapterNeed', () => {
  it('Rc1/4 母 與 R1/8 公 之間需要 R1/4 公 × Rc1/8 母 的縮徑接頭', () => {
    const need = adapterNeed(spec('Rc1/4'), spec('R1/8'))
    expect(need.forA).toEqual(spec('R1/4'))
    expect(need.forB).toEqual(spec('Rc1/8'))
    expect(need.description).toContain('R1/4 公（PT） × Rc1/8 母（PT）')
  })

  it('NPT 公 接 Rc 母：需要 NPT 母 × R 公', () => {
    const need = adapterNeed(spec('NPT1/8 公'), spec('Rc1/8'))
    expect(need.forA).toEqual(spec('NPT1/8 母'))
    expect(need.forB).toEqual(spec('R1/8'))
  })

  it('母牙孔要接快插口：需要插管式接頭', () => {
    const need = adapterNeed(spec('Rc1/8'), spec('Ø6 快插'))
    expect(need.forB).toEqual(spec('Ø6 插管'))
  })
})
