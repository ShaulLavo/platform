# Plan 012: Give the workspace domain a real home in `features/`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat ace313f..HEAD -- apps/web/src/components apps/web/src/hooks apps/web/src/lib apps/web/src/state`
> If any in-scope file changed since this plan was written, compare the
> "Current state" inventories against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: LOW–MED (pure moves, but the largest import-graph change of the
  four reorg plans; `features/workbench` alone has ~30 importers of moved code)
- **Depends on**: `plans/009-web-code-layout-spec-and-search-reorg.md` (rule
  sheet + proven recipe). Run **after** 010 and 011 as well — those are smaller,
  disjoint, and build confidence in the recipe. This is the capstone.
- **Category**: architecture
- **Planned at**: commit `ace313f`, 2026-08-16

## Why this matters

`AGENTS.md` says to group by feature, then by kind. Ten features do exactly
that. But the **workspace** — the thing this application fundamentally _is_, a
file tree plus editor tabs plus panes — has no `features/workspace/`. Its code
lives in three other places:

1. **`apps/web/src/components/workspace/`** (4,436 LOC) — a full feature tree in
   disguise. It has `file-tree/{components,hooks,utils,tests}`,
   `editor-tabs/{hooks,utils,tests}`, `diff/`, `focus/providers/`, `search/`,
   `shared/`, `shell/`. It is organized correctly _internally_; it is just in
   the wrong parent directory.
2. **`apps/web/src/hooks/`** (3,106 LOC, 16 files) — which contains **only**
   workspace hooks. `use-workspace-events.ts` (904), `use-workspace-cache-persistence.ts`
   (490), `use-workspace-tree.ts`, `workspace-event-conflict-adapter.ts`,
   `use-open-workspace-root.ts`, `use-restore-recent-workspace-root.ts`,
   `use-validate-root-folder.ts`, `use-selected-file.ts`,
   `use-unsaved-work-guard.ts`. There is no such thing as a non-workspace hook
   in this directory.
3. **A handful of `apps/web/src/lib/` files** that are workspace-specific rather
   than app-level.

The cost is that "where does workspace code go?" has three answers, and a
contributor picks by precedent rather than rule. Meanwhile the strongest
consumer signal points somewhere specific: **`features/workbench/` is the
single biggest importer of `components/workspace/`** (~30 import sites across
its components, utils, hooks, and tests). The workspace code is already
behaving like part of a feature; it just is not filed as one.

After this plan, `apps/web/src/` has a clean top level: `features/`,
`components/` (app shell only), `lib/` (genuinely shared infrastructure),
`keymap/`, `App.tsx`, `main.tsx`.

Like 009–011, this is a **pure move-and-rename refactor**. `tsgo --build` is a
complete correctness proof.

## Current state

### An important correction, so you scope this right

**`apps/web/src/lib/` is NOT a junk drawer and is mostly out of scope.** I
measured the fan-in of every file in it. The top entries are genuine app-level
infrastructure used across `components/`, `features/`, `hooks/`, and `keymap/`:

| file                   | distinct importing files | importing areas                     |
| ---------------------- | ------------------------ | ----------------------------------- |
| `file-system-types.ts` | 51                       | components, features, hooks         |
| `structured-errors.ts` | 42                       | components, features, hooks         |
| `query-keys.ts`        | 34                       | components, features, hooks         |
| `client-logging.ts`    | 33                       | components, features, hooks, keymap |
| `path-formatters.ts`   | 28                       | components, features, hooks         |
| `file-server.ts`       | 24                       | components, features, hooks, keymap |
| `tree-model.ts`        | 17                       | components, features, hooks         |

Those stay exactly where they are. Only these five are workspace-specific
enough to move, and only because their importers are narrow:

| file                       | importers | importing areas |
| -------------------------- | --------- | --------------- |
| `workspace-cache.ts` (677) | 14        | features, hooks |
| `workspace-event-model.ts` | 2         | hooks only      |
| `workspace-path.ts`        | 4         | features, hooks |
| `directory-churn.ts`       | 1         | hooks only      |
| `coalesced-log.ts`         | 1         | hooks only      |

Reproduce this measurement before you start (Step 1). If the numbers have
drifted a lot, re-derive the list rather than trusting the table.

### `apps/web/src/components/` today

Sixteen files in the root, all genuine app-shell composition:

