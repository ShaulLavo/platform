# Plan 011: Collapse `features/chat/lib/` into `utils/` and drop the `chat-` prefixes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat ace313f..HEAD -- apps/web/src/features/chat`
> If any in-scope file changed since this plan was written, compare the
> "Current state" inventory against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: `plans/009-web-code-layout-spec-and-search-reorg.md` (for the
  `docs/web-code-layout.md` rule sheet and the proven move-and-rewrite recipe).
  Independent of 010 — they touch disjoint directories and can run in either
  order.
- **Category**: tech-debt
- **Planned at**: commit `ace313f`, 2026-08-16

## Why this matters

`features/chat/` is the largest feature in the repo (39K LOC) and it has **two
junk drawers**: `lib/` (51 source files, 8,977 LOC, plus 34 test files) and
`utils/` (11 source files, 1,452 LOC, plus 8 test files). There is no rule
distinguishing them — `lib/chat-activity-presentation.ts` and
`utils/timeline-scroll-anchoring.ts` are both pure presentation helpers, and
nothing explains why they live in different directories.

`AGENTS.md` names six kind directories: `components/`, `hooks/`, `providers/`,
`state/`, `utils/`, `tests/`. **`lib/` is not one of them.** It is the only
`lib/` inside any feature in the repo — the other ten features have no such
directory, and `apps/web/src/lib/` (the app-level one) is a different thing
entirely.

On top of that, 41 of the 51 `lib/` files are prefixed `chat-`, inside a
directory whose path already reads `features/chat/`, which `AGENTS.md`
explicitly forbids.

The concrete cost: a contributor adding a pure chat helper has to guess between
two directories, and guessing wrong is invisible in review. After this plan
there is one answer.

**The decisive fact that makes this safe**: I grepped all 51 `lib/` files for
`from 'react'`, `useState`, `useEffect`, and `createContext` — **zero hits**.
Every file in `lib/` is already React-free and stateless, which is exactly the
`utils/` contract. There is no reclassification work to do; this is a rename.

Like 009 and 010, this is a **pure move-and-rename refactor** with `tsgo --build`
as a complete correctness proof.

## Current state

### Directory shapes

```
apps/web/src/features/chat/
  components/   73 files,  8001 LOC   (+ components/tests/)
  environment/   2 files,    56 LOC   ← not a kind directory either; see Step 5
  hooks/        21 files,  1219 LOC   (+ hooks/tests/)
  lib/          51 files,  8977 LOC   (+ lib/tests/, 34 test files)   ← THIS PLAN
  providers/    14 files,   884 LOC
  state/        20 files,  4394 LOC   (+ state/tests/)
  transport/     4 files,   892 LOC   (+ transport/tests/)
  utils/        11 files,  1452 LOC   (+ utils/tests/, 8 test files)  ← THIS PLAN
```

Confirm with:

```bash
find apps/web/src/features/chat/lib -maxdepth 1 -name "*.ts" | wc -l    # → 51
find apps/web/src/features/chat/utils -maxdepth 1 -name "*.ts" | wc -l  # → 11
```

### The 51 files in `lib/`

Ten are already unprefixed and just move:

`agent-markdown.ts`, `byte-bounded-lru.ts`, `checkpoint-diff-query.ts`,
`composer-command-search.ts`, `composer-skills.ts`, `context-usage.ts`,
`image-compression.ts`, `markdown-clipboard.ts`, `markdown-external-links.ts`,
`markdown-fence.ts`, `markdown-file-link-chips.ts`, `markdown-file-links.ts`,
`markdown-fragment-links.ts`, `markdown-highlight.ts`,
`markdown-list-indentation.ts`, `model-effort.ts`, `model-picker-badges.ts`,
`model-picker-search.ts`, `model-preferences.ts`, `project-entry-query.ts`,
`project-qualifiers.ts`, `provider-auth-query.ts`, `provider-auth.ts`,
`provider-brand-marks.ts`, `provider-model-options.ts`, `provider-query.ts`,
`resolve-model-selection.ts`, `streamdown-editor-theme.ts`,
`terminal-context.ts`, `thread-status.ts`, `user-message-collapse.ts`

