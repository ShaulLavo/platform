import { Debouncer } from '@tanstack/react-pacer/debouncer'
import { useEffect } from 'react'

import {
  type EditorWorkspaceStore,
  type EditorWorkspaceStoreApi,
  useEditorWorkspaceStoreApi,
} from '@/features/editor/state/editor-workspace-state'
import {
  cachedSearchBufferState,
  type SearchBufferStore,
  type SearchBufferStoreApi,
  useSearchBufferStoreApi,
} from '@/features/search/search-buffer-state'
import {
  type CachedWorkspaceState,
  type WorkspaceCacheWriteState,
  writeWorkspaceCache,
} from '@/lib/workspace-cache'

const WORKSPACE_CACHE_WRITE_DEBOUNCE_MS = 350

type WorkspaceCacheSnapshot = Pick<
  CachedWorkspaceState,
  'diffViewMode' | 'editorHistory' | 'recentlyClosedEditorPaths' | 'rootFolder' | 'workspaceLayout'
>

type WorkspaceCachePersistenceOptions = {
  debounceMs?: number
  searchStore: SearchBufferStoreApi
  workspaceStore: EditorWorkspaceStoreApi
  writeCache?: (state: WorkspaceCacheWriteState) => void
}

export function useWorkspaceCachePersistence() {
  const workspaceStore = useEditorWorkspaceStoreApi()
  const searchStore = useSearchBufferStoreApi()

  useEffect(
    () =>
      subscribeWorkspaceCachePersistence({
        searchStore,
        workspaceStore,
      }),
    [searchStore, workspaceStore],
  )
}

export function subscribeWorkspaceCachePersistence({
  debounceMs = WORKSPACE_CACHE_WRITE_DEBOUNCE_MS,
  searchStore,
  workspaceStore,
  writeCache = writeWorkspaceCache,
}: WorkspaceCachePersistenceOptions) {
  let workspaceSnapshot = cachedWorkspaceState(workspaceStore.getState())
  let searchSnapshot = cachedSearchBufferState(searchStore.getState().active)

  const pendingWrite = new Debouncer(
    () =>
      writeCache(workspaceCacheStateForStores(workspaceStore.getState(), searchStore.getState())),
    { wait: debounceMs },
  )

  const unsubscribeWorkspace = workspaceStore.subscribe((state) => {
    const nextSnapshot = cachedWorkspaceState(state)
    if (cachedWorkspaceStatesEqual(workspaceSnapshot, nextSnapshot)) return

    workspaceSnapshot = nextSnapshot
    pendingWrite.maybeExecute()
  })
  const unsubscribeSearch = searchStore.subscribe((state) => {
    const nextSnapshot = cachedSearchBufferState(state.active)
    if (cachedSearchBufferStatesEqual(searchSnapshot, nextSnapshot)) return

    searchSnapshot = nextSnapshot
    pendingWrite.maybeExecute()
  })
  const removeLifecycleFlush = addLifecycleFlush(pendingWrite.flush)

  return () => {
    unsubscribeWorkspace()
    unsubscribeSearch()
    removeLifecycleFlush()
    pendingWrite.flush()
  }
}

function workspaceCacheStateForStores(
  workspaceState: EditorWorkspaceStore,
  searchState: SearchBufferStore,
): WorkspaceCacheWriteState {
  return {
    ...cachedWorkspaceState(workspaceState),
    searchBuffer: cachedSearchBufferState(searchState.active),
  }
}

function cachedWorkspaceState(state: EditorWorkspaceStore): WorkspaceCacheSnapshot {
  return {
    diffViewMode: state.diffViewMode,
    editorHistory: state.editorHistory,
    recentlyClosedEditorPaths: state.recentlyClosedEditorPaths,
    rootFolder: state.rootFolder,
    workspaceLayout: state.workspaceLayout,
  }
}

function cachedWorkspaceStatesEqual(left: WorkspaceCacheSnapshot, right: WorkspaceCacheSnapshot) {
  return (
    left.diffViewMode === right.diffViewMode &&
    left.rootFolder === right.rootFolder &&
    left.workspaceLayout === right.workspaceLayout &&
    readonlyArraysEqual(left.editorHistory, right.editorHistory) &&
    readonlyArraysEqual(left.recentlyClosedEditorPaths, right.recentlyClosedEditorPaths)
  )
}

function cachedSearchBufferStatesEqual(
  left: WorkspaceCacheWriteState['searchBuffer'],
  right: WorkspaceCacheWriteState['searchBuffer'],
) {
  if (left === right) return true
  if (!left || !right) return false

  return (
    left.activeResultId === right.activeResultId &&
    left.caseSensitive === right.caseSensitive &&
    left.excludeGlobText === right.excludeGlobText &&
    left.filtersVisible === right.filtersVisible &&
    left.includeGlobText === right.includeGlobText &&
    left.matchMode === right.matchMode &&
    left.query === right.query &&
    left.replaceText === right.replaceText &&
    left.replaceVisible === right.replaceVisible &&
    left.resultsQuery === right.resultsQuery &&
    left.resultsSearchQuery === right.resultsSearchQuery &&
    left.rootPath === right.rootPath &&
    left.totalCount === right.totalCount &&
    left.truncated === right.truncated &&
    left.wholeWord === right.wholeWord &&
    readonlyArraysEqual(left.collapsedPaths, right.collapsedPaths) &&
    readonlyArraysEqual(left.queryHistory, right.queryHistory) &&
    readonlyArraysEqual(left.replaceHistory, right.replaceHistory)
  )
}

function readonlyArraysEqual<T>(left: readonly T[], right: readonly T[]) {
  if (left === right) return true
  if (left.length !== right.length) return false

  return left.every((item, index) => Object.is(item, right[index]))
}

function addLifecycleFlush(flush: () => void) {
  if (typeof window === 'undefined') return noop

  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', flushHiddenDocument)

  function flushHiddenDocument() {
    if (document.visibilityState !== 'hidden') return

    flush()
  }

  return () => {
    window.removeEventListener('pagehide', flush)
    document.removeEventListener('visibilitychange', flushHiddenDocument)
  }
}

function noop() {}
