# Workspace Search Foundation Plan

Status: draft

This plan covers the workspace search foundation work that should happen before replacing or augmenting ripgrep for content search. It intentionally does not propose replacing ripgrep. The goal is to get closer to Zed's workspace model first: a hot workspace path and file metadata index owned by the app, with ripgrep kept as the content-search backend.

## Scope

In scope:

- Workspace search rooted at the currently open workspace.
- Workspace quick-open / workspace file-name search.
- Server-owned workspace file metadata and path index.
- Faster name/path search without spawning `fd` on every query.
- Better metadata for future file handling, such as binary/image/text classification.
- Ripgrep argument and result-processing cleanup while keeping ripgrep as the content engine.

Out of scope:

- Replacing ripgrep with `ngi`, `trigrep`, Zoekt, or another indexed content engine.
- Whole-filesystem file picker search.
- Current-file editor find.
- AST search, semantic search, vector search, or agent retrieval.
- Persistent semantic symbol indexing.

## Current Shape

The server disk provider currently lives in `apps/server/src/fs/search.ts`.

- Name search uses `fd`.
- Content search uses `rg --json`.
- If both name and content search are enabled, name search runs before content search.
- Name matches and content matches call `safeEntryStats` before emitting result metadata.
- The fallback walker in `apps/server/src/fs/search-fallback.ts` already demonstrates a single-process search path, but it is only used when external tools are unavailable.

The client search provider stack lives in `apps/web/src/features/search/search-providers.ts`.

- Open/dirty buffers are searched in memory first.
- Disk results for dirty open-buffer paths are suppressed so stale persisted content does not leak into results.
- This overlay should remain independent of the server index for now.

The server already has useful infrastructure:

- `FileChangeHub` in `apps/server/src/fs/watch.ts` emits filesystem changes.
- `FsMetadataStore` in `apps/server/src/fs/metadata.ts` stores picked/recent entry metadata, but it is not a complete workspace index.
- `defaultIgnoredNames` in `apps/server/src/fs/path.ts` defines common ignored directories.

## Product Boundaries

There are three different search surfaces. They should not be collapsed into one implementation contract.

Workspace search:

- Rooted at the open workspace.
- Uses workspace ignore policy.
- Supports text content search and result grouping.
- Overlays dirty open buffers.

Workspace quick-open / workspace file picker:

- Rooted at the open workspace.
- Primarily path/name ranking.
- Can reuse the same workspace path index.
- Does not need content search.

System file picker / whole-filesystem search:

- Searches outside the workspace.
- Should not depend on workspace index readiness.
- Needs separate limits, cancellation, permissions, mounted-volume behavior, and privacy rules.
- Can keep using external traversal/search for now.

## Design

Add a server-owned workspace index service.

The first version should be in memory. Add persistence only after the index model and invalidation behavior are proven. The index is derived data and must be rebuildable at any time.

Each indexed entry should include:

- Workspace-relative path.
- Basename.
- Entry type and target type.
- Size, mtime, birthtime.
- Directory/file/symlink/fifo distinctions.
- Hidden flag.
- Default-ignored and gitignored flags where possible.
- File extension and coarse file kind.
- Text/binary/image-ish content kind from extension plus first-byte sniffing.
- A cheap path character prefilter, similar to Zed's `CharBag`.

The index should expose:

- Readiness state: cold, building, ready, stale, failed.
- Entry count and file count.
- Last full scan time.
- Last incremental update time.
- Rebuild reason and current scan root.
- A safe fallback path when the index is unavailable.

## Ignore Policy

Use app-owned ignore policy for the index, then make ripgrep/fd fallback behavior match it as closely as possible.

Initial index ignore sources:

- `defaultIgnoredNames`.
- Root `.gitignore` support equivalent to the current `workspaceGitIgnoreMatcher`.
- Include/exclude globs from search queries at query time.

Later ignore improvements:

- Nested `.gitignore`.
- Global git ignore.
- `.ignore`.
- Explicit workspace settings for always-included or always-excluded paths.

## Path Search

Replace `fd` for workspace name/path search with an index provider.

Candidate selection:

- Reject ignored paths early.
- Reject entry types that do not match the query.
- Apply include/exclude globs.
- Use a path `CharBag` prefilter for fuzzy search.
- Use literal substring matching for literal mode.
- Preserve current fuzzy ranking behavior initially.

Result metadata:

- Use metadata from the index instead of statting each emitted match.
- Stat lazily only if an entry is stale or missing required metadata.
- Surface target type for symlinks.

Fallback:

- If the index is building or failed, keep the current `fd` provider.
- If index results look stale, prefer rebuilding or validating affected paths rather than silently returning bad entries.

## Content Search While Keeping Ripgrep

Keep `rg` as the content engine in this plan.

Improvements:

- Add `--no-config` so user/global ripgrep config cannot change app behavior.
- Consider `--crlf` for better CRLF regex anchor behavior.
- Consider `--engine auto` for regex mode.
- Add explicit thread control if we expose or tune it.
- Audit include/exclude glob anchoring against VS Code behavior.
- Cache stats per path during a single search.
- Avoid repeated `safeEntryStats` calls for multiple match events from the same file.
- Run path/name and content providers concurrently when both are requested, if the UI can handle interleaving.
- Keep JSON output unless a measured alternative is clearly better.

