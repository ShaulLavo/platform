import { errorMessage, fetchFile } from "@/lib/file-server"
import type { FileResult } from "@/lib/file-system-types"
import { idleState, type LoadState } from "@/lib/load-state"
import { fileSystemKeys } from "@/lib/query-keys"
import { useQuery, useQueryClient } from "@tanstack/react-query"

export function useSelectedFile(selectedFilePath: string | null) {
  const queryClient = useQueryClient()
  const query = useQuery({
    enabled: Boolean(selectedFilePath),
    queryFn: ({ signal }) => fetchFile(selectedFilePath ?? "", signal),
    queryKey: fileSystemKeys.file(selectedFilePath ?? ""),
  })
  const fileState = selectedFilePath ? fileLoadState(query) : idleState

  function resetFileLoad() {
    if (!selectedFilePath) return

    queryClient.removeQueries({
      exact: true,
      queryKey: fileSystemKeys.file(selectedFilePath),
    })
  }

  return { fileState, resetFileLoad }
}

function fileLoadState(query: {
  data: FileResult | undefined
  error: Error | null
  isError: boolean
  isPending: boolean
}): LoadState<FileResult> {
  if (query.data) return { status: "ready", data: query.data }
  if (query.isError)
    return { status: "error", message: errorMessage(query.error) }
  if (query.isPending) return { status: "loading" }

  return idleState
}
