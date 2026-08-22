# Plan 052: Wire the complete tree capability surface into the workspace

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in the "STOP conditions"
> section occurs, stop and report — do not improvise. This repository deletes completed plans: once
> every done criterion is verified, delete this file and remove its row from `plans/README.md` in the
> same change.
>
> **Mandatory prerequisites — satisfied through Plan 051; re-verify before execution**: Plans 036,
> 039, and 051 are complete. The tree now uses one state-owned React root per wrapper with queued,
> token-checked cleanup; `FileTreeView.tsx` is decomposed into the row, drag, context-menu,
> focus-sync, and keyboard seams; Preact, dead hydration/runtime APIs, and the package-wide React
> Compiler exemption are gone. Before starting, re-run Plan 051's final tree/web gates and the
> structural/source checks in Step 0. Completed plan files are deleted, so their absence alone is
> not proof.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat 5afe83d1..HEAD -- packages/tree apps/web/src/features/workspace apps/web/src/features/workbench apps/web/src/keymap apps/web/src/App.tsx apps/web/src/lib/tree-model.ts
> git diff --stat -- packages/tree apps/web/src/features/workspace apps/web/src/features/workbench apps/web/src/keymap apps/web/src/App.tsx apps/web/src/lib/tree-model.ts
> ```
>
> Committed drift from Plans 036/039/051 is expected. Reconcile the excerpts and inventories below
> against that final shape. Any uncommitted overlap not owned by this plan is a STOP condition.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: HIGH
- **State**: READY — Plans 036/039/051 are satisfied; reconcile live app drift before Step 0
- **Depends on**: satisfied — Plans 036, 039, and 051 complete with final gates green
- **Category**: direction
- **Planned at**: commit `5afe83d1`, 2026-08-22

## Why this matters

The copied tree package already contains a broad, coherent product surface, but the workspace uses
only part of it. Drag/drop, rename, row decoration, context menus, selection, item handles, dynamic
icons, density, and lifecycle are live. Other capabilities are implemented and tested inside the
package yet stop at its boundary: tree search is disabled by the app, the "Focus file tree" command
updates a label without moving DOM focus, there is no reveal-active-file command, model sync emits
one operation at a time, git status always replaces the full decoration state, mutation events have
no app consumer, and the React header composition slot is empty.

This plan makes those capabilities real in the file navigator before Plan 053 decides what API is
actually dead. It uses a narrow request store for app-level commands, a compact in-tree toolbar,
real model operations rather than duplicate app logic, and tests every existing integration that is
already live so "wire everything" does not regress the parts that worked.

## Current capability matrix

At the planned-at commit:

| Capability                 | Current evidence                                                                    | Disposition                                          |
| -------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Drag/drop                  | `tree-pane.tsx` passes `dragAndDrop` with validation and optimistic move            | Keep and characterize                                |
| Inline rename/create       | `tree-pane.tsx` passes `renaming`; `use-fs-actions.ts` calls `startRenaming`        | Keep; toolbar adds root create actions               |
| Row decoration             | `tree-pane.tsx` passes `renderRowDecoration`                                        | Keep and characterize                                |
| Context-menu composition   | `<FileTree renderContextMenu={...}>` renders the app menu                           | Keep and characterize                                |
| Selection/item handles     | `tree-pane-state.ts` uses `getItem`, select/deselect, expand/collapse               | Keep and characterize                                |
| Add/remove/move/reset      | app sync and filesystem rollback call each operation                                | Keep; batch related sync work                        |
| Dynamic icons              | `useFileTree` calls `setIcons` when `icons` changes                                 | Keep and characterize                                |
| Full git status            | `useFileTree` calls `setGitStatus` for every new array                              | Keep as initial/fallback; use patches for updates    |
| Density/layout host values | app requests `density: 'compact'`; React wrapper reads item height/factor           | Keep and characterize                                |
| Render lifecycle           | React wrapper/hook use the token-checked root owner in `state/renderer.ts`          | Keep and characterize                                |
| General subscriptions      | tree pane and intent prefetch subscribe                                             | Keep                                                 |
| Search session             | package implements open/close/query/matches/next/previous; app omits `search: true` | Wire toolbar, commands, retained state               |
| Focus/scroll               | model focus/scroll APIs preserve DOM focus only while the tree already owns it      | Add one-shot DOM-focus request; wire focus/reveal    |
| Batch mutation             | package exposes `batch`; app loops over add/remove                                  | Use in incremental path sync                         |
| Mutation events            | package exposes `onMutation`; app has no listener                                   | Use for one wide structured event per operation      |
| Git patch                  | package exposes `applyGitStatusPatch`; app replaces whole state                     | Diff and apply incremental updates                   |
| Header composition         | React `<FileTree>` accepts `header`; app passes none                                | Render the file-navigator toolbar through it         |
| Prepared input             | package can prepare normalized input; app reparses on every navigator remount       | Cache by path-array identity and reuse when measured |

The current `workspace.focusFileTree` command in `apps/web/src/keymap/workspace-commands.ts` only:

```ts
setWorkbenchPanels(setWorkbenchSidebarTab(workbenchPanels, 'files'))
setFocusArea('file-tree')
```

`setFocusArea` records where focus is supposed to be; it does not focus a row or the tree's search
input. The existing editor uses an explicit request/consumer model for this reason. The tree needs
its own narrow equivalent rather than prop-drilling a model into the global command table.

Plan 051's real-browser characterization also proves that `focusPath` is model focus, while a
controller scroll request deliberately suppresses DOM refocusing for that commit. A newly mounted
tree does not own DOM focus, so sequencing `focusPath()` and `scrollToPath()` cannot implement the
workspace focus command. Step 3 adds a one-shot `focus()` request to the rendered model and settles
it inside the existing React focus coordinator; app code must not query the shadow root or change
the preserved scroll-request semantics.

`ReadyTreePane` currently constructs the model without enabling search:

```ts
const { model: tree } = useFileTree({
  density: 'compact',
  flattenEmptyDirectories: true,
  gitStatus,
  icons,
  initialExpansion: 'closed',
  initialSelectedPaths,
  paths: model.paths,
  // drag/drop, selection, rename, decoration...
})
```

`syncTreePaths` currently calls `tree.remove` and `tree.add` in loops. `FilesPane` derives a complete
`GitStatusEntry[]`, and `useFileTree` sends each changed array through `setGitStatus`; neither app
path uses the existing batch/patch APIs.

## Target user experience

The Files navigator gains a compact header inside the tree's existing `header` slot. It uses
`@workspace/ui` icon buttons and theme tokens only:

- New File and New Folder at the root, reusing `useFsActions` rather than duplicating mutations.
- Filter Files, which opens and focuses the tree's built-in search input.
- Previous/Next match and Clear/Close controls while search is active.
- Reveal Active File, which focuses and scrolls the selected editor file or nearest visible ancestor.
- A `tabular-nums` match count when a non-empty query is active.

Search uses `search: true` and `searchBlurBehavior: 'retain'`: clicks in the toolbar/editor do not
discard the filter; Escape/Close explicitly ends it. Plan 036 defines and tests those semantics.

Workspace commands become real operations:

| Command                            | Default                          | Behavior                                                                                    |
| ---------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------- |
| `workspace.focusFileTree`          | `Mod+Shift+E`                    | Open Files pane and move DOM focus to selected/focused/first visible row                    |
| `workspace.findInFileTree`         | `Mod+F` when `pane: 'file-tree'` | Open Files pane and focus the built-in filter input                                         |
| `workspace.revealActiveFileInTree` | none                             | Open Files pane, focus the active file or nearest visible ancestor, and scroll it into view |

Keep Enter/Shift+Enter/Escape inside the tree's existing search keyboard contract; do not add a
second key handler for match traversal.

## Commands you will need

| Purpose                  | Command                                                                                                                       | Expected on success                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Tree typecheck           | `(cd packages/tree && bun run typecheck)`                                                                                     | exit 0                                                                                                |
| Tree lint                | `(cd packages/tree && bun run lint)`                                                                                          | no new warning versus Step 0                                                                          |
| Tree tests               | `(cd packages/tree && bun run test)`                                                                                          | baseline passes                                                                                       |
| Tree browser tests       | `(cd packages/tree && bun run test:browser)`                                                                                  | baseline plus retained-search/focus cases pass                                                        |
| Web typecheck            | `(cd apps/web && bun run typecheck)`                                                                                          | exit 0                                                                                                |
| Web lint                 | `(cd apps/web && bun run lint)`                                                                                               | no new warning versus Step 0                                                                          |
| Workspace tests          | `(cd apps/web && bun --bun vitest run --project node --project dom src/features/workspace src/features/workbench src/keymap)` | baseline plus new tests pass                                                                          |
| Web browser test         | `(cd apps/web && bun run test:browser -- src/features/workspace/components/tree-pane.browser.tsx)`                            | real focus/search/scroll checks pass under plain Vitest/Node orchestration                            |
| Prepared-input benchmark | `bun apps/web/scripts/file-tree-prepared-input-benchmark.ts --gate`                                                           | at 50k paths, cached remount median is at least 20% faster and cold median is no more than 15% slower |

Use baseline deltas, never historical absolute test counts or a bare root `bun run verify`. Reuse the
running dev server for manual browser checks; do not start another server.

## Suggested executor toolkit

- Read and apply `/Users/shaul/.agents/skills/never-nester/SKILL.md` before editing.
- Use `frontend-design` for the toolbar's hierarchy/polish, `tailwind-css-patterns` for token-only
  styling, and `vercel-react-best-practices` for provider/subscription/effect boundaries.
- Repository rules against speculative memoization and broad context values take precedence.

## Scope

**In scope**:

- `apps/web/src/App.tsx`
- `apps/web/src/keymap/define-command.ts`
- `apps/web/src/keymap/commands.ts`
- `apps/web/src/keymap/workspace-commands.ts`
- `apps/web/src/keymap/tests/command-dispatch.test.tsx`
- `apps/web/src/keymap/tests/keymap.test.ts`
- `apps/web/src/features/workspace/components/files-pane.tsx`
- `apps/web/src/features/workspace/components/tree-pane.tsx`
- `apps/web/src/features/workspace/components/tree-toolbar.tsx` (create)
- `apps/web/src/features/workspace/components/tree-pane.browser.tsx` (create)
- `apps/web/src/features/workspace/hooks/use-tree-command-request.ts` (create)
- `apps/web/src/features/workspace/hooks/use-tree-search-session.ts` (create)
- `apps/web/src/features/workspace/hooks/use-file-tree-mutation-events.ts` (create)
- `apps/web/src/features/workspace/providers/tree-commands-context.ts` (create)
- `apps/web/src/features/workspace/providers/tree-commands-provider.tsx` (create)
- `apps/web/src/features/workspace/state/tree-command-store.ts` (create)
- `apps/web/src/features/workspace/state/prepared-tree-input-cache.ts` (create)
- `apps/web/src/features/workspace/utils/tree-commands.ts` (create)
- `apps/web/src/features/workspace/utils/tree-git-status-patch.ts` (create)
- `apps/web/src/features/workspace/utils/tree-mutation-log.ts` (create)
- `apps/web/src/features/workspace/utils/tree-pane-state.ts`
- `apps/web/src/features/workspace/tests/focus-state.test.ts` only if existing focus-area assertions
  need proof they still coexist with real requests
- `apps/web/src/features/workspace/tests/tree-command-store.test.ts` (create)
- `apps/web/src/features/workspace/tests/tree-commands.test.ts` (create)
- `apps/web/src/features/workspace/tests/tree-git-status-patch.test.ts` (create)
- `apps/web/src/features/workspace/tests/tree-pane.test.ts`
- `apps/web/src/features/workspace/tests/tree-toolbar.test.tsx` (create)
- `apps/web/src/features/workspace/tests/prepared-tree-input-cache.test.ts` (create)
- `apps/web/scripts/file-tree-prepared-input-benchmark.ts` (create)
- `packages/tree/src/components/FileTree.browser.tsx`
- `packages/tree/src/components/FileTree.test.tsx`
- `packages/tree/src/components/FileTreeView.tsx` — pass the narrow focus request to the coordinator
- `packages/tree/src/hooks/useFileTreeFocusSync.ts` — settle the one-shot request only
- `packages/tree/src/utils/model/FileTreeController.ts` — own the one-shot request id only
- `packages/tree/src/utils/render/FileTree.ts` — expose `focus()` only
- `packages/tree/UPSTREAM.md` (create) — note which reconciled capabilities the app now consumes
- `plans/053-prune-tree-package-api.md` and `plans/README.md` — post-wiring drift/index update
- this plan — completion cleanup

**Out of scope**:

- Reworking the post-051 React runtime, FileTreeView/controller decomposition, path-store algorithms,
  or package exports beyond Step 3's narrow focus request. Plan 053 owns API-boundary pruning after
  this lands.
- A second workspace-search implementation. Tree search filters currently loaded navigator rows;
  the Search sidebar/editor remains the content-search product.
- Persisting tree filter text across application restarts or adding a setting. Retention lasts for
  the mounted tree session only.
- Changing filesystem, git, editor, or query server contracts.
- Replacing the existing external `FileNavigatorHeader`; the new toolbar is the tree's own action
  header inside its composition slot.
- Raw buttons/inputs, raw palette colors, inline styles, hand-rolled dark variants, or new CSS files.
- The linked Editor repository.

## Git workflow

- Use the current worktree. Do not create a branch/worktree, commit, push, or open a PR unless the
  operator asks.
- Preserve unrelated dirty work. Use `apply_patch` for source/config edits.
- Do not run formatters over unrelated files.

## Steps

### Step 0: Prove prerequisites and capture behavior/performance baselines

Run:

```bash
test -f packages/tree/src/state/renderer.ts
test -f packages/tree/src/hooks/useFileTreeFocusSync.ts
test -f packages/tree/src/hooks/useFileTreeKeyboard.ts
rg -n "from ['\"]preact|jsxImportSource preact|preact/hooks" packages/tree/src
rg -n "hydrateRoot|fileTreeRenderer|utils/render/runtime" packages/tree/src packages/tree/package.json
rg -n '"preact"\s*:' package.json packages/*/package.json apps/*/package.json
rg -n '"files": \["packages/tree/\*\*"\]' .oxlintrc.json
git status --porcelain > /tmp/plan-052-status-before.txt
(cd packages/tree && bun run typecheck) > /tmp/plan-052-tree-typecheck-before.txt 2>&1
(cd packages/tree && bun run lint) > /tmp/plan-052-tree-lint-before.txt 2>&1
(cd packages/tree && bun run test) > /tmp/plan-052-tree-test-before.txt 2>&1
(cd packages/tree && bun run test:browser) > /tmp/plan-052-tree-browser-before.txt 2>&1
(cd apps/web && bun run typecheck) > /tmp/plan-052-web-typecheck-before.txt 2>&1
(cd apps/web && bun run lint) > /tmp/plan-052-web-lint-before.txt 2>&1
(cd apps/web && bun --bun vitest run --project node --project dom src/features/workspace src/features/workbench src/keymap) \
  > /tmp/plan-052-web-tests-before.txt 2>&1
