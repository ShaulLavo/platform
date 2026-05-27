import type {
  WorkspaceSearchEvent,
  WorkspaceSearchMatch,
  WorkspaceSearchMatchMode,
  WorkspaceSearchQuery,
} from '@workspace/contracts'
import { workspaceSearchGlobPatterns } from '@workspace/contracts'
import { useCallback, useEffect, useState } from 'react'

import {
  type CachedEditorDocument,
  useEditorDocumentStoreApi,
  useEditorDocumentState,
} from '@/features/editor/state/editor-document-state'
import {
  type SearchBufferStoreApi,
  type SearchBufferSnapshot,
  sameWorkspaceSearchQuery,
  searchGroupsForSnapshot,
  type SearchBufferOptionPatch,
  useSearchBufferState,
  useSearchBufferStoreApi,
} from '@/features/search/search-buffer-state'
import {
  CompositeSearchProvider,
  DiskSearchProvider,
  OpenBufferSearchProvider,
  type OpenBufferSearchDocument,
  type SearchProvider,
} from '@/features/search/search-providers'
import { compareSearchPaths } from '@/features/search/search-sort'

const SEARCH_DEBOUNCE_MS = 180
const DIRTY_BUFFER_DEBOUNCE_MS = 220
const SEARCH_FIRST_BATCH_DELAY_MS = 0
const SEARCH_STEADY_BATCH_DELAY_MS = 48
const SEARCH_FRAME_FALLBACK_MS = 16
const SEARCH_LIMIT = 200

export type WorkspaceSearchQueryOptions = {
  caseSensitive: boolean
  excludeGlobText: string
  filtersVisible: boolean
  includeGlobText: string
  matchMode: WorkspaceSearchMatchMode
  wholeWord: boolean
}

export function useSearchBuffer(rootPath: string) {
  const snapshot = useSearchBufferState((state) => state.active)
  const activeSnapshot = snapshot?.rootPath === rootPath ? snapshot : null
  const groups = searchGroupsForSnapshot(activeSnapshot)
  const store = useSearchBufferStoreApi()
  const query = activeSnapshot?.query ?? ''
  const searchOptions = searchOptionsForSnapshot(activeSnapshot)
  const setQuery = useCallback(
    (nextQuery: string) => store.getState().setQuery(rootPath, nextQuery),
    [rootPath, store],
  )
  const setReplaceText = useCallback(
    (replaceText: string) => store.getState().setReplaceText(rootPath, replaceText),
    [rootPath, store],
  )
  const setReplaceVisible = useCallback(
    (replaceVisible: boolean) => store.getState().setReplaceVisible(rootPath, replaceVisible),
    [rootPath, store],
  )
  const setSearchOptions = useCallback(
    (options: SearchBufferOptionPatch) => store.getState().setSearchOptions(rootPath, options),
    [rootPath, store],
  )
  const selectNextQuery = useCallback(
    () => store.getState().selectNextQuery(rootPath),
    [rootPath, store],
  )
  const selectNextReplaceText = useCallback(
    () => store.getState().selectNextReplaceText(rootPath),
    [rootPath, store],
  )
  const selectPreviousQuery = useCallback(
    () => store.getState().selectPreviousQuery(rootPath),
    [rootPath, store],
  )
  const selectPreviousReplaceText = useCallback(
    () => store.getState().selectPreviousReplaceText(rootPath),
    [rootPath, store],
  )

  usePrepareSearchBuffer(rootPath)

  return {
    groups,
    query,
    resultsQuery: activeSnapshot?.resultsQuery || query,
    resultsSearchQuery: activeSnapshot?.resultsSearchQuery,
    replaceText: activeSnapshot?.replaceText ?? '',
    replaceVisible: activeSnapshot?.replaceVisible ?? false,
    searchOptions,
    setQuery,
    setReplaceText,
    setReplaceVisible,
    setSearchOptions,
    selectNextQuery,
    selectNextReplaceText,
    selectPreviousQuery,
    selectPreviousReplaceText,
    snapshot: activeSnapshot,
  }
}

