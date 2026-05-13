import type {
  WorkspaceSearchEvent,
  WorkspaceSearchMatchMode,
  WorkspaceSearchQuery,
} from "@workspace/contracts"
import { workspaceSearchGlobPatterns } from "@workspace/contracts"
import { useCallback, useEffect, useMemo, useState } from "react"

import {
  type CachedEditorDocument,
  useEditorDocumentStoreApi,
  useEditorDocumentState,
} from "@/features/editor/state/editor-document-state"
import {
  type SearchBufferStoreApi,
  type SearchBufferSnapshot,
  sameWorkspaceSearchQuery,
  searchGroupsForSnapshot,
  type SearchBufferOptionPatch,
  useSearchBufferState,
  useSearchBufferStoreApi,
} from "@/features/search/search-buffer-state"
import {
  CompositeSearchProvider,
  DiskSearchProvider,
  OpenBufferSearchProvider,
  type OpenBufferSearchDocument,
  type SearchProvider,
} from "@/features/search/search-providers"

const SEARCH_DEBOUNCE_MS = 180
const DIRTY_BUFFER_DEBOUNCE_MS = 220
const SEARCH_BATCH_SIZE = 50
const SEARCH_BATCH_MS = 24
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
  const groups = useMemo(
    () =>
      searchGroupsForSnapshot(
        activeSnapshot
          ? {
              collapsedPaths: activeSnapshot.collapsedPaths,
              matches: activeSnapshot.matches,
              rootPath: activeSnapshot.rootPath,
            }
          : null
      ),
    [activeSnapshot]
  )
  const store = useSearchBufferStoreApi()
  const query = activeSnapshot?.query ?? ""
  const searchOptions = searchOptionsForSnapshot(activeSnapshot)
  const setQuery = useCallback(
    (nextQuery: string) => store.getState().setQuery(rootPath, nextQuery),
    [rootPath, store]
  )
  const setReplaceText = useCallback(
    (replaceText: string) =>
      store.getState().setReplaceText(rootPath, replaceText),
    [rootPath, store]
  )
  const setReplaceVisible = useCallback(
    (replaceVisible: boolean) =>
      store.getState().setReplaceVisible(rootPath, replaceVisible),
    [rootPath, store]
  )
  const setSearchOptions = useCallback(
    (options: SearchBufferOptionPatch) =>
      store.getState().setSearchOptions(rootPath, options),
    [rootPath, store]
  )
  const selectNextQuery = useCallback(
    () => store.getState().selectNextQuery(rootPath),
    [rootPath, store]
  )
  const selectNextReplaceText = useCallback(
    () => store.getState().selectNextReplaceText(rootPath),
    [rootPath, store]
  )
  const selectPreviousQuery = useCallback(
    () => store.getState().selectPreviousQuery(rootPath),
    [rootPath, store]
  )
  const selectPreviousReplaceText = useCallback(
    () => store.getState().selectPreviousReplaceText(rootPath),
    [rootPath, store]
  )

  usePrepareSearchBuffer(rootPath)

  return {
    groups,
    query,
    resultsQuery: activeSnapshot?.resultsQuery || query.trim(),
    resultsSearchQuery: activeSnapshot?.resultsSearchQuery,
    replaceText: activeSnapshot?.replaceText ?? "",
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

export function useSearchBufferRuntime(rootPath: string) {
  const snapshot = useSearchBufferState((state) => state.active)
  const activeSnapshot = snapshot?.rootPath === rootPath ? snapshot : null
  const query = activeSnapshot?.query ?? ""
  const searchRevision = activeSnapshot?.searchRevision ?? 0
  const searchOptions = searchOptionsForSnapshot(activeSnapshot)
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS).trim()
  const debouncedIncludeGlobText = useDebouncedValue(
    searchOptions.includeGlobText,
    SEARCH_DEBOUNCE_MS
  )
  const debouncedExcludeGlobText = useDebouncedValue(
    searchOptions.excludeGlobText,
    SEARCH_DEBOUNCE_MS
  )

  usePrepareSearchBuffer(rootPath)
  useRunSearchBuffer(rootPath, debouncedQuery, searchRevision, {
    ...searchOptions,
    excludeGlobText: debouncedExcludeGlobText,
    includeGlobText: debouncedIncludeGlobText,
  })
}

function usePrepareSearchBuffer(rootPath: string) {
  const store = useSearchBufferStoreApi()

  useEffect(() => {
    store.getState().prepareBuffer(rootPath)
  }, [rootPath, store])
}

