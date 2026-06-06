import { parseSearchBufferDocumentId } from '@/features/search/search-buffer-document'
import { searchResultsSurfaceId } from '@/features/tiling-surface-manager/engine/layout-ids'
import { findWindowIdContainingSurface } from '@/features/tiling-surface-manager/engine/layout-normalize'
import type { WorkspaceLayout } from '@/features/tiling-surface-manager/engine/layout-types'

type SearchRuntimeSelection = {
  selectedFilePath: string | null
  workspaceLayout: WorkspaceLayout
}

export function searchRuntimeEnabled(state: SearchRuntimeSelection, rootPath: string) {
  if (findWindowIdContainingSurface(state.workspaceLayout, searchResultsSurfaceId())) return true

  const searchBuffer = parseSearchBufferDocumentId(state.selectedFilePath)

  return searchBuffer?.rootPath === rootPath
}
