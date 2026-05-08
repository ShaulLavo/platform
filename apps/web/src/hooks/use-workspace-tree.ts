import type { PickedFsEntry } from "@/components/file-picker-dialog"
import { errorMessage, fetchTree } from "@/lib/file-server"
import type { TreeEntry } from "@/lib/file-system-types"
import {
  type KeyedLoadState,
  loadStateForKey,
  requestKey,
} from "@/lib/load-state"
import { canonicalTreePath } from "@/lib/path-formatters"
import {
  markDirectoryError,
  markDirectoryLoading,
  mergeDirectoryLoad,
  shouldLoadDirectory,
  treeModel,
  type TreeModel,
} from "@/lib/tree-model"
import { useEffect, useState } from "react"

export function useWorkspaceTree(rootFolder: PickedFsEntry | null) {
  const [treeReloadVersion, setTreeReloadVersion] = useState(0)
  const [treeLoad, setTreeLoad] = useState<KeyedLoadState<TreeModel> | null>(
    null
  )
  const treeRequestKey = rootFolder
    ? requestKey(rootFolder.path, treeReloadVersion)
    : null
  const treeState = loadStateForKey(treeLoad, treeRequestKey)

  useEffect(() => {
    if (!rootFolder || !treeRequestKey) return

    const controller = new AbortController()

    void fetchTree(rootFolder.path, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        setTreeLoad({
          key: treeRequestKey,
          state: { status: "ready", data: treeModel(result, rootFolder.path) },
        })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setTreeLoad({
          key: treeRequestKey,
          state: { status: "error", message: errorMessage(error) },
        })
      })

    return () => controller.abort()
  }, [rootFolder, treeRequestKey])

  function resetTreeLoad() {
    setTreeLoad(null)
    setTreeReloadVersion((version) => version + 1)
  }

  function retryTreeLoad() {
    if (!rootFolder) return
    setTreeReloadVersion((version) => version + 1)
  }

  function loadTreeDirectory(entry: TreeEntry, treePath: string) {
    if (!rootFolder || !treeRequestKey) return
    if (treeState.status !== "ready") return
    if (entry.type !== "directory") return
    if (!shouldLoadDirectory(treeState.data, treePath)) return

    const canonicalPath = canonicalTreePath(treePath)
    const controller = new AbortController()

    setTreeLoad({
      key: treeRequestKey,
      state: {
        status: "ready",
        data: markDirectoryLoading(treeState.data, canonicalPath),
      },
    })

    void fetchTree(entry.path, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        setTreeLoad((current) =>
          mergeDirectoryLoad(
            current,
            treeRequestKey,
            rootFolder.path,
            result,
            canonicalPath
          )
        )
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setTreeLoad((current) =>
          markDirectoryError(
            current,
            treeRequestKey,
            canonicalPath,
            errorMessage(error)
          )
        )
      })
  }

  return {
    loadTreeDirectory,
    resetTreeLoad,
    retryTreeLoad,
    treeState,
  }
}
