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
import { clientErrors, createRpcError } from '@/lib/structured-errors'
import { streamWorkspaceSearch } from '@/lib/workspace-search-client'

import {
  ROOT_PATH,
  basename,
  compareSearchEntries,
  type DirectoryFsEntry,
  type FilePickerMode,
} from './state'

export type DirectoryLoadData = {
  currentEntry: DirectoryFsEntry | null
  entries: FsEntry[]
}

const SEARCH_LIMIT = 80
const SEARCH_SCOPE_TIMEOUT_MS = 6000
const RECENT_LIMIT = 30

const searchSignalCleanup = new WeakMap<AbortSignal, () => void>()

export async function loadDirectoryData(
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

export async function fetchServerInfo(signal: AbortSignal) {
  const response = await client.health.get({
    fetch: { signal },
  })

  if (response.error) throw createRpcError(response.error)

  return response.data as ServerInfo
}

export async function fetchRecentEntries(signal: AbortSignal) {
  const response = await client.fs.recents.get({
    query: { limit: RECENT_LIMIT },
    fetch: { signal },
  })

  if (response.error) throw createRpcError(response.error)

  return (response.data as RecentResult).entries
}

export async function recordRecent(entry: PickedFsEntry) {
  const response = await client.fs.recents.post({ path: entry.path })
  if (response.error) throw createRpcError(response.error)
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
