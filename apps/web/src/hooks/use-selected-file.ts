import { errorMessage, fetchFile } from "@/lib/file-server"
import type { FileResult } from "@/lib/file-system-types"
import { idleState, type LoadState } from "@/lib/load-state"
import { fileSystemKeys } from "@/lib/query-keys"
import { useQuery, useQueryClient } from "@tanstack/react-query"

export function useSelectedFile(selectedFilePath: string | null) {
  const queryClient = useQueryClient()
  const query = useQuery<FileResult>({
    enabled: Boolean(selectedFilePath),
    placeholderData: (previousFile) => previousFile,
    queryFn: ({ signal }) => fetchFile(selectedFilePath ?? "", signal),
    queryKey: fileSystemKeys.file(selectedFilePath ?? ""),
  })
  const fileState = selectedFilePath
    ? fileLoadState(query, selectedFilePath)
    : idleState

  function resetFileLoad() {
    if (!selectedFilePath) return

    queryClient.removeQueries({
      exact: true,
      queryKey: fileSystemKeys.file(selectedFilePath),
    })
  }

  return { fileState, resetFileLoad }
}

function fileLoadState(
  query: {
    data: FileResult | undefined
    error: Error | null
    isError: boolean
    isPending: boolean
  },
  selectedFilePath: string
): LoadState<FileResult> {
  if (query.data?.path === selectedFilePath) {
    return { status: "ready", data: query.data }
  }
  if (query.data) return { status: "ready", data: query.data }
  if (query.isError)
    return { status: "error", message: errorMessage(query.error) }
  if (query.isPending) return { status: "loading" }

  return idleState
}