```

All four searches must print nothing; the three React seam files must exist; typecheck/tests must
pass; lint may contain only recorded existing warnings. Confirm `FileTreeView.tsx` remains at least
300 lines below Plan 051's 1,994-line baseline and both focus/keyboard hooks remain below 500 lines.
Re-run the capability matrix with repository searches. If a gap listed above is already wired by
prerequisite drift, preserve it and turn the corresponding step into characterization/refinement
rather than adding a second path.

Before adding a cache, create the benchmark script. Generate deterministic 10k and 50k mixed
directory/file paths and measure medians over warm iterations for:

1. two independent `new FileTree(...)` constructions from raw paths;
2. prepare once, then two constructions from the same prepared input;
3. one cold construction, separately from the second/remount construction.

Use the real model and no DOM mocks. Record output in `/tmp/plan-052-prepared-before.txt`. The
benchmark must first prove it can distinguish the two paths; if it cannot, stop and fix the
instrument before trusting it.

### Step 1: Characterize every capability already live

Extend existing package/app tests before changing wiring:

- drag/drop still validates and performs one logical multi-move;
- rename/create/cancel/error rollback still work;
- row decorations and context menus still use app data/actions;
- selected editor sync uses item handles and expansion state;
- icon remaps update after the path set changes;
- compact density reaches the host/layout contract;
- mount/unmount/remount cleanup remains warning-free;
- subscriptions still drive directory loading, visible count, and intent prefetch.

Use the real package/server/client patterns already present; do not mock tree, app client, or feature
modules. This step is a regression shield, not a rewrite.

**Verify**: tree node/DOM/browser suites and focused web workspace tests match Step 0.

### Step 2: Add a durable file-tree command request bridge

Create a narrow external store in `state/tree-command-store.ts`:

```ts
type TreeCommandKind = 'focus' | 'open-search' | 'reveal-active'
type TreeCommandRequest = { id: number; kind: TreeCommandKind; rootPath: string }
```

It exposes `getSnapshot`, `subscribe`, `request(kind, rootPath)`, and `acknowledge(id)`. A request
remains pending while the Files pane is unmounted; a matching ready `TreePane` handles it once and
acknowledges it. A newer request replaces an older request because each kind is complete by itself:
open-search and reveal-active both include real focus. A tree mounted for another root discards a
stale request rather than replaying it if that root is reopened later.

Put the context object and consumer hook in their required kind directories; the provider creates
one store for the app lifetime. Mount it in `App.tsx` above both `AppCommandSurface` and
`WorkspaceView`, alongside the existing Focus provider—not inside `FileNavigatorPanel`, because the
command surface is its sibling.

Add `requestFileTreeCommand` to `WorkspaceCommandContext` and source it in
`usePlatformCommandDispatch` through the narrow hook. Do not put the model or callbacks into the
workspace/editor store and do not add a broad command-state blob to FocusStore.

Update/add commands per the target table. `workspace.focusFileTree` and the Files-pane toggle must
request real focus after selecting the pane. Keep `setFocusArea('file-tree')` as observed focus
state, but never treat it as the focus operation itself.

**Verify**:

```bash
(cd apps/web && bun --bun vitest run --project node --project dom \
  src/features/workspace/tests/tree-command-store.test.ts src/keymap/tests/command-dispatch.test.tsx src/keymap/tests/keymap.test.ts)
