# Plan 010: Finish the feature-folder reorganization (logs, git, editor, terminal, settings, workbench)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat ace313f..HEAD -- apps/web/src/features/logs apps/web/src/features/git apps/web/src/features/editor apps/web/src/features/terminal apps/web/src/features/settings apps/web/src/features/workbench`
> If any in-scope file changed since this plan was written, compare the
> "Current state" inventories against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: `plans/009-web-code-layout-spec-and-search-reorg.md` — 009 writes
  `docs/web-code-layout.md`, which is the rule sheet this plan applies. It also
  proves the move-and-rewrite recipe on the hardest feature first.
- **Category**: tech-debt
- **Planned at**: commit `ace313f`, 2026-08-16

## Why this matters

`AGENTS.md` requires every feature to be grouped by kind (`components/`,
`hooks/`, `providers/`, `state/`, `utils/`, `tests/`) and forbids repeating the
folder name in file names. Plan 009 fixed `features/search/`. Six features are
still partially or fully non-compliant, in two different ways:

- **`logs/` has 23 files flat in its root** and no `components/`, `hooks/`, or
  `utils/` directory at all — the same shape `search/` had.
- **`git/`, `editor/`, `terminal/`, `settings/`, `workbench/` already have the
  right directories** but leak files into the feature root and/or carry
  redundant folder-name prefixes inside those directories
  (`editor/state/editor-commands.ts`, `workbench/utils/workbench-panels.ts`).

Once this lands, every feature under `apps/web/src/features/` follows one rule,
and "where does this file go?" has a mechanical answer for all future work. That
is the whole payoff: the rule stops being aspirational.

Like 009, this is a **pure move-and-rename refactor**. No logic changes, no
signature changes. `tsgo --build` is a complete correctness proof.

## Current state

### The exemplar to copy

`apps/web/src/features/terminal/` is _almost_ right and is the best model in
the repo for what this plan produces:

```
terminal/
  components/menu.tsx
  hooks/use-menu.ts
  hooks/use-terminal-command-inbox.ts     ← still prefixed, this plan fixes it
  hooks/use-terminal-links.ts             ← still prefixed, this plan fixes it
  state/command-inbox-store.ts
  tests/terminal-appearance.test.ts       ← still prefixed, this plan fixes it
  tests/terminal-socket.test.ts           ← still prefixed, this plan fixes it
  utils/capture.ts
  utils/clipboard.ts
  utils/commands.ts
  utils/focus-target.ts
  utils/links.ts
  utils/menu.ts
  terminal-panel.tsx                      ← in the root, this plan fixes it
  terminal-socket.ts                      ← in the root, this plan fixes it
  terminal-theme.ts                       ← in the root, this plan fixes it
```

Note `utils/capture.ts`, not `utils/terminal-capture.ts`. That is the target
naming everywhere.

### The rules

Quoted from `AGENTS.md` verbatim, because the executor has not read it:

> - Group by feature, then by kind:
>   - `components/` — React render components only (`.tsx`)
>   - `hooks/` — `use-*` hooks
>   - `providers/` — context providers and `*-context.ts` modules
>   - `state/` — optional home for stores and other stateful modules.
>     Co-locating a store next to its provider is fine too
>   - `utils/` — pure, stateless, non-React code only. No stores, no
>     module-level mutable state, no subscriptions, nothing that imports React
>   - `tests/` — feature tests
> - Do not create empty folders.
> - Import exact files through `@/`. Do not add barrel `index.ts` files.

> - Do not repeat the folder name in file or symbol names. In `workspace/`,
>   prefer `sidebar.tsx`, not `workspace-sidebar.tsx`.
> - **Keep qualifiers only when they add meaning**: domain types like
>   `WorkspaceCommand`, domain terms like `workspacePath`, or root components
>   like `WorkspaceView`.
> - When removing a redundant prefix, rename the file, exports, and all call
>   sites in one pass.

> ## Greenfield, No Backward Compatibility
>
> - No backward compatibility shims, no legacy aliases, no deprecation windows.
>   Update every call site in the same pass.

The bolded rule matters here and is the one place this plan asks for judgment:
**this plan renames FILES, not exported symbols.** Do not rename
`WorkspaceCommand` or `workspacePath`. See Step 6 for the one narrow exception.

