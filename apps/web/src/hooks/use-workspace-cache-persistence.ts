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
  let workspaceKey = workspacePersistenceKey(workspaceStore.getState())
  let searchKey = searchPersistenceKey(searchStore.getState())

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
    const nextKey = workspacePersistenceKey(state)
    if (nextKey === workspaceKey) return

    workspaceKey = nextKey
    scheduleWrite()
  })
  const unsubscribeSearch = searchStore.subscribe((state) => {
    const nextKey = searchPersistenceKey(state)
    if (nextKey === searchKey) return

    searchKey = nextKey
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
    gitPanelOpen: state.gitPanelOpen,
    openFilePaths: state.openFilePaths,
    recentlyClosedEditorPaths: state.recentlyClosedEditorPaths,
    rootFolder: state.rootFolder,
    selectedFilePath: state.selectedFilePath,
    sidebarVisible: state.sidebarVisible,
    workspacePanelTab: state.workspacePanelTab,
  }
}

function workspacePersistenceKey(state: EditorWorkspaceStore) {
  return JSON.stringify(cachedWorkspaceState(state))
}

function searchPersistenceKey(state: SearchBufferStore) {
  return JSON.stringify(cachedSearchBufferState(state.active))
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
