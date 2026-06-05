import type {
  FileTree as PierreFileTreeModel,
  FileTreeDirectoryHandle,
  FileTreeItemHandle,
} from '@pierre/trees'

import type { TreeEntry } from '@/lib/file-system-types'
import { isDirectoryEntry } from '@/lib/file-system-types'
import { canonicalTreePath } from '@/lib/path-formatters'
import {
  type DirectoryLoadOptions,
  shouldLoadDirectory,
  treePathForSelectedPath,
  type TreeModel,
} from '@/lib/tree-model'

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
  onLoadDirectory: (entry: TreeEntry, treePath: string, options?: DirectoryLoadOptions) => void,
  previousExpandedDirectoryPaths?: ReadonlySet<string>,
) {
  const expandedPaths = expandedDirectoryPathSet(model, tree)

  for (const [treePath, entry] of model.entriesByTreePath) {
    if (!isDirectoryEntry(entry)) continue
    const directoryTreePath = `${canonicalTreePath(treePath)}/`
    const canonicalDirectoryPath = canonicalTreePath(directoryTreePath)
    if (!expandedPaths.has(canonicalDirectoryPath)) continue

    const retry = previousExpandedDirectoryPaths?.has(canonicalDirectoryPath) === false
    if (!shouldLoadDirectory(model, directoryTreePath, { retry })) continue

    onLoadDirectory(entry, directoryTreePath, { retry })
  }

  return expandedPaths
}

export function visibleTreeItemCount(tree: PierreFileTreeModel, model: TreeModel) {
  const childrenByParent = treeChildrenByParentPath(model)

  return visibleChildrenCount({
    childrenByParent,
    model,
    parentPath: '',
    tree,
  })
}

