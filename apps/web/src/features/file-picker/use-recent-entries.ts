import type { FsEntry, ServerInfo } from '@/lib/file-system-types'
import { filePickerKeys } from '@/lib/query-keys'
import { useQuery } from '@tanstack/react-query'

import { fetchRecentEntries } from '@/features/file-picker/data-helpers'
import { entriesLoadState } from '@/features/file-picker/load-state'

export function useRecentEntries({
  open,
  reloadVersion,
  serverInfo,
}: {
  open: boolean
  reloadVersion: number
  serverInfo: ServerInfo | null
}) {
  const enabled = open && Boolean(serverInfo)
  const query = useQuery<FsEntry[]>({
    enabled,
    queryFn: ({ signal }) => fetchRecentEntries(signal),
    queryKey: filePickerKeys.recentList(reloadVersion),
  })

  return entriesLoadState(query, enabled)
}
