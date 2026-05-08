import type { TreeEntry, TreeResult } from "@/lib/file-system-types"
import type { LoadState } from "@/lib/load-state"
import { canonicalTreePath, toTreePath } from "@/lib/path-formatters"
import type { EditorWorkspaceEntry } from "@/components/editor"

export type TreeModel = {
  paths: string[]
  entriesByTreePath: Map<string, TreeEntry>
  errorByDirectoryPath: Map<string, string>
  loadedDirectoryPaths: Set<string>
  loadingDirectoryPaths: Set<string>
}

export const EMPTY_TREE_MODEL: TreeModel = {
  paths: [],
  entriesByTreePath: new Map(),
  errorByDirectoryPath: new Map(),
  loadedDirectoryPaths: new Set(),
  loadingDirectoryPaths: new Set(),
}

export function treeModel(result: TreeResult, rootPath: string): TreeModel {
  const entriesByTreePath = new Map<string, TreeEntry>()
  const paths = flattenTreeEntries(result.entries, rootPath, entriesByTreePath)

  return {
    paths,
    entriesByTreePath,
    errorByDirectoryPath: new Map(),
    loadedDirectoryPaths: new Set(),
    loadingDirectoryPaths: new Set(),
  }
}

export function shouldLoadDirectory(model: TreeModel, treePath: string) {
  const canonicalPath = canonicalTreePath(treePath)
  if (model.loadedDirectoryPaths.has(canonicalPath)) return false
  if (model.loadingDirectoryPaths.has(canonicalPath)) return false

  return true
}

export function markDirectoryLoading(
  model: TreeModel,
  directoryTreePath: string
): TreeModel {
  const next = cloneTreeModel(model)
  next.errorByDirectoryPath.delete(directoryTreePath)
  next.loadingDirectoryPaths.add(directoryTreePath)
  return next
}

export function markDirectoryError(
  model: TreeModel,
  directoryTreePath: string,
  message: string
): TreeModel {
  const next = cloneTreeModel(model)
  next.loadingDirectoryPaths.delete(directoryTreePath)
  next.errorByDirectoryPath.set(directoryTreePath, message)

  return next
}

export function mergeDirectoryLoad(
  model: TreeModel,
  rootPath: string,
  result: TreeResult,
  directoryTreePath: string
): TreeModel {
  const next = cloneTreeModel(model)
  addEntriesToModel(next, result.entries, rootPath)
  next.loadingDirectoryPaths.delete(directoryTreePath)
  next.errorByDirectoryPath.delete(directoryTreePath)
  next.loadedDirectoryPaths.add(directoryTreePath)
  next.paths = pathsFromEntries(next.entriesByTreePath)

  return next
}

export function selectedTreeEntry(
  state: LoadState<TreeModel>,
  rootPath: string | null,
  selectedFilePath: string
) {
  if (state.status !== "ready" || !rootPath) return null

  return entryForTreePath(state.data, toTreePath(selectedFilePath, rootPath))
}

export function entryForTreePath(
  model: TreeModel,
  treePath: string | undefined
) {
  if (!treePath) return null

  return model.entriesByTreePath.get(canonicalTreePath(treePath)) ?? null
}

export function workspaceSourceEntries(
  model: TreeModel | null
): readonly EditorWorkspaceEntry[] {
  if (!model) return []

  return Array.from(model.entriesByTreePath.values())
}

export function treePathForAbsolutePath(model: TreeModel, path: string) {
  for (const [treePath, entry] of model.entriesByTreePath) {
    if (entry.path === path) return treePath
  }

  return path
}

export function treePathForSelectedPath(
  model: TreeModel,
  rootPath: string,
  selectedFilePath: string
) {
  const existingPath = treePathForAbsolutePath(model, selectedFilePath)
  if (existingPath !== selectedFilePath) return existingPath

  return toTreePath(selectedFilePath, rootPath)
}

export function treeStateLabel(state: LoadState<TreeModel>) {
  if (state.status === "ready") {
    return `${state.data.paths.length.toLocaleString()} items`
  }
  if (state.status === "error") return "Could not load"
  if (state.status === "loading") return "Loading"

  return "Idle"
}

function flattenTreeEntries(
  entries: TreeEntry[],
  rootPath: string,
  entriesByTreePath: Map<string, TreeEntry>
) {
  const paths: string[] = []

  for (const entry of entries) {
    const treePath = toTreePath(entry.path, rootPath)
    if (!treePath) continue

    const canonicalPath = canonicalTreePath(treePath)
    entriesByTreePath.set(canonicalPath, entry)
    paths.push(entry.type === "directory" ? `${canonicalPath}/` : canonicalPath)

    if (!entry.children) continue

    paths.push(
      ...flattenTreeEntries(entry.children, rootPath, entriesByTreePath)
    )
  }

  return paths
}

function addEntriesToModel(
  model: TreeModel,
  entries: TreeEntry[],
  rootPath: string
) {
  for (const entry of entries) {
    const treePath = toTreePath(entry.path, rootPath)
    if (!treePath) continue

    const canonicalPath = canonicalTreePath(treePath)
    model.entriesByTreePath.set(canonicalPath, entry)
    if (!entry.children) continue

    model.loadedDirectoryPaths.add(canonicalPath)
    addEntriesToModel(model, entry.children, rootPath)
  }
}

function cloneTreeModel(model: TreeModel): TreeModel {
  return {
    paths: [...model.paths],
    entriesByTreePath: new Map(model.entriesByTreePath),
    errorByDirectoryPath: new Map(model.errorByDirectoryPath),
    loadedDirectoryPaths: new Set(model.loadedDirectoryPaths),
    loadingDirectoryPaths: new Set(model.loadingDirectoryPaths),
  }
}

function pathsFromEntries(entriesByTreePath: Map<string, TreeEntry>) {
  const paths: string[] = []

  for (const [treePath, entry] of entriesByTreePath) {
    paths.push(entry.type === "directory" ? `${treePath}/` : treePath)
  }

  return paths
}
