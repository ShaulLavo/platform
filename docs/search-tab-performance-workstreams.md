# Search Tab Performance Workstreams

## Source Trace

- Trace file: `/Users/shaul/Downloads/Trace-20260513T172814.json`
- Captured: `2026-05-13T14:28:14.492Z`
- Breadcrumb window: `12.28s`
- App target in trace: `localhost:5173` web app with `localhost:3001` server
- Workspace searched: `Users/shaul/Desktop/platform`
- Main observed query path: `/fs/find/events`

Important caveat: this trace was captured in Vite/dev mode with React DevTools instrumentation. Absolute timings are inflated, but the repeated bottleneck shape is clear enough to plan work.

## Executive Summary

The search tab bottleneck is primarily frontend result rendering after streamed search events arrive. The search endpoint itself is not the dominant issue in this trace.

Observed request timings:

| Query | Case sensitive | Duration | Chunks | Payload |
| --- | --- | ---: | ---: | ---: |
| `const` | true | `174.8ms` | 18 | `14.5KB` |
| `const` | false | `286.7ms` | 27 | `54.0KB` |
| `c` | false | `343.9ms` | 32 | `18.9KB` |
| `co` | false | `256.4ms` | 46 | `54.2KB` |
| `con` | false | `160.0ms` | 40 | `53.8KB` |
| `cons` | false | `266.3ms` | 27 | `59.7KB` |
| `const` | false | `142.8ms` | 43 | `54.3KB` |

UI symptoms:

- `119` dropped frames in the trace window.
- Search-result updates line up with `58ms` to `216ms` main-thread tasks.
- React commits are clustered around streamed result chunks and query changes.
- Result editor rows trigger editor layout, gutter/plugin, text measurement, and DOM cleanup work.

## Current Hot Spots

### 1. Streamed Search Batches Trigger Too Many UI Commits

Files:

- `/Users/shaul/Desktop/platform/apps/web/src/features/search/use-search-buffer.ts`
- `/Users/shaul/Desktop/platform/apps/web/src/features/search/search-buffer-state.tsx`

Current behavior:

- `SEARCH_BATCH_SIZE = 50`
- `SEARCH_BATCH_MS = 24`
- Each flush calls `appendEvents`, then rebuilds snapshot state.
- Each append causes `matches`, grouped results, result rows, and editor view models to become new references.

Trace evidence:

- Main-thread long tasks occur immediately after `/fs/find/events` chunks and completions.
- React profiler repeatedly reports `groups` and `matches` as referentially unequal, sometimes deeply equal.

### 2. Search Result Editor Surface Is Expensive During Loading

Files:

- `/Users/shaul/Desktop/platform/apps/web/src/features/search/search-buffer-editor.tsx`
- `/Users/shaul/Desktop/platform/apps/web/src/features/search/search-result-editor-surface.tsx`
- `/Users/shaul/Desktop/Editor/packages/editor/src/editor/Editor.ts`
- `/Users/shaul/Desktop/Editor/packages/editor/src/plugins.ts`
- `/Users/shaul/Desktop/Editor/packages/editor/src/virtualization/virtualizedTextViewRows.ts`

Current behavior:

- Search tabs switch to `SearchResultEditorSurface` as soon as groups exist.
- The surface builds file blocks, virtual rows, editor pool slots, editor documents, range decorations, line gutters, find plugins, and optional syntax plugins.
- Pool slots keep hidden editor instances mounted.
- When the same file receives more streamed matches, the file block/editor document can be recreated, which can reload syntax/search highlights for excerpts that were already rendered.

Trace evidence:

- CPU profile repeatedly points at React layout effects, `Editor.setPlugins`, `syncPlugins`, `setGutterContributions`, row reconcile/remove, and editor text metrics.
- `SearchResultEditorSurface`, `SearchResultDocumentBoundary`, `SearchResultFileEditorPoolSlot`, and `SearchResultFileEditor` appear repeatedly in React profiler markers.

### 3. Per-Row Width Measurement Adds Layout Pressure

Files:

- `/Users/shaul/Desktop/platform/apps/web/src/features/search/search-results-view.tsx`
- `/Users/shaul/Desktop/platform/apps/web/src/features/search/search-match-row.tsx`
- `/Users/shaul/Desktop/Editor/packages/editor/src/virtualization/browserMetrics.ts`

Current behavior:

- The result list measures container width and match row preview width via `clientWidth` and `ResizeObserver`.
- Editor text metrics build cache keys by reading computed styles and measuring probes.

Trace evidence:

