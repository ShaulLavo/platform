import type {
  FileTreeDropContext,
  FileTreeDropResult,
  FileTreeRenameEvent,
  FileTreeRowDecorationContext,
} from '@workspace/tree/utils/model/publicTypes'
import { FileTree } from '@workspace/tree/components/FileTree'
import { useFileTree } from '@workspace/tree/hooks/useFileTree'
import type { GitStatusEntry } from '@workspace/tree/utils/publicTypes'
import type { FileTree as FileTreeModel } from '@workspace/tree/utils/render/FileTree'
import { CircleNotchIcon, WarningCircleIcon } from '@phosphor-icons/react'

import { workspacePathForTreePath } from '@/features/workspace/utils/entry-paths'
import { invalidateTreeQueries } from '@/features/workspace/utils/invalidate-queries'
import {
  loadExpandedDirectories,
  syncTreePaneState,
  visibleTreeItemCount,
} from '@/features/workspace/utils/tree-pane-state'
import { selectedFileEntryForTreeSelection } from '@/features/workspace/utils/tree-selection'
import { DeleteEntryDialog } from '@/features/workspace/components/delete-entry-dialog'
import { useFileTreeActions } from '@/features/workspace/hooks/use-file-tree-actions'
import { useFileTreeIntentPrefetch } from '@/features/workspace/hooks/use-file-tree-intent-prefetch'
import { useFsActions } from '@/features/workspace/hooks/use-fs-actions'
import { useEditorCommands } from '@/features/editor/state/commands'
import { useEditorWorkspaceState } from '@/features/editor/state/workspace-state'
import { useFocus } from '@/features/workspace/providers/focus-state'
import { reportError, toClientError } from '@/lib/client-error-taxonomy'
import { fileTreeIconsForPaths } from '@/lib/file-icons'
import { TreeRowMenu } from '@/features/workspace/components/row-menu'
import { renamePath } from '@/lib/file-server'
import type { LoadState } from '@/lib/load-state'
import { canonicalTreePath } from '@/lib/path-formatters'
import { fileSystemKeys } from '@/lib/query-keys'
import {
  moveTreeModelPaths,
  treePathForSelectedPath,
  type TreePathMove,
  type TreeModel,
} from '@/lib/tree-model'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  useEffectEvent,
  useEffect,
  useLayoutEffect,
  memo,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
} from 'react'

export const TreePane = memo(
  ({
    gitStatus,
    rootPath,
    state,
  }: {
    gitStatus?: readonly GitStatusEntry[]
    rootPath: string
    state: LoadState<TreeModel>
  }) => {
    if (state.status === 'loading') return <TreeStatus label='Loading folder' />
    if (state.status === 'error') {
      return <TreeStatus icon={<WarningCircleIcon className='size-4' />} label={state.message} />
    }
    if (state.status !== 'ready') return <TreeStatus label='No files' />
    if (state.data.paths.length === 0) return <TreeStatus label='No files' />

    return <ReadyTreePane gitStatus={gitStatus} model={state.data} rootPath={rootPath} />
  },
)

