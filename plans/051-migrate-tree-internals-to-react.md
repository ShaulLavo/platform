# Plan 051: Migrate and further decompose the tree internals in React

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in the "STOP conditions"
> section occurs, stop and report — do not improvise. This repository deletes completed plans: once
> every done criterion is verified, delete this file and remove its row from `plans/README.md` in the
> same change.
>
> **Mandatory prerequisites — Plans 036 and 039 must be complete**: Plan 036 must first reconcile
> the copied package against Pierre upstream and leave `packages/tree/UPSTREAM.md`. Plan 039 must
> then complete its behavioral split. This plan is deliberately written against the pre-036/pre-039
> source at `b60c88de`, but it must execute against the reconciled post-039 shape. Do not infer
> completion from the presence or absence of `plans/039-filetreeview-controller-split.md`; completed
> plans are deleted. Before doing anything else, all four extracted files below must exist:
>
> ```bash
> test -f packages/tree/src/components/FileTreeRow.tsx
> test -f packages/tree/src/hooks/useFileTreeRowDom.ts
> test -f packages/tree/src/hooks/useFileTreeDrag.ts
> test -f packages/tree/src/hooks/useFileTreeContextMenu.ts
> ```
>
> Before those checks, `test -f packages/tree/UPSTREAM.md` must exit 0 and its last-audited upstream
> SHA must match completed Plan 036. Every command must exit 0. Also run Plan 039's final package and
> app gates. If the ledger or an extracted file is absent, those gates are red, or
> `FileTreeView.tsx` still owns the row/drag/context-menu clusters, stop and report
> `blocked: Plan 036/039 prerequisite is not complete`.
>
> **Expected prerequisite drift**: Plan 036 is expected to change upstream-reconciled tree behavior,
> tests, licensing, and provenance. Plan 039 then changes `FileTreeView.tsx` and creates the four
> files above. Run both checks:
>
> ```bash
> git diff --stat b60c88de..HEAD -- .oxlintrc.json package.json bun.lock packages/tree
> git diff --stat -- .oxlintrc.json package.json bun.lock packages/tree
> ```
>
> Reconcile the expected Plan 039 changes against the post-039 target described below. Any other
> committed or uncommitted overlap in `.oxlintrc.json`, the manifests, lockfile, tree runtime,
> React wrapper, or tree tests is a STOP condition until its owner reconciles it.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: Plan 036 complete; then Plan 039 complete, including its Steps 3–6 and final gates
- **Category**: migration
- **Planned at**: commit `b60c88de`, 2026-08-22

## Why this matters

The application consumes `@workspace/tree` through React, but the package mounts a second Preact
runtime inside the custom element's shadow root. That mixed-runtime boundary requires a beta Preact
dependency, Preact-specific compiler escape directives, and a package-wide exemption from every
React Compiler lint rule. It also makes event, ref, and update semantics easy to misread because the
public wrapper and internal view use different hook and JSX contracts.

After the upstream reconciliation and Plan 039's first decomposition, this plan moves the smaller
internal surface to the React 19 runtime already supplied by the package's peer dependencies. It
then extracts the remaining keyboard and focus/viewport coordination seams while React behavior is
protected by real-browser tests. Finally it removes the dead hydration API, gives each shadow-root
container one owned React root in the package's state layer, removes the broad lint exemption, and
preserves the tree's DOM, focus, drag, selection, rename, and composition behavior.

## Current state and post-039 target

### The boundary is isolated

At the authored-at SHA, only these source files import Preact directly:

```text
packages/tree/src/components/FileTreeView.tsx
packages/tree/src/components/Icon.tsx
packages/tree/src/components/OverflowText.tsx
packages/tree/src/components/RenameInput.tsx
packages/tree/src/utils/render/runtime.ts
```

Plan 039 is expected to add Preact imports or Preact JSX types to:

```text
packages/tree/src/components/FileTreeRow.tsx
packages/tree/src/hooks/useFileTreeRowDom.ts
packages/tree/src/hooks/useFileTreeDrag.ts
packages/tree/src/hooks/useFileTreeContextMenu.ts
```

Re-run this inventory after Plan 039 and treat its output as the complete migration list:

```bash
rg -l "from ['\"]preact|jsxImportSource preact|preact/hooks" packages/tree/src | sort
```

There must be no Preact source import outside `packages/tree`. If one has appeared elsewhere, stop;
do not remove the root catalog entry out from under another workspace.

The consumer boundary is already React and remains React:

- `packages/tree/src/components/FileTree.tsx` renders `<file-tree-container>` and calls the model from
  React effects.
- `packages/tree/src/hooks/useFileTree.ts` owns the stable `FileTree` model with React hooks.
- `packages/tree/src/components/FileTree.test.tsx` uses a React root in happy-dom.
- `packages/tree/src/components/FileTree.browser.tsx` uses a React root in Chromium.

Do not replace that wrapper or introduce a second public component API.