- CPU profile self time includes `get clientWidth`, `browserTextMetricsCacheKey`, and `measureBrowserTextMetrics`.
- React layout effects are a major inclusive cost.

### 4. Referential Instability Keeps Components Updating

Files:

- `/Users/shaul/Desktop/platform/apps/web/src/features/search/search-buffer-editor.tsx`
- `/Users/shaul/Desktop/platform/apps/web/src/features/search/search-results-view.tsx`
- `/Users/shaul/Desktop/platform/apps/web/src/features/search/search-result-items.ts`
- `/Users/shaul/Desktop/platform/apps/web/src/features/search/search-result-view-model.ts`
- `/Users/shaul/Desktop/platform/apps/web/src/features/search/search-buffer-state.tsx`

Current behavior:

- Group arrays, match arrays, row items, option objects, callbacks, and fallback elements are recreated frequently.
- `resetKey` changes with `snapshot.matches.length`, which can force boundary reset behavior during streaming.

Trace evidence:

- React profiler flags `groups`, `matches`, `options`, handlers, `fallback`, `resetKey`, and `children` as referentially unequal.
- `SearchResultsView` total React timing was one of the largest named component totals.

### 5. Measurement Is Not Yet Product-Representative

Files:

- `/Users/shaul/Desktop/platform/apps/web/src/features/search/search-result-editor-surface.perf-entry.tsx`
- `/Users/shaul/Desktop/platform/package.json`
- `/Users/shaul/Desktop/platform/apps/web/package.json`

Current state:

- The trace is useful for direction, but it is dev-mode and includes React DevTools overhead.
- We need repeatable profiling fixtures to validate improvements.

Trace evidence:

- CPU profile includes React DevTools extension work such as `measureHostInstance`.
- Initial profiler startup contributes noise at the beginning of the trace.

## Parallel Workstreams

These workstreams are designed so different people can work in parallel with low merge-conflict risk. Each stream should land with focused tests or profiling evidence.

### Workstream A: Search Event Batching And Scheduling

Goal: reduce React commit frequency while preserving streamed feedback.

Owner write scope:

- `/Users/shaul/Desktop/platform/apps/web/src/features/search/use-search-buffer.ts`
- `/Users/shaul/Desktop/platform/apps/web/src/features/search/search-buffer-state.test.ts`

Tasks:

1. [x] Replace fixed `50 events / 24ms` flushing with frame-aware or adaptive batching.
2. Consider flushing at most once per animation frame while loading.
3. Flush immediately for terminal events (`done`, `error`) after pending matches are appended.
4. Keep first-results latency reasonable, possibly with a small first batch and larger later batches.
5. Add tests that prove match events are batched, terminal events flush pending matches, and aborted runs do not commit stale batches.

Acceptance criteria:

- For a 200-match streamed search, commit count is materially lower than today.
- First visible results still appear quickly.
- No stale results appear after typing a new query.
- Existing search-buffer tests pass.

Risks:

- Too-large batches can make search feel frozen.
- Terminal event ordering must remain correct.

### Workstream B: Incremental Search State And Stable Group References

Goal: stop rebuilding all derived result objects on every append.

Owner write scope:

- `/Users/shaul/Desktop/platform/apps/web/src/features/search/search-buffer-state.tsx`
- `/Users/shaul/Desktop/platform/apps/web/src/features/search/search-result-items.ts`
- `/Users/shaul/Desktop/platform/apps/web/src/features/search/search-buffer-state.test.ts`

Tasks:

1. Investigate storing grouped results or a path index in search state instead of deriving all groups from `matches` on every render.
2. Preserve existing group object references when a streamed batch appends to other files.
3. Preserve the existing group object and existing match object identities when a streamed batch appends more matches to the same file.
4. Avoid deeply equal but referentially new `matches` arrays for unchanged file groups.
5. Expose enough stable per-file identity that the result editor can distinguish "same file with appended excerpts" from "new file/document".
6. Keep collapse pruning, active result resolution, replace actions, and navigation semantics intact.

Acceptance criteria:

- Appending matches to one file does not replace every existing group object.
- Appending matches to one file keeps already-rendered matches for that file referentially stable.
- React profiler no longer reports broad deeply-equal `groups[*].matches` churn.
- Existing result navigation and collapse tests pass.

Risks:

- Search state is central; this can affect replace, active result navigation, and collapse state.
- Coordinate with Workstream A to avoid duplicating batching logic.

### Workstream C: Lightweight Loading Surface For Search Tabs

Goal: avoid mounting heavy editor-backed result rows for every streamed update while search is still loading.

Owner write scope:

