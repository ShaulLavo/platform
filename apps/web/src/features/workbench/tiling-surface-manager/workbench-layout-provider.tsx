import { useState, type ReactNode } from 'react'

import { createWorkspaceLayoutStore, type WorkspaceLayoutStoreApi } from './surface-state'
import { WorkbenchLayoutStateContext } from './workbench-layout-context'
import type { WorkspaceLayout } from './layout-types'

export function WorkbenchLayoutProvider({
  children,
  initialLayout,
  store,
}: {
  readonly children: ReactNode
  readonly initialLayout?: WorkspaceLayout
  readonly store?: WorkspaceLayoutStoreApi
}) {
  const [fallbackStore] = useState(() => createWorkspaceLayoutStore(initialLayout))
  const layoutStore = store ?? fallbackStore

  return (
    <WorkbenchLayoutStateContext.Provider value={layoutStore}>
      {children}
    </WorkbenchLayoutStateContext.Provider>
  )
}
