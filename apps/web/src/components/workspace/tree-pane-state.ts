import type {
  FileTree as PierreFileTreeModel,
  FileTreeDirectoryHandle,
  FileTreeItemHandle,
} from "@pierre/trees"

import type { TreeEntry } from "@/lib/file-system-types"
import { isDirectoryEntry } from "@/lib/file-system-types"
import { canonicalTreePath } from "@/lib/path-formatters"
import {
  shouldLoadDirectory,
  treePathForSelectedPath,
  type TreeModel,
} from "@/lib/tree-model"

export function syncTreePaneState({
  loadExpandedDirectoriesForCurrentModel,
  model,
  previousPaths,
  rootPath,
  selectedFilePath,
  tree,
}: {
  loadExpandedDirectoriesForCurrentModel: (tree: PierreFileTreeModel) => void
  model: TreeModel
  previousPaths: readonly string[]
  rootPath: string
  selectedFilePath: string | null
  tree: PierreFileTreeModel
}) {
  syncTreePaths(tree, previousPaths, model.paths, model)
  syncSelectedFilePath(tree, rootPath, selectedFilePath)
  loadExpandedDirectoriesForCurrentModel(tree)

  return model.paths
}

export function loadExpandedDirectories(
  tree: PierreFileTreeModel,
  model: TreeModel,
  onLoadDirectory: (entry: TreeEntry, treePath: string) => void
) {
  for (const [treePath, entry] of model.entriesByTreePath) {
    if (!isDirectoryEntry(entry)) continue
    const directoryTreePath = `${canonicalTreePath(treePath)}/`
    if (!shouldLoadDirectory(model, directoryTreePath)) continue
    if (!isTreeDirectoryExpanded(tree, directoryTreePath)) continue

    onLoadDirectory(entry, directoryTreePath)
  }
}

function syncSelectedFilePath(
  tree: PierreFileTreeModel,
  rootPath: string,
  selectedFilePath: string | null
) {
  if (!selectedFilePath) return clearTreeSelection(tree)

  const treePath = treePathForSelectedPath(rootPath, selectedFilePath)
  if (!treePath) return clearTreeSelection(tree)

  const canonicalPath = canonicalTreePath(treePath)
  expandKnownAncestorDirectories(tree, canonicalPath)
  const item = tree.getItem(canonicalPath)
  if (!item || item.isDirectory()) return
  if (isOnlySelectedPath(tree, canonicalPath)) return

  clearTreeSelection(tree)
  item.select()
}

function clearTreeSelection(tree: PierreFileTreeModel) {
  for (const selectedPath of tree.getSelectedPaths()) {
    tree.getItem(selectedPath)?.deselect()
  }
}

const INCREMENTAL_TREE_SYNC_LIMIT = 512

type TreePathChanges = {
  added: string[]
  removed: string[]
}

function syncTreePaths(
  tree: PierreFileTreeModel,
  previousPaths: readonly string[],
  nextPaths: readonly string[],
  model: TreeModel
) {
  const changes = treePathChanges(previousPaths, nextPaths)
  if (changes.added.length === 0 && changes.removed.length === 0) return

  if (shouldResetTreePaths(changes)) {
    tree.resetPaths(nextPaths, {
      initialExpandedPaths: expandedDirectoryPaths(model, tree),
    })
    return
  }

  for (const path of topLevelRemovedPaths(changes.removed)) {
    removeTreePath(tree, path)
  }

  for (const path of sortedTreePathsByDepth(changes.added)) {
    tree.add(path)
  }
}

function treePathChanges(
  previousPaths: readonly string[],
  nextPaths: readonly string[]
): TreePathChanges {
  const previousPathSet = new Set(previousPaths)
  const nextPathSet = new Set(nextPaths)

  return {
    added: nextPaths.filter((path) => !previousPathSet.has(path)),
    removed: previousPaths.filter((path) => !nextPathSet.has(path)),
  }
}

function shouldResetTreePaths({ added, removed }: TreePathChanges) {
  return added.length + removed.length > INCREMENTAL_TREE_SYNC_LIMIT
}

function topLevelRemovedPaths(paths: readonly string[]) {
  const removedPathSet = new Set(paths)

  return sortedTreePathsByDepth(paths).filter(
    (path) => !hasRemovedAncestor(path, removedPathSet)
  )
}

function hasRemovedAncestor(path: string, removedPathSet: ReadonlySet<string>) {
  return ancestorDirectoryPaths(path).some((ancestorPath) =>
    removedPathSet.has(ancestorPath)
  )
}

function sortedTreePathsByDepth(paths: readonly string[]) {
  return [...paths].sort(
    (left, right) => treePathDepth(left) - treePathDepth(right)
  )
}

function treePathDepth(path: string) {
  return canonicalTreePath(path).split("/").filter(Boolean).length
}

function removeTreePath(tree: PierreFileTreeModel, path: string) {
  if (path.endsWith("/")) {
    tree.remove(path, { recursive: true })
    return
  }

  tree.remove(path)
}

function expandKnownAncestorDirectories(
  tree: PierreFileTreeModel,
  treePath: string
) {
  for (const directoryPath of ancestorDirectoryPaths(treePath)) {
    const item = tree.getItem(directoryPath)
    if (!isTreeDirectoryHandle(item)) continue
    if (item.isExpanded()) continue

    item.expand()
  }
}

function ancestorDirectoryPaths(treePath: string) {
  const segments = canonicalTreePath(treePath).split("/").filter(Boolean)
  const paths: string[] = []

  for (let index = 0; index < segments.length - 1; index += 1) {
    paths.push(`${segments.slice(0, index + 1).join("/")}/`)
  }

  return paths
}

function isOnlySelectedPath(tree: PierreFileTreeModel, treePath: string) {
  const selectedPaths = tree.getSelectedPaths()
  if (selectedPaths.length !== 1) return false

  return canonicalTreePath(selectedPaths[0] ?? "") === treePath
}

function expandedDirectoryPaths(model: TreeModel, tree: PierreFileTreeModel) {
  const paths: string[] = []

  for (const [treePath, entry] of model.entriesByTreePath) {
    if (!isDirectoryEntry(entry)) continue
    if (!isTreeDirectoryExpanded(tree, treePath)) continue

    paths.push(`${treePath}/`)
  }

  return paths
}

function isTreeDirectoryExpanded(tree: PierreFileTreeModel, treePath: string) {
  const item = tree.getItem(`${treePath}/`) ?? tree.getItem(treePath)
  if (!isTreeDirectoryHandle(item)) return false

  return item.isExpanded()
}

function isTreeDirectoryHandle(
  item: FileTreeItemHandle | null
): item is FileTreeDirectoryHandle {
  return item?.isDirectory() === true
}
