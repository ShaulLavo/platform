import type {
  FileTree as PierreFileTreeModel,
  FileTreeDropContext,
  FileTreeDropResult,
  FileTreeRowDecorationContext,
  GitStatusEntry,
} from '@pierre/trees'
import { FileTree as PierreFileTree, useFileTree } from '@pierre/trees/react'
import { CircleNotchIcon, WarningCircleIcon } from '@phosphor-icons/react'

import {
  loadExpandedDirectories,
  syncTreePaneState,
  visibleTreeItemCount,
} from '@/components/workspace/tree-pane-state'
import { useFileTreeIntentPrefetch } from '@/components/workspace/use-file-tree-intent-prefetch'
import { useEditorCommands } from '@/features/editor/state/editor-commands'
import { useEditorWorkspaceState } from '@/features/editor/state/editor-workspace-state'
import { useWorkspaceFocus } from '@/components/workspace/workspace-focus-state'
import { reportError, toClientError } from '@/lib/client-error-taxonomy'
import { fileTreeIconsForPaths } from '@/lib/file-icons'
import type { TreeEntry } from '@/lib/file-system-types'
import { isFileEntry } from '@/lib/file-system-types'
import { movePath } from '@/lib/file-server'
import type { LoadState } from '@/lib/load-state'
import { canonicalTreePath } from '@/lib/path-formatters'
import { fileSystemKeys, gitKeys } from '@/lib/query-keys'
import {
  entryForTreePath,
  type DirectoryLoadOptions,
  moveTreeModelPaths,
  treePathForSelectedPath,
  type TreePathMove,
  type TreeModel,
} from '@/lib/tree-model'
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
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

export const TreePane = memo(function TreePane({
  gitStatus,
  onVisibleItemCountChange,
  onLoadDirectory,
  onPrefetchDirectory,
  rootPath,
  state,
}: {
  gitStatus?: readonly GitStatusEntry[]
  onVisibleItemCountChange?: (count: number) => void
  onLoadDirectory: (entry: TreeEntry, treePath: string, options?: DirectoryLoadOptions) => void
  onPrefetchDirectory: (entry: TreeEntry, treePath: string) => void
  rootPath: string
  state: LoadState<TreeModel>
}) {
  if (state.status === 'loading') return <TreeStatus label='Loading folder' />
  if (state.status === 'error') {
    return <TreeStatus icon={<WarningCircleIcon className='size-4' />} label={state.message} />
  }
  if (state.status !== 'ready') return <TreeStatus label='No files' />
  if (state.data.paths.length === 0) return <TreeStatus label='No files' />

  return (
    <ReadyTreePane
      gitStatus={gitStatus}
      model={state.data}
      rootPath={rootPath}
      onVisibleItemCountChange={onVisibleItemCountChange}
      onLoadDirectory={onLoadDirectory}
      onPrefetchDirectory={onPrefetchDirectory}
    />
  )
})

function ReadyTreePane({
  gitStatus,
  model,
  onVisibleItemCountChange,
  onLoadDirectory,
  onPrefetchDirectory,
  rootPath,
}: {
  gitStatus?: readonly GitStatusEntry[]
  model: TreeModel
  onVisibleItemCountChange?: (count: number) => void
  onLoadDirectory: (entry: TreeEntry, treePath: string, options?: DirectoryLoadOptions) => void
  onPrefetchDirectory: (entry: TreeEntry, treePath: string) => void
  rootPath: string
}) {
  const selectedFilePath = useEditorWorkspaceState((store) => store.selectedFilePath)
  const { selectFile } = useEditorCommands()
  const setFocusArea = useWorkspaceFocus((store) => store.setFocusArea)
  const queryClient = useQueryClient()
  const expandedDirectoryPathsRef = useRef<ReadonlySet<string> | undefined>(undefined)
  const modelRef = useRef(model)
  const movePendingRef = useRef(false)
  const pathsRef = useRef(model.paths)
  const treeRef = useRef<PierreFileTreeModel | null>(null)
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
      invalidateMoveQueries(queryClient)
    },
  })
  const loadExpandedDirectoriesForCurrentModel = useEffectEvent(
    (currentTree: PierreFileTreeModel) => {
      expandedDirectoryPathsRef.current = loadExpandedDirectories(
        currentTree,
        model,
        onLoadDirectory,
        expandedDirectoryPathsRef.current,
      )
    },
  )
  const publishVisibleItemCount = useEffectEvent((currentTree: PierreFileTreeModel) => {
    onVisibleItemCountChange?.(visibleTreeItemCount(currentTree, modelRef.current))
  })

  const initialSelectedPaths = selectedFilePath
    ? [treePathForSelectedPath(rootPath, selectedFilePath)]
    : undefined
  const { model: tree } = useFileTree({
    density: 'compact',
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
    renderRowDecoration: (context) => treeRowDecoration(modelRef.current, context),
    unsafeCSS: treeUnsafeCss,
    onSelectionChange: (selectedPaths) => {
      const entry = entryForTreePath(modelRef.current, selectedPaths[0])
      if (!entry || !isFileEntry(entry)) return

      selectFile(entry.path)
    },
  })

  useFileTreeIntentPrefetch({
    model,
    onPrefetchDirectory,
    tree,
  })

  useLayoutEffect(() => {
    modelRef.current = model
    treeRef.current = tree
  }, [model, tree])

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
    publishVisibleItemCount(tree)
  }, [model, rootPath, selectedFilePath, tree])

  useEffect(() => {
    return tree.subscribe(() => {
      loadExpandedDirectoriesForCurrentModel(tree)
      publishVisibleItemCount(tree)
    })
  }, [tree])

  return (
    <div
      className='h-full'
      onFocusCapture={() => setFocusArea('file-tree')}
      onPointerDownCapture={() => setFocusArea('file-tree')}
    >
      <PierreFileTree
        aria-label='Folder tree'
        className='block h-full'
        model={tree}
        style={treeStyle}
      />
    </div>
  )
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
    await movePath(
      workspacePathForTreePath(request.rootPath, move.fromTreePath),
      workspacePathForTreePath(request.rootPath, move.toTreePath),
    )
  }
}

function invalidateMoveQueries(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: gitKeys.all })
  void queryClient.invalidateQueries({ queryKey: fileSystemKeys.trees() })
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

function workspacePathForTreePath(rootPath: string, treePath: string) {
  const canonicalRootPath = canonicalTreePath(rootPath)
  const canonicalPath = canonicalTreePath(treePath)
  if (!canonicalRootPath) return canonicalPath
  if (!canonicalPath) return canonicalRootPath

  return `${canonicalRootPath}/${canonicalPath}`
}

const treeStyle = {
  '--trees-bg-override': 'var(--background)',
  '--trees-selected-bg-override': 'var(--accent)',
  '--trees-border-color-override': 'var(--border)',
  '--trees-fg-override': 'var(--foreground)',
  height: '100%',
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