function ReadyTreePane({
  gitStatus,
  model,
  rootPath,
}: {
  gitStatus?: readonly GitStatusEntry[]
  model: TreeModel
  rootPath: string
}) {
  const selectedFilePath = useEditorWorkspaceState((store) => store.selectedFilePath)
  const { selectFile } = useEditorCommands()
  const { loadDirectory, publishVisibleItemCount: publishVisibleItemCountAction } =
    useFileTreeActions()
  const setFocusArea = useFocus((store) => store.setFocusArea)
  const queryClient = useQueryClient()
  const expandedDirectoryPathsRef = useRef<ReadonlySet<string> | undefined>(undefined)
  const modelRef = useRef(model)
  const selectedFilePathRef = useRef(selectedFilePath)
  const selectFileRef = useRef(selectFile)
  const movePendingRef = useRef(false)
  const pathsRef = useRef(model.paths)
  const selectionSyncRef = useRef<SelectionSyncState>({
    rootPath: null,
    selectedFilePath: undefined,
  })
  const treeRef = useRef<FileTreeModel | null>(null)
  const icons = useMemo(() => fileTreeIconsForPaths(model.paths), [model.paths])
  const moveMutation = useMutation({
    mutationFn: moveDroppedTreePaths,
    onMutate: (request) => {
      movePendingRef.current = true
      const rootTreeKey = fileSystemKeys.tree(request.rootPath)
      const previousModel = queryClient.getQueryData<TreeModel>(rootTreeKey) ?? modelRef.current
      const nextModel = moveTreeModelPaths(previousModel, request.rootPath, request.moves)

      pathsRef.current = nextModel.paths
      queryClient.setQueryData(rootTreeKey, nextModel)

      return { previousModel, rootPath: request.rootPath }
    },
    onError: (error, _request, context) => {
      const previousModel = context?.previousModel ?? modelRef.current
      pathsRef.current = previousModel.paths
      queryClient.setQueryData(fileSystemKeys.tree(context?.rootPath ?? rootPath), previousModel)
      treeRef.current?.resetPaths(previousModel.paths)
      reportError(toClientError(error))
    },
    onSettled: () => {
      movePendingRef.current = false
      invalidateTreeQueries(queryClient)
    },
  })
  const fsActions = useFsActions({ modelRef, rootPath, treeRef })
  const completeRenameRef = useRef(fsActions.completeRename)
  const loadExpandedDirectoriesForCurrentModel = useEffectEvent((currentTree: FileTreeModel) => {
    expandedDirectoryPathsRef.current = loadExpandedDirectories(
      currentTree,
      model,
      loadDirectory,
      expandedDirectoryPathsRef.current,
    )
  })
  const publishVisibleTreeItemCount = useEffectEvent((currentTree: FileTreeModel) => {
    publishVisibleItemCountAction(visibleTreeItemCount(currentTree, modelRef.current))
  })
  const resumeDeferredCreate = useEffectEvent(() => fsActions.resumeDeferredCreate())

  const initialSelectedPaths = selectedFilePath
    ? [treePathForSelectedPath(rootPath, selectedFilePath)]
    : undefined
  const { model: tree } = useFileTree({
    density: 'compact',
    // Compact preset rows are 24px; 20px keeps 12px text readable while fitting
    // ~17% more rows. itemHeight (not a CSS override) so virtualization agrees.
    itemHeight: 20,
    flattenEmptyDirectories: true,
    gitStatus,
    icons,
    initialExpansion: 'closed',
    initialSelectedPaths,
    paths: model.paths,
    dragAndDrop: {
      canDrag: (paths) => canDragTreePaths(modelRef.current, paths, movePendingRef.current),
      canDrop: (context) => canDropTreePaths(modelRef.current, context),
      onDropComplete: (event) => {
        const moves = treePathMovesForDrop(event)
        if (moves.length === 0) return

        moveMutation.mutate({ moves, rootPath })
      },
      onDropError: (error) => {
        reportError(toClientError({ code: 'INVALID_PATH', error }))
      },
    },
    // useFileTree captures these options once, so read live app state from refs
    // at call time — the same pattern as the drag/drop and row-decoration callbacks.
    onSelectionChange: (selectedPaths) =>
      openSelectedTreeFile({
        model: modelRef.current,
        selectedFilePath: selectedFilePathRef.current,
        selectedPaths,
        selectFile: selectFileRef.current,
      }),
    renaming: {
      onError: (error) => reportError(toClientError({ code: 'INVALID_PATH', error })),
      onRename: (event: FileTreeRenameEvent) => completeRenameRef.current(event),
    },
    renderRowDecoration: (context) => treeRowDecoration(modelRef.current, context),
    unsafeCSS: treeUnsafeCss,
  })

  useFileTreeIntentPrefetch({
    model,
    tree,
  })

  // No dependency list: every value here is a fresh identity per render, and
  // the body only mirrors the latest render into refs that captured-once tree
  // callbacks read at call time.
  useLayoutEffect(() => {
    completeRenameRef.current = fsActions.completeRename
    modelRef.current = model
    selectedFilePathRef.current = selectedFilePath
    selectFileRef.current = selectFile
    treeRef.current = tree
  })

  useEffect(() => {
    const selectionSync = selectionSyncPlan({
      rootPath,
      selectedFilePath,
      state: selectionSyncRef.current,
      tree,
    })
    pathsRef.current = syncTreePaneState({
      loadExpandedDirectoriesForCurrentModel,
      model,
      previousPaths: pathsRef.current,
      rootPath,
      syncSelection: selectionSync.shouldSync,
      selectedFilePath,
      tree,
    })
    updateSelectionSyncState(selectionSyncRef.current, selectionSync, rootPath, selectedFilePath)
    publishVisibleTreeItemCount(tree)
    // Strictly after the path sync: a create deferred on a loading directory
    // must plant its placeholder into an already-settled tree.
    resumeDeferredCreate()
  }, [model, rootPath, selectedFilePath, tree])

  useEffect(() => {
    return tree.subscribe(() => {
      loadExpandedDirectoriesForCurrentModel(tree)
      publishVisibleTreeItemCount(tree)
    })
  }, [tree])

  return (
    <div
      className='h-full'
      onFocusCapture={() => setFocusArea('file-tree')}
      onPointerDownCapture={() => setFocusArea('file-tree')}
    >
      <FileTree
        aria-label='Folder tree'
        className='block h-full'
        model={tree}
        renderContextMenu={(item, menuContext) => (
          <TreeRowMenu
            actions={fsActions.actions}
            item={item}
            menuContext={menuContext}
            model={model}
            rootPath={rootPath}
          />
        )}
        style={treeStyle}
      />
      {/* Owned here, not by the menu: the menu unmounts the instant it closes. */}
      <DeleteEntryDialog {...fsActions.deleteDialog} />
    </div>
  )
}

