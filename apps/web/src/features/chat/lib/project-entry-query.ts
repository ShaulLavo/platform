import type { EntryTypeFilter, WorkspaceSearchMatch } from '@workspace/contracts'
import { queryOptions } from '@tanstack/react-query'

import { client } from '@/lib/client'
import { createRpcError } from '@/lib/structured-errors'

const PROJECT_ENTRY_QUERY_LIMIT = 40
const PROJECT_ENTRY_QUERY_STALE_TIME_MS = 15_000
const EMPTY_PROJECT_ENTRIES: ProjectEntrySearchResult = {
  entries: [],
  truncated: false,
}

export type ProjectEntrySearchResult = {
  entries: ProjectEntrySearchItem[]
  truncated: boolean
}

export type ProjectEntrySearchItem = {
  id: string
  label: string
  path: string
  type: EntryTypeFilter
}

export const projectEntryQueryKeys = {
  all: ['chat-project-entries'] as const,
  search: (rootPath: string, query: string, limit: number) =>
    [...projectEntryQueryKeys.all, rootPath, query, limit] as const,
}

export function projectEntrySearchQueryOptions(input: {
  enabled?: boolean
  limit?: number
  query: string
  rootPath: string
}) {
  const limit = input.limit ?? PROJECT_ENTRY_QUERY_LIMIT

  return queryOptions({
    enabled: (input.enabled ?? true) && input.query.trim().length > 0,
    placeholderData: (previous) => previous ?? EMPTY_PROJECT_ENTRIES,
    queryFn: ({ signal }) => searchProjectEntries({ ...input, limit, signal }),
    queryKey: projectEntryQueryKeys.search(input.rootPath, input.query, limit),
    staleTime: PROJECT_ENTRY_QUERY_STALE_TIME_MS,
  })
}

async function searchProjectEntries({
  limit,
  query,
  rootPath,
  signal,
}: {
  limit: number
  query: string
  rootPath: string
  signal: AbortSignal
}): Promise<ProjectEntrySearchResult> {
  const response = await client.fs.find.get({
    fetch: { signal },
    query: {
      caseSensitive: false,
      includeContent: false,
      includeNames: true,
      limit,
      matchMode: 'fuzzy',
      path: rootPath,
      query,
      wholeWord: false,
    },
  })

  if (response.error) throw createRpcError(response.error)

  const data = response.data as { matches?: WorkspaceSearchMatch[]; truncated?: boolean } | null
  return {
    entries: projectEntryItems(data?.matches ?? []),
    truncated: data?.truncated ?? false,
  }
}

function projectEntryItems(matches: readonly WorkspaceSearchMatch[]) {
  return matches.map((match) => ({
    id: `path:${match.path}`,
    label: pathBasename(match.path),
    path: match.path,
    type: match.type,
  }))
}

function pathBasename(input: string) {
  const parts = input.split('/').filter(Boolean)

  return parts.at(-1) ?? input
}
