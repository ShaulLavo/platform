import { fsClient } from "@/lib/fs-client"
import type {
  FindMatch,
  FsEntry,
  FsEntryType,
  PickedFsEntry,
  RecentResult,
  SearchScope,
  ServerInfo,
  StatResult,
  TreeResult,
} from "@/lib/file-system-types"
import { isDirectoryEntry } from "@/lib/file-system-types"
import { filePickerKeys } from "@/lib/query-keys"
import { parseEdenSseStream, type EdenSseEvent } from "@/lib/eden-events"
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query"
import { useEffect, useEffectEvent } from "react"

import {
  ROOT_PATH,
  basename,
  compareSearchEntries,
  errorMessage,
  loadingLoadState,
  rpcErrorMessage,
  type DirectoryFsEntry,
  type FilePickerMode,
  type LoadState,
} from "./state"

type FindErrorEvent = {
  error?: {
    message?: string
  }
}

type DirectoryLoadData = {
  currentEntry: DirectoryFsEntry | null
  entries: FsEntry[]
}

const SEARCH_LIMIT = 80
const SEARCH_SCOPE_TIMEOUT_MS = 6000
const RECENT_LIMIT = 30

const searchSignalCleanup = new WeakMap<AbortSignal, () => void>()

export function useServerInfoForOpen(
  open: boolean,
  onReady: (info: ServerInfo) => void,
  onClose: () => void
) {
  const closeSession = useEffectEvent(onClose)
  const applyServerInfo = useEffectEvent(onReady)
  const query = useQuery<ServerInfo>({
    enabled: open,
    queryFn: ({ signal }) => fetchServerInfo(signal),
    queryKey: filePickerKeys.serverInfo(),
  })

  useEffect(() => {
    if (!open) {
      closeSession()
      return
    }
    if (!query.data) return

    applyServerInfo(query.data)
  }, [open, query.data])

  return {
    serverInfo: query.data ?? null,
    serverInfoError: query.isError ? query.error : null,
  }
}

export function useDirectoryLoad({
  currentPath,
  effectiveQuery,
  mode,
  open,
  reloadVersion,
  serverInfo,
}: {
  currentPath: string
  effectiveQuery: string
  mode: FilePickerMode
  open: boolean
  reloadVersion: number
  serverInfo: ServerInfo | null
}) {
  const queryClient = useQueryClient()
  const enabled = open && Boolean(serverInfo)
  const queryKey = filePickerKeys.directory(
    currentPath,
    effectiveQuery,
    mode,
    reloadVersion
  )
  const query = useQuery<DirectoryLoadData>({
    enabled,
    placeholderData: (previousData) => previousData,
    queryFn: ({ signal }) =>
      loadDirectoryData(
        currentPath,
        effectiveQuery,
        mode,
        signal,
        (entries) => {
          if (signal.aborted) return

          queryClient.setQueryData(
            queryKey,
            (current: DirectoryLoadData | undefined) => ({
              currentEntry: current?.currentEntry ?? null,
              entries,
            })
          )
        }
      ),
    queryKey,
  })

  return {
    currentEntry: query.isPlaceholderData
      ? null
      : (query.data?.currentEntry ?? null),
    loadState: directoryLoadState(query, enabled),
  }
}

export function useRecentEntries({
  open,
  reloadVersion,
  serverInfo,
}: {
  open: boolean
  reloadVersion: number
  serverInfo: ServerInfo | null
}) {
  const query = useQuery<FsEntry[]>({
    enabled: open && Boolean(serverInfo),
    queryFn: ({ signal }) => fetchRecentEntries(signal),
    queryKey: filePickerKeys.recentList(reloadVersion),
  })

  return entriesLoadState(query, open && Boolean(serverInfo))
}

export function useRecordRecentMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: recordRecent,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: filePickerKeys.recents() })
    },
  })
}

async function loadDirectoryData(
  path: string,
  query: string,
  mode: FilePickerMode,
  signal: AbortSignal,
  onEntries: (entries: FsEntry[]) => void
): Promise<DirectoryLoadData> {
  const [currentEntry, entries] = await Promise.all([
    fetchCurrentEntry(path, signal),
    loadEntries(path, query, mode, signal, onEntries),
  ])

  return { currentEntry, entries }
}