### The current renderer is stateless Preact; React roots are stateful

`packages/tree/src/utils/render/runtime.ts` currently contains:

```ts
import { h, hydrate, render } from 'preact'

export const fileTreeRenderer = {
  hydrateRoot: (element, props) => {
    hydrate(h(FileTreeView, props), element)
  },
  renderRoot: (element, props) => {
    render(h(FileTreeView, props), element)
  },
  unmountRoot: (element) => {
    render(null, element)
  },
}
```

`FileTree.render`, `setComposition`, `setGitStatus`, `setIcons`, and
`applyGitStatusPatch` may all render the same wrapper repeatedly. React must not call `createRoot`
again for an element that already owns a root. Module-level mutable state is forbidden under
`utils/`, so delete this runtime utility and create `packages/tree/src/state/renderer.ts`. The target
adapter owns a `WeakMap<HTMLElement, RootState>` where `RootState` holds the root and an optional
pending-unmount token:

- `state/renderer.ts` exports the existing `renderFileTreeRoot` and `unmountFileTreeRoot` function
  names so `FileTree.ts` needs only an import-path update.
- `renderFileTreeRoot` gets or creates one root and calls `root.render(createElement(FileTreeView,
props))`.
- `unmountFileTreeRoot` marks the entry pending and queues the actual `root.unmount()` in a
  microtask. The public React wrapper calls this during an outer React effect cleanup; a synchronous
  nested-root unmount there makes React 19 warn that it is already rendering.
- A render of the same element before that microtask cancels the pending unmount and reuses the
  root. Otherwise the microtask unmounts and deletes the still-current entry, so a later remount
  creates a fresh root.
- `hydrateRoot` and the exported `fileTreeRenderer` object have no repository call sites. Delete
  them; do not recreate an unused React hydration path.

Do not put `flushSync` in production runtime code. The only production consumers call the model
from React hooks/effects; forcing a nested root synchronously during a React commit can warn and is
not a valid lifecycle contract. DOM-facing tests must wait for the React commit with `vi.waitFor`.
If a new production caller now performs a same-stack DOM read after a model update, stop and report
it instead of guessing at timing.

### JSX events and DOM events are different boundaries

Preact JSX handlers generally expose native DOM event types. React JSX handlers expose synthetic
event types. During the migration:

- Type JSX callbacks with the exact React event type (`React.DragEvent`, `React.MouseEvent`,
  `React.PointerEvent`, `React.TouchEvent`, `React.KeyboardEvent`, `React.FormEvent`, and so on).
- Keep native DOM types for `window.addEventListener`, `document.addEventListener`, timers,
  `ResizeObserver`, and events manually constructed or received outside JSX.
- Alias React event imports when a file needs both contracts; do not globally replace native
  `DragEvent` or `TouchEvent` names.
- Use honest nullable React ref types. Do not add casts or copy containers to silence readonly or
  ref mismatches.

The DOM structure, data attributes, event propagation, focus order, slot behavior, and custom
element/shadow-root ownership are contracts. A runtime migration does not authorize changing them.

### The lint exemption becomes invalid after migration

`.oxlintrc.json` currently disables all 16 `oxc-react-compiler/*` rules for
`packages/tree/**`. Remove that whole override after every tree component and hook uses React.

The Preact components also carry `'use no memo'` directives solely to prevent the app's React
Compiler transform from emitting React hooks into Preact output. Remove those stale directives and
comments first, then run lint and address the actual React findings. A narrow `'use no memo'` may be
restored only on an exact component or hook that the compiler cannot safely transform without
changing its imperative behavior, and only with a nearby React-specific reason. Do not add a new
package/file override or an `eslint-disable`/`oxlint-disable` to manufacture a green result.

### Repository rules that shape this migration

- One render component per `.tsx` file and one hook per hook file.
- Import exact files through `@/` or `@workspace/tree/...`; do not add a barrel.
- Pure, non-React split functions belong in `utils/`; `utils/` must not import React, own mutable
  state, or import stateful modules. React-root ownership belongs in `state/`.
- Keep nesting at depth 3 or less. Use guard clauses and extraction; no nested ternaries and no
  `else` after an early return.
- Do not add `memo`, `useMemo`, or `useCallback` mechanically. Keep existing stable identities only
  where an effect/subscription or measured behavior requires them, and document the reason.
- Preserve the post-039 extraction boundaries. Runtime migration is not permission to fold the row,
  drag, context-menu, or DOM-ref hook back into `FileTreeView.tsx`.

`OverflowText.tsx` currently contains six render components plus pure string-splitting helpers.
Because this plan must edit it, bring it into compliance while its behavior is still protected by
Preact tests: one component per file, exact imports, and pure split functions in
`utils/render/overflowTextSplit.ts`.

### Plan 039 intentionally leaves two large seams for this plan

Plan 039 targets a post-split `FileTreeView.tsx` of roughly 1,800–2,200 lines and explicitly defers
keyboard navigation until its sticky-focus and context-menu hooks exist. That dependency is resolved
by the time this plan starts. The remaining two cohesive clusters are:

