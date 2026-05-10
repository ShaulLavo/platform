import type { PickedFsEntry } from "@/lib/file-system-types"
import { errorMessage, fetchTree } from "@/lib/file-server"
import type { TreeEntry, TreeResult } from "@/lib/file-system-types"
import { isDirectoryEntry } from "@/lib/file-system-types"
import { idleState, type LoadState } from "@/lib/load-state"
import { canonicalTreePath, toTreePath } from "@/lib/path-formatters"
import { fileSystemKeys } from "@/lib/query-keys"
import {
  markDirectoryError,
  markDirectoryLoading,
  mergeDirectoryLoad,
  shouldLoadDirectory,
  treeModelWithDirectoryLoads,
  type TreeModel,
} from "@/lib/tree-model"
import {
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query"

export function useWorkspaceTree(
  rootFolder: PickedFsEntry | null,
  selectedFilePath: string | null
) {
  const queryClient = useQueryClient()
  const rootPath = rootFolder?.path ?? ""
  const rootTreeKey = fileSystemKeys.tree(rootPath)
  const query = useQuery({
    enabled: Boolean(rootFolder),
    queryFn: async ({ signal }) => {
      const result = await fetchInitialTree(rootPath, selectedFilePath, signal)
      return treeModelWithDirectoryLoads(
        result.root,
        rootPath,
        result.directories
      )
    },
    queryKey: rootTreeKey,
  })
  const treeState = rootFolder ? treeLoadState(query) : idleState

  function resetTreeLoad() {
    queryClient.removeQueries({ queryKey: fileSystemKeys.trees() })
  }

  function loadTreeDirectory(entry: TreeEntry, treePath: string) {
    if (!rootFolder) return
    if (treeState.status !== "ready") return
    if (!isDirectoryEntry(entry)) return
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
        queryClient.setQueryData(
          rootTreeKey,
          (model: TreeModel | undefined) => {
            if (!model) return model

            return mergeDirectoryLoad(
              model,
              rootFolder.path,
              result,
              canonicalPath
            )
          }
        )
      )
      .catch((error: unknown) => {
        queryClient.setQueryData(
          rootTreeKey,
          (model: TreeModel | undefined) => {
            if (!model) return model

            return markDirectoryError(model, canonicalPath, errorMessage(error))
          }
        )
      })
  }

  return {
    loadTreeDirectory,
    resetTreeLoad,
    treeState,
  }
}

export function selectedFileAncestorDirectoryPaths(
  rootPath: string,
  selectedFilePath: string | null
) {
  if (!selectedFilePath) return []
  if (!isPathInWorkspace(selectedFilePath, rootPath)) return []

  const treePath = canonicalTreePath(toTreePath(selectedFilePath, rootPath))
  const segments = treePath.split("/").filter(Boolean)
  if (segments.length <= 1) return []

  return segments.slice(0, -1).map((_, index) => {
    const directoryPath = segments.slice(0, index + 1).join("/")
    if (!rootPath) return directoryPath

    return `${rootPath}/${directoryPath}`
  })
}

async function fetchInitialTree(
  rootPath: string,
  selectedFilePath: string | null,
  signal: AbortSignal
) {
  const directoryPaths = selectedFileAncestorDirectoryPaths(
    rootPath,
    selectedFilePath
  )
  const root = fetchTree(rootPath, signal)
  const directories = Promise.all(
    directoryPaths.map((path) => fetchOptionalTree(path, signal))
  )
  const [rootResult, directoryResults] = await Promise.all([root, directories])

  return {
    directories: directoryResults.filter(isTreeResult),
    root: rootResult,
  }
}

async function fetchOptionalTree(path: string, signal: AbortSignal) {
  try {
    return await fetchTree(path, signal)
  } catch (error) {
    if (signal.aborted) throw error

    return null
  }
}

function isPathInWorkspace(path: string, rootPath: string) {
  if (!rootPath) return true
  if (path === rootPath) return true

  return path.startsWith(`${rootPath}/`)
}

function isTreeResult(result: TreeResult | null): result is TreeResult {
  return result !== null
}

function treeLoadState(query: UseQueryResult<TreeModel>): LoadState<TreeModel> {
  if (query.data) return { status: "ready", data: query.data }
  if (query.isError)
    return { status: "error", message: errorMessage(query.error) }
  if (query.isPending) return { status: "loading" }

  return idleState
}
