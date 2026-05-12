# Workspace Search Next Steps

This tracks the remaining work to bring the current provider/search-buffer implementation to Zed parity first. VS Code is a secondary reference for mature details, especially when Zed does not expose a behavior clearly or when we want additional polish after the Zed-shaped flow works.

Priority rule for every item:

1. Match Zed project search behavior first.
2. Use VS Code to fill gaps, validate edge cases, or improve polish after the Zed baseline is clear.
3. If Zed and VS Code differ, document the product choice before implementing the VS Code-shaped behavior.

## Current Local Implementation

- Shared contract: `/Users/shaul/Desktop/platform/packages/contracts/src/workspace-search.ts`
- Server disk provider: `/Users/shaul/Desktop/platform/apps/server/src/fs/search.ts`
- Server endpoint adapter: `/Users/shaul/Desktop/platform/apps/server/src/app.ts`
- Web providers: `/Users/shaul/Desktop/platform/apps/web/src/features/search/search-providers.ts`
- Search buffer state: `/Users/shaul/Desktop/platform/apps/web/src/features/search/search-buffer-state.tsx`
- Search runtime/batching/dirty overlay: `/Users/shaul/Desktop/platform/apps/web/src/features/search/use-search-buffer.ts`
- Virtualized results view: `/Users/shaul/Desktop/platform/apps/web/src/features/search/search-results-view.tsx`
- Result row display/highlighting: `/Users/shaul/Desktop/platform/apps/web/src/features/search/search-match-row.tsx`
- Match display window helper: `/Users/shaul/Desktop/platform/apps/web/src/features/search/search-match-display.ts`
- Search editor tab shell: `/Users/shaul/Desktop/platform/apps/web/src/features/search/search-buffer-editor.tsx`
- Sidebar controller: `/Users/shaul/Desktop/platform/apps/web/src/components/workspace/workspace-search-pane.tsx`

## Product Behavior Still Missing

### 1. Separate Text Search From File Search

Zed and VS Code primarily treat workspace search as content search. For Zed-first parity, default workspace search should stay content-focused. Filename lookup should be a separate workflow in practice, or at least rendered as a file-level result rather than a fake line match.

Product choice: the sidebar workspace search is content-only. No filename-search workflow is planned.

Status: Done for the Zed-first sidebar baseline.

Completed:

- Sidebar workspace search issues content-only queries by default.
- Filename hits remain visually separate and do not inflate content match counts when lower-level callers enable name search.
- Name-only hits render as file-level rows instead of collapsible content groups.

References:

- `/Users/shaul/Desktop/Editors/zed/crates/project/src/project_search.rs`
- `/Users/shaul/Desktop/Editors/zed/crates/search/src/project_search.rs`
- `/Users/shaul/Desktop/Editors/vscode/src/vs/workbench/contrib/search/browser/searchTreeModel/match.ts`
- `/Users/shaul/Desktop/Editors/vscode/src/vs/workbench/contrib/search/browser/searchTreeModel/fileMatch.ts`
- `/Users/shaul/Desktop/Editors/vscode/src/vs/workbench/contrib/search/browser/searchResultsView.ts`

### 2. First-Class Search Modes

Workspace search now has first-class search options in the shared contract and in the sidebar/search-buffer flow.

Status: Done for the Zed-first sidebar/search-buffer baseline.

Completed:

- Added case-sensitive, regex, and whole-word options.
- Added include/exclude glob fields behind a compact filter toggle.
- Extended `WorkspaceSearchQuery` so providers receive the search mode and glob options.
- Kept `/fs/find` and `/fs/find/events` backward compatible with defaults for older callers.
- Added server-side `rg`/`fd` option translation and matching fallback support.
- Added dirty open-buffer parity using the shared matcher.
- Kept search mode selections stable through reruns and cleared query text.
- Added focused tests for disk search, endpoint query parsing, URL serialization, open-buffer parity, and search-buffer option state.

References:

- `/Users/shaul/Desktop/Editors/zed/crates/search/src/project_search.rs`
- `/Users/shaul/Desktop/Editors/zed/crates/project/src/project_search.rs`
- `/Users/shaul/Desktop/Editors/vscode/src/vs/workbench/contrib/search/common/constants.ts`
- `/Users/shaul/Desktop/Editors/vscode/src/vs/workbench/contrib/search/browser/searchView.ts`
- `/Users/shaul/Desktop/Editors/vscode/src/vs/workbench/contrib/search/browser/searchWidget.ts`

### 3. Replace In Files

Workspace search now has Zed-shaped replace support in the sidebar/search-buffer flow. Cached/open editor sessions are edited in memory and marked dirty; unopened clean files are patched through the existing file-write path with mtime checks.

