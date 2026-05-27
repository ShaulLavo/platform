import { parseSearchBufferDocumentId } from '@/features/search/search-buffer-document'
import type { WorkspacePanelTab } from '@/lib/workspace-cache'

type WorkspaceSearchRuntimeSelection = {
  selectedFilePath: string | null
  sidebarVisible: boolean
  workspacePanelTab: WorkspacePanelTab
}

export function workspaceSearchRuntimeEnabled(
  state: WorkspaceSearchRuntimeSelection,
  rootPath: string,
) {
  if (state.sidebarVisible && state.workspacePanelTab === 'search') return true

  const searchBuffer = parseSearchBufferDocumentId(state.selectedFilePath)

  return searchBuffer?.rootPath === rootPath
}
