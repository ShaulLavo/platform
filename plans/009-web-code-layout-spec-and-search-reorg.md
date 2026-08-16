# Plan 009: Establish the web code-layout spec and reorganize `features/search/`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat ace313f..HEAD -- apps/web/src/features/search docs/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `ace313f`, 2026-08-16

## Why this matters

`AGENTS.md` (symlinked as `CLAUDE.md`) states two layout rules for this repo:
group each feature by _kind_ (`components/`, `hooks/`, `providers/`, `state/`,
`utils/`, `tests/`), and never repeat the folder name in file or symbol names.
The newer features (`chat`, `address`, `workbench`, `menus`, `chat-mode`) follow
both rules exactly. `features/search/` follows neither: **62 source files sit
flat in the feature root**, and every one of them is prefixed `search-`, so the
directory listing is 62 near-identical filenames with no structure.

The concrete cost is navigation: finding the file that owns replace-runner logic
means reading 62 sibling names that all begin with the same nine characters.
This plan fixes `search/` and, in doing so, writes down the layout rule as a
doc that the four follow-up plans (010, 011, 012) reference — so the same
refactor is applied identically everywhere instead of being re-derived.

This is a **pure move-and-rename refactor**. No logic changes, no behavior
changes, no signature changes. `tsgo --build` is a complete proof of
correctness for it: if every import resolves and every type checks, the move is
right.

## Current state

`apps/web/src/features/search/` contains 62 `.ts`/`.tsx` files directly in the
feature root, plus three subdirectories that already exist and are correct:
`providers/`, `hooks/`, `tests/`.

Confirm with:

```bash
find apps/web/src/features/search -maxdepth 1 -name "*.ts" -o -maxdepth 1 -name "*.tsx" | wc -l
```

→ expect `62`.

The largest of them, for orientation:

- `search-buffer-state.tsx` (1562 lines) — the search buffer store/provider. This
  is genuinely stateful (a React context + store), so it belongs in `state/`.
- `search-result-editor-utils.ts` (551 lines) — pure helpers for the result editor.
- `search-result-view-model.ts` (511 lines) — pure view-model construction.
- `search-results-view.tsx` (467 lines) — a render component.

For contrast, here is the shape this plan is producing — `features/address/`,
which already complies:

```
apps/web/src/features/address/
  components/
  hooks/
  state/
  utils/
  tests/
```

and inside it, `utils/grammar.ts` — **not** `utils/address-grammar.ts`. That is
the naming rule: the folder already says `address`, so the file must not.

### The conventions this plan must honor

Quoted from `AGENTS.md`, because the executor has not read it:

> - Group by feature, then by kind:
>   - `components/` — React render components only (`.tsx`)
>   - `hooks/` — `use-*` hooks
>   - `providers/` — context providers and `*-context.ts` modules
>   - `state/` — optional home for stores and other stateful modules
>   - `utils/` — pure, stateless, non-React code only. No stores, no
>     module-level mutable state, no subscriptions, nothing that imports React
>   - `tests/` — feature tests

> - Import exact files through `@/`. Do not add barrel `index.ts` files.
> - Barrel files are allowed only at package entry points such as
>   `packages/*/src/index.ts`.

> - Do not repeat the folder name in file or symbol names. In `workspace/`,
>   prefer `sidebar.tsx`, not `workspace-sidebar.tsx`.
> - When removing a redundant prefix, rename the file, exports, and all call
>   sites in one pass.

> ## Greenfield, No Backward Compatibility
>
> - No backward compatibility shims, no legacy aliases, no deprecation windows.
>   Update every call site in the same pass.

That last one is load-bearing for this plan: **do not leave re-export shims at
the old paths.** Move the file, update every importer, delete the old path.

### Path alias

`apps/web/tsconfig.json` maps `"@/*": ["./src/*"]`, and `apps/web/vite.config.ts`
mirrors it with `'@': path.resolve(__dirname, './src')`. Imports in this feature
use the alias form, e.g.:

`apps/web/src/features/search/search-result-file-header.tsx:8`