function openSelectedTreeFile({
  model,
  selectedFilePath,
  selectedPaths,
  selectFile,
}: {
  model: TreeModel
  selectedFilePath: string | null
  selectedPaths: readonly string[]
  selectFile: (path: string | null) => void
}) {
  const entry = selectedFileEntryForTreeSelection(model, selectedPaths)
  if (!entry) return
  if (entry.path === selectedFilePath) return

  selectFile(entry.path)
}

function TreeStatus({ icon, label }: { icon?: ReactNode; label: string }) {
  return (
    <div className='text-muted-foreground flex h-full min-h-48 items-center justify-center p-4 text-xs'>
      <div className='flex items-center gap-2'>
        {icon ?? <CircleNotchIcon className='size-4 animate-spin' />}
        {label}
      </div>
    </div>
  )
}

type SelectionSyncState = {
  rootPath: string | null
  selectedFilePath: string | null | undefined
}

type SelectionSyncPlan = {
  canComplete: boolean
  reason: 'already-synced' | 'pending-selected-file' | 'root-changed' | 'selected-file-changed'
  shouldSync: boolean
  treePath: string | null
}

function selectionSyncPlan({
  rootPath,
  selectedFilePath,
  state,
  tree,
}: {
  rootPath: string
  selectedFilePath: string | null
  state: SelectionSyncState
  tree: FileTreeModel
}): SelectionSyncPlan {
  const treePath = selectedTreePath(rootPath, selectedFilePath)
  const canComplete = selectedFilePathCanCompleteSync(tree, treePath, selectedFilePath)
  if (state.rootPath !== rootPath) {
    return { canComplete, reason: 'root-changed', shouldSync: true, treePath }
  }
  if (state.selectedFilePath !== selectedFilePath) {
    const reason = canComplete ? 'selected-file-changed' : 'pending-selected-file'
    return { canComplete, reason, shouldSync: true, treePath }
  }

  return { canComplete, reason: 'already-synced', shouldSync: false, treePath }
}

function selectedTreePath(rootPath: string, selectedFilePath: string | null) {
  if (!selectedFilePath) return null

  return canonicalTreePath(treePathForSelectedPath(rootPath, selectedFilePath))
}

function selectedFilePathCanCompleteSync(
  tree: FileTreeModel,
  treePath: string | null,
  selectedFilePath: string | null,
) {
  if (!selectedFilePath) return true
  if (!treePath) return true

  const item = tree.getItem(treePath)
  return item?.isDirectory() === false
}

function updateSelectionSyncState(
  state: SelectionSyncState,
  plan: SelectionSyncPlan,
  rootPath: string,
  selectedFilePath: string | null,
) {
  if (!plan.canComplete) return

  state.rootPath = rootPath
  state.selectedFilePath = selectedFilePath
}

function treeRowDecoration(model: TreeModel, context: FileTreeRowDecorationContext) {
  const treePath = canonicalTreePath(context.item.path)
  const error = model.errorByDirectoryPath.get(treePath)
  if (error) return { text: 'error', title: error }
  if (model.loadingDirectoryPaths.has(treePath)) return { text: 'loading' }

  return null
}

type TreeDropMoveRequest = {
  moves: readonly TreePathMove[]
  rootPath: string
}

async function moveDroppedTreePaths(request: TreeDropMoveRequest) {
  for (const move of request.moves) {
    await renamePath(
      workspacePathForTreePath(request.rootPath, move.fromTreePath),
      workspacePathForTreePath(request.rootPath, move.toTreePath),
    )
  }
}

