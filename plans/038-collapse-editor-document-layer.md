# Plan 038: Collapse the editor document layer

## CORRECTION — 2026-08-17, at `b467b3f` (read this before anything else)

**This plan was previously dispatched and came back BLOCKED without doing any
work.** It was not blocked by the code. It was blocked by its own Step 0 gate,
which demanded the literal summary lines `Test Files 244 passed (244)` /
`Tests 1764 passed (1764)`. Those numbers were measured at `ace313f`; plans
013–035 then landed and changed every one of them. The executor hit the Step 0
STOP on the first command and never reached the refactor. Nothing about the
analysis below was wrong — the arithmetic assertion was.

What changed in this revision:

1. **Absolute test counts are no longer done criteria — anywhere.** Step 0 now
   captures a **baseline snapshot** to `/tmp/`, and every later gate is a
   **delta** against that snapshot: _no test that passed before may fail after,
   and no new lint error may appear._ A count you read in this document is
   context, never a gate.
2. **`bun run verify` is no longer a gate.** It runs the whole monorepo and
   short-circuits, so one unrelated failure anywhere makes it unreachable and it
   proves nothing about this change. Use the per-workspace `typecheck` / `lint` /
   `format:check` / `test` scripts in `apps/web`, compared to the Step 0
   snapshot.
