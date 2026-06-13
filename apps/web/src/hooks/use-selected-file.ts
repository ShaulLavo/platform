import { errorMessage } from '@/lib/file-server'
import type { FileResult } from '@/lib/file-system-types'
import { fileBackedDocumentPath } from '@/features/editor/utils/file-backed-document'
import { fileSnapshotQueryOptions } from '@/lib/file-snapshot-query-cache'
import { idleState, type LoadState } from '@/lib/load-state'
import { fileSystemKeys } from '@/lib/query-keys'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'

export function useSelectedFile(selectedFilePath: string | null) {
  const queryClient = useQueryClient()
  const filePath = fileBackedDocumentPath(selectedFilePath)
  const query = useQuery<FileResult>({
    ...fileSnapshotQueryOptions(filePath ?? ''),
    enabled: Boolean(filePath),
    placeholderData: (previousFile) => previousFile,
  })
  const { data, error, isError, isPending } = query
  const fileState = useMemo(
    () => (filePath ? fileLoadState({ data, error, isError, isPending }, filePath) : idleState),
    [data, error, filePath, isError, isPending],
  )

  function resetFileLoad() {
    if (!filePath) return

    queryClient.removeQueries({
      exact: true,
      queryKey: fileSystemKeys.fileSnapshot(filePath),
    })
  }

  return { fileState, resetFileLoad }
}

export function fileLoadState(
  query: {
    data: FileResult | undefined
    error: Error | null
    isError: boolean
    isPending: boolean
  },
  selectedFilePath: string,
): LoadState<FileResult> {
  if (query.data?.path === selectedFilePath) {
    return { status: 'ready', data: query.data }
  }
  if (query.isError) return { status: 'error', message: errorMessage(query.error) }
  if (query.data) return idleState
  if (query.isPending) return idleState

  return idleState
}
