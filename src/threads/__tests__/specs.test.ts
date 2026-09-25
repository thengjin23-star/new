import { describe, expect, it } from 'vitest'
import { complement, formatSpec, formatSpecShort } from '../specs'
import { spec } from './helpers'

describe('顯示格式', () => {
  it.each([
    ['R1/4', 'R1/4 公（PT）'],
    ['Rc1/8', 'Rc1/8 母（PT）'],
    ['PF1/8 公', 'G1/8 公（PF）'],
    ['PS1/4', 'Rp1/4 母（PS）'],
    ['NPT1/8 公', 'NPT1/8 公'],
    ['M5 母', 'M5×0.8 母'],
    ['M6x0.75 公', 'M6×0.75 公'],
    ['10-32UNF 公', '10-32UNF 公'],
    ['Ø6 快插', 'Ø6 快插'],
    ['Ø1/4" 插管', 'Ø1/4" 插管'],
  ])('%s → %s', (input, expected) => {
    expect(formatSpec(spec(input))).toBe(expected)
  })

  it('安裝面與精簡格式', () => {
    expect(formatSpec(spec('安裝面：SY3000', { interfaceRole: 'socket' }))).toBe('安裝面「SY3000」（底座側）')
    expect(formatSpecShort(spec('Rc1/8'))).toBe('Rc1/8')
    expect(formatSpecShort(spec('Ø6 快插'))).toBe('Ø6')
  })
})

describe('complement', () => {
  it('R ↔ Rc、Rp → R、G／NPT／M 只換公母', () => {
    expect(complement(spec('R1/4'))).toEqual(spec('Rc1/4'))
    expect(complement(spec('Rc1/4'))).toEqual(spec('R1/4'))
    expect(complement(spec('PS1/4'))).toEqual(spec('R1/4'))
    expect(complement(spec('G1/8 公'))).toEqual(spec('G1/8 母'))
    expect(complement(spec('M6x0.75 母'))).toEqual(spec('M6x0.75 公'))
  })

  it('快插口 ↔ 插管端、元件側 ↔ 底座側、對接面不變', () => {
    expect(complement(spec('Ø6 快插'))).toEqual(spec('Ø6 插管'))
    expect(complement(spec('安裝面：X', { interfaceRole: 'plug' }))).toEqual(spec('安裝面：X', { interfaceRole: 'socket' }))
    expect(complement(spec('安裝面：X'))).toEqual(spec('安裝面：X'))
  })
})
