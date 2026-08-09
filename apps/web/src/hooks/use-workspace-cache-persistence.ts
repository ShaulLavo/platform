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
  type CachedSearchBufferState,
  type CachedWorkspaceState,
  writeChatModePanelsCache,
  writeDiffViewModeCache,
  writeEditorHistoryCache,
  writeRecentlyClosedEditorPathsCache,
  writeRootFolderCache,
  writeSearchBufferCache,
  writeUiModeCache,
  writeWorkbenchLayoutCache,
  writeWorkbenchPanelsCache,
} from '@/lib/workspace-cache'

const WORKSPACE_CACHE_WRITE_DEBOUNCE_MS = 350

export type WorkspaceCacheWriters = {
  chatModePanels: typeof writeChatModePanelsCache
  diffViewMode: typeof writeDiffViewModeCache
  editorHistory: typeof writeEditorHistoryCache
  recentlyClosedEditorPaths: typeof writeRecentlyClosedEditorPathsCache
  rootFolder: typeof writeRootFolderCache
  searchBuffer: typeof writeSearchBufferCache
  uiMode: typeof writeUiModeCache
  workbenchLayout: typeof writeWorkbenchLayoutCache
  workbenchPanels: typeof writeWorkbenchPanelsCache
}

type WorkspaceCachePersistenceOptions = {
  cacheWriters?: WorkspaceCacheWriters
  debounceMs?: number
  searchStore: SearchBufferStoreApi
  workspaceStore: EditorWorkspaceStoreApi
}

const WORKSPACE_CACHE_WRITERS = {
  chatModePanels: writeChatModePanelsCache,
  diffViewMode: writeDiffViewModeCache,
  editorHistory: writeEditorHistoryCache,
  recentlyClosedEditorPaths: writeRecentlyClosedEditorPathsCache,
  rootFolder: writeRootFolderCache,
  searchBuffer: writeSearchBufferCache,
  uiMode: writeUiModeCache,
  workbenchLayout: writeWorkbenchLayoutCache,
  workbenchPanels: writeWorkbenchPanelsCache,
} satisfies WorkspaceCacheWriters

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
  cacheWriters = WORKSPACE_CACHE_WRITERS,
  debounceMs = WORKSPACE_CACHE_WRITE_DEBOUNCE_MS,
  searchStore,
  workspaceStore,
}: WorkspaceCachePersistenceOptions) {
  const subscriptions = workspaceCacheSubscriptions({
    cacheWriters,
    debounceMs,
    searchStore,
    workspaceStore,
  })
  const removeLifecycleFlush = addLifecycleFlush(() => flushCacheSubscriptions(subscriptions))

  return () => {
    unsubscribeCacheSubscriptions(subscriptions)
    removeLifecycleFlush()
    flushCacheSubscriptions(subscriptions)
  }
}

type EqualityFn<T> = (left: T, right: T) => boolean

type SelectorStore<TState> = {
  getState: () => TState
  subscribe: {
    <TValue>(
      selector: (state: TState) => TValue,
      listener: (selectedState: TValue, previousSelectedState: TValue) => void,
      options?: {
        equalityFn?: EqualityFn<TValue>
        fireImmediately?: boolean
      },
    ): () => void
  }
}

type CacheSubscription = {
  flush: () => void
  unsubscribe: () => void
}

type CacheEntrySubscriptionOptions<TState, TValue> = {
  debounceMs: number
  equalityFn?: EqualityFn<TValue>
  select: (state: TState) => TValue
  store: SelectorStore<TState>
  write: (value: TValue) => void
}

type WorkspacePathsCacheValue = {
  paths: readonly string[]
  rootFolder: CachedWorkspaceState['rootFolder']
}

type WorkbenchPanelsCacheValue = {
  rootFolder: CachedWorkspaceState['rootFolder']
  workbenchPanels: CachedWorkspaceState['workbenchPanels']
}

type SearchBufferCacheValue = {
  rootFolder: CachedWorkspaceState['rootFolder']
  searchBuffer: CachedSearchBufferState | null
}

type WorkspaceCacheSubscriptionOptions = {
  cacheWriters: WorkspaceCacheWriters
  debounceMs: number
  searchStore: SearchBufferStoreApi
  workspaceStore: EditorWorkspaceStoreApi
}

