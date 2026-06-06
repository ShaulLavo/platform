import { parseSearchBufferDocumentId } from '@/features/search/search-buffer-document'
import type { WorkspacePanelTab } from '@/lib/workspace-cache'

type SearchRuntimeSelection = {
  selectedFilePath: string | null
  sidebarVisible: boolean
  workspacePanelTab: WorkspacePanelTab
}

export function searchRuntimeEnabled(state: SearchRuntimeSelection, rootPath: string) {
  if (state.sidebarVisible && state.workspacePanelTab === 'search') return true

  const searchBuffer = parseSearchBufferDocumentId(state.selectedFilePath)

  return searchBuffer?.rootPath === rootPath
}