The workspace path index can optionally prefilter content search by path, entry type, file kind, and binary status. It should not try to prove text matches in this plan.

## Incremental Updates

Use `FileChangeHub` as the initial update source.

Update rules:

- Created path: stat and index the new entry.
- Changed file: restat and refresh metadata and file kind.
- Deleted path: remove entry and children.
- Renamed path: move existing entry/subtree when possible; otherwise remove old and scan new.

Operational behavior:

- Coalesce bursts of filesystem events.
- Mark affected entries stale while refresh is pending.
- Fall back to targeted rescan when events are ambiguous.
- Fall back to full rebuild after watcher failure or too many missed events.

## Implementation Phases

### Phase 0: Measurement

- Add provider timing for name search, content search, stat calls, first result, and total duration.
- Count stat calls per search and per path.
- Record whether results came from `fd`, index, `rg`, or fallback.
- Add a small repeatable benchmark script for workspace search queries.

### Phase 1: Index Model And Full Scan

- Add a workspace index module under `apps/server/src/fs`.
- Build an in-memory entry map keyed by relative path.
- Add full scan with default ignored directories.
- Add status reporting for debugging.
- Add focused tests around path normalization, ignored paths, symlinks, binary detection, and stale entries.

### Phase 2: Watcher-Driven Updates

- Connect the index to `FileChangeHub`.
- Add event coalescing and targeted refresh.
- Add rebuild-on-failure behavior.
- Test create, change, delete, rename, and ignored-path events.

### Phase 3: Name Search Provider

- Add a `PathIndexSearchProvider`.
- Replace `fd` for workspace name search when the index is ready.
- Keep `fd` fallback.
- Preserve current result contract and ranking.
- Add parity tests against the current `fd` behavior for representative workspaces.

### Phase 4: File Kind And Binary Metadata

- Add first-byte sniffing for ambiguous files.
- Mark binary/text/image-like files.
- Use this metadata to skip obvious binary files for content search candidates.
- Reuse the metadata later for opening images or non-text files in richer viewers.

### Phase 5: Ripgrep Query Cleanup

- Add `--no-config`.
- Audit CRLF, regex engine, multiline, case sensitivity, whole word, include/exclude glob handling.
- Add per-search stat cache.
- Add tests for query-to-ripgrep-args behavior.

### Phase 6: Product Integration

- Reuse the workspace path index for workspace quick-open.
- Keep system file picker search separate.
- Add debug UI/logging for index status if needed.
- Document fallback behavior and rebuild controls.

Phase 6 integration notes:

- Workspace quick-open calls the workspace search endpoint with `includeContent: false`, `includeNames: true`, `entryType: file`, and fuzzy matching. When the server workspace index is ready, that request uses the index-backed name provider; otherwise it falls back to the existing `fd` path.
- General file picker search remains its own product surface. It can stream name-only search results for the currently browsed filesystem scope, but it does not use fuzzy quick-open semantics or content search.
- Root/system file picker searches send `useWorkspaceIndex: false`, so they keep using the existing filesystem search path even when the workspace index is ready.
- `/health` exposes `workspaceIndex` status for debugging: readiness, counts, scan root, scan timings, stale entry count, warning/skipped counts, rebuild reason, and any failure message.
- Rebuilds are controlled by the server-owned index lifecycle. The index rebuilds at startup for configured workspace roots, rebuilds when the root `.gitignore` changes, rebuilds after too many coalesced watcher events, and rebuilds/marks failed after watcher or incremental-update failures. Search remains usable through `fd` or fallback while the index is cold, building, stale, or failed.

## Acceptance Criteria

- Workspace name/path search does not spawn `fd` when the index is ready.
- Workspace quick-open can use the same path index for workspace scope.
- Content search still uses ripgrep and preserves existing correctness.
- Dirty open-buffer overlay behavior is unchanged.
- Index rebuild is safe and does not corrupt source data.
- Search still works while the index is building, via fallback.
- Tests cover initial scan, watcher updates, path search, stale fallback, and ripgrep arg generation.

## Risks

- Watchers can miss events or emit ambiguous events.
- Ignore semantics can diverge from `fd`/`rg`.
- Index build can be expensive in huge workspaces.
- Symlink handling can create loops or duplicate paths if not constrained.
- Returning stale metadata is worse than falling back to a slower tool.

## References

- Our server search: `apps/server/src/fs/search.ts`
- Our fallback walker: `apps/server/src/fs/search-fallback.ts`
- Our watcher hub: `apps/server/src/fs/watch.ts`
- Our metadata store: `apps/server/src/fs/metadata.ts`
- Zed worktree snapshot: `/Users/shaul/Desktop/D/Editors/zed/crates/worktree/src/worktree.rs`
- Zed fuzzy path matching: `/Users/shaul/Desktop/D/Editors/zed/crates/fuzzy/src/paths.rs`
- VS Code ripgrep text search: `/Users/shaul/Desktop/D/Editors/vscode/src/vs/workbench/services/search/node/ripgrepTextSearchEngine.ts`