(cd apps/web && bun run typecheck)
```

Cover request persistence before mount, acknowledge-once, replacement, stale-root discard,
`Mod+Shift+E`, pane-scoped `Mod+F`, and command-palette availability.

### Step 3: Execute focus, reveal, and search commands against the real model

Create pure decision helpers in `utils/tree-commands.ts`; DOM/model effects stay in
`ReadyTreePane`. Use this focus fallback order:

1. active editor file mapped to a tree path, when present;
2. the model's current focused item;
3. first current selected path;
4. first visible/model path.

Add one narrow, one-shot DOM-focus request to the package before wiring the app:

- `FileTreeController` owns a monotonically increasing request id, exposes it to the view, and emits
  when `requestFocus()` increments it. It does not store an element, callback, or app concern.
- `FileTree.focus()` forwards to that controller request. This is distinct from `focusPath`, which
  continues to mean model focus, and from `scrollToPath`, whose preserved commit still suppresses
  DOM refocusing.
- `useFileTreeFocusSync` tracks the last processed focus-request id. A new request claims DOM-focus
  ownership and runs the existing canonical-row focus/nearest-scroll settlement; it must also work
  when the requested path was already model-focused and when virtualization must mount the row.
- Do not alter ordinary `focusPath`/`scrollToPath` semantics, query the shadow DOM from app code, or
  add another focus effect/state machine.

For focus, resolve the nearest visible path, call `focusPath`, then call `focus()`. For
reveal-active, require an active editor path, use the same nearest-visible fallback while lazy
ancestors load, and let existing selected-file sync continue loading/expanding ancestors. The focus
coordinator already performs nearest scrolling when it mounts/focuses the canonical row, so do not
pair this request with `scrollToPath` or duplicate its geometry in app code.

For open-search, call `openSearch()` only after `search: true` is set in Step 4; the package owns
input focus. TreePane observes the request through `use-tree-command-request.ts`, executes it once
after the ready model mounts, updates the focus area through the existing capture path, and
acknowledges it.

**Verify**: package DOM/browser tests prove model focus alone does not steal DOM focus, one request
focuses an already-focused or virtualized row exactly once, and ordinary scroll-request suppression
is unchanged. Pure decision tests plus the app real-browser test prove pane-unmounted request, real
row focus, nearest-ancestor reveal, scroll settlement, and focused search input.

### Step 4: Enable retained search and fill the header composition slot

Set:

```ts
search: true
searchBlurBehavior: 'retain'
```

Create `use-tree-search-session.ts`. It owns one focused subscription to the model and exposes an
immutable snapshot of `isSearchOpen`, `getSearchValue`, and `getSearchMatchingPaths().length`.
Avoid returning a new snapshot when all three values are unchanged. The hook does not own toolbar
markup or duplicate package search state.

Create one `TreeToolbar` component. It receives narrow callbacks/snapshot values from TreePane,
not the model or filesystem/query state. Render it through `<FileTree header={...}>`. Compose shared
buttons and icons; use theme tokens, visible focus states, tooltips/titles, and `tabular-nums` for
the match count. Keep the layout compact at narrow sidebar widths. Do not add raw CSS or inline
styles.

Wire toolbar actions to:

- existing `fsActions.actions.createEntry('', false/true)` for root New File/New Folder;
- `openSearch`, `focusPreviousSearchMatch`, `focusNextSearchMatch`, `setSearch('')`, and
  `closeSearch` for filter controls;
- the same reveal helper as the global command.

If Plan 036's final `retain` behavior differs from this plan's expectation, stop and reconcile the
UX; do not silently change package semantics here.

**Verify**:

```bash
(cd apps/web && bun --bun vitest run --project dom src/features/workspace/tests/tree-toolbar.test.tsx)
(cd apps/web && bun run test:browser -- src/features/workspace/components/tree-pane.browser.tsx)
(cd packages/tree && bun run test:browser)
```

Cover accessible labels, active/inactive controls, match count, previous/next, clear, explicit
close, retained filter after toolbar/editor focus, Escape closure, root create actions, and reveal.

### Step 5: Batch incremental path reconciliation

In `tree-pane-state.ts`, keep the existing drift check and large-reset fallback. For the incremental
case, construct one ordered `FileTreeBatchOperation[]`: top-level recursive removals first, then
depth-sorted additions. Call `tree.batch(operations)` once. Do not batch filesystem requests,
selection commands, expansion, or unrelated effects.

Preserve current collision behavior, flattened-directory expansion, selected/focused path
remapping, and the reset threshold. A zero-operation diff returns before calling batch.

**Verify**: extend `tree-pane.test.ts` to assert one batch event for a multi-add/remove sync, child
operation order, unchanged final paths, preserved selection/expansion, and reset fallback for the
existing threshold.

### Step 6: Consume mutation events as wide observability

Create `utils/tree-mutation-log.ts`, a pure mapper from public mutation events to one bounded log
context. Include operation, canonical/projection invalidation, visible-count delta, batch child
count, and relevant relative paths; do not emit one log per batch child.

Create `use-file-tree-mutation-events.ts`. Subscribe with `tree.onMutation('*', ...)` and emit one
`log.info` wide event per public operation:

```text
action: file-tree.mutation
area: file-tree
rootPath
operation
canonicalChanged
projectionChanged
visibleCountDelta
```

The existing general subscription remains responsible for expansion-driven loading, visible
counts, and prefetch invalidation. Do not duplicate those effects in the mutation hook.

**Verify**: pure mapper tests cover add/remove/move/reset/batch; a TreePane integration test proves
one event for one batched sync and clean unsubscribe on unmount.

### Step 7: Apply incremental git-status patches

Create `utils/tree-git-status-patch.ts`. Given previous/next `GitStatusEntry[]`, build last-wins maps
by path and return:

- `remove`: paths absent from next;
- `set`: new paths and paths whose status changed;
- `null`: no semantic change, including a reordered equivalent array.

In `ReadyTreePane`, seed the model with the initial status array exactly once. On subsequent props,
diff against a ref and call `tree.applyGitStatusPatch(patch)` only when non-null. Do not let
`useFileTree` also send the changing array through `setGitStatus`; its constructor input must remain
the stable initial value. Root changes already remount `FilesPane` by key and get a fresh full seed.

Preserve `setGitStatus` as the package's full replacement/initialization path. Do not copy maps to
satisfy TypeScript; make helper inputs readonly.

**Verify**: helper tests cover add/change/remove/reorder/duplicate/no-op; app DOM/browser checks prove
file and ancestor directory decorations update and clear without remounting the model.

### Step 8: Reuse prepared input across navigator remounts, if the benchmark supports it

Create `state/prepared-tree-input-cache.ts` with a `WeakMap` keyed by the exact readonly paths array.
The value is `prepareFileTreeInput(paths, { flattenEmptyDirectories: true })`. This belongs in
`state/`, not `utils/`, because it owns module-level mutable cache state.

Use the cached handle for initial `useFileTree` construction and large `resetPaths` calls. Always
pass the same paths array the prepared input describes. Do not use
`preparePresortedFileTreeInput`: `TreeModel.paths` preserves server/Map insertion order, but no
current contract proves it matches the path-store comparator.

Re-run the benchmark with `--gate` into `/tmp/plan-052-prepared-after.txt`. At 50k paths, the cached
second/remount median must be at least 20% faster than the raw second construction and the cold
prepare-plus-construct median must be no more than 15% slower than raw cold construction. The script
must exit nonzero when either threshold fails. If it fails, stop and report the medians; do not keep
a cache justified only by theory. Keep the package API for future measured work and let Plan 053
record it as intentional.

**Verify**: cache tests prove same path-array identity reuses one handle, a different array does not,
reset paths and prepared paths match, and garbage-collectable weak ownership has no manual global
registry/cleanup API.

### Step 9: Run complete gates and hand the settled surface to Plan 053

Run every command in "Commands you will need", then:

```bash
rg -n "search: true|searchBlurBehavior: 'retain'|applyGitStatusPatch|onMutation\(|\.batch\(|prepareFileTreeInput|header=" apps/web/src/features/workspace
rg -n "requestFileTreeCommand|workspace.findInFileTree|workspace.revealActiveFileInTree" apps/web/src
git diff --check
git status --short
```

Expected: every capability has a real app caller, all gates match baseline, and only in-scope files
differ. Create `packages/tree/UPSTREAM.md` with the reconciled upstream baseline and the capabilities
now consumed by the app, update Plan 053's live consumer/unused-export inventory, then delete this
completed plan and its index row.

## Test plan

- App node/DOM tests import `{ test, expect }` from `apps/web/test/fixtures.ts` and use the real
  in-process server/client/provider stack; browser tests follow existing `*.browser.tsx` conventions.
- Pure node tests: tree command store/decisions, git patch diff, mutation log mapping, prepared-input
  cache behavior, and batched path operation construction.
- DOM tests: provider/command dispatch, toolbar actions/state/accessibility, mutation subscription
  cleanup, git patch rendering, and existing feature integrations.
- Real browser: actual row/search-input focus, scroll reveal, retained/closed search, match traversal,
  selection/rename/drag/context-menu behavior, and no React warnings.
- Benchmark: deterministic cold/remount comparison before and after cache wiring.
- Existing package/app tests remain authoritative; never rewrite assertions to accept drift.

## Done criteria

- [ ] Plans 036/039/051 and their final behavior gates are complete/green.
- [ ] Existing drag/drop, rename/create, row decoration, context menu, selection/item handles,
      dynamic icons, compact density, subscriptions, and lifecycle remain real and tested.
- [ ] Focus-file-tree moves DOM focus; reveal-active focuses/scrolls the real or nearest visible path;
      requests survive an unmounted Files pane and execute once.
- [ ] Tree search is enabled with retain semantics and is controllable through the toolbar,
      pane-scoped command, keyboard, and complete search-session API.
- [ ] The FileTree `header` slot renders a polished accessible toolbar with root create, search/match,
      and reveal actions.
- [ ] Incremental path sync uses one ordered `batch` call; large drift still uses reset.
- [ ] `onMutation('*')` emits one bounded wide log event per operation/batch and unsubscribes cleanly.
- [ ] Git status updates use semantic patches after one full initial seed; reorder/no-op emits none.
- [ ] Prepared input is cached/reused only with benchmark evidence and never assumes unproven sort.
- [ ] Tree/web typecheck, lint, format where touched, node/DOM/browser tests, and benchmark pass without
      baseline regression.
- [ ] Plan 053 is reconciled against the completed consumer surface.
- [ ] `git diff --check` passes; unrelated dirty work is untouched.
- [ ] This completed plan and its `plans/README.md` row are deleted.

## STOP conditions

Stop and report; do not improvise if:

- A prerequisite or its final tree/web gates is incomplete.
- Plan 036's retain-search behavior conflicts with the target UX.
- Real tree focus/search requires querying private shadow-DOM geometry instead of model APIs.
- A second FileNavigatorPanel can be mounted for the same root and both could consume one request;
  reconcile request ownership before continuing.
- Batch changes operation ordering, collision behavior, expansion, selection, or focus.
- Git patch and full-set paths both run for one update.
- Prepared-input benchmarks cannot distinguish paths or show no repeat-mount benefit.
- Wiring a capability requires a broad state blob, prop-drilling callbacks through more than two
  boundaries, a raw setter/ref context API, or new cross-feature imports.
- Toolbar work requires raw palette colors/CSS or changing the package's DOM/style contract.
- A verification gate fails twice after one reasonable in-scope correction.
- Completion requires files outside Scope or a server/Editor contract change.

## Maintenance notes

- The command request store is a delivery bridge, not a second tree store. The package model remains
  the source of truth and requests are acknowledged after execution.
- Keep tree filter distinct from workspace content search in names, commands, and UX.
- Prefer one high-level model action over shadow-DOM queries or app-side reimplementation.
- Mutation logs are wide and bounded; enrich the one event instead of adding child events.
- Prepared-input caching is keyed by immutable path-array identity. If TreeModel ever mutates arrays
  in place, fix that ownership contract rather than invalidating the cache manually.
- Plan 053 follows immediately to expose only the capabilities this plan proves are product-facing
  and to internalize/delete the residue.
