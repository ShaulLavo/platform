# Plan 039: Split FileTreeView and FileTreeController along their real seams

> **GATE NOTE (fresh-context review, 2026-08-16; resolved)**: a cold review
> flagged that `plans/014-tree-path-store-characterization-tests.md` did not
> exist. **It now does.** This plan is still hard-gated on 014 being executed and
> marked `DONE` — not merely written. Step 0a checks for the file; you must also
> confirm 014's row in `plans/README.md` reads `DONE` and that
> `cd packages/tree && bun run test` is green with 014's suite present. If 014 is
> still `TODO`, report **"blocked: plan 014 not executed"** and stop — do not
> start this refactor against the 9-test baseline. Everything else in this plan
> was checked against the live code at `ace313f`; the line numbers, greps and
> expected command outputs below are the corrected ones.

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
> git diff --stat ace313f..HEAD -- packages/tree/src/components packages/tree/src/hooks packages/tree/src/utils/model/FileTreeController.ts packages/tree/src/utils/render packages/tree/src/utils/tests
> ```
>
> The working tree is **not** clean at `ace313f`, so also run
> `git diff --stat -- packages/tree` to see uncommitted drift the SHA range
> misses. It should be empty; anything there is someone else's in-flight work.
>
> Files in this list are _expected_ to have changed if plan 022 has already run
> (it deletes `hooks/useFileTreeSearch.ts`, `hooks/useFileTreeSelector.ts`, and
> a 45-line debug effect from `FileTreeView.tsx`). Any change beyond what plans
> 014 and 022 describe: compare the "Current state" excerpts below against the
> live code before proceeding, and on a mismatch treat it as a STOP condition.
>
> **This plan is HIGH risk and its steps are not independent.** Every step ends
> with the full `packages/tree` suite plus the `apps/web` file-tree suite. Do
> not batch two steps and verify once. Do not proceed past a red gate.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: `plans/014-tree-path-store-characterization-tests.md` (**MANDATORY** — see Step 0), then `plans/022-delete-unreachable-code.md`
- **Category**: complexity
- **Planned at**: commit `ace313f`, 2026-08-16

## Why this matters

`packages/tree/src/components/FileTreeView.tsx` is **3,555 lines in one function
scope**: 45 `useRef` declarations, 13 `useLayoutEffect` calls, 10 `useState`
declarations, and five independent concerns (row rendering, keyboard navigation, drag/touch,
sticky-focus preservation, context menu) all mutating the same refs across the
same effects. An audit of this repository found it is the **only file in the
codebase that violates the nesting rule in `AGENTS.md`**, and the whole package
has 9 test cases over 20K lines (7 in the `node`+`dom` projects, 2 in `browser`).
Every bug fix here is a guess with a 3,555-line blast radius.

The file carries its own TODO proposing a split. **That TODO is wrong and this
plan deliberately contradicts it** — see "The TODO is wrong" below. This plan
closes the audit's complexity item for `packages/tree` by extracting the
clusters in _coupling_ order, so each extraction takes one parameter instead of
twelve.

## The TODO is wrong — read this before you plan your own order

`packages/tree/src/components/FileTreeView.tsx:3-4`:

```ts
// TODO: split this up — at 3545 lines this component is far too large and should
// be broken into focused pieces (rows, keyboard nav, drag, sticky focus, rename).
```

Measured against the file, that list is wrong in **both** directions:

- **`rename` is already extracted.** `components/RenameInput.tsx` and
  `utils/render/renameHandoff.ts` exist; what remains inside `FileTreeView.tsx`
  is a handful of lines around `renameInputRef`. Following the TODO would spend
  the effort on the smallest cluster.
- **The two largest clusters are missing from it.** Drag/touch (~600 lines) and
  the context menu (~500 lines) are not named at all.
- **`keyboard nav` is named but is deliberately NOT extracted here.**
  `handleTreeKeyDown` (`FileTreeView.tsx:1948`) and the ~260 lines it dispatches
  through (`:1948-2210`) read and write _both_ the sticky-focus machine (Step 2)
  and the context-menu state (Step 5). It can only be extracted cleanly after
  both land. Extracting it in this plan is **out of scope** — see the Scope
  section. Do not add a "Step 8" for it.

**Execute in the order in this plan, which is coupling order, not TODO order.**
The sticky-focus refs and the DOM refs are read by _every_ other cluster, so
they must be normalised first — otherwise the drag and context-menu hooks each
end up with a dozen ref parameters and the refactor makes the file worse.

## Current state

### Files

- `packages/tree/src/components/FileTreeView.tsx` — 3,555 lines. The Preact
  component that renders the whole tree. Everything this plan splits lives here.
- `packages/tree/src/utils/model/FileTreeController.ts` — 2,014 lines. The model
  the view drives. This plan touches exactly 3 lines of it (Step 1).
- `packages/tree/src/utils/render/focusHelpers.ts` — the exemplar for extracted
  pure DOM helpers. Match its shape when you create new `utils/render/*` files.
- `packages/tree/src/utils/tests/controller.test.ts` — the exemplar for new node
  tests. Match its `describe`/`it` shape.
- `packages/tree/src/components/FileTree.test.tsx` — dom-project tests.
  `controller.test.ts` + this file are the 7 cases the `test` script runs.
- `packages/tree/src/components/FileTree.browser.tsx` — browser-project tests
  (2 cases), run only by `test:browser`.
- `apps/web/src/components/workspace/file-tree/` — the app's consumer. Its tests
  (`tests/tree-pane.test.ts`) drive `FileTree` from `@workspace/tree` and are a
  second gate for this work.

### This is Preact, not React — do not "fix" the lint config

`FileTreeView.tsx:5-7`:

```ts
// NOTE: oxc-react-compiler/* rules are turned off for packages/tree in
// .oxlintrc.json because this package is Preact, not React — the React Compiler
// never runs here, so its immutability/refs diagnostics are not real constraints.
```

`.oxlintrc.json:26-48` turns off all 16 `oxc-react-compiler/*` rules for
`packages/tree/**`. **This is deliberate and correct. Do not remove that
override, do not re-enable those rules, and do not report it as a problem.** The
component and every hook you create import from `preact/hooks`, not `react`.
(`packages/tree/src/hooks/useFileTree.ts` _does_ import from `react` — that is
the React wrapper for app consumers, a different thing. Leave it alone.)

`FileTreeView.tsx:1140` also carries `'use no memo'` at the top of the component
body. Keep it.

### Cluster 1 — the sticky-keyboard 3-mode machine (Step 2)

`FileTreeView.tsx:1198-1230`, verbatim:

```ts
const pendingStickyFocusPathRef = useRef<string | null>(null)
const pendingStickyKeyboardFocusPathRef = useRef<string | null>(null)
const pendingStickyKeyboardViewportOffsetRef = useRef<{
  path: string
  viewportOffset: number
} | null>(null)
const pendingStickyKeyboardScrollTopRef = useRef<{
  path: string
  scrollTop: number
} | null>(null)
const pointerFocusScrollPathRef = useRef<string | null>(null)
const debugContextMenuTriggerPathRef = useRef<string | null>(null)
const debugDisableScrollSuppressionRef = useRef(false)

// Keep the coupled sticky-keyboard refs moving together so each transition
// leaves exactly one preservation mode active.
const clearPendingStickyKeyboardState = (): void => {
  pendingStickyKeyboardFocusPathRef.current = null
  pendingStickyKeyboardViewportOffsetRef.current = null
  pendingStickyKeyboardScrollTopRef.current = null
}

const preserveStickyKeyboardFocusAtScrollTop = (path: string, scrollTop: number | null): void => {
  pendingStickyKeyboardFocusPathRef.current = path
  pendingStickyKeyboardViewportOffsetRef.current = null
  pendingStickyKeyboardScrollTopRef.current = scrollTop == null ? null : { path, scrollTop }
}

const restoreStickyKeyboardViewportOffset = (path: string, viewportOffset: number): void => {
  pendingStickyKeyboardFocusPathRef.current = null
  pendingStickyKeyboardViewportOffsetRef.current = { path, viewportOffset }
  pendingStickyKeyboardScrollTopRef.current = null
}
```

The comment says it outright: three refs, three transitions, "exactly one
preservation mode active". **That is a reducer wearing three refs.**

Complete list of every read and write of those three `Keyboard` refs — verified
by `grep`, there are no others:

| Line(s)          | What                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| 1214–1218        | `clearPendingStickyKeyboardState` (definition)                                                  |
| 1220–1224        | `preserveStickyKeyboardFocusAtScrollTop` (definition)                                           |
| 1226–1230        | `restoreStickyKeyboardViewportOffset` (definition)                                              |
| 1467             | call `preserveStickyKeyboardFocusAtScrollTop(targetPath, scrollElement?.scrollTop ?? null)`     |
| 2056             | call `preserveStickyKeyboardFocusAtScrollTop(activeStickyFocusPath, …)`                         |
| 2172             | call `preserveStickyKeyboardFocusAtScrollTop(nextFocusedPath, …)`                               |
| 2183             | call `restoreStickyKeyboardViewportOffset(nextFocusedPath, getStickyKeyboardViewportOffset(…))` |
| 2200             | call `clearPendingStickyKeyboardState()`                                                        |
| 2750–2752        | reads, inside the big focus `useLayoutEffect`                                                   |
| 2914, 2917, 2920 | the "settle" block: each ref cleared when its `path === focusedPath`                            |
| 2902–2905        | the composite `if (…)` at `:2899-2907` that guards the settle block                             |

The settle block, `FileTreeView.tsx:2909-2921`:

```ts
focusElement(focusedButton)
if (pendingStickyFocusPath === focusedPath) {
  pendingStickyFocusPathRef.current = null
}
if (pendingStickyKeyboardFocusPath === focusedPath) {
  pendingStickyKeyboardFocusPathRef.current = null
}
if (pendingStickyKeyboardViewportOffset?.path === focusedPath) {
  pendingStickyKeyboardViewportOffsetRef.current = null
}
if (pendingStickyKeyboardScrollTop?.path === focusedPath) {
  pendingStickyKeyboardScrollTopRef.current = null
}
```

Because the three transitions always write the _same_ `path` into whichever
fields they set, the three `Keyboard` checks (2913–2921) collapse to one.
**Prove that to yourself before you touch anything** — it is the load-bearing
assumption of Step 2. (The fourth check, `pendingStickyFocusPath` at 2910–2912,
is a different ref and does not collapse — see the note below.)

> **`pendingStickyFocusPathRef` (line 1198, no "Keyboard" in the name) is a
> DIFFERENT ref.** It is written at 1576, 2254 and 2911 and is _not_ part of the
> 3-mode machine. Do not fold it into the union. Do not rename it.

### Cluster 2 — the DOM refs every other cluster reads (Step 3)

`FileTreeView.tsx:1141-1151`:

```ts
const contextMenuAnchorRef = useRef<HTMLDivElement>(null)
const contextMenuTriggerRef = useRef<HTMLButtonElement>(null)
const isScrollingRef = useRef(false)
const listRef = useRef<HTMLDivElement>(null)
const renameInputRef = useRef<HTMLInputElement>(null)
const rootRef = useRef<HTMLDivElement>(null)
const scrollRef = useRef<HTMLDivElement>(null)
const searchInputRef = useRef<HTMLInputElement>(null)
const rowButtonRefs = useRef(new Map<string, HTMLElement>())
const stickyRowButtonRefs = useRef(new Map<string, HTMLElement>())
const updateViewportRef = useRef<() => void>(() => {})
```

The extraction blocker: the focus `useLayoutEffect` at `FileTreeView.tsx:2732`
opens by reading five of them at once —

```ts
  useLayoutEffect(() => {
    const scrollElement = scrollRef.current
    const rootElement = rootRef.current
    …
    const focusedButton =
      focusedPath == null ? null : (rowButtonRefs.current.get(focusedPath) ?? null)
```

— and further down reads `renameInputRef`, `searchInputRef` and
`stickyRowButtonRefs` too. Naive hook extraction therefore produces hooks with a
dozen ref parameters, which is not an improvement. Bundle them first.

### Cluster 3 — drag and touch, ~600 lines (Step 4)

Module-level helpers, `FileTreeView.tsx:227-375`:

| Line | Symbol                                                                 |
| ---- | ---------------------------------------------------------------------- |
| 227  | `const TOUCH_LONG_PRESS_DELAY = 400`                                   |
| 228  | `const TOUCH_LONG_PRESS_MOVE_THRESHOLD = 10`                           |
| 229  | `const DRAG_EDGE_SCROLL_THRESHOLD = 40`                                |
| 230  | `const DRAG_EDGE_SCROLL_MAX_SPEED = 18`                                |
| 232  | `function getPointElement(rootNode, clientX, clientY)`                 |
| 252  | `function getShadowPointElementByGeometry(rootNode, clientX, clientY)` |
| 276  | `function resolveDropTargetFromElement(target)`                        |
| 328  | `function createDragPreviewElement(sourceElement)`                     |
| 349  | `function shouldUseCustomPointerDragImage()`                           |
| 353  | `function getDragEdgeScrollDelta(clientY, scrollRect)`                 |

The 12 dedicated refs, `FileTreeView.tsx:1165-1179`, verbatim:

```ts
const dragAutoScrollFrameRef = useRef<number | null>(null)
const dragHoverOpenKeyRef = useRef<string | null>(null)
const dragHoverOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
const dragPointRef = useRef<{ clientX: number; clientY: number } | null>(null)
const dragPreviewRef = useRef<HTMLElement | null>(null)
const dragRowSnapshotRef = useRef<FileTreeVisibleRow | null>(null)
const touchCleanupRef = useRef<(() => void) | null>(null)
const touchDragActiveRef = useRef(false)
const touchPreviewOffsetRef = useRef<{ x: number; y: number } | null>(null)
const touchSourceElementRef = useRef<HTMLElement | null>(null)
const touchStartPointRef = useRef<{
  clientX: number
  clientY: number
} | null>(null)
const touchLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
```

The in-component handlers, `FileTreeView.tsx:1590-1947` (contiguous, 14 of them):

```
1590 requestDragAnimationFrame      1710 runDragAutoScroll
1598 cancelDragAnimationFrame       1739 updateDragPoint
1611 clearDragHoverOpen             1744 handleRowDragStart
1619 clearDragPreview               1789 handleRowDragEnd
1624 stopDragAutoScroll             1797 handleRowTouchStart  (… ends 1947)
1630 mountDragPreview
1640 clearTouchDragResources
1661 syncDropTargetFromPoint
1670 scheduleDragHoverOpen
```

Plus three tree-level handlers at `FileTreeView.tsx:3041` (`handleTreeDragOver`),
`:3059` (`handleTreeDragLeave`), `:3074` (`handleTreeDrop`), wired into the root
element at `:3363-3365`:

```tsx
      onDragLeave={dragAndDropEnabled ? handleTreeDragLeave : undefined}
      onDragOver={dragAndDropEnabled ? handleTreeDragOver : undefined}
      onDrop={dragAndDropEnabled ? handleTreeDrop : undefined}
```

**Cross-cluster leak to watch**: `shouldSuppressContextMenu` at
`FileTreeView.tsx:1582` reads `touchLongPressTimerRef` and `touchDragActiveRef`,
i.e. the _context menu_ reads _drag_ state:

```ts
const shouldSuppressContextMenu = (): boolean => {
  return (
    isScrollingRef.current === true ||
    touchLongPressTimerRef.current != null ||
    touchDragActiveRef.current === true
  )
}
```

The drag hook must therefore expose an `isTouchDragActive()`-style read for the
context-menu side. Design for that in Step 4, before Step 5 needs it.

### Cluster 4 — context menu, ~500 lines (Step 5)

State, `FileTreeView.tsx:1183-1196`:

```ts
const [contextHoverPath, setContextHoverPath] = useState<string | null>(null)
const [contextMenuAnchorTop, setContextMenuAnchorTop] = useState<number | null>(null)
const [lastContextMenuInteraction, setLastContextMenuInteraction] = useState<
  'focus' | 'pointer' | null
>(null)
const [scrollSettledRevision, setScrollSettledRevision] = useState(0)
const [contextMenuState, setContextMenuState] = useState<{
  anchorRect: FileTreeContextMenuOpenContext['anchorRect'] | null
  item: FileTreeContextMenuItem
  path: string
  source: 'button' | 'keyboard' | 'right-click'
} | null>(null)
const contextMenuStateRef = useRef(contextMenuState)
contextMenuStateRef.current = contextMenuState
```

Module helpers: `isContextMenuOpenKey` (475), `canKeyUseStickyKeyboardState`
(482), `BLOCKED_CONTEXT_MENU_NAV_KEYS` (499), `isEventInContextMenu` (510),
`serializeAnchorRect` (535), `createAnchorRectFromPoint` (548),
`getContextMenuAnchorTop` (567), `getContextMenuAnchorButton` (595),
`createContextMenuItem` (689), `focusFirstMenuElement` (755).

Layout effects owned by this cluster: **2609** (close when disabled), **2632**
(the `activeContextMenuKey` slot render — read the 9-line comment at
`:2617-2625`, it explains why the effect key is a derived string and not the
state object), **2683** (close when the item disappears), **2689**
(outside-pointerdown / Escape), **2966** (reposition the floating trigger).

Trigger derivation, `FileTreeView.tsx:2958-2963`:

```ts
const triggerPath =
  contextMenuState?.path ??
  debugContextMenuTriggerPathRef.current ??
  pointerTriggerPath ??
  focusTriggerPath ??
  contextHoverPath
```

Note the `debugContextMenuTriggerPathRef` term — **plan 022 deletes it**. See
Step 0.

### Cluster 5 — pure row renderers, ~430 lines (Step 6)

All module-level, all pure, all JSX-returning: `formatFlattenedSegments` (76),
`isBuiltInDecorationIconName` (715), `renderRowDecoration` (724),
`renderFileTreeRowContent` (774), the types `FileTreeRenderedRowMode` (847),
`FileTreeRenderRowFrame` (855), `FileTreeRenderRowOptions` (903),
`renderStyledRow` (911), `renderRangeChildren` (1100).

This is the safest extraction in the plan because `renderStyledRow` **already
takes a frame object**, `FileTreeView.tsx:849-854`:

```ts
// A frame captures everything that is constant across all rows in a single
// render pass: the controller, feature flags, handlers, and ref registrars.
// Only the `row`, `key`, and per-row `options` vary between call sites.
```

### The controller: what is real and what the finding got wrong

`FileTreeController.ts:223-269` is one uninterrupted block of **47 private
field declarations** (9 search, 6 rename, 4 selection, 5 projection buffers,
the rest focus/scroll/store/caches). The class has 59 `public` members. That
part of the audit finding is confirmed.

**A tempting-but-wrong idea you may arrive at independently: that the search
subsystem is a closed collaborator that never touches rename or selection state,
and can therefore be lifted out into its own object. That is FALSE.** Evidence,
re-verified against the file:

- `FileTreeController.ts:1582-1592` `#restoreSearchExpandedPaths` iterates
  `this.#selectedPaths` — selection state, read by search.
- `FileTreeController.ts:1611-1648` `#syncSearchVisibilityState` writes
  `this.#visibleCount` and reads `this.#projectionPaths` / `#storeVisibleCount`
  — shared row-read state, written by search.
- `FileTreeController.ts:1698-1730` `#setSearchState` calls
  `#rebuildVisibleProjection`, `#emit`, `#onSearchChange`.
- `FileTreeController.ts:1733-1800` `#refreshActiveSearchState` calls
  `#getListedPaths`, `#getAllKnownDirectoryPaths`, `#setExpandedPaths` (which
  drives `#store.expand` / `#store.collapse`) and reads `#focusedPath`.

The same is true of rename: `startRenaming` (`:1037`) calls `#applySelection`
(`:1072`) and `#setSearchState` (`:1074`); `#completeRenaming` (`:1123`) calls
`this.move` (`:1170`). **Neither subsystem is closed.** Extracting them as
collaborators would mean handing each one ~10 callbacks back into its owner — a
strictly worse object graph than today. **Therefore this plan does not split the
controller into `SearchSession` / `RenameSession` / `SelectionModel`.** It does
the one controller item that is provably a pure win (Step 1) and defers the rest
with the reason recorded in "Deferred, and why".

The provable win, `FileTreeController.ts:94`, `:2010-2014`:

```ts
export const FILE_TREE_RENAME_VIEW: unique symbol = Symbol('FILE_TREE_RENAME_VIEW')
…
export interface FileTreeController {
  [FILE_TREE_RENAME_VIEW](): FileTreeRenameViewState
}

FileTreeController.prototype[FILE_TREE_RENAME_VIEW] = FileTreeController.prototype.getRenameView
```

`getRenameView` is already `public` at `:1085`. The symbol is a second name for
the same method with zero privacy gained, and it has exactly three consumer
lines: `FileTreeView.tsx:20` (import), `:857` (type position), `:1354` (call).
Nothing outside `packages/tree` imports it — confirmed with
`grep -rn 'FILE_TREE_RENAME_VIEW' packages apps`.

### Repo conventions that apply — quoted from `AGENTS.md`, which you have not read

> - Group by feature, then by kind:
>   - `components/` — React render components only (`.tsx`)
>   - `hooks/` — `use-*` hooks
>   - `utils/` — pure, stateless, non-React code only. No stores, no
>     module-level mutable state, no subscriptions, nothing that imports React
>   - `tests/` — feature tests
> - Do not create empty folders.
> - Import exact files through `@/`. Do not add barrel `index.ts` files.

> - Keep nesting depth to 3 or less.
> - Use guard clauses and early returns. Keep the happy path shallow.
> - Do not use `else` after an early return.
> - Never use nested ternaries. Split the logic into `if` statements or a named
>   helper.

> - One component per file. Do not export multiple components from one component
>   file.
> - One hook per file. Keep hook files focused on the hook and its React wiring.
> - Keep pure helpers out of component and hook files.
> - Avoid manual React memoization. Do not add `memo`, `useMemo`, or
>   `useCallback` for ordinary render values or callbacks. Use them only for
>   measured performance issues, required stable identity, or correctness. Add a
>   short reason when you do.

> - No backward compatibility shims, no legacy aliases, no deprecation windows.
>   Update every call site in the same pass.
> - Do not repeat the folder name in file or symbol names.

> - Never throw `new Error`. Create errors with `createError` from `evlog` — in
>   practice through the feature's `structured-errors.ts` wrapper.

> - A dev server is always running. Never spin up your own server to test or
>   verify changes — reuse the running one.

Two package-local conventions the executor must match and `AGENTS.md` does not
state:

1. **`packages/tree` uses camelCase / PascalCase filenames**, not the kebab-case
   used in `apps/web`. Existing: `FileTreeController.ts`, `renameHandoff.ts`,
   `useFileTree.ts`, `getGitStatusSignature.ts`. **Name new files the same way**
   (`useFileTreeDrag.ts`, `stickyFocusMode.ts`), not `use-file-tree-drag.ts`.
2. **Errors** go through `packages/tree/src/utils/structured-errors.ts` —
   `createTreeError(message, cause?)`. There is no `new Error` anywhere in this
   package; keep it that way.

The package's `exports` map (`packages/tree/package.json:8-17`) is
wildcard-based, so **every new file under `src/hooks/` or `src/utils/render/`
automatically becomes a public export**. That is fine and expected. Do **not**
add an `index.ts` barrel and do **not** restructure the exports map.

## Commands you will need

Run all of these from the repo root unless the command says otherwise. Measured
at `ace313f` on 2026-08-16 — these are observed outputs, not guesses.

| Purpose                 | Command                                                                                               | Expected on success                                                                                                                                                                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tree tests (node + dom) | `bun run --filter '@workspace/tree' test`                                                             | `Test Files 2 passed (2)`, `Tests 7 passed (7)`, `Exited with code 0` **at `ace313f`** — plan 014 raises both numbers, so use your own Step 0c reading as the baseline                                                                                    |
| Tree browser tests      | `bun run --filter '@workspace/tree' test:browser`                                                     | 2 tests pass — **see the hang warning below**                                                                                                                                                                                                             |
| Tree typecheck          | `bun run --filter '@workspace/tree' typecheck`                                                        | `Exited with code 0`, no diagnostics                                                                                                                                                                                                                      |
| Tree lint               | `bun run --filter '@workspace/tree' lint`                                                             | `Exited with code 0`. **Three pre-existing `unicorn(no-new-array)` warnings in `src/utils/path-store/static-store.ts` (lines 72, 308, 776) are expected and out of scope — do not fix them.** Any warning or error naming a file you touched is a failure |
| Tree format check       | `bun run --filter '@workspace/tree' format:check`                                                     | `All matched files use the correct format.`, exit 0                                                                                                                                                                                                       |
| App consumer tests      | `cd apps/web && bun --bun vitest run --project node --project dom src/components/workspace/file-tree` | `Test Files 4 passed (4)`, `Tests 60 passed (60)` at `ace313f`                                                                                                                                                                                            |
| Whole repo              | `bun run verify`                                                                                      | = `typecheck && lint && format:check && test` across every workspace. Takes minutes and covers code this plan never touches — **see the note under Step 0c before treating a failure as yours**                                                           |
| Line count              | `wc -l packages/tree/src/components/FileTreeView.tsx`                                                 | `3555` at `ace313f`; tracked per step                                                                                                                                                                                                                     |

If `apps/web/src/components/workspace/file-tree/` does not exist, plans 009–012
have moved it. Find its new home with
`grep -rl "@workspace/tree" apps/web/src --include='*.ts*' | head` and point the
vitest path filter there — the tests to run are `tree-pane.test.ts` and
`file-tree-prefetch.test.ts` plus the two under `utils/tests/`. Do not skip this
gate.

**Never run `bun run format` (repo root or `--filter '*'`).** It rewrites files
across every workspace, including uncommitted work that is not yours. If
`format:check` fails on a file you edited, run
`bun run --filter '@workspace/tree' format` — that one is scoped.

**Browser-test hang warning.** The Vitest `browser` project in this repo has a
known failure mode where it hangs at the `RUN` banner and never starts. If
`test:browser` produces no test output within ~120 seconds, kill it, record
"browser project hung (known issue), verified manually instead", and fall back
to the manual check in Step 7. A hang is **not** a pass and **not** a failure —
do not report it as either.

**Never start a dev server.** One is already running at `http://localhost:5173`.

## Scope

**In scope** — the only files you may modify or create:

- `packages/tree/src/components/FileTreeView.tsx` (modify)
- `packages/tree/src/components/FileTreeRow.tsx` (create, Step 6)
- `packages/tree/src/hooks/useFileTreeRowDom.ts` (create, Step 3)
- `packages/tree/src/hooks/useFileTreeDrag.ts` (create, Step 4)
- `packages/tree/src/hooks/useFileTreeContextMenu.ts` (create, Step 5)
- `packages/tree/src/utils/render/stickyFocusMode.ts` (create, Step 2)
- `packages/tree/src/utils/render/dragPointer.ts` (create, Step 4)
- `packages/tree/src/utils/render/contextMenuAnchor.ts` (create, Step 5)
- `packages/tree/src/utils/render/rowIdentity.ts` (create, Step 5 — holds the two
  row-identity helpers that end up shared by three modules; see Step 5a)
- `packages/tree/src/utils/model/FileTreeController.ts` (modify — **3 lines
  only**, Step 1)
- `packages/tree/src/utils/tests/stickyFocusMode.test.ts` (create, Step 2)
- `plans/README.md` (status row, at the end)

**Out of scope** — do NOT touch, even though they look related:

- `packages/tree/src/utils/path-store/**` — plan 014 owns its tests and it is
  the layer _below_ this one. A change here invalidates 014's baseline.
- `packages/tree/src/utils/model/FileTreeController.ts` beyond the 3 lines in
  Step 1 — the search/rename/selection split is **deliberately deferred**; see
  "Deferred, and why". Splitting it here would make this plan unreviewable.
- `packages/tree/src/utils/model/FileTreeController.ts` `getVisibleRows`
  (`:498-597`) — the hottest read path, no benchmark exists, and `AGENTS.md`
  says an optimization without a measurement is a guess.
- `packages/tree/src/hooks/useFileTree.ts` — the _React_ wrapper hook for app
  consumers. Different runtime, different audience, not part of this split.
- `packages/tree/src/hooks/useFileTreeSearch.ts` and
  `packages/tree/src/hooks/useFileTreeSelector.ts` — plan 022 **deletes** both.
  Do not extract search into them, do not import them, do not delete them here.
- **Keyboard navigation.** `handleTreeKeyDown` (`FileTreeView.tsx:1948-2210`),
  `handleRowKeyDown`, and everything they dispatch stay in `FileTreeView.tsx`.
  The file's own TODO names "keyboard nav" and the file will still be large when
  you finish — that is expected and is **not** a reason to add a step. Keyboard
  nav straddles the sticky-focus machine and the context menu; it can only be
  extracted after both of this plan's hooks exist and have settled.
- `packages/tree/src/utils/path-store/static-store.ts` — its three
  `unicorn(no-new-array)` lint warnings are pre-existing and belong to plan 014.
- Repo-wide formatting (`bun run format` at the root). Scoped
  `--filter '@workspace/tree' format` only.
- `packages/tree/src/utils/render/FileTree.ts` and `render/runtime.ts` — they
  construct `FileTreeView` props. If you find yourself editing them, your
  extraction changed the component's public prop contract, which it must not.
- `packages/tree/src/components/RenameInput.tsx`,
  `utils/render/renameHandoff.ts` — rename is **already extracted**. The TODO's
  suggestion to extract it again is the error this plan corrects.
- `.oxlintrc.json` — the `packages/tree/**` React Compiler override is
  deliberate (Preact). Removing it would light up hundreds of false positives.
- `packages/tree/package.json` — no new exports entries needed; the wildcards
  already cover `hooks/*` and `utils/render/*`.
- `apps/web/**` — no consumer change should be required. If one is, STOP.
- Any change to `FileTreeViewProps` (`utils/model/internalTypes.ts:50`) — that
  is the boundary this refactor must not move.

## Git workflow

**All work happens on `main`** — no new branches, worktrees, commits, pushes, or
PRs unless the operator explicitly asks. If the operator asks for commits, use
conventional commits with a lowercase descriptive subject, one per step. Real
examples from this repo's `git log`:

```
refactor(orchestration): the server prepares a session's worktree (M-C)
fix(address): bound the URL, and stop escaping slashes in ?tabs=
```

Suggested subjects for this plan: `refactor(tree): one union replaces the three
sticky-keyboard refs`, `refactor(tree): drag and touch move into their own hook`.

## Steps

### Step 0: Confirm the two prerequisites, then record the real baseline

This plan is gated on two other plans. Verify both, in this order.

**0a — plan 014 must have landed.** Its characterization tests over the path
store and `getVisibleRows` are the only safety net this refactor has.

```bash
ls plans/014-tree-path-store-characterization-tests.md
grep -n '^| 014' plans/README.md
ls packages/tree/src/utils/tests/
```

Required, all three: the plan file exists; its README row reads `DONE`; and
`packages/tree/src/utils/tests/` contains test files _beyond_ the single
`controller.test.ts` that exists at `ace313f`.

> **If any of the three is not satisfied, STOP and report — this is the end of
> your run.** Two known ways it fails today:
>
> - `ls` errors with "No such file or directory": plan 014 was never written
>   (that was the state at `ace313f`, even though `plans/README.md` lists it).
>   Report "blocked: plan 014 does not exist"; do not write it yourself, and do
>   not substitute your own characterization tests.
> - The row exists but reads `TODO`: 014 is written but unexecuted. Report
>   "blocked: plan 014 not executed".
>
> Do not start this refactor against 7 test cases. Every step below is verified
> by that suite; without it you would be moving 1,500 lines of focus-and-scroll
> logic with no detector.

**0b — plan 022 should have landed.** It deletes, from this very file, a 44-line
debug `useLayoutEffect` (`FileTreeView.tsx:1292-1335`) and the two refs
`debugContextMenuTriggerPathRef` / `debugDisableScrollSuppressionRef`
(declared `:1209-1210`), which makes four branches dead:

```
2442  if (debugDisableScrollSuppressionRef.current === true) {
2485  if (rootElement == null || debugDisableScrollSuppressionRef.current === true) {
2520  if (debugDisableScrollSuppressionRef.current === true) {
2960  debugContextMenuTriggerPathRef.current ??
```

```bash
grep -c 'debugDisableScrollSuppressionRef' packages/tree/src/components/FileTreeView.tsx
```

- Returns `0` → plan 022 landed. Good, proceed.
- Returns `5` (the count at `ace313f`) → plan 022 has **not** landed. You may
  proceed, but **do not delete those refs yourself** — that is 022's job and
  doing it here creates a merge conflict. Carry the dead branches and the debug
  effect through your extractions unchanged, and note it in your report.
- Returns anything else → the file has drifted from this plan. Treat it as a
  STOP condition.

**0c — record the baseline.** Every later step compares against these numbers.

```bash
git status --porcelain > /tmp/plan-039-baseline-status.txt   # the tree is NOT clean; see below
wc -l packages/tree/src/components/FileTreeView.tsx
bun run --filter '@workspace/tree' typecheck
bun run --filter '@workspace/tree' lint
bun run --filter '@workspace/tree' format:check
bun run --filter '@workspace/tree' test
(cd apps/web && bun --bun vitest run --project node --project dom src/components/workspace/file-tree)
```

Write down: the line count, the tree test counts (`Test Files N`, `Tests N`), and
the app test counts. **If any of the five `@workspace/tree` / `apps/web` commands
is red before you change anything, STOP and report the pre-existing failure.**
You cannot refactor against a red baseline.

Two things that are normal and are **not** failures:

- **The working tree is dirty at `ace313f`** — there is uncommitted work in
  `apps/web` and `packages/contracts` that is not yours. That is why you snapshot
  `git status` here: the Done criterion is "no file outside the in-scope list
  changed _relative to this snapshot_", not "git status is empty".
- **`bun run verify` may already be red** for reasons outside `packages/tree`
  (plan 013 exists to repair the repo-wide test baseline and is `TODO`). Run it
  once now and record the result. If it is red at baseline, the Done criterion
  becomes "`bun run verify` fails in exactly the same places as the Step 0c
  recording, and in no new ones" — report the recorded baseline alongside it.
  Do not fix unrelated failures.

**Verify**: the five package/app commands exit 0; `/tmp/plan-039-baseline-status.txt`
exists; you have written down the line count and the test-count numbers.

### Step 1: Delete the `FILE_TREE_RENAME_VIEW` symbol alias

Smallest possible change, run first to prove the toolchain works end to end.

In `packages/tree/src/utils/model/FileTreeController.ts`, delete these three
things:

1. Line 94: `export const FILE_TREE_RENAME_VIEW: unique symbol = Symbol('FILE_TREE_RENAME_VIEW')`
2. Lines 2010–2012: the `export interface FileTreeController { [FILE_TREE_RENAME_VIEW](): FileTreeRenameViewState }` declaration-merging block
3. Line 2014: `FileTreeController.prototype[FILE_TREE_RENAME_VIEW] = FileTreeController.prototype.getRenameView`

In `packages/tree/src/components/FileTreeView.tsx`, update the three consumers:

- Line 20: drop the `FILE_TREE_RENAME_VIEW,` member from the import statement
  that spans lines 19–22, leaving
  `import { FileTreeController } from '@workspace/tree/utils/model/FileTreeController'`
  (one line after `oxfmt` collapses it)
- Line 857: `renameView: ReturnType<FileTreeController[typeof FILE_TREE_RENAME_VIEW]>`
  → `renameView: ReturnType<FileTreeController['getRenameView']>`
- Line 1354: `const renameView = controller[FILE_TREE_RENAME_VIEW]()`
  → `const renameView = controller.getRenameView()`

Do **not** export the `FileTreeRenameViewState` interface (it is intentionally
module-private at `:81`); `ReturnType<…>` reaches it without an export.

**Verify**:

```bash
grep -rn 'FILE_TREE_RENAME_VIEW' packages apps    # → no matches
bun run --filter '@workspace/tree' typecheck      # → exit 0
bun run --filter '@workspace/tree' format:check   # → the import edit must stay formatted
bun run --filter '@workspace/tree' test           # → same counts as Step 0c
```

### Step 2: Replace the three sticky-keyboard refs with one pure-reducer union

Create `packages/tree/src/utils/render/stickyFocusMode.ts`. No React import
(`AGENTS.md`: `utils/` is "pure, stateless, non-React code only"). Target shape:

```ts
// The sticky overlay can preserve keyboard focus in exactly one of three ways
// at a time. Modelling it as a union makes "exactly one preservation mode
// active" a type-level fact instead of a comment over three coupled refs.
export type StickyKeyboardFocusMode =
  | { readonly kind: 'none' }
  | { readonly kind: 'focus-path'; readonly path: string; readonly scrollTop: number | null }
  | { readonly kind: 'viewport-offset'; readonly path: string; readonly viewportOffset: number }

export const NO_STICKY_KEYBOARD_FOCUS: StickyKeyboardFocusMode = { kind: 'none' }

export function preserveStickyKeyboardFocusAtScrollTop(
  path: string,
  scrollTop: number | null,
): StickyKeyboardFocusMode

export function restoreStickyKeyboardViewportOffset(
  path: string,
  viewportOffset: number,
): StickyKeyboardFocusMode

// Mirrors the three independent `=== focusedPath` clears at FileTreeView.tsx
// 2913-2921. All three legacy refs carried the same path, so one check is
// equivalent — see the plan's proof note.
export function settleStickyKeyboardFocus(
  mode: StickyKeyboardFocusMode,
  focusedPath: string | null,
): StickyKeyboardFocusMode

// Selectors that replace the raw ref reads at FileTreeView.tsx:2750-2752.
export function getStickyKeyboardFocusPath(mode: StickyKeyboardFocusMode): string | null
export function getStickyKeyboardScrollTop(mode: StickyKeyboardFocusMode): number | null
export function getStickyKeyboardViewportOffsetEntry(
  mode: StickyKeyboardFocusMode,
): { path: string; viewportOffset: number } | null
```

Behaviour that must be preserved exactly:

- `preserveStickyKeyboardFocusAtScrollTop(path, null)` still yields a mode whose
  **focus path is `path`** and whose scroll-top is `null`. The old code set
  `pendingStickyKeyboardFocusPathRef = path` unconditionally and only the
  scroll-top ref conditionally. Getting this wrong silently breaks sticky
  Shift+F10.
- `getStickyKeyboardFocusPath` returns non-null **only** for `kind:'focus-path'`
  (the old `restoreStickyKeyboardViewportOffset` nulled that ref).
- `getStickyKeyboardViewportOffsetEntry` returns non-null **only** for
  `kind:'viewport-offset'`.

In `FileTreeView.tsx`:

1. Delete the three refs at `:1199-1207`
   (`pendingStickyKeyboardFocusPathRef`,
   `pendingStickyKeyboardViewportOffsetRef`,
   `pendingStickyKeyboardScrollTopRef`) and the three local helper functions —
   together with the two-line comment that introduces them — at
   `:1212-1230`. **Keep `pendingStickyFocusPathRef` (`:1198`) and
   `pointerFocusScrollPathRef` (`:1208`) untouched.**
2. Add one ref: `const stickyKeyboardFocusRef = useRef<StickyKeyboardFocusMode>(NO_STICKY_KEYBOARD_FOCUS)`.
3. Rewrite the five call sites (`grep -n` for the old helper names; they are at
   1467, 2056, 2172, 2183, 2200) as assignments, e.g.
   `stickyKeyboardFocusRef.current = preserveStickyKeyboardFocusAtScrollTop(targetPath, scrollElement?.scrollTop ?? null)`.
4. Rewrite the three reads at `:2750-2752` using the selectors. (`:2749`, the
   `pendingStickyFocusPath` read, stays.)
5. Replace the three independent clears at `:2913-2921` with one
   `stickyKeyboardFocusRef.current = settleStickyKeyboardFocus(stickyKeyboardFocusRef.current, focusedPath)`.
   Leave the `pendingStickyFocusPath` clear at `:2910-2912` exactly as it is.
6. The composite condition at `:2899-2907` reads all four pending values; keep
   its logic identical, just sourced from the selectors.
7. `shouldPreserveStickyKeyboardFocusViewport` (`:2756-2759`) also reads
   `pendingStickyKeyboardFocusPath`; source it from
   `getStickyKeyboardFocusPath` and keep the three-way `&&` identical.

Write `packages/tree/src/utils/tests/stickyFocusMode.test.ts` (see Test plan).

**Verify**:

```bash
grep -c 'pendingStickyKeyboard' packages/tree/src/components/FileTreeView.tsx     # → 0
grep -c 'pendingStickyFocusPathRef' packages/tree/src/components/FileTreeView.tsx # → 5, UNCHANGED
bun run --filter '@workspace/tree' typecheck    # → exit 0
bun run --filter '@workspace/tree' test         # → Step 0c count + 7, all pass
bun run --filter '@workspace/tree' lint         # → 0 errors (the 3 path-store warnings stay)
```

The second grep is the negative check: `pendingStickyFocusPathRef` is the ref
that must **not** be folded into the union. `5` is its line count at `ace313f`
(declaration `:1198`, writes `:1576`, `:2254`, `:2911`, read `:2749`). Any other
number means you touched the wrong ref — revert and redo the step.

Then the manual sticky check from Step 7. **Do this one now, not at the end** —
sticky keyboard focus is the behaviour with the thinnest automated coverage in
the package.

### Step 3: Bundle the DOM refs into one registry hook

Create `packages/tree/src/hooks/useFileTreeRowDom.ts`. Preact, one hook per file:

```ts
import { useRef } from 'preact/hooks'
import type { RefObject } from 'preact'

// Every extracted hook needs the same handful of element refs. Bundling them
// into one object is what keeps the drag and context-menu hooks at one
// parameter instead of a dozen.
export interface FileTreeRowDom {
  readonly root: RefObject<HTMLDivElement>
  readonly scroll: RefObject<HTMLDivElement>
  readonly list: RefObject<HTMLDivElement>
  readonly renameInput: RefObject<HTMLInputElement>
  readonly searchInput: RefObject<HTMLInputElement>
  readonly rowButtons: RefObject<Map<string, HTMLElement>>
  readonly stickyRowButtons: RefObject<Map<string, HTMLElement>>
}

export function useFileTreeRowDom(): FileTreeRowDom
```

Return a `useRef`-held object so its identity is stable across renders (this is
"required stable identity", the exemption `AGENTS.md` allows — put that reason in
a one-line comment).

In `FileTreeView.tsx`: delete the seven `useRef` declarations at
`:1144-1150` (`listRef`, `renameInputRef`, `rootRef`, `scrollRef`,
`searchInputRef`, `rowButtonRefs`, `stickyRowButtonRefs`), call
`const dom = useFileTreeRowDom()`, and rewrite every use. Mechanical mapping:

| Old                           | New                            |
| ----------------------------- | ------------------------------ |
| `rootRef.current`             | `dom.root.current`             |
| `scrollRef.current`           | `dom.scroll.current`           |
| `listRef.current`             | `dom.list.current`             |
| `renameInputRef.current`      | `dom.renameInput.current`      |
| `searchInputRef.current`      | `dom.searchInput.current`      |
| `rowButtonRefs.current`       | `dom.rowButtons.current`       |
| `stickyRowButtonRefs.current` | `dom.stickyRowButtons.current` |
| `ref={rootRef}` (JSX)         | `ref={dom.root}`               |

Occurrence counts at `ace313f`, so you can confirm you got them all:
`rootRef` 18, `scrollRef` 11, `rowButtonRefs` 8, `stickyRowButtonRefs` 4,
`renameInputRef` 4, `searchInputRef` 4, `listRef` 3.

**Leave these refs alone** — they are not element refs and belong to other
clusters: `contextMenuAnchorRef`, `contextMenuTriggerRef` (Step 5 owns them),
`isScrollingRef`, `updateViewportRef`, `measuredViewportHeightRef`.

This step is **pure renaming — zero behaviour change**. Nothing may be added to
or removed from any effect's dependency array.

**Verify**:

```bash
grep -cE '\b(rootRef|scrollRef|listRef|renameInputRef|searchInputRef|rowButtonRefs|stickyRowButtonRefs)\b' packages/tree/src/components/FileTreeView.tsx  # → 0
bun run --filter '@workspace/tree' typecheck && bun run --filter '@workspace/tree' lint
bun run --filter '@workspace/tree' test         # → identical counts to Step 2
(cd apps/web && bun --bun vitest run --project node --project dom src/components/workspace/file-tree)   # → same counts as Step 0c
```

### Step 4: Extract drag and touch

**4a — move the pure helpers.** Create
`packages/tree/src/utils/render/dragPointer.ts` and move, unchanged:
`getPointElement` (232), `getShadowPointElementByGeometry` (252),
`resolveDropTargetFromElement` (276), `createDragPreviewElement` (328),
`shouldUseCustomPointerDragImage` (349), `getDragEdgeScrollDelta` (353), plus
the four constants at `:227-230`. Export what the hook needs; keep
`getShadowPointElementByGeometry` module-private (only `getPointElement` calls
it). Move every comment inside the moved range with its function — in particular
the two-line Safari note at `:347-348` above `shouldUseCustomPointerDragImage`,
which explains why Safari must stay on the native drag-preview path.

**4b — create the hook.** `packages/tree/src/hooks/useFileTreeDrag.ts`, one
hook, taking a single options object:

```ts
export interface UseFileTreeDragOptions {
  readonly controller: FileTreeController
  readonly dom: FileTreeRowDom
  readonly dragAndDropEnabled: boolean
  readonly itemHeight: number
}

export interface FileTreeDragHandlers {
  readonly handleRowDragStart: (
    event: DragEvent,
    row: FileTreeVisibleRow,
    targetPath: string,
  ) => void
  readonly handleRowDragEnd: () => void
  readonly handleRowTouchStart: (
    event: TouchEvent,
    row: FileTreeVisibleRow,
    targetPath: string,
  ) => void
  readonly handleTreeDragOver: (event: DragEvent) => void
  readonly handleTreeDragLeave: (event: DragEvent) => void
  readonly handleTreeDrop: (event: DragEvent) => void
  // Read by the context menu: a long-press or an active touch drag suppresses
  // it. Replaces the direct touch-ref reads in shouldSuppressContextMenu.
  readonly isTouchInteractionActive: () => boolean
  // Read during render at FileTreeView.tsx:3118 to decide whether the dragged
  // row is still mounted (`draggedRowIsMounted`, `parkedDraggedRow`). Without
  // this the component cannot compute :3119-3131 after the refs move out.
  readonly getDraggedRowSnapshot: () => FileTreeVisibleRow | null
}

export function useFileTreeDrag(options: UseFileTreeDragOptions): FileTreeDragHandlers
```

Move all 12 drag/touch refs (`:1165-1179`), all 14 in-component handlers
(`:1590-1946`), the three tree handlers (`:3041-3085`), **and the window
`dragend` effect at `:3023-3039`** into the hook, with their bodies unchanged
apart from `scrollRef.current` → `dom.scroll.current` etc. The `:3023` effect is
easy to miss because it sits between the context-menu handlers, but it is the
only unmount teardown for `clearTouchDragResources()`; leaving it behind makes it
reference refs that no longer exist.

Only two component-body reads of drag state survive the move: line 3118
(`dragRowSnapshotRef.current`, served by `getDraggedRowSnapshot()`) and
`shouldSuppressContextMenu` at `:1582` (served by `isTouchInteractionActive()`).
If you find a third, that is drift — STOP.

**4c — rewire.** In `FileTreeView.tsx`: call the hook, destructure the handlers,
and rewrite `shouldSuppressContextMenu` (`:1582`) to:

```ts
const shouldSuppressContextMenu = (): boolean => {
  return isScrollingRef.current === true || drag.isTouchInteractionActive()
}
```

The JSX wiring at `:3363-3365` and the `FileTreeRenderRowFrame` fields
`handleRowDragStart` / `handleRowDragEnd` / `handleRowTouchStart` now read from
the hook's return value. **Do not change what those props do or when they are
`undefined`.**

Two traps:

- `handleRowTouchStart` (`:1797-1946`) registers `document`-level
  `touchmove`/`touchend`/`touchcancel` listeners inside a `setTimeout` and stores
  the teardown in `touchCleanupRef`. Today that teardown runs on unmount **only
  when `dragAndDropEnabled` is true**, via the cleanup of the `:3023` effect
  (which early-returns before subscribing when the feature is off). Move the
  effect verbatim, guard and all. **Do not "fix" the disabled-feature case in
  this plan** — record it in your report instead; it is already listed under
  "Deferred, and why".
- `handleTreeDragOver` sets `event.dataTransfer.dropEffect = 'move'` and calls
  `event.preventDefault()`. Both are required for HTML5 drop to fire at all.

**Verify**:

```bash
grep -cE '(dragAutoScrollFrameRef|dragHoverOpenKeyRef|dragPreviewRef|touchDragActiveRef|touchLongPressTimerRef)' packages/tree/src/components/FileTreeView.tsx  # → 0
grep -c 'dragAndDropEnabled ?' packages/tree/src/components/FileTreeView.tsx   # → 3, UNCHANGED
bun run --filter '@workspace/tree' typecheck && bun run --filter '@workspace/tree' lint && bun run --filter '@workspace/tree' format:check
bun run --filter '@workspace/tree' test        # → identical counts to Step 3
(cd apps/web && bun --bun vitest run --project node --project dom src/components/workspace/file-tree)
wc -l packages/tree/src/components/FileTreeView.tsx   # → at least ~550 lines below the Step 0c baseline
```

The second grep is the negative check for this step: the three root handlers must
still be `undefined` when drag-and-drop is off (`:3363-3365`). Passing the hook's
handlers unconditionally would make the tree accept drops with the feature
disabled, and no test in the package would catch it.

Then the manual drag check in Step 7.

### Step 5: Extract the context menu

**5a.1 — create `packages/tree/src/utils/render/rowIdentity.ts` first** (see the
paragraph below), then **5a.2 — move the pure helpers** into
`packages/tree/src/utils/render/contextMenuAnchor.ts`: `isContextMenuOpenKey`
(475), `canKeyUseStickyKeyboardState` (482), `BLOCKED_CONTEXT_MENU_NAV_KEYS`
(499), `isEventInContextMenu` (510), `serializeAnchorRect` (535),
`createAnchorRectFromPoint` (548), `getContextMenuAnchorTop` (567),
`getContextMenuAnchorButton` (595), `createContextMenuItem` (689),
`focusFirstMenuElement` (755). Keep every comment. `getContextMenuAnchorButton`
already takes its two maps as parameters (`:595-598`), so it needs no change.

**5a.1 in full**: create `packages/tree/src/utils/render/rowIdentity.ts` and move
`getFileTreeRowPath` (`:107-111`) and `getFileTreeRowAriaLabel` (`:113-120`)
into it, unchanged. Both are pure `(row) => string`. They are needed by three
places once this plan finishes — `createContextMenuItem` (`:692`, moving here in
Step 5), `renderStyledRow` / `renderFileTreeRowContent` (`:795`, `:949`, `:971`,
`:992`, `:1117`, moving to `FileTreeRow.tsx` in Step 6), and the component itself
(`:1394`, `:2949`, `:3423`, staying). Leaving them in `FileTreeView.tsx` would
force `utils/render/contextMenuAnchor.ts` to import a component module that
imports it back — a cycle. Import them from `rowIdentity.ts` in all three.

**5b — create `packages/tree/src/hooks/useFileTreeContextMenu.ts`** owning:

- **four** of the five state fields in `:1183-1194` — `contextHoverPath`
  (`:1183`), `contextMenuAnchorTop` (`:1184`), `lastContextMenuInteraction`
  (`:1185`), `contextMenuState` (`:1189`) — plus `contextMenuStateRef`
  (`:1195-1196`). **`scrollSettledRevision` (`:1188`) stays in the component**:
  its only writer is the scroll effect at `:2463`, which does not move, and its
  only reader is the reposition effect's dependency array (`:2977`). Pass it into
  the hook as a plain option value so that dependency array is unchanged.
- `contextMenuAnchorRef` and `contextMenuTriggerRef` (`:1141-1142`) — returned so
  the component can attach them in JSX (`:3495`, `:3501`)
- the five layout effects at 2609, 2632, 2683, 2689, 2966
- `updateTriggerPosition` (`:1446`), `getTriggerAnchorButton` (`:1347`),
  `openMenuFromTrigger` (`:3269`), `handleTreePointerOver` (`:2984`),
  `handleTreePointerLeave` (`:3019`), `closeContextMenu` (`:1428`) and the
  `closeContextMenuRef` (`:1427`) / `restoreFocusToTreeRef` (`:1424`) /
  `shouldRestoreContextMenuFocusRef` (`:1426`) indirection they use
- the derived `contextMenuEnabled` / `contextMenuTriggerMode` /
  `contextMenuButtonTriggerEnabled` / `contextMenuButtonVisibility` /
  `contextMenuRightClickEnabled` block at `:1280-1290`
- the `triggerPath` derivation at `:2958-2963`

Options — one object:
`{ composition, controller, dom, slotHost, instanceId, itemHeight, isScrolling, scrollSettledRevision, shouldSuppressContextMenu, focusedPath, focusedRowHasVisibleAnchor, domFocusOwner }`.
`isScrolling` must be the **`isScrollingRef` object itself**, not a boolean: the
moved code reads `isScrollingRef.current` at `:2967`, `:2985` and `:3270` while
the scroll effects that _write_ it (`:2451`, `:2462`, `:2517-2521`, `:2603`) stay
in the component. Passing a snapshot boolean silently changes behaviour.

Return surface — small domain actions, not a state blob, per `AGENTS.md`
("Context/provider APIs should expose small domain actions … not broad state
blobs"). It must cover **every** call site that stays behind in the component;
these are the ones a naive extraction misses:

| Returned member                                                                                                       | Why the component still needs it                        | Call sites left behind                                                                                    |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `noteFocusInteraction()`                                                                                              | wraps `setLastContextMenuInteraction('focus')`          | `:1514`, `:1973`, `:2019`, `:2152`, `:3246` — all in keyboard-nav / row-click code that does **not** move |
| `clearHoverPath()`                                                                                                    | wraps the `setContextHoverPath(null)`-style update      | `:2524` (scroll effect, stays)                                                                            |
| `closeContextMenuRef`                                                                                                 | the scroll effect calls `closeContextMenuRef.current()` | `:2518` — keep the ref indirection so that effect's dependency array does not change                      |
| `triggerPath`, `contextMenuAnchorTop`, `isPointerContextMenuOpen`                                                     | read during render                                      | `:3157`, `:3165`, `:3167` and the row frame                                                               |
| `anchorRef`, `triggerRef`                                                                                             | JSX `ref=` attachment                                   | `:3495`, `:3501`                                                                                          |
| `openContextMenuForRow`, `closeContextMenu`, `handleTreePointerOver`, `handleTreePointerLeave`, `openMenuFromTrigger` | wired into JSX and row handlers                         | `:3367-3368` (both still guarded by `contextMenuEnabled ? … : undefined`), `:3519`, and the row frame     |

If plan 022 has not landed, the debug effect at `:1292-1335` also calls
`setContextHoverPath` and `setLastContextMenuInteraction` (`:1305-1306`). Leave
that effect in the component and give the hook one extra action,
`applyDebugTrigger(path: string | null)`, that performs both updates. Do not
export the raw setters to work around it.

**If a call site cannot be expressed as a named domain action and you find
yourself returning `setContextMenuState` or another raw setter, STOP and
report** — that is the signal the seam is wrong, not an invitation to improvise.

**Preserve `activeContextMenuKey` exactly** (`:2626-2630`). Its 9-line comment
at `:2617-2625` documents a real bug: keying the slot effect on the
`contextMenuState` object re-runs it on every incidental `setState`, swapping the
menu DOM out from under Playwright clicks and the inline rename input. **The
effect must stay keyed on the derived string.** This is the single most likely
thing to be broken by a careless move.

If plan 022 has **not** landed, the `triggerPath` chain still contains
`debugContextMenuTriggerPathRef.current ??` — carry it across unchanged.

**Verify**:

```bash
grep -cE '(contextMenuStateRef|setContextMenuState|setContextMenuAnchorTop)' packages/tree/src/components/FileTreeView.tsx  # → 0
grep -c 'useState' packages/tree/src/components/FileTreeView.tsx   # → 7 (11 lines at baseline, minus the 4 declarations that moved)
grep -n 'activeContextMenuKey' packages/tree/src/hooks/useFileTreeContextMenu.ts   # → the useMemo and the effect's dep array, nothing else
bun run --filter '@workspace/tree' typecheck && bun run --filter '@workspace/tree' lint && bun run --filter '@workspace/tree' format:check
bun run --filter '@workspace/tree' test
(cd apps/web && bun --bun vitest run --project node --project dom src/components/workspace/file-tree)
```

`contextMenuAnchorTop` and `lastContextMenuInteraction` **will still appear** in
`FileTreeView.tsx` — the first is read during render at `:3157-3167`, the second
through `noteFocusInteraction()`. Do not grep them to zero.

Then the manual context-menu check in Step 7 — **including the right-click case
and the keyboard Shift+F10 case**, which take different `source` branches.

### Step 6: Move the pure row renderers out

Create `packages/tree/src/components/FileTreeRow.tsx` and move, unchanged:
`formatFlattenedSegments` (76), `isBuiltInDecorationIconName` (715),
`renderRowDecoration` (724), `renderFileTreeRowContent` (774), the three types at
847/855/903, `renderStyledRow` (911), `renderRangeChildren` (1100).

`getFileTreeRowPath` and `getFileTreeRowAriaLabel` already live in
`utils/render/rowIdentity.ts` after Step 5a — import them here, do not copy them.

`getBuiltInGitStatusDecoration` (377) and `getInheritedIgnoredGitStatus` (403)
move into `FileTreeRow.tsx` too: their only call sites are `:959` and `:955`,
both inside `renderStyledRow`. Confirm with
`grep -n 'getBuiltInGitStatusDecoration\|getInheritedIgnoredGitStatus' packages/tree/src/components/FileTreeView.tsx`
before moving — expected: the two declarations plus exactly those two calls.

`AGENTS.md` says "One component per file. Do not export multiple components from
one component file." These are **render helper functions invoked directly**, not
components mounted via JSX — no `<RenderStyledRow />` exists. Put a two-line
header comment in the new file saying so, so the next reader does not "fix" it.

Because `renderStyledRow` already takes a frame (`:855-900`), the only edit is
imports. The frame's `renameView` field is `ReturnType<FileTreeController['getRenameView']>` after Step 1.

**6b — rewrite the file's TODO.** This is required by the Done criteria and no
other step does it. Replace the two TODO lines at `FileTreeView.tsx:3-4` with a
note that matches reality after this plan, e.g.:

```ts
// Rows live in ./FileTreeRow.tsx, drag/touch in ../hooks/useFileTreeDrag.ts, the
// context menu in ../hooks/useFileTreeContextMenu.ts, sticky-keyboard focus in
// ../utils/render/stickyFocusMode.ts, and rename in ./RenameInput.tsx. What is
// left here is virtualization, keyboard navigation, and the focus/scroll
// effects — keyboard nav is the next cluster to extract, and it depends on the
// sticky-focus and context-menu seams above.
```

Do **not** delete the comment outright, and do **not** touch the `NOTE:` about
`oxc-react-compiler` on `:5-7`.

**Verify**:

```bash
bun run --filter '@workspace/tree' typecheck && bun run --filter '@workspace/tree' lint && bun run --filter '@workspace/tree' format:check
bun run --filter '@workspace/tree' test
(cd apps/web && bun --bun vitest run --project node --project dom src/components/workspace/file-tree)
wc -l packages/tree/src/components/FileTreeView.tsx
```

Expected after all six steps: **`FileTreeView.tsx` between about 1,800 and 2,200
lines**, down from 3,555. The arithmetic: drag ≈ 570 lines, context menu ≈ 550,
row renderers ≈ 450, sticky focus ≈ 35, minus roughly 50 lines of new imports and
hook call sites. Keyboard navigation (~260 lines) and the virtualization/focus
effects stay by design.

- Under 2,200 → done. A result near 2,000 is normal; **do not keep extracting to
  chase 1,800.**
- Over 2,200 → one extraction left more behind than intended. Report it; do not
  invent a seventh step, and do not start on keyboard navigation.

### Step 7: Verify in the real app, then run the full repo gate

A dev server is **already running** at `http://localhost:5173`. Do not start one.
Open the file-tree pane and confirm, by hand:

**If you have no way to drive a browser**, do not guess and do not mark these
passed. Run the two commands at the end of this step, then report exactly which
of the five checks you could not perform — an unverified manual check is a known
gap in the handoff, a falsely-reported one is a broken app.

1. **Sticky keyboard focus** (Step 2's risk): scroll a deep folder so a parent
   row is pinned in the sticky overlay, focus that sticky row, press `ArrowDown`
   and `ArrowUp`. The list must not jump to reveal the offscreen canonical row.
2. **Drag** (Step 4's risk): drag a file onto a folder — the custom drag preview
   follows the cursor, the folder auto-opens after the hover delay, dragging near
   the top/bottom edge auto-scrolls, and dropping moves the file.
3. **Context menu** (Step 5's risk): right-click a row → the menu opens anchored
   to that row; `Escape` closes it; clicking outside closes it; scrolling with
   the menu open keeps the trigger anchored; `Shift+F10` on a focused row opens
   it via the keyboard path.
4. **Rename** (untouched, but it shares the focus effect): `F2` on a row opens
   the inline input already focused with the text selected.
5. Browser console shows **no new errors**.

Then:

```bash
bun run --filter '@workspace/tree' test:browser   # 2 tests pass, or the known hang → record it
bun run verify                                    # compare against the Step 0c recording
```

**Verify**: every manual check you were able to run behaves as described, and the
ones you could not run are named in your report; `bun run verify` exits 0, or
fails in exactly the places Step 0c recorded and no others.

## Test plan

**New tests — one file, `packages/tree/src/utils/tests/stickyFocusMode.test.ts`**
(node project; the config includes `src/**/*.test.ts`). Model the structure on
`packages/tree/src/utils/tests/controller.test.ts` — plain `describe`/`it`,
imports from `vitest`, no fixtures, no DOM. Cases:

1. `preserveStickyKeyboardFocusAtScrollTop('a/', 120)` → `kind:'focus-path'`,
   `getStickyKeyboardFocusPath` is `'a/'`, `getStickyKeyboardScrollTop` is `120`,
   `getStickyKeyboardViewportOffsetEntry` is `null`.
2. `preserveStickyKeyboardFocusAtScrollTop('a/', null)` → still
   `kind:'focus-path'` with focus path `'a/'`, scroll top `null`. _(This is the
   asymmetry in the original code — the regression this file exists to catch.)_
3. `restoreStickyKeyboardViewportOffset('b/x.ts', 40)` → `kind:'viewport-offset'`,
   `getStickyKeyboardFocusPath` is `null`, entry is `{path:'b/x.ts', viewportOffset:40}`.
4. `settleStickyKeyboardFocus(mode, 'a/')` where the mode's path is `'a/'` →
   `NO_STICKY_KEYBOARD_FOCUS`.
5. `settleStickyKeyboardFocus(mode, 'other')` → the mode is returned unchanged.
6. `settleStickyKeyboardFocus(mode, null)` → unchanged (a null focused path never
   settled anything in the old code either).
7. `settleStickyKeyboardFocus(NO_STICKY_KEYBOARD_FOCUS, 'a/')` → still `'none'`.

**No other new tests.** Steps 1 and 3–6 are behaviour-preserving moves; the
correct gate for them is the _existing_ suite plus plan 014's characterization
tests running green after each step, plus the manual checks in Step 7. Writing
new tests that assert the new file layout would test the refactor, not the
behaviour, and would have to be rewritten by the next person who moves a line.

**Do not** add tests that `vi.mock` or `mock.module` anything in this package —
`AGENTS.md` forbids mocking our own modules.

**Verification**: `bun run --filter '@workspace/tree' test` → the Step 0c count
plus 7, all passing.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun run --filter '@workspace/tree' typecheck` exits 0
- [ ] `bun run --filter '@workspace/tree' lint` exits 0 with 0 errors and no new
      warnings (the 3 pre-existing `static-store.ts` warnings are still there)
