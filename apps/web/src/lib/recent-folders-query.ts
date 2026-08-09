import { queryOptions } from '@tanstack/react-query'
import { isDirectoryEntry } from '@workspace/contracts'

import { fetchRecentEntries } from '@/lib/file-server'
import type { FsEntry } from '@/lib/file-system-types'

const RECENT_FOLDER_LIMIT = 40
const RECENT_FOLDERS_STALE_TIME_MS = 30_000

const recentFolderKeys = {
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

async function fetchRecentFolders(signal: AbortSignal): Promise<FsEntry[]> {
  const entries = await fetchRecentEntries(RECENT_FOLDER_LIMIT, signal)

  // Recents include files; only a directory can become a workspace root.
  return entries.filter((entry) => isDirectoryEntry(entry))
}
