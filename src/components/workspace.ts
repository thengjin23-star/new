import { useEffect, useState } from 'react'

export type WorkspaceId = 'circuit' | 'module'

const read = (): WorkspaceId => (window.location.hash.startsWith('#/module') ? 'module' : 'circuit')

/** 目前的工作區（以網址 hash 記錄：#/module 為模組組立，其餘為迴路圖） */
export function useWorkspace(): WorkspaceId {
  const [id, setId] = useState(read)
  useEffect(() => {
    const onChange = () => setId(read())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return id
}