- `handleTreeKeyDown`: menu escape/blocking, IME-safe rename keys, F2, search keys, sticky-row focus
  preservation, selection modifiers, directional navigation, and controller invalidation.
- The DOM focus/scroll synchronization effect: controller scroll requests, search-close restoration,
  sticky/pointer suppression, canonical row focus, and settlement of the sticky-keyboard machine.

After the React cutover, extract these into `useFileTreeKeyboard.ts` and
`useFileTreeFocusSync.ts`. Do not split `FileTreeController` here: it is runtime-neutral, its search,
rename, selection, and projection state cross one another, and upstream reconciliation already
touches its behavior. A controller decomposition needs its own caller-driven plan and measurements,
not opportunistic movement during a view-runtime migration.

## Commands you will need

| Purpose               | Command                                                                                     | Expected on success                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Tree typecheck        | `(cd packages/tree && bun run typecheck)`                                                   | exit 0                                                                               |
| Tree lint             | `(cd packages/tree && bun run lint)`                                                        | no new errors or warnings versus Step 0; after Step 5, no React Compiler diagnostics |
| Tree format           | `(cd packages/tree && bun run format:check)`                                                | exit 0                                                                               |
| Tree node + DOM tests | `(cd packages/tree && bun run test)`                                                        | every baseline test still passes, plus the new tests                                 |
| Tree browser tests    | `(cd packages/tree && bun run test:browser)`                                                | every baseline browser test still passes                                             |
| Web typecheck         | `(cd apps/web && bun run typecheck)`                                                        | exit 0                                                                               |
| Web file-tree tests   | `(cd apps/web && bun --bun vitest run --project node --project dom src/features/workspace)` | every baseline file-tree test still passes                                           |
| Lockfile refresh      | `bun install --lockfile-only`                                                               | exit 0; only intended dependency graph changes                                       |
| Lockfile validation   | `bun install --frozen-lockfile`                                                             | exit 0 with no lockfile rewrite                                                      |

Never use the root `bun run verify` as this plan's gate. It short-circuits across unrelated dirty
workspaces. Capture and compare the scoped baselines below.

## Suggested executor toolkit

- Read and apply `/Users/shaul/.agents/skills/never-nester/SKILL.md` before editing code.
- Use `vercel-react-best-practices` for direct imports, stable subscriptions, effect dependency
  choices, and avoiding inline component definitions. Repository rules against speculative manual
  memoization take precedence.

## Scope

**In scope** (the only source/config files that may change):

- `.oxlintrc.json`
- `package.json`
- `bun.lock`
- `packages/tree/package.json`
- `packages/tree/src/components/FileTree.tsx` — only if React Compiler diagnostics require a local fix
- `packages/tree/src/components/FileTreeView.tsx`
- `packages/tree/src/components/FileTreeRow.tsx` — expected from Plan 039
- `packages/tree/src/components/Icon.tsx`
- `packages/tree/src/components/OverflowText.tsx`
- `packages/tree/src/components/OverflowContent.tsx` (create)
- `packages/tree/src/components/OverflowMarker.tsx` (create)
- `packages/tree/src/components/Truncate.tsx` (create)
- `packages/tree/src/components/Fruncate.tsx` (create)
- `packages/tree/src/components/MiddleTruncate.tsx` (create)
- `packages/tree/src/components/RenameInput.tsx`
- `packages/tree/src/hooks/useFileTree.ts` — only if React Compiler diagnostics require a local fix
- `packages/tree/src/hooks/useFileTreeRowDom.ts` — expected from Plan 039
- `packages/tree/src/hooks/useFileTreeDrag.ts` — expected from Plan 039
- `packages/tree/src/hooks/useFileTreeContextMenu.ts` — expected from Plan 039
- `packages/tree/src/hooks/useFileTreeFocusSync.ts` (create)
- `packages/tree/src/hooks/useFileTreeKeyboard.ts` (create)
- `packages/tree/src/state/renderer.ts` (create)
- `packages/tree/src/utils/render/keyboard.ts` (create)
- `packages/tree/src/utils/render/overflowTextSplit.ts` (create)
- `packages/tree/src/utils/render/runtime.ts` (delete)
- `packages/tree/src/utils/tests/keyboard.test.ts` (create)
- `packages/tree/src/utils/tests/overflowTextSplit.test.ts` (modify; created by Plan 036)
- `packages/tree/src/components/FileTree.test.tsx`
- `packages/tree/src/components/FileTree.browser.tsx`
- `packages/tree/src/utils/render/FileTree.ts` — import path only
- `plans/051-migrate-tree-internals-to-react.md` and `plans/README.md` — completion cleanup only

If the post-039 Preact inventory includes another new component or hook under `packages/tree/src`,
add that exact file to the migration only after confirming it was created by Plan 039. Any other
scope expansion is a STOP condition.

