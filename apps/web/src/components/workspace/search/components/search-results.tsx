import { useCallback, useEffect } from 'react'
import type { WorkspaceSearchMatch } from '@workspace/contracts'

import { useEditorCommands } from '@/features/editor/state/editor-commands'
import { openWorkspaceSearchMatch } from '@/features/search/open-search-match'
import {
  layoutWithSearchPreview,
  searchPreviewSurfaceForResult,
} from '@/features/search/search-preview-layout'
import { SearchResultsView } from '@/features/search/search-results-view'
import { SearchBufferStatus } from '@/features/search/search-buffer-status'
import { useSearchBufferResults } from '@/features/search/use-search-buffer-results'
import { useWorkspaceSearchReplace } from '@/features/search/use-search-replace'
import { useLayoutStoreApi } from '@/features/workbench/hooks/use-layout-store-api'

export function SearchResults({ rootPath }: { rootPath: string }) {
  const { activeResultId, groups, replaceText, replaceVisible, resultsQuery, resultsSearchQuery } =
    useSearchBufferResults(rootPath)
  const replace = useWorkspaceSearchReplace(rootPath, replaceVisible)
  const commands = useEditorCommands()
  const layoutStore = useLayoutStoreApi()
  const handleOpenMatch = useCallback(
    (match: WorkspaceSearchMatch) => openWorkspaceSearchMatch(match, resultsQuery, commands),
    [commands, resultsQuery],
  )

  useEffect(() => {
    const preview = searchPreviewSurfaceForResult({ activeResultId, groups })
    const currentLayout = layoutStore.getState().layout
    const nextLayout = layoutWithSearchPreview(currentLayout, preview)
    if (nextLayout === currentLayout) return

    layoutStore.getState().replaceLayout(nextLayout)
  }, [activeResultId, groups, layoutStore])

  if (groups.length === 0) {
    return <SearchBufferStatus rootPath={rootPath} />
  }

  return (
    <SearchResultsView
      activeResultId={activeResultId}
      canReplace={replaceVisible ? replace.canReplace : false}
      compact
      error={null}
      groups={groups}
      query={resultsQuery}
      replaceText={replaceText}
      replaceVisible={replaceVisible}
      resultsSearchQuery={resultsSearchQuery}
      status='ready'
      onOpenMatch={handleOpenMatch}
      onReplaceGroup={replace.replaceGroup}
      onReplaceMatch={replace.replaceMatch}
    />
  )
}
