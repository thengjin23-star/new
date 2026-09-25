import { lazy, Suspense } from 'react'
import { CircuitWorkspace } from './components/CircuitWorkspace'
import { useWorkspace } from './components/workspace'

// 3D 模組組立較大（three.js 等），切換到該分頁時才載入
const ModuleWorkspace = lazy(() => import('./module-ui/ModuleWorkspace'))

export default function App() {
  const workspace = useWorkspace()
  if (workspace === 'module') {
    return (
      <Suspense fallback={<div className="flex h-full items-center justify-center text-slate-500">載入 3D 模組組立…</div>}>
        <ModuleWorkspace />
      </Suspense>
    )
  }
  return <CircuitWorkspace />
}