The rest are `chat-`-prefixed and get the prefix stripped:

`chat-activity-presentation.ts`, `chat-activity-visibility.ts`,
`chat-changed-files-expansion-storage.ts`, `chat-changed-files-presentation.ts`,
`chat-command-builders.ts`, `chat-command-sync.ts`, `chat-draft-storage.ts`,
`chat-formatters.ts`, `chat-input-attachment-limits.ts`,
`chat-input-attachments.ts`, `chat-input-editor-actions.ts`,
`chat-input-logic.ts`, `chat-message-metadata.ts`, `chat-pipeline-logging.ts`,
`chat-proposed-plan.ts`, `chat-runtime-state.ts`, `chat-thread-status.ts`,
`chat-timeline-items.ts`, `chat-turn-diff-tree.ts`, `chat-work-log.ts`

### No name collisions

I verified that stripping `chat-` from every `lib/` file produces **zero
collisions** with the 11 existing `utils/` filenames:

```bash
comm -12 \
  <(find apps/web/src/features/chat/lib -maxdepth 1 -name "*.ts" -exec basename {} \; | sed 's/^chat-//' | sort) \
  <(find apps/web/src/features/chat/utils -maxdepth 1 -name "*.ts" -exec basename {} \; | sort)
```

→ empty. Re-run this before Step 2; a non-empty result is a STOP condition.

### One collision that _is_ real, and is NOT this plan's job

`lib/thread-status.ts` (100 lines) and `lib/chat-thread-status.ts` (16 lines)
both exist today and both describe thread busy-ness:

`apps/web/src/features/chat/lib/thread-status.ts:11`

```ts
export type ThreadStatus = 'waiting' | 'working' | 'failed' | 'idle'
```

`apps/web/src/features/chat/lib/chat-thread-status.ts:5`

```ts
export function isChatThreadBusy(thread: ChatThread | undefined) {
  if (!thread) return false
  if (thread.latestTurn?.state === 'running') return true

  return isBusyChatSession(thread.session)
}
```

After the prefix strip these become `utils/thread-status.ts` and
`utils/chat-thread-status.ts` — which _is_ a collision of meaning even though it
is not a collision of filename. **Do not merge them in this plan.** Merging is
logic work, it needs its own tests, and doing it inside a 100-file rename makes
the diff unreviewable. Instead: keep `chat-thread-status.ts` as
`utils/thread-busy.ts` (a name that says what it actually does and does not
collide conceptually), and record the merge as a follow-up in your final report.

### The conventions

Quoted verbatim from `AGENTS.md`:

> - Group by feature, then by kind:
>   - `utils/` — pure, stateless, non-React code only. No stores, no
>     module-level mutable state, no subscriptions, nothing that imports React
>   - `tests/` — feature tests
> - Do not create empty folders.
> - Import exact files through `@/`. Do not add barrel `index.ts` files.
> - Do not repeat the folder name in file or symbol names.
> - When removing a redundant prefix, rename the file, exports, and all call
>   sites in one pass.
> - Keep qualifiers only when they add meaning: domain types like
>   `WorkspaceCommand`, domain terms like `workspacePath`.

> ## Greenfield, No Backward Compatibility
>
> - No backward compatibility shims, no legacy aliases, no deprecation windows.
>   Update every call site in the same pass.

Also read `docs/web-code-layout.md` (written by plan 009). If it is absent, that
is a STOP condition.

### An exemplar to match

`features/address/` and `features/menus/` both use `utils/` with unprefixed
names — e.g. `features/address/utils/grammar.ts`, not
`features/address/utils/address-grammar.ts`. That is the target shape.

### Import styles in use

Chat files use **both** forms:

`apps/web/src/features/chat/components/assistant-markdown-link.tsx:8`

```ts
import { findMarkdownFragmentTarget } from '../lib/markdown-fragment-links'
```

and elsewhere the alias form `@/features/chat/lib/...`. `apps/web/tsconfig.json`
maps `"@/*": ["./src/*"]` and `vite.config.ts` mirrors it. When rewriting, keep
whichever style the importing file already uses.