- `/Users/shaul/Desktop/platform/apps/web/src/features/search/search-buffer-editor.tsx`
- `/Users/shaul/Desktop/platform/apps/web/src/features/search/search-result-editor-surface.tsx`
- `/Users/shaul/Desktop/platform/apps/web/src/features/search/search-result-editor-surface.perf-entry.tsx`

Tasks:

1. Decide whether search tabs should render the lightweight `SearchResultsView` while status is `loading`, then switch to `SearchResultEditorSurface` when ready.
2. Alternatively, keep `SearchResultEditorSurface` mounted but render file headers and plain preview rows until the result set is stable.
3. Remove `snapshot.matches.length` from `SearchResultDocumentBoundary` reset keys if it causes avoidable boundary churn during streaming.
4. Defer editor pool slot creation until results are ready or until the user focuses/selects a result.
5. Add perf fixture coverage for loading-state result streaming.

Acceptance criteria:

- Streaming updates no longer mount or update editor instances for every batch.
- The search tab remains usable while loading.
- Ready-state structured editor behavior remains intact.
- The fallback list still works if the structured editor errors.

Risks:

- Switching surfaces can cause scroll/focus jumps.
- Product behavior should stay clear: loading and ready states should not feel like different products.

### Workstream D: Editor Plugin And Gutter Deferral

Goal: reduce editor-core work for readonly search result excerpts.

Owner write scope:

- `/Users/shaul/Desktop/platform/apps/web/src/features/search/search-result-editor-surface.tsx`
- `/Users/shaul/Desktop/Editor/packages/editor/src/plugins.ts`
- `/Users/shaul/Desktop/Editor/packages/editor/src/virtualization/virtualizedTextViewRows.ts`
- `/Users/shaul/Desktop/Editor/packages/gutters/src/lineGutter.ts`

Tasks:

1. Audit why `setPlugins`, `syncPlugins`, `setGutterContributions`, and gutter row removal run so often.
2. Ensure plugin arrays and gutter plugin instances stay stable when file identity and options are unchanged.
3. Preserve syntax highlight sessions for the same file/language when streamed batches only append new excerpts.
4. Update range decorations incrementally where possible so existing match highlights are not torn down and recreated.
5. Consider a cheaper source-line display path for search result excerpts that does not use full gutter plugin lifecycle.
6. Keep syntax and find plugins disabled until idle, ready, or explicit editor focus.
7. Reduce hidden editor pool slot churn.

Acceptance criteria:

- Profiling shows less time in `Editor.setPlugins`, `syncPlugins`, gutter contribution updates, and row removal.
- When `rg` yields additional matches for the same file, existing rendered excerpts keep their syntax/search highlights and only new excerpt rows do incremental work.
- Search result excerpt selection/open behavior remains correct.
- No regressions in normal editor tabs.

Risks:

- Editor-core changes can affect unrelated editor surfaces.
- Keep editor-core changes small and covered by tests or targeted manual verification.

### Workstream E: Remove Per-Row Layout Measurement

Goal: eliminate `clientWidth` and `ResizeObserver` per visible row in search results.

Owner write scope:

- `/Users/shaul/Desktop/platform/apps/web/src/features/search/search-results-view.tsx`
- `/Users/shaul/Desktop/platform/apps/web/src/features/search/search-match-row.tsx`
- `/Users/shaul/Desktop/platform/apps/web/src/features/search/search-match-display.ts`

Tasks:

1. Replace per-row `useMeasuredPreviewMaxLength` with a parent-level width or fixed max preview model.
2. Prefer CSS truncation where exact preview character count is not necessary.
3. If replacement previews require length control, compute one max length per list width and pass it down.
4. Ensure open-buffer `unsaved` badge and replace button still fit.
5. Add tests for preview window logic if the match display helper changes.

Acceptance criteria:

- No per-row `ResizeObserver` for search match previews.
- No visible preview regressions in compact and wide layouts.
- Profiling shows less layout-effect and `clientWidth` activity.

Risks:

- Preview text may become less centered around the match if width handling is too crude.
- Verify narrow sidebar and wide search-tab layouts separately.

### Workstream F: Profiling Harness And Regression Budget

Goal: make performance improvements measurable and repeatable.

Owner write scope:

- `/Users/shaul/Desktop/platform/apps/web/src/features/search/search-result-editor-surface.perf-entry.tsx`
- `/Users/shaul/Desktop/platform/scripts`
- `/Users/shaul/Desktop/platform/package.json`
- `/Users/shaul/Desktop/platform/docs`

Tasks:

