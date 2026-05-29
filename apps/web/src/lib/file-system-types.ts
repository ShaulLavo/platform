import {
  effectiveEntryType,
  type FileTreeEntry,
  type WorkspaceSearchMatch,
} from '@workspace/contracts'

export {
  effectiveEntryType,
  isDirectoryEntry,
  isFileEntry,
  type FileResult,
  type FileSystemEntryMetadata as StatResult,
  type FileTreeEntry as TreeEntry,
  type FileTreeResult as TreeResult,
} from '@workspace/contracts'

export type SearchScope = 'current' | 'system'

export type FsEntry = FileTreeEntry & {
  searchScope?: SearchScope
}

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

export function isPickedFsEntry(entry: FsEntry): entry is PickedFsEntry {
  const type = effectiveEntryType(entry)
  return type === 'file' || type === 'directory'
}