Also read `docs/web-code-layout.md`, produced by plan 009 — it is the decision
procedure for classifying a file. If it does not exist, plan 009 has not run;
that is a STOP condition.

### Path alias

`apps/web/tsconfig.json` maps `"@/*": ["./src/*"]`; `apps/web/vite.config.ts`
mirrors it. Feature code imports both ways (`@/features/logs/log-formatters`
and `'../lib/foo'`). When rewriting, keep whichever style the importing file
already uses.

## Commands you will need

| Purpose         | Command                            | Expected on success              |
| --------------- | ---------------------------------- | -------------------------------- |
| Typecheck (web) | `cd apps/web && bun run typecheck` | exit 0, no errors                |
| Test (web)      | `cd apps/web && bun run test`      | all pass                         |
| Lint (web)      | `cd apps/web && bun run lint`      | exit 0                           |
| Format          | `cd apps/web && bun run format`    | exit 0 (rewrites files)          |
| Full verify     | `bun run verify` (repo root)       | exit 0 — typecheck+lint+fmt+test |

Record the test count before you start:
`cd apps/web && bun run test 2>&1 | tail -5`. It must be identical at the end.

## Scope

**In scope**:

- `apps/web/src/features/logs/**`
- `apps/web/src/features/git/**`
- `apps/web/src/features/editor/**`
- `apps/web/src/features/terminal/**`
- `apps/web/src/features/settings/**`
- `apps/web/src/features/workbench/**`
- Any file under `apps/web/src/` that imports from those paths (import
  specifier updated only).

**Out of scope** (do NOT touch):

- `apps/web/src/features/search/**` — plan 009 owns it. If 009 is DONE, leave it
  alone; if it is not, that is a STOP condition.
- `apps/web/src/features/chat/**` and `chat-mode/**` — plan 011 owns them.
- `apps/web/src/components/**`, `hooks/**`, `lib/**`, `state/**` — plan 012 owns
  them. You will _update import specifiers_ in these files where they point at
  moved code, but you will not move or rename anything in them.
- `apps/server/**`, `packages/**` — entirely unrelated.
- Any change to a function body, signature, type, or exported symbol name,
  except the one narrow case in Step 6.
- Adding any `index.ts` barrel file. Explicitly forbidden.
- Splitting any large file. `editor/editor-plugins.ts` is 507 lines and
  `terminal/terminal-panel.tsx` is 477; both move as-is. Moving and splitting in
  one pass makes the diff unreviewable.

## Git workflow

Per the operator rule in `plans/README.md`: **all work happens on `main`** — no
new branches, worktrees, or PRs unless the operator explicitly asks.

Conventional-commit style, lowercase descriptive subject. Examples from
`git log`:

```
refactor(orchestration): the server prepares a session's worktree (M-C)
fix(address): bound the URL, and stop escaping slashes in ?tabs=
```

**Commit after each feature's step** (one commit per feature). Six small
commits are far easier to bisect than one 200-file commit, and if the suite goes
red you know exactly which feature broke it.

## Steps

Do the features **in the order below**. It runs smallest-blast-radius first, so
you build confidence in the recipe before touching `editor/`, which has the most
importers.

### Step 1: `terminal/` — 3 root files + 4 prefixed files

Create nothing new; all directories exist.

| Move to                      | From                                  |
| ---------------------------- | ------------------------------------- |
| `components/panel.tsx`       | `terminal-panel.tsx`                  |
| `utils/socket.ts`            | `terminal-socket.ts`                  |
| `utils/theme.ts`             | `terminal-theme.ts`                   |
| `hooks/use-command-inbox.ts` | `hooks/use-terminal-command-inbox.ts` |
| `hooks/use-links.ts`         | `hooks/use-terminal-links.ts`         |
| `tests/appearance.test.ts`   | `tests/terminal-appearance.test.ts`   |
| `tests/socket.test.ts`       | `tests/terminal-socket.test.ts`       |

Check `terminal-socket.ts` (19 lines) before placing it: if it opens or holds a
socket at module scope it belongs in `state/`, not `utils/` (`utils/` forbids
module-level mutable state). If it only _builds_ a URL or a config object,
`utils/` is right.

**Verify**: `cd apps/web && bun run typecheck` → exit 0, and
`find apps/web/src/features/terminal -maxdepth 1 -name "*.ts*" | wc -l` → `0`.