function canDragTreePaths(model: TreeModel, paths: readonly string[], movePending: boolean) {
  if (movePending) return false
  if (paths.length === 0) return false

  return paths.every((path) => model.entriesByTreePath.has(canonicalTreePath(path)))
}

function canDropTreePaths(model: TreeModel, context: FileTreeDropContext) {
  const moves = treePathMovesForDrop(context)
  if (moves.length === 0) return false
  if (hasDuplicateDestinations(moves)) return false

  return moves.every((move) => canDropTreePath(model, move))
}

function canDropTreePath(model: TreeModel, move: TreePathMove) {
  if (!model.entriesByTreePath.has(move.fromTreePath)) return false
  if (model.entriesByTreePath.has(move.toTreePath)) return false

  return !move.toTreePath.startsWith(`${move.fromTreePath}/`)
}

function hasDuplicateDestinations(moves: readonly TreePathMove[]) {
  const destinations = new Set<string>()

  for (const move of moves) {
    if (destinations.has(move.toTreePath)) return true

    destinations.add(move.toTreePath)
  }

  return false
}

function treePathMovesForDrop(context: FileTreeDropContext | FileTreeDropResult) {
  const targetTreePath = dropTargetTreePath(context)
  const moves: TreePathMove[] = []

  for (const draggedPath of context.draggedPaths) {
    const fromTreePath = canonicalTreePath(draggedPath)
    const toTreePath = dropDestinationTreePath(fromTreePath, targetTreePath)
    if (!fromTreePath) continue
    if (!toTreePath) continue
    if (fromTreePath === toTreePath) continue

    moves.push({ fromTreePath, toTreePath })
  }

  return moves
}

function dropTargetTreePath(context: FileTreeDropContext | FileTreeDropResult) {
  if (context.target.kind === 'root') return ''
  if (!context.target.directoryPath) return ''

  return canonicalTreePath(context.target.directoryPath)
}

function dropDestinationTreePath(fromTreePath: string, targetTreePath: string) {
  const basename = treePathBasename(fromTreePath)
  if (!basename) return ''
  if (!targetTreePath) return basename

  return `${targetTreePath}/${basename}`
}

function treePathBasename(treePath: string) {
  const segments = canonicalTreePath(treePath).split('/').filter(Boolean)

  return segments.at(-1) ?? ''
}

const treeStyle = {
  '--trees-bg-muted-override': 'var(--accent)',
  '--trees-bg-override': 'transparent',
  // The tree package's built-in accent (#009fff) and git palette are raw hexes that
  // bypass the theme; point every override at tokens so selection and git status
  // track light/dark and never go neon against the wallpaper.
  '--trees-accent-override': 'var(--ring)',
  '--trees-status-added-override': 'var(--success)',
  '--trees-status-untracked-override': 'var(--success)',
  '--trees-status-modified-override': 'var(--warning)',
  '--trees-status-renamed-override': 'var(--warning)',
  '--trees-status-deleted-override': 'var(--destructive)',
  '--trees-status-ignored-override': 'var(--muted-foreground)',
  // Selection marks the current file and must stay legible when the tree is blurred
  // (editor focused) and under transparent mode. Hover uses var(--accent), which scales
  // with --surface-opacity and washes out; give selection a fixed alpha off accent-solid
  // so it keeps a visible floor and a clear edge over hover, while still letting the
  // wallpaper through rather than reading as a solid block.
  '--trees-selected-bg-override': 'color-mix(in oklch, var(--accent-solid) 60%, transparent)',
  '--trees-border-color-override': 'var(--border)',
  '--trees-fg-override': 'var(--foreground)',
  // Per level the tree indents level-gap + row-gap + icon-width/2 (~18px at
  // compact density); level-gap is the only component not shared with in-row
  // spacing, so it is the one safe place to reclaim width in deep trees.
  '--trees-level-gap-override': '2px',
  height: '100%',
} as CSSProperties

const treeUnsafeCss = `
  :host {
    color: var(--foreground);
    background: transparent;
    /* Experiment: the UI sans instead of the app's mono. Mono glyphs are
       uniform-width, so long file names run ~30% wider and lose word shape;
       this is most of why the VS Code explorer reads denser. No sans token
       exists yet — promote this stack to a token if the experiment sticks. */
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 12.5px;
  }

  button[data-type='item'] {
    border-radius: 6px;
  }
`
