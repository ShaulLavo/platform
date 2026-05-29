import type { FsEntry, PickedFsEntry } from '@/lib/file-system-types'
import { isDirectoryEntry } from '@/lib/file-system-types'
import {
  fetchRecentEntries as fetchSharedRecentEntries,
  fetchServerInfo as fetchSharedServerInfo,
  fetchTree,
  recordRecentEntry,
  statPath,
} from '@/lib/file-server'
import { clientErrors } from '@/lib/structured-errors'

import { basename, type DirectoryFsEntry, type FilePickerMode } from './model'
import { streamPickerSearchEntries } from './picker-search'

export type DirectoryLoadData = {
  currentEntry: DirectoryFsEntry | null
  entries: FsEntry[]
}

const RECENT_LIMIT = 30

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

export function fetchServerInfo(signal: AbortSignal) {
  return fetchSharedServerInfo(signal)
}

export function fetchRecentEntries(signal: AbortSignal) {
  return fetchSharedRecentEntries(RECENT_LIMIT, signal)
}

export async function recordRecent(entry: PickedFsEntry) {
  await recordRecentEntry(entry.path)
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

  return streamPickerSearchEntries(path, trimmedQuery, mode, signal, onEntries)
}

async function fetchCurrentEntry(path: string, signal: AbortSignal) {
  const entry = await statPath(path, signal)
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
  const result = await fetchTree(path, signal)
  return result.entries
}