export function useSearchBufferRuntime(rootPath: string, enabled = true) {
  const snapshot = useSearchBufferState((state) => (enabled ? state.active : null))
  const activeSnapshot = snapshot?.rootPath === rootPath ? snapshot : null
  const query = activeSnapshot?.query ?? ''
  const searchRevision = activeSnapshot?.searchRevision ?? 0
  const searchOptions = searchOptionsForSnapshot(activeSnapshot)
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS)
  const debouncedIncludeGlobText = useDebouncedValue(
    searchOptions.includeGlobText,
    SEARCH_DEBOUNCE_MS,
  )
  const debouncedExcludeGlobText = useDebouncedValue(
    searchOptions.excludeGlobText,
    SEARCH_DEBOUNCE_MS,
  )

  usePrepareSearchBuffer(rootPath, enabled)
  useRunSearchBuffer(rootPath, enabled ? debouncedQuery : '', searchRevision, {
    ...searchOptions,
    excludeGlobText: debouncedExcludeGlobText,
    includeGlobText: debouncedIncludeGlobText,
  })
}

function usePrepareSearchBuffer(rootPath: string, enabled: boolean) {
  const store = useSearchBufferStoreApi()

  useEffect(() => {
    if (!enabled) return

    store.getState().prepareBuffer(rootPath)
  }, [enabled, rootPath, store])
}

function useRunSearchBuffer(
  rootPath: string,
  query: string,
  searchRevision: number,
  searchOptions: WorkspaceSearchQueryOptions,
) {
  const { caseSensitive, excludeGlobText, filtersVisible, includeGlobText, matchMode, wholeWord } =
    searchOptions
  const store = useSearchBufferStoreApi()
  const documentStore = useEditorDocumentStoreApi()

  useEffect(() => {
    if (!query) return

    const controller = new AbortController()
    const searchQuery = workspaceSearchQuery(rootPath, query, {
      caseSensitive,
      excludeGlobText,
      filtersVisible,
      includeGlobText,
      matchMode,
      wholeWord,
    })
    const documentState = documentStore.getState()
    const dirtyDocuments = dirtySearchDocuments(
      documentState.documents,
      documentState.dirtyFilePaths,
      rootPath,
    )
    const provider = workspaceSearchProvider(dirtyDocuments)
    const deferInitialOpenBufferMatches = shouldDeferInitialOpenBufferMatches(
      store.getState().active,
      searchQuery,
    )
    const runId = store.getState().startSearch(searchQuery)

    void runSearch(provider, searchQuery, runId, store, controller.signal, {
      deferInitialOpenBufferMatches,
    })

    return () => controller.abort()
  }, [
    documentStore,
    query,
    rootPath,
    searchRevision,
    caseSensitive,
    excludeGlobText,
    filtersVisible,
    includeGlobText,
    matchMode,
    wholeWord,
    store,
  ])

  useRunDirtySearchBufferOverlay(rootPath, query, searchOptions)
}

function useRunDirtySearchBufferOverlay(
  rootPath: string,
  query: string,
  searchOptions: WorkspaceSearchQueryOptions,
) {
  const { caseSensitive, excludeGlobText, filtersVisible, includeGlobText, matchMode, wholeWord } =
    searchOptions
  const store = useSearchBufferStoreApi()
  const documentStore = useEditorDocumentStoreApi()
  const dirtyRevisionKey = useEditorDocumentState((state) =>
    query
      ? dirtySearchRevisionKey(
          state.documents,
          state.dirtyFilePaths,
          state.documentContentRevisions,
          rootPath,
        )
      : '',
  )
  const debouncedDirtyRevisionKey = useDebouncedValue(dirtyRevisionKey, DIRTY_BUFFER_DEBOUNCE_MS)

  useEffect(() => {
    if (!query) return

    const searchQuery = workspaceSearchQuery(rootPath, query, {
      caseSensitive,
      excludeGlobText,
      filtersVisible,
      includeGlobText,
      matchMode,
      wholeWord,
    })
    const documentState = documentStore.getState()
    const dirtyDocuments = dirtySearchDocuments(
      documentState.documents,
      documentState.dirtyFilePaths,
      rootPath,
    )
    const provider = clientOnlyWorkspaceSearchProvider(
      store.getState().active,
      dirtyDocuments,
      searchQuery,
    )
    if (!provider) return

    const controller = new AbortController()
    const runId = store.getState().startSearch(searchQuery)

    void runSearch(provider, searchQuery, runId, store, controller.signal)

    return () => controller.abort()
  }, [
    debouncedDirtyRevisionKey,
    documentStore,
    query,
    rootPath,
    caseSensitive,
    excludeGlobText,
    filtersVisible,
    includeGlobText,
    matchMode,
    wholeWord,
    store,
  ])
}

