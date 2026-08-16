# Plan 022: Delete the ~4,400 unreachable lines across tree, ui, contracts, provider, and web

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
>
> ```bash
> PATHS="packages/tree packages/ui packages/contracts/src/index.ts apps/server/src/provider apps/server/src/orchestration apps/web/src/features/logs apps/web/src/features/git apps/web/src/features/editor apps/web/src/lib/query-keys.ts apps/web/src/components/workspace/editor-tabs apps/web/src/components/command-palette package.json"
> git diff --stat ace313f..HEAD -- $PATHS   # committed drift
> git diff --stat -- $PATHS                 # uncommitted drift
> ```
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
>
> **Working-tree note (read this, it is not optional)**: the repository has
> _uncommitted_ work in files this plan does not touch, and **`bun run
format:check` was RED at baseline** because of it. The offending set has
> already shifted once since this plan was written (it was
> `packages/contracts/src/settings/keys.ts` **and**
> `apps/web/src/features/settings/hooks/use-setting-inspection.ts`; on a later
> check only the latter still failed). **Do not assume a count — Step 0 makes you
> record the real one, and every later check compares against your recording, not
> against a number in this file.** Do not "fix", format, or stage those files;
> they are someone else's in-flight work.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: dead-code
- **Planned at**: commit `ace313f`, 2026-08-16

## Why this matters

An audit of this repository found that roughly 4,400 lines across five packages
are exported, typechecked, linted, reviewed and shipped — and cannot be reached
by any code path. `packages/tree` carries a 877-line parallel store, a 562-line
async scheduler, and a four-state lazy-directory-load machine that no caller
drives. `packages/ui` carries nine primitives nobody imports plus two npm
dependencies (`ai`, `embla-carousel-react`) installed only for them. The
`@workspace/contracts` barrel publishes ~190 names with zero external reference,
so its one architectural job — being the place a reviewer notices someone
widening the wire contract — is buried under three times as much noise. The
provider SPI advertises members nothing calls, forcing one adapter into a stub
that can only throw.

This is the audit's cross-cutting theme **T4 — "Exported-but-unreachable
surface"**, and this plan closes it. The payoff is not bytes: it is that after
this lands, "is this used?" has an answer, `knip` output becomes trustworthy, and
four _other_ planned refactors (026, 027, 028, 039) stop having to reason about
machinery that cannot run.

**Typecheck is the whole verification story.** Every deletion here is of code
with zero callers; if a deletion is wrong, `tsgo` says so immediately with the
exact call site. There is nothing subtle to get right — only a lot of it.

## Current state

### Repo facts you need

- Bun monorepo, TypeScript 6, `bun@1.3.10`. Workspaces are `apps/{web,server,desktop}`
  and `packages/{contracts,observability,tree,ui}`.
- **`packages/editor-*` are symlinks to a sibling `../../Editor` checkout. They
  are never in scope for anything. Do not read, edit, or grep into them.**
- `packages/tree` is a **Preact** package (with a React wrapper component). The
  React Compiler lint rules are deliberately off there.
- Path alias in `apps/web`: `@/*` → `./src/*`.
- **A dev server is always running at http://localhost:5173. Never start one.**

### Conventions from `AGENTS.md` that govern this work (quoted verbatim — you have not read that file)

> ## Greenfield, No Backward Compatibility
>
> - This project is greenfield and not live: no releases, no external users, no data anyone needs migrated.
> - No backward compatibility shims, no legacy aliases, no deprecation windows. Update every call site in the same pass.

> ## Naming And Refactors
>
> - Delete obsolete tests instead of preserving old behavior.
> - Remove duplicate code aggressively.

> ## Code Organization
>
> - Do not create empty folders.
> - Import exact files through `@/`. Do not add barrel `index.ts` files.
> - Barrel files are allowed only at package entry points such as `packages/*/src/index.ts` that back the package's `"."` export. Do not add feature, folder, or utility barrels.

> ## Control Flow
>
> - Keep nesting depth to 3 or less.
> - Use guard clauses and early returns. Keep the happy path shallow.
> - Do not use `else` after an early return.

> ## Logs
>
> - Never throw `new Error`. Create errors with `createError` from `evlog` — in practice through the feature's `structured-errors.ts` wrapper (`createStructuredError` or a `defineErrorCatalog` entry) so the error carries `code`, `status`, `why`, and `fix`.

Note the barrel rule does **not** conflict with Step 5: that step _shrinks_ the
sanctioned package-entry barrel `packages/contracts/src/index.ts`, it does not
remove it.

### A. `packages/tree` — ~3,050 unreachable lines

Whole files with zero importers anywhere in `apps/` or `packages/` (verified by
`git grep` over tracked files):

