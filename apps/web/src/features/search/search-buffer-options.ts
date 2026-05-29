import type { WorkspaceSearchMatchMode } from '@workspace/contracts'

import type { WorkspaceSearchQueryOptions } from '@/features/search/search-buffer-query'

export function searchOptionsForSnapshot(
  snapshot: {
    caseSensitive: boolean
    excludeGlobText: string
    filtersVisible: boolean
    includeGlobText: string
    matchMode: WorkspaceSearchMatchMode
    wholeWord: boolean
  } | null,
): WorkspaceSearchQueryOptions {
  return {
    caseSensitive: snapshot?.caseSensitive ?? false,
    excludeGlobText: snapshot?.excludeGlobText ?? '',
    filtersVisible: snapshot?.filtersVisible ?? false,
    includeGlobText: snapshot?.includeGlobText ?? '',
    matchMode: snapshot?.matchMode ?? 'literal',
    wholeWord: snapshot?.wholeWord ?? false,
  }
}
