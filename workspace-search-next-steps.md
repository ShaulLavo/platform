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

V1 is still literal, case-insensitive search. This is behind the Zed project search baseline, with VS Code as the secondary comparison point.

Remaining work:

- Add case-sensitive toggle.
- Add regex toggle.
- Add whole-word toggle.
- Add include/exclude glob fields.
- Make provider contract carry these options, not UI-local state.
- Ensure `/fs/find` and `/fs/find/events` stay backward compatible.
- Add server-side translation into `rg`/`fd` flags and client-side open-buffer parity.

References:

- `/Users/shaul/Desktop/Editors/zed/crates/search/src/project_search.rs`
- `/Users/shaul/Desktop/Editors/zed/crates/project/src/project_search.rs`
- `/Users/shaul/Desktop/Editors/vscode/src/vs/workbench/contrib/search/common/constants.ts`
- `/Users/shaul/Desktop/Editors/vscode/src/vs/workbench/contrib/search/browser/searchView.ts`
- `/Users/shaul/Desktop/Editors/vscode/src/vs/workbench/contrib/search/browser/searchWidget.ts`

### 3. Replace In Files

We do not have replace support in the search buffer yet. Model the flow against Zed project search first, then use VS Code’s mature replace model for edge cases and UI detail.

Remaining work:

- Extend contracts with replace preview data.
- Add replace string state to search buffers.
- Add per-match, per-file, and replace-all actions.
- Respect dirty buffers and conflict cases.
- Preserve exact ranges across replace preview, open, and apply.
- Add undo/rollback strategy or rely on existing file-write history if available.

References:

- `/Users/shaul/Desktop/Editors/zed/crates/search/src/project_search.rs`
- `/Users/shaul/Desktop/Editors/vscode/src/vs/workbench/contrib/search/browser/searchTreeModel/match.ts`
- `/Users/shaul/Desktop/Editors/vscode/src/vs/workbench/contrib/search/browser/searchTreeModel/fileMatch.ts`
- `/Users/shaul/Desktop/Editors/vscode/src/vs/workbench/contrib/search/browser/replace.ts`
- `/Users/shaul/Desktop/Editors/vscode/src/vs/workbench/contrib/search/browser/media/searchview.css`

### 4. Result Tree Semantics

The current result list is grouped and virtualized, but it is not a full editor-grade tree. Match Zed’s result navigation and result-buffer behavior first; use VS Code’s tree model for additional accessibility, commands, and polish.

Remaining work:

- Add collapse-all / expand-all.
- Persist collapse state during reruns when the file path is still present.
- Add active result selection and next/previous match commands.
- Add keyboard focus model for rows.
- Add ARIA roles for tree/treeitem semantics.
- Add stable row IDs across rerenders and batching.
- Add richer counts: total matches, file count, active match index.

References:

- `/Users/shaul/Desktop/Editors/zed/crates/search/src/project_search.rs`
- `/Users/shaul/Desktop/Editors/vscode/src/vs/workbench/contrib/search/browser/searchResultsView.ts`
- `/Users/shaul/Desktop/Editors/vscode/src/vs/workbench/contrib/search/browser/searchTreeModel/searchTreeCommon.ts`
- `/Users/shaul/Desktop/Editors/vscode/src/vs/workbench/contrib/search/browser/searchTreeModel/searchResult.ts`
- `/Users/shaul/Desktop/Editors/vscode/src/vs/workbench/contrib/search/browser/searchTreeModel/folderMatch.ts`
- `/Users/shaul/Desktop/Editors/vscode/src/vs/workbench/contrib/search/common/constants.ts`

### 5. Search Result Editor Fidelity

Zed renders project search results as an editor-like multibuffer with excerpts. This is a primary Zed-parity item. Our virtual search buffer is editor-like only at the tab level.

Remaining work:

- Decide whether search-buffer tabs should remain React list views or become real editor/multibuffer documents.
- If staying React-based, add editor-like affordances: active row cursor, find-like next/previous, reveal current, and copy result lines.
- If moving toward a real document, model file headers and excerpts as readonly virtual content with embedded ranges.
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
