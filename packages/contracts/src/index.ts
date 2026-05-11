export type { EntryTypeFilter, TreeEntry } from "./tree-entry"
export type { FileResult } from "./file-result"
export type { WatchClientMessage, WatchServerMessage } from "./watch-events"
export type {
  WorkspaceSearchDoneEvent,
  WorkspaceSearchEvent,
  WorkspaceSearchMatchMode,
  WorkspaceSearchMatch,
  WorkspaceSearchQuery,
  WorkspaceSearchSource,
} from "./workspace-search"
export {
  createWorkspaceSearchMatcher,
  workspaceSearchGlobPatterns,
  type WorkspaceSearchMatcher,
  type WorkspaceSearchTextMatch,
} from "./workspace-search-match"
export type { ErrorCategory } from "./error-category"
export { isRecord } from "./is-record"
