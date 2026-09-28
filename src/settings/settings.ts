import { create } from 'zustand'
import { getCatalog } from '../catalog/library'

export type PaperSize = 'A4' | 'A3'
/** 第三角法（台灣、日本、美國常用）／第一角法（歐洲、ISO E） */
export type Projection = 'third' | 'first'

export interface CompanyInfo {
  name: string
  address?: string
  phone?: string
  email?: string
  /** 公司標誌（PNG data URL，已縮小） */
  logo?: string
}

export interface AppSettings {
  company: CompanyInfo
  /** 圖面標題欄的繪圖者 */
  drawer: string
  paper: PaperSize
  projection: Projection
  /** DXF 中文字型檔名（AutoCAD 依此找字型） */
  dxfFont: string
  /** 上次完整備份的時間 */
  lastBackupAt?: number
  /** 「稍後提醒」：在這個時間之前不再提醒備份 */
  backupSnoozeUntil?: number
}

export const DEFAULT_SETTINGS: AppSettings = {
  company: { name: '' },
  drawer: '',
  paper: 'A3',
  projection: 'third',
  dxfFont: 'msjh.ttc',
}

const SETTINGS_KEY = 'app'

interface SettingsState {
  settings: AppSettings
  loaded: boolean
  /** 設定對話框是否開啟（兩個分頁共用） */
  dialogOpen: boolean
  load(): Promise<void>
  update(patch: Partial<AppSettings>): Promise<void>
  openDialog(open: boolean): void
}

let loadPromise: Promise<void> | undefined

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  dialogOpen: false,

  load() {
    loadPromise ??= (async () => {
      try {
        const catalog = await getCatalog()
        const saved = await catalog.getSetting<Partial<AppSettings>>(SETTINGS_KEY)
        set({ settings: mergeSettings(saved), loaded: true })
      } catch {
        loadPromise = undefined
        set({ loaded: true })
      }
    })()
    return loadPromise
  },

  async update(patch) {
    const settings = mergeSettings({ ...get().settings, ...patch })
    set({ settings })
    const catalog = await getCatalog()
    await catalog.putSetting(SETTINGS_KEY, settings)
  },

  openDialog(open) {
    set({ dialogOpen: open })
  },
}))

/** 讀回的設定補上預設值（舊版沒有的欄位） */
export function mergeSettings(saved: Partial<AppSettings> | undefined): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    company: { ...DEFAULT_SETTINGS.company, ...saved?.company },
  }
}

const DAY = 24 * 60 * 60 * 1000

export interface DataSummary {
  /** 產品、模組、迴路圖的數量 */
  items: number
  /** 最早建立的時間 */
  oldest: number
  /** 最近修改的時間 */
  newest: number
}

/**
 * 是否提醒備份：有資料，而且
 * - 從未備份：最早的資料已超過 3 天
 * - 備份過：距上次備份超過 7 天，且之後有修改
 * 「稍後提醒」期間不提醒。
 */
export function needsBackupReminder(settings: AppSettings, data: DataSummary, now = Date.now()): boolean {
  if (data.items === 0) return false
  if (settings.backupSnoozeUntil && now < settings.backupSnoozeUntil) return false
  if (!settings.lastBackupAt) return now - data.oldest > 3 * DAY
  return now - settings.lastBackupAt > 7 * DAY && data.newest > settings.lastBackupAt
}

/** 讀出目前資料的數量與時間範圍 */
export async function summarizeData(): Promise<DataSummary> {
  const catalog = await getCatalog()
  const [products, modules, circuits] = await Promise.all([catalog.listProducts(), catalog.listModules(), catalog.listCircuits()])
  const created = [...products.map((p) => p.createdAt), ...modules.map((m) => m.createdAt), ...circuits.map((c) => c.createdAt)]
  const updated = [...products.map((p) => p.updatedAt), ...modules.map((m) => m.updatedAt), ...circuits.map((c) => c.updatedAt)]
  return {
    items: created.length,
    oldest: created.length ? Math.min(...created) : Date.now(),
    newest: updated.length ? Math.max(...updated) : 0,
  }
}

export const BACKUP_SNOOZE_DAYS = 3
export { DAY }