## Commands you will need

| Purpose         | Command                            | Expected on success              |
| --------------- | ---------------------------------- | -------------------------------- |
| Typecheck (web) | `cd apps/web && bun run typecheck` | exit 0, no errors                |
| Test (web)      | `cd apps/web && bun run test`      | all pass                         |
| Lint (web)      | `cd apps/web && bun run lint`      | exit 0                           |
| Format          | `cd apps/web && bun run format`    | exit 0 (rewrites files)          |
| Full verify     | `bun run verify` (repo root)       | exit 0 — typecheck+lint+fmt+test |

Record the baseline test count first:
`cd apps/web && bun run test 2>&1 | tail -5`. It must be identical at the end.

## Scope

**In scope**:

- `apps/web/src/features/chat/lib/**` (moved into `utils/`, then deleted)
- `apps/web/src/features/chat/utils/**` (receives the files)
- Any file under `apps/web/src/` importing from `features/chat/lib/` (import
  specifier updated only)

**Out of scope** (do NOT touch):

- `apps/web/src/features/chat/{components,hooks,providers,state,transport,environment}/`
  — except for import-specifier edits where they import from `lib/`.
  In particular `state/chat-projection-writers.ts` (1,566 lines) is **not**
  split, moved, or edited beyond its import lines.
- `apps/web/src/features/chat-mode/**` — a separate feature, separate plan.
- `apps/web/src/lib/` — the app-level `lib/` directory. It is a different thing
  and is plan 012's concern. Do not touch it, do not "consolidate" into it.
- Merging `thread-status.ts` with `chat-thread-status.ts` — see above.
- Any change to a function body, signature, type, or exported symbol name.
  **This plan renames files, not exports.** `chatInputSkillItems` stays
  `chatInputSkillItems`.
- Adding any `index.ts` barrel. Explicitly forbidden.

## Git workflow

Per the operator rule in `plans/README.md`: **all work happens on `main`** — no
new branches, worktrees, or PRs unless the operator explicitly asks.

Conventional commits, lowercase descriptive subject. Examples from `git log`:

```
refactor(orchestration): the server prepares a session's worktree (M-C)
fix(chat): the browser tests get the providers the theme setting needs
```

Commit after Step 3 (sources moved and green) and after Step 4 (tests moved and
green), so the two halves are separately bisectable.

## Steps

### Step 1: Confirm the preconditions

```bash
cd /Users/shaul/Desktop/D/platform
test -f docs/web-code-layout.md && echo "rule sheet present"
grep -rln "from 'react'\|from \"react\"\|useState\|useEffect\|createContext" apps/web/src/features/chat/lib/ | wc -l
comm -12 \
  <(find apps/web/src/features/chat/lib -maxdepth 1 -name "*.ts" -exec basename {} \; | sed 's/^chat-//' | sort) \
  <(find apps/web/src/features/chat/utils -maxdepth 1 -name "*.ts" -exec basename {} \; | sort)
```

**Verify**: the rule sheet prints, the React grep returns `0`, and the collision
check prints nothing. Any other result is a STOP condition — the plan's core
assumptions are that `lib/` is React-free and collision-free.

### Step 2: Move the 31 already-unprefixed source files

`git mv` each of these from `lib/` to `utils/` with no rename:

`agent-markdown.ts`, `byte-bounded-lru.ts`, `checkpoint-diff-query.ts`,
`composer-command-search.ts`, `composer-skills.ts`, `context-usage.ts`,
`image-compression.ts`, `markdown-clipboard.ts`, `markdown-external-links.ts`,
`markdown-fence.ts`, `markdown-file-link-chips.ts`, `markdown-file-links.ts`,
`markdown-fragment-links.ts`, `markdown-highlight.ts`,
`markdown-list-indentation.ts`, `model-effort.ts`, `model-picker-badges.ts`,
`model-picker-search.ts`, `model-preferences.ts`, `project-entry-query.ts`,
`project-qualifiers.ts`, `provider-auth-query.ts`, `provider-auth.ts`,
`provider-brand-marks.ts`, `provider-model-options.ts`, `provider-query.ts`,
`resolve-model-selection.ts`, `streamdown-editor-theme.ts`,
`terminal-context.ts`, `thread-status.ts`, `user-message-collapse.ts`

