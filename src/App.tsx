import { lazy, Suspense, useEffect } from 'react'
import { useLibraryStore } from './catalog/library'
import { BackupReminder } from './components/BackupReminder'
import { CircuitWorkspace } from './components/CircuitWorkspace'
import { SettingsDialog } from './components/SettingsDialog'
import { useWorkspace } from './components/workspace'
import { useSettingsStore } from './settings/settings'

// 3D 模組組立較大（three.js 等），切換到該分頁時才載入
const ModuleWorkspace = lazy(() => import('./module-ui/ModuleWorkspace'))

export default function App() {
  const workspace = useWorkspace()

  // 產品庫與設定由兩個分頁共用：一開啟就載入，迴路圖不必先開 3D 分頁也能使用產品
  useEffect(() => {
    void useLibraryStore.getState().load()
    void useSettingsStore.getState().load()
  }, [])

  return (
    <div className="flex h-full flex-col">
      <BackupReminder />
      <div className="min-h-0 flex-1">
        {workspace === 'module' ? (
          <Suspense fallback={<div className="flex h-full items-center justify-center text-slate-500">載入 3D 模組組立…</div>}>
            <ModuleWorkspace />
          </Suspense>
        ) : (
          <CircuitWorkspace />
        )}
      </div>
      <SettingsDialog />
    </div>
  )
}
