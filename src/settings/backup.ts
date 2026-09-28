import { BACKUP_EXT, exportBackupArchive, importArchive, type ArchiveImportReport } from '../catalog/archive'
import { getCatalog, useLibraryStore } from '../catalog/library'
import { downloadFile } from '../utils/download'
import { useSettingsStore } from './settings'

const stamp = (d = new Date()) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`

/** 下載完整備份，並記下備份時間 */
export async function downloadBackup(): Promise<void> {
  const catalog = await getCatalog()
  const bytes = await exportBackupArchive(catalog)
  downloadFile(bytes, `氣動資料備份-${stamp()}${BACKUP_EXT}`, 'application/zip')
  await useSettingsStore.getState().update({ lastBackupAt: Date.now(), backupSnoozeUntil: undefined })
}

/** 從備份（或產品庫、模組檔）還原，回傳一句說明 */
export async function restoreFromFile(file: File): Promise<{ report: ArchiveImportReport; text: string }> {
  const catalog = await getCatalog()
  const report = await importArchive(catalog, new Uint8Array(await file.arrayBuffer()))
  await useLibraryStore.getState().reload(true)
  const parts = [
    `新增 ${report.productsAdded} 個產品`,
    report.productsMerged ? `合併 ${report.productsMerged} 個` : '',
    report.modulesRestored ? `還原 ${report.modulesRestored} 個模組` : '',
    report.circuitsRestored ? `還原 ${report.circuitsRestored} 個迴路圖` : '',
    report.moduleId ? '匯入 1 個模組' : '',
  ].filter(Boolean)
  const conflicts = report.conflicts.length ? `。有 ${report.conflicts.length} 項差異保留本機設定：${report.conflicts.join('；')}` : ''
  return { report, text: `${parts.join('、')}${conflicts}` }
}
