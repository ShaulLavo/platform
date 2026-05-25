import type { Query, QueryClient, QueryKey } from '@tanstack/react-query'

import type { FileResult } from '@/lib/file-system-types'
import { fileSystemKeys } from '@/lib/query-keys'

export const FILE_CONTENT_QUERY_GC_TIME_MS = 2 * 60 * 1000
export const FILE_CONTENT_QUERY_CACHE_LIMIT = 64

export function fileContentQueryOptions(path: string) {
  return {
    gcTime: FILE_CONTENT_QUERY_GC_TIME_MS,
    queryKey: fileSystemKeys.file(path),
  } as const
}

export function setFileContentQueryData(
  queryClient: QueryClient,
  file: FileResult,
  options: { readonly updatedAt?: number } = {},
) {
  const queryKey = fileSystemKeys.file(file.path)
  const query = queryClient.getQueryCache().build<FileResult, unknown, FileResult, typeof queryKey>(
    queryClient,
    queryClient.defaultQueryOptions({
      gcTime: FILE_CONTENT_QUERY_GC_TIME_MS,
      queryKey,
    }),
  )
  query.setData(file, { manual: true, updatedAt: options.updatedAt })
  pruneFileContentQueryCache(queryClient)
}

export function installFileContentQueryCachePolicy(queryClient: QueryClient) {
  let pruneQueued = false

  return queryClient.getQueryCache().subscribe((event) => {
    if (!isFileContentQueryKey(event.query.queryKey)) return

    if (pruneQueued) return

    pruneQueued = true
    queueMicrotask(() => {
      pruneQueued = false
      pruneFileContentQueryCache(queryClient)
    })
  })
}

export function pruneFileContentQueryCache(
  queryClient: QueryClient,
  limit = FILE_CONTENT_QUERY_CACHE_LIMIT,
) {
  const queries = fileContentQueries(queryClient)
  const overflow = queries.length - limit
  if (overflow <= 0) return 0

  const candidates = queries
    .filter((query) => !query.isActive())
    .toSorted(compareFileContentQueriesForEviction)
  let removed = 0
  for (const query of candidates) {
    if (removed >= overflow) break

    queryClient.removeQueries({ exact: true, queryKey: query.queryKey })
    removed += 1
  }

  return removed
}

function fileContentQueries(queryClient: QueryClient) {
  return queryClient
    .getQueryCache()
    .findAll({ queryKey: fileSystemKeys.files() })
    .filter(isCachedFileContentQuery)
}

function isCachedFileContentQuery(
  query: Query<unknown, unknown, unknown, QueryKey>,
): query is Query<FileResult, unknown, FileResult, ReturnType<typeof fileSystemKeys.file>> {
  if (!isFileContentQueryKey(query.queryKey)) return false

  return query.state.data !== undefined
}

function compareFileContentQueriesForEviction(
  left: Query<FileResult, unknown, FileResult, ReturnType<typeof fileSystemKeys.file>>,
  right: Query<FileResult, unknown, FileResult, ReturnType<typeof fileSystemKeys.file>>,
) {
  return left.state.dataUpdatedAt - right.state.dataUpdatedAt
}

function isFileContentQueryKey(
  queryKey: QueryKey,
): queryKey is ReturnType<typeof fileSystemKeys.file> {
  return (
    queryKey.length === 3 &&
    queryKey[0] === fileSystemKeys.all[0] &&
    queryKey[1] === fileSystemKeys.files()[1] &&
    typeof queryKey[2] === 'string'
  )
}