**Out of scope** (do not touch):

- `packages/tree/src/utils/model/**`, including `FileTreeController` and `FileTreeViewProps`.
- Any change to `packages/tree/src/utils/render/FileTree.ts` beyond replacing the old runtime import
  with `@workspace/tree/state/renderer`; its public imperative API and function calls stay unchanged.
- Tree CSS, DOM/data-attribute names, custom-element tags, shadow-root structure, density, scrolling,
  focus, selection, drag/drop, rename, context-menu, or keyboard behavior.
- Recombining or redesigning any extraction completed by Plan 039.
- App source under `apps/web`; it is a verification consumer, not migration scope.
- Wiring the dormant high-level tree capabilities into the app. Plan 052 does that against the
  settled React model.
- General package API pruning, wildcard-export removal, or consumer import consolidation. Plan 053
  performs that cleanup after Plan 052 establishes the real consumer surface.
- The linked Editor repository.
- SSR or hydration support. There is no current hydration caller; deleting dead code is intentional.
- New settings, compatibility aliases, barrel files, or a Preact compatibility layer.

## Git workflow

- Use the current worktree. Do not create a branch or worktree unless the operator asks.
- Preserve all unrelated dirty changes captured in Step 0.
- Do not commit, push, or open a PR unless the operator asks.

## Steps

### Step 0: Prove the post-039 starting point and capture scoped baselines

Run the mandatory prerequisite and drift checks at the top of this plan. Then capture the exact
starting state and command results:

```bash
git status --porcelain > /tmp/plan-051-status-before.txt
test -f packages/tree/UPSTREAM.md
rg -n "last audited upstream SHA" packages/tree/UPSTREAM.md
rg -l "from ['\"]preact|jsxImportSource preact|preact/hooks" packages/tree/src | sort \
  > /tmp/plan-051-preact-files-before.txt
wc -l packages/tree/src/components/FileTreeView.tsx > /tmp/plan-051-filetreeview-lines-before.txt
(cd packages/tree && bun run typecheck) > /tmp/plan-051-tree-typecheck-before.txt 2>&1
(cd packages/tree && bun run lint) > /tmp/plan-051-tree-lint-before.txt 2>&1
(cd packages/tree && bun run test) > /tmp/plan-051-tree-test-before.txt 2>&1
(cd packages/tree && bun run test:browser) > /tmp/plan-051-tree-browser-before.txt 2>&1
(cd apps/web && bun run typecheck) > /tmp/plan-051-web-typecheck-before.txt 2>&1
(cd apps/web && bun --bun vitest run --project node --project dom src/features/workspace) \
  > /tmp/plan-051-web-tree-before.txt 2>&1
```

Every command must exit 0 except for warnings already recorded by tree lint. Record test files,
tests, and lint warnings from these logs as deltas; never copy historical absolute counts from Plan
039 or another machine.

Verify the assumptions that make dependency and API removal safe:

```bash
rg -n "from ['\"]preact|jsxImportSource preact|preact/hooks" apps packages \
  | rg -v '^packages/tree/'
rg -n "hydrateRoot|fileTreeRenderer" packages/tree/src \
  | rg -v '^packages/tree/src/utils/render/runtime.ts:'
rg -n '"preact"\s*:' package.json packages/*/package.json apps/*/package.json
```

Expected: the first two commands print nothing. The manifest search prints only the root catalog
entry and `packages/tree/package.json`. If not, stop before editing.

### Step 1: Characterize runtime and remaining large-view seams while Preact is still active

Extend `packages/tree/src/components/FileTree.test.tsx` using its existing real React root and real
`FileTree` model; do not mock `runtime.ts`, React DOM, or package modules. Add coverage for:

1. Rendering the same model into the same host more than once updates the existing tree and does not
   emit a duplicate-root, invalid-hook, or nested-update warning.
2. `model.unmount()` clears the owned render tree after the queued React cleanup; rendering the same
   model into the host again, both before and after that microtask, produces a working tree with no
   stale rows, handlers, duplicate root, or unmounted-root render.
3. `setComposition`, `setGitStatus`, and `setIcons` still update the mounted shadow DOM after the
   renderer commits. Reuse the existing setter tests rather than creating mock props.
4. Mounting through `<FileTree>` and cleaning it up emits no React `console.error`/`console.warn`.
5. The keyboard branch order: open-menu Escape/blocking, Plan 036's IME-safe rename Enter/Escape,
   F2 rename, close/retain search behavior, Shift/Ctrl/Meta selection, Home/End, arrows, and
   left/right directory behavior.
6. Sticky keyboard focus across ArrowUp/ArrowDown, collapse, and Shift+F10/context-menu open/close,
   including preserved scroll position and focus restoration to the canonical row.
7. Focus/viewport synchronization for controller scroll requests, search-close restoration,
   pointer selection without scroll jumps, and unmounted/parked focused rows.

