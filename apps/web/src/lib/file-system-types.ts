import type {
  EntryTypeFilter,
  TreeEntry as ContractsTreeEntry,
  WorkspaceSearchMatch,
} from '@workspace/contracts'

export type { FileResult } from '@workspace/contracts'

export type FsEntryType = EntryTypeFilter

export type SearchScope = 'current' | 'system'

export type TreeEntry = ContractsTreeEntry & {
  children?: TreeEntry[]
}

export type FsEntry = TreeEntry & {
  searchScope?: SearchScope
}

export type TreeResult = {
  path: string
  entries: FsEntry[]
}

export type StatResult = Omit<FsEntry, 'children' | 'name'>

export type FindMatch = WorkspaceSearchMatch & {
  searchScope?: SearchScope
}

export type RecentResult = {
  entries: FsEntry[]
}

export type ServerInfo = {
  ok: boolean
  workspaceRoot: string
  defaultPath: string
  homePath: string
}

export type PickedFsEntry = FsEntry &
  (
    | {
        type: 'file' | 'directory'
      }
    | {
        type: 'symlink'
        targetType: 'file' | 'directory'
      }
  )

export function effectiveEntryType(entry: EntryTypeCarrier): FsEntryType {
  return entry.targetType ?? entry.type
}

export function isDirectoryEntry(entry: EntryTypeCarrier) {
  return effectiveEntryType(entry) === 'directory'
}

export function isFileEntry(entry: EntryTypeCarrier) {
  return effectiveEntryType(entry) === 'file'
}

export function isPickedFsEntry(entry: FsEntry): entry is PickedFsEntry {
  const type = effectiveEntryType(entry)
  return type === 'file' || type === 'directory'
}

type EntryTypeCarrier = {
  type: FsEntryType
  targetType?: FsEntryType
}
