import type {
  FileTree as PierreFileTreeModel,
  FileTreeDirectoryHandle,
  FileTreeItemHandle,
  FileTreeRowDecorationContext,
  GitStatusEntry,
} from "@pierre/trees"
import { FileTree as PierreFileTree, useFileTree } from "@pierre/trees/react"
import { CircleNotchIcon, WarningCircleIcon } from "@phosphor-icons/react"

import { useEditorCommands } from "@/features/editor/state/editor-commands"
import { useEditorWorkspaceState } from "@/features/editor/state/editor-workspace-state"
import { useWorkspaceFocus } from "@/components/workspace/workspace-focus-state"
import { fileTreeIconsForPaths } from "@/lib/file-icons"
import type { TreeEntry } from "@/lib/file-system-types"
import type { LoadState } from "@/lib/load-state"
import { canonicalTreePath } from "@/lib/path-formatters"
import {
  entryForTreePath,
  shouldLoadDirectory,
  treePathForSelectedPath,
  type TreeModel,
} from "@/lib/tree-model"
import {
  useEffectEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react"

export function TreePane({
  gitStatus,
  onLoadDirectory,
  rootPath,
  state,
}: {
  gitStatus?: readonly GitStatusEntry[]
  onLoadDirectory: (entry: TreeEntry, treePath: string) => void
  rootPath: string
  state: LoadState<TreeModel>
}) {
  if (state.status === "loading") return <TreeStatus label="Loading folder" />
  if (state.status === "error") {
    return (
      <TreeStatus
        icon={<WarningCircleIcon className="size-4" />}
        label={state.message}
      />
    )
  }
  if (state.status !== "ready") return <TreeStatus label="No files" />
  if (state.data.paths.length === 0) return <TreeStatus label="No files" />

  return (
    <ReadyTreePane
      gitStatus={gitStatus}
      model={state.data}
      rootPath={rootPath}
      onLoadDirectory={onLoadDirectory}
    />
  )
}

function ReadyTreePane({
  gitStatus,
  model,
  onLoadDirectory,
  rootPath,
}: {
  gitStatus?: readonly GitStatusEntry[]
  model: TreeModel
  onLoadDirectory: (entry: TreeEntry, treePath: string) => void
  rootPath: string
}) {
  const selectedFilePath = useEditorWorkspaceState(
    (store) => store.selectedFilePath
  )
  const { selectFile } = useEditorCommands()
  const setFocusArea = useWorkspaceFocus((store) => store.setFocusArea)
  const modelRef = useRef(model)
  const pathsRef = useRef(model.paths)
  const icons = useMemo(() => fileTreeIconsForPaths(model.paths), [model.paths])
  const loadExpandedDirectoriesForCurrentModel = useEffectEvent(
    (currentTree: PierreFileTreeModel) => {
      loadExpandedDirectories(currentTree, model, onLoadDirectory)
    }
  )

  const initialSelectedPaths = selectedFilePath
    ? [treePathForSelectedPath(rootPath, selectedFilePath)]
    : undefined
  const { model: tree } = useFileTree({
    density: "compact",
    flattenEmptyDirectories: true,
    gitStatus,
    icons,
    initialExpansion: "closed",
    initialSelectedPaths,
    paths: model.paths,
    renderRowDecoration: (context) =>
      treeRowDecoration(modelRef.current, context),
    unsafeCSS: treeUnsafeCss,
    onSelectionChange: (selectedPaths) => {
      const entry = entryForTreePath(modelRef.current, selectedPaths[0])
      if (!entry || entry.type !== "file") return

      selectFile(entry.path)
    },
  })

  useLayoutEffect(() => {
    modelRef.current = model
  }, [model])

  useEffect(() => {
    tree.setIcons(icons)
  }, [icons, tree])

  useEffect(() => {
    tree.setGitStatus(gitStatus)
  }, [gitStatus, tree])

  useEffect(() => {
    syncTreePaths(tree, pathsRef.current, model.paths, model)
    pathsRef.current = model.paths
    loadExpandedDirectoriesForCurrentModel(tree)
  }, [model, tree])

  useEffect(() => {
    syncSelectedFilePath(tree, rootPath, selectedFilePath)
  }, [rootPath, selectedFilePath, tree])

  useEffect(() => {
    return tree.subscribe(() => {
      loadExpandedDirectoriesForCurrentModel(tree)
    })
  }, [tree])

  return (
    <div
      className="h-full"
      onFocusCapture={() => setFocusArea("file-tree")}
      onPointerDownCapture={() => setFocusArea("file-tree")}
    >
      <PierreFileTree
        aria-label="Folder tree"
        className="block h-full"
        model={tree}
        style={treeStyle}
      />
    </div>
  )
}

function TreeStatus({ icon, label }: { icon?: ReactNode; label: string }) {
  return (
    <div className="flex h-full min-h-48 items-center justify-center p-4 text-xs text-muted-foreground">
      <div className="flex items-center gap-2">
        {icon ?? <CircleNotchIcon className="size-4 animate-spin" />}
        {label}
      </div>
    </div>
  )
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
    if (entry.type !== "directory") continue
    if (!isTreeDirectoryExpanded(tree, treePath)) continue

    paths.push(`${treePath}/`)
  }

  return paths
}

function loadExpandedDirectories(
  tree: PierreFileTreeModel,
  model: TreeModel,
  onLoadDirectory: (entry: TreeEntry, treePath: string) => void
) {
  for (const [treePath, entry] of model.entriesByTreePath) {
    if (entry.type !== "directory") continue
    if (!shouldLoadDirectory(model, treePath)) continue
    if (!isTreeDirectoryExpanded(tree, treePath)) continue

    onLoadDirectory(entry, treePath)
  }
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

function treeRowDecoration(
  model: TreeModel,
  context: FileTreeRowDecorationContext
) {
  const treePath = canonicalTreePath(context.item.path)
  const error = model.errorByDirectoryPath.get(treePath)
  if (error) return { text: "error", title: error }
  if (model.loadingDirectoryPaths.has(treePath)) return { text: "loading" }

  return null
}

const treeStyle = {
  "--trees-bg-override": "var(--background)",
  "--trees-selected-bg-override": "var(--accent)",
  "--trees-border-color-override": "var(--border)",
  "--trees-fg-override": "var(--foreground)",
  height: "100%",
} as CSSProperties

const treeUnsafeCss = `
  :host {
    color: var(--foreground);
    background: transparent;
    font-family: var(--font-mono);
    font-size: 12px;
  }

  button[data-type='item'] {
    border-radius: 6px;
  }
`
