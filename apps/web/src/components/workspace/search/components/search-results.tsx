import { useCallback, useEffect, useState } from 'react'
import type { WorkspaceSearchMatch } from '@workspace/contracts'
import type { EditorKeymapLayer } from '@singapor/core'

import { useEditorCommands } from '@/features/editor/state/editor-commands'
import { openWorkspaceSearchMatch } from '@/features/search/open-search-match'
import {
  layoutWithSearchPreview,
  searchPreviewSurfaceForResult,
} from '@/features/search/search-preview-layout'
import { SearchResultsView } from '@/features/search/search-results-view'
import { SearchResultEditorSurface } from '@/features/search/search-result-editor-surface'
import { SearchBufferStatus } from '@/features/search/search-buffer-status'
import { useSearchBufferState } from '@/features/search/search-buffer-state'
import { useSearchBufferResults } from '@/features/search/use-search-buffer-results'
import { useWorkspaceSearchReplace } from '@/features/search/use-search-replace'
import { useLayoutStoreApi } from '@/features/workbench/hooks/use-layout-store-api'
import type { SurfaceId } from '@workspace/tiling/utils/layout-types'
import type { SearchResultId } from '@/features/search/search-result-items'
import type { SearchResultOpenTarget } from '@/features/search/search-result-view-model'

export function SearchResults({
  compact = true,
  editorKeymapLayers,
  ownerSurfaceId,
  rootPath,
}: {
  readonly compact?: boolean
  readonly editorKeymapLayers: readonly EditorKeymapLayer[]
  readonly ownerSurfaceId?: SurfaceId
  readonly rootPath: string
}) {
  const { activeResultId, groups, replaceText, replaceVisible, resultsQuery, resultsSearchQuery } =
    useSearchBufferResults(rootPath)
  const replace = useWorkspaceSearchReplace(rootPath, replaceVisible)
  const commands = useEditorCommands()
  const layoutStore = useLayoutStoreApi()
  const selectResult = useSearchBufferState((state) => state.selectResult)
  const toggleGroup = useSearchBufferState((state) => state.toggleGroup)
  const [previewResultId, setPreviewResultId] = useState<SearchResultId | null>(null)
  const handleOpenMatch = useCallback(
    (match: WorkspaceSearchMatch) => openWorkspaceSearchMatch(match, resultsQuery, commands),
    [commands, resultsQuery],
  )
  const handleOpenTarget = useCallback(
    (target: SearchResultOpenTarget) => {
      if (!target.match) {
        commands.openFileSurface(target.path)
        return
      }

      openWorkspaceSearchMatch(target.match, resultsQuery, commands)
    },
    [commands, resultsQuery],
  )

  useEffect(() => {
    if (!compact) return

    const preview = searchPreviewSurfaceForResult({
      activeResultId: previewResultId,
      groups,
      ownerSurfaceId,
    })
    const currentLayout = layoutStore.getState().layout
    const nextLayout = layoutWithSearchPreview(currentLayout, preview)
    if (nextLayout === currentLayout) return

    layoutStore.getState().replaceLayout(nextLayout)
  }, [compact, groups, layoutStore, ownerSurfaceId, previewResultId])

  if (groups.length === 0) {
    return <SearchBufferStatus rootPath={rootPath} />
  }

  if (!compact) {
    return (
      <SearchResultEditorSurface
        activeResultId={activeResultId}
        canReplace={replaceVisible ? replace.canReplace : false}
        displayedResultsQuery={resultsSearchQuery?.query ?? null}
        groups={groups}
        keymapLayers={editorKeymapLayers}
        replaceVisible={Boolean(replaceVisible)}
        resultsQuery={resultsQuery}
        onOpenTarget={handleOpenTarget}
        onReplaceGroup={replace.replaceGroup}
        onReplaceMatch={replace.replaceMatch}
        onSelectResult={selectResult}
        onToggleGroup={toggleGroup}
      />
    )
  }

  return (
    <SearchResultsView
      activeResultId={activeResultId}
      canReplace={replaceVisible ? replace.canReplace : false}
      compact={compact}
      error={null}
      groups={groups}
      query={resultsQuery}
      replaceText={replaceText}
      replaceVisible={replaceVisible}
      resultsSearchQuery={resultsSearchQuery}
      status='ready'
      onOpenMatch={handleOpenMatch}
      onPreviewResultSelect={setPreviewResultId}
      onReplaceGroup={replace.replaceGroup}
      onReplaceMatch={replace.replaceMatch}
    />
  )
}
