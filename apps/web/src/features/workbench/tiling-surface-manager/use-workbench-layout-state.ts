import { useStore } from 'zustand'

import { useWorkbenchLayoutStoreApi } from './use-workbench-layout-store-api'
import type { WorkspaceLayoutStore } from './surface-state'

export function useWorkbenchLayoutState<T>(selector: (state: WorkspaceLayoutStore) => T): T {
  return useStore(useWorkbenchLayoutStoreApi(), selector)
}
