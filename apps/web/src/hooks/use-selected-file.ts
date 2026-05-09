import { errorMessage, fetchFile } from "@/lib/file-server"
import type { FileResult } from "@/lib/file-system-types"
import { parseDiffDocumentId } from "@/features/git/diff-document"
import { idleState, type LoadState } from "@/lib/load-state"
import { fileSystemKeys } from "@/lib/query-keys"
import { useQuery, useQueryClient } from "@tanstack/react-query"

export function useSelectedFile(selectedFilePath: string | null) {
  const queryClient = useQueryClient()
  const filePath = filePathForRequest(selectedFilePath)
  const query = useQuery<FileResult>({
    enabled: Boolean(filePath),
    placeholderData: (previousFile) => previousFile,
    queryFn: ({ signal }) => fetchFile(filePath ?? "", signal),
    queryKey: fileSystemKeys.file(filePath ?? ""),
  })
  const fileState = filePath ? fileLoadState(query, filePath) : idleState

  function resetFileLoad() {
    if (!filePath) return

    queryClient.removeQueries({
      exact: true,
      queryKey: fileSystemKeys.file(filePath),
    })
  }

  return { fileState, resetFileLoad }
}

function filePathForRequest(selectedFilePath: string | null) {
  if (!selectedFilePath) return null
  if (parseDiffDocumentId(selectedFilePath)) return null

  return selectedFilePath
}

export function fileLoadState(
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
  if (query.isError)
    return { status: "error", message: errorMessage(query.error) }
  if (query.data) return idleState
  if (query.isPending) return idleState

  return idleState
}
