import type { ServerInfo } from '@/lib/file-system-types'
import { filePickerKeys } from '@/lib/query-keys'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { loadDirectoryData, type DirectoryLoadData } from './data-helpers'
import { directoryLoadState } from './load-state'
import type { FilePickerMode } from './model'

export function useDirectoryLoad({
  currentPath,
  effectiveQuery,
  mode,
  open,
  reloadVersion,
  serverInfo,
}: {
  currentPath: string
  effectiveQuery: string
  mode: FilePickerMode
  open: boolean
  reloadVersion: number
  serverInfo: ServerInfo | null
}) {
  const queryClient = useQueryClient()
  const enabled = open && Boolean(serverInfo)
  const queryKey = filePickerKeys.directory(currentPath, effectiveQuery, mode, reloadVersion)
  const query = useQuery<DirectoryLoadData>({
    enabled,
    placeholderData: (previousData) => previousData,
    queryFn: ({ signal }) =>
      loadDirectoryData(currentPath, effectiveQuery, mode, signal, (entries) => {
        if (signal.aborted) return

        queryClient.setQueryData(queryKey, (current: DirectoryLoadData | undefined) => ({
          currentEntry: current?.currentEntry ?? null,
          entries,
        }))
      }),
    queryKey,
  })

  return {
    currentEntry: query.isPlaceholderData ? null : (query.data?.currentEntry ?? null),
    loadState: directoryLoadState(query, enabled),
  }
}