Use `vi.waitFor` for DOM observations. Do not assert Preact's same-stack rendering accident and do
not wrap model methods in `flushSync`; `flushSync` remains appropriate only for the outer test root's
explicit render/unmount calls.

**Verify**:

```bash
(cd packages/tree && bun run test)
(cd packages/tree && bun run test:browser)
```

Expected: every Step 0 test still passes and the new lifecycle, keyboard, and focus cases pass under
Preact. These are the behavior gates for the Step 4 decomposition; do not postpone them until after
the extraction.

### Step 2: Split OverflowText by component while preserving the Preact runtime

Do this structural move before the runtime cutover so behavior can be verified independently.

1. Keep only the `OverflowText` render component and its prop contract in
   `components/OverflowText.tsx`.
2. Move `OverflowContent`, `OverflowMarker`, `Truncate`, `Fruncate`, and `MiddleTruncate` into the
   same-named component files listed in Scope. Each file renders exactly one component.
3. Move `splitCenter`, `splitExtension`, `splitLeafPath`, `splitByIndex`, `splitLast`, `splitFirst`,
   and their non-React input/result types into `utils/render/overflowTextSplit.ts`. That utility must
   be pure and must not import React or Preact.
4. Update `FileTreeView.tsx` and post-039 `FileTreeRow.tsx` to import `Truncate` and
   `MiddleTruncate` from their exact files. Do not add a re-export barrel or compatibility exports
   to `OverflowText.tsx`; repository search shows no other consumer.
5. Preserve markup, keys, attributes, marker behavior, empty-string behavior, and every split rule.
   Flatten the existing nested ternaries and `else` branches with named helpers and guard clauses.
6. Extend Plan 036's `utils/tests/overflowTextSplit.test.ts` for leaf path, explicit index,
   first/last offset, and invalid offset fallback. Preserve its upstream whitespace cases and update
   its import to `utils/render/overflowTextSplit.ts`.

All component files remain Preact through the end of this step. This is temporary and keeps one
runtime active between verification gates.

**Verify**:

```bash
(cd packages/tree && bun run typecheck)
(cd packages/tree && bun run format:check)
(cd packages/tree && bun run test)
(cd packages/tree && bun run test:browser)
```

Expected: exit 0; no baseline test regresses; the new pure split tests pass.

### Step 3: Cut the complete internal renderer over to React atomically

Convert every file in `/tmp/plan-051-preact-files-before.txt`, plus the component files created in
Step 2, in one step. Do not leave a Preact parent rendering React elements or a React parent rendering
Preact elements between gates.

For each component and post-039 hook:

1. Replace the Preact JSX pragma/imports/hooks with React 19 equivalents. Follow the existing
   `components/FileTree.tsx` convention for JSX and type imports.
2. Replace `ComponentChildren` with `ReactNode`, Preact `JSX` types with React JSX/element types, and
   Preact refs with honest nullable React refs.
3. Audit each event at its boundary using the JSX-versus-DOM rules in Current state. In particular,
   make `RenameInput.onInput` a typed React form/input event and update its caller without a cast.
4. Preserve effect bodies, effect ordering, dependency semantics, state transitions, ref ownership,
   DOM, attributes, event propagation, and post-039 component/hook boundaries. Do not perform a
   second behavioral refactor during type conversion.
5. Remove every Preact-specific comment and `'use no memo'` explanation. Compiler decisions happen
   in Step 5, after the runtime is genuinely React and the remaining large seams are extracted.

Replace `utils/render/runtime.ts` with `state/renderer.ts`:

1. Import `createElement` from React and `createRoot`/`Root` from `react-dom/client`.
2. Own roots in a module-local `WeakMap<HTMLElement, RootState>`.
3. Reuse the root on repeated `renderFileTreeRoot` calls. If an unmount microtask is pending for the
   same element, cancel it before rendering.
4. In `unmountFileTreeRoot`, mark the current entry with a unique token and queue a microtask. The
   microtask may unmount and delete only when the map still contains that same entry and token. A
   missing root is a safe no-op.
5. Export `renderFileTreeRoot` and `unmountFileTreeRoot` directly. Delete the unused `hydrateRoot`
   member, `fileTreeRenderer` object, and old `utils/render/runtime.ts` file.
6. Add the exact `./state/*` package export in `packages/tree/package.json`, then change only the
   import path in `utils/render/FileTree.ts` to `@workspace/tree/state/renderer`.
7. Do not use `flushSync`, a module-global single root, or a fallback Preact path.

**Verify**:

```bash
rg -n "from ['\"]preact|jsxImportSource preact|preact/hooks" packages/tree/src
(cd packages/tree && bun run typecheck)
(cd packages/tree && bun run test)
(cd packages/tree && bun run test:browser)
```

Expected: the Preact search prints nothing; every command exits 0; all Step 0 and new tests pass;
the console-warning assertions stay green.

### Step 4: Extract the remaining keyboard and focus-sync seams from FileTreeView