1. Add or document a production-mode profiling workflow for the search tab.
2. Disable React DevTools during the baseline run.
3. Capture standard scenarios:
   - first query from empty state
   - typing `c` -> `co` -> `con` -> `cons` -> `const`
   - toggling case-sensitive
   - selecting results while loading
   - ready-state scroll through 200 matches
4. Track metrics:
   - dropped frames
   - number of long tasks over `50ms`
   - worst main-thread task
   - search request duration
   - React commits during one search
   - time to first result
   - time to ready state
5. Save before/after traces or summaries in a consistent place.

Acceptance criteria:

- Each performance PR can compare against a repeatable baseline.
- Dev-mode and prod-mode numbers are clearly separated.
- The team has a simple checklist for validating regressions.

Risks:

- Browser trace automation can be flaky.
- Do not block implementation on perfect automation; a documented manual workflow is enough for the first pass.

### Workstream G: Backend Search Sanity Check

Goal: confirm backend search is not hiding a second-order issue.

Owner write scope:

- `/Users/shaul/Desktop/platform/apps/server/src/fs/search.ts`
- `/Users/shaul/Desktop/platform/apps/server/src/app.ts`
- `/Users/shaul/Desktop/platform/apps/web/src/features/search/search-providers.ts`
- `/Users/shaul/Desktop/platform/packages/contracts/src/workspace-search.ts`

Tasks:

1. Add server-side timing/progress logging behind a dev flag or trace event if appropriate.
2. Check whether `/fs/find/events` chunks can be coalesced server-side without hurting first-result latency.
3. Confirm abort behavior cancels `rg` promptly when the query changes.
4. Confirm payload size is not inflated by unnecessary preview data.
5. Keep this lower priority unless a production trace shows network/backend time dominating.

Acceptance criteria:

- Query changes abort stale work quickly.
- Event payloads contain only data used by the UI.
- Server timings can explain request duration when needed.

Risks:

- Backend changes will not solve the main frontend long tasks by themselves.
- Coordinate event-shape changes with Workstreams A and B.

## Suggested Delegation Plan

Parallel round 1:

- Person 1: Workstream A
- Person 2: Workstream E
- Person 3: Workstream F
- Person 4: Workstream C design spike, without broad editor-core edits
- Person 5: Workstream G quick sanity check

Parallel round 2:

- Person 1: Workstream B after Workstream A decides batch semantics
- Person 2: Workstream D after Workstream C identifies which editor work remains during loading
- Person 3: Re-profile and compare before/after traces

Coordination points:

- Workstreams A and B both touch search state update behavior.
- Workstreams C and D both touch the structured editor surface.
- Workstream F should define the measurement format before other streams report wins.
- Workstream G should not change event contracts without talking to A and B.

## Target Performance Budget

Initial budget for the search tab:

- No long task over `100ms` for a 200-result search in production mode.
- Fewer than `3` long tasks over `50ms` during a single query completion.
- First visible result under `150ms` after the server emits the first match batch.
- Ready-state rendering should not drop a visible sequence of frames.
- Typing into the search input should keep input event handling under one frame budget for common queries.

These are starting targets, not final product SLAs. Update them after the first production-mode baseline.

## Verification Checklist

Run after each workstream:

1. Search for `const` in `/Users/shaul/Desktop/platform`.
2. Type through `c`, `co`, `con`, `cons`, `const`.
3. Toggle case-sensitive, regex, whole-word, and filters.
4. Select next/previous match while results are loading.
5. Collapse and expand result groups.
6. Open a result into the editor.
7. Run replace-next and replace-all smoke checks if the touched code can affect replace.
8. Capture a new trace or at least record dropped frames and long tasks.

Likely test commands:

```sh
bun test apps/web/src/features/search
bun test apps/server/src/fs
```

Use the repo's actual package scripts if they differ for the current branch.

## Open Product Questions

- Should search tabs show live streaming results, or should they show a lightweight loading list and only switch to the editor surface when ready?
- Should search tabs preserve a snapshot of results, or always mirror the latest active search?
- Is syntax highlighting required during loading, or only after user focus / idle / ready?
- Is exact preview truncation worth layout measurement cost, or is CSS truncation good enough?

## Definition Of Done For The Whole Effort

- A production-mode trace confirms the frontend long-task clusters are reduced.
- Search input remains responsive while typing common queries.
- Streaming still provides useful early feedback.
- Structured search result tabs retain keyboard navigation, open-result behavior, collapse/expand, and replace controls.
- Tests cover batching, state stability, active result behavior, and any editor-core changes.
