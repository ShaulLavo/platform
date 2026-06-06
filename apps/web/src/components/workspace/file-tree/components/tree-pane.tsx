import type {
  FileTree as PierreFileTreeModel,
  FileTreeDropContext,
  FileTreeDropResult,
  FileTreeRowDecorationContext,
  GitStatusEntry,
} from '@pierre/trees'
import { FileTree as PierreFileTree, useFileTree, useFileTreeSelection } from '@pierre/trees/react'
import { CircleNotchIcon, WarningCircleIcon } from '@phosphor-icons/react'

import {
  loadExpandedDirectories,
  syncTreePaneState,
  visibleTreeItemCount,
} from '@/components/workspace/file-tree/utils/tree-pane-state'
import { selectedFileEntryForTreeSelection } from '@/components/workspace/file-tree/utils/tree-selection'
import { useFileTreeIntentPrefetch } from '@/components/workspace/file-tree/hooks/use-file-tree-intent-prefetch'
import { useEditorCommands } from '@/features/editor/state/editor-commands'
import { useEditorWorkspaceState } from '@/features/editor/state/editor-workspace-state'
import { useFocus } from '@/components/workspace/focus/providers/focus-state'
import { reportError, toClientError } from '@/lib/client-error-taxonomy'
import { fileTreeIconsForPaths } from '@/lib/file-icons'
import type { TreeEntry } from '@/lib/file-system-types'
import { renamePath } from '@/lib/file-server'
import type { LoadState } from '@/lib/load-state'
import { canonicalTreePath } from '@/lib/path-formatters'
import { fileSystemKeys, gitKeys } from '@/lib/query-keys'
import { log } from '@/lib/client-logging'
import {
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

export const TreePane = memo(
  ({
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
  }) => {
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
  },
)

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
  const setFocusArea = useFocus((store) => store.setFocusArea)
  const queryClient = useQueryClient()
  const expandedDirectoryPathsRef = useRef<ReadonlySet<string> | undefined>(undefined)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const modelRef = useRef(model)
  const movePendingRef = useRef(false)
  const pathsRef = useRef(model.paths)
  const selectionSyncRef = useRef<SelectionSyncState>({
    rootPath: null,
    selectedFilePath: undefined,
  })
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
  })
  const selectedTreePaths = useFileTreeSelection(tree)

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
    openSelectedTreeFile({
      model: modelRef.current,
      selectedFilePath,
      selectedPaths: selectedTreePaths,
      selectFile,
    })
  }, [selectFile, selectedFilePath, selectedTreePaths])

  useEffect(() => {
    const selectionSync = selectionSyncPlan({
      rootPath,
      selectedFilePath,
      state: selectionSyncRef.current,
      tree,
    })
    const previousPathCount = pathsRef.current.length
    const selectedPathsBefore = tree.getSelectedPaths()
    pathsRef.current = syncTreePaneState({
      loadExpandedDirectoriesForCurrentModel,
      model,
      previousPaths: pathsRef.current,
      rootPath,
      syncSelection: selectionSync.shouldSync,
      selectedFilePath,
      tree,
    })
    const selectedPathsAfter = tree.getSelectedPaths()
    updateSelectionSyncState(selectionSyncRef.current, selectionSync, rootPath, selectedFilePath)
    logTreeSync({
      model,
      previousPathCount,
      rootPath,
      selectedFilePath,
      selectedPathsAfter,
      selectedPathsBefore,
      selectionSync,
    })
    publishVisibleItemCount(tree)
  }, [model, rootPath, selectedFilePath, tree])

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      logTreePointerEvent(event, containerRef.current, treeRef.current)
    }

    function handleClick(event: MouseEvent) {
      logTreePointerEvent(event, containerRef.current, treeRef.current)
      queuePostClickTreeSelectionLog(event, containerRef.current, treeRef.current)
    }

    document.addEventListener('click', handleClick, true)
    document.addEventListener('pointerdown', handlePointerDown, true)

    return () => {
      document.removeEventListener('click', handleClick, true)
      document.removeEventListener('pointerdown', handlePointerDown, true)
    }
  }, [])

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
      ref={containerRef}
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
  log.info({
    action: 'file-tree.selection.change',
    area: 'file-tree',
    resolvedPath: entry?.path ?? null,
    selectedFilePath,
    selectedCount: selectedPaths.length,
    selectedPaths,
  })
  if (!entry) return
  if (entry.path === selectedFilePath) return

  log.info({
    action: 'file-tree.selection.open_file',
    area: 'file-tree',
    path: entry.path,
    selectedPaths,
  })
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
  tree: PierreFileTreeModel
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
  tree: PierreFileTreeModel,
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

