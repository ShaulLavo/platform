import type {
  FileTree as PierreFileTreeModel,
  FileTreeRowDecorationContext,
  GitStatusEntry,
} from "@pierre/trees"
import { FileTree as PierreFileTree, useFileTree } from "@pierre/trees/react"
import { CircleNotchIcon, WarningCircleIcon } from "@phosphor-icons/react"

import {
  loadExpandedDirectories,
  syncTreePaneState,
} from "@/components/workspace/tree-pane-state"
import { useEditorCommands } from "@/features/editor/state/editor-commands"
import { useEditorWorkspaceState } from "@/features/editor/state/editor-workspace-state"
import { useWorkspaceFocus } from "@/components/workspace/workspace-focus-state"
import { fileTreeIconsForPaths } from "@/lib/file-icons"
import type { TreeEntry } from "@/lib/file-system-types"
import { isFileEntry } from "@/lib/file-system-types"
import type { LoadState } from "@/lib/load-state"
import { canonicalTreePath } from "@/lib/path-formatters"
import {
  entryForTreePath,
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
      if (!entry || !isFileEntry(entry)) return

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
    pathsRef.current = syncTreePaneState({
      loadExpandedDirectoriesForCurrentModel,
      model,
      previousPaths: pathsRef.current,
      rootPath,
      selectedFilePath,
      tree,
    })
  }, [model, rootPath, selectedFilePath, tree])

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