```ts
import { fileIconStyle, fileName, matchNoun } from '@/features/search/search-result-editor-utils'
```

Some files use relative imports instead (`'../lib/foo'`). Both resolve; prefer
the `@/` form when you rewrite an import that already used it, and keep relative
imports relative.

## Commands you will need

| Purpose         | Command                               | Expected on success              |
| --------------- | ------------------------------------- | -------------------------------- |
| Typecheck (web) | `cd apps/web && bun run typecheck`    | exit 0, no errors                |
| Test (web)      | `cd apps/web && bun run test`         | all pass                         |
| Lint (web)      | `cd apps/web && bun run lint`         | exit 0                           |
| Format          | `cd apps/web && bun run format`       | exit 0 (rewrites files)          |
| Format check    | `cd apps/web && bun run format:check` | exit 0                           |
| Full verify     | `bun run verify` (from repo root)     | exit 0 — typecheck+lint+fmt+test |

Run the **web-scoped** commands during the steps; run the full `bun run verify`
once at the end. The web typecheck is the primary gate for this plan.

## Scope

**In scope**:

- Every `.ts`/`.tsx` file directly inside `apps/web/src/features/search/` (moved
  and renamed).
- Any file anywhere under `apps/web/src/` that imports one of those files
  (import specifier updated only).
- `apps/web/src/features/search/tests/**` (import specifiers updated).
- `docs/web-code-layout.md` (create).

**Out of scope** (do NOT touch, even though they look related):

- `apps/web/src/components/workspace/search/` — a _different_ directory that
  plan 012 relocates. Leave it exactly where it is.
- `apps/server/src/fs/search.ts` and everything under `apps/server/` — unrelated
  server-side search.
- Any change to a function body, signature, type, or exported symbol **name**.
  This plan renames _files_, not exports. If you find yourself editing logic,
  you have left the scope.
- `apps/web/src/features/search/providers/`, `hooks/`, and `tests/`
  subdirectories — they already exist and are correctly placed. You will add
  files _into_ `hooks/`, but do not restructure what is already there.
- Adding any `index.ts` barrel file. Explicitly forbidden by `AGENTS.md`.

## Git workflow

Per the operator rule recorded in `plans/README.md`: **all work happens on
`main`** — no new branches, worktrees, or PRs unless the operator explicitly
asks.

Commit style is conventional commits with a descriptive lowercase subject; see
`git log`, e.g.:

```
refactor(orchestration): the server prepares a session's worktree (M-C)
fix(address): bound the URL, and stop escaping slashes in ?tabs=
```

Commit after Step 2 and after Step 4 so the move and the doc are separable.

## Steps

### Step 1: Write the layout spec doc

Create `docs/web-code-layout.md`. This is the reference plans 010–012 point at.
Content must state, concretely:

1. The kind-directory taxonomy (`components/`, `hooks/`, `providers/`, `state/`,
   `utils/`, `tests/`) with the one-line definition of each, copied from the
   `AGENTS.md` block quoted above.
2. The classification rule, stated as a decision procedure:
   - filename starts with `use-` → `hooks/`
   - default-exports or exports a React component and is `.tsx` → `components/`
   - holds a store, a pool, a subscription, or module-level mutable state →
     `state/`
   - is a context provider or a `*-context.ts` module → `providers/`
   - pure, stateless, imports no React → `utils/`
   - a test → `tests/` (or a `tests/` dir beside the kind dir, matching what
     `features/chat/` already does)
3. The naming rule: the file name must not repeat its feature folder name, and
   a file inside `utils/` must not be suffixed `-utils`.
4. The no-barrels rule.
5. A one-line note that `lib/` is **not** a kind directory in this repo; pure
   code goes in `utils/`.

Keep it under 80 lines. It is a rule sheet, not an essay.

**Verify**: `test -f docs/web-code-layout.md && wc -l docs/web-code-layout.md`
→ file exists, under 80 lines.

### Step 2: Create the kind directories and move the files

Create `apps/web/src/features/search/{components,state,utils}/`. (`hooks/`,
`providers/`, and `tests/` already exist.)