| File                                                                      | Lines | Evidence                                                                                                                                                                            |
| ------------------------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/tree/src/utils/path-store/static-store.ts`                      | 877   | `export class StaticPathStore` at :747. The only other hits for `static-store` in the repo are two _prose comments_ in `builder.ts:36` and `builder.ts:992`.                        |
| `packages/tree/src/utils/path-store/scheduler.ts`                         | 562   | `export function createPathStoreScheduler` at :163. Zero importers.                                                                                                                 |
| `packages/tree/src/utils/path-store/cleanup.ts`                           | 413   | `cleanupPathStoreState` at :397, reachable only via `PathStore.cleanup()` (store.ts:670), which nothing calls.                                                                      |
| `packages/tree/src/utils/themeToTreeStyles.ts`                            | 222   | `themeToTreeStyles` (:127), `TreeThemeInput` (:7), `TreeThemeStyles` (:18) — no external reference.                                                                                 |
| `packages/tree/src/utils/sortChildren.ts`                                 | 161   | `sortChildren` (:99), `ChildrenComparator` (:8), `ChildrenSortOption` (:14), `alphabeticalChildrenComparator` (:51), `defaultChildrenComparator` (:64) — all self-referential only. |
| `packages/tree/src/utils/path-store/visible-tree-projection.ts`           | 109   | `createVisibleTreeProjection` (:19) never imported; `projection.ts:617 createVisibleTreeProjectionFromData` supersedes it.                                                          |
| `packages/tree/src/hooks/useFileTreeSelector.ts`                          | 87    | Imported only by `useFileTreeSearch.ts:6`.                                                                                                                                          |
| `packages/tree/src/hooks/useFileTreeSearch.ts`                            | 65    | `useFileTreeSearch` (:33) — zero consumers.                                                                                                                                         |
| `packages/tree/src/utils/path-store/internal/benchmarkInstrumentation.ts` | 63    | See "instrumentation" below.                                                                                                                                                        |

**Sum: 2,559 lines of whole files.**

**The `skipSubtreeCountPass` flag exists only for `static-store`.**
`packages/tree/src/utils/path-store/builder.ts:31-40`:

```ts
// Options passed to PathStoreBuilder.finish(). Callers that run their own
// per-node count computation afterwards (PathStore constructor always runs
// either initializeOpenVisibleCounts or recomputeCountsRecursive) can set
// skipSubtreeCountPass to avoid buildPresortedFinish's backward accumulation
// pass. Callers that read subtreeNodeCount directly from the returned
// snapshot (for example, static-store) must leave skipSubtreeCountPass
// unset or false.
export interface BuilderFinishOptions {
  skipSubtreeCountPass?: boolean
}
```

There are exactly three `builder.finish(...)` call sites in the repo:
`static-store.ts:771` (dead), `cleanup.ts:359` (dead), and
`store.ts:266` — `builder.finish({ skipSubtreeCountPass: true })`. After the two
dead files go, the only caller always passes `true`.

**The instrumentation layer is permanently null.**
`internal/benchmarkInstrumentation.ts` exports `attachBenchmarkInstrumentation`,
`getBenchmarkInstrumentation`, `withBenchmarkPhase`, `setBenchmarkCounter`. The
**only** call site of `attachBenchmarkInstrumentation` in the entire repo is
`cleanup.ts:347` — inside the unreachable cleanup path. Therefore
`getBenchmarkInstrumentation(...)` at `builder.ts:240`, `builder.ts:273`,
`store.ts:227` and `scheduler.ts:164` always returns `null`, and every
`withBenchmarkPhase(...)` allocates a closure to call a timer that can never
fire.

There are **71** `withBenchmarkPhase(` call sites across **7** files (an earlier
audit note said 79 across 8 — that number is wrong; 71/7 is the verified count):

```
store.ts       27   ← 6 of these sit inside the methods deleted in 1b
cleanup.ts     14   ← file is deleted in step 1b
scheduler.ts    9   ← file is deleted in step 1a
builder.ts      7   ← 1 of these sits inside the else-branch deleted in 1b
projection.ts   7
events.ts       4
canonical.ts    3
```

After steps 1a and 1b, **41 wrappers remain to unwrap** in step 1c:
store.ts 21, projection.ts 7, builder.ts 6, events.ts 4, canonical.ts 3.

Typical shapes, `packages/tree/src/utils/path-store/store.ts:326-340`:

```ts
  public list(path?: string): string[] {
    return withBenchmarkPhase(this.#state.instrumentation, 'store.list', () =>
      listPaths(this.#state, path),
    )
  }

  public add(path: string): void {
    withBenchmarkPhase(this.#state.instrumentation, 'store.add', () => {
      const previousVisibleCount = getVisibleCount(this.#state)
      recordEvent(
        this.#state,
        finalizeEvent(this.#state, previousVisibleCount, addPath(this.#state, path)),
      )
    })
  }
```

`events.ts` additionally hand-writes the null branch, so unwrapping collapses a
guard — `packages/tree/src/utils/path-store/events.ts:279-287`:

```ts
const instrumentation = state.instrumentation
if (instrumentation == null) {
  recordEventNow(state, event)
  return
}

withBenchmarkPhase(instrumentation, 'store.events.record', () => recordEventNow(state, event))
```

**The child-load / cleanup API.** `packages/tree/src/utils/path-store/store.ts:479-697`
is `getDirectoryLoadState`, `markDirectoryUnloaded`, `beginChildLoad`,
`applyChildPatch`, `completeChildLoad`, `failChildLoad`, `cleanup` — the
lazy-directory-load state machine. The only repo caller of any of them is
`scheduler.ts:280-360`, which itself has no callers.
`packages/tree/src/utils/model/FileTreeController.ts:1496 #createStore` always
builds `new PathStore({...paths...})` from a complete path array, and the
controller's only refresh path is the whole-tree `resetPaths` at :1189. The app
model is eager-full-tree.

The types that go with it, `packages/tree/src/utils/path-store/public-types.ts:176-224`:

```ts
export interface PathStoreMarkDirectoryUnloadedEvent extends PathStoreEventInvalidation { … }
export interface PathStoreBeginChildLoadEvent extends PathStoreEventInvalidation { … }
export interface PathStoreApplyChildPatchEvent extends PathStoreEventInvalidation { … }
export interface PathStoreCompleteChildLoadEvent extends PathStoreEventInvalidation { … }
export interface PathStoreFailChildLoadEvent extends PathStoreEventInvalidation { … }
export interface PathStoreCleanupEvent extends PathStoreEventInvalidation, PathStoreCleanupResult { … }

export type PathStoreSemanticEvent =
  | PathStoreAddEvent
  | PathStoreRemoveEvent
  | PathStoreMoveEvent
  | PathStoreExpandEvent
  | PathStoreCollapseEvent
  | PathStoreMarkDirectoryUnloadedEvent
  | PathStoreBeginChildLoadEvent
  | PathStoreApplyChildPatchEvent
  | PathStoreCompleteChildLoadEvent
  | PathStoreFailChildLoadEvent
  | PathStoreCleanupEvent
```

`PathStoreVisibleRow.isLoading` / `.loadState` (public-types.ts:93,95) are
produced by `projection.ts` (:793, :881, :883-886, and `getVisibleRowLoadState`
at :892) and read by **nothing** — not `FileTreeView.tsx`, not
`utils/model/`, not `utils/render/`, not `apps/web`.

**The SSR / declarative-shadow-DOM path.**
`packages/tree/src/utils/render/FileTree.ts:746 preloadFileTree` (90 lines) and
`:140 serializeFileTreeSsrPayload` have zero callers repo-wide.
`renderToString` is imported at module scope (`FileTree.ts:4`) and used only at
`:797` inside `preloadFileTree`, and `render/FileTree.ts` is _value_-imported by
`hooks/useFileTree.ts:6` — so `preact-render-to-string` is statically reachable
from the client entry. `packages/tree/package.json:31` declares it.

The React wrapper's half, `packages/tree/src/components/FileTree.tsx`:

```ts
35: export type FileTreePreloadedData = Pick<FileTreeSsrPayload, 'id' | 'shadowHtml'>
64: function renderPreloadedShadowDom(children, preloadedData) {
68:   if (typeof window === 'undefined' && preloadedData != null) { … }
84: function hasExistingPreloadedContent(host: HTMLElement): boolean { … }
139:   preloadedData?: FileTreePreloadedData
209:     if (preloadedData != null && hasExistingPreloadedContent(hostElement)) {
210:       model.hydrate({ fileTreeContainer: hostElement })
211:     } else {
212:       model.render({ fileTreeContainer: hostElement })
213:     }
243:       suppressHydrationWarning: preloadedData != null,
```

`preloadedData` is referenced _only_ inside `FileTree.tsx` — no consumer passes
it — so `FileTree.hydrate()` (render/FileTree.ts:459), `hydrateFileTreeRoot`
(render/runtime.ts:26) and `FileTreeHydrationProps` (model/publicTypes.ts:254)
are all dead behind it.

Four files carry a Next.js `'use client'` directive in a package consumed only by
a Vite SPA and an Electron app: `components/FileTree.tsx:2`,
`hooks/useFileTree.ts:1`, `hooks/useFileTreeSearch.ts:1`,
`hooks/useFileTreeSelector.ts:1` (the last two get deleted outright).

**Two debug event listeners nothing dispatches.**
`packages/tree/src/components/FileTreeView.tsx:1292-1336` is a 45-line
`useLayoutEffect` registering `file-tree-debug-set-context-menu-trigger` and
`file-tree-debug-set-scroll-suppression`. `git grep file-tree-debug` returns
**only those four lines in that one file** — no dispatcher exists. Therefore
`debugContextMenuTriggerPathRef` (declared :1209) is permanently `null` and
`debugDisableScrollSuppressionRef` (declared :1210) is permanently `false`, which
makes four branch conditions dead:

```
2442:      if (debugDisableScrollSuppressionRef.current === true) {   ← inside markScrolling
2485:      if (rootElement == null || debugDisableScrollSuppressionRef.current === true) {
2520:      if (debugDisableScrollSuppressionRef.current === true) {   ← inside onScroll
2960:    debugContextMenuTriggerPathRef.current ??                    ← term in triggerPath chain
```

**Package manifest.** `packages/tree/package.json:8-17` exports eight wildcard
patterns including `"./utils/path-store/internal/*"` — which publishes a folder
literally named `internal`. That folder contains exactly one file
(`benchmarkInstrumentation.ts`), deleted by this plan.

> **Rejected sub-claim, do not act on it.** An earlier audit note argued
> `packages/tree` is "the entry-point outlier" and should get a `src/index.ts`
> barrel with a collapsed `"."` export. That premise was **refuted**:
> `packages/ui/package.json` uses the identical wildcard scheme with no `"."`
> entry, and `AGENTS.md` _permits_ rather than requires entry barrels. **Do not
> restructure the exports map** beyond dropping the now-empty `internal/*`
> pattern.

### B. `packages/ui` — 747 unreachable lines + 2 dependencies

Ten files with zero importers outside their own file (verified: the only hit
anywhere in the repo is prose in `plans/015-motion-system.md`, which itself lists
carousel/progress/scroll-area as out of its scope):

```
packages/ui/src/components/avatar.tsx           93
packages/ui/src/components/button-group.tsx     78
packages/ui/src/components/card.tsx             92
packages/ui/src/components/carousel.tsx        232
packages/ui/src/components/hover-card.tsx       46
packages/ui/src/components/progress.tsx         64
packages/ui/src/components/scroll-area.tsx      48
packages/ui/src/components/skeleton.tsx         15
packages/ui/src/components/tabs.tsx             61
packages/ui/src/components/tabs-variants.ts     18
                                        total  747
```

That is 747 of 2,690 TS/TSX lines under `packages/ui/src` — 27.8%.

`scroll-area.tsx` is _abandoned_, not pending: base-ui's `ScrollArea` throws in
happy-dom (missing `getAnimations`) and the codebase switched to plain
`overflow-y-auto`.

Two dependencies exist only for deleted code:

- `packages/ui/package.json:26` `"embla-carousel-react": "^8.6.0"` — imported
  only at `packages/ui/src/components/carousel.tsx:2`.
- `packages/ui/package.json:22` `"ai": "^6.0.204"` — the Vercel AI SDK. **No file
  under `packages/ui/src`, `apps/web/src`, `apps/server/src` or
  `apps/desktop/src` imports `ai` or any `ai/*` subpath, and it appears in no
  other `package.json`.**

**`input-group.tsx` must stay** — `packages/ui/src/components/command.tsx:14`
imports `InputGroup` and `InputGroupAddon` from it.

### C. `packages/contracts` — ~190 barrel lines

`packages/contracts/src/index.ts` is 547 lines at `ace313f` (550 in the current
working tree, which has 3 lines of unrelated in-flight settings work) and is
hand-written `export { … } from './module'` blocks throughout. It re-exports 499
distinct names. **189 of them have no reference anywhere outside
`packages/contracts/src` — including none in `apps/`, `packages/{tree,ui,observability}`,
`scripts/`, `docs/`, or contracts' own tests.** That is 37.9%.

Spot checks that hold:

- `index.ts:314` opens the orchestration-events block; every `*PayloadSchema`
  entry there (`projectCreatedPayloadSchema` at :321 onward) has no importer
  outside contracts — consumers narrow with `Extract<OrchestrationEvent, …>`.
- `index.ts:247` opens the orchestration-commands block re-exporting 31
  individual command schemas; `threadCreateCommandSchema` (:259) and
  `threadPinCommandSchema` (:265) appear nowhere but `index.ts`. Consumers use
  only the union schemas — `apps/server/src/orchestration/routes.ts` takes
  `clientOrchestrationCommandSchema` as its route body.
- `index.ts:484` opens the settings/registry block; `SETTINGS_REGISTRY`,
  `SettingsRegistry`, `SettingsRegistryShape`, `SettingsResolution`,
  `RegistryValues`, `defineSetting`, `registryProblems` have zero external
  reference — consumers go through `SETTING_IDS` / `descriptorFor` /
  `SETTINGS_LAYER_ORDER`.

Removing an export line does **not** delete the symbol — the source module still
exports it, so contracts' internal use is untouched. `packages/contracts` exports
only `"."` (`packages/contracts/package.json`), so every consumer goes through
this barrel and `tsgo` sees every mistake.

### D. `apps/server` provider — ~150 unreachable lines

`apps/server/src/provider/types.ts:513-545` declares the driver SPI. Two required
members have **zero production call sites**:

```ts
530:   listSessions: () => Promise<ProviderAdapterSession[]>
531:   readThread: (input: { threadId: ThreadId }) => Promise<ProviderThreadSnapshot>
```

`ProviderService.listSessions` (`provider-service.ts:346`) reads
`this.sessionDirectory.listBindings().filter(isActiveBinding)` — never the
adapter.

`apps/server/src/provider/types.ts:453-468` — three of the capability booleans
are written by all three adapters and read by nobody:

```ts
type ProviderAdapterCapabilities = {
  listCommands?: boolean
  readThread: boolean // ← never read
  rollbackThread: boolean // ← never read
  sessionModelSwitch: 'in-session' | 'unsupported'
  signIn?: boolean
  stopAll: boolean // ← never read (the stopAll() *method* IS live)
}
```

The only capability reads in the repo are `capabilities.sessionModelSwitch`
(provider-service.ts:581), `capabilities.listCommands` / `capabilities.signIn`
(routes.ts:265/270) and the driver's `capabilities.multiInstance`
(provider-adapter-registry.ts:303).

`provider-service.ts:366` is `await routed.adapter.rollbackThread(input)` — the
`ProviderThreadSnapshot` return value is awaited and discarded. `codex.ts:543-559`
is the only producer, so `ProviderThreadSnapshot` / `ProviderThreadTurnSnapshot`
(types.ts:502-511) and `providerThreadSnapshot` / `providerThreadTurn`
(codex.ts:2639-2654) are dead on both paths.

`apps/server/src/provider/adapters/claude.ts:309-310` is the stub the SPI forces:

```ts
  async readThread(): Promise<never> {
    throw createInternalError('Claude readThread is not supported.')
  }
```

**Four runtime-event variants no shipped adapter emits.** Verified against every
`type:` emission in the only three adapters that ship (`codex.ts`, `claude.ts`,
`mock.ts`):

| Variant                   | Declared         | Handled by                                                      |
| ------------------------- | ---------------- | --------------------------------------------------------------- |
| `turn.proposed.delta`     | types.ts:199-202 | provider-runtime-ingestion.ts:235                               |
| `turn.proposed.completed` | types.ts:203-206 | provider-runtime-ingestion.ts:242                               |
| `item.updated`            | types.ts:217-225 | provider-runtime-ingestion.ts:662, and the `Extract<…>` at :764 |
| `turn.aborted`            | types.ts:366-369 | provider-service.ts:735 and :756                                |

`RuntimeEventRawSource` (types.ts:87-97) also lists `'opencode.sdk.event'`,
`'acp.jsonrpc'` and `` `acp.${string}.extension` `` — sources for adapters that
do not exist in this repository.

> **Two things the original finding got wrong — do NOT delete them.**
>
> 1. **The buffered-plan path is LIVE.** Only the two `turn.proposed.*` _case
>    arms_ are dead. `handleContentDelta` (provider-runtime-ingestion.ts:284-291)
>    routes real `content.delta` events with `streamKind === 'plan_text'` into
>    the same `buffers.appendBufferedProposedPlan`. Keep
>    `appendBufferedProposedPlan` and `finalizeBufferedProposedPlan`.
> 2. **The streaming-delta branch is LIVE.** Codex emits `content.delta` with
>    `streamKind: 'assistant_text'` (codex.ts:1476) and `handleContentDelta`
>    (ingestion.ts:302) funnels it into `bufferAssistantDelta`, hitting
>    `assistantDeliveryMode === 'streaming'` (:273) on every real streaming turn.

### E. `apps/web` — ~200 unreachable lines

Every one verified with `git grep` across the whole repository:

| Symbol                             | Location                                                                        | Note                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `useLogEventDetail`                | `apps/web/src/features/logs/use-log-event-detail.ts:6`                          | Whole file (14 lines), zero references.                                                                    |
| `fetchLogEventDetail`              | `apps/web/src/features/logs/api.ts:46`                                          | Referenced only from that dead hook.                                                                       |
| `logsKeys.detail`                  | `apps/web/src/lib/query-keys.ts:59`                                             | Referenced only from that dead hook.                                                                       |
| `useEditorTabDirty`                | `apps/web/src/components/workspace/editor-tabs/hooks/use-editor-tab-dirty.ts:3` | Whole file (9 lines), zero references.                                                                     |
| `commitChanges`                    | `apps/web/src/features/git/api.ts:213`                                          | Superseded — `use-commit-mutation.ts:5,:23` imports and calls `commitChangesStreaming` (api.ts:163).       |
| `createSessionWorktree`            | `apps/web/src/features/git/api.ts:343`                                          | Zero callers. `GitWorktreeCreateResult` (imported at api.ts:7) is used only here.                          |
| `openFilePathList`                 | `apps/web/src/features/editor/state/editor-tab-paths.ts:1`                      | Zero callers; the rest of the module is live via `editor-commands.ts`.                                     |
| `renameOpenFilePath`               | `…/editor-tab-paths.ts:14`                                                      | Zero callers.                                                                                              |
| `reorderOpenFilePath`              | `…/editor-tab-paths.ts:22`                                                      | Zero callers. Its private helper `boundedOpenFilePathInsertIndex` and `samePathOrder` become dead with it. |
| `vscodeEditorTheme`                | `apps/web/src/features/editor/utils/theme-catalog.ts:110`                       | Zero callers. `vscodeThemeById` stays — `editorThemeExists` (:114) uses it.                                |
| `SCRIPT_PREFIX` / `SESSION_PREFIX` | `apps/web/src/components/command-palette/command-palette-utils.ts:35-36`        | Exported but used only at :316-317 and :345-346 in the same module → drop `export`.                        |

## Commands you will need

| Purpose               | Command                                         | Expected on success                                                      |
| --------------------- | ----------------------------------------------- | ------------------------------------------------------------------------ |
| Typecheck everything  | `bun run typecheck`                             | exit 0, no errors (all 7 workspaces "Done")                              |
| Typecheck one package | `bun run --filter '@workspace/tree' typecheck`  | exit 0                                                                   |
| Lint everything       | `bun run lint`                                  | exit 0 (warnings are allowed and expected)                               |
| Format one file       | `bunx oxfmt --write <path>`                     | exit 0, touches only that path                                           |
| Format check          | `bun run format:check`                          | see Step 0 — **RED at baseline**, compare against your recorded baseline |
| Test — tree           | `bun run --filter '@workspace/tree' test`       | 2 files, 7 tests passed                                                  |
| Test — contracts      | `bun run --filter '@workspace/contracts' test`  | 14 files, 120 tests passed                                               |
| Test — server         | `bun run --filter 'server' test`                | matches Step 0 baseline                                                  |
| Test — web            | `bun run --filter 'web' test`                   | matches Step 0 baseline                                                  |
| Test — everything     | `bun run test`                                  | matches Step 0 baseline                                                  |
| Full gate             | `bun run verify`                                | typecheck + lint + format:check + test                                   |
| Dead-code report      | `bunx knip --files --exports --no-config-hints` | see Step 7                                                               |

`apps/web`'s `test` is `bun --bun vitest run --project node --project dom`;
`apps/server`'s is `bun --bun vitest run`; `packages/{tree,contracts}` run plain
`vitest run`. **`packages/ui` has no `test` script at all** — that is expected
(plan 013 adds one); `bun run test` simply skips it, and there is nothing to run
or fix for Step 2. **Never run any `test:browser` script** (`packages/tree` and
`apps/web` each define one): this plan changes no layout or paint behavior, and
the `browser` vitest project is known to hang at the RUN banner.

Workspace filter names: `web`, `server`, `desktop`, `@workspace/contracts`,
`@workspace/observability`, `@workspace/tree`, `@workspace/ui`.

## Suggested executor toolkit

- Invoke the **`never-nester`** skill if available before Step 1c: unwrapping
  `withBenchmarkPhase` in `builder.ts` requires converting an inner arrow-return
  into a guard clause, and this repo's control-flow rules govern the result.
- Nothing else. This is a deletion plan; there is no design work in it.

## Scope

**In scope** (the only files you may modify or delete):

_Step 1 — `packages/tree`_

- `packages/tree/package.json`
- `packages/tree/src/utils/path-store/static-store.ts` (delete)
- `packages/tree/src/utils/path-store/scheduler.ts` (delete)
- `packages/tree/src/utils/path-store/cleanup.ts` (delete)
- `packages/tree/src/utils/path-store/visible-tree-projection.ts` (delete)
- `packages/tree/src/utils/path-store/internal/benchmarkInstrumentation.ts` (delete, then remove the empty `internal/` folder)
- `packages/tree/src/utils/sortChildren.ts` (delete)
- `packages/tree/src/utils/themeToTreeStyles.ts` (delete)
- `packages/tree/src/hooks/useFileTreeSearch.ts` (delete)
- `packages/tree/src/hooks/useFileTreeSelector.ts` (delete)
- `packages/tree/src/utils/path-store/{store,builder,state,events,projection,canonical,public-types,internal-types}.ts`
- `packages/tree/src/utils/model/mutationEvents.ts`
- `packages/tree/src/utils/model/publicTypes.ts`
- `packages/tree/src/utils/render/FileTree.ts`
- `packages/tree/src/utils/render/runtime.ts`
- `packages/tree/src/components/FileTree.tsx`
- `packages/tree/src/components/FileTreeView.tsx`
- `packages/tree/src/hooks/useFileTree.ts`

_Step 2 — `packages/ui`_

- `packages/ui/package.json`
- the ten component files listed in section B (delete)

_Step 3 — `apps/server` provider_

- `apps/server/src/provider/types.ts`
- `apps/server/src/provider/provider-service.ts`
- `apps/server/src/provider/adapters/{codex,claude,mock}.ts`
- `apps/server/src/provider/adapters/tests/{codex,claude}.test.ts`
- `apps/server/src/orchestration/provider-runtime-ingestion.ts`
- `apps/server/src/orchestration/tests/provider-runtime-ingestion.test.ts`

_Step 4 — `apps/web`_

- `apps/web/src/features/logs/use-log-event-detail.ts` (delete)
- `apps/web/src/features/logs/api.ts`
- `apps/web/src/lib/query-keys.ts`
- `apps/web/src/components/workspace/editor-tabs/hooks/use-editor-tab-dirty.ts` (delete)
- `apps/web/src/features/git/api.ts`
- `apps/web/src/features/editor/state/editor-tab-paths.ts`
- `apps/web/src/features/editor/utils/theme-catalog.ts`
- `apps/web/src/components/command-palette/command-palette-utils.ts`

_Step 5 — `packages/contracts`_

- `packages/contracts/src/index.ts`

_Step 6 — dependencies_

- `package.json` (root — the `preact-render-to-string` catalog entry only)
- `bun.lock` (regenerated, not hand-edited)

_Step 8_

- `plans/README.md` (status row only)

**Out of scope** (do NOT touch, even though they look related):

- **`packages/editor-*`** — symlinks into a sibling `../../Editor` checkout. Not
  this repository.
- **`apps/server/src/provider/adapters/codex-protocol/`** (`generate.ts`,
  `generated/`) — `'thread/read'` is listed in `CLIENT_REQUEST_METHODS`
  (generate.ts:40), but that file describes the _Codex wire protocol_, not this
  app's usage, and regenerating requires an external binary. Leave it.
- **`assistantDeliveryMode` / the `'buffered'` branch** in
  `provider-runtime-ingestion.ts:273-281` and the four
  `bufferedAssistantTextByMessageId` methods in `provider-runtime-buffers.ts`.
  The mode is test-only, but unwinding it means rewriting two _real, passing_
  tests and a four-method buffer surface for no reachability win. Deliberately
  deferred — see Maintenance notes.
- **`packages/ui/src/components/input-group.tsx`** — `command.tsx:14` imports it.
- **Adding a `test` script to `packages/ui`** — that is plan 013's job. Do not
  add one here.
- **`packages/tree/package.json`'s eight-pattern `exports` map**, except for
  removing the now-dead `"./utils/path-store/internal/*"` line. The
  "give tree a `.` barrel" idea was audited and rejected.
- **`useClientLayoutEffect`** at `packages/tree/src/components/FileTree.tsx:28`
  — an SSR-shaped guard, but it is one harmless ternary and removing it is not a
  reachability fix.
- **`packages/contracts/src/settings/keys.ts`** and
  **`apps/web/src/features/settings/hooks/use-setting-inspection.ts`** — these
  are someone's uncommitted work and (at least one of them) is failing
  `format:check`. Do not format them, do not stage them, do not "fix" them.
- **Any lint warning.** `bun run lint` is warning-noisy at baseline
  (`unicorn(no-new-array)`, `react-hooks(exhaustive-deps)`,
  `oxc-react-compiler(set-state-in-effect)`, unused vars in benchmark scripts).
  Warnings that vanish because their file was deleted are fine; **do not fix a
  warning in a surviving file** — it is a diff outside this plan's story.
- **The `'use client'` directives in `packages/ui`** (`avatar`, `collapsible`,
  `command`, `dialog`, `dropdown-menu`, `hover-card`, `switch`, `tabs`). Step 1d
  strips them from `packages/tree` only, because tree's are being edited anyway.
  Do not sweep `packages/ui`.
- **The `stopAll()` _method_** on every adapter and `ProviderService`. Only the
  `stopAll` _capability boolean_ is unread. `codex.test.ts` calls
  `adapter.stopAll()`; deleting the method breaks live shutdown.
- **`packages/tree/package.json`'s `test:browser` script** and
  `@vitest/browser-playwright` / `playwright` devDependencies. Unused by this
  plan, but the browser project is real infrastructure.
- **`bun run settings:reference` / `docs/settings-reference.md`.** Step 5 edits
  the contracts _barrel_, not the settings registry, so the generated doc does
  not change. Do not regenerate it — the registry file it reads is out-of-scope
  in-flight work and regenerating would produce a spurious diff.
- **Every other file in `plans/`** except `plans/README.md`'s 022 status row.
  `plans/015-motion-system.md` names three of the components Step 2 deletes;
  leave it alone (see Maintenance notes).
- **Any behavior change.** If a deletion would alter what the app does rather
  than what it _could_ do, it does not belong in this plan.

## Git workflow

**All work happens on `main`** — no new branches, worktrees, commits, pushes, or
PRs unless the operator explicitly asks. If the operator does ask for commits,
use conventional commits with a lowercase descriptive subject, one per step.
Real examples from `git log`:

```
refactor(orchestration): the server prepares a session's worktree (M-C)
fix(address): bound the URL, and stop escaping slashes in ?tabs=
```

Suggested subjects: `refactor(tree): delete the unreachable store, scheduler and
cleanup machinery`, `refactor(ui): delete the nine unreachable primitives and
their two dependencies`, and so on.

## Steps

### Step 0: Record the baseline

You are deleting code across five packages. You must know what was already
failing before you started.

```bash
bun run typecheck  ; echo "typecheck exit=$?"
bun run lint       ; echo "lint exit=$?"
bun run format:check ; echo "format exit=$?"
bun run test 2>&1 | tail -40
git status --short > /tmp/plan-022-baseline-status.txt
```

**Expected at the time this plan was written:**

- `typecheck exit=0` — all seven workspaces "Done".
- `lint exit=0` — warnings only. Seven of them are `unicorn(no-new-array)` in
  files this plan deletes (`static-store.ts` ×4, `sortChildren.ts` ×2,
  `visible-tree-projection.ts` ×1), so those seven disappear. **Copy the full
  warning list to a file** — that list, not a count, is your comparison in
  Step 7:

  ```bash
  bun run lint 2>&1 | grep -c "warning" > /tmp/plan-022-baseline-lintcount.txt
  ```

- `format exit=1` — failing on out-of-scope in-flight settings work. **Write
  down the exact file list `format:check` prints**; it has already changed once
  (two files, then one). Every later format check compares against _your_
  recorded list.
- `bun run test` — record the per-workspace pass counts. Verified values for the
  two small packages: `@workspace/tree` = 2 files / 7 tests,
  `@workspace/contracts` = 14 files / 120 tests. `packages/ui` has no `test`
  script and is skipped.

**Verify**: `/tmp/plan-022-baseline-status.txt` exists, and you have written down
the four exit codes, the failing-format file list, and the test counts. If
`typecheck exit != 0`, **STOP and report** — you cannot use typecheck as a gate
if it is already red.

---

### Step 1: `packages/tree`

The largest step. Do the sub-steps in order; each one leaves the package
compiling, so each is independently revertable.

#### Step 1a: Delete the seven fully-orphaned modules

```bash
git rm packages/tree/src/utils/path-store/static-store.ts
git rm packages/tree/src/utils/path-store/scheduler.ts
git rm packages/tree/src/utils/path-store/visible-tree-projection.ts
git rm packages/tree/src/utils/sortChildren.ts
git rm packages/tree/src/utils/themeToTreeStyles.ts
git rm packages/tree/src/hooks/useFileTreeSearch.ts
git rm packages/tree/src/hooks/useFileTreeSelector.ts
```

(If `git rm` is unavailable, plain `rm` is fine.)

**Verify**:

```bash
bun run --filter '@workspace/tree' typecheck   # → exit 0
bun run --filter '@workspace/tree' test        # → 2 files, 7 tests passed
git grep -n "StaticPathStore\|createPathStoreScheduler\|createVisibleTreeProjection\b\|sortChildren\|themeToTreeStyles\|useFileTreeSearch\|useFileTreeSelector" -- packages/tree apps
git grep -n "static-store" -- packages/tree
```

The first grep must return **nothing**. The second must return exactly the two
_prose comments_ at `packages/tree/src/utils/path-store/builder.ts:36` and
`:992` — they are the last mentions of the deleted store and both disappear in
step 1b when `BuilderFinishOptions` and the backward-pass comment go.

#### Step 1b: Delete the child-load / cleanup API and the `skipSubtreeCountPass` flag

Delete, in this order:

1. `packages/tree/src/utils/path-store/cleanup.ts` (whole file).
2. `packages/tree/src/utils/path-store/store.ts:479-697` — the seven public
   methods `getDirectoryLoadState`, `markDirectoryUnloaded`, `beginChildLoad`,
   `applyChildPatch`, `completeChildLoad`, `failChildLoad`, `cleanup`. Then
   remove the imports they orphan at the top of `store.ts` (the
   `createBeginChildLoadEvent` / `createApplyChildPatchEvent` /
   `createCompleteChildLoadEvent` / `createFailChildLoadEvent` /
   `createMarkDirectoryUnloadedEvent` / `createCleanupEvent` group, the
   `beginDirectoryLoad` / `completeDirectoryLoad` / `failDirectoryLoad` /
   `getDirectoryLoadState as getStoredDirectoryLoadState` /
   `isDirectoryLoadAttemptCurrent` group, `hasActiveCleanupBlockingLoads`,
   `cleanupPathStoreState`, and the `PathStoreDirectoryLoadState` /
   `PathStoreLoadAttempt` / `PathStoreCleanupOptions` / `PathStoreCleanupResult`
   type imports).
3. `packages/tree/src/utils/path-store/state.ts` — the `directoryLoadInfoById`
   field (:34, initialized :57) and the functions
   `getOrCreateDirectoryLoadInfo` (:167), `getDirectoryLoadState` (:183),
   `getDirectoryLoadError` (:190), `beginDirectoryLoad` (:194),
   `markDirectoryUnloadedState` (:216 — note the `State` suffix; there is no
   `markDirectoryUnloaded` in `state.ts`), `completeDirectoryLoad` (:223),
   `isDirectoryLoadAttemptCurrent` (:239), `failDirectoryLoad` (:247),
   `clearDirectoryLoadInfo` (:264). After this, `state.ts` should import neither
   `DirectoryLoadInfo` nor `PathStoreLoadAttempt`.
4. `packages/tree/src/utils/path-store/canonical.ts:754` — the
   `clearDirectoryLoadInfo(state, frame.nodeId)` call and its import at :45.
5. `packages/tree/src/utils/path-store/internal-types.ts` — the
   `DirectoryLoadInfo` interface (:88) and the now-unused
   `PathStoreDirectoryLoadState` import (:2).
6. `packages/tree/src/utils/path-store/events.ts` — the six constructors
   `createMarkDirectoryUnloadedEvent` (:128), `createBeginChildLoadEvent` (:142),
   `createApplyChildPatchEvent` (:162), `createCompleteChildLoadEvent` (:182),
   `createFailChildLoadEvent` (:202), `createCleanupEvent` (:224), plus their
   type imports.
7. `packages/tree/src/utils/path-store/public-types.ts` — the six event
   interfaces (:176-212) and their six arms in the `PathStoreSemanticEvent`
   union (the union runs :214-225; delete arms :220-225, keep `Add`, `Remove`,
   `Move`, `Expand`, `Collapse`); `PathStoreDirectoryLoadState` (:50);
   `PathStoreLoadAttempt`
   (:59-61); `PathStoreCleanupOptions` / `PathStoreCleanupResult`; and the
   `isLoading` (:93) and `loadState` (:95) fields of `PathStoreVisibleRow`.
8. `packages/tree/src/utils/path-store/projection.ts` — `getVisibleRowLoadState`
   (:892) and every reference to it: the `loadState` local at :840, the
   `isLoading: false` / `loadState: undefined` literals at :793/:795, and the
   `isLoading:` / `loadState:` properties at :881-886.
9. `packages/tree/src/utils/model/mutationEvents.ts` — remove the six operation
   strings from `FileTreeStoreIgnoredSemanticEvent` (:37-42:
   `'mark-directory-unloaded'`, `'begin-child-load'`, `'apply-child-patch'`,
   `'complete-child-load'`, `'fail-child-load'`, `'cleanup'`) and the six
   matching `case` labels in `remapPathThroughMutation` (:112-117), keeping
   `'expand'` and `'collapse'` in both places.
10. `packages/tree/src/utils/path-store/builder.ts` — delete
    `BuilderFinishOptions` (:31-40, comment included), change the signature to
    `public finish(): PathStoreSnapshot`, and make `buildPresortedFinish()`
    take no argument and unconditionally skip the backward accumulation pass:
    delete the `if (skipSubtreeCountPass) { return }` guard at :993-995 **and
    everything after it in that method** (the backward `for` loop), **and the
    explanatory comment block immediately above it (:980-992)** — it is the last
    prose reference to `skipSubtreeCountPass` and `static-store`, and the verify
    grep below will fail if you leave it. Delete the now-unreachable
    `computeSubtreeCounts` private method (:1038) together with the
    `else if (!skipSubtreeCountPass)` branch at :641-645. `finish` is at :634 and
    `buildPresortedFinish` at :930.
11. `packages/tree/src/utils/path-store/store.ts:260-267` — change the call to
    `builder.finish()` and update the comment above it to say the backward pass
    no longer exists.

Target shape for `builder.finish` after step 10-11:

```ts
  public finish(): PathStoreSnapshot {
    if (this.hasDeferredDirectoryIndexes) {
      this.buildPresortedFinish()
      this.hasDeferredDirectoryIndexes = false
    }
    return {
      directories: this.directories,
      nodes: this.nodes,
      options: this.options,
      rootId: 0,
      segmentTable: this.segmentTable,
      presortedDirectoryNodeIds:
        this.presortedDirectoryNodeIds.length > 0 ? this.presortedDirectoryNodeIds : null,
    }
  }
```

(The `withBenchmarkPhase` wrappers still present at that point disappear in
step 1c; leaving them here is fine.)

**Verify**:

```bash
bun run --filter '@workspace/tree' typecheck   # → exit 0
bun run --filter '@workspace/tree' test        # → 2 files, 7 tests passed
bun run typecheck                              # → exit 0 (apps/web consumes tree)
git grep -n "skipSubtreeCountPass\|DirectoryLoadInfo\|beginChildLoad\|applyChildPatch\|completeChildLoad\|failChildLoad\|markDirectoryUnloaded\|cleanupPathStoreState\|PathStoreDirectoryLoadState" -- packages/tree apps
```

The last command must return **nothing**.

#### Step 1c: Delete the benchmark instrumentation and unwrap its 41 wrappers

Delete `packages/tree/src/utils/path-store/internal/benchmarkInstrumentation.ts`
and then remove the empty `packages/tree/src/utils/path-store/internal/`
directory (AGENTS.md: "Do not create empty folders").

Then, **file by file**, unwrap every remaining `withBenchmarkPhase(...)` call and
delete:

- the four surviving `setBenchmarkCounter(...)` calls — `builder.ts:241`
  (`workload.inputFiles`) and `projection.ts:331,332,333` (`workload.*Read`);
- the `instrumentation` field on `PathStoreState` (`state.ts:36`, param at :47,
  assignment at :59);
- the `instrumentation` local in `store.ts:227` and the
  `private readonly instrumentation` field in `builder.ts:267` plus its
  assignment at :273 and the module-level local at `builder.ts:240`;
- every `getBenchmarkInstrumentation` / `withBenchmarkPhase` /
  `setBenchmarkCounter` / `BenchmarkInstrumentation` import.

Remaining `withBenchmarkPhase` counts after 1a/1b: `store.ts` 21,
`projection.ts` 7, `builder.ts` 6, `events.ts` 4, `canonical.ts` 3 = **41**.
(store.ts starts at 27 and builder.ts at 7; 6 store sites and 1 builder site are
already gone with the code deleted in 1b.)

The mechanical rule:

```ts
// expression position
return withBenchmarkPhase(inst, 'name', () => expr)     →  return expr

// statement position, block body
withBenchmarkPhase(inst, 'name', () => { A; B })        →  A; B     (dedented)

// hand-written null branch (events.ts, projection.ts)
const inst = state.instrumentation
if (inst == null) { X; return }
withBenchmarkPhase(inst, 'name', () => X)               →  X
```

**These sites need care — do not blind-unwrap them:**

1. `packages/tree/src/utils/path-store/builder.ts:323` — the arrow body contains
   an early `return`, and the enclosing method ends with `return this`. Unwrap it
   into a guard clause:

   ```ts
     public appendPresortedPaths(
       paths: readonly string[],
       containsDirectories: boolean | null = null,
     ): this {
       if (containsDirectories === false) {
         this.appendPresortedFilePaths(paths)
         return this
       }

       this.createdDirectoriesAllExpanded = false
       // …the rest of the former arrow body, dedented one level…

       return this
     }
   ```

2. `packages/tree/src/utils/path-store/projection.ts:848-870` — the
   `instrumentation == null ? <map> : withBenchmarkPhase(…, () => <same map>)`
   ternary writes the same `.map()` twice. Collapse to the single `.map()`:

   ```ts
   const flattenedSegments = isFlattened
     ? collectFlattenedDirectoryChainIds(state, cursor.headNodeId).map((nodeId) => {
         const node = requireNode(state, nodeId)
         return {
           isTerminal: nodeId === cursor.terminalNodeId,
           name: getSegmentValue(state.snapshot.segmentTable, node.nameId),
           nodeId,
           path: materializeNodePath(state, nodeId),
         }
       })
     : undefined
   ```

3. `packages/tree/src/utils/path-store/events.ts` has **four** hand-written null
   branches, not three — `recordEvent` (:280-286), the batch-merge branch inside
   `if (parentFrame != null)` (:317-323), the batch-commit branch (:330-336) and
   `emitEvent` (:384-390). Each is a `if (instrumentation == null) { …; return }`
   (or `if/else`) guard paired with the wrapper. Collapse each pair into one
   unconditional call, as shown in the rule above, and drop the now-unused
   `const instrumentation = state.instrumentation` local each one declares.
   Afterwards `grep -c withBenchmarkPhase events.ts` must be 0.

Run typecheck + tests after **each file**, not at the end.

**Verify**:

```bash
bun run --filter '@workspace/tree' typecheck   # → exit 0
bun run --filter '@workspace/tree' test        # → 2 files, 7 tests passed
bun run typecheck                              # → exit 0
git grep -rn "withBenchmarkPhase\|BenchmarkInstrumentation\|setBenchmarkCounter\|benchmarkInstrumentation" -- packages/tree
ls packages/tree/src/utils/path-store/internal 2>&1   # → "No such file or directory"
```

The `git grep` must return **nothing**.

`packages/tree` has only 7 tests over ~20K lines, and this sub-step is 41 hand
edits in the store's hottest paths — the automated gate is thin here. So also
open the always-running dev server at **http://localhost:5173** and confirm the
file tree still renders: expand a folder, collapse it, and scroll. Expected: rows
appear/disappear at the right depth and scrolling is smooth. A blank tree, wrong
indentation, or duplicated rows means an unwrap changed control flow — **STOP and
report**. **Do not start a server.**

#### Step 1d: Delete the SSR / preload / hydrate path

In `packages/tree/src/utils/render/FileTree.ts`: delete `preloadFileTree`
(:746 to end of function), `serializeFileTreeSsrPayload` (:140), the private
helpers used only by them — `createServerId` (:81), `getHeaderSlotHtml` (:112),
`getFileTreeOuterStart` (:125), `getFileTreeOuterEnd` (:132) — the
`hydrate` method (:459-464), the `import { renderToString } from 'preact-render-to-string'`
at :4, the `import { h } from 'preact'` at :3 (verified: the file's only `h(` is
at :798, inside `preloadFileTree`), the `hydrateFileTreeRoot` import (:63), the
`escapeStyleTextForHtml` import (:57 — its only uses are :789 and :793, both
inside `preloadFileTree`), the `FileTreeSsrPayload` / `FileTreeHydrationProps`
type imports (:49, :33), and the `serverInstanceId` module counter (:69), which
only `createServerId` touches.

In `packages/tree/src/utils/render/runtime.ts`: delete `hydrateFileTreeRoot`
(:26).

In `packages/tree/src/utils/model/publicTypes.ts`: delete `FileTreeSsrPayload`
(:258) and `FileTreeHydrationProps` (:254).

In `packages/tree/src/components/FileTree.tsx`: delete
`FileTreePreloadedData` (:35), `renderPreloadedShadowDom` (:64-82),
`hasExistingPreloadedContent` (:84-94), the `preloadedData` prop (:139), its
destructure (:150) and its dependency (:219). Simplify the effect body and the
render tail to:

```ts
useClientLayoutEffect(() => {
  if (hostElement == null) {
    return
  }

  model.render({ fileTreeContainer: hostElement })

  return () => {
    model.unmount()
    model.setComposition(baselineComposition)
  }
}, [baselineComposition, hostElement, model])

const children = renderFileTreeChildren(header, renderContextMenu, activeContextMenu)
```

and drop `suppressHydrationWarning: preloadedData != null` (:243) and the
`?? preloadedData?.id` term at :225 (so it becomes `const resolvedHostId = id`,
or inline `id` directly).

Finally, remove the `'use client'` directive from
`packages/tree/src/components/FileTree.tsx:2` and
`packages/tree/src/hooks/useFileTree.ts:1`.

**Verify**:

```bash
bun run --filter '@workspace/tree' typecheck   # → exit 0
bun run typecheck                              # → exit 0
bun run --filter '@workspace/tree' test        # → 2 files, 7 tests passed
git grep -rn "preloadFileTree\|serializeFileTreeSsrPayload\|FileTreeSsrPayload\|FileTreePreloadedData\|preloadedData\|hydrateFileTreeRoot\|FileTreeHydrationProps\|renderToString\|use client" -- packages/tree apps
```

Must return **nothing**.

#### Step 1e: Delete the two debug listeners and their four dead branches

In `packages/tree/src/components/FileTreeView.tsx`:

1. Delete the whole `useLayoutEffect` at **:1292-1336**.
2. Delete the two refs at **:1209-1210**
   (`debugContextMenuTriggerPathRef`, `debugDisableScrollSuppressionRef`).
3. **:2442-2444** — delete the guard so `markScrolling` starts at
   `if (listElement != null) {`.
4. **:2485** — `if (rootElement == null || debugDisableScrollSuppressionRef.current === true) {`
   becomes `if (rootElement == null) {`.
5. **:2520-2523** — delete the guard so `onScroll` runs
   `setContextHoverPath(...)` then `markScrolling()` unconditionally.
6. **:2958-2963** — remove the `debugContextMenuTriggerPathRef.current ??` term:

   ```ts
   const triggerPath =
     contextMenuState?.path ?? pointerTriggerPath ?? focusTriggerPath ?? contextHoverPath
   ```

Do **not** remove `setContextHoverPath` or `setLastContextMenuInteraction` —
both have many other call sites.

**Verify**:

```bash
git grep -n "file-tree-debug\|debugContextMenuTriggerPathRef\|debugDisableScrollSuppressionRef" -- packages/tree apps
bun run --filter '@workspace/tree' typecheck   # → exit 0
bun run --filter '@workspace/tree' test        # → 2 files, 7 tests passed
```

The `git grep` must return **nothing**.

Then, because this touches the live file tree, open the always-running dev server
at **http://localhost:5173**, expand and collapse a folder in the file tree,
scroll it, and right-click a row. Expected: the tree scrolls, the context menu
opens on right-click, and the floating trigger button still hides while
scrolling. **Do not start a server.**

#### Step 1f: Clean the tree manifest

In `packages/tree/package.json`, delete these two lines by **content**, not by
line number (removing the first shifts the second):

- from `exports`: `"./utils/path-store/internal/*": "./src/utils/path-store/internal/*.ts",`
- from `dependencies`: `"preact-render-to-string": "catalog:"` — and make sure the
  preceding `"preact": "catalog:",` keeps/loses its trailing comma so the JSON
  stays valid.

Leave the other seven export patterns and the `preact` dependency exactly as they
are, and do not touch the `test:browser` script or the playwright devDeps.

**Verify**: `bun run --filter '@workspace/tree' typecheck` → exit 0. (The
`bun install` happens once, in Step 6.)

---

### Step 2: `packages/ui`

```bash
git rm packages/ui/src/components/avatar.tsx \
       packages/ui/src/components/button-group.tsx \
       packages/ui/src/components/card.tsx \
       packages/ui/src/components/carousel.tsx \
       packages/ui/src/components/hover-card.tsx \
       packages/ui/src/components/progress.tsx \
       packages/ui/src/components/scroll-area.tsx \
       packages/ui/src/components/skeleton.tsx \
       packages/ui/src/components/tabs.tsx \
       packages/ui/src/components/tabs-variants.ts
```

Then edit `packages/ui/package.json` and delete these two `dependencies` lines:

```
    "ai": "^6.0.204",
    "embla-carousel-react": "^8.6.0",
```

**Do not** add a `test` script (plan 013 owns that) and **do not** delete
`input-group.tsx`.

**Verify**:

```bash
ls packages/ui/src/components/{avatar,carousel,tabs}.tsx 2>&1  # → "No such file or directory" ×3
ls packages/ui/src/components/input-group.tsx                  # → still exists
bun run --filter '@workspace/ui' typecheck   # → exit 0
bun run typecheck                            # → exit 0
bun run --filter 'web' test                  # → matches Step 0 baseline
git grep -n "components/avatar\|components/button-group\|components/card\|components/carousel\|components/hover-card\|components/progress\|components/scroll-area\|components/skeleton\|components/tabs" -- apps packages
```

The `git grep` must return **nothing** (matches inside `plans/` are excluded by
the `-- apps packages` pathspec and are fine). Note this grep was _already_
empty before the deletion — that is the point, these files had zero importers —
so it is a regression guard, not proof you did the work. The `ls` lines and
`git status` are the proof.

---

### Step 3: `apps/server` provider

#### Step 3a: `readThread` and the three unread capability booleans

1. `apps/server/src/provider/types.ts` — delete `readThread` from
   `ProviderAdapter` (:531); delete `readThread`, `rollbackThread` and `stopAll`
   from `ProviderAdapterCapabilities` (:459, :460, :467) — **keep
   `sessionModelSwitch`, `listCommands`, `signIn`**; delete
   `ProviderThreadTurnSnapshot` (:502) and `ProviderThreadSnapshot` (:507); and
   change `rollbackThread`'s signature (:534-537) to:

   ```ts
   rollbackThread: (input: { numTurns: number; threadId: ThreadId }) => Promise<void>
   ```

2. `apps/server/src/provider/adapters/codex.ts` — delete
   `CodexProviderAdapter.readThread` (:260-262) and `CodexSession.readThread`
   (:543-550); delete `providerThreadSnapshot` (:2639) and `providerThreadTurn`
   (:2652); make `CodexSession.rollbackThread` (:552) return `Promise<void>`
   (send the request, set `this.status = 'ready'`, return nothing); remove
   `readThread: true` and `rollbackThread: true` from the capabilities literal at
   :77-78 and the `stopAll` entry; remove the `ProviderThreadSnapshot` type
   import at :30.

3. `apps/server/src/provider/adapters/claude.ts` — delete `readThread` (:309-311);
   keep `rollbackThread` (:313) but drop its `Promise<never>` annotation only if
   typecheck demands it; remove `readThread: false`, `rollbackThread: false` and
   the `stopAll` entry from the capabilities literal at :97-98.

4. `apps/server/src/provider/adapters/mock.ts` — delete `readThread` (:287-293);
   make `rollbackThread` (:294-301) return nothing instead of
   `this.readThread({ threadId })`; remove `readThread: true` /
   `rollbackThread: true` / `stopAll` from the capabilities literal at :48-49.

5. Tests — `apps/server/src/provider/adapters/tests/codex.test.ts`:
   - :567-573 — the `expect(adapter.capabilities).toEqual({...})` literal inside
     `it('uses the app-server protocol and keeps early turn notifications', …)`
     (:552). Delete its `readThread: true`, `rollbackThread: true` and
     `stopAll: true` lines, leaving `listCommands` and `sessionModelSwitch`.
     Everything else in that test stays, including
     `const sessions = await adapter.listSessions()` (:562).
   - :1036-1063 — **delete the whole `it('reads and rolls back active provider
threads', …)` block.** Per AGENTS.md, obsolete tests get deleted, not
     preserved.
   - :1067 onward — in `it('fails read and rollback requests without an active
session', …)`, delete the `await expect(adapter.readThread(...))` assertion
     and keep the two `adapter.rollbackThread(...)` assertions. Rename the test
     to `'fails rollback requests without an active session'`.

#### Step 3b: `listSessions` — remove from the SPI only

`listSessions` has zero production callers, but `CodexProviderAdapter.listSessions`
and `ClaudeProviderAdapter.listSessions` are the **only observable** three real
tests have:

- `codex.test.ts:562` → asserted at :596
- `codex.test.ts:728` → asserted at :749 (`toHaveLength(1)`, proving the plan-mode
  switch reconfigured the live session rather than replacing it)
- `claude.test.ts:561` → asserts the CLI session id wins over the minted one — the
  regression test for a real start-deadlock fix

Deleting those tests would lose genuine coverage, which is not what this plan is
for. So:

1. Delete `listSessions` from the `ProviderAdapter` type
   (`apps/server/src/provider/types.ts:530`) — the SPI stops requiring it.
2. Delete `MockProviderAdapter.listSessions`
   (`apps/server/src/provider/adapters/mock.ts:269`) — it has no test consumer.
3. **Keep** `CodexProviderAdapter.listSessions` (codex.ts:250) and
   `ClaudeProviderAdapter.listSessions` (claude.ts:299). The tests construct the
   concrete classes (`new CodexProviderAdapter()`, `new ClaudeProviderAdapter(...)`),
   so they still compile.
4. Leave `ProviderService.listSessions` (provider-service.ts:346) completely
   alone — it is live and unrelated.

Add a one-line comment above each surviving `listSessions` saying it is an
adapter-local inspection method, not part of the driver SPI.

#### Step 3c: The four never-emitted runtime event variants

1. `apps/server/src/provider/types.ts` — delete the union members
   `turn.proposed.delta` (:199-202), `turn.proposed.completed` (:203-206),
   `item.updated` (:217-225) and `turn.aborted` (:366-369). In
   `RuntimeEventRawSource` (:87-97) delete `'opencode.sdk.event'`,
   `'acp.jsonrpc'` and `` `acp.${string}.extension` ``.

2. `apps/server/src/provider/provider-service.ts` — delete
   `case 'turn.aborted': return 'ready'` (:735-736) and
   `if (event.type === 'turn.aborted') return null` (:756).

3. `apps/server/src/orchestration/provider-runtime-ingestion.ts` — delete the
   `case 'turn.proposed.delta':` arm (:235-241) and the
   `case 'turn.proposed.completed':` arm (:242-250); delete the
   `case 'item.updated':` arm at :662; and narrow the `Extract<>` at :762-765
   to `{ type: 'item.started' | 'item.completed' }`.

   **Keep** `finalizeBufferedProposedPlan` and
   `buffers.appendBufferedProposedPlan` — `handleContentDelta` (:284-291) feeds
   them from real `content.delta` events with `streamKind === 'plan_text'`.

4. `apps/server/src/orchestration/tests/provider-runtime-ingestion.test.ts` —
   the test `it('buffers proposed plan text and upserts deterministically', …)`
   at :177 ingests literal `turn.proposed.delta` / `turn.proposed.completed`
   events, which no longer exist. **Replace its body with the live path.** The
   live plan path is: `handleContentDelta` (ingestion.ts:287) buffers
   `content.delta` with `streamKind: 'plan_text'`, and `completeTurn`
   (ingestion.ts:425) is what calls `finalizeBufferedProposedPlan` — the plan id
   is the same `proposedPlanIdForTurn(threadId, turnId)` on both sides, so the
   assertion is unchanged. Use exactly this:

   ```ts
   it('buffers proposed plan text and upserts deterministically', async () => {
     const { dispatched, ingestion } = fixture()

     await ingestion.ingest({
       createdAt: now,
       eventId: 'plan-delta-1',
       payload: { delta: '1. Inspect\n', streamKind: 'plan_text' },
       threadId,
       turnId,
       type: 'content.delta',
     })
     await ingestion.ingest(turnCompleted('turn-complete-1'))

     expect(dispatched).toMatchObject([
       {
         proposedPlan: {
           id: 'plan:thread-1:turn:turn-1',
           planMarkdown: '1. Inspect',
         },
         type: 'thread.proposed-plan.upsert',
       },
     ])
   })
   ```

   `turnCompleted` is the existing helper at :574 in the same file. If this does
   not pass after one honest debugging attempt, **STOP and report** — do not
   delete the test, it covers live behavior.

**Verify**:

```bash
bun run --filter 'server' typecheck    # → exit 0
bun run --filter 'server' test         # → matches Step 0 baseline minus the deleted codex cases
git grep -nw "readThread\|ProviderThreadSnapshot\|ProviderThreadTurnSnapshot\|providerThreadSnapshot\|providerThreadTurn" -- apps
git grep -n "'item.updated'\|'turn.aborted'\|'turn.proposed" -- apps
```

Both greps must return **nothing**.

> **The `-w` is load-bearing.** Without it the first pattern also matches
> `readThreadIdFromThreadResponse` (`codex.ts:466` and `:2625`), which is **live
> code that reads the provider thread id off a `thread/start` response — do not
> touch it**. And note `'thread/read'` in `codex-protocol/generate.ts:40` does
> _not_ match either pattern; it is out of scope for other reasons, but it will
> not show up here.

TypeScript's exhaustive `switch` checking is what proves you removed every arm;
if a `default` swallows a missing case somewhere, typecheck stays green and the
grep is your backstop.

---

### Step 4: `apps/web`

```bash
git rm apps/web/src/features/logs/use-log-event-detail.ts
git rm apps/web/src/components/workspace/editor-tabs/hooks/use-editor-tab-dirty.ts
```

Then:

1. `apps/web/src/features/logs/api.ts` — delete `fetchLogEventDetail` (:46-56)
   and the now-unused `logEventDetailSchema` / `LogEventDetail` imports (:1-11).
2. `apps/web/src/lib/query-keys.ts:59` — delete the `detail:` entry from
   `logsKeys`.
3. `apps/web/src/features/git/api.ts` — delete `commitChanges` (:213-229) and
   `createSessionWorktree` including its doc comment (:338-361); delete the
   `GitWorktreeCreateResult` type import (:7). **Keep `commitChangesStreaming`**
   (:163) — it is the live path.
4. `apps/web/src/features/editor/state/editor-tab-paths.ts` — delete
   `openFilePathList` (:1-5), `renameOpenFilePath` (:14-20) and
   `reorderOpenFilePath` (:22-34), plus the private helpers that become unused
   with them (`samePathOrder`, `boundedOpenFilePathInsertIndex`). Keep
   everything else — `nextSelectedFilePath`, the `editorHistory*` family,
   `recentlyClosedEditorPaths*`, `previousOpenEditorPath` and
   `uniqueRecentPaths` are all live via `editor-commands.ts`.
5. `apps/web/src/features/editor/utils/theme-catalog.ts` — delete
   `vscodeEditorTheme` (:110-112). **Keep `vscodeThemeById`** — `editorThemeExists`
   (:114) uses it.
6. `apps/web/src/components/command-palette/command-palette-utils.ts:35-36` —
   drop the `export` keyword from `SCRIPT_PREFIX` and `SESSION_PREFIX` so they
   become module-private consts.

**Verify**:

```bash
bun run --filter 'web' typecheck   # → exit 0
bun run --filter 'web' test        # → matches Step 0 baseline
git grep -n "useLogEventDetail\|fetchLogEventDetail\|logsKeys.detail\|useEditorTabDirty\|\bcommitChanges\b\|createSessionWorktree\|openFilePathList\|renameOpenFilePath\|reorderOpenFilePath\|vscodeEditorTheme" -- apps packages scripts
```

Must return **nothing**. Note `\bcommitChanges\b` must not match
`commitChangesStreaming` — if your grep does, check by eye that only the
streaming variant survives.

---

### Step 5: Shrink the `packages/contracts` barrel

Run this **after** Steps 1-4, because those steps remove the last external
consumer of a handful of names (e.g. `GitWorktreeCreateResult`), and running it
last catches them in the same pass.

From the repository root:

```bash
python3 - <<'PY'
import os, re, subprocess

INDEX = 'packages/contracts/src/index.ts'
src = open(INDEX).read()

# Every re-exported name sits alone on a two-space-indented line,
# optionally prefixed with `type `.
LINE = r'^\s{2}(?:type\s+)?([A-Za-z_$][\w$]*)\s*,?\s*$'
names = sorted({m.group(1) for m in re.finditer(LINE, src, re.M)})

# Consumers: everything outside packages/contracts/src, plus contracts' own
# tests (they import through '../index'). `-co --exclude-standard` also picks
# up untracked-but-not-ignored files — this repo has some.
roots = ['apps', 'packages/observability', 'packages/tree', 'packages/ui',
         'scripts', 'docs', 'packages/contracts/src/tests']
files = subprocess.run(['git', 'ls-files', '-co', '--exclude-standard', *roots],
                       capture_output=True, text=True).stdout.split()
words = set()
for f in files:
    # os.path.isfile guard: git still lists files you deleted with plain `rm`.
    if not f.endswith(('.ts', '.tsx', '.js', '.jsx', '.mjs', '.md')) or not os.path.isfile(f):
        continue
    words.update(re.findall(r'[A-Za-z_$][\w$]*',
                            open(f, encoding='utf-8', errors='ignore').read()))

dead = {n for n in names if n not in words}
kept = [l for l in src.split('\n')
        if not ((m := re.match(LINE, l)) and m.group(1) in dead)]
text = re.sub(r'export \{\s*\} from [^\n]*\n', '', '\n'.join(kept))
open(INDEX, 'w').write(text)
print(f'names={len(names)} removed={len(dead)} kept={len(names) - len(dead)}')
PY
```

**Expected output**: `names=` around 499 and `removed=` between **185 and 205**.
Re-verified against the live working tree while reviewing this plan: it printed
`names=499 removed=189 kept=310`, taking the file from 551 to 362 lines.

The script only touches names that sit **alone on their own line**. Five
single-line re-exports (`index.ts:13, 48, 95, 96, 97`) are left untouched by
design; that is fine, they are all live.

**If `removed=0`, or `removed>250`, STOP and report** — the line pattern no
longer matches the file's shape and the script is not safe to trust.

Then format and gate. **Format the one file, not the package** — a package-wide
`format` would rewrite `src/settings/keys.ts`, which is out-of-scope in-flight
work:

```bash
bunx oxfmt --write packages/contracts/src/index.ts   # → exit 0, 1 file
git status --short -- packages/contracts             # → only index.ts changed by you
bun run --filter '@workspace/contracts' typecheck   # → exit 0
bun run --filter '@workspace/contracts' test        # → 14 files, 120 tests passed
bun run typecheck                                   # → exit 0
```

**If `bun run typecheck` reports a missing export in `apps/` or another
package**, the script's word-scan missed that consumer. Restore exactly that one
name to `index.ts` (in its original alphabetical position within its block),
re-run typecheck, and note it in your report. Do **not** revert the whole step.

---

### Step 6: Reinstall dependencies

Steps 1f and 2 edited three `package.json` files. One more edit, then one
install.

In the **root** `package.json`, delete the now-orphaned catalog entry at line 15:

```
      "preact-render-to-string": "6.7.0",
```

(`packages/tree` was its only consumer, via `"catalog:"`. Leave the `preact`
catalog entry — `packages/tree` still uses Preact.)

Then:

```bash
bun install
```

**Expected**: exit 0, and `bun.lock` changes. That lock change is in scope.

> ⚠️ **`@singapor/*` link risk.** The root `package.json` `overrides` block maps
> fifteen `@singapor/*` packages to `link:@singapor/*`, and the repo's own note
> says: _"The @singapor/\* `link:` overrides above resolve through a `bun link`
> registration pointing at the sibling ../../Editor checkout — there is no npm
> fallback (@singapor/decode is unpublished)."_ If `bun install` fails to
> resolve any `@singapor/*` package, **STOP and report**. Do **not** remove or
> weaken the overrides, and do not commit a `bun.lock` that dropped them.

**Verify**:

```bash
bun install                       # → exit 0
git diff --stat -- bun.lock       # → bun.lock changed
grep -rn "embla-carousel-react\|\"ai\":\|preact-render-to-string" package.json packages/ui/package.json packages/tree/package.json
```

The `grep` must return **nothing**.

---

### Step 7: Full gate and a fresh dead-code report

```bash
bun run typecheck     # → exit 0
bun run lint          # → exit 0; warning count = Step 0's count minus 7
                      #    (static-store ×4, sortChildren ×2, visible-tree-projection ×1)
bun run format:check  # → the SAME file list you recorded in Step 0, nothing new
bun run test          # → same counts as Step 0, minus the codex cases deleted in 3a
```

Then re-run the dead-code detector so the next reader gets a truthful report:

```bash
bunx knip --files --exports --no-config-hints
```

Record the before/after counts in your report. Knip's numbers were previously a
_subset_ of the real dead surface; after this plan they should be much closer to
reality. **Do not act on new knip findings in this plan** — report them.

Finally confirm you changed nothing outside scope:

```bash
git status --short
```

Compare against `/tmp/plan-022-baseline-status.txt` from Step 0. The only files
that may appear beyond your intended deletions/edits are the pre-existing
modified files recorded there.

---

### Step 8: Update the index

In `plans/README.md`, change plan 022's row in the "Phase 1" table from `TODO` to
`DONE`. Add a short parenthetical with the actual deleted-line total from
`git diff --stat`. Change nothing else in that file.

## Test plan

**No new tests.** This plan deletes code that no code path reaches; there is
nothing new to assert. The gate is the existing suite plus `tsgo` across all
seven workspaces, which is the strongest available proof for this class of
change: every deleted symbol either has no reference (compiles) or has one
(fails immediately with the file and line).

Tests that are **deleted or rewritten**, and why:

| Test                                                              | File                                                                         | Action                                                                                                                                                                                        |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reads and rolls back active provider threads`                    | `apps/server/src/provider/adapters/tests/codex.test.ts:1036`                 | **Delete.** It asserts the shape of `ProviderThreadSnapshot`, a type nothing consumes. AGENTS.md: "Delete obsolete tests instead of preserving old behavior."                                 |
| `fails read and rollback requests without an active session`      | `…/codex.test.ts:1067`                                                       | **Trim.** Drop the `readThread` assertion, keep both `rollbackThread` assertions, rename to `fails rollback requests without an active session`.                                              |
| `uses the app-server protocol and keeps early turn notifications` | `…/codex.test.ts:552`                                                        | **Trim.** Remove `readThread`/`rollbackThread`/`stopAll` from the `capabilities` equality literal at :567-573. Everything else in the test stays.                                             |
| `buffers proposed plan text and upserts deterministically`        | `apps/server/src/orchestration/tests/provider-runtime-ingestion.test.ts:177` | **Rewrite** to `content.delta` (`streamKind: 'plan_text'`) + `turnCompleted(...)`; the exact replacement body is inlined in Step 3c.4. If it will not pass, STOP — this covers live behavior. |

Tests explicitly **preserved** despite touching deleted-adjacent code:

- `codex.test.ts:562`/`:728` and `claude.test.ts:561` keep using
  `adapter.listSessions()` — which is why Step 3b removes it from the SPI type
  but leaves the concrete adapter methods in place.
- Everything in `apps/server/src/orchestration/tests/provider-runtime-ingestion.test.ts`
  touching `assistantDeliveryMode: 'buffered'` (`:42`, `:58`) is untouched — that
  option is out of scope.

Structural pattern if you do end up writing anything: model it on the
neighbouring cases in `apps/server/src/orchestration/tests/provider-runtime-ingestion.test.ts`
(same `fixture()` helper, same `expect(dispatched).toMatchObject([...])` shape).
If you write a test in `apps/web`, import `{ test, expect }` from
`apps/web/test/fixtures.ts` (**not** from `vitest`), use `renderWithProviders`
from `apps/web/test/render.tsx`, and drive the real in-process Elysia server —
**never** `mock.module`/`vi.mock` our own server, client, or feature modules.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun run typecheck` exits 0
- [ ] `bun run lint` exits 0, with 7 fewer warnings than Step 0 recorded
- [ ] `bun run format:check` fails on **exactly** the file list recorded in
      Step 0 — no more, no fewer, no different files
- [ ] `bun run test` passes with the Step 0 counts, adjusted only by the deleted
      codex cases
- [ ] `bun run --filter '@workspace/tree' test` → 2 files, 7 tests passed
- [ ] `bun run --filter '@workspace/contracts' test` → 14 files, 120 tests passed
- [ ] `git grep -n "StaticPathStore\|createPathStoreScheduler\|withBenchmarkPhase\|cleanupPathStoreState\|skipSubtreeCountPass\|preloadFileTree\|file-tree-debug" -- packages apps` returns nothing
- [ ] `git grep -n "components/carousel\|components/skeleton\|components/tabs\|components/scroll-area" -- apps packages` returns nothing
- [ ] `git grep -nw "readThread" -- apps` returns nothing, **and**
      `git grep -n "readThreadIdFromThreadResponse" -- apps` still returns its
      two live lines in `codex.ts` (you must not have deleted them)
- [ ] `git grep -n "'turn.aborted'\|'item.updated'\|'turn.proposed" -- apps` returns nothing
- [ ] `git grep -n "useLogEventDetail\|createSessionWorktree\|vscodeEditorTheme\|useEditorTabDirty\|openFilePathList" -- apps` returns nothing
- [ ] `git grep -n "commitChangesStreaming" -- apps/web` still returns its
      definition and its call in `use-commit-mutation.ts` (the live commit path
      survived), and `packages/ui/src/components/input-group.tsx` still exists
- [ ] `grep -n "embla-carousel-react\|\"ai\":\|preact-render-to-string" package.json packages/ui/package.json packages/tree/package.json` returns nothing
- [ ] `packages/tree/src/utils/path-store/internal/` no longer exists
- [ ] `bun install` exits 0 and the `@singapor/*` overrides are unchanged in `package.json`
- [ ] `git status --short` shows no modified file outside the Scope list (other
      than the pre-existing ones from Step 0)
- [ ] `plans/README.md` status row for 022 updated

## STOP conditions

Stop and report back (do not improvise) if:

- **Step 0's `bun run typecheck` is not exit 0.** Typecheck is the only gate this
  plan has. If it starts red, you cannot tell your breakage from someone else's.
- **`bun install` cannot resolve an `@singapor/*` package.** These resolve
  through a `bun link` registration to a sibling `../../Editor` checkout with no
  npm fallback. Never "fix" this by editing the `overrides` block.
- **The Step 5 script prints `removed=0` or `removed>250`.** The barrel's line
  shape has drifted and the rewrite is not safe.
- **Step 5's typecheck reports more than ~5 missing exports.** One or two means
  the word-scan missed a consumer; a flood means the script matched the wrong
  thing — revert `packages/contracts/src/index.ts` and report.
- **Anything named `isLoading` or `loadState` on a `PathStoreVisibleRow` turns
  out to have a consumer** in `FileTreeView.tsx`, `utils/model/`, `utils/render/`
  or `apps/web`. This plan asserts it has none; if typecheck disagrees, the
  lazy-load surface is live and Step 1b is wrong.
- **Any `withBenchmarkPhase` unwrap changes control flow.** If an arrow body's
  early `return` cannot be turned into a guard clause without restructuring the
  enclosing function's return value, leave that one site wrapped and report it.
  (Only `builder.ts:323` is known to need this; `projection.ts:848` and the four
  `events.ts` guards have explicit recipes in Step 1c.)
- **You cannot rewrite the proposed-plan ingestion test (Step 3c.4) against the
  live `content.delta` / `plan_text` path.** Do not delete it — it covers
  behavior that still runs.
- **A deletion requires touching a file not on the In-scope list**, in particular
  `codex-protocol/generated/`, `provider-runtime-buffers.ts`, or
  `packages/editor-*`.
- **Either dev-server check shows a broken file tree** — after 1c: blank tree,
  wrong indentation, or duplicated rows; after 1e: no scrolling, no context menu,
  or a trigger button stuck visible while scrolling.
- **`bun run format:check` starts failing on a file that was not in your Step 0
  list.** Either you formatted something you should not have, or someone else's
  working tree moved under you. Do not "fix" it — report which file and stop.
- **`git grep -nw readThread -- apps` still returns hits after Step 3c**, other
  than ones you can point at in a file you have not finished editing. In
  particular, if you are tempted to delete `readThreadIdFromThreadResponse` to
  make a grep go green: that is live code, and the grep is wrong, not the code.

## Maintenance notes

For whoever owns this code next:

- **What a reviewer should scrutinize.** In order of risk: (1) the
  `withBenchmarkPhase` unwrap in `store.ts`/`builder.ts` — 48 hand edits in hot
  paths, and `builder.ts:323` is the one with real control-flow surgery;
  (2) Step 1b's child-load removal, which touches eight files and is the only
  change that alters a _type_ (`PathStoreVisibleRow`) the app reads;
  (3) the rewritten proposed-plan ingestion test. Everything else is
  file deletion that typecheck already proved.
- **`packages/tree` has 20K lines and 7 test cases.** That is why plan 014
  (path-store + `getVisibleRows` characterization tests) exists and gates plan 039. This plan does not depend on 014 — deletions of zero-caller code are
  proved by the compiler, not by tests — but **plan 039 (the FileTreeView /
  FileTreeController split) does**, and it should be executed after both 014 and
  this plan. Step 1e removes the four dead branches 039 would otherwise have to
  preserve.
- **Plan 015 (motion system) lists carousel/progress/scroll-area as out of its
  scope.** After Step 2 those files no longer exist; whoever executes 015 should
  drop those lines rather than hunt for the files.
- **Plan 013 adds the `packages/ui` `test` script.** Deliberately not done here
  so the two plans do not collide in `packages/ui/package.json`. If 013 has
  already landed when you run Step 2, just leave its `test` script alone.
- **Plans 026, 027 and 028 are marked as depending on 022.** They are typed-
  contract plans that touch `packages/contracts/src/index.ts`; running them
  against the shrunk barrel means fewer names to reason about. Do not merge
  their work into this one.
- **Deliberately deferred, with reasons:**
  - `assistantDeliveryMode` and the `'buffered'` assistant path. The mode is
    test-only, but the _streaming_ branch it sits beside is live on every real
    Codex turn, and unwinding the buffer means rewriting two passing tests and a
    four-method surface (`appendBufferedAssistantText`,
    `takeBufferedAssistantText`, `clearBufferedAssistantText`, plus
    `MAX_BUFFERED_ASSISTANT_CHARS`). Not a reachability win.
  - `useClientLayoutEffect` (`FileTree.tsx:28`) — SSR-shaped, but one harmless
    ternary.
  - `'thread/read'` in `codex-protocol/generate.ts` — a wire-protocol
    description, regenerating needs an external binary.
  - `CodexProviderAdapter.listSessions` / `ClaudeProviderAdapter.listSessions` —
    kept as adapter-local test observables after removal from the SPI. If someone
    later gives those three tests a different observable, these can go too.
- **The barrel will grow back** unless something stops it: additions are manual,
  so the barrel is not a review gate — it grows by reflex whenever a module gains
  an export. A knip/lint rule requiring every new `index.ts` export to have at
  least one external consumer is the obvious follow-up, and is **not** in this
  plan.