Do **not** update imports yet — do the whole move first, then one rewrite pass.
The tree will not typecheck between Step 2 and Step 4; that is expected.

**Verify**:
`find apps/web/src/features/chat/lib -maxdepth 1 -name "*.ts" | wc -l` → `20`

### Step 3: Move the 20 `chat-`-prefixed source files, stripping the prefix

| Move to (`utils/`)                   | From (`lib/`)                               |
| ------------------------------------ | ------------------------------------------- |
| `activity-presentation.ts`           | `chat-activity-presentation.ts`             |
| `activity-visibility.ts`             | `chat-activity-visibility.ts`               |
| `changed-files-expansion-storage.ts` | `chat-changed-files-expansion-storage.ts`   |
| `changed-files-presentation.ts`      | `chat-changed-files-presentation.ts`        |
| `command-builders.ts`                | `chat-command-builders.ts`                  |
| `command-sync.ts`                    | `chat-command-sync.ts`                      |
| `draft-storage.ts`                   | `chat-draft-storage.ts`                     |
| `formatters.ts`                      | `chat-formatters.ts`                        |
| `input-attachment-limits.ts`         | `chat-input-attachment-limits.ts`           |
| `input-attachments.ts`               | `chat-input-attachments.ts`                 |
| `input-editor-actions.ts`            | `chat-input-editor-actions.ts`              |
| `input-logic.ts`                     | `chat-input-logic.ts`                       |
| `message-metadata.ts`                | `chat-message-metadata.ts`                  |
| `pipeline-logging.ts`                | `chat-pipeline-logging.ts`                  |
| `proposed-plan.ts`                   | `chat-proposed-plan.ts`                     |
| `runtime-state.ts`                   | `chat-runtime-state.ts`                     |
| `thread-busy.ts`                     | `chat-thread-status.ts` ← renamed, see note |
| `timeline-items.ts`                  | `chat-timeline-items.ts`                    |
| `turn-diff-tree.ts`                  | `chat-turn-diff-tree.ts`                    |
| `work-log.ts`                        | `chat-work-log.ts`                          |

**The `thread-busy.ts` entry is deliberate**, not a typo. Stripping the prefix
from `chat-thread-status.ts` would produce `thread-status.ts`, which already
exists (moved in Step 2). `thread-busy.ts` names what the file's two exports
(`isChatThreadBusy`, `isBusyChatSession`) actually compute. Do not rename the
exports themselves.

**Note on `runtime-state.ts` and `draft-storage.ts`**: these names suggest state.
Both were confirmed React-free in Step 1, but open them and check for
module-level mutable state (a top-level `Map`, `Set`, or `let`). If either has
it, it belongs in `state/`, not `utils/` — report the reclassification rather
than placing it in `utils/`. `utils/` purity is a rule, not a preference.

**Verify**:

```bash
find apps/web/src/features/chat/lib -maxdepth 1 -name "*.ts" | wc -l   # → 0
find apps/web/src/features/chat/utils -maxdepth 1 -name "*.ts" | wc -l # → 62
```

### Step 4: Move the 34 test files

`lib/tests/` merges into `utils/tests/` (which already has 8 files). Strip
`chat-` prefixes the same way.

Unprefixed — move as-is: `byte-bounded-lru.test.ts`,
`checkpoint-diff-retry.test.ts`, `composer-command-search.test.ts`,
`composer-skills.test.ts`, `context-usage.test.ts`, `image-compression.test.ts`,
`markdown-clipboard.test.tsx`, `markdown-external-links.test.ts`,
`markdown-fence.test.ts`, `markdown-file-links.test.ts`, `model-effort.test.ts`,
`model-picker-badges.test.ts`, `model-picker-search.test.ts`,
`project-default-model.test.ts`, `provider-auth-query.test.ts`,
`provider-auth.test.ts`, `provider-model-options.test.ts`,
`resolve-model-selection.test.ts`, `terminal-context.test.ts`,
`thread-status.test.ts`