type SearchRunOptions = {
  deferInitialOpenBufferMatches?: boolean
}

export async function runSearch(
  provider: SearchProvider,
  query: WorkspaceSearchQuery,
  runId: number,
  store: SearchBufferStoreApi,
  signal: AbortSignal,
  options: SearchRunOptions = {},
) {
  const batcher = createFirstPaintSearchEventBatcher(
    createSearchEventBatcher(runId, store),
    options.deferInitialOpenBufferMatches === true,
  )

  try {
    for await (const event of provider.search(query, signal)) {
      if (signal.aborted) return
      if (event.type === 'match') {
        batcher.push(event)
        continue
      }

      if (event.type === 'error') {
        batcher.fail()
        store.getState().appendEvent(runId, event)
        continue
      }

      batcher.flush()
      store.getState().appendEvent(runId, event)
    }
  } catch (error) {
    if (isAbortError(error)) return

    batcher.fail()
    store.getState().failSearch(runId, errorMessage(error))
  } finally {
    batcher.dispose()
  }
}

type SearchEventBatcher = {
  dispose(): void
  flush(): void
  push(event: WorkspaceSearchEvent): void
  pushMany(events: readonly WorkspaceSearchEvent[]): void
}

export function createFirstPaintSearchEventBatcher(
  batcher: SearchEventBatcher,
  deferInitialOpenBufferMatches: boolean,
) {
  let buffered: WorkspaceSearchEvent[] = []
  let open = !deferInitialOpenBufferMatches

  function releaseBuffered(event?: WorkspaceSearchEvent) {
    if (open) {
      if (event) batcher.push(event)
      return
    }

    open = true
    const events = event ? buffered.concat(event) : buffered
    buffered = []
    if (events.length === 0) return

    batcher.pushMany(events)
  }

  return {
    dispose() {
      buffered = []
      batcher.dispose()
    },
    fail() {
      if (open) batcher.flush()
      buffered = []
      open = true
    },
    flush() {
      releaseBuffered()
      batcher.flush()
    },
    push(event: WorkspaceSearchEvent) {
      if (open) {
        batcher.push(event)
        return
      }

      if (isOpenBufferMatchEvent(event)) {
        buffered.push(event)
        return
      }

      releaseBuffered(event)
      batcher.flush()
    },
  }
}

function isOpenBufferMatchEvent(event: WorkspaceSearchEvent) {
  return event.type === 'match' && event.match.source === 'open-buffer'
}

