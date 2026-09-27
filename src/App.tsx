import { lazy, Suspense, useEffect } from 'react'
import { useLibraryStore } from './catalog/library'
import { CircuitWorkspace } from './components/CircuitWorkspace'
import { useWorkspace } from './components/workspace'

// 3D 模組組立較大（three.js 等），切換到該分頁時才載入
const ModuleWorkspace = lazy(() => import('./module-ui/ModuleWorkspace'))

export default function App() {
  const workspace = useWorkspace()

  // 產品庫由兩個分頁共用：一開啟就載入，迴路圖不必先開 3D 分頁也能使用產品
  useEffect(() => {
    void useLibraryStore.getState().load()
  }, [])

  if (workspace === 'module') {
    return (
      <Suspense fallback={<div className="flex h-full items-center justify-center text-slate-500">載入 3D 模組組立…</div>}>
        <ModuleWorkspace />
      </Suspense>
    )
  }
  return <CircuitWorkspace />
}