This is a behavior-preserving React refactor protected by Step 1. Execute the focus coordinator
before the keyboard hook because keyboard navigation writes the sticky/search/pointer focus machine.

#### 4a. Move pure keyboard classification out of the component

Create `utils/render/keyboard.ts` and move the pure key/event classifiers still owned by
`FileTreeView.tsx`, including the equivalents of `isSpaceSelectionKey`, `isSearchOpenSeedKey`,
`isContextMenuOpenKey`, `canKeyUseStickyKeyboardState`, and the blocked context-menu key set. Use a
minimal readonly event-like input type so node tests do not construct React synthetic events. Keep
model/DOM actions out of this utility.

Create `utils/tests/keyboard.test.ts` with a table for Space variants, printable search seeds,
modifier exclusions, ContextMenu/Shift+F10, sticky-eligible arrows/menu keys, and blocked menu
navigation. Preserve the IME policy applied by Plan 036 in the hook branch, not this classifier.

**Verify**:

```bash
(cd packages/tree && bun run test -- src/utils/tests/keyboard.test.ts)
(cd packages/tree && bun run typecheck)
```

#### 4b. Extract one focus/viewport synchronization hook

Create `hooks/useFileTreeFocusSync.ts`. It owns the component-lifetime coordination currently spread
across these post-039 equivalents:

- DOM focus ownership and previous focused path;
- pending canonical sticky focus and the `StickyKeyboardFocusMode` ref;
- pointer-focus scroll suppression;
- search-close focus/viewport restoration;
- processed controller scroll-request id;
- the long layout effect that restores offsets/scrollTop, calls `updateViewport`, focuses the
  canonical row, and settles the sticky-keyboard state.

The hook accepts one named options object containing `FileTreeController`, Plan 039's
`FileTreeRowDom`, current focus/search/rename/layout values, scroll request, and the viewport update
action. It returns a narrow `FileTreeFocusCoordinator` of domain actions/predicates—not raw refs or
state setters. Use names equivalent to:

- `claimDomFocus` / `releaseDomFocus` / `ownsDomFocus`;
- `preserveStickyAtScrollTop` / `restoreStickyAtViewportOffset`;
- `requestCanonicalStickyReveal`;
- `suppressNextPointerFocusScroll`;
- `requestSearchCloseFocusRestore` / `cancelSearchCloseFocusRestore` /
  `shouldRestoreSearchCloseFocus`.

Replace every direct read/write of the moved refs in `FileTreeView`, the context-menu hook call,
row-click wiring, and later keyboard wiring with these named actions. Stable callback identity is
allowed only where an effect or subscription requires it; add a short reason. Do not return a broad
mutable ref bag, merge/reorder effects, change dependency semantics, or move the initial viewport
measurement/subscription effect—it is a different cluster.

**Verify**:

```bash
rg -n "domFocusOwnerRef|previousFocusedPathRef|restoreTreeFocusAfterSearchCloseRef|restoreTreeFocusViewportOffsetRef|processedScrollRequestIdRef|pointerFocusScrollPathRef|pendingStickyFocusPathRef|stickyKeyboardFocusRef" packages/tree/src/components/FileTreeView.tsx
(cd packages/tree && bun run typecheck)
(cd packages/tree && bun run lint)
(cd packages/tree && bun run test)
(cd packages/tree && bun run test:browser)
```

Expected: the ref search prints nothing; no baseline warning/test regresses.

#### 4c. Extract keyboard navigation after focus/context seams exist

Create `hooks/useFileTreeKeyboard.ts` and move `handleTreeKeyDown` in branch order, not by rewriting
it as a new state machine. The hook accepts a named options object containing the controller,
Plan 039 DOM refs, Plan 039 context-menu state/actions, the Step 4b focus coordinator, rename/search
policy and current render values. It returns one React `KeyboardEventHandler<HTMLDivElement>`.

Preserve this order exactly: open context menu; active rename including Plan 036 IME guard; F2;
active search and close/retain policy; printable search seed; sticky-row synchronization; modified
selection; keyboard context menu; directional/home/end navigation; focus settlement/invalidation.
Extract internal named helpers to keep nesting depth ≤3. Do not expose `setState`, reconstruct
context-menu logic, read a broad view-state blob, or change which handled events prevent default and
stop propagation.

**Verify**:

```bash
rg -n "handleTreeKeyDown" packages/tree/src/components/FileTreeView.tsx
rg -n "handleTreeKeyDown" packages/tree/src/hooks/useFileTreeKeyboard.ts
(cd packages/tree && bun run typecheck)
(cd packages/tree && bun run lint)
(cd packages/tree && bun run test)
(cd packages/tree && bun run test:browser)
```

Expected: the first search prints nothing, the second finds the hook implementation, and all gates
match baseline.

#### 4d. Prove this was decomposition rather than relocation

