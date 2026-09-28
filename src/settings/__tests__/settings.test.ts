import { describe, expect, it } from 'vitest'
import { DAY, DEFAULT_SETTINGS, mergeSettings, needsBackupReminder } from '../settings'

const now = 100 * DAY

describe('needsBackupReminder', () => {
  it('沒有資料時不提醒', () => {
    expect(needsBackupReminder(DEFAULT_SETTINGS, { items: 0, oldest: 0, newest: 0 }, now)).toBe(false)
  })

  it('從未備份：資料超過 3 天才提醒', () => {
    expect(needsBackupReminder(DEFAULT_SETTINGS, { items: 3, oldest: now - 2 * DAY, newest: now }, now)).toBe(false)
    expect(needsBackupReminder(DEFAULT_SETTINGS, { items: 3, oldest: now - 4 * DAY, newest: now }, now)).toBe(true)
  })

  it('備份過：超過 7 天且之後有修改才提醒', () => {
    const settings = { ...DEFAULT_SETTINGS, lastBackupAt: now - 8 * DAY }
    expect(needsBackupReminder(settings, { items: 3, oldest: 0, newest: now - 9 * DAY }, now)).toBe(false)
    expect(needsBackupReminder(settings, { items: 3, oldest: 0, newest: now - DAY }, now)).toBe(true)
    expect(needsBackupReminder({ ...settings, lastBackupAt: now - 2 * DAY }, { items: 3, oldest: 0, newest: now }, now)).toBe(false)
  })

  it('稍後提醒期間不提醒', () => {
    const settings = { ...DEFAULT_SETTINGS, backupSnoozeUntil: now + DAY }
    expect(needsBackupReminder(settings, { items: 3, oldest: 0, newest: now }, now)).toBe(false)
  })
})

describe('mergeSettings', () => {
  it('舊版設定補上新欄位的預設值', () => {
    expect(mergeSettings({ company: { name: '甲' } })).toEqual({ ...DEFAULT_SETTINGS, company: { name: '甲' } })
    expect(mergeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
  })
})
