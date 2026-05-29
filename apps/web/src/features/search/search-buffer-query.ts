import type { WorkspaceSearchMatchMode, WorkspaceSearchQuery } from '@workspace/contracts'
import { workspaceSearchGlobPatterns } from '@workspace/contracts'

const SEARCH_LIMIT = 200

export type WorkspaceSearchQueryOptions = {
  caseSensitive: boolean
  excludeGlobText: string
  filtersVisible: boolean
  includeGlobText: string
  matchMode: WorkspaceSearchMatchMode
  wholeWord: boolean
}

export function workspaceSearchQuery(
  rootPath: string,
  query: string,
  options: Partial<WorkspaceSearchQueryOptions> = {},
): WorkspaceSearchQuery {
  const filtersVisible = options.filtersVisible === true

  return {
    caseSensitive: options.caseSensitive === true,
    excludeGlobs: filtersVisible ? workspaceSearchGlobPatterns(options.excludeGlobText) : [],
    entryType: 'file',
    includeContent: true,
    includeGlobs: filtersVisible ? workspaceSearchGlobPatterns(options.includeGlobText) : [],
    includeNames: false,
    limit: SEARCH_LIMIT,
    matchMode: options.matchMode ?? 'literal',
    path: rootPath,
    query,
    wholeWord: options.wholeWord === true,
  }
}
