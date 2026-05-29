import { client } from '@/lib/client'
import type { WorkspaceSearchEvent } from '@workspace/contracts'
import type {
  FindMatch,
  FsEntry,
  PickedFsEntry,
  RecentResult,
  SearchScope,
  ServerInfo,
  StatResult,
  TreeResult,
} from '@/lib/file-system-types'
import { isDirectoryEntry } from '@/lib/file-system-types'
import { filePickerKeys } from '@/lib/query-keys'
import { clientErrors, createRpcError } from '@/lib/structured-errors'
import { streamWorkspaceSearch } from '@/lib/workspace-search-client'
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { useEffect, useEffectEvent } from 'react'

import {
  ROOT_PATH,
  basename,
  compareSearchEntries,
  errorMessage,
  loadingLoadState,
  type DirectoryFsEntry,
  type FilePickerMode,
  type LoadState,
} from './state'

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
  onClose: () => void,
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
  const queryKey = filePickerKeys.directory(currentPath, effectiveQuery, mode, reloadVersion)
  const query = useQuery<DirectoryLoadData>({
    enabled,
    placeholderData: (previousData) => previousData,
    queryFn: ({ signal }) =>
      loadDirectoryData(currentPath, effectiveQuery, mode, signal, (entries) => {
        if (signal.aborted) return

        queryClient.setQueryData(queryKey, (current: DirectoryLoadData | undefined) => ({
          currentEntry: current?.currentEntry ?? null,
          entries,
        }))
      }),
    queryKey,
  })

  return {
    currentEntry: query.isPlaceholderData ? null : (query.data?.currentEntry ?? null),
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
  onEntries: (entries: FsEntry[]) => void,
): Promise<DirectoryLoadData> {
  const [currentEntry, entries] = await Promise.all([
    fetchCurrentEntry(path, signal),
    loadEntries(path, query, mode, signal, onEntries),
  ])

  return { currentEntry, entries }
}

function directoryLoadState(query: UseQueryResult<DirectoryLoadData>, enabled: boolean): LoadState {
  if (!enabled) return { status: 'loading' }
  if (query.isError) return { status: 'error', message: errorMessage(query.error) }
  if (query.isPlaceholderData && query.data) {
    return loadingLoadState({ status: 'ready', entries: query.data.entries })
  }
  if (query.data) return { status: 'ready', entries: query.data.entries }
  if (query.isPending) return { status: 'loading' }

  return { status: 'idle' }
}

function entriesLoadState(query: UseQueryResult<FsEntry[]>, enabled: boolean): LoadState {
  if (!enabled) return { status: 'loading' }
  if (query.data) return { status: 'ready', entries: query.data }
  if (query.isError) return { status: 'error', message: errorMessage(query.error) }
  if (query.isPending) return { status: 'loading' }

  return { status: 'idle' }
}

async function loadEntries(
  path: string,
  query: string,
  mode: FilePickerMode,
  signal: AbortSignal,
  onEntries: (entries: FsEntry[]) => void,
) {
  const trimmedQuery = query.trim()
  if (!trimmedQuery) return fetchTreeEntries(path, signal)

  return streamSearchEntries(path, trimmedQuery, mode, signal, onEntries)
}

async function fetchServerInfo(signal: AbortSignal) {
  const response = await client.health.get({
    fetch: { signal },
  })

  if (response.error) throw createRpcError(response.error)

  return response.data as ServerInfo
}

async function fetchCurrentEntry(path: string, signal: AbortSignal) {
  const response = await client.fs.stat.get({
    query: { path },
    fetch: { signal },
  })
  if (response.error) throw createRpcError(response.error)

  const entry = response.data as StatResult
  if (!isDirectoryEntry(entry)) {
    throw clientErrors.CURRENT_PATH_NOT_FOLDER()
  }

  return {
    ...entry,
    name: basename(entry.path),
    type: entry.type,
  } as DirectoryFsEntry
}

async function fetchTreeEntries(path: string, signal: AbortSignal) {
  const response = await client.fs.tree.get({
    query: { depth: 1, path },
    fetch: { signal },
  })
  if (response.error) throw createRpcError(response.error)

  return (response.data as TreeResult).entries
}

async function fetchRecentEntries(signal: AbortSignal) {
  const response = await client.fs.recents.get({
    query: { limit: RECENT_LIMIT },
    fetch: { signal },
  })

  if (response.error) throw createRpcError(response.error)

  return (response.data as RecentResult).entries
}

async function recordRecent(entry: PickedFsEntry) {
  const response = await client.fs.recents.post({ path: entry.path })
  if (response.error) throw createRpcError(response.error)
}

async function streamSearchEntries(
  path: string,
  query: string,
  mode: FilePickerMode,
  signal: AbortSignal,
  onEntries: (entries: FsEntry[]) => void,
) {
  const matches: FindMatch[] = []
  const seenPaths = new Set<string>()
  const scope = path === ROOT_PATH ? 'system' : 'current'

  await streamSearchScope(
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
    },
  )

  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

  return fallbackEntries(matches, query)
}

async function streamSearchScope(
  path: string,
  query: string,
  mode: FilePickerMode,
  scope: SearchScope,
  matches: FindMatch[],
  seenPaths: Set<string>,
  signal: AbortSignal,
  timeoutMs: number | null,
  onMatch: () => void,
) {
  const scopedSignal = scopedSearchSignal(signal, timeoutMs)

  try {
    for await (const event of streamWorkspaceSearch(
      {
        caseSensitive: false,
        entryType: searchEntryType(mode),
        includeContent: false,
        includeNames: true,
        limit: SEARCH_LIMIT,
        matchMode: 'literal',
        path,
        query,
        wholeWord: false,
      },
      scopedSignal,
    )) {
      if (appendSearchMatch(event, matches, seenPaths, scope)) {
        onMatch()
        continue
      }

      if (event.type === 'done') return
    }
  } catch (error) {
    if (scopedSignal.aborted) return
    throw error
  } finally {
    cleanupSearchSignal(scopedSignal)
  }
}

function appendSearchMatch(
  event: WorkspaceSearchEvent,
  matches: FindMatch[],
  seenPaths: Set<string>,
  scope: SearchScope,
) {
  if (event.type !== 'match') return false

  const match = event.match
  if (match.kind !== 'name') return false
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
    version: fallbackEntryVersion(match.mtimeMs ?? 0, match.size ?? 0),
  }
}

function fallbackEntryVersion(mtimeMs: number, size: number) {
  return `search:${mtimeMs}:${size}`
}

function searchEntryType(mode: FilePickerMode) {
  if (mode === 'folder') return 'directory'

  return undefined
}

function scopedSearchSignal(signal: AbortSignal, timeoutMs: number | null) {
  if (timeoutMs === null) return signal

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
  const abort = () => controller.abort()
  signal.addEventListener('abort', abort, { once: true })
  searchSignalCleanup.set(controller.signal, () => {
    window.clearTimeout(timeout)
    signal.removeEventListener('abort', abort)
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
