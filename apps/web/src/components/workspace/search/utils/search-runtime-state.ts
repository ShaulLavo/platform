import { searchResultsSurfaceId } from '@/features/tiling-surface-manager/engine/layout-ids'
import type { WorkspaceLayout } from '@/features/tiling-surface-manager/engine/layout-types'

type SearchRuntimeSelection = {
  workspaceLayout: WorkspaceLayout
}

export function searchRuntimeEnabled(state: SearchRuntimeSelection, _rootPath: string) {
  return Boolean(state.workspaceLayout.surfacesById[searchResultsSurfaceId()])
}