Prefixed — strip `chat-`:

| Move to (`utils/tests/`)             | From (`lib/tests/`)                       |
| ------------------------------------ | ----------------------------------------- |
| `activity-presentation.test.ts`      | `chat-activity-presentation.test.ts`      |
| `activity-visibility.test.ts`        | `chat-activity-visibility.test.ts`        |
| `changed-files-presentation.test.ts` | `chat-changed-files-presentation.test.ts` |
| `command-builders.test.ts`           | `chat-command-builders.test.ts`           |
| `command-sync.test.ts`               | `chat-command-sync.test.ts`               |
| `formatters.test.ts`                 | `chat-formatters.test.ts`                 |
| `input-attachment-limits.test.ts`    | `chat-input-attachment-limits.test.ts`    |
| `input-editor-actions.test.tsx`      | `chat-input-editor-actions.test.tsx`      |
| `input-logic.test.ts`                | `chat-input-logic.test.ts`                |
| `proposed-plan.test.ts`              | `chat-proposed-plan.test.ts`              |
| `runtime-state.test.ts`              | `chat-runtime-state.test.ts`              |
| `thread-busy.test.ts`                | `chat-thread-status.test.ts`              |
| `timeline-items.test.ts`             | `chat-timeline-items.test.ts`             |
| `work-log.test.ts`                   | `chat-work-log.test.ts`                   |

