import * as React from "react"
import type {
  FileTree as PierreFileTreeModel,
  FileTreeDirectoryHandle,
  FileTreeRowDecorationContext,
} from "@pierre/trees"
import { FileTree as PierreFileTree, useFileTree } from "@pierre/trees/react"
import { CircleNotchIcon, WarningCircleIcon } from "@phosphor-icons/react"

import type { TreeEntry } from "@/lib/file-system-types"
import type { LoadState } from "@/lib/load-state"
import { canonicalTreePath } from "@/lib/path-formatters"
import {
  entryForTreePath,
  shouldLoadDirectory,
  treePathForSelectedPath,
  type TreeModel,
} from "@/lib/tree-model"

export function TreePane({
  model,
  onLoadDirectory,
  rootPath,
  selectedFilePath,
  setSelectedFilePath,
  state,
}: {
  model: TreeModel
  onLoadDirectory: (entry: TreeEntry, treePath: string) => void
  rootPath: string
  selectedFilePath: string | null
  setSelectedFilePath: (path: string | null) => void
  state: LoadState<TreeModel>
}) {
  const modelRef = React.useRef(model)
  const onLoadDirectoryRef = React.useRef(onLoadDirectory)

  const initialSelectedPaths = selectedFilePath
    ? [treePathForSelectedPath(model, rootPath, selectedFilePath)]
    : undefined
  const { model: tree } = useFileTree({
    density: "compact",
    flattenEmptyDirectories: true,
    initialExpansion: "closed",
    initialSelectedPaths,
    paths: model.paths,
    renderRowDecoration: (context) =>
      treeRowDecoration(modelRef.current, context),
    unsafeCSS: treeUnsafeCss,
    onSelectionChange: (selectedPaths) => {
      const entry = entryForTreePath(modelRef.current, selectedPaths[0])
      if (!entry || entry.type !== "file") return

      setSelectedFilePath(entry.path)
    },
  })

  React.useLayoutEffect(() => {
    modelRef.current = model
    onLoadDirectoryRef.current = onLoadDirectory
  }, [model, onLoadDirectory])

  React.useEffect(() => {
    tree.resetPaths(model.paths, {
      initialExpandedPaths: expandedDirectoryPaths(model, tree),
    })
    loadExpandedDirectories(tree, model, onLoadDirectoryRef.current)
  }, [model, tree])

  React.useEffect(() => {
    syncSelectedFilePath(tree, model, rootPath, selectedFilePath)
  }, [model, rootPath, selectedFilePath, tree])

  React.useEffect(() => {
    return tree.subscribe(() => {
      loadExpandedDirectories(
        tree,
        modelRef.current,
        onLoadDirectoryRef.current
      )
    })
  }, [tree])

  if (state.status === "loading") return <TreeStatus label="Loading folder" />
  if (state.status === "error") {
    return (
      <TreeStatus
        icon={<WarningCircleIcon className="size-4" />}
        label={state.message}
      />
    )
  }
  if (model.paths.length === 0) return <TreeStatus label="No files" />

  return (
    <PierreFileTree
      aria-label="Folder tree"
      className="block h-full"
      model={tree}
      style={treeStyle}
    />
  )
}

function TreeStatus({
  icon,
  label,
}: {
  icon?: React.ReactNode
  label: string
}) {
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
  model: TreeModel,
  rootPath: string,
  selectedFilePath: string | null
) {
  if (!selectedFilePath) return clearTreeSelection(tree)

  const treePath = treePathForSelectedPath(model, rootPath, selectedFilePath)
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

function expandKnownAncestorDirectories(
  tree: PierreFileTreeModel,
  treePath: string
) {
  for (const directoryPath of ancestorDirectoryPaths(treePath)) {
    const item = tree.getItem(directoryPath)
    if (!item?.isDirectory()) continue
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
  if (!item) return false
  if (!item.isDirectory()) return false

  return (item as FileTreeDirectoryHandle).isExpanded()
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
} as React.CSSProperties

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
