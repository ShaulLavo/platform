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
  type WorkspaceCacheState,
  writeWorkspaceCache,
} from '@/lib/workspace-cache'

const WORKSPACE_CACHE_WRITE_DEBOUNCE_MS = 350

type CacheWriteTimer = ReturnType<typeof setTimeout>

type WorkspaceCachePersistenceOptions = {
  clearTimeout?: (timer: CacheWriteTimer) => void
  debounceMs?: number
  searchStore: SearchBufferStoreApi
  setTimeout?: (callback: () => void, delay: number) => CacheWriteTimer
  workspaceStore: EditorWorkspaceStoreApi
  writeCache?: (state: WorkspaceCacheState) => void
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
  clearTimeout = globalThis.clearTimeout,
  debounceMs = WORKSPACE_CACHE_WRITE_DEBOUNCE_MS,
  searchStore,
  setTimeout = globalThis.setTimeout,
  workspaceStore,
  writeCache = writeWorkspaceCache,
}: WorkspaceCachePersistenceOptions) {
  let disposed = false
  let timer: CacheWriteTimer | null = null
  let workspaceSnapshot = cachedWorkspaceState(workspaceStore.getState())
  let searchSnapshot = cachedSearchBufferState(searchStore.getState().active)

  function persistNow() {
    if (disposed) return

    writeCache(workspaceCacheStateForStores(workspaceStore.getState(), searchStore.getState()))
  }

  function scheduleWrite() {
    if (disposed) return
    if (timer !== null) clearTimeout(timer)

    timer = setTimeout(() => {
      timer = null
      persistNow()
    }, debounceMs)
  }

  function flushPendingWrite() {
    if (timer === null) return

    clearTimeout(timer)
    timer = null
    persistNow()
  }

  const unsubscribeWorkspace = workspaceStore.subscribe((state) => {
    const nextSnapshot = cachedWorkspaceState(state)
    if (cachedWorkspaceStatesEqual(workspaceSnapshot, nextSnapshot)) return

    workspaceSnapshot = nextSnapshot
    scheduleWrite()
  })
  const unsubscribeSearch = searchStore.subscribe((state) => {
    const nextSnapshot = cachedSearchBufferState(state.active)
    if (cachedSearchBufferStatesEqual(searchSnapshot, nextSnapshot)) return

    searchSnapshot = nextSnapshot
    scheduleWrite()
  })
  const removeLifecycleFlush = addLifecycleFlush(flushPendingWrite)

  return () => {
    unsubscribeWorkspace()
    unsubscribeSearch()
    removeLifecycleFlush()
    flushPendingWrite()
    disposed = true
  }
}

export function workspaceCacheStateForStores(
  workspaceState: EditorWorkspaceStore,
  searchState: SearchBufferStore,
): WorkspaceCacheState {
  return {
    ...cachedWorkspaceState(workspaceState),
    searchBuffer: cachedSearchBufferState(searchState.active),
  }
}

function cachedWorkspaceState(state: EditorWorkspaceStore): CachedWorkspaceState {
  return {
    diffViewMode: state.diffViewMode,
    editorHistory: state.editorHistory,
    editorPaneLayout: state.editorPaneLayout,
    openFilePaths: state.openFilePaths,
    recentlyClosedEditorPaths: state.recentlyClosedEditorPaths,
    rootFolder: state.rootFolder,
    selectedFilePath: state.selectedFilePath,
    workspaceLayout: state.workspaceLayout,
  }
}

function cachedWorkspaceStatesEqual(left: CachedWorkspaceState, right: CachedWorkspaceState) {
  return (
    left.diffViewMode === right.diffViewMode &&
    left.editorPaneLayout === right.editorPaneLayout &&
    left.rootFolder === right.rootFolder &&
    left.selectedFilePath === right.selectedFilePath &&
    left.workspaceLayout === right.workspaceLayout &&
    readonlyArraysEqual(left.editorHistory, right.editorHistory) &&
    readonlyArraysEqual(left.openFilePaths, right.openFilePaths) &&
    readonlyArraysEqual(left.recentlyClosedEditorPaths, right.recentlyClosedEditorPaths)
  )
}

function cachedSearchBufferStatesEqual(
  left: WorkspaceCacheState['searchBuffer'],
  right: WorkspaceCacheState['searchBuffer'],
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