Then remove the now-empty `lib/` directory tree (`AGENTS.md`: "Do not create
empty folders" — and do not leave them either).

**Verify**: `test -d apps/web/src/features/chat/lib && echo PRESENT || echo GONE`
→ `GONE`

### Step 5: Rewrite every import specifier

Find every importer:

```bash
cd /Users/shaul/Desktop/D/platform
grep -rn "features/chat/lib/\|from '\.\./lib/\|from '\./lib/\|from '\.\./\.\./lib/" apps/web/src --include="*.ts" --include="*.tsx"
```

Rewrite each to the `utils/` path from the Step 2/3/4 tables. Two things to get
right:

1. **Relative depth changes for files that moved.** A file that moved from
   `lib/foo.ts` to `utils/foo.ts` and imported `'../state/chat-projection-store'`
   still imports `'../state/chat-projection-store'` — same depth. But a file that
   imported a sibling `'./chat-formatters'` now imports `'./formatters'`.
2. **`lib/tests/` → `utils/tests/` is also the same depth**, so test imports of
   `'../chat-formatters'` become `'../formatters'`.

Do NOT rename any exported symbol in this step.

**Verify**:

```bash
cd apps/web && bun run typecheck
```

→ exit 0. This is the real gate; a missed importer cannot typecheck.

```bash
grep -rn "features/chat/lib" apps/web/src --include="*.ts" --include="*.tsx" | wc -l
```

→ `0`

### Step 6: Decide on `environment/`

`features/chat/environment/` holds 2 files, 56 LOC, and is not a kind directory
either. Open both files:

- If they are pure (no React, no module state) → move to `utils/environment/`
  or flatten into `utils/` with a descriptive name, and delete `environment/`.
- If they hold configuration read at module scope → `state/` is the right home.
- If moving them creates any ambiguity at all, **leave them and report it.**
  56 lines is not worth a judgment call that this plan cannot make for you.

**Verify**: `cd apps/web && bun run typecheck` → exit 0 regardless of which
option you chose.

### Step 7: Format, lint, full suite

```bash
cd apps/web && bun run format && bun run lint && bun run test
cd /Users/shaul/Desktop/D/platform && bun run verify
```

**Verify**: all exit 0, and the web test count matches the Step-1 baseline.

## Test plan

**No new tests.** This plan changes no behavior.

The 42 existing chat tests (34 from `lib/tests/` + 8 from `utils/tests/`) are the
test plan. They must all pass with only import-specifier edits plus their own
renames. The highest-signal ones:

- `timeline-items.test.ts` (covers `chat-timeline-items.ts`, 778 LOC)
- `command-builders.test.ts` (covers `chat-command-builders.ts`, 595 LOC)
- `input-logic.test.ts` (covers `chat-input-logic.ts`, 462 LOC)
- `work-log.test.ts` (covers `chat-work-log.ts`, 403 LOC)

If any test needs a change beyond its import lines, that is a STOP condition.

Verification: `cd apps/web && bun run test` → all pass, count identical to the
pre-refactor baseline.

## Done criteria

ALL must hold:

- [ ] `test -d apps/web/src/features/chat/lib` → directory does not exist
- [ ] `find apps/web/src/features/chat/utils -maxdepth 1 -name "*.ts" | wc -l` → `62`
- [ ] `find apps/web/src/features/chat/utils/tests -name "*.ts*" | wc -l` → `42`
- [ ] `grep -rn "features/chat/lib" apps/web/src --include="*.ts" --include="*.tsx" | wc -l` → `0`
- [ ] `find apps/web/src/features/chat/utils -name "chat-*" | wc -l` → `0`
- [ ] `cd apps/web && bun run typecheck` exits 0
- [ ] `cd apps/web && bun run test` exits 0 with the same test count as baseline
- [ ] `bun run verify` exits 0 from the repo root
- [ ] No `index.ts` barrel created anywhere under `apps/web/src/features/chat/`
- [ ] `git diff -M ace313f..HEAD -- apps/web/src/features/chat/` shows renames
      plus import lines and **no logic changes**
- [ ] `git status` shows no modified files outside `apps/web/src/` and
      `plans/README.md`
- [ ] `plans/README.md` status row updated, and your report names the
      `thread-status.ts` / `thread-busy.ts` merge as a deferred follow-up

## STOP conditions

Stop and report back (do not improvise) if:

- `docs/web-code-layout.md` does not exist (plan 009 has not run).
- Step 1's React grep returns anything other than `0` — a `lib/` file imports
  React, so it is not a `utils/` candidate and the plan's premise is wrong for
  that file.
- Step 1's collision check prints any filename — two files would land on the
  same path and the mapping needs revising.
- The drift check shows `features/chat/lib/` no longer matches the 51-file
  inventory here. Report which files differ; do not invent destinations.
- A test fails and the fix requires anything beyond an import specifier change.
- `bun run typecheck` still fails after two rounds of fixing import paths.
- You find that `runtime-state.ts`, `draft-storage.ts`,
  `changed-files-expansion-storage.ts`, or `byte-bounded-lru.ts` holds
  module-level mutable state (an LRU especially — check it). Report the
  reclassification to `state/` rather than placing it in `utils/`.
- You find an `index.ts` barrel inside the chat feature.
- Moving a file would require editing its logic to satisfy the typechecker.

## Maintenance notes

- After 009, 010, and this plan, every feature under `apps/web/src/features/`
  follows one layout rule. Plan 012 then handles the code still living outside
  `features/` (`components/workspace/`, `hooks/`, `lib/`).
- A reviewer should check exactly one thing: `git diff -M` contains no logic
  changes. Everything else is proven by `bun run verify`.
- **Deferred follow-up, worth doing:** `utils/thread-status.ts` (100 LOC, defines
  the `'waiting' | 'working' | 'failed' | 'idle'` vocabulary and documents that
  every surface must agree on it) and `utils/thread-busy.ts` (16 LOC,
  `isChatThreadBusy`) are two answers to one question. `isChatThreadBusy` is
  almost certainly expressible as `threadStatus(x) === 'working'`. Merging them
  needs its own small plan with tests — it is logic, not layout.
- **Also deferred:** `state/chat-projection-writers.ts` is 1,566 lines, the
  largest file in the web app after `search-buffer-state.tsx`. It is untouched
  here. If the background audit flags it, that becomes its own plan.
- `utils/` will hold 62 files after this. That is large but flat and
  correctly-typed, which is strictly better than 62 files split across two
  directories by no rule. If it later wants subdivision, subdivide by _domain_
  (`utils/markdown/`, `utils/provider/`, `utils/composer/` — the prefixes
  already cluster that way) rather than reintroducing a `lib/`.