Move each file to the destination in the table below, renaming as shown. Use
`git mv` so history follows the file.

**The mapping is authoritative — use it verbatim.** It was produced
mechanically and then hand-corrected; three entries in particular are _not_ what
a naive suffix rule would produce, and are called out below the table.

| Move to                                        | From                                            |
| ---------------------------------------------- | ----------------------------------------------- |
| `components/buffer-status.tsx`                 | `search-buffer-status.tsx`                      |
| `components/buffer-summary.tsx`                | `search-buffer-summary.tsx`                     |
| `components/buffer-status-state.tsx`           | `search-buffer-status-state.tsx`                |
| `components/centered-state.tsx`                | `search-centered-state.tsx`                     |
| `components/empty-state.tsx`                   | `search-empty-state.tsx`                        |
| `components/error-state.tsx`                   | `search-error-state.tsx`                        |
| `components/idle-state.tsx`                    | `search-idle-state.tsx`                         |
| `components/file-group.tsx`                    | `search-file-group.tsx`                         |
| `components/filter-fields.tsx`                 | `search-filter-fields.tsx`                      |
| `components/highlight.tsx`                     | `search-highlight.tsx`                          |
| `components/history-input.tsx`                 | `search-history-input.tsx`                      |
| `components/match-row.tsx`                     | `search-match-row.tsx`                          |
| `components/mode-buttons.tsx`                  | `search-mode-buttons.tsx`                       |
| `components/number.tsx`                        | `search-number.tsx`                             |
| `components/pending-or-empty.tsx`              | `search-pending-or-empty.tsx`                   |
| `components/replace-fields.tsx`                | `search-replace-fields.tsx`                     |
| `components/replace-toggle-button.tsx`         | `search-replace-toggle-button.tsx`              |
| `components/result-editor-surface.tsx`         | `search-result-editor-surface.tsx`              |
| `components/result-editor-virtual-window.tsx`  | `search-result-editor-virtual-window.tsx`       |
| `components/result-file-editor-pool-slot.tsx`  | `search-result-file-editor-pool-slot.tsx`       |
| `components/result-file-editor.tsx`            | `search-result-file-editor.tsx`                 |
| `components/result-file-header-row.tsx`        | `search-result-file-header-row.tsx`             |
| `components/result-file-header.tsx`            | `search-result-file-header.tsx`                 |
| `components/result-file-line-action-row.tsx`   | `search-result-file-line-action-row.tsx`        |
| `components/result-file-line-actions.tsx`      | `search-result-file-line-actions.tsx`           |
| `components/result-source-line-gutter.tsx`     | `search-result-source-line-gutter.tsx`          |
| `components/results-view.tsx`                  | `search-results-view.tsx`                       |
| `components/summary.tsx`                       | `search-summary.tsx`                            |
| `components/toggle-button.tsx`                 | `search-toggle-button.tsx`                      |
| `hooks/use-buffer-inputs.ts`                   | `use-search-buffer-inputs.ts`                   |
| `hooks/use-buffer-results.ts`                  | `use-search-buffer-results.ts`                  |
| `hooks/use-buffer-runtime.ts`                  | `use-search-buffer-runtime.ts`                  |
| `hooks/use-buffer-status.ts`                   | `use-search-buffer-status.ts`                   |
| `hooks/use-buffer-value.ts`                    | `use-search-buffer-value.ts`                    |
| `hooks/use-prepare-buffer.ts`                  | `use-prepare-search-buffer.ts`                  |
| `hooks/use-replace.ts`                         | `use-search-replace.ts`                         |
| `hooks/use-result-editor-virtualizer.ts`       | `use-search-result-editor-virtualizer.ts`       |
| `hooks/use-result-file-editor-pool-entries.ts` | `use-search-result-file-editor-pool-entries.ts` |
| `hooks/use-run-buffer.ts`                      | `use-run-search-buffer.ts`                      |
| `hooks/use-run-dirty-buffer-overlay.ts`        | `use-run-dirty-search-buffer-overlay.ts`        |
| `state/buffer-state.tsx`                       | `search-buffer-state.tsx`                       |
| `state/result-editor-pool.ts`                  | `search-result-editor-pool.ts`                  |
| `state/result-virtual-window-store.ts`         | `search-result-virtual-window-store.ts`         |
| `utils/buffer-dirty-documents.ts`              | `search-buffer-dirty-documents.ts`              |
| `utils/buffer-document.ts`                     | `search-buffer-document.ts`                     |
| `utils/buffer-query.ts`                        | `search-buffer-query.ts`                        |
| `utils/buffer-runner.ts`                       | `search-buffer-runner.ts`                       |
| `utils/match-display.ts`                       | `search-match-display.ts`                       |
| `utils/open-match.ts`                          | `open-search-match.ts`                          |
| `utils/providers.ts`                           | `search-providers.ts`                           |
| `utils/replace-runner.ts`                      | `search-replace-runner.ts`                      |
| `utils/replace.ts`                             | `search-replace.ts`                             |
| `utils/result-editor-constants.ts`             | `search-result-editor-constants.ts`             |
| `utils/result-editor-keyboard.ts`              | `search-result-editor-keyboard.ts`              |
| `utils/result-editor-types.ts`                 | `search-result-editor-types.ts`                 |
| `utils/result-editor.ts`                       | `search-result-editor-utils.ts`                 |
| `utils/result-items.ts`                        | `search-result-items.ts`                        |
| `utils/result-syntax-plugin.ts`                | `search-result-syntax-plugin.ts`                |
| `utils/result-view-model.ts`                   | `search-result-view-model.ts`                   |
| `utils/result-virtual-list.ts`                 | `search-result-virtual-list.ts`                 |
| `utils/run-state.ts`                           | `search-run-state.ts`                           |
| `utils/sort.ts`                                | `search-sort.ts`                                |

