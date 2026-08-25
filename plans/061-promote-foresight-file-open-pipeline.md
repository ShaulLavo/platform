# Plan 061: Promote Foresight intent into prepared editor opens

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in the "STOP conditions"
> section occurs, stop and report; do not improvise. When done, delete this completed plan, remove
> its row from `plans/README.md`, and remove the now-finished 060/061 dependency note, following the
> repository's cleanup policy. Keep the activation transaction in the landed typed file-tab
> handler/context and do not recreate the deleted command-factory path. Also
> close/remove the finished 061 item from authoritative root `PLAN.md` if the approved 060 -> 061
> sequence was scheduled there.
>
> Execute Plan 060 first so both changes share one authoritative-paint signal, one open benchmark,
> and one reconciliation pass through the dirty Editor worktree. The preparation architecture does
> not depend on persisted snapshot contents: Plan 060's frame is unvalidated visual paint, while
> every artifact promoted here must match exact live or server identity.
>
> **Post-060 prerequisite check (run before this plan's drift checks)**:
>
> ```bash
> rg -n "EditorInitialHighlightStatus|EditorInitialPaintEvent|onInitialPaint" \
>   ../Editor/packages/editor/src \
>   ../Editor/packages/react/src \
>   apps/web/src/features/editor/components/editor.tsx
> rg -n "appliedThemeId" apps/web/src/features/editor/hooks/use-editor-color-theme.ts
> test -f apps/web/scripts/editor-open-benchmark.mjs
> rg -n "editor.authoritative_text_paint|editor.authoritative_highlight_paint" \
>   apps/web/scripts/editor-open-benchmark.mjs apps/web/src
> ```
>
> Expected: the landed generation-tagged `text`/`highlight-settled` event and both machine-readable
> benchmark marks exist. Reconcile renamed but equivalent symbols once; do not add a parallel paint
> callback, status, or benchmark script.
>
> **Platform drift check (run first)**:
>
> ```bash
> git diff --stat 36bf483c..HEAD -- \
>   apps/web/src/features/editor/components/editor.tsx \
>   apps/web/src/features/editor/state/commands.ts \
>   apps/web/src/features/editor/state/workspace-state.tsx \
>   apps/web/src/features/editor/tests/state.test.ts \
>   apps/web/src/features/editor/hooks/use-language-server-matches.ts \
>   apps/web/src/features/editor/providers/state-provider.tsx \
>   apps/web/src/features/editor/state/document-state.tsx \
>   apps/web/src/features/editor/state/color-theme-store.ts \
>   apps/web/src/features/editor/state/file-sync-service.ts \
>   apps/web/src/features/editor/state/performance-trace.ts \
>   apps/web/src/features/editor/state/syntax-highlighting.ts \
>   apps/web/src/features/editor/state/workspace-document-service.ts \
>   apps/web/src/features/editor/state/tests/color-theme-store.test.ts \
>   apps/web/src/features/editor/tests/file-sync-service.test.ts \
>   apps/web/src/features/editor/utils/render-document.ts \
>   apps/web/src/features/editor/utils/text-snapshot.ts \
>   apps/web/src/features/editor/hooks/tests/use-language-server-matches.test.tsx \
>   apps/web/src/features/workbench/components/editor-surface-tab-body.tsx \
>   apps/web/src/features/workbench/components/file-editor-body.tsx \
>   apps/web/src/features/workspace/hooks/use-file-tree-intent-prefetch.ts \
>   apps/web/src/features/workspace/hooks/use-tab-intent-prefetch.ts \
>   apps/web/src/features/workspace/utils/file-tree-prefetch.ts \
>   apps/web/src/features/workspace/utils/intent-prefetch-registry.ts \
>   apps/web/src/features/workspace/utils/tab-prefetch.ts \
>   apps/web/src/lib/file-snapshot-query-cache.ts \
>   apps/web/src/lib/tests/file-snapshot-query-cache.test.ts \
>   apps/web/scripts/editor-open-benchmark.mjs \
>   apps/web/package.json
> ```
>
> **Editor drift check (run first)**:
>
> ```bash
> git -C ../Editor diff --stat d68ac6e..HEAD -- \
>   packages/editor/src/editor.ts \
>   packages/editor/src/editor/Editor.ts \
>   packages/editor/src/editor/syntaxController.ts \
>   packages/editor/src/editor/types.ts \
>   packages/editor/src/index.ts \
>   packages/editor/src/plugins.ts \
>   packages/editor/src/shiki/plugin.ts \
>   packages/editor/src/shiki/workerClient.ts \
>   packages/editor/src/shiki/workerTypes.ts \
>   packages/editor/src/shiki/shiki.worker.ts \
>   packages/editor/src/syntax/session.ts \
>   packages/editor/src/virtualization/virtualizedTextView.ts \
>   packages/editor/src/virtualization/virtualizedTextViewLayout.ts \
>   packages/editor/src/virtualization/virtualizedTextViewInternals.ts \
>   packages/editor/test/public-api.test.ts \
>   packages/editor/test/shiki/workerClient.test.ts \
>   packages/editor/test/shiki/shiki-worker.test.ts \
>   packages/editor/test/shiki/workerTypes.test.ts \
>   packages/react/src/index.ts \
>   packages/react/test/useEditor.test.ts \
>   packages/tree-sitter/src/session.ts \
>   packages/tree-sitter/src/treeSitter/types.ts \
>   packages/tree-sitter/src/treeSitter/workerClient.ts \
>   packages/tree-sitter/src/treeSitter/treeSitter.worker.ts \
>   packages/tree-sitter/test/treeSitter-workerClient.test.ts \
>   packages/tree-sitter/test/treeSitter-worker.test.ts \
>   docs/architecture/phase-0/core-public-api.json
> git -C ../Editor diff --stat -- \
>   packages/editor/src/editor.ts \
>   packages/editor/src/editor/Editor.ts \
>   packages/editor/src/editor/syntaxController.ts \
>   packages/editor/src/editor/types.ts \
>   packages/editor/src/index.ts \
>   packages/editor/src/plugins.ts \
>   packages/editor/src/shiki/plugin.ts \
>   packages/editor/src/shiki/workerClient.ts \
>   packages/editor/src/shiki/workerTypes.ts \
>   packages/editor/src/shiki/shiki.worker.ts \
>   packages/editor/src/syntax/session.ts \
>   packages/editor/src/virtualization/virtualizedTextView.ts \
>   packages/editor/src/virtualization/virtualizedTextViewLayout.ts \
>   packages/editor/src/virtualization/virtualizedTextViewInternals.ts \
>   packages/editor/test/public-api.test.ts \
>   packages/editor/test/shiki/workerClient.test.ts \
>   packages/editor/test/shiki/shiki-worker.test.ts \
>   packages/editor/test/shiki/workerTypes.test.ts \
>   packages/react/src/index.ts \
>   packages/react/test/useEditor.test.ts \
>   packages/tree-sitter/src/session.ts \
>   packages/tree-sitter/src/treeSitter/types.ts \
>   packages/tree-sitter/src/treeSitter/workerClient.ts \
>   packages/tree-sitter/src/treeSitter/treeSitter.worker.ts \
>   packages/tree-sitter/test/treeSitter-workerClient.test.ts \
>   packages/tree-sitter/test/treeSitter-worker.test.ts \
>   docs/architecture/phase-0/core-public-api.json
> ```
>
> At planning time the Platform source tree is clean. The Editor tree has user-owned, uncommitted
> selection/reveal and cursor-history work in several of the drift-check files, including
> `Editor.ts`, `editor.ts`, `index.ts`, `public-api.test.ts`, the React binding, and the public API
> fixture. Preserve it. Capture `git -C ../Editor diff` before starting and review the combined diff;
> do not replace whole files or restore the planning-time versions.
>
> The stamped commits predate Plan 060 by design. After its prerequisite check passes, record the
> post-060 Platform and Editor HEADs/diffs as this plan's execution baseline. Treat the landed paint
> API, React forwarding, overlay, and benchmark changes as required inputs—not drift to remove.

> **Command-boundary handoff**: the typed CommandBus/file-tab boundary is landed. Implement Step 4
> in that handler/context and do not recreate a command factory path. Preserve
> “claim/ensure before active-selection publication” as a domain-command invariant and add a focused
> regression test; never move the transaction back into a React effect.

## Status

| Field                   | Value                                                                         |
| ----------------------- | ----------------------------------------------------------------------------- |
| Priority                | P1                                                                            |
| Effort                  | L                                                                             |
| Risk                    | High                                                                          |
| Execution order         | After Plan 060 (shared paint signal/benchmark and overlapping Editor changes) |
| Command-boundary order  | Extend the landed typed activation handler/context                            |
| Functional dependency   | None on Plan 060's persisted snapshot data                                    |
| Roadmap status          | Executable plan written; not yet scheduled in root `PLAN.md`                  |
| Planned Platform commit | `36bf483c`                                                                    |
| Planned Editor commit   | `d68ac6e`                                                                     |

## Outcome

A Foresight hit should do the expensive, transferable parts of opening a file before activation:

1. obtain the authoritative `FileResult`,
2. create or reuse the authoritative text buffer,
3. build the document-wide line index, indentation guess, and fallback folds,
4. start viewport-range structural work and the applicable highlighter refresh, and
5. prefetch the cheap language-server match response.

On click, completed or safely in-flight artifacts are promoted once into the normal
`WorkspaceDocumentService` and Editor lifecycles. The open path never waits for speculative work.
The editor still creates its DOM, measures the actual viewport, and paints mounted rows after
activation; this plan removes duplicate document scans and worker startup, not the renderer itself.

A retained live document is the fastest case: activation claims it before waiting for `FileResult`
and can create the tab view immediately. A clean disk candidate is claimed only after the normal
file query supplies the exact `FileResult.version`.

## Decisions fixed by this plan

1. **Keep the two Foresight adapters.** React tabs continue to use `useForesight`; imperative file
   tree rows continue to use the shared `ForesightManager` registry because they live in a Shadow
   DOM owned by `@workspace/tree`. Both adapters call one `FileOpenIntentService`.
2. **Do not update Foresight as part of this work.** At planning time the registry resolves
   `js.foresight@4.2.1` and `@foresightjs/react@1.0.0`, which are also the current package versions.
   Do not touch `bun.lock` or dependency ranges unless the drift check proves that fact changed and
   the new API is required.
3. **No new hash and no `ohash`.** The visual snapshot from Plan 060 remains keyed only by
   root/path/schema/theme because a wrong frame is disposable. Promotable artifacts need exact
   identity, but they already have it:
   - a clean disk candidate uses canonical server-relative `{ path, fileVersion }`, where
     `fileVersion` is the opaque `FileResult.version`;
   - a retained live document uses canonical `documentId`, `localRevision`, and the exact
     `PieceTableSnapshot` object for final validation.
     `rootPath` plus a service root generation are lifecycle/claim guards: the canonical path must be
     inside that selected root before an entry may be stored or claimed. They are not a second file id.
     Platform's file paths are relative to the server's fixed `FileSystemService` root and already
     include the selected-root prefix, so two disjoint roots' `src/a.ts` files have different canonical
     paths; nested roots that expose the same canonical path intentionally refer to the same underlying
     file/live buffer. Keep the existing path-keyed file query cache and one live document per canonical
     path. Use nested maps or explicit fields for speculative lifecycle ownership, but do not
     concatenate/hash values, root-scope duplicate authoritative data, recompute file versions in the
     browser, inspect a version prefix, or compare full text on the hot path.
4. **Prepare data, not a hidden editor.** Never mount an off-screen Editor, DOM row tree, minimap,
   canvas, `Range`, font measurement surface, or BiDi/wrap geometry. Those depend on the real host
   and remain demand work.
5. **Use one speculative owner.** `FileOpenIntentService` owns queued jobs, prepared entries,
   cancellation, TTL, and memory accounting. TanStack Query owns fetched server data.
   `WorkspaceDocumentService` remains the sole owner of live buffers/documents. The mounted Editor
   owns view state and syntax sessions after promotion.
6. **Promotion is synchronous and one-shot.** A prepared entry exposes a `take`/claim boundary.
   Matching payloads can be consumed once; a second consumer misses. An invalid, expired,
   superseded, or already-consumed payload is disposed and the existing open path runs immediately.
7. **Give every worker session a unique runtime id.** Logical `documentId` remains the public
   document/result identity, but Tree-sitter and Shiki workers must key open/edit/dispose state by a
   separately generated `runtimeSessionId`. Keep this field optional at the generic provider API so
   current diff/search/direct consumers do not all become runtime-id allocators. Built-in
   Tree-sitter and Shiki providers allocate a fresh id internally when it is omitted; Editor and the
   preparer pass an explicit id only when transfer/diagnostics must retain it. A speculative session,
   mounted editor, and second view of the same logical file may then coexist without overwriting or
   disposing each other's worker document. The transferred lease keeps the same runtime id after
   promotion.
8. **Transfer both syntax families independently.** Platform can have a structural Tree-sitter
   session and a Shiki highlighter session for the same document. A prepared lease therefore has
   separate `structural` and `highlighter` transfers, each with its own session, pending/ready
   result, coverage, provider identity, cancellation, and exactly-once disposal. In Shiki mode,
   prioritize highlighter work for the first visual while structural work may continue for folds,
   brackets, and captures. If a provider cannot transfer safely, do not pre-run that provider.
9. **Promote partial stages without waiting.** Core document-data preparation is separate from
   provider work. A ready buffer/line index may be claimed even when syntax is still queued. An
   already-started transferable syntax lease may move with its promise; unstarted stages remain
   absent and the mounted Editor demand-starts them without blocking. Claim never starts queued work.
10. **Prefer live state to disk, and claim it before the file query.** If an inactive tab already has
    a retained buffer, prepare against that buffer's current snapshot/revision. Never replace a
    dirty buffer with a prefetched `FileResult`, and never persist prepared runtime artifacts across
    reload. Activation first calls `claimLive`; only a miss follows the ordinary file-query path and
    later calls `claimClean`.
11. **Use bounded speculation.** Start with at most 8 prepared entries, 32 MiB of service-owned
    retained data, a 30-second idle TTL, and one CPU-heavy local preparation stage at a time across
    document-data scans, Shiki, and Tree-sitter.
    Network query deduplication remains TanStack Query's job. File-tree rows preserve their existing
    pre-query 1 MiB gate. Tab intents, whose producer lacks a known size, may query; after the
    returned `FileResult` reveals a file over 1 MiB, stop before buffer/syntax preparation and record
    `size-gated` until measurement justifies a larger budget.
12. **The prediction callback only enqueues.** Buffer construction and document scans run in a
    background/idle task after the shared query settles, never synchronously inside the Foresight
    callback or a pointer event. Measure scheduling delay and main-thread task duration.
13. **LSP prewarming stops at matching.** Move `/lsp/match` to a shared query so Foresight can fetch
    it. Do not start a language server, request semantic tokens/diagnostics, resolve definitions, or
    create the LSP editor plugin before activation.
14. **Install preparation atomically.** Core synchronizes the target plugin/provider set before
    document attachment, resets the outgoing generation, installs text plus validated line starts,
    adopts tab size/folds and both syntax transfers/results, then publishes/paints once. Calling the
    current `setContent` after token adoption would clear prepared tokens and is forbidden.
15. **Measure structural work as well as time.** A prepared-hit benchmark must prove that no file
    read, buffer construction, full-document line scan, new syntax/highlighter session creation, or
    duplicate worker request for covered work begins after activation. It must also report hit
    latency, miss latency, lead time, promotion stage, wasted intent count, bytes retained, and
    evictions.

## Ownership and lifecycle

| Artifact                            | Speculative owner             | Owner after activation      | Validation                                                                    | Disposal                            |
| ----------------------------------- | ----------------------------- | --------------------------- | ----------------------------------------------------------------------------- | ----------------------------------- |
| `FileResult`                        | TanStack Query                | TanStack Query              | root-generation guard + canonical path + opaque `file.version`                | Existing query GC/pruning           |
| New clean `EditorTextBuffer`        | `FileOpenIntentService` entry | `WorkspaceDocumentService`  | root-generation guard + canonical path/version, then exact snapshot reference | Entry eviction unless claimed       |
| Existing live buffer                | `WorkspaceDocumentService`    | unchanged                   | document id + local revision + exact snapshot reference                       | Existing retention policy           |
| Line starts/tab size/fallback folds | Prepared-open lease           | mounted Editor              | exact snapshot + language/config tags                                         | Lease eviction or Editor dispose    |
| Structural session/result/promise   | Prepared structural transfer  | Editor syntax controller    | exact snapshot + language + structural provider/config/coverage               | Exactly one owner calls `dispose()` |
| Highlighter session/result/promise  | Prepared highlighter transfer | Editor syntax controller    | exact snapshot + language + highlighter provider/theme/config/coverage        | Exactly one owner calls `dispose()` |
| LSP match response                  | TanStack Query                | TanStack Query              | root + match path                                                             | Query GC                            |
| Persisted visible frame             | Plan 060 local-storage cache  | nobody; visual overlay only | root/path/schema/theme only                                                   | Replaced/removed by Plan 060        |

The prepared service must not mirror a second authoritative document map. Its entries are
disposable leases. Promotion deletes the entry before handing the payload to the consumer, so a
re-entrant activation cannot take it twice. Claiming transfers ownership of any active cancellation
scope as well as the payload; a later root cleanup cannot abort work already owned by the live view.

## Current state

### Tabs and the file tree already share the fetch but not a prepared-open coordinator

`apps/web/src/features/workspace/hooks/use-tab-intent-prefetch.ts:12-30` registers React tab buttons
with `useForesight` and calls:

```ts
void prefetchFileSnapshotQuery(queryClient, target.path)
```

`apps/web/src/features/workspace/hooks/use-file-tree-intent-prefetch.ts:36-46` resolves each
imperative tree row, keeps directory prefetch behavior, and makes the same file-query call.
`apps/web/src/features/workspace/utils/intent-prefetch-registry.ts:21-77` is the correct Shadow DOM
adapter around `ForesightManager`; it is not a duplicate React hook to delete.

`apps/web/src/lib/file-snapshot-query-cache.ts:7-103` already gives selected-file reads and both
intent producers one query key, a five-second freshness window, in-flight deduplication, a two-minute
GC window, and a 64-entry bound. Keep this as the source of server-state bytes; do not put mutable
buffers or syntax sessions into the query cache.

### The live document service is the authoritative promotion target

`apps/web/src/features/editor/state/workspace-document-service.ts:161-179` reuses a dirty buffer and
reuses a clean document when its `fileVersion` matches. Otherwise it constructs a replacement.
`createFileDocument` at lines 523-540 currently makes an `EditorTextBuffer` and separately runs
`contentRevisionForText(file.content)`. The latter is another full-text FNV pass
(`apps/web/src/features/editor/utils/text-snapshot.ts:23-59`) even though a clean file already carries
an opaque content version from the server.

The service should adopt a claimed clean buffer instead of rebuilding it. For a clean file,
`fileContentRevision(file.version)` returns the `f:` namespace followed by the opaque version,
without hashing or interpreting the server value. This prevents collisions with edited `e:`
revisions while removing the full-text FNV pass. Dirty and unsynced documents retain their local
revision rules.
Update save completion so an unraced successful save advances both the file version and clean
content revision; a save raced by newer edits advances only sync file identity and preserves the
newer edited revision/dirty state.

### Editor attachment repeats document-wide setup

`../Editor/packages/editor/src/editor/Editor.ts:1252-1277` currently:

1. attaches the session,
2. creates fresh syntax/highlighter sessions,
3. guesses indentation width from full text,
4. asks the view to compute line starts while setting the document with `tokens: []`, and
5. schedules syntax refresh.

The owned-text document path repeats the same sequence at lines 1329-1356, but it has no external
buffer/snapshot identity to validate against and is not a safe promotion target in this plan. Leave
that path on normal demand setup. The view computes line starts in
`virtualizedTextViewLayout.ts:46-86`. Fallback folds later walk the full document in
`Editor.ts:2026-2079`.

The useful pre-activation boundary is therefore a buffer snapshot plus pure document-derived data
and transferable worker sessions. Browser measurements and mounted-row construction are not
portable and should not be cached.

### Syntax providers are already shareable, but sessions are currently Editor-owned

`apps/web/src/features/editor/state/syntax-highlighting.ts:35-139` owns shared Tree-sitter and Shiki
providers/worker owners. Core providers expose `createSession`, `refresh`, optional range queries,
and `dispose()` (`../Editor/packages/editor/src/syntax/session.ts:130-154` and
`../Editor/packages/editor/src/plugins.ts:148-169`).

`../Editor/packages/editor/src/editor/syntaxController.ts:197-215` always disposes prior sessions and
creates new ones. Its disposal paths at lines 439-493 cancel requests and dispose both session
families. Platform registers structural syntax and may also register Shiki highlighting; they are
not interchangeable stages. A throwaway prewarm would therefore erase the expensive work. The core
contract added by this plan must transfer the two leases independently with exactly-once disposal.

Both worker implementations currently use logical `documentId` as their mutable document-map key.
That makes a speculative session unsafe beside an already mounted editor for the same file: open,
edit, or dispose from either controller can affect the other. The internal runtime-session identity
must be separated before speculative worker work is enabled.

### The server already supplies exact clean-file identity

`apps/server/src/fs/read.ts:23-42` returns `FileResult.version` with the content. Its present
implementation is produced server-side in `apps/server/src/fs/version.ts`, but the browser contract
is simply “opaque version returned with these bytes.” Do not couple the web app or Editor to its
current spelling or algorithm.

`FileSystemService` resolves every client path against one fixed server workspace root
(`apps/server/src/fs/path.ts`); choosing/parking an app root changes the index/UI slice, not that path
namespace. Accordingly `fileSystemKeys.fileSnapshot(path)` and `WorkspaceDocumentService` are
canonically path-keyed today. Preserve that single authority. The intent service captures
`{ rootPath, rootGeneration }` around an async query and, before storing/claiming, requires the
generation still matches, `file.path === requestedPath`, and the canonical path is inside that root.
A root switch cannot relabel a settled result. Query-cache invalidation for a canonical path disposes
matching speculative entries in every root bucket.

### LSP matching is hook-local today

`apps/web/src/features/editor/hooks/use-language-server-matches.ts:11-47` performs a private effect
fetch keyed by root/path. That prevents a Foresight producer and the mounted editor from sharing one
in-flight response. Convert this request to shared TanStack Query options; keep language-server
startup in the existing mounted-editor plugin lifecycle.

## Commands you will need

Run commands from `/Users/shaul/Desktop/D/platform` unless a command changes directory explicitly.
Do not start another dev server; the repository guarantees one is already running.

```bash
# Confirm dependency state only; do not update by default.
bun pm ls --all | rg 'foresight'
bun pm view js.foresight version
bun pm view @foresightjs/react version

# Platform focused verification.
(cd apps/web && bun --bun vitest run --project node \
  src/lib/file-open-intent/tests/service.test.ts \
  src/lib/tests/file-snapshot-query-cache.test.ts \
  src/lib/tests/editor-visible-snapshot-cache.test.ts \
  src/features/editor/state/tests/color-theme-store.test.ts \
  src/features/editor/tests/state.test.ts \
  src/features/editor/tests/file-sync-service.test.ts \
  src/features/editor/tests/workspace-document-service-preparation.test.ts)
(cd apps/web && bun --bun vitest run --project dom \
  src/features/editor/state/tests/performance-trace.test.ts \
  src/features/editor/tests/file-open-activation.test.ts \
  src/features/editor/hooks/tests/use-language-server-matches.test.tsx \
  src/features/workbench/tests/editor-visible-snapshot.test.tsx \
  src/features/workspace/tests/tab-intent-prefetch.test.tsx \
  src/features/workspace/tests/file-tree-intent-prefetch.test.tsx)
(cd apps/web && ./node_modules/.bin/vitest run --config vitest.browser.config.ts \
  src/features/workbench/tests/prepared-file-open.browser.tsx \
  src/features/workbench/tests/editor-visible-snapshot.browser.tsx)
(cd apps/web && bun run typecheck)
(cd apps/web && bun run lint)
(cd apps/web && bun run format:check)

# Editor focused verification. Reconcile package script names before running.
git -C ../Editor diff --check
(cd ../Editor/packages/editor && ./node_modules/.bin/vitest run \
  test/preparedDocument.test.ts \
  test/viewSnapshot.test.ts \
  test/syntax.test.ts \
  test/shiki/editor-tokens.test.ts \
  test/shiki/workerClient.test.ts \
  test/shiki/shiki-worker.test.ts \
  test/public-api.test.ts)
(cd ../Editor/packages/tree-sitter && ./node_modules/.bin/vitest run \
  test/treeSitter-workerClient.test.ts \
  test/treeSitter-worker.test.ts)
(cd ../Editor/packages/react && ./node_modules/.bin/vitest run test/useEditor.test.ts)
(cd ../Editor && bun run typecheck)
(cd ../Editor && bun run lint)
(cd ../Editor && bun run format:check)
(cd ../Editor && bun run health:write)
(cd ../Editor && bun run health)
(cd ../Editor && bun run build)

# Open-path measurement, using the already-running app.
bun --cwd apps/web run bench:editor-open
bun --cwd apps/web run bench:editor-open -- --gate --browsers=chromium
```

If a listed test path or package script has drifted, use the narrow equivalent and record the
substitution. Do not broaden immediately to every repository test.

## Scope

### Editor repository

Expected files:

```text
../Editor/packages/editor/src/editor/preparedDocument.ts            # new
../Editor/packages/editor/src/editor/types.ts
../Editor/packages/editor/src/editor/Editor.ts
../Editor/packages/editor/src/editor/syntaxController.ts
../Editor/packages/editor/src/plugins.ts
../Editor/packages/editor/src/syntax/session.ts
../Editor/packages/editor/src/shiki/plugin.ts
../Editor/packages/editor/src/shiki/workerClient.ts
../Editor/packages/editor/src/shiki/workerTypes.ts
../Editor/packages/editor/src/shiki/shiki.worker.ts
../Editor/packages/editor/src/virtualization/virtualizedTextView.ts
../Editor/packages/editor/src/virtualization/virtualizedTextViewLayout.ts
../Editor/packages/editor/src/virtualization/virtualizedTextViewInternals.ts
../Editor/packages/editor/src/editor.ts
../Editor/packages/editor/src/index.ts
../Editor/packages/editor/test/preparedDocument.test.ts              # new
../Editor/packages/editor/test/shiki/workerClient.test.ts
../Editor/packages/editor/test/shiki/shiki-worker.test.ts
../Editor/packages/editor/test/shiki/workerTypes.test.ts
../Editor/packages/editor/test/public-api.test.ts
../Editor/docs/architecture/phase-0/core-public-api.json
../Editor/packages/react/src/index.ts
../Editor/packages/react/test/useEditor.test.ts
../Editor/packages/tree-sitter/src/session.ts
../Editor/packages/tree-sitter/src/treeSitter/types.ts
../Editor/packages/tree-sitter/src/treeSitter/workerClient.ts
../Editor/packages/tree-sitter/src/treeSitter/treeSitter.worker.ts
../Editor/packages/tree-sitter/test/treeSitter-workerClient.test.ts
../Editor/packages/tree-sitter/test/treeSitter-worker.test.ts
```

### Platform repository

Expected files:

```text
apps/web/src/lib/file-open-intent/state/service.ts                   # new
apps/web/src/lib/file-open-intent/providers/context.tsx              # new
apps/web/src/lib/file-open-intent/hooks/use-service.ts               # new
apps/web/src/lib/file-open-intent/tests/service.test.ts               # new
apps/web/src/features/editor/providers/state-provider.tsx
apps/web/src/features/editor/state/document-state.tsx
apps/web/src/features/editor/state/commands.ts
apps/web/src/features/editor/state/workspace-state.tsx
apps/web/src/features/editor/state/file-open-preparer.ts              # new
apps/web/src/features/editor/state/language-server-match-query.ts      # new
apps/web/src/features/editor/state/mounted-editor-registry.ts          # new
apps/web/src/features/editor/state/syntax-highlighting.ts
apps/web/src/features/editor/state/color-theme-store.ts
apps/web/src/features/editor/state/workspace-document-service.ts
apps/web/src/features/editor/state/file-sync-service.ts
apps/web/src/features/editor/state/performance-trace.ts
apps/web/src/features/editor/state/tests/performance-trace.test.ts       # new
apps/web/src/features/editor/utils/render-document.ts
apps/web/src/features/editor/utils/text-snapshot.ts
apps/web/src/features/editor/hooks/use-language-server-matches.ts
apps/web/src/features/editor/hooks/tests/use-language-server-matches.test.tsx
apps/web/src/features/editor/tests/workspace-document-service-preparation.test.ts # new
apps/web/src/features/editor/tests/file-open-activation.test.ts        # new
apps/web/src/features/editor/tests/mounted-editor-registry.test.tsx     # new
apps/web/src/features/editor/tests/state.test.ts
apps/web/src/features/editor/tests/file-sync-service.test.ts
apps/web/src/features/editor/state/tests/color-theme-store.test.ts
apps/web/src/features/editor/components/editor.tsx
apps/web/src/features/workbench/components/editor-surface-tab-body.tsx
apps/web/src/features/workbench/components/file-editor-body.tsx
apps/web/src/features/workbench/tests/prepared-file-open.browser.tsx       # new
apps/web/src/features/workspace/hooks/use-tab-intent-prefetch.ts
apps/web/src/features/workspace/hooks/use-file-tree-intent-prefetch.ts
apps/web/src/features/workspace/tests/tab-intent-prefetch.test.tsx         # new
apps/web/src/features/workspace/tests/file-tree-intent-prefetch.test.tsx   # new
apps/web/src/features/workspace/utils/tab-prefetch.ts
apps/web/src/features/workspace/utils/file-tree-prefetch.ts
apps/web/src/lib/file-snapshot-query-cache.ts
apps/web/src/lib/tests/file-snapshot-query-cache.test.ts
apps/web/scripts/editor-open-benchmark.mjs                            # extend Plan 060 script
apps/web/package.json                                                 # scripts only
```

Follow the repository's feature/kind rules if current consumers force a small path adjustment. The
shared intent service qualifies for `lib/` only while at least the workspace and editor features
consume it. Do not add barrel files.

### Explicitly out of scope

- A hidden or pooled Editor instance, hidden DOM, premeasured font/BiDi/wrap geometry, or a minimap.
- Persisting buffers, tokens, syntax trees, worker sessions, or more than Plan 060's single visible
  snapshot across reload.
- Starting an LSP server or prefetching semantic tokens, diagnostics, definitions, or references.
- Preparing diffs, compare views, search buffers, settings JSON, git-ref documents, or directories.
- Prepared adoption for text-only owned-document inputs; without the exact external buffer/snapshot
  identity they continue through the normal demand path.
- Changing the server's file-version algorithm or exposing assumptions about its format.
- `ohash`, a browser content hash, a second query cache, IndexedDB, or a service worker.
- Raising the 1 MiB preparation limit before measurements show the retained-byte and worker costs.
- Replacing Foresight's prediction algorithm or merging the React and Shadow DOM registration APIs.

## Git workflow

- Work in the existing Platform and Editor worktrees. Do not create branches, commits, pushes, or
  pull requests unless the user separately asks.
- Record both starting diffs. Preserve unrelated and user-owned changes.
- Complete Editor's prepared-open contract before wiring Platform against it.
- Keep intermediate changes buildable at each step. Do not temporarily route authoritative text
  through TanStack Query or the Plan 060 visual cache.

## Steps

### Step 0: Calibrate the current open benchmark before changing behavior

**Goal:** Freeze an observable pre-change baseline. Do not require prepared-service or worker-reset
APIs that this plan has not built yet; the isolated three-mode gate is added in Step 7.

1. Extend the `apps/web/scripts/editor-open-benchmark.mjs` baseline created by Plan 060, preserving
   its process-launch, browser-selection, fixture, randomized-order, and output conventions.
2. Add only the durable marks available on the current path: intent detected, file bytes ready,
   activation/click, live buffer/view ready, first authoritative text paint, and first authoritative
   highlighted paint. Consume the landed `EditorInitialPaintEvent`: `text` drives
   `editor.authoritative_text_paint` on the matching next frame, while only `highlight-settled` with
   `painted` or `degraded` may drive `editor.authoritative_highlight_paint`. `plain`/`error` remain
   terminal outcomes, not successful highlight samples. A Plan 060 overlay never satisfies either
   authoritative mark.
3. Calibrate highlighted paint against a known TypeScript fixture whose token foreground visibly
   differs from its background. Record current post-click file reads, buffer constructions,
   full-line-index scans, and syntax/highlighter session creations where observable; do not invent
   prepared-stage/request counters before Steps 1–2 add them.
4. Run diagnostic **miss/control** and current **query-only** samples against fresh unique fixture
   paths after balanced warmups. Remove Plan 060's visual record before authoritative-pipeline
   samples. This pre-change run is not the final isolation/timing gate: without the later service and
   worker barriers it may not claim per-runtime quiescence. Save the command, fixture, mode ordering,
   p50/p95 output, and structural counters in the execution notes.
5. Do not set a timing threshold from this one run. It establishes the known-good paint observable
   and current work floor; Step 7 adds the prepared mode, exact in-page reset bridge, balanced
   warm-provider-cache comparison, and final paired threshold.

**Required baseline assertions:**

- The known-good highlighted fixture emits the authoritative highlighted-paint mark.
- A query-only hit performs no post-click file read while still showing the current post-click
  buffer/line-index/syntax work.
- The benchmark distinguishes Plan 060's visual frame from authoritative editor paint.

### Step 1: Add a one-shot prepared-document contract to editor core

**Goal:** Make pure document preparation and syntax ownership transferable without exposing Editor
internals or allowing a stale artifact into a live editor.

Create `packages/editor/src/editor/preparedDocument.ts` with focused public types and one factory.
Names may be adjusted to current core conventions, but retain these semantics:

```ts
type EditorPreparedDocumentMatch = {
  readonly documentId: string
  readonly languageId: EditorSyntaxLanguageId | null
  readonly snapshot: PieceTableSnapshot
  readonly documentConfigurationTag: readonly EditorPreparedTagValue[]
  readonly structuralProvider: EditorSyntaxProvider | null
  readonly highlighterProvider: EditorHighlighterProvider | null
  readonly structuralConfiguration: EditorPreparedStructuralConfiguration | null
  readonly structuralConfigurationTag: readonly EditorPreparedTagValue[]
  readonly highlighterConfigurationTag: readonly EditorPreparedTagValue[]
}

type EditorPreparedStructuralConfiguration = {
  readonly includeCaptures: boolean
  readonly includeHighlights: boolean
  readonly syntaxMode: 'full' | 'range'
}

type EditorPreparedStageRequest =
  | {
      readonly family: 'structural'
      readonly provider: EditorSyntaxProvider
      readonly configuration: EditorPreparedStructuralConfiguration
      readonly configurationTag: readonly EditorPreparedTagValue[]
      readonly range: EditorSyntaxRange
      readonly abortSignal: AbortSignal
    }
  | {
      readonly family: 'highlighter'
      readonly provider: EditorHighlighterProvider
      readonly configurationTag: readonly EditorPreparedTagValue[]
      readonly range: 'full'
      readonly abortSignal: AbortSignal
    }

type EditorPreparedStageOutcome = 'ready' | 'aborted' | 'failed' | 'stale'

type EditorPreparedDocumentPayload = {
  readonly lineStarts: readonly number[]
  readonly tabSize: number
  readonly fallbackFolds: readonly FoldRange[]
  readonly structural: EditorPreparedStructuralTransfer | null
  readonly highlighter: EditorPreparedHighlighterTransfer | null
}

type EditorPreparedDocument = {
  startStage(request: EditorPreparedStageRequest): Promise<EditorPreparedStageOutcome> | null
  take(expected: EditorPreparedDocumentMatch): EditorPreparedDocumentPayload | null
  dispose(): void
  readonly estimatedBytes: number
}
```

`EditorPreparedTagValue` is the flat primitive union
`string | number | boolean | null`; nested arrays/objects are not allowed, and tag elements are
compared without hashing or delimiter packing. The
provider fields use exact object identity. `EditorPreparedStructuralConfiguration` is part of the
structural equality contract; do not hide `includeCaptures`, `includeHighlights`, or `syntaxMode`
behind a vague generation tag. Each transfer is an opaque, one-owner value containing its family,
unique `runtimeSessionId`, provider identity, exact configuration, explicit requested-range
coverage, session, and either a ready result or a pending result promise plus cancellation/disposal.
Do not collapse the two transfers into a generic “syntax” slot.

The factory accepts only the exact `EditorTextBuffer`, document/language ids, configured tab-size/
fold policy, and primitive document-configuration tag. It performs the claimable **document-data
stage**, not provider work:

1. capture the exact `buffer.getSnapshot()` object and text snapshot;
2. build line starts once from the text snapshot without requiring a second full string;
3. materialize/reuse full text once only for algorithms that currently require it;
4. compute the same `guessedTabSize` and `fallbackFoldRanges` the Editor would compute;
5. retain no provider/session yet; and
6. return the data lease immediately. The activation path never awaits this factory.

`startStage` is the only way to attach speculative provider work to that lease. It is called by the
service's global heavy-work scheduler, starts a family at most once, returns a settlement promise so
the scheduler knows when its one slot is free, and returns `null` after consume/dispose or for an
already-started family. It creates the unique runtime id, exact shared provider session, range/full
request, and transferable result/promise for only the requested family. Starting highlighter and
structural work is therefore two separately queued stages, never hidden inside data preparation.

Do not export `guessedTabSize`, fold internals, or mutable syntax-controller state merely to make the
app assemble the payload. Keep the preparation algorithm inside core and expose the narrow factory.

`take(expected)` must compare snapshot **object identity**, document id, language id, and every field
of the document-configuration tag. A mismatch at that data boundary returns `null` and disposes all
started sessions. On a data match it marks the lease consumed before returning the payload, then
validates each started family independently against exact provider object, explicit structural
configuration, and primitive tag fields. Its declared/result coverage must be internally valid and
is preserved even when it covers less than the actual mounted viewport; that is a partial transfer,
not an identity mismatch, and the mounted controller requests the remainder. A mismatched family is
disposed and returned as `null` without discarding valid data or the other family. `dispose()` is
idempotent both before and after take; after take, ownership belongs only to the payload/Editor.

Each transfer must model ready and in-flight work independently:

- an unstarted queued job lives only in the service queue and is removed on claim without creating a
  provider session;
- an already-created session plus pending promise is transferable without waiting;
- a ready result and session are transferable together;
- abort, rejection, or stale result degrades to the normal Editor syntax path;
- exactly one party owns `dispose()` and pending cancellation at every point; and
- transferring the pending cancellation scope prevents a later speculative-root cleanup from
  aborting work already claimed by the Editor.

Before enabling speculative sessions, extend `EditorSyntaxSessionOptions` and
`EditorHighlighterSessionOptions` with optional `runtimeSessionId?: string`. Built-in Tree-sitter and
Shiki implementations must allocate a unique id internally whenever a direct consumer omits it;
Editor and the preparer generate/pass one explicitly for transfer and diagnostics. Thread the
resolved id through clients, message types, worker task maps, open/edit/query/dispose messages, and
tests. Workers key mutable state only by runtime id; logical `documentId` remains in snapshot/result
tags and remains available to Shiki language/extension resolution. Never derive the runtime id from
path, tab id, file version, or a hash. Existing diff/search/custom-provider call sites may omit the
field and must remain collision-free without source churn.

Make disposal close the async ownership race, not merely delete today's map entry. Tree-sitter
per-runtime disposal first marks every pending parse/query cancellation flag for that runtime, then
removes source/snapshot state. Shiki either serializes dispose behind the runtime's in-flight
open/refresh task or records a tombstone/generation that every late completion checks before storing
document state; a late open must never repopulate a disposed runtime. Abort is cooperative where the
underlying tokenizer cannot stop synchronously—do not promise hard cancellation—but disposal and
late-result rejection are exact. Cover both worker implementations, including direct dispose while
open/refresh is unresolved. Add a worker-control acknowledgement/barrier keyed by runtime id for
tests and benchmarks. Its promise resolves only after every earlier task for that runtime has either
completed or observed cancellation/tombstone and the worker can no longer publish a late result.
Also add a provider/worker-owner `awaitIdleFence()` diagnostic: enqueue a monotonically sequenced
fence and resolve it only after **all** lower-sequence tasks across all runtime ids are terminal and
unable to publish. The fence neither disposes sessions nor flushes parsed grammar, loaded theme,
module, or other shared provider caches. Platform's existing shared Tree-sitter/Shiki owner wrappers
expose this only to the injected trace/test benchmark barrier—not through Editor's public or React
API. Ordinary UI teardown may remain nonblocking; benchmark teardown awaits per-runtime disposal
acknowledgements where ids are known and both provider-wide idle fences after the sampled Editor has
unmounted, covering mounted runtime ids that transferred out of service ownership.

Update `EditorSessionOptions` and the external-session-backed React document descriptor only as far
as needed to accept an optional prepared document plus current provider/configuration identity. Do
not add preparation to the text-only owned-document input, put a raw prepared payload on general
editor state, or serialize it.

Update the virtualized view's text/snapshot installation path and internals to accept validated
prepared line starts. Its contract must accept `readonly` data if it does not mutate the caller's
array; do not copy merely to satisfy a mutable type. Adopt the immutable array directly for initial
state, while later edits may create their normal owned index/delta structure. Add a development/test
invariant that the first element is zero, the sequence is strictly increasing, and its last value is
within snapshot length. Snapshot identity is the production validity boundary; do not rescan all
text to validate the line index.

Add one atomic initial-document installation path for `Editor.attachSession`, reused by the
external-session-backed React document path. It must:

1. attach the real document session, capture its snapshot, and synchronously claim preparation;
2. reset the outgoing document generation and syntax/view state exactly once;
3. install text/snapshot plus validated prepared line starts as the new base document;
4. adopt prepared tab size and initial folds;
5. adopt ready structural and highlighter results into their distinct controller slots, applying
   the effective highlighter tokens when present;
6. adopt either pending transfer without creating a replacement session;
7. publish/paint the initial document once, then apply requested scroll and normal selections; and
8. request uncovered actual-visible/full ranges through the transferred sessions or use the normal
   fallback for any missing/rejected family without delaying paint.

Adopting an in-flight transfer means adopting its exact promise, cancellation scope, request
generation, and coverage as that controller family's current active request. Do not immediately run
the normal initial refresh on the same session: Tree-sitter would cancel/restart the transferred
parse/query, and Shiki would post a duplicate open/refresh. After the adopted promise settles
successfully, request only structural coverage not already represented by that result; a full Shiki
transfer needs no follow-up refresh. Only a rejected/aborted/stale transfer may fall back to a new
normal request. Instrument provider/worker request counts so tests distinguish “same session but
duplicated request” from true reuse.

Do not route the adopted session-backed document through the current
`setContent`/`setDocument({ tokens: [] })` reset afterward: those paths clear tokens/folds and turn a
prepared hit back into a flash/miss. Extract the reset/base-data/final-publish phases needed for this
atomic path rather than relying on a fragile call order. Text-only owned documents keep using those
normal paths and cannot receive preparation.

In the React binding, synchronize the target plugin/provider set before syncing a new document.
Today the document layout effect runs before `syncPluginsOption`; reverse or combine that ordering so
claim validation sees the exact target providers and the subsequent plugin sync cannot dispose and
recreate transferred sessions. Batch the option/document update so subscribers do not observe a
half-installed generation.

Also make the React host lifecycle stable under development `StrictMode`. Today both `useEditor` and
`EditorHost` cleanup call `controller.dispose()`, while `mount()` itself disposes before recreating;
the setup -> cleanup -> setup replay can consume a one-shot prepared lease, destroy that Editor, and
start replacement sessions. Add a coalesced private `scheduleDispose` using a mount generation and a
microtask. A replayed `mount()` on the same host cancels the pending cleanup and reuses the mounted
Editor instead of calling synchronous dispose/recreate; a genuinely different host performs the
normal ownership transition. Hook/host cleanups schedule idempotently, while explicit public
`dispose()` remains immediate. If no same-generation remount occurs by the microtask, real unmount
disposes exactly once. Re-running setup must still synchronize plugins/document options, including
changes made between renders, without replacing an already-adopted session.

The normal no-preparation path must remain behaviorally identical. Invalid preparation must be no
worse than a miss.

**Editor tests:**

- full payload claims once and a second claim misses;
- document id, language, document configuration, and snapshot-reference mismatches reject the data
  lease; either provider/configuration mismatch rejects only that family and preserves valid data/
  sibling transfer;
- unclaimed, mismatched, aborted, rejected, and consumed leases dispose both families exactly once;
- ready/pending structural and ready/pending highlighter transfers are independently adoptable
  without a second `createSession` or a duplicate open/refresh/parse/query request; a successful
  partial structural transfer requests only uncovered coverage after its adopted promise settles;
- prepared-ready and prepared-pending paths emit the landed text/highlight-settled phases exactly
  once for the claimed document generation; stale or plain/error outcomes cannot emit a successful
  highlight mark;
- two mounted/speculative sessions for the same logical document receive distinct runtime ids and
  cannot edit, query, or dispose each other's Tree-sitter/Shiki worker state;
- direct Tree-sitter/Shiki consumers that omit `runtimeSessionId` still receive distinct built-in
  runtime ids, and disposal during unresolved work cannot leave a late orphan document;
- each runtime idle/disposal barrier waits through unresolved earlier work and cannot acknowledge
  while that runtime can still publish or consume worker capacity;
- each provider-wide `awaitIdleFence()` waits for every lower-sequence task across runtime ids while
  preserving shared grammar/theme/provider caches;
- prepared line starts bypass the initial full-document scan and remain correct after an edit;
- prepared tab size/fallback folds match the existing demand computation;
- atomic installation publishes once and never clears a ready prepared token result;
- a React `StrictMode` setup/cleanup/setup replay installs target plugins before document adoption,
  consumes the prepared lease once, creates zero replacement sessions, and disposes once only on the
  real unmount;
- an invalid line-start array trips the test/development invariant;
- the public API fixture and React binding expose the narrow contract.

### Step 2: Build the bounded `FileOpenIntentService`

**Goal:** Give both Foresight producers one coordinator for staged, cancellable preparation without
creating a second document authority.

Add a stateful service under `apps/web/src/lib/file-open-intent/state/`. Inject:

- the real `QueryClient`;
- read-only accessors **and subscriptions** for the current root, live documents/revisions/retention,
  retained view scroll seeds, and a separate actual-mounted-Editor registry;
- an app-level per-candidate resolver that derives language/exact document and provider
  configuration from `{ path, sourceState, environment, environmentGeneration }`, plus the function
  that creates the core data-only prepared document; the service alone calls its staged
  provider-start methods;
- the LSP match prefetch function;
- a monotonic clock/scheduler for deterministic tests; and
- the existing wide-event logger boundary.

The `lib/` service must not import `@/features/*`. `EditorStateProvider` is the composition boundary
that injects the editor preparer, document-store projection/subscription, actual-mounted registry,
and LSP prefetch function; the workspace feature consumes only the narrow service context/hook. This
keeps the shared layer below both feature consumers.

Create one narrow `MountedEditorRegistry` under editor `state/`, owned by `EditorStateProvider` and
keyed by host/tab identity with `{ rootPath, path, documentId }` values. Register only when the real
React Editor host is mounted; synchronously replace the association when that host changes document.
A cleanup schedules removal in a microtask with a registration generation, and an immediate same-host
StrictMode remount cancels it, so setup -> cleanup -> setup produces no false unmounted transition.
True unmount removes once and notifies subscribers. Expose only `isPathMounted(rootPath, path)`, a
read-only snapshot, and subscription/injected register action at the narrow composition points.
`WorkspaceDocumentService.viewsByTabId` is retained logical view state and is explicitly **not** this
authority: inactive tabs keep those view records but must remain eligible for Foresight preparation.

Its public surface should stay narrow:

```ts
type FileOpenIntent = {
  readonly rootPath: string
  readonly path: string
  readonly source: 'tab' | 'file-tree'
  readonly tabId?: string
  readonly knownSize?: number
}

type CleanPreparedFileOpenClaim = {
  readonly kind: 'clean-file'
  readonly rootPath: string
  readonly path: string
  readonly fileVersion: string
  readonly file: FileResult
  readonly buffer: EditorTextBuffer
  readonly snapshot: PieceTableSnapshot
  readonly preparedDocument: EditorPreparedDocument
}

type LiveFileOpenClaim = {
  readonly kind: 'live-document'
  readonly rootPath: string
  readonly path: string
  readonly documentId: string
  readonly localRevision: number
  readonly buffer: EditorTextBuffer
  readonly snapshot: PieceTableSnapshot
  // A retained live document is still claimable when Foresight did not finish.
  readonly preparedDocument: EditorPreparedDocument | null
}

type FileOpenIntentService = {
  prepare(intent: FileOpenIntent): void
  claimLive(input: { rootPath: string; path: string; tabId: string }): LiveFileOpenClaim | null
  claimClean(input: {
    rootPath: string
    tabId: string
    file: FileResult
  }): CleanPreparedFileOpenClaim | null
  claimReadyClean(input: {
    rootPath: string
    path: string
    tabId: string
  }): CleanPreparedFileOpenClaim | null
}

type FileOpenIntentBenchmarkSample = {
  readonly id: string
  quarantine(): void
  quiesce(): Promise<FileOpenIntentQuiescence>
  release(): void
}

type FileOpenIntentServiceOwner = {
  readonly service: FileOpenIntentService
  connect(): void
  scheduleDisconnect(): void
  setRoot(rootPath: string | null): void
  setEnvironment(environment: FileOpenIntentEnvironment): void
  beginBenchmarkSample(input: { rootPath: string; path: string }): FileOpenIntentBenchmarkSample
  disposeNow(): void
}
```

The context exposes only `FileOpenIntentService`; `EditorStateProvider` retains the owner. Construct
the owner without subscriptions, timers, queued work, or other side effects. `connect()` starts the
document/query subscriptions and single cleanup scheduler idempotently. `scheduleDisconnect()`
captures a connect-lifecycle generation and queues a microtask: a same-owner `connect()` during StrictMode
setup -> cleanup -> setup cancels that generation and keeps the resources; if no reconnect arrives,
the microtask disconnects, cancels queued work, and disposes unclaimed sessions exactly once.
`disposeNow()` is immediate and terminal for explicit non-React ownership teardown. `setRoot()`
first normalizes and compares the exact root. Repeating the same value—including `null`—is a semantic
no-op that preserves the root generation and every matching prepared entry. Only an actual root
transition increments the root generation and clears the prior speculative bucket, without re-keying
canonical query/live authorities. `null` is the real no-workspace state: transitioning to it clears
prior work and makes every `prepare`/claim a miss until a non-null root is installed. `setEnvironment()`
is the owner-wide reactive invalidation entrypoint used in Step 5; per-file language/options never
live on the owner. Calling a lifecycle method on a terminal owner is a development/test invariant
failure rather than a silent resurrection.

`beginBenchmarkSample` is owner-only diagnostic control, never exposed by the service context. It
requires a connected owner, no active benchmark scope, and no prior nonterminal service operation;
otherwise the benchmark sample is rejected. It allocates an opaque id before warmup/measurement work
begins and tags every intent operation created or deduplicated while that scope is active—including
non-target predictions from the real Foresight trajectory. The handle has an explicit lifecycle:

- `quarantine()` is synchronous and one-shot. It globally rejects new `prepare` and claim calls for
  the isolated benchmark page before workspace deactivation begins, so neither the target nor a late
  non-target prediction can repopulate the service during teardown.
- `quiesce()` requires quarantine, removes/cancels every queued or unclaimed operation tagged to the
  scope, disposes its service-owned sessions, and awaits every stage/result plus every shared file/LSP
  query promise the scope initiated or joined. It returns target/non-target counts and all known
  runtime ids, including transferred ids recorded at claim, but never content or buffers. Claimed
  Editor-owned sessions are disposed by the real host unmount in the composed reset and proven
  terminal by the worker barriers.
- `release()` re-enables the service only after the composed reset proves quiescence and
  no-repopulation. A failed half-reset deliberately keeps the owner quarantined and aborts the run;
  terminal owner teardown can still release its resources.

The scope does not remove QueryClient/live-document state and does not flush shared provider caches;
those remain the composed handler's explicit responsibilities. Run warmups under the same scope/reset
protocol so no untracked warmup operation can enter the first measured sample. Mounted consumers can
start the target file and LSP-match queries without passing through the intent service; Step 7's
composed reset therefore cancels/awaits those exact QueryClient operations separately after their
observers unmount.

`prepare` is fire-and-forget because Foresight callbacks cannot make activation depend on it.
Internally use explicit stages:

```text
intent
  -> shared FileResult query (unless an exact live buffer is reusable)
  -> buffer/source selection
  -> core document-data lease (snapshot / line starts / tab size / fallback folds)
  -> queued highlighter stage when applicable
  -> queued structural stage when applicable
  -> optional LSP-match query
  -> ready / promoted / evicted / aborted / failed
```

`claimLive` is also the retained-document lookup for activation. Its `{ rootPath, path, tabId }`
target comes from the command's already-validated projected `nextPanels`, so a newly reopened tab is
a valid target even when no old tab currently owns the document. Revalidate that `rootPath` is the
owner's current root and that canonical `path` is contained by it, then look up the authoritative
retained document by canonical path. Return its exact current identity immediately even when no
prepared lease exists; in that case `preparedDocument` is `null`. If a matching lease exists, remove
it and transfer it in the same synchronous operation. Return `null` only when no retained live
document matches. `tabId` identifies the new view to install; it is not required to be an existing
association. `claimClean` never waits: it returns only an already-prepared clean candidate matching
the supplied `FileResult`.

`claimReadyClean` synchronously reads the exact canonical-path query state while validating the
same projected `{ rootPath, path, tabId }` target, current root generation, and canonical path
containment. Like `claimLive`, it does not require the new tab to exist in already-published
workspace state. It returns a claim only
when data is successful/still fresh under the same five-second policy **and** a matching data-prepared
candidate already exists. Query-only data returns `null`; the command must not construct its buffer,
line index, or folds. The method never fetches, refreshes, accepts stale data, or starts work, so a
fully prepared clean view can install before selection publication without turning activation into
an await or a pointer-handler scan.

The callback must only deduplicate, record priority, and enqueue. Use the repository's idle
scheduler or `scheduler.postTask({ priority: 'background' })` with an equivalent tested fallback for
main-thread buffer construction and line/fold scans. Syntax providers may use their existing
workers. Record long tasks and keep the Foresight callback itself below the benchmark's noise floor;
do not move piece-table ownership into a worker merely to avoid scheduling it.

Before fetching, check the authoritative document service:

- If the canonical path has a retained document, capture its buffer, `localRevision`, and exact
  snapshot reference after checking the current root generation and canonical path containment. An
  active/parked tab association may contribute a view scroll seed, but it is optional and is never
  the document's identity or claim authority: a clean or dirty document retained after its last tab
  closes must still be prepared/claimed on reopen. Use the configured default viewport seed when no
  associated view exists. Do not add `rootPath` to `LiveEditorDocument` or create duplicate buffers
  for nested roots that expose the same canonical file. Re-check root generation/containment,
  revision, and snapshot before storing and before claiming.
- Otherwise call a new `ensureFileSnapshotQuery` helper backed by
  `queryClient.fetchQuery(fileSnapshotQueryOptions(...))`. It must return/join the exact in-flight
  promise and respect the shared five-second freshness policy, including refreshing existing stale
  data. Do not use `prefetchFileSnapshotQuery` as the service's completion signal: that helper
  deliberately returns immediately when a query is already fetching and skips cached stale data.
  Existing fire-and-forget producers may keep that helper; the service awaits `ensure...` only in
  its background job, never during activation. Capture the service root generation before awaiting;
  after resolution require the same generation/root plus exact `file.path === requestedPath` before
  creating an entry. Create one clean buffer from the returned `FileResult`, mark it clean, and store
  it under the root lifecycle bucket plus canonical path/opaque file version. A superseded-root result
  may remain in the shared canonical-path query cache but cannot become a speculative entry for the
  new root.

If `MountedEditorRegistry.isPathMounted(rootPath, path)` is true, do not start speculative buffer or
worker work for it. Record `already-mounted` and let the actual host remain authoritative; a query/LSP
match may remain warm only when it was already requested for another consumer. A retained
`viewsByTabId` entry for an inactive tab does not trigger this gate. Unique runtime ids are still
required for legitimate retained-but-unmounted and multi-view races.

Use nested maps:

```text
cleanByRoot -> rootPath -> path -> fileVersion -> entry
liveByRoot -> rootPath -> documentId -> localRevision -> entry
```

An entry also stores the root generation, exact snapshot reference, last-reconciled environment
generation, resolved per-candidate document/family configurations and tags, independent family
request generations, source, stage, timestamps, estimated bytes, and terminal wide-event scope.
Before starting a stage or claiming, reconcile any stale environment generation as specified in Step 5. Async family results validate their family request generation/tag plus snapshot, not an unrelated
global setting counter. Root buckets own speculative lifecycle only; canonical-path QueryClient data
and live documents remain shared authorities. Do not create a string-hash key.

Deduplicate tab and file-tree intents for the same exact source state. A newer intent should raise
that entry's priority and update its expected viewport, not start a duplicate buffer/session. Shared
file queries may continue when local preparation is superseded because activation or another
consumer can still use them. Abort/dispose only service-owned heavy work.

Derive the expected **structural** syntax range from the tab's saved scroll position and a
conservative configured/default viewport-height estimate. Shiki's current contract tokenizes the
full document, so its transfer declares full coverage; do not pretend it is viewport-bounded or add
a partial-Shiki API in this plan. The shared `lib/` service must not read Plan 060's workbench visual
cache or accept its text/tokens. Record the chosen structural range so the benchmark can distinguish
useful and wasted work.

Apply the initial bounds in one eviction policy:

- maximum 8 entries;
- maximum 32 MiB estimated service-owned bytes;
- 30-second idle TTL;
- maximum one CPU-heavy local job running across document-data, syntax, and highlighting;
- most-recent intent first for queued work;
- least-recent, unclaimed entry first for eviction.

The one-job budget applies to document data and both families: in Shiki mode queue the structural
range behind the highlighter refresh. Queue order is query -> document data -> Shiki (when
applicable) -> structural;
document-data creation does not implicitly occupy/start either provider. If activation claims while
the highlighter is in flight, transfer it and remove the still-unstarted structural job; the mounted
Editor demand-starts only that missing family through its normal nonblocking path. Claiming a
data-only lease likewise removes both queued stages. A “fully prepared” benchmark sample means both
families were explicitly started and are transferable before activation, not merely that data was
ready or one family won the priority race.

Estimate buffer text as a conservative two bytes per UTF-16 code unit, plus line-index and copied
token/fold arrays. Do not pretend to know opaque worker heap exactly; record session count separately
and keep concurrency at one. The query cache's retained `FileResult` bytes remain query-owned and are
reported, not double-counted as service-owned.

Use one cleanup scheduler rather than one timeout per entry. All cancellation paths must be
idempotent and must finish the entry's single wide event. Claim removes the entry from all service
maps before returning and transfers its pending abort/disposal ownership to the view lease; root
cleanup, environment reconciliation, and service teardown may no longer reach the claimed work.

The document-store subscription must invalidate a live entry immediately when its `localRevision`,
snapshot object, id/path, or retention status changes. The separate mounted-registry subscription
cancels speculative work when an actual host mounts that root/path; an inactive retained view does
not. Read-only lookups performed only at prepare/claim time are not sufficient: edits or real mount
transitions between those calls must proactively cancel speculative work and release worker sessions.

### Step 3: Promote prepared buffers through `WorkspaceDocumentService`

**Goal:** Adopt speculative work at the existing authoritative boundary without changing dirty
document semantics.

Add explicit optional claim arguments to `ensureView` and `ensureViewForDocument` plus the
corresponding document-store actions. Keep the discriminated clean/live types intact through this
boundary; do not weaken them into optional `fileVersion` fields. Validate before adoption:

- the claim's kind is `clean-file`;
- its root was validated by `FileOpenIntentService.claimClean`;
- its path and opaque file version exactly equal the incoming `FileResult`;
- the buffer is still clean; and
- the core prepared document still references that buffer's current snapshot.

If valid, adopt the exact buffer instead of calling `createEditorTextBuffer`. Store
`fileContentRevision(file.version)` as the clean file's `contentRevision`; its implementation is
the string namespace `f:` followed by the opaque server value, not a hash. Do not run
`contentRevisionForText` for clean `FileResult`s. Update every consumer/test that assumes clean
revisions begin with `h:`. Unsynced documents and dirty local edits retain their existing local
revision contract.

If an existing dirty document is present, dispose the clean claim and keep the dirty buffer. If an
existing clean document with the same file version is present:

- use a prepared lease only when it was built against that exact existing buffer snapshot;
- otherwise keep the existing buffer and dispose the duplicate claim.

Never swap an existing shared clean buffer merely to salvage a prepared lease; another tab may
already own views/selections on it.

Attach the claimed core prepared document to the per-tab `EditorDocumentView`, not the global live
document. The mounted React Editor consumes it once while attaching that tab's view session. A
consumed lease may remain as an inert reference until the view is replaced, but removing/replacing a
view must call its idempotent `dispose()`.

For a `live-document` claim, re-check document id, local revision, and exact buffer snapshot. It
never replaces a buffer; it only attaches the prepared core lease to the selected tab view.

Update `file-sync-service.ts` and the document service's save-completion boundary together. On a
successful save, always advance `sync.fileVersion`/mtime to the server response. If the saved
`contentRevision` still equals the document's current revision (no edit raced the request), mark the
buffer clean and set both the document and `documentContentRevisions` to
`fileContentRevision(savedFile.version)`. If newer edits raced the save, preserve the newer `e:`
revision and dirty state while still advancing the sync version. Add focused tests for both cases;
do not clean a raced edit or leave an unraced save carrying an edited revision.

Do not publish store state while speculation progresses. Publish only the normal state transition
when an actual view/document is ensured. This prevents predicted hover paths from rendering React
subscribers.

### Step 4: Route activation and both Foresight producers through the service

**Goal:** Make tabs and file-tree files invoke the same preparation policy while retaining the
registration mechanism each UI actually needs.

Create the service once inside `EditorStateProvider`, after obtaining the real QueryClient and
document-store accessors. Lazily create the side-effect-free `FileOpenIntentServiceOwner`, retain it
for the provider lifetime, and expose only `owner.service` through a narrow context/
`useFileOpenIntentService()` hook. Call `owner.setRoot(nextRootOrNull)` synchronously at the root ownership
boundary before the new root can enqueue or claim. A real root transition clears the old speculative
bucket while leaving canonical path-keyed query/live authorities alone; an equivalent replay is an
explicit no-op. A provider effect calls
`owner.connect()` and its cleanup calls `owner.scheduleDisconnect()`. The connect-lifecycle microtask
specified in Step 2 coalesces StrictMode setup -> cleanup -> setup and performs terminal cleanup only
when no replay connection arrives. Never call `disposeNow()` from a replayable effect cleanup or
create constructor subscriptions that React can discard. Add a StrictMode provider test proving the
replayed setup can still prepare/claim, owns exactly one document subscription, query subscription,
and cleanup scheduler, then disposes every unclaimed entry/session exactly once after true unmount.
Keep root/environment synchronization in separate effects from the one connection effect, so a
theme/settings render does not schedule terminal owner teardown.

Do **not** claim live work in `EditorSurfaceTabBody` or another child layout effect. React runs child
layout effects before parent layout effects, and the React Editor's own layout effect can attach the
document/start providers first. Instead, inject a narrow activation collaborator into
`createEditorCommands`/`useEditorCommands` and put one
`activateFileTabBeforeSelectionPublish(currentWorkspace, nextPanels)` transaction in
`features/editor/state/commands.ts`:

1. Determine whether the next active tab/root/path differs and is a real file surface. Before the
   corresponding `workspaceStore.setState`/root restore publishes that selection, validate the
   projected `nextPanels` entry and synchronously call `claimLive({ rootPath, path, tabId })` with
   that target. The service may match a canonical retained document even when it became tabless after
   close; the projected entry authorizes attaching it to this new `tabId`. On a hit, call
   `ensureEditorViewForDocument(tabId, claim.documentId, claim)` in the same transaction. Only then
   publish the active workspace state, so the first render already projects the claimed view. On a
   live miss, pass that same validated projected target to
   `claimReadyClean({ rootPath, path, tabId })`; on a completed data-prepared hit, call
   `ensureEditorView(tabId, claim.file, claim)` before publication. A query-only hit returns
   `null` and publishes immediately; it must not build the buffer/index/folds in the command. This
   path never awaits or starts preparation work.
2. Route every command transition that can reveal a different file tab through that helper: open or
   dedupe-by-path, direct tab selection, previous/reopen, close/discard selecting a successor, and
   parked-root restoration. Refactor the workspace restore boundary to expose the target panels
   before publication if needed; never repair an already-published activation from a React effect.
   Keep the exported low-dependency `openEditorPathSurface` usable by injecting an optional narrow
   collaborator or move file-capable callers under the provider; prove any caller without it cannot
   consume a prepared file entry.
3. The selected-file query may continue for reconciliation, but it does not gate a retained clean or
   dirty live buffer. Keep the authoritative ready-`FileResult` reconciliation in its current owner,
   `EditorSurfaceTabBody`; Plan 060 already gives `FileEditorBody` visual-cache ownership, not
   document actions. Change that ready-file path to a layout effect so a newly resolved result
   synchronously calls `claimClean({ rootPath, tabId, file })` immediately before
   `ensureEditorView` and commits the view before browser paint. If the command transaction already
   installed a live or fresh clean view, reconcile without taking/replacing a duplicate candidate.
   The effect is one-shot/idempotent under StrictMode and never awaits; a query miss still publishes
   selection immediately and follows the ordinary loading path.
4. Preserve the current later rules: dirty live state wins; clean state replaces only when the exact
   file version changed. Never replace the rendered live buffer merely to salvage a clean lease.

Closing the last tab must not destroy dirty document authority. A later open of the same canonical
path claims that retained buffer/revision/snapshot through the projected target, attaches it to the
new tab, and never creates a second buffer or waits for disk. An old active/parked tab association is
only a possible scroll seed, not a prerequisite for this reopen path.

The command transaction is naturally outside React Strict Mode effect replay. Claim removes the
prepared entry before ensuring the view, and a repeated command sees the existing view; it cannot
consume/install the payload twice. A retained lookup may still return
`preparedDocument: null`, which is harmless and must not replace an existing view session.

Change the tab Foresight callback to:

```ts
service.prepare({
  rootPath,
  path: target.path,
  source: 'tab',
  tabId: target.id,
})
```

Change only the file branch of the file-tree callback to the same service:

```ts
service.prepare({
  rootPath,
  path: entry.path,
  source: 'file-tree',
  knownSize: entry.size,
})
```

Keep directory intent routed to `prefetchDirectory`. Keep the React `useForesight` adapter, the
Shadow DOM registry, hit slop, mutation synchronization, and unregistration behavior. The service
method is the shared function; the element-registration plumbing is intentionally different.

The service may retain the five-second `reactivateAfter` policy at the producers. Its own exact-state
dedupe/TTL decides whether later callbacks do work. Do not make Foresight know about query keys,
workers, or document-store internals.

Preserve the producer-specific large-file behavior exactly. A file-tree row has `entry.size`, so
`canPrefetchFileEntry` rejects a file over 1 MiB before `service.prepare` and before a
file query. A tab intent has no known size and may issue/join the file query; once its returned
`FileResult` reveals more than 1 MiB, record `size-gated` and stop before buffer/data/syntax
preparation. Do not make the service query a known-oversize file-tree intent.

### Step 5: Transfer syntax/highlighter work and share the LSP match query

**Goal:** Make prepared highlighting survive activation while keeping configuration and server
lifecycles exact.

Split global reactive state from per-file resolution in
`features/editor/state/file-open-preparer.ts`:

- `FileOpenIntentEnvironment` is owner-wide and contains only current shared inputs: whether
  highlighting is globally disabled; exact shared Tree-sitter/Shiki provider objects; effective
  selected/committed/actually-applied theme identities; the existing
  `getResolvedShikiThemeContentHash(appliedThemeId)` value backed by
  `registrationContentHashById`; and syntax/LSP-affecting setting values or generations. It does not
  contain a language id or Markdown/file-specific options.
- `ResolvedFileOpenIntentConfiguration` is produced separately for each candidate from its path/live
  document or clean `FileResult`, exact source snapshot, and a captured
  `{ environment, environmentGeneration }`. It contains resolved language id, the document-data tag,
  the applicable exact providers, exact mounted structural options (`includeCaptures`,
  `includeHighlights`, and `syntaxMode`), and two explicit primitive-field configuration tags—one
  per provider family.

The per-candidate resolver must use the same language and option policy as
`createEditorSyntaxHighlightingPlugins`, including Markdown/capture-requiring languages and the
presence of a separate Shiki visual highlighter. One owner may hold TypeScript, Markdown, and other
entries simultaneously; no file's resolved options may overwrite another's.

The tags are equality contracts, not cache keys. Reuse that existing resolved-theme content hash
only inside the exact in-memory Shiki configuration tag; do not invent a “registration revision,”
file/content hash, or `ohash`. Tree-sitter remains present for structure when Shiki paints tokens,
matching `createEditorSyntaxHighlightingPlugins`; do not model the source as a single mutually
exclusive provider. The preparer and mounted factory must resolve identical structural options:
capture-requiring Markdown prepares captures, ordinary languages do not, and Tree-sitter highlights
are disabled only when the separate highlighter actually paints them. If selected, committed, and
Plan 060's actual `appliedThemeId` are not all equal while a preview/load/fallback is active, prepare
buffer/structure but skip speculative Shiki work; the mounted fallback or a later intent may create
it after the exact theme lands.

Capture the environment generation before resolving each candidate and store both it and the
resolved result on the entry. `setEnvironment(next)` compares the explicit primitive fields and
provider object identities first; an equivalent StrictMode replay is a no-op and does not increment
anything. Only a semantic environment change increments the environment generation and re-resolves
each retained candidate from its stored path/source identity without rescanning document text.

Reconciliation respects `startStage`'s one-shot family contract:

- if the document-data tag changed, dispose the whole entry and requeue the recent candidate from
  document data;
- if a changed family is still an unstarted service-queue item, replace that queued request and keep
  the data lease/unchanged started sibling;
- if a changed family has already called `startStage` (pending or ready), dispose the whole prepared
  lease and requeue the candidate from document data rather than pretending that family can restart
  inside the consumed one-shot slot; and
- if all document/family tags are unchanged (for example an LSP-only generation change), update the
  last-reconciled environment generation and preserve every active promise/result.

Each pending result still validates its family request generation, exact tag, and snapshot before
storage/paint. Before a stage starts or a claim returns, synchronously reconcile if the entry's
environment generation is stale. A race that reaches core after claim is handled by `take`'s
independent family validation, which may reject one stale family without discarding a valid sibling.

Keep the connect-lifecycle, root, and environment generations as three independent counters. A
StrictMode replay must not change root/environment identity; a root switch must not masquerade as a
theme update; and an environment update must not satisfy or cancel the root guard on an in-flight
file query.

Drive the environment from real subscriptions. Add a narrow bridge inside `EditorStateProvider`
(which already sits below `EditorColorThemeProvider` and the query provider): use focused
`useSettingValue` calls for syntax/LSP-affecting settings, combine them with
`useEditorColorTheme()`, and apply the immutable environment with `owner.setEnvironment(...)` in a
layout effect that has no cleanup. Keep the long-lived `connect`/`scheduleDisconnect` effect
separate. This installs the new environment before passive Foresight registration/work and never
mutates the owner during React render. Exact core `take` validation remains the final guard for any
activation already in flight during a commit. `readSettingsMirror()` may still supply an immediate
non-React snapshot inside pure helpers, but it is not a subscription and must not be the service's
invalidation mechanism.

Extend the core syntax controller with independent adoption paths for the structural and highlighter
transfers. Install ready structural folds/brackets/captures and ready highlighter tokens/theme inside
the atomic first document paint, then continue each in-flight result through its family's normal
latest-request, snapshot, provider, coverage, and stale-result guards. Install the transferred promise
as the active request; do not call `refresh`, `open`, `parse`, or `query` again for the same pending
coverage. After success, request only uncovered structural coverage; Shiki's full transfer needs no
second request. Do not create a second session or duplicate the first worker request for either
successful transfer. Preserve Plan 060's generation-tagged `EditorInitialPaintEvent`:
prepared ready and pending paths each emit one `text` phase and one `highlight-settled` phase only
after the applicable visual result reaches the mounted view. Structural readiness must not emit the
terminal phase or dismiss the overlay while Shiki remains pending. Plain/error may settle and
dismiss, but never emit the successful highlight benchmark mark.

If a structural range result covers only the estimated viewport, mark its coverage explicitly.
The mounted controller should use it immediately, then request missing actual-visible/full ranges
through the same transferred session. Never treat a partial range as a full parse.

Extract `/lsp/match` into
`apps/web/src/features/editor/state/language-server-match-query.ts`:

- query key includes root, match path, and an explicit LSP settings/configuration generation as
  separate fields, or the provider must invalidate that query family synchronously on the same
  settings change;
- the query function uses the real client and AbortSignal;
- response decoding still uses `languageServerMatches`;
- mounted hooks and Foresight prefetch use the same options/in-flight request;
- set a nonzero freshness window (start with 30 seconds) and a bounded GC window so a successful
  prefetch is not immediately refetched by the mounted hook; and
- errors retain the existing “no matches” UI behavior while remaining observable in query state.

Replace the hook-local effect with `useQuery`. Foresight may call `prefetchQuery` at lower priority
after file preparation is scheduled. A prefetched match only saves the match round trip; actual LSP
plugin/server creation remains gated by a mounted Editor.

### Step 6: Wire invalidation, budgets, and one wide lifecycle event

**Goal:** Make stale or wasteful speculation self-cleaning and diagnosable without log spam.

Subscribe the service to the file-snapshot query cache. When data for a path changes version or a
query is removed, dispose prepared clean entries that no longer match. This centralizes save,
workspace-event, search-replace, conflict-resolution, rename, and delete effects that already update
that query cache; do not add invalidation calls to every writer unless the cache event lacks the
required path/version.

Also invalidate, dispose, or reconcile as follows:

- actual workspace-root transition (an equivalent `setRoot` replay is a no-op);
- retained live buffer revision/snapshot change;
- live document delete or rename;
- structural/highlighter provider, theme, or settings environment change follows Step 5 exactly:
  preserve semantically unchanged entries, replace changed unstarted family jobs, and rebuild only
  entries whose document-data tag or already-started family became incompatible;
- preparation abort/failure;
- TTL, entry-count, or byte-budget eviction; and
- provider/service teardown.

Do not invalidate a live document merely because its disk query changes while the buffer is dirty.
Its prepared lease is governed by local revision/snapshot.

Emit one terminal `editor.file_open_intent` wide event per deduplicated intent operation. Enrich it
through the lifecycle with:

```text
source, root/path classification, tab presence, known/file size, leadMs,
query hit/fetch/duration, live-vs-clean source, prepared range,
buffer/line/structural/highlighter/lsp stage durations, provider/config generations,
estimated retained bytes, dedupe count, promotion stages,
terminal outcome, abort/eviction/failure reason, post-activation work counters
```

Do not log raw file contents, full paths if current client logging redacts them, tokens, or one line
per stage. Use the repository's structured error catalog for real failures; never `new Error`.

### Step 7: Prove promotion, fallback, and performance

**Goal:** Verify correctness under races first, then demonstrate that predicted opens remove the
target work.

Add deterministic service tests with controlled promises and clocks for:

- duplicate tab/tree intents sharing one query and one preparation;
- latest-intent queue priority with one CPU job;
- supersession cancelling local heavy work but not a shared query;
- clean file version change before and after preparation;
- live clean and live dirty documents using local snapshot identity;
- `claimLive` returning retained state synchronously with and without a completed prepared lease,
  before any file result resolves;
- closing the last tab for a dirty document, then reopening its canonical path through projected
  `nextPanels`, claims the tabless retained buffer before selection/file readiness and creates no
  duplicate buffer;
- switching between two already-rendered tabs claims/ensures the target view before the workspace
  selection publish and before React core can call `startStage`/`createSession`;
- edits/store notifications invalidating a live prepared lease immediately;
- exact clean claim, partial claim, double claim, and claim during either in-flight transfer;
- claim never waiting for an unresolved query or queued preparation;
- an already-fetching file query is joined, stale cached data refreshes, and the returned exact
  `FileResult` drives the clean key;
- root switch, root -> null -> new-root, rename/delete query removal, theme/config change, TTL, LRU,
  byte budget, and teardown; while root is null every prepare/claim misses and a prior in-flight
  completion cannot repopulate either the null or later-root generation;
- repeated `setRoot` calls with the same normalized root (including `null`) preserve the generation,
  queue, and prepared work across StrictMode replay, while a real transition clears them once;
- an actually mounted host gates/cancels preparation, an inactive tab with only retained
  `viewsByTabId` state remains eligible, and a StrictMode register/unregister/register replay emits no
  false transition;
- a benchmark scope rejects overlap/prior nonterminal work, tags target and non-target intents,
  quarantines before reset mutation, drains every scoped service/query promise, exposes all runtime
  ids, and releases only after proof; a failed reset remains quarantined;
- deferred file and LSP-match requests started only by mounted miss/query-only consumers are
  observer-free after unmount, cancelled/awaited to terminal, and absent after the next task/frame;
  another observer makes the reset reject rather than remove shared query state;
- disjoint roots with the same tree-relative suffix resolve to different canonical paths, overlapping
  roots exposing one canonical file intentionally share QueryClient/live-document authority, and an
  in-flight result from a superseded root generation cannot be stored/claimed under the new root;
- claimed cancellation ownership surviving later root/service cleanup;
- successful save with no racing edit moving to `f:<server version>`, while a raced save retains its
  newer `e:` revision and dirty state; and
- every terminal path disposing both session families exactly once and finishing one wide event.

Use the real in-process server/client fixtures for integration tests. Mock only the clock, scheduler,
worker/provider boundary, and external timing; do not mock Platform's server/client or document
service. Build real temp files and assert through the real file route/query options.

Add DOM tests proving:

- tabs still register through `useForesight`;
- tree rows still register/unregister through the imperative registry;
- both file callbacks send equivalent intent data to the same service;
- directories still use directory prefetch;
- files over the size limit stay gated; and
- open/select/previous/reopen/close-successor and parked-root restore transactions claim/ensure an
  active retained document before selection publication and `FileResult` readiness;
- close-dirty-then-reopen claims the tabless retained document through the projected next tab and
  never creates a duplicate buffer or requires an old tab association;
- a fresh query-ready **data-prepared** claim ensures before selection publication; query-only and
  asynchronously ready results do no command-time construction and reconcile in layout before paint;
- opening a brand-new file-tree tab can use its validated projected target to claim a ready clean
  candidate before publication; no already-published tab association is required;
- `EditorStateProvider` remains usable with exactly one active service subscription/scheduler after
  a React StrictMode effect replay, and replaying the same root preserves its generation/prepared work;
- mounted-host registration is StrictMode-safe and distinguishes a real Editor host from retained
  inactive-tab view state;
- simultaneous TypeScript and Markdown entries retain distinct resolved structural options under one
  owner environment;
- an equivalent StrictMode environment replay is a no-op; settings/theme changes re-resolve
  candidates, update unstarted family jobs in place, preserve fully unchanged entries, and rebuild a
  lease when an already-started family changed, without disconnecting the owner;
- the trace-only sample begin/reset bridge registers/unregisters with provider ownership, rejects
  concurrent/dirty resets, drains target and non-target intent work, clears only the exact clean
  target state, cancels/awaits mounted-only target file/LSP queries, awaits both worker barriers, and
  leaves shared provider caches intact; its query primer warms only the exact file query and returns
  no data; and
- prefetched LSP matches remain fresh for the mounted hook and configuration changes do not reuse an
  old match.

Add a real-browser workbench test with a known highlighted file. Run a prediction, activate the
target, and assert:

- Plan 060's cached frame, when present, is inert and not counted authoritative;
- both query-only-ready (layout reconciliation) and full-prepared (command transaction) activations
  have an authoritative view in the first browser-painted frame—no intermediate blank frame or
  passive-effect-only install—while a miss never waits;
- the real editor adopts the exact prepared buffer/view lease;
- a fully prepared hit performs zero post-activation file reads, buffer constructions,
  full-document line-start scans, and structural/highlighter session creations;
- retained live state renders without waiting for the deliberately delayed file query;
- Tree-sitter and Shiki transfers coexist, keep distinct runtime ids, and neither worker session is
  reopened or disposed by the other; pending adoption sends zero duplicate open/refresh/parse/query
  requests for already-covered work;
- DOM construction and actual viewport measurement still occur normally;
- the prepared highlighter result paints (with structural data adopted independently), emits the
  same generation-tagged highlight event/mark as a demand result, and the overlay leaves through
  that shared handoff; and
- a deliberately stale/mismatched lease is rejected with no delay and normal highlighting wins.

After Steps 1–6 provide runtime ids, barriers, and the intent owner, finish the benchmark control and
run the final paired gate:

1. Extend the existing trace-only `window.__editorPerfTrace` handle in
   `features/editor/state/performance-trace.ts` with
   `beginEditorOpenSample({ rootPath, path }): { readonly sampleId: string }`,
   `resetEditorOpenSample({ sampleId, rootPath, path }): Promise<EditorOpenSampleResetResult>`, and
   `primeEditorOpenQuery({ rootPath, path }): Promise<{ readonly ready: true }>`. Add one benchmark-
   control registration; `EditorStateProvider` supplies composed handlers with exact access to
   QueryClient, workspace selection/tab commands and state, document/view state, the intent owner,
   the shared file/LSP query-key helpers, Plan 060's cache removal, and both workers' per-runtime/
   provider-wide barrier controls. The
   query-only handler calls
   `ensureFileSnapshotQuery` directly and returns no file
   content/version; it must not enqueue document data, syntax, highlighting, or LSP work. These
   controls do not belong in Step 0 because the reset owners do not exist there yet.
2. Before each warmup or measured mode, call `beginEditorOpenSample` and retain its opaque id; the
   provider calls `owner.beginBenchmarkSample` before the query primer, pointer trajectory, or
   activation can run. Keep one dedicated inert, non-file benchmark surface available outside the
   samples. For an exact clean, unshared target, `resetEditorOpenSample` validates the id/target and
   synchronously calls that scope's `quarantine()` before any workspace mutation. Through the normal
   workspace command transaction, activate the inert surface and close the exact sampled file tab;
   await the workspace commit, React editor unmount, mounted-registry removal, and removal of every
   selected-file and LSP-match query observer for that root/path. Verify no remaining tab, view, or
   query observer references the target and reject the reset as shared if any does. Use the exact
   file query key plus a root/path predicate over all LSP configuration generations to cancel and
   await any target fetch that the mounted consumers started outside the intent service; require each
   matching query's `fetchStatus` to be idle, then remove only those target query records. Then call
   the scope's `quiesce()` to drain **all** target and non-target intent operations observed during
   the sample, remove any remaining clean document/view state, await its returned per-runtime barriers
   plus the explicit Tree-sitter/Shiki owner `awaitIdleFence()` calls, and remove the exact target
   visual record before resetting counters.
   After one extra task and animation frame, assert that no query, view, document, intent entry, or
   worker session for the target reappeared and that the service global heavy-work slot has no prior-
   sample owner; only then return cleared/target/non-target counts plus `quiescent: true` and call
   `release()`. Reject dirty/shared targets, duplicate/unknown sample ids, concurrent calls, and
   missing registration. Expose it only under the existing trace URL flag; unregister on true
   provider teardown. Do not expose editor data, reload, remove unrelated QueryClient data, or flush
   shared grammar/theme/provider/module/font caches. A failed half-reset remains globally quarantined
   and aborts that benchmark run rather than continuing with a contaminated next sample.
3. Make the primary comparison deliberately **warm shared-provider-cache**. Give every mode balanced
   warmups, then randomize at least 30 measured samples per mode in the same browser process using a
   fresh unique path with identical bytes/language/size for every sample:
   - **miss/control:** activate without Foresight lead;
   - **query-only:** call the trace-only query primer, await `ready`, then activate without firing the
     Foresight producer; and
   - **prepared hit:** 50 ms, 150 ms, and 300 ms lead windows.
     Use keyboard or dispatched activation without pointer travel for miss/query-only and assert their
     completed sample scopes contain zero intents; use the real Foresight adapter/trajectory for
     prepared samples and report every target/non-target/wasted intent it generated. Before every
     authoritative sample, await the scoped reset bridge for the prior sample and remove Plan 060's
     one-record visual frame. Keep a separate compatibility group where every mode receives an
     identically seeded frame; do not mix it into the pipeline gate. State the warm-cache model in the
     output—unique paths alone are not proof of isolation.
4. After opening the sample scope and immediately before activation, reset observers/counters. Report
   p50/p95 click-to-first-text and
   click-to-authoritative-highlight, lead time, post-click file reads, buffer builds, full line-index
   scans, session creations, worker open/refresh/parse/query requests, promoted stage, retained
   bytes, evictions, and wasted intents. A full hit requires the structural zeros above; a pending
   transfer cannot hide a duplicate request behind session reuse.
5. Define miss regression noise from paired control dispersion (for example the larger of a small
   fixed floor and a median-absolute-deviation-derived interval). If cold provider startup is useful,
   add a separate process-per-sample diagnostic; never mix it into the warm gate.
6. Require no miss/control regression beyond measured noise and a statistically useful same-run
   improvement in click-to-authoritative-highlight. Set the exact relative threshold only after at
   least three baseline/final paired runs, and record the value/samples in the benchmark script
   rather than inventing an absolute millisecond promise. Every result must prove all target and
   non-target service promises plus worker barriers from the prior sample settled before the next
   sample began.

## Test plan

### Editor

- Unit: prepared contract validation, one-shot claim, line-index correctness, folds/tab-size parity.
- Unit: data-only claim; independently queued/unstarted/ready/in-flight structural and highlighter
  transfer; exact structural options; partial coverage; stale result; abort/error; disposal count.
- Worker: same logical document with distinct runtime ids cannot cross-edit/query/dispose in
  Tree-sitter or Shiki, disposal during pending work cannot repopulate either runtime, and the
  per-runtime idle acknowledgement cannot resolve before all earlier work is terminal.
- Integration: atomic external `attachSession` with hit, partial hit, mismatch, and miss; prepared
  tokens survive the first publish, pending promises become the controller's active requests, and
  request counters prove no duplicate open/refresh/parse/query for covered work. A text-only owned
  document proves it rejects/does not expose preparation and retains normal demand behavior.
- React: plugin/provider synchronization precedes document adoption; StrictMode replay consumes once
  without replacement and true unmount disposes once.
- Contract: core and React public API fixtures plus generated API health.

### Platform

- Unit: staged service, nested identity maps, dedupe, queue, cancellation, budgets, TTL, query events.
- Unit: WorkspaceDocumentService clean-buffer adoption, namespaced file revision/save races, and
  dirty/existing-buffer rejection.
- DOM: both Foresight adapters, command-transaction live-before-publish/clean-after-file activation
  ordering, StrictMode provider lifecycle, reactive settings invalidation, and shared fresh LSP query
  behavior; trace-only sample-reset registration, exact cleanup, rejection, and awaited completion.
- Browser: authoritative highlighted paint and zero post-click transferable work on a full hit.
- Benchmark: same-run miss/query-only/prepared modes at multiple lead windows, with every warmup and
  measured run inside a scope that drains target/non-target intent work plus per-runtime/provider-wide
  worker quiescence and mounted-only target file/LSP QueryClient work before the next randomized
  sample.

### Verification discipline

- Identify the concrete failure each focused command can catch before running it.
- Run Platform app tests under `bun --bun`; run browser orchestration with the separate browser
  config under plain Node as required by the repository.
- Run Editor runtime-neutral tests with its local Vitest setup.
- Rerun Plan 060's landed snapshot/syntax/theme/cache/overlay handoff tests because this plan edits the
  same adoption and React boundaries; do not treat the prerequisite grep as regression coverage.
- Review both worktree diffs and `git diff --check`. Do not use an absolute test count.

## Done criteria

- [ ] Tabs and file-tree files retain their correct Foresight adapters and invoke one intent service.
- [ ] Foresight dependencies remain unchanged unless a reconciled, required API change is documented.
- [ ] No new hash, `ohash`, browser file-version calculation, or version-prefix knowledge exists.
- [ ] Clean speculative entries are root-generation lifecycle-bucketed and match canonical
      path/opaque server version; live entries are guarded by current root generation/path containment
      and match canonical document/local revision plus exact snapshot identity. Existing tabs may
      supply scroll state but are not claim authority. Query/live authorities remain canonical-path
      shared, not duplicated per selected root.
- [ ] Plan 060's persisted viewport remains path/theme-only visual paint; no one attempts to promote
      or content-validate it.
- [ ] TanStack Query owns only server data; WorkspaceDocumentService remains the only live-buffer
      authority.
- [ ] Actual mounted-host state comes from the narrow StrictMode-safe `MountedEditorRegistry`, never
      retained `viewsByTabId`; inactive tabs remain eligible for Foresight preparation.
- [ ] Full, partial, stale, duplicate, aborted, failed, and missed preparation paths never delay open.
- [ ] Every command/root-restore transition that reveals a retained live document ensures its view
      before publishing the active selection and before `FileResult` readiness, with an optional
      prepared lease; clean disk candidates still validate against the ready file result.
- [ ] A fresh query-ready data-prepared clean hit is installed synchronously before selection
      publication, including for a brand-new file-tree tab authorized by projected workspace state;
      query-only/later async results do no command-time construction and reconcile in
      `EditorSurfaceTabBody` layout phase. Neither path shows an avoidable intermediate blank frame or
      delays a miss.
- [ ] Prepared buffer, line index, folds/tab size, and independent ready/in-flight structural and
      highlighter work can transfer one time.
- [ ] Data-only claims work while both provider stages are queued; only the service scheduler starts
      each explicit family stage, and the mounted Editor demand-starts missing families nonblocking.
- [ ] Structural preparation exactly matches mounted `includeCaptures`/`includeHighlights`/
      `syntaxMode` policy for Markdown/capture and ordinary files.
- [ ] Owner-wide environment state contains no per-file language/options; each entry stores and
      revalidates its own resolved configuration/environment generation, including simultaneous
      TypeScript and Markdown candidates, semantic-equality no-op, queued-family replacement, and
      whole-lease rebuild when a one-shot started family changes.
- [ ] Normal, speculative, multi-view, and direct built-in-provider sessions use unique runtime ids
      even when generic callers omit one; logical document identity remains unchanged, no session can
      dispose another's worker document, and late work cannot repopulate disposed state.
- [ ] Atomic initial installation paints ready prepared tokens once; React synchronizes target
      plugins/providers before adopting the document.
- [ ] Pending transfers become the controller's active requests; successful adoption sends no
      duplicate open/refresh/parse/query and requests only genuinely uncovered structural coverage.
- [ ] React Editor and `EditorStateProvider` StrictMode replays retain usable resources without
      replacement sessions/duplicate subscriptions; equivalent root/environment replay is a no-op,
      and real teardown disposes each owner exactly once.
- [ ] Prepared ready/pending paths preserve the landed generation-tagged text/highlight event and
      machine-readable marks; plain/error never count as highlighted paint.
- [ ] Plan 060's landed core snapshot/syntax and Platform cache/theme/DOM/browser handoff regressions
      still pass after prepared-open adoption changes.
- [ ] A fully prepared browser hit starts zero file reads, buffer builds, full line-index scans, and
      syntax/highlighter session creations after activation.
- [ ] Dirty buffers are never replaced by prefetched disk content.
- [ ] Closing the last dirty tab and reopening the same canonical path claims the retained tabless
      buffer before selection/file readiness and never creates a duplicate document.
- [ ] Clean content revisions use `f:<opaque version>` without hashing; unraced and raced save paths
      update clean/edited revisions correctly.
- [ ] Directory behavior, large-file gates, root switches, saves, edits, renames, deletes, and
      theme/source changes dispose the correct speculative work.
- [ ] Clearing the workspace installs a null root generation that rejects prepare/claim and prevents
      stale old-root completions from entering a later root.
- [ ] LSP matching is shared and prefetched without starting an LSP server.
- [ ] File-query preparation joins in-flight fetches, refreshes stale data, and settings/theme/LSP
      configuration changes invalidate through real subscriptions.
- [ ] One terminal wide event describes each deduplicated operation without file contents or stage
      log spam.
- [ ] Per-runtime disposal acknowledgements and provider-wide Tree-sitter/Shiki `awaitIdleFence()`
      controls make all earlier work terminal without flushing shared caches.
- [ ] Every benchmark warmup/measurement has an explicit owner scope acquired before any primer,
      trajectory, or activation; reset quarantines before workspace mutation and drains every target/
      non-target intent operation before release.
- [ ] Reset removes target file/LSP observers, cancels and awaits mounted-only target fetches across
      LSP configuration generations, verifies idle, and removes only those target query records before
      the next randomized sample.
- [ ] The prepared-hit benchmark improves authoritative-highlight latency without regressing misses
      beyond measured noise under the documented balanced warm-provider-cache model, with an awaited
      worker-idle barrier preventing prior samples from contaminating later ones.
- [ ] The trace-enabled benchmark bridge can reset one clean sample in-page and proves quiescence
      after deactivating/closing its tab, including an extra task/frame no-repopulation check, without
      exposing editor data, accepting dirty state, reloading, or flushing shared warm caches.
- [ ] The trace-only query primer awaits exactly the shared `FileResult` query and cannot start
      document-data, syntax, highlighting, or LSP preparation.
- [ ] Editor and Platform focused tests, typecheck, lint, format, API health, and build all exit 0.
- [ ] No user-owned Editor selection/reveal/cursor-history change was reverted or rewritten.
- [ ] This plan is deleted, its `plans/README.md` row is removed, and the completed 060/061 dependency
      note is removed after verified completion.
- [ ] The landed typed activation boundary remains the sole command path and has a focused
      claim/ensure-before-publication regression test.
- [ ] Root `PLAN.md`, if it scheduled the approved sequence, closes/removes completed 061.

## STOP conditions

Stop and report instead of improvising if:

- A provider session cannot be transferred with exactly one owner, or the same worker/document would
  be driven concurrently by speculative and mounted controllers.
- Tree-sitter or Shiki cannot separate internal runtime-session keys from the logical document id
  without changing public result identity or language resolution.
- Atomic installation cannot prevent prepared tokens/folds from being cleared before first paint.
- The only way to use a prepared artifact is to await it during activation.
- Promotion would make TanStack Query or the intent service authoritative for mutable document text.
- A prepared buffer cannot be validated by file version plus exact snapshot identity.
- Line-start adoption requires rebuilding or comparing the full line index on activation.
- A hidden Editor/DOM host is required to prepare the proposed artifact.
- Dirty text would need to enter query storage or persistent storage.
- The service cannot observe a root/file/config invalidation before a stale payload could paint.
- Instrumentation cannot distinguish Plan 060's visual frame from authoritative editor paint.
- Existing uncommitted Editor edits overlap semantically rather than merely sharing files.
- A focused verification fails twice after a reasonable correction.

## Maintenance notes

- Treat `FileResult.version` as opaque forever. Its server implementation may change without a web
  or Editor migration.
- The `f:` prefix namespaces an already-provided identity; it is not an interpreted version format or
  a browser checksum. Never branch on the opaque suffix.
- The Plan 060 frame is intentionally allowed to be stale because it is never promoted. Any future
  attempt to reuse its tokens in Editor state must cross this plan's exact validation boundary.
- The 8-entry/32-MiB/30-second limits and 1-MiB preparation ceiling are initial measured-policy
  values, not user settings. Change them only with benchmark and retained-memory evidence.
- If the roadmap's shared `WorkerManager` lands, adapt `FileOpenIntentService` to its owner/priority/
  cancellation/budget interface; do not keep a parallel scheduler.
- New prepared stages must declare owner, exact identity, transfer behavior, byte accounting,
  cancellation, stale-result policy, and post-activation fallback before implementation.
- Any new worker-backed provider must use a unique runtime-session identity and declare whether it is
  structural, visual, or both before joining the prepared-document contract.
- A new Foresight surface should reuse `FileOpenIntentService.prepare` but may need its own
  registration adapter, just as tabs and the Shadow DOM file tree do.