```bash
before_lines=$(awk '{print $1}' /tmp/plan-051-filetreeview-lines-before.txt)
after_lines=$(wc -l < packages/tree/src/components/FileTreeView.tsx)
test "$after_lines" -le "$((before_lines - 300))"
test "$(wc -l < packages/tree/src/hooks/useFileTreeFocusSync.ts)" -lt 500
test "$(wc -l < packages/tree/src/hooks/useFileTreeKeyboard.ts)" -lt 500
```

Expected: `FileTreeView.tsx` is at least 300 lines below the post-039 baseline and neither new hook
is another 500-line monolith. Do not hit these gates by moving JSX into a giant props frame, deleting
comments/tests, combining statements, or pushing logic into an unrelated file. If the real seam
cannot satisfy the structural gates, stop and report the measured counts and coupling.

### Step 5: Remove the package-wide compiler exemption and resolve real React findings

Delete the entire `packages/tree/**` override from `.oxlintrc.json`. Run tree lint and resolve every
new `oxc-react-compiler/*`, hooks, and React diagnostic in the in-scope component/hook files.

Rules for resolving findings:

- Preserve post-039 effect and subscription semantics. Narrow dependencies only when the value read
  by the effect is genuinely narrower; do not delete a dependency to silence lint.
- Do not add speculative `memo`, `useMemo`, or `useCallback`. Existing stable identities may remain
  where effects, subscriptions, or model composition require them.
- Prefer guard clauses and named extraction over new nesting or nested ternaries.
- A function-local `'use no memo'` is a last-resort correctness boundary, not a migration shortcut.
  If one remains, add a nearby explanation of the exact imperative/ref behavior the compiler cannot
  transform. `oxc-react-compiler/no-unused-directives` must accept it.
- Never restore a package/file override and never add disable comments.

Compare the complete lint output to `/tmp/plan-051-tree-lint-before.txt`. Existing unrelated warnings
may remain unchanged; this plan introduces no new error or warning.

**Verify**:

```bash
rg -n '"files": \["packages/tree/\*\*"\]' .oxlintrc.json
rg -n "use no memo|oxlint-disable|eslint-disable" packages/tree/src/components packages/tree/src/hooks
(cd packages/tree && bun run lint)
(cd packages/tree && bun run typecheck)
(cd packages/tree && bun run test)
```

Expected: the override search prints nothing. The directive search prints nothing or only narrowly
documented function-local directives accepted by lint. Lint has no React Compiler diagnostics and
no new warnings versus baseline; typecheck and tests exit 0.

### Step 6: Remove the direct Preact dependency and refresh the Bun lockfile

Only after the source search is empty:

1. Remove `preact` from `packages/tree/package.json` dependencies.
2. Remove the now-unused `preact` entry from the root workspace catalog.
3. Keep React and React DOM as the package's existing peer dependencies and development
   dependencies. Do not add duplicate regular dependencies.
4. Run `bun install --lockfile-only`, inspect `bun.lock`, then run `bun install --frozen-lockfile`.

`@preact/signals-core` may remain transitively for another dependency. Do not gate this plan on the
raw substring `preact` disappearing from the lockfile; gate it on the direct `preact` package,
workspace dependency, catalog entry, and source imports disappearing.

**Verify**:

```bash
rg -n '"preact"\s*:' package.json packages/*/package.json apps/*/package.json
rg -n "from ['\"]preact|jsxImportSource preact|preact/hooks" apps packages
bun install --frozen-lockfile
```

Expected: both searches print nothing and the frozen install exits 0 without changing `bun.lock`.

### Step 7: Run the complete scoped gates and clean up the plan

Run all final checks from the repository root:

```bash
(cd packages/tree && bun run typecheck)
(cd packages/tree && bun run lint)
(cd packages/tree && bun run format:check)
(cd packages/tree && bun run test)
(cd packages/tree && bun run test:browser)
(cd apps/web && bun run typecheck)
(cd apps/web && bun --bun vitest run --project node --project dom src/features/workspace)
git diff --check
git status --short
```

Compare results to every Step 0 snapshot. No previously passing scoped test may fail, and no new
lint warning may appear. Inspect `git status` against `/tmp/plan-051-status-before.txt`; preserve
pre-existing unrelated work and verify that every newly changed file is listed in Scope.

After every done criterion holds, refresh Plan 052's prerequisite/drift inventory against the final
React shape, then delete this plan and remove its row from `plans/README.md`. Do not leave a
completed-plan ledger.

## Test plan

- `packages/tree/src/components/FileTree.test.tsx`
  - repeated render reuses one root without warnings;
  - unmount then remount creates a clean working root;
  - composition, git status, and icon updates commit through the React runtime;
  - the public React wrapper produces no duplicate-root, invalid-hook, nested-update, or unmounted-
    root warning.
- `packages/tree/src/utils/tests/overflowTextSplit.test.ts`
  - every named split strategy;
  - short inputs and invalid offsets;
  - extension and leaf-path fallback thresholds;
  - explicit split indices.
- `packages/tree/src/utils/tests/keyboard.test.ts`
  - pure key classification for search, selection, menu, and sticky navigation.