**Three corrections to note** (do not "fix" them back):

1. `search-centered-state.tsx`, `search-empty-state.tsx`, `search-error-state.tsx`,
   `search-idle-state.tsx`, `search-buffer-status-state.tsx` go to **`components/`**,
   not `state/`. Despite the `-state` suffix they are tiny presentational
   components (5–23 lines each); they hold no state. Open one and confirm
   before moving if unsure.
2. `search-result-editor-utils.ts` becomes `utils/result-editor.ts` — dropping
   _both_ the `search-` prefix and the now-redundant `-utils` suffix.
3. `search-buffer-state.tsx` (1562 lines) _is_ a real store/provider and does go
   to `state/`.

There is a `providers/` directory already; **do not move anything into it** in
this plan.

**Verify**:

```bash
find apps/web/src/features/search -maxdepth 1 -name "*.ts" -o -maxdepth 1 -name "*.tsx" | wc -l
```

→ expect `0`. Everything is now in a kind directory.

```bash
ls apps/web/src/features/search
```

→ expect exactly: `components  hooks  providers  state  tests  utils`

### Step 3: Update every import specifier

Every importer of a moved file now points at a dead path. Find them:

```bash
cd /Users/shaul/Desktop/D/platform
grep -rn "features/search/search-\|features/search/use-search\|features/search/open-search-match" apps/web/src --include="*.ts" --include="*.tsx"
```

Rewrite each specifier to the new path from the Step 2 table. Also fix relative
imports _within_ the search feature — a file that moved from the root into
`components/` and imported `'./search-sort'` must now import
`'../utils/sort'` (or the `@/features/search/utils/sort` alias form, matching
whichever style that file already used).

Do NOT rename any exported symbol. `searchResultFileExcerptOffset` stays
`searchResultFileExcerptOffset`. Only module specifiers change in this step.

**Verify**:

```bash
cd apps/web && bun run typecheck
```

→ exit 0, no errors. This is the real gate: a wrong path or a missed importer
cannot typecheck.

```bash
grep -rn "features/search/search-\|features/search/use-search" apps/web/src --include="*.ts" --include="*.tsx" | wc -l
```

→ expect `0`.

### Step 4: Format, lint, and run the full suite

```bash
cd apps/web && bun run format && bun run lint && bun run test
```