- [ ] `bun run --filter '@workspace/tree' format:check` exits 0
- [ ] `bun run --filter '@workspace/tree' test` exits 0, with 7 new
      `stickyFocusMode` cases and every pre-existing case still passing
      (`Test Files` = Step 0c + 1, `Tests` = Step 0c + 7)
- [ ] `cd apps/web && bun --bun vitest run --project node --project dom src/components/workspace/file-tree` exits 0 with the same counts as Step 0c
- [ ] `bun run verify` exits 0 — **or**, if it was already red in Step 0c, fails
      in exactly the same places and no new ones (attach both outputs)
- [ ] `grep -rn 'FILE_TREE_RENAME_VIEW' packages apps` returns no matches
- [ ] `grep -c 'pendingStickyKeyboard' packages/tree/src/components/FileTreeView.tsx` returns 0
- [ ] `grep -c 'pendingStickyFocusPathRef' packages/tree/src/components/FileTreeView.tsx` still returns 5
- [ ] `wc -l packages/tree/src/components/FileTreeView.tsx` is under 2,200
- [ ] `git status --porcelain` differs from
      `/tmp/plan-039-baseline-status.txt` only by files on the "In scope" list
      (the tree was already dirty before you started — an empty `git status` is
      not the bar)
- [ ] `git diff -- packages/tree/src/utils/model/internalTypes.ts` is empty (the
      `FileTreeViewProps` contract did not move)
