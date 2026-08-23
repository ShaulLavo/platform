import { queryOptions } from '@tanstack/react-query'

import { fetchRecentEntries } from '@/lib/file-server'

const RECENT_FOLDER_LIMIT = 40
const RECENT_FOLDERS_STALE_TIME_MS = 30_000

export const recentFolderKeys = {
  all: ['recent-folders'] as const,
  list: (limit: number) => [...recentFolderKeys.all, limit] as const,
}

export function recentFoldersQueryOptions({ enabled }: { enabled: boolean }) {
  return queryOptions({
    enabled,
    queryFn: ({ signal }) => fetchRecentFolders(signal),
    queryKey: recentFolderKeys.list(RECENT_FOLDER_LIMIT),
    staleTime: RECENT_FOLDERS_STALE_TIME_MS,
  })
}

function fetchRecentFolders(signal: AbortSignal) {
  return fetchRecentEntries(
    { limit: RECENT_FOLDER_LIMIT, mode: 'folder', showHidden: true },
    signal,
  )
}
