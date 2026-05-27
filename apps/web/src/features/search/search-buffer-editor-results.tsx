import { useCallback } from 'react'
import type { EditorKeymapLayer } from '@editor/core'

import { useEditorCommands } from '@/features/editor/state/editor-commands'
import { openWorkspaceSearchMatch } from '@/features/search/open-search-match'
import { SearchBufferStatus } from '@/features/search/search-buffer-status'
import { SearchResultEditorSurface } from '@/features/search/search-result-editor-surface'
import type { SearchResultOpenTarget } from '@/features/search/search-result-view-model'
import { useSearchBufferState } from '@/features/search/search-buffer-state'
import { useSearchBufferResults } from '@/features/search/use-search-buffer-results'
import { useWorkspaceSearchReplace } from '@/features/search/use-search-replace'

export function SearchBufferEditorResults({
  editorKeymapLayers,
  rootPath,
}: {
  editorKeymapLayers: readonly EditorKeymapLayer[]
  rootPath: string
}) {
  const { activeResultId, groups, replaceVisible, resultsQuery, resultsSearchQuery } =
    useSearchBufferResults(rootPath)
  const selectResult = useSearchBufferState((state) => state.selectResult)
  const toggleGroup = useSearchBufferState((state) => state.toggleGroup)
  const replace = useWorkspaceSearchReplace(rootPath, replaceVisible)
  const commands = useEditorCommands()
  const resultCanReplace = replaceVisible ? replace.canReplace : false
  const handleOpenTarget = useCallback(
    (target: SearchResultOpenTarget) => {
      if (!target.match) {
        commands.selectFile(target.path)
        return
      }

      openWorkspaceSearchMatch(target.match, resultsQuery, commands)
    },
    [commands, resultsQuery],
  )

  if (groups.length === 0) {
    return <SearchBufferStatus rootPath={rootPath} />
  }

  return (
    <SearchResultEditorSurface
      activeResultId={activeResultId}
      canReplace={resultCanReplace}
      deferredPluginMode='immediate'
      displayedResultsQuery={resultsSearchQuery?.query ?? null}
      groups={groups}
      keymapLayers={editorKeymapLayers}
      replaceVisible={replaceVisible}
      resultsQuery={resultsQuery}
      onOpenTarget={handleOpenTarget}
      onReplaceGroup={replace.replaceGroup}
      onReplaceMatch={replace.replaceMatch}
      onSelectResult={selectResult}
      onToggleGroup={toggleGroup}
    />
  )
}