function directoryLoadState(
  query: UseQueryResult<DirectoryLoadData>,
  enabled: boolean
): LoadState {
  if (!enabled) return { status: "loading" }
  if (query.isError)
    return { status: "error", message: errorMessage(query.error) }
  if (query.isPlaceholderData && query.data) {
    return loadingLoadState({ status: "ready", entries: query.data.entries })
  }
  if (query.data) return { status: "ready", entries: query.data.entries }
  if (query.isPending) return { status: "loading" }

  return { status: "idle" }
}

function entriesLoadState(
  query: UseQueryResult<FsEntry[]>,
  enabled: boolean
): LoadState {
  if (!enabled) return { status: "loading" }
  if (query.data) return { status: "ready", entries: query.data }
  if (query.isError)
    return { status: "error", message: errorMessage(query.error) }
  if (query.isPending) return { status: "loading" }

  return { status: "idle" }
}

async function loadEntries(
  path: string,
  query: string,
  mode: FilePickerMode,
  signal: AbortSignal,
  onEntries: (entries: FsEntry[]) => void
) {
  const trimmedQuery = query.trim()
  if (!trimmedQuery) return fetchTreeEntries(path, signal)

  return streamFindEntries(path, trimmedQuery, mode, signal, onEntries)
}

async function fetchServerInfo(signal: AbortSignal) {
  const response = await fsClient.health.get({
    fetch: { signal },
  })

  if (response.error) throw new Error(rpcErrorMessage(response.error))

  return response.data as ServerInfo
}

async function fetchCurrentEntry(path: string, signal: AbortSignal) {
  const response = await fsClient.fs.stat.get({
    query: { path },
    fetch: { signal },
  })
  if (response.error) throw new Error(rpcErrorMessage(response.error))

  const entry = response.data as StatResult
  if (!isDirectoryEntry(entry)) {
    throw new Error("The current path is not a folder.")
  }

  return {
    ...entry,
    name: basename(entry.path),
    type: entry.type,
  } as DirectoryFsEntry
}

async function fetchTreeEntries(path: string, signal: AbortSignal) {
  const response = await fsClient.fs.tree.get({
    query: { depth: 1, path },
    fetch: { signal },
  })
  if (response.error) throw new Error(rpcErrorMessage(response.error))

  return (response.data as TreeResult).entries
}

async function fetchRecentEntries(signal: AbortSignal) {
  const response = await fsClient.fs.recents.get({
    query: { limit: RECENT_LIMIT },
    fetch: { signal },
  })

  if (response.error) throw new Error(rpcErrorMessage(response.error))

  return (response.data as RecentResult).entries
}

async function recordRecent(entry: PickedFsEntry) {
  const response = await fsClient.fs.recents.post({ path: entry.path })
  if (response.error) throw new Error(rpcErrorMessage(response.error))
}

async function streamFindEntries(
  path: string,
  query: string,
  mode: FilePickerMode,
  signal: AbortSignal,
  onEntries: (entries: FsEntry[]) => void
) {
  const matches: FindMatch[] = []
  const seenPaths = new Set<string>()
  const scope = path === ROOT_PATH ? "system" : "current"

  await streamFindScope(
    path,
    query,
    mode,
    scope,
    matches,
    seenPaths,
    signal,
    SEARCH_SCOPE_TIMEOUT_MS,
    () => {
      onEntries(fallbackEntries(matches, query))
    }
  )

  if (signal.aborted) throw new DOMException("Aborted", "AbortError")

  return fallbackEntries(matches, query)
}

async function streamFindScope(
  path: string,
  query: string,
  mode: FilePickerMode,
  scope: SearchScope,
  matches: FindMatch[],
  seenPaths: Set<string>,
  signal: AbortSignal,
  timeoutMs: number | null,
  onMatch: () => void
) {
  const scopedSignal = scopedSearchSignal(signal, timeoutMs)

  try {
    for await (const event of streamFindEvents(
      path,
      query,
      mode,
      scopedSignal
    )) {
      if (appendFindMatch(event, matches, seenPaths, scope)) {
        onMatch()
        continue
      }

      if (event.event === "error") throw new Error(findEventError(event.data))
      if (event.event === "done") return
    }
  } catch (error) {
    if (scopedSignal.aborted) return
    throw error
  } finally {
    cleanupSearchSignal(scopedSignal)
  }
}