function logTreeSync({
  model,
  previousPathCount,
  rootPath,
  selectedFilePath,
  selectedPathsAfter,
  selectedPathsBefore,
  selectionSync,
}: {
  model: TreeModel
  previousPathCount: number
  rootPath: string
  selectedFilePath: string | null
  selectedPathsAfter: readonly string[]
  selectedPathsBefore: readonly string[]
  selectionSync: SelectionSyncPlan
}) {
  if (
    !shouldLogTreeSync(
      model,
      previousPathCount,
      selectedPathsBefore,
      selectedPathsAfter,
      selectionSync,
    )
  ) {
    return
  }

  log.info({
    action: 'file-tree.sync',
    area: 'file-tree',
    modelPathCount: model.paths.length,
    previousPathCount,
    rootPath,
    selectedFilePath,
    selectedPathsAfter,
    selectedPathsBefore,
    selectionSyncCanComplete: selectionSync.canComplete,
    selectionSyncReason: selectionSync.reason,
    selectionSyncRequested: selectionSync.shouldSync,
    selectionSyncTreePath: selectionSync.treePath,
  })
}

function logTreePointerEvent(
  event: MouseEvent | PointerEvent,
  container: HTMLDivElement | null,
  tree: PierreFileTreeModel | null,
) {
  if (!container) return
  if (!pointIsInsideElement(event, container)) return

  const eventItem = eventTreeItem(event)
  const geometryItem = geometryTreeItem(event, container)
  const item = eventItem ?? geometryItem
  log.info({
    action: 'file-tree.pointer',
    area: 'file-tree',
    button: mouseEventButton(event),
    eventType: event.type,
    eventItemPath: eventItem?.path ?? null,
    eventItemType: eventItem?.type ?? null,
    geometryItemPath: geometryItem?.path ?? null,
    geometryItemType: geometryItem?.type ?? null,
    itemPath: item?.path ?? null,
    itemType: item?.type ?? null,
    pierreCanResolveItem: item?.path ? Boolean(tree?.getItem(item.path)) : null,
    selectedPaths: tree?.getSelectedPaths() ?? [],
    target: eventTargetSummary(event.target),
    targetPath: eventTargetPathSummary(event, 16),
  })
}

function queuePostClickTreeSelectionLog(
  event: MouseEvent,
  container: HTMLDivElement | null,
  tree: PierreFileTreeModel | null,
) {
  if (!container) return
  if (!tree) return
  if (!pointIsInsideElement(event, container)) return

  const eventItem = eventTreeItem(event)
  const geometryItem = geometryTreeItem(event, container)
  const item = eventItem ?? geometryItem
  window.setTimeout(() => {
    log.info({
      action: 'file-tree.pointer.after_click',
      area: 'file-tree',
      eventItemPath: eventItem?.path ?? null,
      geometryItemPath: geometryItem?.path ?? null,
      itemPath: item?.path ?? null,
      pierreCanResolveItem: item?.path ? Boolean(tree.getItem(item.path)) : null,
      selectedPaths: tree.getSelectedPaths(),
    })
  }, 0)
}

function pointIsInsideElement(event: MouseEvent | PointerEvent, element: HTMLElement) {
  const rect = element.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return false
  if (event.clientX < rect.left || event.clientX > rect.right) return false

  return event.clientY >= rect.top && event.clientY <= rect.bottom
}

function mouseEventButton(event: MouseEvent | PointerEvent) {
  if (typeof event.button !== 'number') return null

  return event.button
}

function eventTreeItem(event: MouseEvent | PointerEvent) {
  for (const target of event.composedPath()) {
    const item = treeItemForEventTarget(target)
    if (item) return item
  }

  return null
}

function geometryTreeItem(event: MouseEvent | PointerEvent, container: HTMLElement) {
  const shadowRoot = container.querySelector('file-tree-container')?.shadowRoot
  if (!shadowRoot) return null

  const elements = Array.from(
    shadowRoot.querySelectorAll<HTMLElement>('[data-type="item"][data-item-path]'),
  )
  for (const element of elements.toReversed()) {
    if (!pointIsInsideElement(event, element)) continue

    return {
      path: element.dataset.itemPath ?? null,
      type: element.dataset.itemType ?? null,
    }
  }

  return null
}

function treeItemForEventTarget(target: EventTarget | null) {
  const element = eventPathElement(target)
  if (!element) return null
  if (element.dataset.type !== 'item') return null

  return {
    path: element.dataset.itemPath ?? null,
    type: element.dataset.itemType ?? null,
  }
}

function eventTargetPathSummary(event: MouseEvent | PointerEvent, limit: number) {
  return event.composedPath().flatMap(eventTargetSummary).slice(0, limit)
}

function eventTargetSummary(target: EventTarget | null) {
  const element = eventPathElement(target)
  if (!element) return []

  return [
    {
      dataItemPath: element.dataset.itemPath ?? null,
      dataItemType: element.dataset.itemType ?? null,
      dataType: element.dataset.type ?? null,
      tagName: element.tagName.toLowerCase(),
    },
  ]
}

function eventPathElement(target: EventTarget | null) {
  return target instanceof HTMLElement || target instanceof SVGElement ? target : null
}

function shouldLogTreeSync(
  model: TreeModel,
  previousPathCount: number,
  selectedPathsBefore: readonly string[],
  selectedPathsAfter: readonly string[],
  selectionSync: SelectionSyncPlan,
) {
  if (selectionSync.shouldSync) return true
  if (previousPathCount !== model.paths.length) return true

  return !stringArraysEqual(selectedPathsBefore, selectedPathsAfter)
}

function stringArraysEqual(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false

  return left.every((value, index) => value === right[index])
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
