import { useCallback } from 'react'
import type { WorkspaceSearchMatch } from '@workspace/contracts'

import { useEditorCommands } from '@/features/editor/state/editor-commands'
import { openWorkspaceSearchMatch } from '@/features/search/open-search-match'
import { SearchResultsView } from '@/features/search/search-results-view'
import { SearchBufferStatus } from '@/features/search/search-buffer-status'
import { useSearchBufferResults } from '@/features/search/use-search-buffer-results'
import { useWorkspaceSearchReplace } from '@/features/search/use-search-replace'

export function WorkspaceSearchResults({ rootPath }: { rootPath: string }) {
  const { activeResultId, groups, replaceText, replaceVisible, resultsQuery, resultsSearchQuery } =
    useSearchBufferResults(rootPath)
  const replace = useWorkspaceSearchReplace(rootPath, replaceVisible)
  const commands = useEditorCommands()
  const handleOpenMatch = useCallback(
    (match: WorkspaceSearchMatch) => openWorkspaceSearchMatch(match, resultsQuery, commands),
    [commands, resultsQuery],
  )

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