Status: Done for the Zed-first sidebar/search-buffer baseline.

Completed:

- Added replace text, visibility, status, and summary/error state to search buffers.
- Added replace controls to the sidebar and search-buffer editor.
- Added replace-next, per-match, per-file, and replace-all actions.
- Added a client-side planner for literal and regex replacement, including capture groups.
- Validates each search match against current file/session text before editing.
- Applies cached/open-file replacements through editor document sessions and dirty tracking.
- Applies unopened-file replacements through fetch, validated patching, and `/fs/write` with mtime checks.
- Reruns the active search after successful replace so stale matches disappear.
- Surfaces concise summaries for skipped matches, failed files, and partial replace results.
- Added focused tests for replace planning, replace runner behavior, and replace state persistence.

References:

- `/Users/shaul/Desktop/Editors/zed/crates/search/src/project_search.rs`
- `/Users/shaul/Desktop/Editors/vscode/src/vs/workbench/contrib/search/browser/searchTreeModel/match.ts`
- `/Users/shaul/Desktop/Editors/vscode/src/vs/workbench/contrib/search/browser/searchTreeModel/fileMatch.ts`
- `/Users/shaul/Desktop/Editors/vscode/src/vs/workbench/contrib/search/browser/replace.ts`
- `/Users/shaul/Desktop/Editors/vscode/src/vs/workbench/contrib/search/browser/media/searchview.css`

### 4. Result Tree Semantics

Workspace search now has editor-grade result tree semantics for the grouped, virtualized React result list. It keeps Zed-shaped active match navigation and collapse behavior as the baseline, with VS Code-shaped ARIA tree semantics and row labels for accessibility.

Status: Done for the Zed-first sidebar/search-buffer baseline.

Completed:

- Added stable result row IDs for file groups, content matches, and filename-only rows.
- Added active result state shared by the sidebar and search-buffer editor.
- Added collapse-all and expand-all result controls.
- Preserved and pruned collapse state across reruns when file paths remain present.
- Added previous/next match navigation with wrapping and collapsed-parent reveal.
- Added local keyboard navigation for visible result rows.
- Added ARIA `tree` / `treeitem` roles with level, selected, expanded, and active descendant state.
- Added richer summary counts for total matches, file count, and active match index.
- Added focused tests for row ID stability, collapse state, active selection, navigation wrapping, hidden-match reveal, and keyboard helper semantics.

References:

- `/Users/shaul/Desktop/Editors/zed/crates/search/src/project_search.rs`
- `/Users/shaul/Desktop/Editors/vscode/src/vs/workbench/contrib/search/browser/searchResultsView.ts`
- `/Users/shaul/Desktop/Editors/vscode/src/vs/workbench/contrib/search/browser/searchTreeModel/searchTreeCommon.ts`
- `/Users/shaul/Desktop/Editors/vscode/src/vs/workbench/contrib/search/browser/searchTreeModel/searchResult.ts`
- `/Users/shaul/Desktop/Editors/vscode/src/vs/workbench/contrib/search/browser/searchTreeModel/folderMatch.ts`
- `/Users/shaul/Desktop/Editors/vscode/src/vs/workbench/contrib/search/common/constants.ts`

### 5. Search Result Editor Fidelity

Zed renders project search results as an editor-like multibuffer with excerpts. This is a primary Zed-parity item. Our virtual search buffer is editor-like only at the tab level.

Product choice: keep the sidebar as the compact result tree, and render search-buffer tabs as readonly editor-backed virtual result documents.

Status: Partially done for the Zed-first search-buffer tab baseline.

Completed:

- Search-buffer tabs render grouped results as readonly virtual editor documents when matches exist.
- File headers and excerpt lines are generated from structured search state with source mappings back to paths and matches.
- Active search result state syncs with the editor cursor and selection, including reveal of the current match.
- Enter opens the source file or match for the current generated line.
- Editor find and native selection/copy behavior are available inside result tabs.
- Destructive edit keybindings and text input are blocked for the generated result document.

Remaining work:

- Use the structured result editor refactor plan as the canonical path for
  replacing the current temporary mega-document renderer:
  `/Users/shaul/Desktop/platform/docs/search-result-editor-refactor-plan.md`
- Add richer multibuffer styling for file headers and excerpts if the plain text projection feels too flat.
- Decide whether result tabs should be live views of the active search or saved snapshots.
- Support multiple saved search result tabs if needed.

References:

- `/Users/shaul/Desktop/Editors/zed/crates/search/src/project_search.rs`
- `/Users/shaul/Desktop/Editors/zed/crates/project/src/project_search.rs`
- `/Users/shaul/Desktop/Editors/vscode/src/vs/workbench/contrib/search/browser/searchResultsView.ts`