- `packages/tree/src/components/FileTree.browser.tsx`
  - runtime lifecycle plus keyboard branch order, IME rename, close/retain search, sticky navigation,
    context-menu focus restoration, controller scroll requests, parked rows, and pointer selection
    without scroll jumps.
- `apps/web/src/features/workspace/tests/tree-pane.test.ts`
  - unchanged consumer suite proves workspace integration; do not edit app tests to accept a
    migration regression.

All totals are compared to the Step 0 snapshots. Do not encode absolute test counts.

## Done criteria

ALL must hold:

- [ ] Plan 036's upstream ledger exists at its final audited SHA, then Plan 039's four extracted
      files exist and its final package/app gates pass.
- [ ] `rg -n "from ['\"]preact|jsxImportSource preact|preact/hooks" apps packages` prints nothing.
- [ ] No manifest has a direct `preact` dependency or catalog entry; the frozen lockfile install is
      clean. A transitive `@preact/signals-core` entry is allowed.
- [ ] `state/renderer.ts` owns exactly one React root per mounted wrapper, reuses it, safely cancels
      a same-turn pending unmount, and deletes it after queued cleanup; the stateful utility runtime
      and dead hydration support are gone.
- [ ] The package-wide `packages/tree/**` React Compiler override is gone.
- [ ] Tree lint reports no React Compiler diagnostics and no new warning versus Step 0.
- [ ] Every remaining `'use no memo'` is function-local, accepted by lint, and explains an exact
      React correctness boundary; no disable comment was added.
- [ ] Overflow text has one render component per file, exact imports, and pure split logic under
      `utils/render/` with node tests.
- [ ] Keyboard classification is pure/tested; keyboard navigation lives only in
      `useFileTreeKeyboard.ts`; focus/viewport settlement lives in `useFileTreeFocusSync.ts` behind
      named actions rather than raw ref/setter bags.
- [ ] `FileTreeView.tsx` is at least 300 lines below its post-039 Step 0 baseline and neither new hook
      reaches 500 lines.
- [ ] React JSX events and native DOM events are typed at their actual boundaries without blanket
      casts.
- [ ] Tree typecheck, format check, node/DOM tests, and browser tests all pass with no baseline
      regression.
- [ ] Web typecheck and focused workspace tests all pass with no baseline regression.
- [ ] `git diff --check` passes and no out-of-scope or unrelated dirty file was overwritten.
- [ ] This completed plan file and its `plans/README.md` row are deleted.

## STOP conditions

Stop and report back; do not improvise if:

- Plan 036's ledger/audited SHA or Plan 039's extracted files/final behavior gates are missing/red.
- The post-039 Preact inventory contains a file outside the expected tree component/hook surface.
- Another workspace now imports or directly depends on Preact.
- `hydrateRoot` or `fileTreeRenderer` has gained a real caller.
- An in-scope file has active changes not attributable to completed Plan 039 or this plan.
- Preserving current production behavior appears to require `flushSync` inside a React lifecycle,
  changing `FileTree`'s public API, or changing `utils/render/FileTree.ts` beyond its renderer import
  path.
- React event conversion changes propagation, focus, drag/touch ordering, rename handoff, row
  identity, DOM structure, data attributes, or shadow-root ownership.
- React Compiler lint can only be made green with a package/file override, disable comment, or a
  broad semantic refactor of the tree.
- The keyboard/focus extraction requires merging/reordering effects, exposing raw state setters/ref
  bags, changing controller behavior, or moving unrelated virtualization/render JSX to hit a size
  gate.
- A verification gate fails twice after one reasonable, in-scope correction.
- Completion requires any source/config file outside Scope.

## Maintenance notes

- `state/renderer.ts` is the sole React-root owner for the imperative model. Any future mount path
  must use it and must pair root creation with the token-checked, queued `unmountFileTreeRoot`
  cleanup. Do not simplify that cleanup to synchronous `root.unmount()` inside the outer React
  lifecycle, and do not move its mutable map back under `utils/`.
- DOM observation after model updates follows React commit timing. Tests and consumers should await
  observable state; do not reintroduce production `flushSync` to recover Preact's incidental timing.
- Keep React JSX event types separate from native document/window event types, especially in drag
  and touch hooks.
- Do not restore Preact, a compatibility alias, or a package-wide React Compiler exemption. If an
  exact function is temporarily compiler-incompatible, use the narrow documented directive policy
  from Step 5.
- Future Pierre upstream reviews start from `packages/tree/UPSTREAM.md` and translate behavior into
  these React seams; do not compare/copy whole same-named files after the migration.
- Plan 052 owns product wiring and Plan 053 owns the root-entry/dead-export sweep. Do not broaden or
  prune the public surface opportunistically during this runtime migration.
- Reviewers should scrutinize root reuse/unmount, console warnings, event boundaries, focus and
  pointer behavior, and any remaining compiler opt-out before approving the migration.
