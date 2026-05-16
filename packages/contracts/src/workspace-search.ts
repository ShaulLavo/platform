import type { EntryTypeFilter } from "./tree-entry"

export type WorkspaceSearchSource = "disk" | "open-buffer"
export type WorkspaceSearchMatchMode = "literal" | "regex"

export type WorkspaceSearchQuery = {
  caseSensitive?: boolean
  entryType?: EntryTypeFilter
  excludeGlobs?: readonly string[]
  includeContent: boolean
  includeGlobs?: readonly string[]
  includeNames?: boolean
  limit: number
  matchMode?: WorkspaceSearchMatchMode
  maxDepth?: number
  path: string
  query: string
  wholeWord?: boolean
}

export type WorkspaceSearchMatch = {
  birthtimeMs?: number
  column?: number
  endColumn?: number
  kind: "name" | "content"
  line?: number
  mtimeMs?: number
  path: string
  preview?: string
  previewStartColumn?: number
  size?: number
  source: WorkspaceSearchSource
  targetType?: EntryTypeFilter
  type: EntryTypeFilter
}

export type WorkspaceSearchDoneEvent = {
  count: number
  path: string
  query: string
  truncated: boolean
  type: "done"
}

export type WorkspaceSearchEvent =
  | {
      match: WorkspaceSearchMatch
      type: "match"
    }
  | WorkspaceSearchDoneEvent
  | {
      code: string
      message: string
      type: "error"
    }
