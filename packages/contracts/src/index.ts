export type { EntryTypeFilter, TreeEntry } from "./tree-entry"
export type { FileResult } from "./file-result"
export type { WatchClientMessage, WatchServerMessage } from "./watch-events"
export {
  normalizeTerminalCols,
  normalizeTerminalRows,
  parseTerminalClientMessage,
  parseTerminalServerMessage,
  TERMINAL_MAX_COLS,
  TERMINAL_MAX_ROWS,
  TERMINAL_MIN_COLS,
  TERMINAL_MIN_ROWS,
  type TerminalClientMessage,
  type TerminalServerMessage,
} from "./terminal"
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
export {
  compareFuzzyRankedTargets,
  compareFuzzyRanks,
  fuzzyRank,
  fuzzyRankScore,
  type FuzzyRank,
  type FuzzyRankTarget,
} from "./fuzzy-rank"
export type { ErrorCategory } from "./error-category"
export { isRecord } from "./is-record"
