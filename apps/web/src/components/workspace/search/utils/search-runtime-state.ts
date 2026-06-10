import { searchResultsSurfaceId } from '@workspace/tiling/utils/layout-ids'
import type { WorkspaceLayout } from '@workspace/tiling/utils/layout-types'

type SearchRuntimeSelection = {
  workspaceLayout: WorkspaceLayout
}

export function searchRuntimeEnabled(state: SearchRuntimeSelection, _rootPath: string) {
  return Boolean(state.workspaceLayout.surfacesById[searchResultsSurfaceId()])
}