### Step 2: `workbench/` — 5 prefixed files, no root files

The feature root is already clean; only prefixes need removing.

| Move to                      | From                                   |
| ---------------------------- | -------------------------------------- |
| `components/layout.tsx`      | `components/workbench-layout.tsx`      |
| `utils/layout.ts`            | `utils/workbench-layout.ts`            |
| `utils/panels.ts`            | `utils/workbench-panels.ts`            |
| `utils/tests/layout.test.ts` | `utils/tests/workbench-layout.test.ts` |
| `utils/tests/panels.test.ts` | `utils/tests/workbench-panels.test.ts` |

`workbench/` has no `state/` or `tests/` at the feature root — do **not** create
them. `AGENTS.md`: "Do not create empty folders."

Note: `utils/panels.ts` is covered by 22 characterization tests from plan 006
(`utils/tests/workbench-panels.test.ts`). Those tests are your safety net here —
they must pass unchanged apart from the import line.

**Verify**: `cd apps/web && bun run typecheck` → exit 0, then
`cd apps/web && bun run test 2>&1 | grep -i "panels\|layout"` → the workbench
tests still run and pass.

### Step 3: `settings/` — 4 root files

| Move to                      | From                   |
| ---------------------------- | ---------------------- |
| `utils/api.ts` _(see note)_  | `api.ts`               |
| `utils/notify-save-error.ts` | `notify-save-error.ts` |
| `utils/query-keys.ts`        | `query-keys.ts`        |
| `utils/document.ts`          | `settings-document.ts` |

**Note on `api.ts`**: several features keep an `api.ts` at the feature root
(`git/api.ts`, `logs/api.ts`, `settings/api.ts`) as the feature's server-call
module. That is a _consistent existing pattern_, not sloppiness. Decide once and
apply it to all three features in this plan:

- **Recommended**: move them to `utils/api.ts`. They are pure request functions,
  they satisfy the `utils/` definition, and it removes the last root-level files.
- If any `api.ts` holds a module-level cache, client instance, or subscription,
  it goes to `state/` instead — check before moving.

Whatever you choose, apply it identically in Steps 3, 4, and 5. Inconsistency
here is worse than either choice.

Leave `components/setting-row.tsx` alone. `setting-` (singular) inside
`settings/` names _one setting's row_, which is meaningful, not redundant — it
falls under the "keep qualifiers when they add meaning" rule.

**Verify**: `cd apps/web && bun run typecheck` → exit 0, and
`find apps/web/src/features/settings -maxdepth 1 -name "*.ts*" | wc -l` → `0`.

### Step 4: `git/` — 12 root files

All six kind directories already exist.

| Move to                            | From                                |
| ---------------------------------- | ----------------------------------- |
| `utils/api.ts`                     | `api.ts`                            |
| `utils/blob-diff-query.ts`         | `blob-diff-query.ts`                |
| `utils/diff-document.ts`           | `diff-document.ts`                  |
| `utils/invalidate-workspace.ts`    | `invalidate-workspace.ts`           |
| `utils/mutation-keys.ts`           | `mutation-keys.ts`                  |
| `utils/notify-mutation-error.ts`   | `notify-mutation-error.ts`          |
| `utils/ref-document.ts`            | `ref-document.ts`                   |
| `utils/status-entries-for-tree.ts` | `status-entries-for-tree.ts`        |
| `utils/status-symbols.ts`          | `status-symbols.ts`                 |
| `utils/types.ts`                   | `types.ts`                          |
| `components/panel.tsx`             | `panel.tsx`                         |
| `state/store.tsx`                  | `state.tsx`                         |
| `providers/store-provider.tsx`     | `providers/git-store-provider.tsx`  |
| `tests/store-provider.test.tsx`    | `tests/git-store-provider.test.tsx` |

`state.tsx` → `state/store.tsx`: a file literally named `state.tsx` sitting
beside a directory named `state/` is the clearest case in this plan. Open it
first — if it is a context provider rather than a store, it goes to
`providers/store.tsx` instead and `providers/git-store-provider.tsx` may be
redundant with it (report that rather than merging them; merging is logic work
and out of scope).

`status-symbols.ts` carries three `TODO(git):` comments about VS Code parity.
Move them with the file verbatim. Do not act on them.