function createSearchEventBatcher(runId: number, store: SearchBufferStoreApi): SearchEventBatcher {
  let pending: WorkspaceSearchEvent[] = []
  let delayTimer: ReturnType<typeof setTimeout> | null = null
  let cancelFrame: (() => void) | null = null
  let flushedOnce = false
  let disposed = false

  function clearDelayTimer() {
    if (delayTimer === null) return

    globalThis.clearTimeout(delayTimer)
    delayTimer = null
  }

  function clearFrame() {
    if (!cancelFrame) return

    cancelFrame()
    cancelFrame = null
  }

  function clearScheduledFlush() {
    clearDelayTimer()
    clearFrame()
  }

  function flush() {
    if (pending.length === 0) return

    const events = pending
    pending = []
    flushedOnce = true
    clearScheduledFlush()
    store.getState().appendEvents(runId, events)
  }

  function scheduleFrameFlush() {
    if (disposed) return
    if (cancelFrame) return

    cancelFrame = scheduleSearchBatchFrame(() => {
      cancelFrame = null
      flush()
    })
  }

  function scheduleFlush() {
    if (disposed) return
    if (cancelFrame || delayTimer !== null) return

    const delay = flushedOnce ? SEARCH_STEADY_BATCH_DELAY_MS : SEARCH_FIRST_BATCH_DELAY_MS
    if (delay === 0) {
      scheduleFrameFlush()
      return
    }

    delayTimer = globalThis.setTimeout(() => {
      delayTimer = null
      scheduleFrameFlush()
    }, delay)
  }

  function pushMany(events: readonly WorkspaceSearchEvent[]) {
    pending.push(...events)
    scheduleFlush()
  }

  function dispose() {
    disposed = true
    pending = []
    clearScheduledFlush()
  }

  return {
    dispose,
    flush,
    push(event: WorkspaceSearchEvent) {
      pushMany([event])
    },
    pushMany,
  }
}

function scheduleSearchBatchFrame(callback: () => void) {
  if (typeof window !== 'undefined' && window.requestAnimationFrame) {
    const frame = window.requestAnimationFrame(callback)
    return () => window.cancelAnimationFrame(frame)
  }

  const timer = globalThis.setTimeout(callback, SEARCH_FRAME_FALLBACK_MS)
  return () => globalThis.clearTimeout(timer)
}

function shouldDeferInitialOpenBufferMatches(
  snapshot: SearchBufferSnapshot | null,
  query: WorkspaceSearchQuery,
) {
  if (!snapshot) return false
  if (snapshot.rootPath !== query.path) return false
  if (snapshot.matches.length === 0) return false

  return !sameWorkspaceSearchQuery(snapshot.resultsSearchQuery, query)
}

export function workspaceSearchQuery(
  rootPath: string,
  query: string,
  options: Partial<WorkspaceSearchQueryOptions> = {},
): WorkspaceSearchQuery {
  const filtersVisible = options.filtersVisible === true

  return {
    caseSensitive: options.caseSensitive === true,
    excludeGlobs: filtersVisible ? workspaceSearchGlobPatterns(options.excludeGlobText) : [],
    entryType: 'file',
    includeContent: true,
    includeGlobs: filtersVisible ? workspaceSearchGlobPatterns(options.includeGlobText) : [],
    includeNames: false,
    limit: SEARCH_LIMIT,
    matchMode: options.matchMode ?? 'literal',
    path: rootPath,
    query,
    wholeWord: options.wholeWord === true,
  }
}

function searchOptionsForSnapshot(
  snapshot: {
    caseSensitive: boolean
    excludeGlobText: string
    filtersVisible: boolean
    includeGlobText: string
    matchMode: WorkspaceSearchMatchMode
    wholeWord: boolean
  } | null,
): WorkspaceSearchQueryOptions {
  return {
    caseSensitive: snapshot?.caseSensitive ?? false,
    excludeGlobText: snapshot?.excludeGlobText ?? '',
    filtersVisible: snapshot?.filtersVisible ?? false,
    includeGlobText: snapshot?.includeGlobText ?? '',
    matchMode: snapshot?.matchMode ?? 'literal',
    wholeWord: snapshot?.wholeWord ?? false,
  }
}

function workspaceSearchProvider(documents: readonly OpenBufferSearchDocument[]) {
  return new CompositeSearchProvider({
    disk: new DiskSearchProvider(),
    openBufferPaths: new Set(documents.map((document) => document.path)),
    openBuffers: new OpenBufferSearchProvider(documents),
  })
}

