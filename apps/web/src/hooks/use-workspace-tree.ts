import type { PickedFsEntry } from "@/components/file-picker-dialog"
import { errorMessage, fetchTree } from "@/lib/file-server"
import type { TreeEntry } from "@/lib/file-system-types"
import { idleState, type LoadState } from "@/lib/load-state"
import { canonicalTreePath } from "@/lib/path-formatters"
import { fileSystemKeys } from "@/lib/query-keys"
import {
  markDirectoryError,
  markDirectoryLoading,
  mergeDirectoryLoad,
  shouldLoadDirectory,
  treeModel,
  type TreeModel,
} from "@/lib/tree-model"
import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query"

export function useWorkspaceTree(rootFolder: PickedFsEntry | null) {
  const queryClient = useQueryClient()
  const rootPath = rootFolder?.path ?? ""
  const rootTreeKey = fileSystemKeys.tree(rootPath)
  const query = useQuery({
    enabled: Boolean(rootFolder),
    queryFn: async ({ signal }) => {
      const result = await fetchTree(rootPath, signal)
      return treeModel(result, rootPath)
    },
    queryKey: rootTreeKey,
  })
  const treeState = rootFolder ? treeLoadState(query) : idleState

  function resetTreeLoad() {
    queryClient.removeQueries({ queryKey: fileSystemKeys.trees() })
  }

  function retryTreeLoad() {
    if (!rootFolder) return

    void queryClient.invalidateQueries({ queryKey: rootTreeKey })
  }

  function loadTreeDirectory(entry: TreeEntry, treePath: string) {
    if (!rootFolder) return
    if (treeState.status !== "ready") return
    if (entry.type !== "directory") return
    if (!shouldLoadDirectory(treeState.data, treePath)) return

    const canonicalPath = canonicalTreePath(treePath)
    const directoryKey = fileSystemKeys.treeDirectory(
      rootFolder.path,
      canonicalPath,
      entry.path
    )

    queryClient.setQueryData(rootTreeKey, (model: TreeModel | undefined) => {
      if (!model) return model

      return markDirectoryLoading(model, canonicalPath)
    })

    void queryClient
      .fetchQuery({
        queryFn: ({ signal }) => fetchTree(entry.path, signal),
        queryKey: directoryKey,
      })
      .then((result) =>
        queryClient.setQueryData(rootTreeKey, (model: TreeModel | undefined) => {
          if (!model) return model

          return mergeDirectoryLoad(
            model,
            rootFolder.path,
            result,
            canonicalPath
          )
        })
      )
      .catch((error: unknown) => {
        queryClient.setQueryData(rootTreeKey, (model: TreeModel | undefined) => {
          if (!model) return model

          return markDirectoryError(model, canonicalPath, errorMessage(error))
        })
      })
  }

  return {
    loadTreeDirectory,
    resetTreeLoad,
    retryTreeLoad,
    treeState,
  }
}

function treeLoadState(query: UseQueryResult<TreeModel>): LoadState<TreeModel> {
  if (query.data) return { status: "ready", data: query.data }
  if (query.isError) return { status: "error", message: errorMessage(query.error) }
  if (query.isPending) return { status: "loading" }

  return idleState
}
