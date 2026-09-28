import { useEffect, useState } from 'react'
import { useLibraryStore } from '../catalog/library'
import { downloadBackup } from '../settings/backup'
import { BACKUP_SNOOZE_DAYS, DAY, needsBackupReminder, summarizeData, useSettingsStore } from '../settings/settings'

/** 太久沒備份時，在畫面最上方提醒 */
export function BackupReminder() {
  const settings = useSettingsStore((s) => s.settings)
  const loaded = useSettingsStore((s) => s.loaded)
  const libraryReady = useLibraryStore((s) => s.status === 'ready')
  const [state, setState] = useState<{ show: boolean; days?: number }>({ show: false })
  const [busy, setBusy] = useState(false)
  const setShow = (show: boolean) => setState((s) => ({ ...s, show }))

  useEffect(() => {
    if (!loaded || !libraryReady) return
    let cancelled = false
    summarizeData()
      .then((data) => {
        if (cancelled) return
        const now = Date.now()
        setState({
          show: needsBackupReminder(settings, data, now),
          days: settings.lastBackupAt ? Math.floor((now - settings.lastBackupAt) / DAY) : undefined,
        })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [loaded, libraryReady, settings])

  if (!state.show) return null
  const days = state.days
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-900" role="status">
      <span>
        {days === undefined ? '還沒有備份過資料。' : `已經 ${days} 天沒有備份。`}
        產品庫、模組與迴路圖只存在這台裝置的瀏覽器中，建議下載完整備份。
      </span>
      <span className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await downloadBackup()
              setShow(false)
            } finally {
              setBusy(false)
            }
          }}
          className="rounded-md bg-amber-600 px-2.5 py-0.5 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
        >
          立即備份
        </button>
        <button
          type="button"
          onClick={() => {
            setShow(false)
            void useSettingsStore.getState().update({ backupSnoozeUntil: Date.now() + BACKUP_SNOOZE_DAYS * DAY })
          }}
          className="rounded-md px-2 py-0.5 text-sm hover:bg-amber-100"
        >
          {BACKUP_SNOOZE_DAYS} 天後再提醒
        </button>
      </span>
    </div>
  )
}