**Verify**: `cd apps/web && bun run typecheck` → exit 0, and
`find apps/web/src/features/git -maxdepth 1 -name "*.ts*" | wc -l` → `0`.

### Step 5: `logs/` — 23 root files, only `state/` and `tests/` exist

This is the biggest step. Create `components/`, `hooks/`, and `utils/`.

| Move to                               | From                                 |
| ------------------------------------- | ------------------------------------ |
| `components/panel.tsx`                | `panel.tsx`                          |
| `components/toolbar.tsx`              | `log-toolbar.tsx`                    |
| `components/detail-field.tsx`         | `logs-detail-field.tsx`              |
| `components/event-inline-detail.tsx`  | `logs-event-inline-detail.tsx`       |
| `components/event-list-container.tsx` | `logs-event-list-container.tsx`      |
| `components/event-list.tsx`           | `logs-event-list.tsx`                |
| `components/event-row.tsx`            | `logs-event-row.tsx`                 |
| `components/row-chevron.tsx`          | `logs-row-chevron.tsx`               |
| `components/timeline-bar.tsx`         | `logs-timeline-bar.tsx`              |
| `components/timeline-metric.tsx`      | `logs-timeline-metric.tsx`           |
| `components/timeline.tsx`             | `logs-timeline.tsx`                  |
| `hooks/use-event-detail.ts`           | `use-log-event-detail.ts`            |
| `hooks/use-events.ts`                 | `use-log-events.ts`                  |
| `hooks/use-live.ts`                   | `use-log-live.ts`                    |
| `hooks/use-summary.ts`                | `use-log-summary.ts`                 |
| `utils/api.ts`                        | `api.ts`                             |
| `utils/filter-params.ts`              | `log-filter-params.ts`               |
| `utils/formatters.ts`                 | `log-formatters.ts`                  |
| `utils/row-interactions.ts`           | `log-row-interactions.ts`            |
| `utils/row-layout.ts`                 | `log-row-layout.ts`                  |
| `utils/toolbar-options.ts`            | `log-toolbar-options.ts`             |
| `state/live-batcher.ts`               | `log-live-batcher.ts`                |
| `state/live-cache.ts`                 | `log-live-cache.ts`                  |
| `tests/filter-params.test.ts`         | `tests/log-filter-params.test.ts`    |
| `tests/live-batcher.test.ts`          | `tests/log-live-batcher.test.ts`     |
| `tests/live-cache.test.ts`            | `tests/log-live-cache.test.ts`       |
| `tests/row-interactions.test.ts`      | `tests/log-row-interactions.test.ts` |
| `tests/toolbar-options.test.ts`       | `tests/log-toolbar-options.test.ts`  |

**`log-live-batcher.ts` and `log-live-cache.ts` go to `state/`, not `utils/`.**
A batcher holds a pending buffer and a cache holds entries — both are
module-level mutable state, which `utils/` explicitly forbids. `state/` already
exists (it holds `filter-store.ts`). Open both files and confirm before moving;
if either turns out to be a pure factory function returning a closure with no
module-level state, `utils/` is correct instead.

`log-row-layout.ts` is 2 lines. Move it as-is; do not inline it into its caller
(that is logic work, out of scope).

**Verify**: `cd apps/web && bun run typecheck` → exit 0, and
`ls apps/web/src/features/logs` → exactly
`components  hooks  state  tests  utils`.

### Step 6: `editor/` — 8 root files + 22 prefixed files in subdirectories

The most importers, so it goes last.

Root files:

| Move to                           | From                               |
| --------------------------------- | ---------------------------------- |
| `utils/compare-saved-document.ts` | `compare-saved-document.ts`        |
| `utils/conflict-diff-document.ts` | `conflict-diff-document.ts`        |
| `utils/render-document.ts`        | `editor-render-document.ts`        |
| `utils/language-server-plugin.ts` | `editor-language-server-plugin.ts` |
| `utils/plugins.ts`                | `editor-plugins.ts`                |
| `utils/save.ts`                   | `editor-save.ts`                   |
| `providers/state-provider.tsx`    | `editor-state-provider.tsx`        |
| `state/file-sync-service.ts`      | `file-sync-service.ts`             |

