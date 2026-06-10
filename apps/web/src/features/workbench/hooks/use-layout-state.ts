import { useStoreWithEqualityFn } from 'zustand/traditional'

import { useLayoutStoreApi } from '@/features/workbench/hooks/use-layout-store-api'
import type { WorkspaceLayoutStore } from '@/features/tiling-surface-manager/engine/surface-state'

export function useLayoutState<T>(
  selector: (state: WorkspaceLayoutStore) => T,
  equalityFn?: (left: T, right: T) => boolean,
): T {
  return useStoreWithEqualityFn(useLayoutStoreApi(), selector, equalityFn)
}
