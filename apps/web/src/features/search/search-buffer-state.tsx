import type {
  WorkspaceSearchEvent,
  WorkspaceSearchMatch,
  WorkspaceSearchMatchMode,
  WorkspaceSearchQuery,
} from "@workspace/contracts"
import { createContext, useContext } from "react"
import { useStore } from "zustand"
import { createStore, type StoreApi } from "zustand/vanilla"

import { basename, toTreePath } from "@/lib/path-formatters"
import { searchBufferDocumentId } from "@/features/search/search-buffer-document"

export type SearchBufferStatus = "idle" | "loading" | "ready" | "error"
export type SearchReplaceStatus = "idle" | "running" | "success" | "error"

export type SearchBufferOptionPatch = Partial<
  Pick<
    SearchBufferSnapshot,
    | "caseSensitive"
    | "excludeGlobText"
    | "filtersVisible"
    | "includeGlobText"
    | "matchMode"
    | "wholeWord"
  >
>

export type WorkspaceSearchFileGroup = {
  collapsed: boolean
  count: number
  matches: WorkspaceSearchMatch[]
  name: string
  path: string
  pathLabel: string
}

export type SearchBufferSnapshot = {
  caseSensitive: boolean
  collapsedPaths: readonly string[]
  error: string | null
  excludeGlobText: string
  filtersVisible: boolean
  id: string
  includeGlobText: string
  matchMode: WorkspaceSearchMatchMode
  matches: readonly WorkspaceSearchMatch[]
  query: string
  replaceMessage: string | null
  replaceStatus: SearchReplaceStatus
  replaceText: string
  replaceVisible: boolean
  resultsQuery: string
  resultsSearchQuery: WorkspaceSearchQuery | null
  rootPath: string
  runningQuery: string | null
  runningSearchQuery: WorkspaceSearchQuery | null
  runId: number
  searchRevision: number
  status: SearchBufferStatus
  totalCount: number
  truncated: boolean
  wholeWord: boolean
}

type SearchBufferStoreState = {
  active: SearchBufferSnapshot | null
}

type SearchBufferStoreActions = {
  appendEvent: (runId: number, event: WorkspaceSearchEvent) => void
  appendEvents: (runId: number, events: readonly WorkspaceSearchEvent[]) => void
  failSearch: (runId: number, error: string) => void
  failReplace: (rootPath: string, error: string) => void
  finishReplace: (rootPath: string, message: string) => void
  prepareBuffer: (rootPath: string) => SearchBufferSnapshot
  resetBuffer: (rootPath: string) => void
  requestSearchRefresh: (rootPath: string) => void
  setSearchOptions: (rootPath: string, options: SearchBufferOptionPatch) => void
  setQuery: (rootPath: string, query: string) => void
  setReplaceText: (rootPath: string, replaceText: string) => void
  setReplaceVisible: (rootPath: string, replaceVisible: boolean) => void
  startReplace: (rootPath: string) => void
  startSearch: (query: WorkspaceSearchQuery) => number
  toggleGroup: (path: string) => void
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
    appendEvents: (runId, events) =>
      set((state) => appendSearchEvents(state, runId, events)),
    failSearch: (runId, error) =>
      set((state) => failSearchBuffer(state, runId, error)),
    failReplace: (rootPath, error) =>
      set((state) => ({
        active: replaceSearchBuffer(state.active, rootPath, {
          replaceMessage: error,
          replaceStatus: "error",
        }),
      })),
    finishReplace: (rootPath, message) =>
      set((state) => ({
        active: replaceSearchBuffer(state.active, rootPath, {
          replaceMessage: message,
          replaceStatus: "success",
        }),
      })),
    prepareBuffer: (rootPath) => {
      const current = get().active
      if (current?.rootPath === rootPath) return current

      const next = emptySearchBuffer(rootPath)
      set({ active: next })
      return next
    },
    resetBuffer: (rootPath) => set({ active: emptySearchBuffer(rootPath) }),
    requestSearchRefresh: (rootPath) =>
      set((state) => ({
        active: refreshSearchBuffer(state.active, rootPath),
      })),
    setSearchOptions: (rootPath, options) =>
      set((state) => ({
        active: optionSearchBuffer(state.active, rootPath, options),
      })),
    setQuery: (rootPath, query) =>
      set((state) => ({
        active: querySearchBuffer(state.active, rootPath, query),
      })),
    setReplaceText: (rootPath, replaceText) =>
      set((state) => ({
        active: replaceSearchBuffer(state.active, rootPath, {
          replaceMessage: null,
          replaceStatus: "idle",
          replaceText,
        }),
      })),
    setReplaceVisible: (rootPath, replaceVisible) =>
      set((state) => ({
        active: replaceSearchBuffer(state.active, rootPath, {
          replaceMessage: null,
          replaceStatus: "idle",
          replaceVisible,
        }),
      })),
    startReplace: (rootPath) =>
      set((state) => ({
        active: replaceSearchBuffer(state.active, rootPath, {
          replaceMessage: null,
          replaceStatus: "running",
        }),
      })),
    startSearch: (query) => {
      const current = get().active
      const runId = (current?.runId ?? 0) + 1
      set({ active: loadingSearchBuffer(query, runId, current) })
      return runId
    },
    toggleGroup: (path) =>
      set((state) => ({
        active: toggleSearchGroup(state.active, path),
      })),
  }))
}

