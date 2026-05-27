import {
  createWorkspaceFocusStore,
  WorkspaceFocusContext,
} from '@/components/workspace/workspace-focus-state'
import { useState, type ReactNode } from 'react'

export function WorkspaceFocusProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createWorkspaceFocusStore)

  return <WorkspaceFocusContext value={store}>{children}</WorkspaceFocusContext>
}