### 6. Ordering, Batching, And Limits

We batch events now, but ordering and limits are still simple. Match Zed’s ordering, merge, and limit behavior first; use VS Code for warning/count presentation details after that.

Remaining work:

- Preserve stable file ordering while streaming content and dirty-buffer overlays.
- Define whether open-buffer matches should appear before disk matches or merge into disk order.
- Track both match-count and file-count limits.
- Surface partial result warnings without replacing the result state.
- Add per-provider timing/progress stats.

References:

- `/Users/shaul/Desktop/Editors/zed/crates/project/src/project_search.rs`
- `/Users/shaul/Desktop/Editors/zed/crates/search/src/project_search.rs`
- `/Users/shaul/Desktop/Editors/vscode/src/vs/workbench/contrib/search/browser/searchTreeModel/searchResult.ts`
- `/Users/shaul/Desktop/Editors/vscode/src/vs/workbench/contrib/search/browser/searchTreeModel/textSearchHeading.ts`

### 7. Dirty Buffer Overlay Robustness

Current dirty overlay scans dirty cached editor text and suppresses stale disk content hits for the same path. Use Zed’s project-search/open-buffer behavior as the baseline, then compare VS Code for additional range and lifecycle edge cases.

Remaining work:

- Add tests for dirty buffer changes while a disk search is still streaming.
- Add explicit behavior for clean open buffers whose disk content changes during search.
- Add behavior for renamed/deleted dirty buffers during active search.
- Confirm match range correctness for CRLF, Unicode, tabs, and long lines.
- Consider using a unified document snapshot contract so disk and open-buffer providers return identical preview/range semantics.

References:

- `/Users/shaul/Desktop/Editors/zed/crates/project/src/project_search.rs`
- `/Users/shaul/Desktop/Editors/vscode/src/vs/workbench/contrib/search/browser/searchTreeModel/fileMatch.ts`
- `/Users/shaul/Desktop/Editors/vscode/src/vs/workbench/contrib/search/browser/searchTreeModel/match.ts`

### 8. Error And Warning Model

We now tolerate `rg` exit code `2` as partial success, but the product model still needs warning support. Use Zed as the first behavioral baseline, then VS Code for secondary distinctions and wording.

Remaining work:

- Extend `WorkspaceSearchEvent` with a `warning` event.
- Show nonfatal provider warnings in the summary area or a small details popover.
- Preserve prior results on fatal errors when useful, with clear status.
- Distinguish cancellation, no results, truncated results, partial results, and hard failure.

References:

- `/Users/shaul/Desktop/Editors/zed/crates/search/src/project_search.rs`
- `/Users/shaul/Desktop/Editors/vscode/src/vs/workbench/contrib/search/browser/searchView.ts`
- `/Users/shaul/Desktop/Editors/vscode/src/vs/workbench/contrib/search/browser/searchModel.ts`

### 9. Preview And Highlight Fidelity

We added `previewStartColumn` and match-centered display windows, but the preview model is still minimal. Match Zed’s excerpt/result-buffer display first; use VS Code’s preview object model when it fills in missing range/highlight detail.

Remaining work:

- Match Zed excerpt display first, then move closer to VS Code’s preview object model where useful: full preview text plus range-in-preview.
- Support multiple ranges in one preview line as one row if desired, or intentionally keep one row per match.
- Handle multi-line matches when regex support lands.
- Add high-contrast-safe highlight styling.
- Add active match highlight distinct from passive match highlight.

References:

- `/Users/shaul/Desktop/Editors/zed/crates/search/src/project_search.rs`
- `/Users/shaul/Desktop/Editors/vscode/src/vs/workbench/contrib/search/browser/searchTreeModel/match.ts`
- `/Users/shaul/Desktop/Editors/vscode/src/vs/workbench/contrib/search/browser/media/searchview.css`

### 10. Test Coverage Still Needed

Tests should verify Zed-first behavior before adding VS Code-specific parity cases.

Remaining work:

- UI smoke tests for large result sets and virtualization.
- Search editor/sidebar shared state tests.
- Keyboard navigation tests.
- Collapse-all and per-file collapse tests.
- Include/exclude glob tests once implemented.
- Regex/case/whole-word parity tests across disk and open-buffer providers.
- Error/warning stream tests for partial `rg` failures.
- Dirty-buffer rename/delete tests.

References:

- `/Users/shaul/Desktop/Editors/zed/crates/search/src/project_search.rs`
- `/Users/shaul/Desktop/Editors/vscode/src/vs/workbench/contrib/search/test/browser/searchModel.test.ts`
- `/Users/shaul/Desktop/Editors/vscode/src/vs/workbench/contrib/search/test/browser/searchNotebookHelpers.test.ts`