- [ ] The TODO at `FileTreeView.tsx:3-4` has been replaced with an accurate note
      about what is now extracted and what deliberately remains (Step 6b)
- [ ] `plans/README.md` row 039 updated
- [ ] All five manual checks in Step 7 pass

## STOP conditions

Stop and report — do not improvise — if any of these happens:

- **Plan 014 has not landed** (Step 0a). This is not negotiable: without those
  characterization tests, six of these seven steps have no detector.
- **The baseline in Step 0c is already red.** You cannot distinguish your
  breakage from pre-existing breakage.
- **The `packages/tree` test count goes down at any point.** A disappearing test
  means a file stopped being collected — that is a silent loss of coverage, not
  a pass.
- **You need to touch `apps/web` to make it compile.** That means an extraction
  changed `FileTreeView`'s public prop contract, which it must not.
- **You need to add or remove an entry in any `useLayoutEffect` dependency
  array** to make a step work. Every step here is behaviour-preserving; a
  dependency-array change is a behaviour change and needs its own decision.
- **The sticky-keyboard proof fails**: if you find any write to
  `pendingStickyKeyboardScrollTopRef` or
  `pendingStickyKeyboardViewportOffsetRef` carrying a _different_ `path` than the
  matching `pendingStickyKeyboardFocusPathRef` write, the union in Step 2 is not
  equivalent to the three refs. Stop; the machine has a fourth state.