function optionSearchBuffer(
  current: SearchBufferSnapshot | null,
  rootPath: string,
  options: SearchBufferOptionPatch
) {
  const base =
    current?.rootPath === rootPath ? current : emptySearchBuffer(rootPath)
  const next = { ...base, ...options, error: null }
  if (!searchOptionsChanged(base, next)) return base
  if (!next.query) return next

  return {
    ...next,
    replaceMessage: null,
    replaceStatus: "idle" as const,
    runId: base.runId + 1,
    runningQuery: null,
    runningSearchQuery: null,
    status: "loading" as const,
  }
}

function querySearchBuffer(
  current: SearchBufferSnapshot | null,
  rootPath: string,
  query: string
) {
  const base =
    current?.rootPath === rootPath ? current : emptySearchBuffer(rootPath)
  if (!query) return clearedSearchBuffer(base)

  const queryChanged = base.query !== query
  return {
    ...base,
    error: null,
    query,
    replaceMessage: null,
    replaceStatus: "idle" as const,
    runId: queryChanged ? base.runId + 1 : base.runId,
    runningQuery: queryChanged ? null : base.runningQuery,
    runningSearchQuery: queryChanged ? null : base.runningSearchQuery,
    status: queryChanged ? "loading" : base.status,
  }
}

function clearedSearchBuffer(current: SearchBufferSnapshot) {
  return {
    ...current,
    error: null,
    matches: [],
    query: "",
    replaceMessage: null,
    replaceStatus: "idle" as const,
    resultsQuery: "",
    resultsSearchQuery: null,
    runningQuery: null,
    runningSearchQuery: null,
    runId: current.runId + 1,
    searchRevision: current.searchRevision + 1,
    status: "idle" as const,
    totalCount: 0,
    truncated: false,
  }
}

export function searchGroupsForSnapshot(snapshot: SearchBufferSnapshot | null) {
  if (!snapshot) return []

  return groupSearchMatches(
    snapshot.matches,
    snapshot.rootPath,
    snapshot.collapsedPaths
  )
}

function appendSearchEvents(
  state: SearchBufferStoreState,
  runId: number,
  events: readonly WorkspaceSearchEvent[]
): SearchBufferStoreState {
  let next = state
  for (const event of events) {
    next = appendSearchEvent(next, runId, event)
  }

  return next
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
    const runningSearchQuery = active.runningSearchQuery
    return {
      active: {
        ...active,
        matches,
        resultsQuery: active.runningQuery ?? active.resultsQuery,
        resultsSearchQuery: runningSearchQuery ?? active.resultsSearchQuery,
        status: "loading",
        totalCount: matches.length,
        truncated: false,
      },
    }
  }
  if (event.type === "done") {
    const query = active.runningQuery ?? event.query
    const searchQuery = active.runningSearchQuery
    return {
      active: {
        ...active,
        matches: doneMatches(active, searchQuery),
        resultsQuery: query,
        resultsSearchQuery: searchQuery,
        runningQuery: null,
        runningSearchQuery: null,
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
      runningSearchQuery: null,
      status: "error",
    },
  }
}

