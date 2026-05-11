import type {
  WorkspaceSearchEvent,
  WorkspaceSearchMatch,
  WorkspaceSearchQuery,
} from "@workspace/contracts"
import { createContext, useContext } from "react"
import { useStore } from "zustand"
import { createStore, type StoreApi } from "zustand/vanilla"

import { basename, toTreePath } from "@/lib/path-formatters"
import { searchBufferDocumentId } from "@/features/search/search-buffer-document"

export type SearchBufferStatus = "idle" | "loading" | "ready" | "error"

export type WorkspaceSearchFileGroup = {
  matches: WorkspaceSearchMatch[]
  name: string
  path: string
  pathLabel: string
}

export type SearchBufferSnapshot = {
  error: string | null
  id: string
  matches: readonly WorkspaceSearchMatch[]
  query: string
  resultsQuery: string
  rootPath: string
  runningQuery: string | null
  runId: number
  status: SearchBufferStatus
  totalCount: number
  truncated: boolean
}

type SearchBufferStoreState = {
  active: SearchBufferSnapshot | null
}

type SearchBufferStoreActions = {
  appendEvent: (runId: number, event: WorkspaceSearchEvent) => void
  failSearch: (runId: number, error: string) => void
  prepareBuffer: (rootPath: string) => SearchBufferSnapshot
  resetBuffer: (rootPath: string) => void
  setQuery: (rootPath: string, query: string) => void
  startSearch: (query: WorkspaceSearchQuery) => number
}

export type SearchBufferStore = SearchBufferStoreState &
  SearchBufferStoreActions

export type SearchBufferStoreApi = StoreApi<SearchBufferStore>

export const SearchBufferStateContext =
  createContext<SearchBufferStoreApi | null>(null)

export function useSearchBufferStoreApi() {
  const store = useContext(SearchBufferStateContext)
  if (!store) {
    throw new Error(
      "useSearchBufferStoreApi must be used within SearchBufferStateContext"
    )
  }

  return store
}

export function useSearchBufferState<T>(
  selector: (state: SearchBufferStore) => T
): T {
  return useStore(useSearchBufferStoreApi(), selector)
}

export function createSearchBufferStore() {
  return createStore<SearchBufferStore>()((set, get) => ({
    active: null,
    appendEvent: (runId, event) =>
      set((state) => appendSearchEvent(state, runId, event)),
    failSearch: (runId, error) =>
      set((state) => failSearchBuffer(state, runId, error)),
    prepareBuffer: (rootPath) => {
      const current = get().active
      if (current?.rootPath === rootPath) return current

      const next = emptySearchBuffer(rootPath)
      set({ active: next })
      return next
    },
    resetBuffer: (rootPath) => set({ active: emptySearchBuffer(rootPath) }),
    setQuery: (rootPath, query) =>
      set((state) => ({
        active: querySearchBuffer(state.active, rootPath, query),
      })),
    startSearch: (query) => {
      const current = get().active
      const runId = (current?.runId ?? 0) + 1
      set({ active: loadingSearchBuffer(query, runId, current) })
      return runId
    },
  }))
}

function querySearchBuffer(
  current: SearchBufferSnapshot | null,
  rootPath: string,
  query: string
) {
  if (!query) return emptySearchBuffer(rootPath)

  const base = current?.rootPath === rootPath ? current : emptySearchBuffer(rootPath)
  const queryChanged = base.query !== query
  return {
    ...base,
    error: null,
    query,
    runId: queryChanged ? base.runId + 1 : base.runId,
    runningQuery: queryChanged ? null : base.runningQuery,
    status: queryChanged ? "loading" : base.status,
  }
}

export function searchGroupsForSnapshot(snapshot: SearchBufferSnapshot | null) {
  if (!snapshot) return []

  return groupSearchMatches(snapshot.matches, snapshot.rootPath)
}

function appendSearchEvent(
  state: SearchBufferStoreState,
  runId: number,
  event: WorkspaceSearchEvent
): SearchBufferStoreState {
  const active = activeRun(state.active, runId)
  if (!active) return state
  if (event.type === "match") {
    const matches = nextSearchMatches(active, event.match)
    return {
      active: {
        ...active,
        matches,
        resultsQuery: active.runningQuery ?? active.resultsQuery,
        status: "loading",
        totalCount: matches.length,
        truncated: false,
      },
    }
  }
  if (event.type === "done") {
    const query = active.runningQuery ?? event.query
    return {
      active: {
        ...active,
        matches: doneMatches(active, query),
        resultsQuery: query,
        runningQuery: null,
        status: "ready",
        totalCount: event.count,
        truncated: event.truncated,
      },
    }
  }

  return failSearchBuffer(state, runId, event.message)
}

function failSearchBuffer(
  state: SearchBufferStoreState,
  runId: number,
  error: string
): SearchBufferStoreState {
  const active = activeRun(state.active, runId)
  if (!active) return state

  return {
    active: {
      ...active,
      error,
      runningQuery: null,
      status: "error",
    },
  }
}

function activeRun(snapshot: SearchBufferSnapshot | null, runId: number) {
  if (!snapshot) return null
  if (snapshot.runId !== runId) return null

  return snapshot
}

function emptySearchBuffer(rootPath: string): SearchBufferSnapshot {
  return {
    error: null,
    id: searchBufferDocumentId(rootPath),
    matches: [],
    query: "",
    resultsQuery: "",
    rootPath,
    runningQuery: null,
    runId: 0,
    status: "idle",
    totalCount: 0,
    truncated: false,
  }
}

function loadingSearchBuffer(
  query: WorkspaceSearchQuery,
  runId: number,
  current: SearchBufferSnapshot | null
): SearchBufferSnapshot {
  const previous = current?.rootPath === query.path ? current : null

  return {
    error: null,
    id: searchBufferDocumentId(query.path),
    matches: previous?.matches ?? [],
    query: query.query,
    resultsQuery: previous?.resultsQuery ?? "",
    rootPath: query.path,
    runningQuery: query.query,
    runId,
    status: "loading",
    totalCount: previous?.totalCount ?? 0,
    truncated: previous?.truncated ?? false,
  }
}

function nextSearchMatches(
  active: SearchBufferSnapshot,
  match: WorkspaceSearchMatch
) {
  if (active.resultsQuery === active.runningQuery) {
    return [...active.matches, match]
  }

  return [match]
}

function doneMatches(active: SearchBufferSnapshot, query: string) {
  if (active.resultsQuery === query) return active.matches

  return []
}

function groupSearchMatches(
  matches: readonly WorkspaceSearchMatch[],
  rootPath: string
) {
  const groups = new Map<string, WorkspaceSearchFileGroup>()

  for (const match of matches) {
    const group = groups.get(match.path)
    if (group) {
      group.matches.push(match)
      continue
    }

    groups.set(match.path, searchFileGroup(match, rootPath))
  }

  return [...groups.values()].sort((a, b) => a.pathLabel.localeCompare(b.pathLabel))
}

function searchFileGroup(
  match: WorkspaceSearchMatch,
  rootPath: string
): WorkspaceSearchFileGroup {
  return {
    matches: [match],
    name: basename(match.path),
    path: match.path,
    pathLabel: toTreePath(match.path, rootPath),
  }
}
