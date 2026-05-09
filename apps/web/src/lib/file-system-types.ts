import type { TreeEntry as ContractsTreeEntry } from "@workspace/contracts"

export type {
  EntryTypeFilter as FsEntryType,
  FileResult,
} from "@workspace/contracts"

export type TreeEntry = ContractsTreeEntry & {
  children?: TreeEntry[]
}

export type TreeResult = {
  path: string
  entries: TreeEntry[]
}