Then from the repo root:

```bash
bun run verify
```

**Verify**: all exit 0. The search feature has 3 test files under
`apps/web/src/features/search/tests/` (including `search-buffer-state.test.ts`,
1264 lines, and `search-providers.test.ts`, 661 lines) — they must all still
pass, unchanged except for their import specifiers.

## Test plan

**No new tests.** This plan changes no behavior, so new tests would assert
nothing that the existing suite does not already assert.

The existing tests _are_ the test plan:

- `apps/web/src/features/search/tests/search-buffer-state.test.ts` (1264 lines)
- `apps/web/src/features/search/tests/search-providers.test.ts` (661 lines)
- `apps/web/src/features/search/tests/search-result-editor-utils.test.ts`

All three must pass with only import-specifier edits. If any test needs a
change beyond its imports, that is a STOP condition — it means the move was not
behavior-preserving.

Consider renaming those three test files to drop the `search-` prefix too
(`tests/buffer-state.test.ts`, `tests/providers.test.ts`,
`tests/result-editor.test.ts`) for consistency with the rule. This is
in scope and encouraged, but do it as the last thing after the suite is green,
so a failure is never ambiguous.

Verification: `cd apps/web && bun run test` → all pass, same count as before the
refactor. Record the count before you start:
`cd apps/web && bun run test 2>&1 | tail -5`.

## Done criteria

ALL must hold:

- [ ] `docs/web-code-layout.md` exists and is under 80 lines
- [ ] `ls apps/web/src/features/search` prints exactly `components hooks providers state tests utils`
- [ ] `find apps/web/src/features/search -maxdepth 1 -name "*.ts*" | wc -l` → `0`
- [ ] `grep -rn "features/search/search-\|features/search/use-search" apps/web/src --include="*.ts" --include="*.tsx" | wc -l` → `0`
- [ ] `cd apps/web && bun run typecheck` exits 0
- [ ] `cd apps/web && bun run test` exits 0 with the same test count as before the refactor
- [ ] `bun run verify` exits 0 from the repo root
- [ ] `git status` shows no modified files outside `apps/web/src/`, `docs/web-code-layout.md`, and `plans/README.md`
- [ ] No `index.ts` file was created anywhere under `apps/web/src/features/search/`
- [ ] No exported symbol was renamed (`git diff` shows only path/specifier changes and file moves)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows `apps/web/src/features/search/` changed since `ace313f`
  and the file list no longer matches the Step 2 table. Report which files
  differ; do not guess at a mapping for new files.
- A test fails and the fix requires anything beyond an import specifier change.
  That means the move was not behavior-preserving and the plan's core
  assumption is wrong.
- `bun run typecheck` still fails after two rounds of fixing import paths.
- You find a file in the Step 2 table that does not exist, or a file in the
  feature root that is not in the table.
- You discover an existing `index.ts` barrel inside the search feature — the
  plan assumes there is none, and its presence changes the import-rewrite
  strategy.
- Moving a file would require editing its logic to keep the types happy. Report
  the file and the error; do not edit logic.

## Maintenance notes

- **This plan is the template for 010, 011, and 012.** Those plans apply the
  same recipe to the other features, the chat `lib/`→`utils/` collapse, and the
  `features/workspace/` consolidation. If you improved the recipe here (a
  better grep, a scripted rewrite), note it in `docs/web-code-layout.md` so the
  next executor inherits it.
- A reviewer should scrutinize exactly one thing: that `git diff` contains **no
  logic changes**. Use `git diff -M` so renames are shown as renames; the diff
  should be almost entirely import lines.
- `search-buffer-state.tsx` at 1562 lines is the second-largest file in the web
  app. Splitting it is explicitly **not** part of this plan (moving and
  splitting in one pass makes the diff unreviewable). It is a reasonable
  follow-up once the feature is organized.
- Deliberately deferred: the `providers/` directory is untouched here. If the
  buffer store's context provider should move from `state/buffer-state.tsx`
  into `providers/`, that is a judgment call for a later pass, not a mechanical
  move.