function useRunSearchBuffer(
  rootPath: string,
  query: string,
  searchRevision: number,
  searchOptions: WorkspaceSearchQueryOptions
) {
  const {
    caseSensitive,
    excludeGlobText,
    filtersVisible,
    includeGlobText,
    matchMode,
    wholeWord,
  } = searchOptions
  const store = useSearchBufferStoreApi()
  const documentStore = useEditorDocumentStoreApi()
  const documents = useEditorDocumentState((state) => state.documents)
  const dirtyContentRevision = useEditorDocumentState(
    (state) => state.dirtyContentRevision
  )
  const dirtyFilePaths = useEditorDocumentState((state) => state.dirtyFilePaths)
  const dirtyContentKey = useMemo(
    () =>
      dirtySearchContentKey(
        documents,
        dirtyFilePaths,
        rootPath,
        dirtyContentRevision
      ),
    [dirtyContentRevision, dirtyFilePaths, documents, rootPath]
  )
  const debouncedDirtyContentKey = useDebouncedValue(
    dirtyContentKey,
    DIRTY_BUFFER_DEBOUNCE_MS
  )

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
    const dirtyDocuments = dirtySearchDocuments(
      documentStore.getState().documents,
      dirtyFilePaths,
      rootPath
    )
    const provider = workspaceSearchProvider(dirtyDocuments)
    const deferInitialOpenBufferMatches = shouldDeferInitialOpenBufferMatches(
      store.getState().active,
      searchQuery
    )
    const runId = store.getState().startSearch(searchQuery)

    void runSearch(provider, searchQuery, runId, store, controller.signal, {
      deferInitialOpenBufferMatches,
    })

    return () => controller.abort()
  }, [
    debouncedDirtyContentKey,
    dirtyFilePaths,
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
  options: SearchRunOptions = {}
) {
  const batcher = createFirstPaintSearchEventBatcher(
    createSearchEventBatcher(runId, store),
    options.deferInitialOpenBufferMatches === true
  )

  try {
    for await (const event of provider.search(query, signal)) {
      if (signal.aborted) return
      if (event.type === "match") {
        batcher.push(event)
        continue
      }

      if (event.type === "error") {
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
  deferInitialOpenBufferMatches: boolean
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
  return event.type === "match" && event.match.source === "open-buffer"
}

function createSearchEventBatcher(
  runId: number,
  store: SearchBufferStoreApi
): SearchEventBatcher {
  let pending: WorkspaceSearchEvent[] = []
  let timer: number | null = null

  function clearTimer() {
    if (timer === null) return

    window.clearTimeout(timer)
    timer = null
  }

  function flush() {
    if (pending.length === 0) return

    const events = pending
    pending = []
    clearTimer()
    store.getState().appendEvents(runId, events)
  }

  function scheduleFlush() {
    if (timer !== null) return

    timer = window.setTimeout(flush, SEARCH_BATCH_MS)
  }

  function pushMany(events: readonly WorkspaceSearchEvent[]) {
    pending.push(...events)
    if (pending.length >= SEARCH_BATCH_SIZE) {
      flush()
      return
    }

    scheduleFlush()
  }

  function dispose() {
    pending = []
    clearTimer()
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

function shouldDeferInitialOpenBufferMatches(
  snapshot: SearchBufferSnapshot | null,
  query: WorkspaceSearchQuery
) {
  if (!snapshot) return false
  if (snapshot.rootPath !== query.path) return false
  if (snapshot.matches.length === 0) return false

  return !sameWorkspaceSearchQuery(snapshot.resultsSearchQuery, query)
}

export function workspaceSearchQuery(
  rootPath: string,
  query: string,
  options: Partial<WorkspaceSearchQueryOptions> = {}
): WorkspaceSearchQuery {
  const filtersVisible = options.filtersVisible === true

  return {
    caseSensitive: options.caseSensitive === true,
    excludeGlobs: filtersVisible
      ? workspaceSearchGlobPatterns(options.excludeGlobText)
      : [],
    entryType: "file",
    includeContent: true,
    includeGlobs: filtersVisible
      ? workspaceSearchGlobPatterns(options.includeGlobText)
      : [],
    includeNames: false,
    limit: SEARCH_LIMIT,
    matchMode: options.matchMode ?? "literal",
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
  } | null
): WorkspaceSearchQueryOptions {
  return {
    caseSensitive: snapshot?.caseSensitive ?? false,
    excludeGlobText: snapshot?.excludeGlobText ?? "",
    filtersVisible: snapshot?.filtersVisible ?? false,
    includeGlobText: snapshot?.includeGlobText ?? "",
    matchMode: snapshot?.matchMode ?? "literal",
    wholeWord: snapshot?.wholeWord ?? false,
  }
}

function workspaceSearchProvider(
  documents: readonly OpenBufferSearchDocument[]
) {
  return new CompositeSearchProvider({
    disk: new DiskSearchProvider(),
    openBufferPaths: new Set(documents.map((document) => document.path)),
    openBuffers: new OpenBufferSearchProvider(documents),
  })
}

function dirtySearchDocuments(
  documents: Readonly<Record<string, CachedEditorDocument>>,
  dirtyFilePaths: ReadonlySet<string>,
  rootPath: string
) {
  const dirtyDocuments: OpenBufferSearchDocument[] = []

  for (const path of dirtyFilePaths) {
    if (!isPathInWorkspace(path, rootPath)) continue

    const document = documents[path]
    if (!document) continue

    dirtyDocuments.push({
      path,
      text: document.session.getText(),
    })
  }

  return dirtyDocuments.sort((a, b) => a.path.localeCompare(b.path))
}

function dirtySearchContentKey(
  documents: Readonly<Record<string, CachedEditorDocument>>,
  dirtyFilePaths: ReadonlySet<string>,
  rootPath: string,
  revision: number
) {
  void revision

  return [...dirtySearchDocuments(documents, dirtyFilePaths, rootPath)]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((document) => `${document.path}\0${document.text}`)
    .join("\0")
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
  if (typeof error === "string") return error

  return "Search failed."
}

function isAbortError(error: unknown) {
  if (!error || typeof error !== "object") return false
  if (!("name" in error)) return false

  return error.name === "AbortError"
}
