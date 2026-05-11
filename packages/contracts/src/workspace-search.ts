import type { EntryTypeFilter } from "./tree-entry"

export type WorkspaceSearchSource = "disk" | "open-buffer"

export type WorkspaceSearchQuery = {
  caseSensitive?: boolean
  entryType?: EntryTypeFilter
  includeContent: boolean
  limit: number
  matchMode?: "literal"
  maxDepth?: number
  path: string
  query: string
}

export type WorkspaceSearchMatch = {
  column?: number
  endColumn?: number
  kind: "name" | "content"
  line?: number
  path: string
  preview?: string
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