- **`activeContextMenuKey` stops being a derived string** or its effect starts
  keying on `contextMenuState` — that reintroduces a documented bug (menu DOM
  swapped mid-interaction).
- **A manual check in Step 7 regresses** and two fix attempts do not restore it.
  Revert that step and report; do not carry a known regression into the next
  step.
- **You are tempted to split `FileTreeController` further.** It is explicitly out
  of scope and the reason is in "Deferred, and why".
- **Step 5 pushes you toward returning a raw `setState` function** (most likely
  `setLastContextMenuInteraction`, because five keyboard/click call sites stay in
  the component). The named actions in the Step 5b table cover every call site
  that exists at `ace313f`; needing a sixth means the file drifted or the seam is
  wrong. Stop and report rather than exporting setters.
- **`FileTreeView.tsx` is still over 2,200 lines after Step 6.** Report it. Do
  not open the keyboard-navigation cluster to hit a number.
- **A lint warning appears in a file you edited.** The only warnings this repo
  tolerates in `packages/tree` are the three `unicorn(no-new-array)` ones in
  `utils/path-store/static-store.ts`, which you must not touch.

## Deferred, and why

Recorded so nobody re-audits these and so the next agent does not think they
were missed.

- **`SearchSession` / `RenameSession` / `SelectionModel` collaborator objects in
  `FileTreeController`.** The audit finding assumed these were closed
  subsystems. They are not — see "The controller" in Current state for the
  line-level evidence (`#restoreSearchExpandedPaths` reads `#selectedPaths`,
  `#syncSearchVisibilityState` writes the shared `#visibleCount`,
  `startRenaming` calls `#applySelection` and `#setSearchState`,
  `#completeRenaming` calls `this.move`). Extracting them today means ~10
  callbacks from each collaborator back into the controller, which is a worse
  object graph than the 47-field class. **Revisit only after a caller-driven
  reason to change search or rename behaviour appears**, and re-derive the seam
  from the code then.
