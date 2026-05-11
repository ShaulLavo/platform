import type { WorkspaceSearchQuery } from "@workspace/contracts"
import { useEffect, useMemo, useState } from "react"

import {
  type CachedEditorDocument,
  useEditorDocumentStoreApi,
  useEditorDocumentState,
} from "@/features/editor/state/editor-document-state"
import {
  type SearchBufferStoreApi,
  searchGroupsForSnapshot,
  useSearchBufferState,
  useSearchBufferStoreApi,
} from "@/features/search/search-buffer-state"
import {
  CompositeSearchProvider,
  DiskSearchProvider,
  OpenBufferSearchProvider,
  type OpenBufferSearchDocument,
} from "@/features/search/search-providers"

const SEARCH_DEBOUNCE_MS = 180
const SEARCH_LIMIT = 200

export function useSearchBuffer(rootPath: string) {
  const snapshot = useSearchBufferState((state) => state.active)
  const activeSnapshot = snapshot?.rootPath === rootPath ? snapshot : null
  const groups = useMemo(
    () => searchGroupsForSnapshot(activeSnapshot),
    [activeSnapshot]
  )
  const store = useSearchBufferStoreApi()
  const query = activeSnapshot?.query ?? ""

  usePrepareSearchBuffer(rootPath)

  return {
    groups,
    query,
    resultsQuery: activeSnapshot?.resultsQuery || query.trim(),
    setQuery: (nextQuery: string) => store.getState().setQuery(rootPath, nextQuery),
    snapshot: activeSnapshot,
  }
}

export function useSearchBufferRuntime(rootPath: string) {
  const snapshot = useSearchBufferState((state) => state.active)
  const query = snapshot?.rootPath === rootPath ? snapshot.query : ""
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS).trim()

  usePrepareSearchBuffer(rootPath)
  useRunSearchBuffer(rootPath, debouncedQuery)
}

function usePrepareSearchBuffer(rootPath: string) {
  const store = useSearchBufferStoreApi()

  useEffect(() => {
    store.getState().prepareBuffer(rootPath)
  }, [rootPath, store])
}

function useRunSearchBuffer(rootPath: string, query: string) {
  const store = useSearchBufferStoreApi()
  const documentStore = useEditorDocumentStoreApi()
  const dirtyFilePaths = useEditorDocumentState((state) => state.dirtyFilePaths)
  const dirtyPathKey = dirtySearchPathKey(dirtyFilePaths)

  useEffect(() => {
    if (!query) return

    const controller = new AbortController()
    const searchQuery = workspaceSearchQuery(rootPath, query)
    const dirtyDocuments = dirtySearchDocuments(
      documentStore.getState().documents,
      dirtyFilePaths
    )
    const provider = workspaceSearchProvider(dirtyDocuments)
    const runId = store.getState().startSearch(searchQuery)

    void runSearch(provider, searchQuery, runId, store, controller.signal)

    return () => controller.abort()
  }, [dirtyFilePaths, dirtyPathKey, documentStore, query, rootPath, store])
}

async function runSearch(
  provider: CompositeSearchProvider,
  query: WorkspaceSearchQuery,
  runId: number,
  store: SearchBufferStoreApi,
  signal: AbortSignal
) {
  try {
    for await (const event of provider.search(query, signal)) {
      if (signal.aborted) return

      store.getState().appendEvent(runId, event)
    }
  } catch (error) {
    if (isAbortError(error)) return

    store.getState().failSearch(runId, errorMessage(error))
  }
}

function workspaceSearchQuery(
  rootPath: string,
  query: string
): WorkspaceSearchQuery {
  return {
    caseSensitive: false,
    entryType: "file",
    includeContent: true,
    limit: SEARCH_LIMIT,
    matchMode: "literal",
    path: rootPath,
    query,
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
  dirtyFilePaths: ReadonlySet<string>
) {
  const dirtyDocuments: OpenBufferSearchDocument[] = []

  for (const path of dirtyFilePaths) {
    const document = documents[path]
    if (!document) continue

    dirtyDocuments.push({
      path,
      text: document.session.getText(),
    })
  }

  return dirtyDocuments
}

function dirtySearchPathKey(dirtyFilePaths: ReadonlySet<string>) {
  return [...dirtyFilePaths].sort().join("\0")
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