export function clientOnlyWorkspaceSearchProvider(
  snapshot: SearchBufferSnapshot | null,
  documents: readonly OpenBufferSearchDocument[],
  query: WorkspaceSearchQuery,
): SearchProvider | null {
  if (documents.length === 0) return null
  if (!snapshot) return null
  if (snapshot.status !== 'ready') return null
  if (!sameWorkspaceSearchQuery(snapshot.resultsSearchQuery, query)) return null

  return new ClientOnlyWorkspaceSearchProvider(snapshot.matches, documents)
}

class ClientOnlyWorkspaceSearchProvider implements SearchProvider {
  private baseMatches: readonly WorkspaceSearchMatch[]
  private documents: readonly OpenBufferSearchDocument[]

  constructor(
    baseMatches: readonly WorkspaceSearchMatch[],
    documents: readonly OpenBufferSearchDocument[],
  ) {
    this.baseMatches = baseMatches
    this.documents = documents
  }

  async *search(
    query: WorkspaceSearchQuery,
    signal?: AbortSignal,
  ): AsyncGenerator<WorkspaceSearchEvent> {
    const dirtyPaths = new Set(this.documents.map((document) => document.path))
    const openBuffers = new OpenBufferSearchProvider(this.documents)
    let count = 0
    let truncated = false

    for (const match of this.baseMatches) {
      if (signal?.aborted) return
      if (dirtyPaths.has(match.path)) continue
      if (count >= query.limit) {
        truncated = true
        break
      }

      count += 1
      yield { match, type: 'match' }
    }

    if (!truncated) {
      for await (const event of openBuffers.search(query, signal)) {
        if (signal?.aborted) return
        if (event.type === 'done') {
          truncated = truncated || event.truncated
          continue
        }
        if (event.type !== 'match') {
          yield event
          continue
        }
        if (count >= query.limit) {
          truncated = true
          break
        }

        count += 1
        yield event
      }
    }

    yield {
      count,
      path: query.path,
      query: query.query,
      truncated,
      type: 'done',
    }
  }
}

function dirtySearchDocuments(
  documents: Readonly<Record<string, CachedEditorDocument>>,
  dirtyFilePaths: ReadonlySet<string>,
  rootPath: string,
) {
  const dirtyDocuments: OpenBufferSearchDocument[] = []

  for (const path of dirtyFilePaths) {
    if (!isPathInWorkspace(path, rootPath)) continue

    const document = documents[path]
    if (!document) continue

    dirtyDocuments.push({
      path,
      text: document.session.materializeFullText(),
    })
  }

  return dirtyDocuments.sort((a, b) => compareSearchPaths(a.path, b.path))
}

export function dirtySearchRevisionKey(
  documents: Readonly<Record<string, CachedEditorDocument>>,
  dirtyFilePaths: ReadonlySet<string>,
  contentRevisions: Readonly<Record<string, string>>,
  rootPath: string,
) {
  const parts: string[] = []
  const paths = Array.from(dirtyFilePaths)
    .filter((path) => isPathInWorkspace(path, rootPath))
    .toSorted(compareSearchPaths)

  for (const path of paths) {
    const document = documents[path]
    if (!document) {
      parts.push(path, '', '', '')
      continue
    }

    parts.push(
      path,
      document.revision.toString(),
      contentRevisions[path] ?? '',
      dirtySearchSessionKey(document.session),
    )
  }

  return parts.join('\0')
}

const dirtySearchSessionKeys = new WeakMap<CachedEditorDocument['session'], number>()
let nextDirtySearchSessionKey = 1

function dirtySearchSessionKey(session: CachedEditorDocument['session']) {
  const existing = dirtySearchSessionKeys.get(session)
  if (existing !== undefined) return existing.toString()

  const key = nextDirtySearchSessionKey
  nextDirtySearchSessionKey += 1
  dirtySearchSessionKeys.set(session, key)
  return key.toString()
}

function isPathInWorkspace(path: string, rootPath: string) {
  if (!rootPath) return true
  if (path === rootPath) return true

  return path.startsWith(`${rootPath}/`)
}

function useDebouncedValue(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [delay, value])

  return debounced
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error

  return 'Search failed.'
}

function isAbortError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  if (!('name' in error)) return false

  return error.name === 'AbortError'
}
