import {
  createWorkspaceFocusStore,
  WorkspaceFocusContext,
} from '@/components/workspace/workspace-focus-state'
import { useEffect, useState, type ReactNode } from 'react'

export function WorkspaceFocusProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createWorkspaceFocusStore)

  useEffect(() => {
    const clearWindowFocus = () => {
      store.getState().clearFocusArea()
    }

    window.addEventListener('blur', clearWindowFocus)
    return () => window.removeEventListener('blur', clearWindowFocus)
  }, [store])

  return <WorkspaceFocusContext.Provider value={store}>{children}</WorkspaceFocusContext.Provider>
}
