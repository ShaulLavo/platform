import { useStore } from 'zustand'

import { useLayoutStoreApi } from '@/features/workbench/hooks/use-layout-store-api'
import type { WorkspaceLayoutStore } from '@/features/tiling-surface-manager/engine/surface-state'

export function useLayoutState<T>(selector: (state: WorkspaceLayoutStore) => T): T {
  return useStore(useLayoutStoreApi(), selector)
}