`app-command-surface.tsx`, `app-content.tsx`, `app-runtime-content.tsx`,
`app-titlebar.tsx`, `app-workspace.tsx`, `command-palette.tsx`,
`empty-workspace.tsx`, `file-picker-dialog.tsx`, `logging-error-boundary.tsx`,
`logging-error-boundary.test.tsx`, `theme-aware-toaster.tsx`,
`theme-context.ts`, `theme-provider.tsx`, `ui-mode-toggle.tsx`,
`use-pick-entry.tsx`, `workspace-project-menu.tsx`

Plus three subtrees:

- `components/workspace/` (4,436 LOC) — **moves in this plan**
- `components/command-palette/` — **moves in this plan** (only ~4 external
  import sites: `features/menus/utils`, `keymap/tests`, `components/`)
- `components/file-picker/` — **moves in this plan** (same, low fan-in)
- `components/tests/` — two tests for root files; stays

### `components/workspace/` internal shape

```
components/workspace/
  diff/{hooks,utils}                          233 LOC
  editor-tabs/{hooks,tests,utils}             674 LOC
  file-tree/{components,hooks,tests,utils}   2877 LOC
  focus/{providers,tests}                     116 LOC
  search/{components,tests,utils}             296 LOC
  shared/{hooks,tests,utils}                  199 LOC
  shell/components                             37 LOC
```