- **`getVisibleRows` (`FileTreeController.ts:498-597`) and its three
  implementations.** Real complexity, but it is the hottest read path in the
  package, there is no benchmark, and `AGENTS.md` requires a measurement before
  optimization work. Touching it in the same pass as a 3,555-line view refactor
  would also make the diff unreviewable.
- **The `useLayoutEffect` count itself.** This plan reduces the _file_ to five
  focused modules but does not merge or reorder effects. Effect merging changes
  execution order and is a separate, independently-verified change.
- **The `touchCleanupRef` teardown when drag-and-drop is disabled** (Step 4's
  first trap). The window-`dragend` effect at `FileTreeView.tsx:3023-3039` is the
  only unmount path that calls `clearTouchDragResources()`, and it early-returns
  when `dragAndDropEnabled` is false — so a long-press started with the feature
  off can leave `document` listeners behind. Plausible bug, but fixing it inside
  a behaviour-preserving refactor makes the refactor unverifiable. Report it; fix
  it separately.

## Maintenance notes

For whoever owns this code next:

- **What a reviewer should scrutinize, in order**: (1) that Step 2's union is
  genuinely equivalent to the three refs — read the settle block diff first;
  (2) that `activeContextMenuKey` is still a derived string and its effect is
  still keyed on it; (3) that no `useLayoutEffect` dependency array changed;
  (4) that `FileTreeViewProps` is byte-identical.
- **The dependency arrays are the fragile part.** Several effects list a dozen
  values. When code moves into a hook, it is very easy to "tidy" a dependency
  and change when an effect fires. That is why the Done criteria include a
  no-dependency-change check.
- **Later work that interacts with this**: plans 009–012 (the folder reorg,
  Phase 4) will move files around `apps/web`; they do not touch `packages/tree`,
  but the new `hooks/useFileTree*.ts` files become public exports the moment they
  exist, so a future `knip` run will list them if nothing outside the package
  imports them. That is expected — they are internal to the Preact view and only
  exported because the package uses wildcard exports.
- **If `packages/tree` ever gains a real browser-test story**, the manual checks
  in Step 7 are the exact five scenarios to automate first; they are the
  behaviours this refactor put at risk and the ones the current 9-case suite does
  not cover.
- **The file's TODO must be rewritten, not deleted** (Done criteria). Leaving the
  original list in place would send the next agent back at the already-extracted
  rename cluster.