function workspaceCacheSubscriptions({
  cacheWriters,
  debounceMs,
  searchStore,
  workspaceStore,
}: WorkspaceCacheSubscriptionOptions): CacheSubscription[] {
  return [
    subscribeCacheEntry({
      debounceMs,
      select: (state) => state.chatModePanels,
      store: workspaceStore,
      write: cacheWriters.chatModePanels,
    }),
    subscribeCacheEntry({
      debounceMs,
      select: (state) => state.diffViewMode,
      store: workspaceStore,
      write: cacheWriters.diffViewMode,
    }),
    subscribeCacheEntry({
      debounceMs,
      select: (state) => state.uiMode,
      store: workspaceStore,
      write: cacheWriters.uiMode,
    }),
    subscribeCacheEntry({
      debounceMs,
      select: (state) => state.workbenchLayout,
      store: workspaceStore,
      write: cacheWriters.workbenchLayout,
    }),
    subscribeCacheEntry({
      debounceMs,
      equalityFn: workspacePathsCacheValuesEqual,
      select: editorHistoryCacheValue,
      store: workspaceStore,
      write: (value) => cacheWriters.editorHistory(value.rootFolder, value.paths),
    }),
    subscribeCacheEntry({
      debounceMs,
      equalityFn: workspacePathsCacheValuesEqual,
      select: recentlyClosedEditorPathsCacheValue,
      store: workspaceStore,
      write: (value) => cacheWriters.recentlyClosedEditorPaths(value.rootFolder, value.paths),
    }),
    subscribeCacheEntry({
      debounceMs,
      select: (state) => state.rootFolder,
      store: workspaceStore,
      write: cacheWriters.rootFolder,
    }),
    subscribeCacheEntry({
      debounceMs,
      equalityFn: workbenchPanelsCacheValuesEqual,
      select: workbenchPanelsCacheValue,
      store: workspaceStore,
      write: (value) => cacheWriters.workbenchPanels(value.rootFolder, value.workbenchPanels),
    }),
    subscribeSearchBufferCacheEntry({
      cacheWriters,
      debounceMs,
      searchStore,
      workspaceStore,
    }),
  ]
}

function subscribeCacheEntry<TState, TValue>({
  debounceMs,
  equalityFn = Object.is,
  select,
  store,
  write,
}: CacheEntrySubscriptionOptions<TState, TValue>): CacheSubscription {
  let value = select(store.getState())
  const pendingWrite = new Debouncer(() => write(value), { wait: debounceMs })
  const unsubscribe = store.subscribe(
    select,
    (nextValue) => {
      value = nextValue
      pendingWrite.maybeExecute()
    },
    { equalityFn },
  )

  return {
    flush: () => pendingWrite.flush(),
    unsubscribe,
  }
}

function subscribeSearchBufferCacheEntry({
  cacheWriters,
  debounceMs,
  searchStore,
  workspaceStore,
}: WorkspaceCacheSubscriptionOptions): CacheSubscription {
  let value = searchBufferCacheValue(workspaceStore.getState(), searchStore.getState())
  const pendingWrite = new Debouncer(
    () => cacheWriters.searchBuffer(value.rootFolder, value.searchBuffer),
    { wait: debounceMs },
  )
  const unsubscribeRootFolder = workspaceStore.subscribe(
    (state) => state.rootFolder,
    (rootFolder) => {
      value = { ...value, rootFolder }
      pendingWrite.maybeExecute()
    },
  )
  const unsubscribeSearchBuffer = searchStore.subscribe(
    (state) => cachedSearchBufferState(state.active),
    (searchBuffer) => {
      value = { rootFolder: workspaceStore.getState().rootFolder, searchBuffer }
      pendingWrite.maybeExecute()
    },
    { equalityFn: cachedSearchBufferStatesEqual },
  )

  return {
    flush: () => pendingWrite.flush(),
    unsubscribe: () => {
      unsubscribeRootFolder()
      unsubscribeSearchBuffer()
    },
  }
}

function editorHistoryCacheValue(state: EditorWorkspaceStore): WorkspacePathsCacheValue {
  return {
    paths: state.editorHistory,
    rootFolder: state.rootFolder,
  }
}

function recentlyClosedEditorPathsCacheValue(
  state: EditorWorkspaceStore,
): WorkspacePathsCacheValue {
  return {
    paths: state.recentlyClosedEditorPaths,
    rootFolder: state.rootFolder,
  }
}

function workbenchPanelsCacheValue(state: EditorWorkspaceStore): WorkbenchPanelsCacheValue {
  return {
    rootFolder: state.rootFolder,
    workbenchPanels: state.workbenchPanels,
  }
}

function searchBufferCacheValue(
  workspaceState: EditorWorkspaceStore,
  searchState: SearchBufferStore,
): SearchBufferCacheValue {
  return {
    rootFolder: workspaceState.rootFolder,
    searchBuffer: cachedSearchBufferState(searchState.active),
  }
}

function workspacePathsCacheValuesEqual(
  left: WorkspacePathsCacheValue,
  right: WorkspacePathsCacheValue,
) {
  return left.rootFolder === right.rootFolder && readonlyArraysEqual(left.paths, right.paths)
}

function workbenchPanelsCacheValuesEqual(
  left: WorkbenchPanelsCacheValue,
  right: WorkbenchPanelsCacheValue,
) {
  return left.rootFolder === right.rootFolder && left.workbenchPanels === right.workbenchPanels
}

function cachedSearchBufferStatesEqual(
  left: CachedSearchBufferState | null,
  right: CachedSearchBufferState | null,
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

function flushCacheSubscriptions(subscriptions: readonly CacheSubscription[]) {
  for (const subscription of subscriptions) subscription.flush()
}

function unsubscribeCacheSubscriptions(subscriptions: readonly CacheSubscription[]) {
  for (const subscription of subscriptions) subscription.unsubscribe()
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