**Check `editor-plugins.ts` (507 lines) before placing it.** knip reports
`editorShikiWorkerOwner` and `disposeEditorShikiWorkerOwner` as exports of this
module — a _worker owner_ with a _dispose_ function is module-level mutable
state, which disqualifies it from `utils/`. If it owns a worker singleton, it
goes to `state/plugins.ts` instead. Read the file and decide; state your choice
in the commit message.

Prefixed files already in subdirectories:

| Move to                                  | From                                            |
| ---------------------------------------- | ----------------------------------------------- |
| `components/frame.tsx`                   | `components/editor-frame.tsx`                   |
| `providers/tab-actions-context.ts`       | `providers/editor-tab-actions-context.ts`       |
| `providers/tab-actions-provider.tsx`     | `providers/editor-tab-actions-provider.tsx`     |
| `state/color-theme-store.ts`             | `state/editor-color-theme-store.ts`             |
| `state/commands.ts`                      | `state/editor-commands.ts`                      |
| `state/conflict-state.tsx`               | `state/editor-conflict-state.tsx`               |
| `state/dirty-paths.ts`                   | `state/editor-dirty-paths.ts`                   |
| `state/document-state.tsx`               | `state/editor-document-state.tsx`               |
| `state/fallback-path.ts`                 | `state/editor-fallback-path.ts`                 |
| `state/language-server-status-source.ts` | `state/editor-language-server-status-source.ts` |
| `state/status-bar-source.ts`             | `state/editor-status-bar-source.ts`             |
| `state/tab-paths.ts`                     | `state/editor-tab-paths.ts`                     |
| `state/ui-state.tsx`                     | `state/editor-ui-state.tsx`                     |
| `state/workspace-state.tsx`              | `state/editor-workspace-state.tsx`              |
| `state/tests/color-theme-store.test.ts`  | `state/tests/editor-color-theme-store.test.ts`  |
| `tests/document-state.test.ts`           | `tests/editor-document-state.test.ts`           |
| `tests/language-server-plugin.test.ts`   | `tests/editor-language-server-plugin.test.ts`   |
| `tests/state.test.ts`                    | `tests/editor-state.test.ts`                    |
| `tests/syntax-worker.browser.tsx`        | `tests/editor-syntax-worker.browser.tsx`        |
| `utils/position.ts`                      | `utils/editor-position.ts`                      |
| `utils/tests/position.test.ts`           | `utils/tests/editor-position.test.ts`           |

**The one narrow symbol-rename exception in this plan**: `utils/diff-view-mode.ts`
exports `DEFAULT_DIFF_VIEW_MODE` and `isEditorDiffViewMode`. The second name
carries an `Editor` qualifier that its own module path already states. Renaming
it to `isDiffViewMode` is correct per the rule "rename the file, exports, and all
call sites in one pass." It has exactly one importer
(`apps/web/src/keymap/commands.ts:31`), so the blast radius is one line. Do this
rename; do **not** go hunting for other symbol renames.

`tests/editor-syntax-worker.browser.tsx` is a **browser-project** test. It does
not run under `bun run test` (which is `--project node --project dom`). Verify it
separately with `cd apps/web && bun run test:browser`. If the browser runner
hangs at the RUN banner without producing results, that is a known pre-existing
issue with this repo's browser project — note it and move on; do not treat it as
caused by your change, and do not spend time debugging it.

**Verify**: `cd apps/web && bun run typecheck` → exit 0, and
`find apps/web/src/features/editor -maxdepth 1 -name "*.ts*" | wc -l` → `0`.

### Step 7: Sweep for stragglers, then full verify

```bash
cd /Users/shaul/Desktop/D/platform
for f in logs git editor terminal settings workbench; do
  echo "$f root: $(find apps/web/src/features/$f -maxdepth 1 -name '*.ts' -o -maxdepth 1 -name '*.tsx' | wc -l)"
done
```

→ every line must read `0`.

Then check for surviving folder-name prefixes:

```bash
for f in logs git editor terminal settings workbench; do
  s=$(echo "$f" | sed 's/s$//')
  find apps/web/src/features/$f -mindepth 2 \( -name "*.ts" -o -name "*.tsx" \) | grep -E "/($f|$s)-" || true
done
```

→ expect no output, except `settings/components/setting-row.tsx`, which is
deliberately kept (see Step 3).

Then:

```bash
cd apps/web && bun run format && bun run lint && bun run test
cd /Users/shaul/Desktop/D/platform && bun run verify
```