Note `shell/components/workspace-view.tsx` — `AGENTS.md` explicitly names
`WorkspaceView` as a case where the qualifier is _kept_ ("root components like
`WorkspaceView`"). Do not strip that one.

### The rules

Quoted verbatim from `AGENTS.md`:

> - Group by feature, then by kind: `components/`, `hooks/`, `providers/`,
>   `state/`, `utils/`, `tests/`
> - Do not create empty folders.
> - Import exact files through `@/`. Do not add barrel `index.ts` files.
> - Do not repeat the folder name in file or symbol names.
> - **Keep qualifiers only when they add meaning**: domain types like
>   `WorkspaceCommand`, domain terms like `workspacePath`, or root components
>   like `WorkspaceView`.
> - When removing a redundant prefix, rename the file, exports, and all call
>   sites in one pass.

> ## Greenfield, No Backward Compatibility
>
> - No backward compatibility shims, no legacy aliases, no deprecation windows.

The bolded rule does real work here. Inside `features/workspace/`, a file named
`workspace-cache.ts` is redundant → `cache.ts`. But the _symbol_ `workspacePath`
and the _type_ `WorkspaceCommand` keep their names — they are domain vocabulary,
not folder echoes. **This plan renames files, not exported symbols.**

Also read `docs/web-code-layout.md` (from plan 009). If absent → STOP.

## Commands you will need

| Purpose         | Command                            | Expected on success |
| --------------- | ---------------------------------- | ------------------- |
| Typecheck (web) | `cd apps/web && bun run typecheck` | exit 0              |
| Test (web)      | `cd apps/web && bun run test`      | all pass            |
| Lint (web)      | `cd apps/web && bun run lint`      | exit 0              |
| Format          | `cd apps/web && bun run format`    | exit 0              |
| Full verify     | `bun run verify` (repo root)       | exit 0              |

Record the baseline test count before Step 2:
`cd apps/web && bun run test 2>&1 | tail -5`. It must be identical at the end.

## Scope

**In scope**:

- `apps/web/src/components/workspace/**` → `apps/web/src/features/workspace/**`
- `apps/web/src/components/command-palette/**` → `apps/web/src/features/command-palette/**`
- `apps/web/src/components/file-picker/**` → `apps/web/src/features/file-picker/**`
- `apps/web/src/hooks/**` → `apps/web/src/features/workspace/hooks/` (+ `tests/`)
- The **five** `apps/web/src/lib/` files named in the table above
- `apps/web/src/state/active-project-store.ts` (31 lines) — see Step 6
- Import-specifier updates anywhere under `apps/web/src/`

**Out of scope** (do NOT touch):

- **Every other file in `apps/web/src/lib/`** — ~45 files of legitimately
  shared infrastructure. Moving `structured-errors.ts` (42 importers) into a
  feature would be strictly worse than leaving it. If you find yourself moving a
  `lib/` file not in the five-file table, stop.
- The 16 root files in `apps/web/src/components/` and `components/tests/`.
  They are app-shell composition and belong there. (`theme-provider.tsx` and
  `theme-context.ts` arguably want a `providers/` directory — that is a real but
  separate cleanup; do not do it here.)
- `apps/web/src/keymap/**` — high-churn, and its own concern.
- `apps/web/src/features/{chat,chat-mode,search,editor,git,logs,menus,settings,terminal,workbench,address}/**`
  except for import-specifier edits.
- **Merging `features/workspace/` into `features/workbench/`.** The fan-in data
  suggests they are closely related, but merging two features is a design
  decision with real consequences, not a file move. Record the observation;
  do not act on it.
- **Splitting any file.** `use-workspace-events.ts` (904 lines) moves as-is. It
  is well-decomposed into ~40 small named functions and two prior audits agreed
  it is not a god module.
- Any change to a function body, signature, type, or exported symbol name.
- Adding any `index.ts` barrel.

## Git workflow

Per the operator rule in `plans/README.md`: **all work happens on `main`** — no
new branches, worktrees, or PRs unless the operator explicitly asks.

Conventional commits. Example subject:

```
refactor(workspace): the workspace domain gets a home in features/
```

**Commit after every step.** This plan has the widest import graph of the four
reorg plans; per-step commits are what make a mistake bisectable.

## Steps

### Step 1: Verify the preconditions and re-measure `lib/` fan-in

```bash
cd /Users/shaul/Desktop/D/platform
test -f docs/web-code-layout.md && echo "rule sheet present"
test -d apps/web/src/features/workspace && echo "UNEXPECTED: already exists" || echo "clear"

for f in apps/web/src/lib/*.ts; do
  b=$(basename "$f" .ts)
  n=$(grep -rl "lib/$b'" apps/web/src --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "^apps/web/src/lib/" | wc -l | tr -d ' ')
  echo "$n $b"
done | sort -rn
```

**Verify**: the rule sheet exists, `features/workspace` does not, and the five
files in the table (`workspace-cache`, `workspace-event-model`, `workspace-path`,
`directory-churn`, `coalesced-log`) still show low counts while
`file-system-types`, `structured-errors`, `query-keys`, and `client-logging`
still show high ones. If a "high fan-in, stays put" file has collapsed to 1–2
importers, or a five-file-table entry has grown broad, re-derive the split and
report the change before proceeding.

### Step 2: Move `components/workspace/` → `features/workspace/`

`git mv apps/web/src/components/workspace apps/web/src/features/workspace`

Then flatten the sub-feature directories into the kind taxonomy. The current
shape nests a _domain_ level (`file-tree/`, `editor-tabs/`, …) above the _kind_
level (`components/`, `hooks/`, …), which is backwards for a single feature.

Target:

| Move to (`features/workspace/`)           | From (`components/workspace/`)                        |
| ----------------------------------------- | ----------------------------------------------------- |
| `components/tree-pane.tsx`                | `file-tree/components/tree-pane.tsx`                  |
| `components/delete-entry-dialog.tsx`      | `file-tree/components/delete-entry-dialog.tsx`        |
| `components/row-menu.tsx`                 | `file-tree/components/row-menu.tsx`                   |
| `hooks/use-fs-actions.ts`                 | `file-tree/hooks/use-fs-actions.ts`                   |
| `hooks/use-file-tree-intent-prefetch.ts`  | `file-tree/hooks/use-file-tree-intent-prefetch.ts`    |
| `hooks/use-row-menu.ts`                   | `file-tree/hooks/use-row-menu.ts`                     |
| `utils/tree-pane-state.ts`                | `file-tree/utils/tree-pane-state.ts`                  |
| `utils/row-menu.ts`                       | `file-tree/utils/row-menu.ts`                         |
| `utils/entry-paths.ts`                    | `file-tree/utils/entry-paths.ts`                      |
| `utils/file-tree-prefetch.ts`             | `file-tree/utils/file-tree-prefetch.ts`               |
| `tests/tree-pane.test.ts`                 | `file-tree/tests/tree-pane.test.ts`                   |
| `tests/file-tree-prefetch.test.ts`        | `file-tree/tests/file-tree-prefetch.test.ts`          |
| `utils/tests/row-menu.test.ts`            | `file-tree/utils/tests/row-menu.test.ts`              |
| `utils/tests/entry-paths.test.ts`         | `file-tree/utils/tests/entry-paths.test.ts`           |
| `utils/tab-model.ts`                      | `editor-tabs/utils/editor-tab-model.ts`               |
| `utils/tab-close-targets.ts`              | `editor-tabs/utils/editor-tab-close-targets.ts`       |
| `utils/tab-types.ts`                      | `editor-tabs/utils/editor-tab-types.ts`               |
| `utils/tab-prefetch.ts`                   | `editor-tabs/utils/editor-tab-prefetch.ts`            |
| `utils/document-label.ts`                 | `editor-tabs/utils/document-label.ts`                 |
| `hooks/use-tab-intent-prefetch.ts`        | `editor-tabs/hooks/use-editor-tab-intent-prefetch.ts` |
| `hooks/use-tab-dirty.ts`                  | `editor-tabs/hooks/use-editor-tab-dirty.ts`           |
| `tests/tab-model.test.ts`                 | `editor-tabs/tests/editor-tab-model.test.ts`          |
| `tests/tab-prefetch.test.ts`              | `editor-tabs/tests/editor-tab-prefetch.test.ts`       |
| `tests/tab-close-targets.test.ts`         | `editor-tabs/tests/editor-tab-close-targets.test.ts`  |
| `utils/conflict-editor-resolution.ts`     | `diff/utils/conflict-editor-resolution-utils.ts`      |
| `utils/editor-render-document.ts`         | `diff/utils/editor-render-document-utils.ts`          |
| `hooks/use-conflict-editor-resolution.ts` | `diff/hooks/use-conflict-editor-resolution.ts`        |
| `providers/focus-state.ts`                | `focus/providers/focus-state.ts`                      |
| `providers/focus-provider.tsx`            | `focus/providers/focus-provider.tsx`                  |
| `tests/focus-state.test.ts`               | `focus/tests/focus-state.test.ts`                     |
| `components/search-results.tsx`           | `search/components/search-results.tsx`                |
| `components/search-controls.tsx`          | `search/components/search-controls.tsx`               |
| `components/search-pane.tsx`              | `search/components/search-pane.tsx`                   |
| `components/search-summary.tsx`           | `search/components/search-summary.tsx`                |
| `components/search-runtime.tsx`           | `search/components/search-runtime.tsx`                |
| `utils/search-runtime-state.ts`           | `search/utils/search-runtime-state.ts`                |
| `tests/search-runtime-state.test.ts`      | `search/tests/search-runtime-state.test.ts`           |
| `hooks/use-element-width.ts`              | `shared/hooks/use-element-width.ts`                   |
| `utils/intent-prefetch-registry.ts`       | `shared/utils/intent-prefetch-registry.ts`            |
| `utils/intent-prefetch-scheduler.ts`      | `shared/utils/intent-prefetch-scheduler.ts`           |
| `utils/intent-prefetch-options.ts`        | `shared/utils/intent-prefetch-options.ts`             |
| `tests/use-element-width.test.tsx`        | `shared/tests/use-element-width.test.tsx`             |
| `components/view.tsx`                     | `shell/components/workspace-view.tsx`                 |

Three naming notes:

1. **`editor-tab-*` → `tab-*`**: inside `features/workspace/` the `editor-`
   prefix is not redundant with the folder, but it _is_ noise on four sibling
   files that are obviously all about tabs. Keep the **exported symbols**
   unchanged (`editorTabModel`, `EditorTabType`, …) — only filenames change.
2. **`*-utils.ts` → drop the suffix** in `utils/` (`conflict-editor-resolution-utils.ts`
   → `utils/conflict-editor-resolution.ts`). A file in `utils/` named `-utils`
   says it twice.
3. **`workspace-view.tsx` → `components/view.tsx`**, and the exported component
   stays `WorkspaceView`. That is the `AGENTS.md` "root components like
   `WorkspaceView`" carve-out: the _symbol_ keeps its qualifier, the _filename_
   does not need it inside `features/workspace/components/`.

`search/` here is **workspace search pane chrome**, distinct from
`features/search/` (the search _feature_). Two files will now be named
`components/search-results.tsx` in different features — that is fine and
unambiguous by path. Do **not** merge them.

**Verify**:

```bash
test -d apps/web/src/components/workspace && echo PRESENT || echo GONE   # → GONE
ls apps/web/src/features/workspace   # → components hooks providers tests utils
```

### Step 3: Move `hooks/` → `features/workspace/hooks/`

Every file in `apps/web/src/hooks/` is workspace-domain. Move all of them,
stripping the now-redundant `workspace-` prefix where it echoes the feature:

| Move to (`features/workspace/`)           | From (`hooks/`)                                    |
| ----------------------------------------- | -------------------------------------------------- |
| `hooks/use-events.ts`                     | `use-workspace-events.ts`                          |
| `hooks/use-cache-persistence.ts`          | `use-workspace-cache-persistence.ts`               |
| `hooks/use-tree.ts`                       | `use-workspace-tree.ts`                            |
| `hooks/use-open-root.ts`                  | `use-open-workspace-root.ts`                       |
| `hooks/use-restore-recent-root.ts`        | `use-restore-recent-workspace-root.ts`             |
| `hooks/use-validate-root-folder.ts`       | `use-validate-root-folder.ts`                      |
| `hooks/use-selected-file.ts`              | `use-selected-file.ts`                             |
| `hooks/use-unsaved-work-guard.ts`         | `use-unsaved-work-guard.ts`                        |
| `utils/event-conflict-adapter.ts`         | `workspace-event-conflict-adapter.ts`              |
| `tests/use-events.test.ts`                | `tests/use-workspace-events.test.ts`               |
| `tests/use-cache-persistence.test.ts`     | `tests/use-workspace-cache-persistence.test.ts`    |
| `tests/use-tree.test.ts`                  | `tests/use-workspace-tree.test.ts`                 |
| `tests/use-open-root.test.tsx`            | `tests/use-open-workspace-root.test.tsx`           |
| `tests/use-restore-recent-root.test.tsx`  | `tests/use-restore-recent-workspace-root.test.tsx` |
| `tests/use-validate-root-folder.test.tsx` | `tests/use-validate-root-folder.test.tsx`          |
| `tests/use-selected-file.test.ts`         | `tests/use-selected-file.test.ts`                  |

`workspace-event-conflict-adapter.ts` (297 lines) is not a hook — it goes to
`utils/`. **Open it first**: if it holds module-level mutable state or a
subscription, it belongs in `state/` instead. `utils/` purity is a rule.

Then delete the now-empty `apps/web/src/hooks/` directory.

**Verify**:

```bash
test -d apps/web/src/hooks && echo PRESENT || echo GONE   # → GONE
```

### Step 4: Move the five workspace-specific `lib/` files

| Move to (`features/workspace/`)       | From (`lib/`)                       |
| ------------------------------------- | ----------------------------------- |
| `state/cache.ts`                      | `workspace-cache.ts`                |
| `state/tests/cache.test.ts`           | `lib/tests/workspace-cache.test.ts` |
| `utils/event-model.ts`                | `workspace-event-model.ts`          |
| `utils/path.ts`                       | `workspace-path.ts`                 |
| `utils/tests/path.test.ts`            | `lib/tests/workspace-path.test.ts`  |
| `utils/directory-churn.ts`            | `directory-churn.ts`                |
| `utils/tests/directory-churn.test.ts` | `lib/tests/directory-churn.test.ts` |
| `utils/coalesced-log.ts`              | `coalesced-log.ts`                  |
| `utils/tests/coalesced-log.test.ts`   | `lib/tests/coalesced-log.test.ts`   |

`workspace-cache.ts` (677 lines) goes to `state/` — it is a cache, so it holds
state by definition. Confirm by reading it; if it is a pure set of functions
operating on a caller-supplied object, `utils/` is correct instead.

**Move nothing else out of `lib/`.** After this step `lib/` should still have
~45 files.

**Verify**:

```bash
find apps/web/src/lib -maxdepth 1 -name "*.ts" | wc -l   # → 29 (34 before this step); the point is that lib/ keeps its shared core, not a particular number
grep -rn "lib/workspace-cache\|lib/workspace-path\|lib/workspace-event-model\|lib/directory-churn\|lib/coalesced-log" apps/web/src | wc -l   # → 0 after Step 7
```

### Step 5: Move `command-palette/` and `file-picker/` into `features/`

```
git mv apps/web/src/components/command-palette apps/web/src/features/command-palette
git mv apps/web/src/components/file-picker     apps/web/src/features/file-picker
```

Both are already internally organized (`hooks/`, `providers/`, `state/`,
`navigation/`, `tests/`) and both have low external fan-in (~4 import sites
each), so this is the cheapest part of the plan.

Inside `features/command-palette/`, strip the redundant prefix from
`command-palette-utils.ts` → `utils/palette.ts` (or `utils/matching.ts` if that
better describes it — read it) and `command-palette-types.ts` → `utils/types.ts`.
`file-picker/navigation/` is not a kind directory; fold it into
`components/navigation-*.tsx` and `utils/navigation-styles.ts` as appropriate.

If either feature's internal shape resists the taxonomy cleanly, **move the
directory but leave its internals alone** and report it. The move is the win;
the internal tidy is optional here.

**Verify**:

```bash
ls apps/web/src/components   # → only the 16 root files + tests/
cd apps/web && bun run typecheck   # will still fail until Step 7 — that is expected
```

### Step 6: Decide on `state/active-project-store.ts`

`apps/web/src/state/` holds exactly one 31-line file. A top-level directory for
one file is not a layer.

Read it and its importers (`grep -rn "state/active-project-store" apps/web/src`):

- If only `features/chat-mode/` uses it → move to
  `features/chat-mode/state/active-project-store.ts` and delete `state/`.
- If `features/workspace/` and others use it → move to
  `features/workspace/state/active-project.ts`.
- If it is genuinely cross-feature app state → move to `lib/` and delete
  `state/`.

Any of the three is acceptable. What is not acceptable is leaving a top-level
directory containing one file.

**Verify**: `test -d apps/web/src/state && echo PRESENT || echo GONE` → `GONE`

### Step 7: Rewrite every import specifier

```bash
cd /Users/shaul/Desktop/D/platform
grep -rn "@/components/workspace\|@/components/command-palette\|@/components/file-picker\|@/hooks/\|@/state/\|lib/workspace-cache\|lib/workspace-path\|lib/workspace-event-model\|lib/directory-churn\|lib/coalesced-log" \
  apps/web/src --include="*.ts" --include="*.tsx"
```

Rewrite each to the new path. Watch for:

- **Relative-depth changes.** Step 2 flattened a level
  (`file-tree/utils/x.ts` → `utils/x.ts`), so relative imports inside those
  files change depth. The alias form does not have this problem; prefer it when
  the importing file already used `@/`.
- `App.tsx:4` imports `FocusProvider` from
  `@/components/workspace/focus/providers/focus-provider` → becomes
  `@/features/workspace/providers/focus-provider`.
- `app-keymap-controller.tsx:1` imports `useFocus` from
  `@/components/workspace/focus/providers/focus-state` → becomes
  `@/features/workspace/providers/focus-state`.
- `features/workbench/` has the most edits (~30). Work through it methodically.

Do NOT rename any exported symbol.

**Verify**:

```bash
cd apps/web && bun run typecheck
```

→ exit 0. This is the gate.

```bash
grep -rn "@/components/workspace\|@/components/command-palette\|@/components/file-picker\|@/hooks/\|@/state/" apps/web/src --include="*.ts" --include="*.tsx" | wc -l
```

→ `0`

### Step 8: Format, lint, full suite

```bash
cd apps/web && bun run format && bun run lint && bun run test
cd /Users/shaul/Desktop/D/platform && bun run verify
```

**Verify**: all exit 0, test count identical to the Step-1 baseline.

## Test plan

**No new tests.** No behavior changes.

The existing tests are the safety net, and this plan moves an unusual number of
them. All must pass with only import-specifier edits plus their own renames:

- `features/workspace/tests/tree-pane.test.ts` (619 lines — the largest single
  safety net in this plan)
- `features/workspace/tests/tab-model.test.ts`, `tab-prefetch.test.ts`,
  `tab-close-targets.test.ts`
- `features/workspace/utils/tests/row-menu.test.ts`, `entry-paths.test.ts`
- `features/workspace/tests/focus-state.test.ts`
- `features/workspace/tests/use-events.test.ts`,
  `use-cache-persistence.test.ts`, `use-tree.test.ts`, and the four other
  moved hook tests
- `features/workspace/state/tests/cache.test.ts`
- `features/command-palette/tests/**`, `features/file-picker/tests/**`

If any test needs a change beyond its import lines, that is a STOP condition.

Verification: `cd apps/web && bun run test` → all pass, identical count.

## Done criteria

ALL must hold:

- [ ] `test -d apps/web/src/components/workspace` → does not exist
- [ ] `test -d apps/web/src/hooks` → does not exist
- [ ] `test -d apps/web/src/state` → does not exist
- [ ] `ls apps/web/src` → `App.tsx app-keymap-controller.tsx components features keymap lib main.tsx`
- [ ] `ls apps/web/src/features/workspace` → only kind directories
      (`components hooks providers state tests utils`)
- [ ] `lib/` lost **exactly** the five files Step 4 names and nothing else:
      `git diff -M --name-status ace313f -- apps/web/src/lib | grep "^R"` lists
      `workspace-cache.ts`, `workspace-event-model.ts`, `workspace-path.ts`,
      `directory-churn.ts`, `coalesced-log.ts` (plus their tests), and no other
      module left `lib/` in this plan.
      **Corrected 2026-08-17.** This gate used to read `→ **≥ 40**`, which Step 4
      makes unsatisfiable: `lib/` held ~45 root `.ts` files at `ace313f`, plans
      022 and 043 took it to 34, and Step 4 mandates removing five more — 29.
      Per this README's own rule, never assert an absolute count; compare a delta.
- [ ] `grep -rn "@/components/workspace\|@/components/command-palette\|@/components/file-picker\|@/hooks/\|@/state/" apps/web/src --include="*.ts" --include="*.tsx" | wc -l` → `0`
- [ ] `cd apps/web && bun run typecheck` exits 0
- [ ] `cd apps/web && bun run test` exits 0, same count as baseline
- [ ] `bun run verify` exits 0 from the repo root
- [ ] No `index.ts` barrel created anywhere
- [ ] `git diff -M ace313f..HEAD -- apps/web/src` shows renames plus import
      lines and **no logic changes**
- [ ] `git status` shows nothing modified outside `apps/web/src/` and
      `plans/README.md`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `docs/web-code-layout.md` does not exist (plan 009 has not run).
- Plans 010 or 011 are not DONE and their features still have files in their
  roots. Running the reorgs concurrently creates import conflicts.
- Step 1's fan-in re-measurement contradicts the table — specifically, if a
  file marked "stays" has collapsed to 1–2 importers, or one of the five
  movers has grown broad. Report the new numbers; do not guess a new split.
- You find yourself moving a `lib/` file that is not one of the five. The
  47-importer files staying put is a _deliberate design decision_, not an
  oversight.
- A test fails and the fix requires anything beyond an import specifier change.
- `bun run typecheck` still fails after two rounds of fixing import paths for a
  single step.
- `workspace-cache.ts` or `workspace-event-conflict-adapter.ts` turns out to be
  a different kind of module than the plan assumes. Report your reclassification
  rather than placing a stateful module in `utils/`.
- Any circular import appears between `features/workspace/` and
  `features/workbench/`. The fan-in is high in that direction and a cycle is the
  one genuine risk in this plan. Report it — do not break it by re-exporting
  through a barrel (forbidden) or by duplicating code.
- Moving a file would require editing its logic to satisfy the typechecker.

## Maintenance notes

- **The observation worth escalating, but not acting on here**:
  `features/workbench/` imports `components/workspace/` at ~30 sites — more than
  any other consumer. After this plan that becomes `features/workbench` →
  `features/workspace`, which is a heavy cross-feature dependency. Two features
  that coupled probably want to be one, or want an explicit narrow interface
  between them. That is a design question for the maintainer and deserves its
  own investigation; it is deliberately out of scope.
- A reviewer should check three things: (1) `git diff -M` contains no logic
  changes; (2) `apps/web/src/lib/` still has ~45 files; (3) no barrel was added
  to paper over a deep relative import.
- After 009–012, `apps/web/src/` is uniformly feature-organized. The natural
  follow-up is a CI guard — a grep that fails when a file lands directly in a
  feature root or repeats its folder name. Without it, this entropy returns.
- **Deliberately deferred**: `theme-provider.tsx` / `theme-context.ts` in
  `components/` root want a `providers/` directory per the taxonomy. Small, real,
  and better as its own one-commit change.
- **Deliberately deferred**: `use-workspace-events.ts` (904 lines) moves intact.
  If it ever does need splitting, the ~40 named helper functions inside it are
  already the seams.