function appendFindMatch(
  event: EdenSseEvent,
  matches: FindMatch[],
  seenPaths: Set<string>,
  scope: SearchScope
) {
  if (event.event !== "match") return false

  const match = findEventMatch(event.data)
  if (!match) return false
  if (seenPaths.has(match.path)) return false

  seenPaths.add(match.path)
  matches.push({ ...match, searchScope: scope })
  return true
}

function fallbackEntry(match: FindMatch): FsEntry {
  return {
    birthtimeMs: match.birthtimeMs ?? 0,
    mtimeMs: match.mtimeMs ?? 0,
    name: basename(match.path),
    path: match.path,
    searchScope: match.searchScope,
    size: match.size ?? 0,
    targetType: match.targetType,
    type: match.type,
  }
}

async function* streamFindEvents(
  path: string,
  query: string,
  mode: FilePickerMode,
  signal: AbortSignal
): AsyncGenerator<EdenSseEvent> {
  const response = await fsClient.fs.find.events.get({
    query: {
      caseSensitive: false,
      entryType: searchEntryType(mode),
      includeContent: false,
      includeNames: true,
      limit: SEARCH_LIMIT,
      matchMode: "literal",
      path,
      query,
      wholeWord: false,
    },
    fetch: { signal },
  })
  if (response.error)
    throw new Error(`Search failed with status ${response.status}`)
  if (!response.data)
    throw new Error("Search response did not include a stream.")

  yield* parseEdenSseStream(response.data)
}

function searchEntryType(mode: FilePickerMode) {
  if (mode === "folder") return "directory"

  return undefined
}

function scopedSearchSignal(signal: AbortSignal, timeoutMs: number | null) {
  if (timeoutMs === null) return signal

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
  const abort = () => controller.abort()
  signal.addEventListener("abort", abort, { once: true })
  searchSignalCleanup.set(controller.signal, () => {
    window.clearTimeout(timeout)
    signal.removeEventListener("abort", abort)
  })

  return controller.signal
}

function cleanupSearchSignal(signal: AbortSignal) {
  const cleanup = searchSignalCleanup.get(signal)
  if (!cleanup) return

  cleanup()
  searchSignalCleanup.delete(signal)
}

function fallbackEntries(matches: FindMatch[], query: string) {
  return matches.map(fallbackEntry).sort(compareSearchEntries(query))
}

function findEventMatch(data: unknown): FindMatch | null {
  if (!data || typeof data !== "object") return null
  if (!("match" in data)) return null
  if (!isFindMatch(data.match)) return null

  return data.match
}

function isFindMatch(match: unknown): match is FindMatch {
  if (!match || typeof match !== "object") return false
  if (!("kind" in match) || match.kind !== "name") return false
  if (!("path" in match) || typeof match.path !== "string") return false
  if (!("source" in match) || !isFindMatchSource(match.source)) return false
  if (!("type" in match) || !isFsEntryType(match.type)) return false
  if ("targetType" in match && !isOptionalFsEntryType(match.targetType)) {
    return false
  }
  if ("size" in match && !isOptionalNumber(match.size)) return false
  if ("mtimeMs" in match && !isOptionalNumber(match.mtimeMs)) return false
  if ("birthtimeMs" in match && !isOptionalNumber(match.birthtimeMs)) {
    return false
  }

  return true
}

function isFindMatchSource(source: unknown) {
  return source === "disk" || source === "open-buffer"
}

function isOptionalFsEntryType(type: unknown): type is FsEntryType | undefined {
  if (type === undefined) return true

  return isFsEntryType(type)
}

function isFsEntryType(type: unknown): type is FsEntryType {
  return (
    type === "file" ||
    type === "directory" ||
    type === "symlink" ||
    type === "other"
  )
}

function isOptionalNumber(value: unknown) {
  if (value === undefined) return true

  return typeof value === "number"
}

function findEventError(data: unknown) {
  if (!data || typeof data !== "object") return "Search failed."

  const payload = data as FindErrorEvent
  return payload.error?.message ?? "Search failed."
}