**Verify**: all exit 0, and the web test count matches the number you recorded
before Step 1.

## Test plan

**No new tests.** This plan changes no behavior; new tests would assert nothing
the existing suite does not already assert.

The existing suites are the test plan. These must pass with only import-specifier
edits (plus their own file renames):

- `features/workbench/utils/tests/panels.test.ts` — 22 characterization tests
  from plan 006 covering active-tab-after-close, path close, resize, setter, and
  normalize. **This is the highest-value safety net in this plan.**
- `features/workbench/utils/tests/layout.test.ts`
- `features/logs/tests/*.test.ts` — 5 files
- `features/git/tests/store-provider.test.tsx`
- `features/editor/tests/*.test.ts` and `features/editor/state/tests/`,
  `features/editor/utils/tests/`
- `features/terminal/tests/*.test.ts` — 2 files

If any test needs a change beyond its import lines, that is a STOP condition:
it means a move was not behavior-preserving.

Verification: `cd apps/web && bun run test` → all pass, identical count to the
pre-refactor baseline.

## Done criteria

ALL must hold:

- [ ] For each of `logs git editor terminal settings workbench`:
      `find apps/web/src/features/<f> -maxdepth 1 -name "*.ts*" | wc -l` → `0`
- [ ] `ls apps/web/src/features/logs` → exactly `components hooks state tests utils`
- [ ] The prefix sweep in Step 7 returns no output except
      `settings/components/setting-row.tsx`
- [ ] `grep -rn "isEditorDiffViewMode" apps/web/src | wc -l` → `0`
- [ ] `cd apps/web && bun run typecheck` exits 0
- [ ] `cd apps/web && bun run test` exits 0 with the same test count as the
      pre-refactor baseline
- [ ] `bun run verify` exits 0 from the repo root
- [ ] No `index.ts` barrel was created anywhere under `apps/web/src/features/`
- [ ] `git status` shows no modified files outside `apps/web/src/` and
      `plans/README.md`
- [ ] `git diff -M ace313f..HEAD -- apps/web/src/features/` shows renames plus
      import lines, and **no logic changes** (the one exception:
      `isEditorDiffViewMode` → `isDiffViewMode` and its single call site)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `docs/web-code-layout.md` does not exist — plan 009 has not run, and this plan
  depends on its rule sheet.
- Plan 009 is not marked DONE in `plans/README.md` and
  `apps/web/src/features/search/` still has files in its root. Running both
  reorganizations concurrently creates import conflicts.
- The drift check shows a feature's file list no longer matches the tables here.
  Report which files differ; do not invent a destination for a file not in a
  table.
- A test fails and the fix requires anything beyond an import specifier change.
- `bun run typecheck` still fails after two rounds of fixing import paths for a
  single feature.
- You find that a file classified here as `utils/` actually holds module-level
  mutable state (the Step 1, 5, and 6 notes flag the three likely cases). Report
  your reclassification rather than silently placing it in `utils/` — `utils/`
  purity is a rule, not a preference.
- Moving a file would require editing its logic to satisfy the typechecker.
- You discover an `index.ts` barrel inside any of the six features — the plan
  assumes there is none, and its presence changes the import-rewrite strategy.

## Maintenance notes

- After this plan, `apps/web/src/features/` is uniformly organized except for
  `chat/` and `chat-mode/` (plan 011). Plan 012 then moves the remaining
  workspace code out of `components/`, `hooks/`, and `lib/` into a real
  `features/workspace/`.
- A reviewer should check exactly one thing: `git diff -M` contains no logic
  changes. Everything else is proven by `bun run verify`.
- Consider adding a lint rule or a CI grep that fails when a file appears
  directly in a feature root or repeats its folder name — otherwise this
  entropy returns. That is deliberately **not** in this plan (writing a custom
  oxlint rule is a different kind of work), but it is the natural follow-up and
  is what makes the cleanup permanent.
- The `api.ts`-at-feature-root pattern (Step 3) is the one genuine judgment call
  here. Whatever you decided, write it into `docs/web-code-layout.md` so the
  next feature does not re-litigate it.
- Deliberately deferred: `editor/utils/plugins.ts` (507 lines) and
  `terminal/components/panel.tsx` (477 lines) are moved but not split.