function syncSelectedFilePath(
  tree: PierreFileTreeModel,
  rootPath: string,
  selectedFilePath: string | null,
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

type TreeChild = {
  entry: TreeEntry
  treePath: string
}

type VisibleChildrenCountOptions = {
  childrenByParent: ReadonlyMap<string, readonly TreeChild[]>
  model: TreeModel
  parentPath: string
  tree: PierreFileTreeModel
}

function visibleChildrenCount({
  childrenByParent,
  model,
  parentPath,
  tree,
}: VisibleChildrenCountOptions) {
  let count = 0

  for (const child of childrenByParent.get(parentPath) ?? []) {
    count += visibleChildCount({ child, childrenByParent, model, tree })
  }

  return count
}

function visibleChildCount({
  child,
  childrenByParent,
  model,
  tree,
}: Omit<VisibleChildrenCountOptions, 'parentPath'> & { child: TreeChild }) {
  if (!isDirectoryEntry(child.entry)) return 1

  const terminalPath = flattenedTerminalDirectoryPath(child.treePath, childrenByParent, model)
  if (!isTreeDirectoryExpanded(tree, terminalPath)) return 1

  return (
    1 +
    visibleChildrenCount({
      childrenByParent,
      model,
      parentPath: terminalPath,
      tree,
    })
  )
}

function treeChildrenByParentPath(model: TreeModel) {
  const childrenByParent = new Map<string, TreeChild[]>()

  for (const [treePath, entry] of model.entriesByTreePath) {
    const parentPath = parentTreePath(treePath)
    const children = childrenByParent.get(parentPath) ?? []
    children.push({ entry, treePath })
    childrenByParent.set(parentPath, children)
  }

  return childrenByParent
}

function parentTreePath(treePath: string) {
  const path = canonicalTreePath(treePath)
  const index = path.lastIndexOf('/')
  if (index < 0) return ''

  return path.slice(0, index)
}

function flattenedTerminalDirectoryPath(
  treePath: string,
  childrenByParent: ReadonlyMap<string, readonly TreeChild[]>,
  model: TreeModel,
) {
  let currentPath = canonicalTreePath(treePath)

  while (true) {
    const nextPath = flattenedChildDirectoryPath(currentPath, childrenByParent, model)
    if (!nextPath) return currentPath

    currentPath = nextPath
  }
}

function flattenedChildDirectoryPath(
  treePath: string,
  childrenByParent: ReadonlyMap<string, readonly TreeChild[]>,
  model: TreeModel,
) {
  const children = childrenByParent.get(treePath)
  if (children?.length !== 1) return null

  const child = children[0]
  if (!child) return null
  if (!isDirectoryEntry(child.entry)) return null
  if (!model.entriesByTreePath.has(child.treePath)) return null

  return child.treePath
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
  model: TreeModel,
) {
  const changes = treePathChanges(previousPaths, nextPaths)
  if (changes.added.length === 0 && changes.removed.length === 0) return
  const expandedPathsBeforeSync = expandedDirectoryPathSet(model, tree)

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

  expandNewFlattenedDirectoryTerminals(tree, model, changes.added, expandedPathsBeforeSync)
}

function treePathChanges(
  previousPaths: readonly string[],
  nextPaths: readonly string[],
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

  return sortedTreePathsByDepth(paths).filter((path) => !hasRemovedAncestor(path, removedPathSet))
}

function hasRemovedAncestor(path: string, removedPathSet: ReadonlySet<string>) {
  return ancestorDirectoryPaths(path).some((ancestorPath) => removedPathSet.has(ancestorPath))
}

function sortedTreePathsByDepth(paths: readonly string[]) {
  return paths.toSorted((left, right) => treePathDepth(left) - treePathDepth(right))
}

function treePathDepth(path: string) {
  return canonicalTreePath(path).split('/').filter(Boolean).length
}

function removeTreePath(tree: PierreFileTreeModel, path: string) {
  if (path.endsWith('/')) {
    tree.remove(path, { recursive: true })
    return
  }

  tree.remove(path)
}

function expandKnownAncestorDirectories(tree: PierreFileTreeModel, treePath: string) {
  for (const directoryPath of ancestorDirectoryPaths(treePath)) {
    const item = tree.getItem(directoryPath)
    if (!isTreeDirectoryHandle(item)) continue
    if (item.isExpanded()) continue

    item.expand()
  }
}

function ancestorDirectoryPaths(treePath: string) {
  const segments = canonicalTreePath(treePath).split('/').filter(Boolean)
  const paths: string[] = []

  for (let index = 0; index < segments.length - 1; index += 1) {
    paths.push(`${segments.slice(0, index + 1).join('/')}/`)
  }

  return paths
}

function isOnlySelectedPath(tree: PierreFileTreeModel, treePath: string) {
  const selectedPaths = tree.getSelectedPaths()
  if (selectedPaths.length !== 1) return false

  return canonicalTreePath(selectedPaths[0] ?? '') === treePath
}

function expandedDirectoryPaths(model: TreeModel, tree: PierreFileTreeModel) {
  const paths: string[] = []
  const expandedPaths = expandedDirectoryPathSet(model, tree)
  const childrenByParent = treeChildrenByParentPath(model)

  for (const treePath of expandedPaths) {
    paths.push(`${treePath}/`)

    const terminalPath = flattenedTerminalDirectoryPath(treePath, childrenByParent, model)
    if (terminalPath === treePath) continue
    if (parentTreePath(terminalPath) !== treePath) continue

    paths.push(`${terminalPath}/`)
  }

  return paths
}

function expandedDirectoryPathSet(model: TreeModel, tree: PierreFileTreeModel) {
  const paths = new Set<string>()

  for (const [treePath, entry] of model.entriesByTreePath) {
    if (!isDirectoryEntry(entry)) continue
    if (!isTreeDirectoryExpanded(tree, treePath)) continue

    paths.add(canonicalTreePath(treePath))
  }

  return paths
}

function expandNewFlattenedDirectoryTerminals(
  tree: PierreFileTreeModel,
  model: TreeModel,
  addedPaths: readonly string[],
  expandedPathsBeforeSync: ReadonlySet<string>,
) {
  const addedDirectoryPaths = addedDirectoryPathSet(addedPaths)
  if (addedDirectoryPaths.size === 0) return

  const childrenByParent = treeChildrenByParentPath(model)
  for (const expandedPath of expandedPathsBeforeSync) {
    const terminalPath = flattenedTerminalDirectoryPath(expandedPath, childrenByParent, model)
    if (terminalPath === expandedPath) continue
    if (parentTreePath(terminalPath) !== expandedPath) continue
    if (!addedDirectoryPaths.has(terminalPath)) continue

    expandTreeDirectory(tree, terminalPath)
  }
}

function addedDirectoryPathSet(paths: readonly string[]) {
  const directoryPaths = new Set<string>()

  for (const path of paths) {
    if (!path.endsWith('/')) continue

    directoryPaths.add(canonicalTreePath(path))
  }

  return directoryPaths
}

function expandTreeDirectory(tree: PierreFileTreeModel, treePath: string) {
  const item = tree.getItem(`${treePath}/`) ?? tree.getItem(treePath)
  if (!isTreeDirectoryHandle(item)) return
  if (item.isExpanded()) return

  item.expand()
}

function isTreeDirectoryExpanded(tree: PierreFileTreeModel, treePath: string) {
  const item = tree.getItem(`${treePath}/`) ?? tree.getItem(treePath)
  if (!isTreeDirectoryHandle(item)) return false

  return item.isExpanded()
}

function isTreeDirectoryHandle(item: FileTreeItemHandle | null): item is FileTreeDirectoryHandle {
  return item?.isDirectory() === true
}