3. **Known pre-existing failure — expect it, do not fix it, do not let it block
   you.** At `b467b3f`, `cd apps/web && bun run test` reports
   `1 failed | 1795 passed (1796)`. The single failure is
   `src/features/settings/tests/page.test.tsx > refuses an application-scoped key from the workspace tab, and says why`.
   It is a one-line test-query defect with no relation to this plan:
   `getByText(/can only be set in User settings/)` now matches **two** elements
   ("application settings can only be set in User settings" and "machine
   settings can only be set in User settings") because a second scope-restricted
   row became visible. It is tracked separately. It must appear in your Step 0
   snapshot, and it must still be the **only** failure at the end. Do not touch
   `apps/web/src/features/settings/**` — it is out of scope.
4. **One file in scope moved.** `apps/web/src/keymap/commands.ts` was split after
   `ace313f`; the single 2-argument `forceReplaceLiveEditorDocument` call site
   this plan edits now lives at
   **`apps/web/src/keymap/workspace-commands.ts:97`**, inside the same
   `revertSelectedEditorDocument` function (the `const path` it must keep is on
   line 91, and `fetchFile(path, …)` on line 94). Substitute that path wherever
   this plan says `keymap/commands.ts`. Re-verified at `b467b3f`: the other seven
   in-scope files are byte-identical to `ace313f`, `fallbackDocumentPath` is
   still confined to the three files named in Fact 3, and
   `editor-dirty-paths.ts` still has zero importers.
5. **The working tree is now clean.** The "~19 modified files" note below was
   true at `ace313f` and is not true at `b467b3f`. The snapshot-diff mechanic in
   the Done criteria still works unchanged — it just starts from an empty
   snapshot.
6. **Line numbers and counts throughout this document were measured at
   `ace313f`.** Every one that is still load-bearing now comes with the command
   that re-derives it. Treat any bare number as approximate and re-derive before
   relying on it.

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If anything in the "STOP conditions" section occurs, stop and report —
> do not improvise. When done, update the status row for plan 038 in
> `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat ace313f..HEAD -- \
>   apps/web/src/features/editor/state/workspace-document-service.ts \
>   apps/web/src/features/editor/state/editor-document-state.tsx \
>   apps/web/src/features/editor/state/editor-commands.ts \
>   apps/web/src/features/editor/state/editor-dirty-paths.ts \
>   apps/web/src/features/editor/state/editor-fallback-path.ts \
>   apps/web/src/features/editor/tests/editor-document-state.test.ts \
>   apps/web/src/hooks/use-workspace-events.ts \
>   apps/web/src/keymap/workspace-commands.ts
> ```
>
> Expected output at `b467b3f`: **nothing.** (The eighth file this plan touches,
> `apps/web/src/keymap/commands.ts`, _did_ change — it was split, and the call
> site moved to `keymap/workspace-commands.ts`, which is why the path above is
> already corrected. See correction item 4.) If any file in the list above has
> changed since you read this, compare the "Current state" excerpts below against
> the live code before proceeding; on a mismatch, treat it as a STOP condition.
>
> **The working tree should be clean at `b467b3f`** (it was not at `ace313f`, when
> this plan was written — hence the snapshot mechanic below, which is harmless
> either way). If the tree is dirty, do **not** revert, stash, commit, or format
> anything you did not create. Record the starting state before you touch
> anything:
>
> ```bash
> git status --porcelain > /tmp/plan-038-before.txt
> ```
>
> Every "files you changed" check in this plan is a diff against that file, not
> against a clean tree.

## Status

- **Priority**: P3
- **Effort**: L
- **Risk**: MED
- **Depends on**: none (the editor test suites this plan uses as its gate already exist)
- **Category**: complexity
- **Planned at**: commit `ace313f`, 2026-08-16

**Effort note, so you can plan your time honestly**: the mechanical work here is
closer to M — roughly 170 net lines removed across 8 files, all of it
typecheck-guided. The L rating is about _blast radius_, not typing: several dozen
modules import `editor-document-state.tsx`, and the store's action surface is the
API that all of them use. Re-derive the importer count yourself rather than
trusting a number in this document — it drifts with every plan that lands:

````bash
grep -rln "features/editor/state/editor-document-state" apps/web/src apps/web/test --exclude-dir=dist | wc -l
``` Every step below is designed to keep the tree green, so
you can stop after any step and the app still builds.

## Why this matters

One editor document currently exists in three shapes at the same time: the
service's `Map` of records, a `WeakMap`-cached "projection" of each record into a
field-identical object, and a wholesale zustand mirror of the service's state.
The projection layer is pure ceremony — the record types declare exactly the same
six fields as the public types, and the comment above `state()` already says
records are replaced on write and never mutated, so the identity the `WeakMap`
"preserves" was never at risk. On top of that, two modules in this feature are
dead: `editor-dirty-paths.ts` has zero importers and is duplicated verbatim as
three private methods of the service, and `fallbackDocumentPath` — the one piece
of state the store genuinely owns — has had **no reader** since its last consumer
(`components/workspace/file-viewer.tsx`) was deleted; it is a closed loop that
computes itself and is never rendered.

After this plan there is exactly one representation of a document: the object the
service stores. The store's state type _is_ the service's state type, so a new
field can only be declared once, and every store action is "mutate the service,
then publish its state". That closes theme **T1 — Parallel hand-maintained
representations of one truth** for this feature, and takes two files off the
**T4 — exported-but-unreachable surface** list.

## Relationship to `PLAN.md` (read this before you start)

`PLAN.md` at the repo root is a 12-week state-correctness roadmap. This plan is a
**step toward it, not a competing design**. Three lines matter, quoted verbatim:

- `PLAN.md:22` — "Keep Zustand only for UI projections and ephemeral UI state. It
  should subscribe to domain services, not own domain facts."
- `PLAN.md:35` (Weeks 2–3) — "Migrate editor document state behind an adapter so
  existing UI can read projections while writes go through the service."
- `PLAN.md:74` (Week 12) — "Delete compatibility shims for old per-tab document
  sessions, old dirty sets, timing-based sync fallbacks, and obsolete
  command/focus paths."

The adapter from line 35 shipped. The deletion from line 74 never happened. This
plan performs the part of that deletion that is safe today (the identity
projections, the orphaned dirty-set module, the dead fallback path) and moves the
store to the line-22 shape. It does **not** attempt the `CommandBus`,
`FocusService`, or `WorkerManager` work — those stay on the roadmap.

**This is an absorption, not a demolition.** Do not delete
`editor-document-state.tsx` or its zustand store. It is the React subscription
surface for several dozen importers (32 at `ace313f` — approximate, re-derive with
the `grep -rln … | wc -l` in the effort note), and `subscribeWithSelector` is what
`use-workspace-cache-persistence.ts` uses to persist scroll positions. The store
stays; what leaves it is state ownership.

## Current state

### The files

Line counts and action counts below were measured at `ace313f` and confirmed
unchanged at `b467b3f` for these seven files; the eighth row's path is corrected.
They are orientation, not assertions — `wc -l` on the list is the source of truth.

| File                                                                           | Role                                                                                                             |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/features/editor/state/workspace-document-service.ts` (647 lines) | Owns the documents. Contains the duplicate record types and the two `WeakMap` projection caches.                 |
| `apps/web/src/features/editor/state/editor-document-state.tsx` (216 lines)     | The zustand store: ~19 actions, most of them thin wrappers over the service; owns the dead `fallbackDocumentPath`. |
| `apps/web/src/features/editor/state/editor-commands.ts` (511 lines)            | The only reader/writer of `fallbackDocumentPath` outside the store.                                              |
| `apps/web/src/features/editor/state/editor-dirty-paths.ts` (26 lines)          | Zero importers. Duplicated privately inside the service.                                                         |
| `apps/web/src/features/editor/state/editor-fallback-path.ts` (14 lines)        | Only imported by `editor-commands.ts`, only to feed the dead loop.                                               |
| `apps/web/src/hooks/use-workspace-events.ts`                                   | Two call sites pass `selectedFilePath` into `forceReplaceLiveEditorDocument`.                                    |
| `apps/web/src/keymap/workspace-commands.ts` (was `keymap/commands.ts` at `ace313f`) | One call site does the same, at `:97`.                                                                       |

### Fact 1 — the record types are field-identical to the public types

`workspace-document-service.ts:30-44` (public):

```ts
export type LiveEditorDocument = {
  buffer: EditorTextBuffer
  contentRevision: string
  id: string
  localRevision: number
  path: string
  sync: LiveDocumentSync
}

export type EditorDocumentView = {
  documentId: string
  scrollPosition?: EditorScrollPosition
  tabId: string
  view: EditorViewSession
}
````

`workspace-document-service.ts:66-80` (private — same fields, plus `readonly`):

```ts
type LiveEditorDocumentRecord = {
  readonly buffer: EditorTextBuffer
  readonly contentRevision: string
  readonly id: string
  readonly localRevision: number
  readonly path: string
  readonly sync: LiveDocumentSync
}

type EditorDocumentViewRecord = {
  readonly documentId: string
  readonly scrollPosition?: EditorScrollPosition
  readonly tabId: string
  readonly view: EditorViewSession
}
```

### Fact 2 — the two `WeakMap`s preserve identity the records already had

`workspace-document-service.ts:94-98`:

```ts
  private readonly liveDocumentProjectionCache = new WeakMap<
    LiveEditorDocumentRecord,
    LiveEditorDocument
  >()
  private readonly viewProjectionCache = new WeakMap<EditorDocumentViewRecord, EditorDocumentView>()
```

`workspace-document-service.ts:511-539`:

```ts
  private liveDocumentProjection(document: LiveEditorDocumentRecord): LiveEditorDocument {
    const cached = this.liveDocumentProjectionCache.get(document)
    if (cached) return cached

    const projection: LiveEditorDocument = {
      buffer: document.buffer,
      contentRevision: document.contentRevision,
      id: document.id,
      localRevision: document.localRevision,
      path: document.path,
      sync: document.sync,
    }
    this.liveDocumentProjectionCache.set(document, projection)
    return projection
  }

  private viewProjection(view: EditorDocumentViewRecord): EditorDocumentView {
    const cached = this.viewProjectionCache.get(view)
    if (cached) return cached

    const projection: EditorDocumentView = {
      documentId: view.documentId,
      scrollPosition: view.scrollPosition,
      tabId: view.tabId,
      view: view.view,
    }
    this.viewProjectionCache.set(view, projection)
    return projection
  }
```

The doc comment at `workspace-document-service.ts:377-383` already states why the
caches are redundant:

```
   * Records are replaced on write, never mutated in place, so unchanged
   * entries keep their identity and projections memoize on the record object
   * itself. A slice is reused wholesale when every entry survives, which lets
   * high-frequency writes (per-frame scroll position updates) notify the
   * store without re-rendering subscribers of unrelated slices.
```

Every guarantee in that comment comes from _replacing records instead of mutating
them_. Nothing in it needs a `WeakMap`.

### Fact 3 — `fallbackDocumentPath` is write-only state

The store declares it at `editor-document-state.tsx:33`, initialises it at `:110`,
maintains it in four action bodies (`:130-131`, `:145-146`, `:186-187`,
`:195-197`), and exposes a setter at `:208`:

```ts
      setFallbackDocumentPath: (fallbackDocumentPath) => set({ fallbackDocumentPath }),
```

`editor-commands.ts` is the only other module that touches it, at exactly three
places — `:167-173` (inside `openEditorPathSurface`), `:456-462` (inside
`selectTab`), and `:500-511`:

```ts
function updateFallbackForClosedPath(
  path: string,
  selectedFilePath: string | null,
  documentStore: EditorDocumentStoreApi,
) {
  const document = documentStore.getState()
  if (document.fallbackDocumentPath !== path) return

  document.setFallbackDocumentPath(
    fallbackDocumentPathForSelection(document.hasLiveEditorDocument, selectedFilePath, null),
  )
}
```

`fallbackDocumentPathForSelection` (`editor-fallback-path.ts:1-14`) reads the
current value and returns the next one. **The value is never rendered, never
persisted, never asserted, and never read by anything except the code that
writes it.** Its last real consumer was
`apps/web/src/components/workspace/file-viewer.tsx:57-58,103-104`, deleted before
commit `d0c5436`; the tests that covered it were deleted in commit `21d30b5`.
Step 2 makes you re-prove this with a grep before anything is removed.

### Fact 4 — `editor-dirty-paths.ts` is dead and duplicated

The whole file (`editor-dirty-paths.ts:1-26`) exports `updateDirtyFilePaths`,
`removeDirtyFilePath`, `renameDirtyFilePath`. Repo-wide there is no importer —
the only other mention is a line in a dated knip-run record,
`docs/chat-and-logs-wiring-notes.md:61`. The same logic lives privately in the
service at `workspace-document-service.ts:569-592` as `renameDirtyPath`,
`addDirtyPath`, `deleteDirtyPath`.

### Fact 5 — the store re-declares the service's state type

`workspace-document-service.ts:57-64`:

```ts
export type WorkspaceDocumentServiceState = {
  documentContentRevisions: Readonly<Record<string, string>>
  dirtyContentRevision: number
  dirtyFilePaths: ReadonlySet<string>
  liveDocumentsById: Readonly<Record<string, LiveEditorDocument>>
  scrollPositionByTabId: Readonly<Record<string, EditorScrollPosition>>
  viewsByTabId: Readonly<Record<string, EditorDocumentView>>
}
```

`editor-document-state.tsx:29-37` — the same six fields written out again, plus
the dead one:

```ts
type EditorDocumentStoreState = {
  documentContentRevisions: Readonly<Record<string, string>>
  dirtyContentRevision: number
  dirtyFilePaths: ReadonlySet<string>
  fallbackDocumentPath: string | null
  liveDocumentsById: Readonly<Record<string, LiveEditorDocument>>
  scrollPositionByTabId: Readonly<Record<string, EditorScrollPosition>>
  viewsByTabId: Readonly<Record<string, EditorDocumentView>>
}
```

Once `fallbackDocumentPath` is gone, these are the same type written twice.

### Fact 6 — the store's `getEditorViewDocument` has zero external callers

`editor-document-state.tsx:152-165` composes a view+document result by hand:

```ts
      getEditorViewDocument: (tabId) => {
        const view = get().viewsByTabId[tabId]
        if (!view) return null

        const document = get().liveDocumentsById[view.documentId]
        if (!document) return null

        return {
          ...document,
          scrollPosition: view.scrollPosition,
          tabId,
          view: view.view,
        }
      },
```

`grep -rn "getEditorViewDocument" apps/web/src apps/web/test` returns hits only
inside `editor-document-state.tsx` itself (lines 53, 119, 124, 152), where it is
used to re-derive the value that `service.ensureView` / `service.ensureViewForDocument`
already returned.

### Fact 7 — `hasLiveEditorDocument` reads the service while its siblings read the mirror

`editor-document-state.tsx:166-167`:

```ts
      getLiveEditorDocument: (documentId) => get().liveDocumentsById[documentId] ?? null,
      hasLiveEditorDocument: (documentId) => service.hasLiveDocument(documentId),
```

Once the projections are gone these two read paths return literally the same
object, which is what makes it safe to standardise all reads on the service.

### The 2-argument call sites that must be updated

`editor-document-state.tsx:126` and `:140` declare an optional `selectedFilePath`
parameter that exists **only** to feed `fallbackDocumentPath`. Callers:

- `apps/web/src/hooks/use-workspace-events.ts:95-98`

  ```ts
        forceReplaceLiveEditorDocument: (file) =>
          documentStore
            .getState()
            .forceReplaceLiveEditorDocument(file, workspaceStore.getState().selectedFilePath),
  ```

- `apps/web/src/hooks/use-workspace-events.ts:131-134` — byte-identical to the above.
- `apps/web/src/keymap/workspace-commands.ts:97` (this was `keymap/commands.ts:477`
  at `ace313f`; the file was split, the function was not changed)

  ```ts
  documentStore.getState().forceReplaceLiveEditorDocument(file, path)
  ```

Re-derive the full call-site list before you edit, since a later plan may split a
file again:

```bash
grep -rn "forceReplaceLiveEditorDocument(file, \|forceReplaceLiveEditorDocument(\s*file,\|ensureLiveEditorDocument(file, " apps/web/src apps/web/test --exclude-dir=dist
```

Three 2-argument sites were present at both `ace313f` and `b467b3f`; if you find a
fourth, that is a STOP condition.

`ensureLiveEditorDocument`'s second parameter has **no** caller that passes it —
at `ace313f` the only call sites were `file-sync-service.test.ts:13` and `:49`,
both 1-argument. Confirm with the grep above rather than trusting those line
numbers.

### Repo conventions that apply here

Quoted verbatim from `/Users/shaul/Desktop/D/platform/AGENTS.md`, because you have
not read that file:

- "This project is greenfield and not live: no releases, no external users, no
  data anyone needs migrated."
- "No backward compatibility shims, no legacy aliases, no deprecation windows.
  Update every call site in the same pass."
- "Remove duplicate code aggressively."
- "Delete obsolete tests instead of preserving old behavior."
- "Stores are stateful, so they never go in `utils/`. Where they do live is
  flexible: `state/`, or co-located with the provider or feature code that owns
  them."
- "Import exact files through `@/`. Do not add barrel `index.ts` files."
- "Use guard clauses and early returns. Keep the happy path shallow." / "Keep
  nesting depth to 3 or less." / "Do not use `else` after an early return." /
  "Never use nested ternaries."
- "Treat readonly/mutable mismatches as contract bugs first." / "Do not copy
  containers just to satisfy TypeScript." / "If a callee does not mutate a value,
  make its parameter or model type accept readonly data." / "Avoid fake fixes
  like `sizes: [...node.sizes]`."
- "Never throw `new Error`. Create errors with `createError` from `evlog` — in
  practice through the feature's `structured-errors.ts` wrapper." (This file
  already uses `createClientInvariantError` from `@/lib/structured-errors`. Keep
  using it; do not introduce `new Error`.)
- "Logging is wide-event style (evlog). Always prefer wide logs." (This change is
  behaviour-preserving — **add no log lines**.)
- "Avoid manual React memoization. Do not add `memo`, `useMemo`, or
  `useCallback`."
- "A dev server is always running. Never spin up your own server to test or
  verify changes — reuse the running one." (It is at http://localhost:5173.)
- "Import `{ test, expect }` from `apps/web/test/fixtures.ts`, not from
  `vitest`, for app tests." — note the file you extend,
  `tests/editor-document-state.test.ts`, currently imports
  `{ describe, expect, it }` from `vitest` because it touches no server and no
  DOM. **Match the file you are editing**; do not convert it.
- "Do not `mock.module` or `vi.mock` our server, client, or feature modules."

TypeScript settings that will bite you (`apps/web/tsconfig.app.json`):
`"noUnusedLocals": true` and `"noUnusedParameters": true`. Deleting a use makes
the declaration a hard error. That is the feature you will lean on in step 3 —
**never silence it by renaming a parameter to `_something`; delete it.**

## Commands you will need

Run these from the repo root unless the command says otherwise.

| Purpose                          | Command                                                                                | Expected on success                                                                                         |
| -------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Typecheck the web app            | `cd apps/web && bun run typecheck`                                                     | exit 0, no output after the `$ tsgo --build` echo                                                           |
| Editor tests (fast loop)         | `cd apps/web && bun --bun vitest run --project node --project dom src/features/editor` | every test that passed in your Step 0 editor-filter snapshot still passes; after step 7 the total is **+3** |
| Full web tests                   | `cd apps/web && bun run test`                                                          | same failures as your Step 0 snapshot and no others; after step 7 the passing total is **+3**               |
| Lint                             | `cd apps/web && bun run lint`                                                          | no error that is not already in your Step 0 lint snapshot                                                   |
| Format check                     | `cd apps/web && bun run format:check`                                                  | exit 0                                                                                                      |
| Format (only if the check fails) | `../../node_modules/.bin/oxfmt --write <the files you edited>`                         | rewrites only those files                                                                                   |

`bun run test` in `apps/web` is `bun --bun vitest run --project node --project dom`
— the two spellings are interchangeable; use `bun run test` so the projects can
never drift out of sync with this document.

**There is no whole-repo gate in this plan.** Do **not** run `bun run verify` as a
gate: it typechecks, lints and tests every workspace and short-circuits on the
first failure, so an unrelated red elsewhere in the monorepo makes it unreachable
while proving nothing about this change. The `apps/web` scripts above are the
gate, and they are judged as deltas against Step 0.

**Do not run `bun run format` (`oxfmt --write .`) in `apps/web`, and never run it
from the repo root.** The working tree already carries unrelated in-progress
settings edits; a directory-wide rewrite would reformat those files too and blow
past this plan's scope. Format the specific files you edited, by path.

Notes on the test commands:

- **Absolute totals are not gates.** Any count in this document was measured at
  `ace313f`; plans 013–035 changed all of them, and the next plan to land will
  change them again. The only valid gate is the delta against the Step 0 snapshot
  you take on your own machine.
- The `--bun` flag is mandatory. Without it `bun:sqlite` and `Bun.spawn` do not
  resolve and unrelated suites fail. (`bun run test` already includes it.)
- The full run prints some `error: ECONNREFUSED` noise from MSW-adjacent
  teardown. That is pre-existing and is **not** a failure — judge by
  the `Test Files … passed` / `Tests … passed` summary lines only.
- The full run also has **one real pre-existing failure** at `b467b3f`:
  `src/features/settings/tests/page.test.tsx > refuses an application-scoped key from the workspace tab, and says why`.
  See correction item 3. Capture it in Step 0 and ignore it thereafter; fixing it
  is out of scope.
- The full run takes ~100s. Use the `src/features/editor` filter for the inner
  loop and run the full suite at the gates listed below.
- Do **not** run `bun run test:browser`. No file in scope is a `*.browser.tsx`
  test, and that project is known to hang at the RUN banner in this repo. If you
  believe you need it, that is a STOP condition.

## Scope

**In scope** (the only files you may modify or delete):

- `apps/web/src/features/editor/state/workspace-document-service.ts` — modify
- `apps/web/src/features/editor/state/editor-document-state.tsx` — modify
- `apps/web/src/features/editor/state/editor-commands.ts` — modify
- `apps/web/src/features/editor/state/editor-dirty-paths.ts` — **delete**
- `apps/web/src/features/editor/state/editor-fallback-path.ts` — **delete**
- `apps/web/src/hooks/use-workspace-events.ts` — modify (2 call sites only)
- `apps/web/src/keymap/workspace-commands.ts` — modify (1 call site only, `:97`; this
  was `apps/web/src/keymap/commands.ts:477` at `ace313f`)
- `apps/web/src/features/editor/tests/editor-document-state.test.ts` — modify (add 3 tests)
- `plans/README.md` — the status row for 038, at the very end

**Out of scope** (do NOT touch, even though they look related):

- `apps/web/src/features/settings/**`, and in particular
  `tests/page.test.tsx`. Its one failing case is the known pre-existing defect in
  correction item 3. It is tracked separately. Fixing it here would put a
  settings-feature file in this plan's diff and trip the scope check.
- `packages/editor-*` — these are symlinks into a sibling `../../Editor` checkout,
  not part of this repo's workspaces. Editing them edits someone else's tree.
- `apps/web/src/features/editor/state/editor-workspace-state.tsx`,
  `editor-ui-state.tsx`, `editor-conflict-state.tsx` — sibling stores with the
  same shape. Collapsing them is a separate decision; touching them triples the
  blast radius of this change.
- `apps/web/src/hooks/workspace-event-conflict-adapter.ts` — its context type
  already declares `forceReplaceLiveEditorDocument: (file: FileResult) => …`
  (1 argument, line 26). It needs no edit; if it does, you changed a signature
  you should not have.
- `apps/web/src/features/search/**` — imports only the `LiveEditorDocument`
  _type_. Adding `readonly` must not require a change there; if it does, STOP.
- `apps/web/src/features/editor/utils/document-retention.ts` and
  `tests/document-retention.test.ts` — retention _policy_, unrelated to
  representation. Leave alone.
- Any file rename or folder move. `plans/010` owns the `state/` renames
  (including the `editor-dirty-paths.ts` → `dirty-paths.ts` row); doing them here
  guarantees a conflict.
- `PLAN.md` — a roadmap document, not something executors edit.
- `docs/chat-and-logs-wiring-notes.md` (line 61 lists `editor-dirty-paths.ts` in
  a dated knip-run record) and `docs/router-everything-linkable-plan.md`
  (`editor-document-state.tsx:24-27` line refs, already stale at `ace313f`).
  Both are historical records of a past run, not live pointers.
- `.claude/worktrees/**` — a separate git worktree with its own copy of these
  files. Never edit it.
- `apps/web/dist/**` — build output committed in the tree; a grep for any symbol
  in this plan will hit it. Ignore every `dist/` hit.
- `apps/server/**`, `packages/**` — nothing in this change crosses the wire.
- **The `useMemo` at `editor-commands.ts:85`** (inside `useEditorCommands`). AGENTS.md
  says "Avoid manual React memoization", which makes this tempting to delete while
  you are already editing the file. It is a required stable identity — the commands
  object is passed into contexts and effect dependency arrays. Leave it exactly as
  is; removing it is a separate, behaviour-changing decision.
- **`WorkspaceDocumentService.getViewDocument` (`workspace-document-service.ts:256-261`)**.
  Its only caller is `document-retain.test.ts:52-53`. It looks like dead code after
  step 4 and it is not — it is the assertion vehicle for the "no view survives its
  document" invariant. Do not delete it, and do not "clean it up".
- Any new `memo`/`useMemo`/`useCallback`, any new log event, any new settings key.
- Reformatting, re-sorting imports, or otherwise touching lines you did not have to
  change, in any file — including the eight in scope.

## Git workflow

**All work happens on `main`** — no new branches, worktrees, commits, pushes, or
PRs unless the operator explicitly asks for them.

If the operator does ask for commits: conventional commits, lowercase descriptive
subject. Real examples from `git log`:

```
refactor(orchestration): the server prepares a session's worktree (M-C)
fix(address): bound the URL, and stop escaping slashes in ?tabs=
```

A fitting subject for this work: `refactor(editor): one representation per document`.

## Steps

### Step 0: Capture the baseline before changing anything

Every later step compares against **your own** snapshot, not against a number
printed in this document. Nothing is modified in this step.

```bash
cd apps/web && bun run typecheck
cd apps/web && bun run test 2>&1 | tail -40 > /tmp/plan-038-test-before.txt
cd apps/web && bun --bun vitest run --project node --project dom src/features/editor 2>&1 | tail -20 > /tmp/plan-038-editor-test-before.txt
cd apps/web && bun run lint 2>&1 | tail -20 > /tmp/plan-038-lint-before.txt
cd apps/web && bun run format:check 2>&1 | tail -20 > /tmp/plan-038-format-before.txt
```

Read all four snapshots and write down, for yourself:

- the `Test Files …` / `Tests …` summary lines from each test snapshot;
- **the full name of every failing test**, so you can tell a pre-existing failure
  from one you caused;
- the lint error and warning counts.

**The gate is a delta, never a total:**

- `bun run typecheck` must exit 0 **now**. If it does not, that is a real blocker
  — STOP and report, because this whole refactor is typecheck-guided.
- Any test that **passes** in the snapshot must still pass at every later gate.
- Any test that **fails** in the snapshot is not yours and must not block you. At
  `b467b3f` there is exactly one, the settings `page.test.tsx` case in correction
  item 3. **Do not fix it. Do not let it stop you. Confirm it is in your snapshot
  and move on.**
- No lint **error** may appear that is not already in the lint snapshot.
- After step 7 the passing test total should be exactly **+3** (the three new
  invariant tests), with no other movement. Compute that against your snapshot;
  do not compare it to any number written in this plan.

**Do not STOP on a count mismatch against this document.** The counts here were
measured at `ace313f` and are stale by construction. Your snapshot is the
baseline.

### Step 1: Delete the orphaned dirty-path module

Delete `apps/web/src/features/editor/state/editor-dirty-paths.ts` outright. It has
no importers and its three functions are duplicated privately in the service at
`workspace-document-service.ts:569-592`.

**Verify** (run this _after_ the deletion):

```bash
grep -rn "editor-dirty-paths\|updateDirtyFilePaths\|removeDirtyFilePath\|renameDirtyFilePath" \
  apps packages scripts --exclude-dir=node_modules --exclude-dir=dist
```

→ **zero output.** (Before the deletion this prints four hits, all inside the file
you are deleting. `docs/chat-and-logs-wiring-notes.md:61` also mentions the file
but `docs` is not in the searched paths, and it is out of scope anyway.) Then:

```bash
cd apps/web && bun run typecheck
```

→ exit 0.

### Step 2: Prove `fallbackDocumentPath` has no reader (verification only — change nothing)

```bash
grep -rn "fallbackDocumentPath\|fallbackDocumentPathForSelection\|setFallbackDocumentPath" \
  apps packages scripts --exclude-dir=node_modules --exclude-dir=dist
```

**Expected**: every hit is in exactly one of these three files —

- `apps/web/src/features/editor/state/editor-document-state.tsx`
- `apps/web/src/features/editor/state/editor-commands.ts`
- `apps/web/src/features/editor/state/editor-fallback-path.ts`

**If a hit appears in any other file — a component, a hook, a test, a
persistence module — STOP and report.** The whole of step 3 rests on this grep.

### Step 3: Delete the write-only `fallbackDocumentPath` loop

Three sub-steps. Do them in order; the compiler drives the last one.

**3a — remove it from the store** (`editor-document-state.tsx`):

- Delete the `fallbackDocumentPath: string | null` line from
  `EditorDocumentStoreState` (line 33).
- Delete the `setFallbackDocumentPath` line from `EditorDocumentStoreActions`
  (line 74) and its implementation (line 208).
- Delete the `fallbackDocumentPath: null,` initialiser (line 110).
- Drop the `selectedFilePath` parameter from **both**
  `ensureLiveEditorDocument` and `forceReplaceLiveEditorDocument`, in the
  `EditorDocumentStoreActions` type (lines 43-46 and 48-51) and in the
  implementations. The two action bodies become:

  ```ts
        ensureLiveEditorDocument: (file) => {
          service.ensureLiveDocument(file)
          set({ ...service.state() })
          return get().liveDocumentsById[file.path]!
        },
        forceReplaceLiveEditorDocument: (file) => {
          const result = service.forceReplaceLiveDocument(file)
          if (result.changed) set({ ...service.state() })
          return { wasDirty: result.wasDirty }
        },
  ```

  Note the deliberate loss in the second one: the old guard was
  `if (result.changed || selectedFilePath === file.path)`. The
  `|| selectedFilePath === file.path` arm existed _only_ to publish a new
  `fallbackDocumentPath` when nothing about the document had actually changed.
  With the field gone that arm would publish an identical state object and force a
  pointless re-render, so it goes with it. Do not "restore" it.

- Turn `renameLiveEditorDocumentPath` and `retainEditorDocuments` back into plain
  pass-throughs (their `set((state) => …)` bodies existed only to patch the
  fallback):

  ```ts
        renameLiveEditorDocumentPath: (from, to) => {
          const result = service.renameLiveDocument(from, to)
          set({ ...service.state() })
          return result
        },
        retainEditorDocuments: (keep) => {
          const result = service.retain(keep)
          set({ ...service.state() })
          return result
        },
  ```

**3b — update the three 2-argument call sites**:

- `apps/web/src/hooks/use-workspace-events.ts:95-98` and `:131-134` — each
  becomes a direct reference, since the wrapper existed only to supply the second
  argument:

  ```ts
        forceReplaceLiveEditorDocument: documentState.forceReplaceLiveEditorDocument,
  ```

  (`documentState` is already `documentStore.getState()`, bound at the top of each
  of the two `useEffectEvent` bodies — `:86` and `:122`. The sibling properties in
  the very same object literal, `ensureUnsyncedEditorDocument` and
  `getLiveEditorDocument`, are already written this way, so this matches the file.
  This is **not** a stale-closure bug: zustand action properties are created once
  in the store initialiser and `set` only merges state, so the function identity
  never changes. The surrounding `WorkspaceConflictContext` type already declares
  this member as a 1-argument function — `workspace-event-conflict-adapter.ts:26` —
  so no type edits are needed.)

- `apps/web/src/keymap/workspace-commands.ts:97`, inside
  `revertSelectedEditorDocument` (this was `keymap/commands.ts:477` at `ace313f`) —

  ```ts
  documentStore.getState().forceReplaceLiveEditorDocument(file)
  ```

  Only the second argument is dropped. The local `const path` (line **91** at
  `b467b3f`) stays: it is still used by `fetchFile(path, …)` on line **94**.

**3c — delete the loop in `editor-commands.ts` and let the compiler unwind it**:

Delete, in this order:

1. The import on line 1:
   `import { fallbackDocumentPathForSelection } from '@/features/editor/state/editor-fallback-path'`
2. The whole `documentStore.setState({ fallbackDocumentPath: … })` block at
   `:167-173`, and the now-unused `const document = documentStore.getState()` at
   `:150`.
3. The whole `documentStore.setState({ fallbackDocumentPath: … })` block at
   `:456-462`, and the now-unused `const document = documentStore.getState()` at
   `:454`.
4. The entire `updateFallbackForClosedPath` function (`:500-511`, the last function
   in the file) and its two call sites at `:328` (in `closeTab`) and `:357` (in
   `discardLiveEditorDocument`). The `const selectedFilePath` local above each call
   site **stays** — `updateUiForClosedPath` on the preceding line still uses it.
5. The file `apps/web/src/features/editor/state/editor-fallback-path.ts`.

Now run `cd apps/web && bun run typecheck` and delete every unused parameter it
reports, then delete the corresponding argument at each call site, and repeat
until clean. **This is the exact, complete cascade — if the compiler asks you to
touch anything outside this list, STOP:**

| Function                         | Parameter to delete | Call sites to update                   |
| -------------------------------- | ------------------- | -------------------------------------- |
| `openEditorPathSurface` (`:144`) | `documentStore`     | `:113`, `:115`, `:119`, `:141`, `:216` |
| `selectFile` (`:134`)            | `documentStore`     | `:124`, `:374`, `:396`                 |
| `openDefinition` (`:210`)        | `documentStore`     | `:112`                                 |
| `reopenClosedEditor` (`:366`)    | `documentStore`     | `:120`                                 |
| `selectPreviousEditor` (`:384`)  | `documentStore`     | `:125`                                 |
| `selectTab` (`:440`)             | `documentStore`     | `:126`                                 |

`closeTab`, `discardLiveEditorDocument`, `renameLiveEditorDocument` and
`switchRootFolder` all keep their `documentStore` parameter — they use it for
`deleteLiveEditorDocument` / `removeEditorView` / `retainEditorDocuments` /
`renameLiveEditorDocumentPath`. The `documentStore` field of
`createEditorCommands`'s options object also stays (still used at `:103`, `:105`,
`:109`, `:122`, `:130`). **The exported `EditorCommands` type does not change.**

**Verify**:

```bash
cd apps/web && bun run typecheck
```

→ exit 0.

```bash
grep -rn "fallbackDocumentPath" apps packages scripts --exclude-dir=node_modules --exclude-dir=dist
```

→ zero output.

```bash
cd apps/web && bun run test 2>&1 | tail -40
```

→ compare against `/tmp/plan-038-test-before.txt`: **no test that passed there may
fail here, and no new failing test name may appear.** No test has been added yet,
so the passing total should equal the snapshot's. The known settings
`page.test.tsx` failure is expected to still be there; it is not yours.

### Step 4: Collapse the record/projection layer inside the service

All edits in `apps/web/src/features/editor/state/workspace-document-service.ts`.

**4a — make the public types the record types.** Add `readonly` to every field of
`LiveEditorDocument` (`:30-37`), `EditorDocumentView` (`:39-44`) and the three own
fields of `LiveEditorViewDocument` (`:46-50`). Then **delete**
`LiveEditorDocumentRecord` and `EditorDocumentViewRecord` (`:66-80`) and replace
every remaining mention of them with the public name. Per AGENTS.md, a callee that
does not mutate should accept readonly data — nothing in the repo assigns to a
document or view field (verified at `ace313f`), so this is a pure contract
tightening.

Result for `:30-50`:

```ts
export type LiveEditorDocument = {
  readonly buffer: EditorTextBuffer
  readonly contentRevision: string
  readonly id: string
  readonly localRevision: number
  readonly path: string
  readonly sync: LiveDocumentSync
}

export type EditorDocumentView = {
  readonly documentId: string
  readonly scrollPosition?: EditorScrollPosition
  readonly tabId: string
  readonly view: EditorViewSession
}

export type LiveEditorViewDocument = LiveEditorDocument & {
  readonly scrollPosition?: EditorScrollPosition
  readonly tabId: string
  readonly view: EditorViewSession
}
```

**4b — retype the maps and delete the caches.** `:86-87` become
`new Map<string, LiveEditorDocument>()` and `new Map<string, EditorDocumentView>()`.
Delete `liveDocumentProjectionCache` and `viewProjectionCache` (`:94-98`) and the
two methods `liveDocumentProjection` (`:511-525`) and `viewProjection` (`:527-539`).

**4c — replace every projection call with the value itself:**

- `ensureLiveDocument` (`:160-173`): the three
  `return this.liveDocumentProjection(x)` become `return existing` / `return existing` /
  `return record`.
- `ensureUnsyncedDocument` (`:180-192`): same treatment.
- `getLiveDocument` (`:242-247`) becomes:

  ```ts
    getLiveDocument(documentId: string): LiveEditorDocument | null {
      return this.liveDocumentsById.get(documentId) ?? null
    }
  ```

- `getView` (`:249-254`) becomes:

  ```ts
    getView(tabId: string): EditorDocumentView | null {
      return this.viewsByTabId.get(tabId) ?? null
    }
  ```

- `ensureViewForDocument` (`:194-214`): with the projection gone, the
  set-then-re-read-then-throw dance is pointless. Build the view once:

  ```ts
    ensureViewForDocument(tabId: string, documentId: string): LiveEditorViewDocument {
      const document = this.getRequiredLiveDocument(documentId)
      const existing = this.viewsByTabId.get(tabId)
      if (existing?.documentId === document.id) {
        return this.viewDocumentProjection(existing)
      }

      const scrollPosition = existing?.scrollPosition ?? this.scrollPositionSeeds.get(document.id)
      const view = createEditorViewSession(document.buffer, `tab:${tabId}`)
      view.setScrollPosition(scrollPosition)
      const nextView: EditorDocumentView = {
        documentId: document.id,
        scrollPosition,
        tabId,
        view,
      }
      this.viewsByTabId.set(tabId, nextView)

      return this.viewDocumentProjection(nextView)
    }
  ```

  This drops the `createClientInvariantError('editor view was not created')`
  branch. Keep the `createClientInvariantError` import — `getRequiredLiveDocument`
  (`:552-559`) still uses it, and that one guards a real invariant.

- `viewDocumentProjection` (`:541-550`) keeps its name and its job (it composes a
  view with its document); only its parameter type changes to
  `EditorDocumentView`, and `...this.liveDocumentProjection(document)` becomes
  `...document`.

**4d — retype the remaining signatures** (mechanical; `tsgo` will point at each):
`markSaved`'s `const synced: LiveEditorDocument` (`:286`),
`createFileDocumentRecord` / `createUnsyncedDocumentRecord` / `replacementRecord`
return types and `existing` parameter, `getRequiredLiveDocument`'s return type,
and the module-level `fileSyncVersion(document: LiveEditorDocument | undefined)`
(`:615`).

**4e — collapse `projectedRecord` into an identity `recordFromMap`.** Replace
`projectedRecord` (`:633-647`) with:

```ts
/**
 * A Map rendered as a plain record for zustand selectors. Values are passed
 * through untouched — the Map already holds the only representation — and the
 * previous record is reused wholesale when every entry survived, so a
 * high-frequency write (per-frame scroll position) does not invalidate
 * subscribers of unrelated slices.
 */
function recordFromMap<T>(
  source: Map<string, T>,
  previous: Readonly<Record<string, T>> | undefined,
): Readonly<Record<string, T>> {
  let unchanged = previous !== undefined && Object.keys(previous).length === source.size
  const next: Record<string, T> = {}
  for (const [key, value] of source) {
    next[key] = value
    if (previous?.[key] !== value) unchanged = false
  }
  if (unchanged && previous) return previous
  return next
}
```

Delete the now-trivial `liveDocumentsState` (`:402-410`) and `viewsState`
(`:412-416`) and inline them into `state()`. Keep `scrollPositionsState` as it is
— it filters and rekeys, so it is not an identity projection. The new `state()`:

```ts
  /**
   * Documents and views are replaced on write, never mutated in place, so an
   * unchanged entry keeps its identity for free and a slice is reused wholesale
   * when every entry survives. That is what lets high-frequency writes
   * (per-frame scroll position updates) notify the store without re-rendering
   * subscribers of unrelated slices.
   */
  state(): WorkspaceDocumentServiceState {
    const previous = this.cachedState
    const viewsByTabId = recordFromMap(this.viewsByTabId, previous?.viewsByTabId)
    const next: WorkspaceDocumentServiceState = {
      documentContentRevisions: this.documentContentRevisions,
      dirtyContentRevision: this.dirtyContentRevision,
      dirtyFilePaths: this.dirtyFilePaths,
      liveDocumentsById: recordFromMap(this.liveDocumentsById, previous?.liveDocumentsById),
      scrollPositionByTabId: this.scrollPositionsState(
        viewsByTabId,
        previous?.scrollPositionByTabId,
      ),
      viewsByTabId,
    }
    this.cachedState = next
    return next
  }
```

**Verify**:

```bash
cd apps/web && bun run typecheck
```

→ exit 0.

```bash
grep -n "LiveEditorDocumentRecord\|EditorDocumentViewRecord\|liveDocumentProjection\|viewProjection\b\|projectedRecord\|WeakMap" \
  apps/web/src/features/editor/state/workspace-document-service.ts
```

→ **zero output.** (`viewDocumentProjection` survives on purpose and does not match
`viewProjection\b`.)

```bash
cd apps/web && bun --bun vitest run --project node --project dom src/features/editor
```

→ matches `/tmp/plan-038-editor-test-before.txt` exactly: same file count, same
passing total, no new failure. **The four identity assertions in
`tests/editor-document-state.test.ts` are the real gate here — if any of them
fails, the `WeakMap`s were load-bearing after all; STOP and report.**

### Step 5: Make the store a pure adapter

Rewrite `apps/web/src/features/editor/state/editor-document-state.tsx` to the
following. This is the complete target file — nothing else in it changes.

```tsx
import { clientErrors } from '@/lib/structured-errors'
import type { FileResult } from '@/lib/file-system-types'
import { type EditorScrollPosition } from '@singapor/core'
import { createContext, use } from 'react'
import { useStore } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { createStore, type Mutate, type StoreApi } from 'zustand/vanilla'
import type { DocumentRetention } from '@/features/editor/utils/document-retention'
import {
  WorkspaceDocumentService,
  type EditorDocumentView,
  type LiveEditorDocument,
  type LiveEditorViewDocument,
  type UnsyncedLiveEditorDocumentInput,
  type WorkspaceDocumentServiceState,
} from '@/features/editor/state/workspace-document-service'

export type { LiveEditorDocument, UnsyncedLiveEditorDocumentInput }

type DeleteLiveEditorDocumentResult = {
  hadLiveDocument: boolean
  wasDirty: boolean
}

type CreateEditorDocumentStoreOptions = {
  /** Scroll positions restored from the workspace cache, keyed by document path. */
  scrollPositionSeeds?: Readonly<Record<string, EditorScrollPosition>>
}

type EditorDocumentStoreActions = {
  deleteLiveEditorDocument: (documentId: string) => DeleteLiveEditorDocumentResult
  ensureEditorView: (tabId: string, file: FileResult) => LiveEditorViewDocument
  ensureEditorViewForDocument: (tabId: string, documentId: string) => LiveEditorViewDocument
  ensureLiveEditorDocument: (file: FileResult) => LiveEditorDocument
  ensureUnsyncedEditorDocument: (input: UnsyncedLiveEditorDocumentInput) => LiveEditorDocument
  forceReplaceLiveEditorDocument: (file: FileResult) => { wasDirty: boolean }
  getEditorView: (tabId: string) => EditorDocumentView | null
  getLiveEditorDocument: (documentId: string) => LiveEditorDocument | null
  hasLiveEditorDocument: (documentId: string) => boolean
  markLiveEditorDocumentSaved: (input: {
    documentId: string
    fileVersion: string
    mtimeMs: number
    savedContentRevision: string
    savedText: string
  }) => boolean
  recordLiveEditorDocumentTextChange: (documentId: string) => void
  removeEditorView: (tabId: string) => boolean
  renameLiveEditorDocumentPath: (from: string, to: string) => { wasDirty: boolean }
  /** Replaces the scroll-restore seeds (e.g. after a workspace switch). Not reactive. */
  seedEditorScrollPositions: (byPath: Readonly<Record<string, EditorScrollPosition>>) => void
  /** The single eviction path: everything outside the keep sets is dropped. */
  retainEditorDocuments: (keep: DocumentRetention) => {
    evictedDocumentIds: string[]
    evictedTabIds: string[]
  }
  setEditorViewScrollPosition: (tabId: string, scrollPosition: EditorScrollPosition) => void
  setLiveEditorDocumentDirty: (documentId: string, dirty: boolean) => void
}

/**
 * The service owns every document fact; this store owns none. Its state type is
 * the service's state type — so a field can only ever be declared once — and
 * every action is "mutate the service, then publish its state". Reads go to the
 * service rather than to the published copy, which is the same object either
 * way: the service hands out the stored document, not a projection of it.
 */
export type EditorDocumentStore = WorkspaceDocumentServiceState & EditorDocumentStoreActions

export type EditorDocumentStoreApi = Mutate<
  StoreApi<EditorDocumentStore>,
  [['zustand/subscribeWithSelector', never]]
>

export const EditorDocumentStateContext = createContext<EditorDocumentStoreApi | null>(null)

export function useEditorDocumentStoreApi() {
  const store = use(EditorDocumentStateContext)
  if (!store) {
    throw clientErrors.CONTEXT_MISSING({
      message: 'useEditorDocumentStoreApi must be used within EditorStateProvider',
    })
  }

  return store
}

export function useEditorDocumentState<T>(selector: (state: EditorDocumentStore) => T): T {
  return useStore(useEditorDocumentStoreApi(), selector)
}

export function createEditorDocumentStore(options: CreateEditorDocumentStoreOptions = {}) {
  const service = new WorkspaceDocumentService()
  if (options.scrollPositionSeeds) service.seedScrollPositions(options.scrollPositionSeeds)

  return createStore<EditorDocumentStore>()(
    subscribeWithSelector((set) => {
      const publish = () => set(service.state())

      return {
        ...service.state(),
        deleteLiveEditorDocument: (documentId) => {
          const result = service.deleteLiveDocument(documentId)
          publish()
          return result
        },
        ensureEditorView: (tabId, file) => {
          const viewDocument = service.ensureView(tabId, file)
          publish()
          return viewDocument
        },
        ensureEditorViewForDocument: (tabId, documentId) => {
          const viewDocument = service.ensureViewForDocument(tabId, documentId)
          publish()
          return viewDocument
        },
        ensureLiveEditorDocument: (file) => {
          const document = service.ensureLiveDocument(file)
          publish()
          return document
        },
        ensureUnsyncedEditorDocument: (input) => {
          const document = service.ensureUnsyncedDocument(input)
          publish()
          return document
        },
        forceReplaceLiveEditorDocument: (file) => {
          const result = service.forceReplaceLiveDocument(file)
          if (result.changed) publish()
          return { wasDirty: result.wasDirty }
        },
        getEditorView: (tabId) => service.getView(tabId),
        getLiveEditorDocument: (documentId) => service.getLiveDocument(documentId),
        hasLiveEditorDocument: (documentId) => service.hasLiveDocument(documentId),
        markLiveEditorDocumentSaved: (input) => {
          const marked = service.markSaved(input)
          publish()
          return marked
        },
        recordLiveEditorDocumentTextChange: (documentId) => {
          service.recordTextChange(documentId)
          publish()
        },
        removeEditorView: (tabId) => {
          const removed = service.removeView(tabId)
          if (removed) publish()
          return removed
        },
        renameLiveEditorDocumentPath: (from, to) => {
          const result = service.renameLiveDocument(from, to)
          publish()
          return result
        },
        retainEditorDocuments: (keep) => {
          const result = service.retain(keep)
          publish()
          return result
        },
        setEditorViewScrollPosition: (tabId, scrollPosition) => {
          const changed = service.setViewScrollPosition(tabId, scrollPosition)
          // Runs at scroll rate; service.state() keeps unchanged slices
          // referentially stable, so this notify only re-renders subscribers of
          // the scroll position itself.
          if (changed) publish()
        },
        seedEditorScrollPositions: (byPath) => service.seedScrollPositions(byPath),
        setLiveEditorDocumentDirty: (documentId, dirty) => {
          service.setDirty(documentId, dirty)
          publish()
        },
      }
    }),
  )
}
```

Three deliberate changes to call out, so you do not "restore" them by mistake:

1. **`EditorDocumentStoreState` is gone**, replaced by
   `WorkspaceDocumentServiceState`. That is the point of the plan.
2. **`getEditorViewDocument` is deleted.** It had no caller outside this file
   (Fact 6); `service.ensureView` / `service.ensureViewForDocument` already return
   the composed `LiveEditorViewDocument`, so the two `get().getEditorViewDocument(tabId)!`
   non-null assertions disappear with it.
3. **`get` is gone from the store initialiser signature.** Nothing reads the
   published copy any more. Leaving it would fail `noUnusedParameters`.

**Verify**:

```bash
cd apps/web && bun run typecheck
```

→ exit 0.

```bash
grep -rn "getEditorViewDocument\|EditorDocumentStoreState" apps/web/src apps/web/test
```

→ zero output.

```bash
cd apps/web && bun run test 2>&1 | tail -40
```

→ same delta rule as step 3: no previously-passing test may fail, no new failing
test name may appear, and the passing total is still the snapshot's (no test added
yet).

### Step 6: Rename the three now-misnamed private helpers

With the `…Record` types gone, "Record" in these names refers to nothing. In
`workspace-document-service.ts` rename, declaration and call sites in one pass:

- `createFileDocumentRecord` → `createFileDocument`
- `createUnsyncedDocumentRecord` → `createUnsyncedDocument`
- `replacementRecord` → `replacementDocument`

Leave the `const record = …` locals alone — renaming them adds diff noise without
adding meaning, and `const document` would shadow nothing but read no better next
to the existing `existing`.

**Verify**:

```bash
grep -n "Record" apps/web/src/features/editor/state/workspace-document-service.ts \
  | grep -v "Readonly<Record<"
```

→ **zero output.** (Capital-`R` `Record` should now survive only inside
`Readonly<Record<…>>`. The lowercase `recordFromMap` helper and the `const record`
locals do not match this grep and are meant to stay.)

```bash
cd apps/web && bun run typecheck && bun --bun vitest run --project node --project dom src/features/editor
```

→ typecheck exits 0; the editor run still matches
`/tmp/plan-038-editor-test-before.txt` (no test added yet).

### Step 7: Lock the single-representation invariant with three tests

Append three cases to the existing `describe` block in
`apps/web/src/features/editor/tests/editor-document-state.test.ts`. Model them on
the file's existing style exactly: `import { describe, expect, it } from 'vitest'`
is already at the top (this suite touches neither the server nor the DOM, so it
does not use `test/fixtures.ts`), and the local `fileResult(path)` helper at the
bottom of the file already builds the input.

These three assertions are the ones that would have been _false_ before this plan
if the projections had ever diverged, and they are what stops a future
contributor from reintroducing a second representation.

```ts
it('hands back the same document object through both read paths', () => {
  const store = createEditorDocumentStore()

  const returned = store.getState().ensureLiveEditorDocument(fileResult('/repo/a.ts'))

  expect(store.getState().getLiveEditorDocument('/repo/a.ts')).toBe(returned)
  expect(store.getState().liveDocumentsById['/repo/a.ts']).toBe(returned)
})

it('hands back the same view object through both read paths', () => {
  const store = createEditorDocumentStore()
  store.getState().ensureEditorView('tab-1', fileResult('/repo/a.ts'))

  const view = store.getState().getEditorView('tab-1')

  expect(view).not.toBeNull()
  expect(store.getState().viewsByTabId['tab-1']).toBe(view)
})

it('exposes one document object at the new path after a rename', () => {
  const store = createEditorDocumentStore()
  store.getState().ensureEditorView('tab-1', fileResult('/repo/a.ts'))

  store.getState().renameLiveEditorDocumentPath('/repo/a.ts', '/repo/b.ts')

  const renamed = store.getState().getLiveEditorDocument('/repo/b.ts')
  expect(renamed?.path).toBe('/repo/b.ts')
  expect(store.getState().liveDocumentsById['/repo/b.ts']).toBe(renamed)
  expect(store.getState().getLiveEditorDocument('/repo/a.ts')).toBeNull()
  expect(store.getState().hasLiveEditorDocument('/repo/a.ts')).toBe(false)
})
```

**Verify**:

```bash
cd apps/web && bun --bun vitest run --project node --project dom src/features/editor
```

→ same file count as `/tmp/plan-038-editor-test-before.txt`, passing total **+3**,
and the three new test names are the only additions. (At `ace313f` that read
`15 files, 88 → 91 tests`; those totals are stale — use your snapshot.)

### Step 8: Format, lint, delta-check, and one look at the running app

```bash
cd apps/web && bun run format:check && bun run lint
```

→ `format:check` exits 0, and `lint` reports **no error that is not already in
`/tmp/plan-038-lint-before.txt`**. A pre-existing lint error or warning recorded in
that snapshot is not yours to fix and does not block this plan; a **new** error
does. **If `format:check` fails, format only the files you edited** —
never the whole directory, because the tree carries unrelated in-progress edits:

```bash
cd apps/web && ../../node_modules/.bin/oxfmt --write \
  src/features/editor/state/workspace-document-service.ts \
  src/features/editor/state/editor-document-state.tsx \
  src/features/editor/state/editor-commands.ts \
  src/features/editor/tests/editor-document-state.test.ts \
  src/hooks/use-workspace-events.ts \
  src/keymap/workspace-commands.ts
```

Then re-run `bun run format:check` → exit 0.

```bash
cd apps/web && bun run typecheck
cd apps/web && bun run test 2>&1 | tail -40 > /tmp/plan-038-test-after.txt
diff /tmp/plan-038-test-before.txt /tmp/plan-038-test-after.txt
```

→ typecheck exits 0. The final delta rule:

- Every test that passed in `/tmp/plan-038-test-before.txt` still passes.
- The set of **failing test names** is unchanged — at `b467b3f` that means the one
  known settings `page.test.tsx` case and nothing else.
- The passing total is exactly **+3** over the snapshot, and the file count is
  unchanged (the three tests go into an existing file).

The `diff` will also show the totals moving by 3; that is the expected difference,
not a failure. **Do not run `bun run verify`** — see correction item 2.

Finally, a manual smoke test against the dev server that is **already running** —
do not start one:

1. Open http://localhost:5173.
2. Open a file from the tree; type a character; confirm the tab shows its dirty
   marker.
3. Save with the editor's save command; confirm the dirty marker clears.
4. Scroll the file, switch to another tab, switch back — the scroll position must
   be where you left it.
5. Close the tab and reopen the same file — the scroll position must still be
   restored.
6. Open the browser console and confirm no new errors.

Steps 4 and 5 are the ones that exercise `scrollPositionByTabId` and the
`scrollPositionSeeds`, which is the part of `state()` this plan reshaped.

## Test plan

**No new behaviour is introduced, so the existing suites are the gate.** The three
tests added in step 7 are not regression coverage for a bug; they are invariant
locks that make the collapsed representation enforceable, so they are worth
writing and the plan does not pad beyond them.

The suites that actually exercise this code, all pre-existing and all passing at
`ace313f`:

| Suite                                                                                                                               | What it protects here                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/features/editor/tests/editor-document-state.test.ts`                                                                  | The four identity assertions (unchanged slices stay `toBe`-identical across a scroll write and across a text change) — the direct gate on deleting the `WeakMap`s. |
| `apps/web/src/features/editor/tests/document-retain.test.ts`                                                                        | `retain()` eviction rules, and "no view survives its document" — the gate on the `viewsByTabId` reshaping.                                                         |
| `apps/web/src/features/editor/tests/editor-state.test.ts`                                                                           | `createEditorCommands` end to end, including the tab/selection paths whose `documentStore` parameters step 3 removes.                                              |
| `apps/web/src/features/editor/tests/file-sync-service.test.ts`                                                                      | `ensureLiveEditorDocument` / `getLiveEditorDocument` / `markLiveEditorDocumentSaved` round trip.                                                                   |
| `apps/web/src/features/editor/tests/auto-save.test.tsx`                                                                             | The store mounted under React providers.                                                                                                                           |
| `apps/web/src/hooks/tests/use-workspace-cache-persistence.test.ts`                                                                  | The `subscribeWithSelector` scroll-position subscription — the one subscriber that depends on slice identity.                                                      |
| `apps/web/src/hooks/tests/use-workspace-events.test.ts`                                                                             | The `forceReplaceLiveEditorDocument` call path changed in step 3b.                                                                                                 |
| `apps/web/src/features/editor/tests/document-retention.test.ts`, `compare-saved-document.test.ts`, `conflict-diff-document.test.ts` | Adjacent document consumers.                                                                                                                                       |

Structural pattern to copy for the new tests: the existing cases in
`editor-document-state.test.ts` (its `fileResult` helper and its
`store.getState().<action>()` style). Do **not** introduce a new factory —
AGENTS.md: "Do not redefine per-file factories."

## Done criteria

Machine-checkable. ALL must hold. **Every test and lint criterion is a delta
against the Step 0 snapshot — no absolute count appears here, deliberately.**

- [ ] `cd apps/web && bun run typecheck` exits 0
- [ ] `cd apps/web && bun run test`: no test that passed in
      `/tmp/plan-038-test-before.txt` fails, the set of failing test names is
      unchanged from that snapshot, and the passing total is exactly **+3**
- [ ] `cd apps/web && bun run format:check` exits 0, and `bun run lint` reports no
      error absent from `/tmp/plan-038-lint-before.txt`
- [ ] The known pre-existing failure
      (`src/features/settings/tests/page.test.tsx > refuses an application-scoped key from the workspace tab, and says why`)
      is present in the Step 0 snapshot, still present at the end, and **untouched**.
      It does not block this plan.
- [ ] `grep -rn "fallbackDocumentPath" apps packages scripts --exclude-dir=node_modules --exclude-dir=dist` → zero output
- [ ] `grep -rn "LiveEditorDocumentRecord\|EditorDocumentViewRecord\|liveDocumentProjection\|viewProjection\b\|WeakMap" apps/web/src/features/editor` → zero output
- [ ] `grep -rn "getEditorViewDocument\|EditorDocumentStoreState\|projectedRecord" apps/web/src apps/web/test` → zero output
- [ ] `test ! -e apps/web/src/features/editor/state/editor-dirty-paths.ts && test ! -e apps/web/src/features/editor/state/editor-fallback-path.ts` → exit 0
- [ ] You changed **no file outside the in-scope list**. Diff against the snapshot
      you took in the drift check rather than assuming the tree started clean:

      ```bash
      git status --porcelain | diff /tmp/plan-038-before.txt - | grep '^>'
      ```

      → exactly nine lines, and nothing else:
      `apps/web/src/features/editor/state/workspace-document-service.ts`,
      `apps/web/src/features/editor/state/editor-document-state.tsx`,
      `apps/web/src/features/editor/state/editor-commands.ts`,
      `apps/web/src/features/editor/state/editor-dirty-paths.ts` (deleted),
      `apps/web/src/features/editor/state/editor-fallback-path.ts` (deleted),
      `apps/web/src/features/editor/tests/editor-document-state.test.ts`,
      `apps/web/src/hooks/use-workspace-events.ts`,
      `apps/web/src/keymap/workspace-commands.ts`,
      `plans/README.md`.
      **If any other path appears, STOP** — you have edited something out of scope,
      or a directory-wide formatter ran.

- [ ] The manual smoke test in step 8 passes with no new console errors
- [ ] `plans/README.md` row 038 updated

## STOP conditions

Stop and report back (do not improvise) if:

- **Step 2's grep finds `fallbackDocumentPath` referenced outside the three named
  files.** Everything in step 3 assumes the value is write-only; a real reader
  means the field must be kept, and the plan needs re-scoping before you continue.
- **Adding `readonly` in step 4a produces a typecheck error at a site that
  _assigns_ to a document or view field.** That is a mutation of a supposedly
  immutable record — a contract bug that needs a human decision, not a
  `[...spread]` workaround. AGENTS.md: "Avoid fake fixes like
  `sizes: [...node.sizes]`."
- **Any of the four identity assertions in `editor-document-state.test.ts` fails
  after step 4** (`after.liveDocumentsById === before.liveDocumentsById`,
  `after.viewsByTabId['tab-1'].view === before…view`,
  `after.viewsByTabId['tab-2'] === before…['tab-2']`,
  `after.liveDocumentsById['/repo/b.ts'] === before…['/repo/b.ts']`). It would
  mean the `WeakMap`s were doing real work that the record replacement does not
  cover, which falsifies the plan's core premise.
- **`document-retain.test.ts`'s "no view survives its document" case throws.** The
  service's `getViewDocument` reaches `getRequiredLiveDocument`, which throws on a
  missing document. If that fires, a view is outliving its document — a real bug,
  not a refactor artifact.
- **The unused-parameter cascade in step 3c reaches a function outside the six in
  the table**, or asks you to change the exported `EditorCommands` type. That
  means `documentStore` was doing something in that function beyond the fallback,
  and you are about to delete a live dependency.
- **You are tempted to prefix a parameter with `_` to silence
  `noUnusedParameters`.** Don't; report instead — the parameter is either genuinely
  dead (delete it and its arguments) or the plan is wrong about the cascade.
- **`cd apps/web && bun run typecheck` does not exit 0 at Step 0.** This refactor
  is entirely typecheck-guided; a red baseline there means you cannot tell your
  errors from the existing ones. Report and stop.
- **A test that passed in your Step 0 snapshot fails after any step.** That is a
  regression you caused. (A test that was _already_ failing in the snapshot — at
  `b467b3f`, the settings `page.test.tsx` case — is **not** a stop condition and
  must not be treated as one. This is the exact mistake that blocked the previous
  dispatch of this plan: it stopped on a count, not on a defect.)
- **A lint error appears that is not in `/tmp/plan-038-lint-before.txt`.**
- **NOT a stop condition:** a test or file total that differs from any number
  written in this document. Those were measured at `ace313f` and are stale by
  design. Your Step 0 snapshot is the baseline; keep going.
- **`git status --porcelain` shows a file you did not intend to touch** — most
  likely a directory-wide `oxfmt --write` or `bun run format` reformatted the
  unrelated settings work already in the tree. Revert those files
  (`git checkout -- <path>`) and report.
- **You find yourself needing `bun run test:browser`.** No file in scope is a
  browser test, and that project is known to hang at the RUN banner here.
- Any step's verification fails twice after one reasonable fix attempt.
- The fix appears to require touching a file on the out-of-scope list.

## Maintenance notes

For whoever owns this code next:

- **What a reviewer should scrutinise.** Two things, in order. (1) The `state()`
  identity contract: `recordFromMap` returning `previous` unchanged when every
  entry survived is what keeps per-frame scroll writes from re-rendering document
  subscribers. If someone later makes `state()` allocate unconditionally, the
  scroll path regresses silently and only the four identity assertions in
  `editor-document-state.test.ts` will catch it. (2) The step-3 deletion of
  `fallbackDocumentPath` — the grep in step 2 is the whole argument, and it is
  worth re-running in review rather than taking on trust.
- **The rule this establishes.** The store's state type is now
  `WorkspaceDocumentServiceState`, not a copy of it. A new document field is
  added in `workspace-document-service.ts` and appears in the store for free. If a
  future change reintroduces a hand-written state type in
  `editor-document-state.tsx`, it has undone this plan.
- **Interaction with `plans/010`.** That plan's rename table lists
  `state/dirty-paths.ts` ← `state/editor-dirty-paths.ts` (line 376) and
  `state/fallback-path.ts` ← `state/editor-fallback-path.ts` (line 378). This plan
  deletes **both** files, so both rows become moot; whoever executes 010 should drop
  them rather than recreate the files. Plan 010 also renames `editor-document-state.tsx` →
  `document-state.tsx` and `editor-commands.ts` → `commands.ts`, which is why this
  plan does no renames at all.
- **Interaction with `plans/022`** (delete unreachable code). 022 does not list
  either file this plan deletes, so there is no overlap; but 022 should be re-run
  against `knip` **after** this lands, since `editor-dirty-paths.ts` is one of the
  entries in its input snapshot.
- **Deliberately deferred, with reasons.**
  - _The three sibling stores_ (`editor-workspace-state`, `editor-ui-state`,
    `editor-conflict-state`) have the same "store mirrors a service" shape in
    places. They are out of scope because collapsing all four at once would make
    a single review unreviewable, and each has a different set of consumers.
  - _`service.getViewDocument`_ survives with only one caller —
    `document-retain.test.ts:44-54`, where it is the assertion vehicle for the
    "no view survives its document" invariant. That is a deliberate keep, not an
    oversight; do not let a dead-code sweep delete it without replacing the
    invariant check.
  - _Making the service itself the zustand store_ (i.e. deleting
    `editor-document-state.tsx`) was considered and rejected: dozens of modules
    (32 at `ace313f` — approximate) depend on
    the store's action names and on `useEditorDocumentState` selectors, and the
    React subscription surface has to live somewhere. The store staying as a thin
    adapter is the shape `PLAN.md:22` asks for.
  - _The fallback-document UX itself._ If someone wants "show the last live
    document when the selection has nothing live" back, it should be rebuilt as a
    **derived selector** over `liveDocumentsById` and the workspace store's
    `selectedFilePath` — never as stored state that four write paths have to keep
    in sync. That is exactly how it rotted the first time.
