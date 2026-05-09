import type { TreeEntry as ContractsTreeEntry } from "@workspace/contracts"

export type {
  EntryTypeFilter as FsEntryType,
  FileResult,
} from "@workspace/contracts"
import type { EntryTypeFilter } from "@workspace/contracts"

export type SearchScope = "current" | "system"

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

export type StatResult = Omit<FsEntry, "children" | "name">

export type FindMatch = {
  kind: "name" | "content"
  path: string
  type: EntryTypeFilter
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

export type PickedFsEntry = FsEntry & {
  type: "file" | "directory"
}
