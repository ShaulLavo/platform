import { useState, type ReactNode } from 'react'

import {
  createWorkspaceLayoutStore,
  type WorkspaceLayoutStoreApi,
} from '@/features/tiling-surface-manager/engine/surface-state'
import { LayoutStateContext } from '@/features/workbench/providers/layout-context'
import type { WorkspaceLayout } from '@/features/tiling-surface-manager/engine/layout-types'

export function LayoutProvider({
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

  return <LayoutStateContext.Provider value={layoutStore}>{children}</LayoutStateContext.Provider>
}