function replaceSearchBuffer(
  snapshot: SearchBufferSnapshot | null,
  rootPath: string,
  patch: Partial<
    Pick<
      SearchBufferSnapshot,
      "replaceMessage" | "replaceStatus" | "replaceText" | "replaceVisible"
    >
  >
) {
  if (!snapshot) return null
  if (snapshot.rootPath !== rootPath) return snapshot

  return {
    ...snapshot,
    ...patch,
  }
}

function refreshSearchBuffer(
  snapshot: SearchBufferSnapshot | null,
  rootPath: string
) {
  if (!snapshot) return null
  if (snapshot.rootPath !== rootPath) return snapshot
  if (!snapshot.query.trim()) return snapshot

  return {
    ...snapshot,
    error: null,
    runId: snapshot.runId + 1,
    runningQuery: null,
    runningSearchQuery: null,
    searchRevision: snapshot.searchRevision + 1,
    status: "loading" as const,
  }
}

function activeRun(snapshot: SearchBufferSnapshot | null, runId: number) {
  if (!snapshot) return null
  if (snapshot.runId !== runId) return null

  return snapshot
}

function emptySearchBuffer(rootPath: string): SearchBufferSnapshot {
  return {
    caseSensitive: false,
    collapsedPaths: [],
    error: null,
    excludeGlobText: "",
    filtersVisible: false,
    id: searchBufferDocumentId(rootPath),
    includeGlobText: "",
    matchMode: "literal",
    matches: [],
    query: "",
    replaceMessage: null,
    replaceStatus: "idle",
    replaceText: "",
    replaceVisible: false,
    resultsQuery: "",
    resultsSearchQuery: null,
    rootPath,
    runningQuery: null,
    runningSearchQuery: null,
    runId: 0,
    searchRevision: 0,
    status: "idle",
    totalCount: 0,
    truncated: false,
    wholeWord: false,
  }
}

function loadingSearchBuffer(
  query: WorkspaceSearchQuery,
  runId: number,
  current: SearchBufferSnapshot | null
): SearchBufferSnapshot {
  const previous = current?.rootPath === query.path ? current : null

  return {
    caseSensitive: query.caseSensitive ?? previous?.caseSensitive ?? false,
    collapsedPaths: previous?.collapsedPaths ?? [],
    error: null,
    excludeGlobText:
      previous?.excludeGlobText ?? globTextForQuery(query.excludeGlobs),
    filtersVisible: previous?.filtersVisible ?? hasWorkspaceSearchGlobs(query),
    id: searchBufferDocumentId(query.path),
    includeGlobText:
      previous?.includeGlobText ?? globTextForQuery(query.includeGlobs),
    matchMode: query.matchMode ?? previous?.matchMode ?? "literal",
    matches: previous?.matches ?? [],
    query: query.query,
    replaceMessage: previous?.replaceMessage ?? null,
    replaceStatus: previous?.replaceStatus ?? "idle",
    replaceText: previous?.replaceText ?? "",
    replaceVisible: previous?.replaceVisible ?? false,
    resultsQuery: previous?.resultsQuery ?? "",
    resultsSearchQuery: previous?.resultsSearchQuery ?? null,
    rootPath: query.path,
    runningQuery: query.query,
    runningSearchQuery: query,
    runId,
    searchRevision: previous?.searchRevision ?? 0,
    status: "loading",
    totalCount: previous?.totalCount ?? 0,
    truncated: previous?.truncated ?? false,
    wholeWord: query.wholeWord ?? previous?.wholeWord ?? false,
  }
}

function hasWorkspaceSearchGlobs(query: WorkspaceSearchQuery) {
  if ((query.includeGlobs?.length ?? 0) > 0) return true

  return (query.excludeGlobs?.length ?? 0) > 0
}

function globTextForQuery(globs: readonly string[] | undefined) {
  return globs?.join(", ") ?? ""
}

function nextSearchMatches(
  active: SearchBufferSnapshot,
  match: WorkspaceSearchMatch
) {
  if (
    sameWorkspaceSearchQuery(
      active.resultsSearchQuery,
      active.runningSearchQuery
    )
  ) {
    return [...active.matches, match]
  }

  return [match]
}

function doneMatches(
  active: SearchBufferSnapshot,
  query: WorkspaceSearchQuery | null
) {
  if (sameWorkspaceSearchQuery(active.resultsSearchQuery, query)) {
    return active.matches
  }

  return []
}

function searchOptionsChanged(
  current: SearchBufferSnapshot,
  next: SearchBufferSnapshot
) {
  if (current.caseSensitive !== next.caseSensitive) return true
  if (current.excludeGlobText !== next.excludeGlobText) return true
  if (current.filtersVisible !== next.filtersVisible) return true
  if (current.includeGlobText !== next.includeGlobText) return true
  if (current.matchMode !== next.matchMode) return true

  return current.wholeWord !== next.wholeWord
}

function sameWorkspaceSearchQuery(
  left: WorkspaceSearchQuery | null,
  right: WorkspaceSearchQuery | null
) {
  if (!left || !right) return left === right
  if (left.caseSensitive !== right.caseSensitive) return false
  if (left.entryType !== right.entryType) return false
  if (left.includeContent !== right.includeContent) return false
  if (left.includeNames !== right.includeNames) return false
  if (left.limit !== right.limit) return false
  if (left.matchMode !== right.matchMode) return false
  if (left.maxDepth !== right.maxDepth) return false
  if (left.path !== right.path) return false
  if (left.query !== right.query) return false
  if (left.wholeWord !== right.wholeWord) return false
  if (!sameStringList(left.includeGlobs, right.includeGlobs)) return false

  return sameStringList(left.excludeGlobs, right.excludeGlobs)
}

function sameStringList(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined
) {
  const leftList = left ?? []
  const rightList = right ?? []
  if (leftList.length !== rightList.length) return false

  return leftList.every((value, index) => value === rightList[index])
}

function toggleSearchGroup(
  snapshot: SearchBufferSnapshot | null,
  path: string
) {
  if (!snapshot) return null

  const collapsedPaths = new Set(snapshot.collapsedPaths)
  if (collapsedPaths.has(path)) {
    collapsedPaths.delete(path)
  } else {
    collapsedPaths.add(path)
  }

  return {
    ...snapshot,
    collapsedPaths: [...collapsedPaths],
  }
}

function groupSearchMatches(
  matches: readonly WorkspaceSearchMatch[],
  rootPath: string,
  collapsedPaths: readonly string[]
) {
  const groups = new Map<string, WorkspaceSearchFileGroup>()
  const collapsed = new Set(collapsedPaths)

  for (const match of matches) {
    const group = groups.get(match.path)
    if (group) {
      group.count += contentMatchCount(match)
      group.matches.push(match)
      continue
    }

    groups.set(match.path, searchFileGroup(match, rootPath, collapsed))
  }

  return [...groups.values()].sort((a, b) =>
    a.pathLabel.localeCompare(b.pathLabel)
  )
}

function searchFileGroup(
  match: WorkspaceSearchMatch,
  rootPath: string,
  collapsedPaths: ReadonlySet<string>
): WorkspaceSearchFileGroup {
  return {
    collapsed: collapsedPaths.has(match.path),
    count: contentMatchCount(match),
    matches: [match],
    name: basename(match.path),
    path: match.path,
    pathLabel: toTreePath(match.path, rootPath),
  }
}

function contentMatchCount(match: WorkspaceSearchMatch) {
  return match.kind === "content" ? 1 : 0
}
