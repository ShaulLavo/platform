# Plan 044: Move `entryFromStat`/`pathBasename` into `fs/entry.ts`; make `maxTextFileBytes` required on `GitService`

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
> cd /Users/shaul/Desktop/D/platform
> git status --short -- apps/server
> git diff --stat ace313f..HEAD -- apps/server/src
> ```
>
> Expected: **both commands print nothing**. At the time this plan was written
> `apps/server` was entirely clean, both committed and in the working tree, so
> any output at all means the code has moved. (`git diff ace313f..HEAD` alone is
> not enough — it says nothing about uncommitted edits, which is why the
> `git status` line is there.) If anything is listed, compare the "Current
> state" excerpts below against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.
>
> Note: the rest of the repo _is_ dirty — there is uncommitted work in
> `apps/web`, `packages/contracts`, `scripts/`, `docs/` and `plans/`. That is
> not your work, not drift in this plan's sense, and must not be staged,
> reverted, or formatted.
>
> **Heads-up on diff size.** Step 3 makes one constructor option required, and
> TypeScript then demands an edit at **27 call sites across 14 test files**.
> That is expected, listed exhaustively below, and not scope creep. Do not
> shrink it by re-adding a default.

## Status

- **Priority**: P3
- **Effort**: S (wide but mechanical — ~30 edited call sites, 2 tiny new files)
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `ace313f`, 2026-08-16

## Why this matters

Three of the same truths are written down twice by hand in `apps/server`, and
nothing checks the copies against each other. `entryFromStat` — the projection
from a stat result to the `TreeEntry` the client receives — exists
character-for-character in both `fs/service.ts` and `fs/watch.ts`, along with
its private `pathBasename` helper; both copies are module-local and unexported,
so neither file can see the other's. The day `TreeEntry` gains a field, one copy
gets it and the other compiles fine and ships a lying watch event. Separately,
the 200 MB text-file ceiling is spelled twice — once in `fs/service.ts` and once
in `git/service.ts` — and git's copy is **unreachable in production**, because
`app.ts` always passes fs's resolved value. An unreachable default that happens
to agree today is a drift generator: the first time someone lowers the real
limit (it is already env-overridable via `MAX_TEXT_FILE_BYTES`), git's tests
would keep proving the old number.

After this plan there is one `entryFromStat`, one 200 MB constant, and no way to
construct a `GitService` without stating its text-file limit.

This closes one instance of **theme T1** from `plans/README.md` — _"Parallel
hand-maintained representations of one truth … a second representation must be
derived, never maintained"_ — which names `entryFromStat` explicitly.

## Current state

### The files

- `apps/server/src/fs/service.ts` — `FileSystemService`. Holds copy #1 of
  `entryFromStat` (line 464) and `pathBasename` (line 640), plus the canonical
  `DEFAULT_MAX_TEXT_FILE_BYTES` (line 66) and `MAX_TEXT_FILE_BYTES_UPPER_BOUND`
  (line 68).
- `apps/server/src/fs/watch.ts` — `FileChangeHub`. Holds copy #2 of
  `entryFromStat` (line 454) and `pathBasename` (line 467).
- `apps/server/src/git/service.ts` — `GitService`. Holds the duplicate
  `DEFAULT_MAX_TEXT_FILE_BYTES` (line 110) and the optional
  `maxTextFileBytes?: number` on `GitServiceOptions` (line 75).
- `apps/server/src/app.ts` — the **only** production `new GitService(...)`
  (line 68). Not modified by this plan; it already passes the option.
- `apps/server/src/fs/entry.ts` — **does not exist yet**. You create it.
- `apps/server/src/fs/limits.ts` — **does not exist yet**. You create it.

### Excerpt 1 — `apps/server/src/fs/service.ts:464-475`

```ts
function entryFromStat(stat: FileSystemEntryMetadata): TreeEntry {
  return {
    path: stat.path,
    name: pathBasename(stat.path),
    type: stat.type,
    targetType: stat.targetType,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    birthtimeMs: stat.birthtimeMs,
    version: stat.version,
  }
}
```

### Excerpt 2 — `apps/server/src/fs/service.ts:640-643`

```ts
function pathBasename(input: string) {
  const parts = input.split('/').filter(Boolean)
  return parts.at(-1) ?? 'Root'
}
```

### Excerpt 3 — `apps/server/src/fs/watch.ts:454-470` (byte-identical to excerpts 1 and 2)

```ts
function entryFromStat(stat: FileSystemEntryMetadata): TreeEntry {
  return {
    path: stat.path,
    name: pathBasename(stat.path),
    type: stat.type,
    targetType: stat.targetType,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    birthtimeMs: stat.birthtimeMs,
    version: stat.version,
  }
}

function pathBasename(input: string) {
  const parts = input.split('/').filter(Boolean)
  return parts.at(-1) ?? 'Root'
}
```

### Call sites of the two copies (verified — there are only these)

```
apps/server/src/fs/service.ts:410     ...entryFromStat(stat),
apps/server/src/fs/service.ts:416     return entryFromStat(stat)
apps/server/src/fs/service.ts:467     name: pathBasename(stat.path),     ← inside entryFromStat
apps/server/src/fs/watch.ts:448       return entryFromStat(await statPath(paths, relativePath))
apps/server/src/fs/watch.ts:457       name: pathBasename(stat.path),     ← inside entryFromStat
```

**Important**: `pathBasename` is used _only_ by `entryFromStat`, in both files.
It therefore moves with `entryFromStat` but stays **unexported** in the new
module. Do not export it — an export with no external consumer is exactly the
dead surface `plans/README.md` theme T4 is about.

### Excerpt 4 — `apps/server/src/fs/service.ts:64-85`

```ts
const DEFAULT_TREE_CONCURRENCY = 32

const DEFAULT_MAX_TEXT_FILE_BYTES = 209_715_200

const MAX_TEXT_FILE_BYTES_UPPER_BOUND = 2_147_483_647

function resolveMaxTextFileBytes(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.MAX_TEXT_FILE_BYTES
  if (raw === undefined) return DEFAULT_MAX_TEXT_FILE_BYTES

  const parsed = Number.parseInt(raw, 10)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_TEXT_FILE_BYTES_UPPER_BOUND) {
    recordProcessWarning('fs.invalid_max_text_file_bytes', {
      fallback: DEFAULT_MAX_TEXT_FILE_BYTES,
      max: MAX_TEXT_FILE_BYTES_UPPER_BOUND,
      value: raw,
    })
    return DEFAULT_MAX_TEXT_FILE_BYTES
  }

  return parsed
}
```

`resolveMaxTextFileBytes` **stays in `fs/service.ts`** — it calls
`recordProcessWarning` from `../observability`, and the whole point of the new
`fs/limits.ts` is that it is a zero-import leaf that git tests can import
cheaply. Only the two `const`s move.

### Excerpt 5 — `apps/server/src/git/service.ts:72-79`

```ts
type GitServiceOptions = {
  diffConcurrency?: number
  maxCommandOutputBytes?: number
  maxTextFileBytes?: number
  now?: () => number
  repositoryCacheTtlMs?: number
  statusCacheTtlMs?: number
}
```

(`GitServiceOptions` is **not** exported — tests pass object literals, so no
test imports this type.)

### Excerpt 6 — `apps/server/src/git/service.ts:109-110`

```ts
const DEFAULT_DIFF_CONCURRENCY = 4
const DEFAULT_MAX_TEXT_FILE_BYTES = 209_715_200
```

### Excerpt 7 — `apps/server/src/git/service.ts:155-159`

```ts
  constructor(paths: WorkspacePaths, options: GitServiceOptions = {}) {
    this.paths = paths
    this.diffConcurrency = positiveInteger(options.diffConcurrency, DEFAULT_DIFF_CONCURRENCY)
    this.maxCommandOutputBytes = positiveInteger(options.maxCommandOutputBytes, MAX_OUTPUT_BYTES)
    this.maxTextFileBytes = positiveInteger(options.maxTextFileBytes, DEFAULT_MAX_TEXT_FILE_BYTES)
```

`positiveInteger` (defined at `git/service.ts:1215`) stays — it is still used
for `diffConcurrency` and `maxCommandOutputBytes`.

### Excerpt 8 — `apps/server/src/app.ts:67-70` (the only production construction — do not change it)

```ts
const fs = new FileSystemService(options)
const git = new GitService(fs.paths, {
  maxTextFileBytes: fs.info().maxTextFileBytes,
})
```

### Repo conventions that apply here

Quoted verbatim from `/Users/shaul/Desktop/D/platform/AGENTS.md`, because you
have not read that file:

- > "Group by feature, then by kind: … `utils/` — pure, stateless, non-React
  > code only."
  > `apps/server/src/fs/` is a flat feature folder of kind-named leaf modules
  > (`path.ts`, `stat.ts`, `read.ts`, `write.ts`, `version.ts`). `entry.ts` and
  > `limits.ts` follow that existing shape. **Do not** create an `fs/utils/`
  > subfolder.
- > "Import exact files through `@/`. Do not add barrel `index.ts` files."
  > The `@/` alias is an `apps/web` thing; `apps/server` uses relative imports
  > (`../fs/path`, `./contracts`). Match the neighbours. Do **not** add any
  > `index.ts`.
- > "Do not repeat the folder name in file or symbol names."
  > So: `fs/entry.ts`, not `fs/fs-entry.ts`.
- > "This project is greenfield and not live: no releases, no external users,
  > no data anyone needs migrated. No backward compatibility shims, no legacy
  > aliases, no deprecation windows. **Update every call site in the same
  > pass.**"
  > This is the rule that licenses step 3. Making `maxTextFileBytes` required and
  > fixing all 27 test constructions in one commit is the house style. Do **not**
  > keep a default "for compatibility", do **not** add an overload, do **not**
  > leave a `?` with a runtime fallback.
- > "Remove duplicate code aggressively."
- > "Keep nesting depth to 3 or less. Use guard clauses and early returns."
  > The moved functions are already flat; keep them flat.
- > "Never throw `new Error`. Create errors with `createError` from `evlog`."
  > This plan adds no error paths. If you find yourself wanting to throw, you have
  > left the plan — see STOP conditions.
- > "A dev server is always running. Never spin up your own server to test or
  > verify changes — reuse the running one."
  > This plan is server-internal and needs no browser verification at all. Do not
  > start anything.

## Commands you will need

Run all of these from `/Users/shaul/Desktop/D/platform` unless the command
itself `cd`s.

| Purpose                    | Command                                                                                          | Expected on success                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Typecheck (server only)    | `cd /Users/shaul/Desktop/D/platform/apps/server && bun run typecheck`                            | exit 0; prints only the `$ tsgo --noEmit` echo line                                                    |
| Lint (server only)         | `cd /Users/shaul/Desktop/D/platform/apps/server && bun run lint`                                 | exit 0; `oxlint` prints **nothing** on success — do not wait for a "0 errors" summary, there isn't one |
| Format check (server only) | `cd /Users/shaul/Desktop/D/platform/apps/server && bun run format:check`                         | exit 0, "All matched files use the correct format."                                                    |
| Format write (server only) | `cd /Users/shaul/Desktop/D/platform/apps/server && bun run format`                               | exit 0                                                                                                 |
| fs tests                   | `cd /Users/shaul/Desktop/D/platform/apps/server && bun --bun vitest run src/fs/tests`            | all pass                                                                                               |
| git tests                  | `cd /Users/shaul/Desktop/D/platform/apps/server && bun --bun vitest run src/git/tests`           | all pass                                                                                               |
| orchestration tests        | `cd /Users/shaul/Desktop/D/platform/apps/server && bun --bun vitest run src/orchestration/tests` | all pass                                                                                               |
| the fs→git wiring gate     | `cd /Users/shaul/Desktop/D/platform/apps/server && bun --bun vitest run src/tests/app.test.ts`   | all pass                                                                                               |
| whole server suite         | `cd /Users/shaul/Desktop/D/platform/apps/server && bun run test`                                 | all pass                                                                                               |

Notes on the commands:

- **Baseline is green.** `typecheck`, `lint` and `format:check` were all
  confirmed exit 0 in `apps/server` at commit `ace313f` before this plan was
  written. Any failure you see is caused by your edit, not inherited.
- The `--bun` flag is mandatory (`AGENTS.md`: _"The `--bun` flag is required for
  app tests. Without it, `bun:sqlite`, `Bun.spawn`, and other Bun APIs do not
  resolve."_). `bun run test` in `apps/server` already is `bun --bun vitest run`.
- **Known pre-existing condition, not caused by this plan and not yours to
  fix**: running the `apps/server` suite opens and WAL-locks the developer's
  real `~/.platform/fs-metadata.sqlite` (default path at
  `apps/server/src/db/client.ts:8`). That is plan 013's job. Do not touch it.
- Only run `bun run format` **inside `apps/server`**. The repo has uncommitted
  work in `apps/web`, `packages/contracts`, `scripts/` and `docs/`; a root-level
  `bun run format` would rewrite files this plan must not touch.
- Server tests import `{ describe, it, expect }` from `vitest` directly. The
  `apps/web/test/fixtures.ts` rule in `AGENTS.md` applies to `apps/web` only —
  do not import it here.

## Scope

**In scope** (the only files you may modify or create):

- `apps/server/src/fs/entry.ts` (create)
- `apps/server/src/fs/limits.ts` (create)
- `apps/server/src/fs/service.ts`
- `apps/server/src/fs/watch.ts`
- `apps/server/src/git/service.ts`
- The 14 test files listed in the step 3 table, all under
  `apps/server/src/git/tests/` and `apps/server/src/orchestration/tests/`
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch, even though they look related):

- `apps/server/src/app.ts` — already passes `maxTextFileBytes`; it is the
  reference call site, and changing it would break the one production wiring
  this plan is protecting.
- `apps/server/src/index.ts` — the `FS_DEV_MAX_TEXT_FILE_BYTES` env read. There
  are genuinely two env names for this value (`FS_DEV_MAX_TEXT_FILE_BYTES` in
  `index.ts:23`, `MAX_TEXT_FILE_BYTES` in `fs/service.ts:71`) and collapsing
  them is a settings-registry change, not this plan. See "Maintenance notes".
- `packages/contracts/src/settings/keys.ts` — do **not** register a
  `files.maxTextFileBytes` setting here. `AGENTS.md`: _"A key is never
  registered inert. Register it in the same pass that wires its consumer, or do
  not register it."_ Wiring a boot-critical, restart-required key is a separate
  plan.
- `apps/web/src/features/chat/lib/project-entry-query.ts:101` — a _third_
  `pathBasename`, but it is **not** identical: its fallback is `input`, not
  `'Root'`. `plans/README.md` explicitly rejected consolidating the six
  `basename`s ("four genuinely different behaviours … a silent behaviour change
  typecheck cannot catch"). Leave it alone. It also lives in a different app.
- `apps/server/src/fs/metadata.ts:95` `metadataRowToEntry` — looks like a
  sibling projection but maps a DB row (no `version`, no `targetType`). Not a
  duplicate. Leave it.
- `positiveInteger` at `git/service.ts:1215` — keep the function; it still
  serves two other options.
- Any `packages/editor-*` path — those are symlinks to a sibling checkout and
  are never in scope for this repo's plans.
- Test _assertions_. You are changing constructor arguments only. If you find
  yourself editing an `expect(...)`, stop.
- `resolveMaxTextFileBytes` in `fs/service.ts`. It looks like it belongs in the
  new `limits.ts` next to the constants it uses. It does not move: it calls
  `recordProcessWarning` from `../observability`, and the entire value of
  `limits.ts` is that it is a zero-import leaf git's tests can import without
  dragging observability (or, transitively, `@parcel/watcher`) behind it.
- A new `apps/server/src/fs/tests/entry.test.ts`. Do not create one. The moved
  body is character-identical to what it replaced; a fresh unit test would only
  restate the function, and `src/fs/tests/watch.test.ts` plus
  `src/tests/app.test.ts` already drive both projections end to end. See "Test
  plan".
- `docs/settings-registry-inventory.md` — it cites
  `apps/server/src/git/service.ts:110` and `fs/service.ts:66` as the duplicated
  constants, and those line references go stale when you land this. Updating
  that doc belongs to the settings plan that actually registers the key.
- Root-level commands. Run `format`, `lint`, `typecheck` and `test` **inside
  `apps/server`** only. The root scripts fan out through turbo across every
  workspace, and this repo has uncommitted work in `apps/web`,
  `packages/contracts`, `scripts/` and `docs/` that a root `format` would
  rewrite and a root `test` would fail on for reasons that are not yours.
- `apps/server/dist/` — a gitignored build artifact. It contains a stale bundled
  copy of `new GitService(...)`, which is why the greps in this plan are scoped
  to `apps/server/src`. Do not edit it, do not rebuild it, and do not treat a
  `dist/` grep hit as a finding.

## Git workflow

- **All work happens on `main`** — no new branches, worktrees, commits, pushes,
  or PRs unless the operator explicitly asks.
- If (and only if) the operator asks for a commit: conventional commits,
  lowercase descriptive subject. Real examples from `git log`:
  - `refactor(orchestration): the server prepares a session's worktree (M-C)`
  - `fix(address): bound the URL, and stop escaping slashes in ?tabs=`
  - Suggested subject for this work:
    `refactor(fs): one entryFromStat, and git must be told its text limit`

## Steps

### Step 1: Create `apps/server/src/fs/entry.ts` and delete both copies

Create `apps/server/src/fs/entry.ts` with exactly this content:

```ts
import type { FileSystemEntryMetadata } from '@workspace/contracts'
import type { TreeEntry } from './contracts'

/**
 * The one projection from a stat result to the `TreeEntry` clients receive.
 * Both the request path (`FileSystemService`) and the watch path
 * (`FileChangeHub`) go through here so a new `TreeEntry` field cannot land on
 * one and silently miss the other.
 */
export function entryFromStat(stat: FileSystemEntryMetadata): TreeEntry {
  return {
    path: stat.path,
    name: pathBasename(stat.path),
    type: stat.type,
    targetType: stat.targetType,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    birthtimeMs: stat.birthtimeMs,
    version: stat.version,
  }
}

function pathBasename(input: string) {
  const parts = input.split('/').filter(Boolean)
  return parts.at(-1) ?? 'Root'
}
```

Both imports are **type-only**, so this module has zero runtime imports and
cannot participate in an import cycle with `service.ts` or `watch.ts`.

Then delete the old copies. **Match on the function text from the excerpts, not
on the line numbers** — every line number below is measured against the
unmodified file, so the moment you delete `entryFromStat` from `service.ts` the
`pathBasename` below it shifts up by 12 lines. Do not drive these deletions with
line-addressed `sed`; find the function by name and remove it whole.

1. In `apps/server/src/fs/service.ts`, delete the `entryFromStat` function
   (lines 464-475, excerpt 1) and the `pathBasename` function (lines 640-643,
   excerpt 2). Add `import { entryFromStat } from './entry'` alongside the other
   relative `./` imports at the top of the file (they sit between the
   `@workspace/contracts` import and the `../observability` block — put it near
   `import { statPath } from './stat'`).
2. In `apps/server/src/fs/watch.ts`, delete the `entryFromStat` function
   (lines 454-465, excerpt 3) and the `pathBasename` function (lines 467-470).
   Add `import { entryFromStat } from './entry'` next to
   `import { statPath } from './stat'` at the top.
3. Clean up the now-unused `FileSystemEntryMetadata` imports. At `ace313f` that
   type appears in exactly four places, and after the deletions only the two
   import lines remain:
   - `apps/server/src/fs/watch.ts:5` is
     `import type { FileSystemEntryMetadata } from '@workspace/contracts'` —
     delete the whole line.
   - `apps/server/src/fs/service.ts:3` is
     `import { effectiveEntryType, type FileSystemEntryMetadata } from '@workspace/contracts'`
     — narrow it to `import { effectiveEntryType } from '@workspace/contracts'`.
     Keep `effectiveEntryType`; it is still used at `fs/service.ts:379` and
     `fs/service.ts:399`.
   - Do **not** remove the `TreeEntry` imports from either file. In `watch.ts`
     it is on the `./contracts` import line (`watch.ts:9`) and still used at
     `watch.ts:446`; in `service.ts` it is one name inside the multi-line
     `from './contracts'` block (`service.ts:42`) and still used at
     `service.ts:414`.

   Confirm with
   `grep -rn "FileSystemEntryMetadata" apps/server/src/fs/service.ts apps/server/src/fs/watch.ts`
   → no output. A leftover unused import is also a hard typecheck failure here:
   `apps/server/tsconfig.json` sets `"noUnusedLocals": true`, so `bun run
typecheck` will not pass until both are cleaned up.

**Verify**:

```bash
cd /Users/shaul/Desktop/D/platform
grep -rn "function entryFromStat\|function pathBasename" apps/server/src
```

→ exactly two lines, both in `apps/server/src/fs/entry.ts`.

```bash
cd /Users/shaul/Desktop/D/platform/apps/server && bun run typecheck
```

→ exit 0.

```bash
cd /Users/shaul/Desktop/D/platform/apps/server && bun --bun vitest run src/fs/tests
```

→ all pass (this includes `src/fs/tests/watch.test.ts`, which drives
`FileChangeHub` end to end).

### Step 2: Create `apps/server/src/fs/limits.ts` and point `fs/service.ts` at it

Create `apps/server/src/fs/limits.ts` with exactly this content:

```ts
/**
 * The one spelling of the text-file ceiling. `FileSystemService` resolves the
 * effective value (env override, then this default) and `app.ts` hands that
 * resolved number to `GitService`, so both services agree by construction
 * rather than by two constants happening to match.
 */
export const DEFAULT_MAX_TEXT_FILE_BYTES = 209_715_200

export const MAX_TEXT_FILE_BYTES_UPPER_BOUND = 2_147_483_647
```

Keep it import-free — git's tests import it, and it must not drag
`@parcel/watcher` or the observability layer in behind it.

In `apps/server/src/fs/service.ts`:

- Delete the two `const` declarations at lines 66 and 68 (excerpt 4). Keep
  `const DEFAULT_TREE_CONCURRENCY = 32` at line 64 and keep
  `resolveMaxTextFileBytes` exactly as it is.
- Add `import { DEFAULT_MAX_TEXT_FILE_BYTES, MAX_TEXT_FILE_BYTES_UPPER_BOUND } from './limits'`
  with the other `./` imports.

**Verify**:

```bash
cd /Users/shaul/Desktop/D/platform
grep -rn "209_715_200" apps/server/src
```

→ exactly **two** lines at this point: `apps/server/src/fs/limits.ts` and the
still-untouched `apps/server/src/git/service.ts:110`. (After step 3 it will be
one.)

```bash
cd /Users/shaul/Desktop/D/platform/apps/server && bun run typecheck
```

→ exit 0.

### Step 3: Make `maxTextFileBytes` required on `GitService` and update all 27 test constructions

In `apps/server/src/git/service.ts`:

1. Line 75: change `maxTextFileBytes?: number` → `maxTextFileBytes: number`.
2. Line 110: delete `const DEFAULT_MAX_TEXT_FILE_BYTES = 209_715_200`. Keep
   `DEFAULT_DIFF_CONCURRENCY` on line 109.
3. Line 155: change the constructor signature from
   `constructor(paths: WorkspacePaths, options: GitServiceOptions = {})` to
   `constructor(paths: WorkspacePaths, options: GitServiceOptions)` — the
   default `{}` no longer satisfies the type and must go.
4. Line 159: change
   `this.maxTextFileBytes = positiveInteger(options.maxTextFileBytes, DEFAULT_MAX_TEXT_FILE_BYTES)`
   to `this.maxTextFileBytes = options.maxTextFileBytes`.
   Leave lines 157-158 (`diffConcurrency`, `maxCommandOutputBytes`) alone.

Now typecheck will fail at every construction that does not pass the option.
Fix each by adding `maxTextFileBytes: DEFAULT_MAX_TEXT_FILE_BYTES`, importing
the constant from `'../../fs/limits'` (all 14 files are at `src/<area>/tests/`,
so the relative path is the same in every one — and every one of them already
imports `createWorkspacePaths` from `'../../fs/path'`, so put the new import
next to it).

The complete list, verified at `ace313f`:

| File (under `apps/server/src/`)                        | Lines                        | Current text                                                                                                |
| ------------------------------------------------------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `git/tests/service.test.ts`                            | 377, 389, 407, 418, 433, 457 | `const service = new GitService(createWorkspacePaths(root))`                                                |
| `git/tests/status-cache.test.ts`                       | 18, 36, 53, 74               | `new GitService(createWorkspacePaths(root), {` + multi-line options object                                  |
| `git/tests/process.test.ts`                            | 81, 94                       | `new GitService(createWorkspacePaths(root), { maxCommandOutputBytes: 4096 })`                               |
| `git/tests/commit-progress.test.ts`                    | 141                          | `return new GitService(createWorkspacePaths(root))`                                                         |
| `git/tests/push-and-pull-request.test.ts`              | 92                           | `return new GitService(createWorkspacePaths(root))`                                                         |
| `git/tests/checkpoint-store.test.ts`                   | 226                          | `return new GitCheckpointStore(new GitService(createWorkspacePaths(root)))`                                 |
| `git/tests/session-worktree.test.ts`                   | 89                           | `return new GitWorktreeService(new GitService(createWorkspacePaths(root)))`                                 |
| `git/tests/worktrees.test.ts`                          | 279                          | `return new GitWorktreeService(new GitService(createWorkspacePaths(root)))`                                 |
| `orchestration/tests/checkpoint-diff-query.test.ts`    | 47, 83, 135                  | `new GitService(createWorkspacePaths(root)),`                                                               |
| `orchestration/tests/checkpoint-reactor.test.ts`       | 100, 250, 263                | `new GitService(createWorkspacePaths(root))` (line 250 prefixed `checkpointGit:`, line 263 prefixed `git:`) |
| `orchestration/tests/checkpoint-projection.test.ts`    | 191                          | `new GitService(createWorkspacePaths(process.cwd())),`                                                      |
| `orchestration/tests/session-checkout-reactor.test.ts` | 114                          | `checkpointGit: new GitService(createWorkspacePaths(workspaceRoot)),`                                       |
| `orchestration/tests/engine.test.ts`                   | 751                          | `checkpointGit: new GitService(createWorkspacePaths(root)),`                                                |
| `orchestration/tests/thread-search.test.ts`            | 131                          | `new OrchestrationCheckpointDiffQuery(database, new GitService(createWorkspacePaths())),`                   |

Transformation patterns:

```ts
// no options today →
new GitService(createWorkspacePaths(root), { maxTextFileBytes: DEFAULT_MAX_TEXT_FILE_BYTES })

// already has options (process.test.ts) →
new GitService(createWorkspacePaths(root), {
  maxCommandOutputBytes: 4096,
  maxTextFileBytes: DEFAULT_MAX_TEXT_FILE_BYTES,
})

// already has a multi-line options object (status-cache.test.ts) → add one line,
// keeping the file's existing alphabetical-ish key order:
const service = new GitService(createWorkspacePaths(root), {
  maxTextFileBytes: DEFAULT_MAX_TEXT_FILE_BYTES,
  now: clock.now,
  statusCacheTtlMs: 1_000,
})
```

Do **not** invent per-test values (no `{ maxTextFileBytes: 5 }` here) — none of
these tests exercise the text-file limit, and inventing a value would change
what they cover. `apps/server/src/tests/app.test.ts` already covers the small
limit through the real app; leave it as it is.

If `oxfmt` wants to reflow a line you edited, let it (step 4).

**Verify**:

```bash
cd /Users/shaul/Desktop/D/platform
grep -rn "209_715_200" apps/server/src
```

→ exactly **one** line: `apps/server/src/fs/limits.ts`.

```bash
cd /Users/shaul/Desktop/D/platform
grep -rn "maxTextFileBytes: DEFAULT_MAX_TEXT_FILE_BYTES" apps/server/src/git/tests apps/server/src/orchestration/tests | wc -l
grep -rln "DEFAULT_MAX_TEXT_FILE_BYTES" apps/server/src/git/tests apps/server/src/orchestration/tests | wc -l
```

→ **27** and **14**. (Count-based, not eyeball-based, and it survives `oxfmt`
reflowing your edits onto multiple lines in step 4 — which it will, because
several of these lines now exceed the repo's 100-column `printWidth`. Before
this plan, `maxTextFileBytes` appears **zero** times in those two directories,
so every hit is yours.)

```bash
cd /Users/shaul/Desktop/D/platform/apps/server && bun run typecheck
```

→ exit 0. **This is the real gate**: `apps/server/tsconfig.json` has
`"include": ["src", "scripts"]`, so tsgo typechecks the test files too. With the
option required, it cannot miss a construction. If it exits 0, every call site
is updated.

Then run the fs→git wiring gate, which is the _only_ thing that proves the
tightening did not break the direction that must keep working — that `app.ts`
still hands fs's resolved limit to git and git still honours it:

```bash
cd /Users/shaul/Desktop/D/platform/apps/server && bun --bun vitest run src/tests/app.test.ts
```

→ all pass, including `'skips snapshot refs for binary and large live diffs'`,
`'skips untracked files above the text diff limit'`, and `'omits blob text when
the opened snapshot exceeds the text limit'` — the three that drive the real app
with `maxTextFileBytes: 5`. If those three pass, the removal of git's fallback
did not silently restore the 200 MB behaviour.

### Step 4: Format, lint, and run the affected suites

```bash
cd /Users/shaul/Desktop/D/platform/apps/server && bun run format && bun run lint && bun run typecheck
```

→ all exit 0.

```bash
cd /Users/shaul/Desktop/D/platform/apps/server && bun run test
```

→ the whole server suite passes. (Runtime is several minutes; it spawns real
`git` processes and PTYs. `testTimeout` is already 30 s per test in
`apps/server/vitest.config.ts`.)

If you want faster feedback before the full run, the four targeted commands from
the "Commands you will need" table cover everything this plan touches:
`src/fs/tests`, `src/git/tests`, `src/orchestration/tests`, `src/tests/app.test.ts`.

### Step 5: Update the plan index

In `/Users/shaul/Desktop/D/platform/plans/README.md`, find the row:

```
| 044 | [`entryFromStat`/`pathBasename` into `fs/entry.ts`](044-fs-git-shared-primitives.md) | P3 | S | — | TODO |
```

Change the trailing `TODO` to `DONE`. Change nothing else in that file.

**Verify**: `git diff --stat plans/README.md` → 1 file changed, 1 insertion, 1 deletion.

## Test plan

**No new tests.** This change is behavior-preserving, and the existing suite is
already the gate — for three specific reasons, each of which you should confirm
rather than assume:

1. **The `entryFromStat` move is a pure relocation.** The new function body is
   character-identical to both deleted copies. `apps/server/src/fs/tests/watch.test.ts`
   drives `FileChangeHub` over a real temp directory and asserts the emitted
   `WatchServerMessage` payloads, which is the watch-side projection; the
   request-side projection is covered through the real routes in
   `apps/server/src/tests/app.test.ts`. A regression here would fail those.
2. **The fs→git limit wiring already has an end-to-end test.**
   `apps/server/src/tests/app.test.ts` builds the real app with
   `testApp(root, { maxTextFileBytes: 5 })` and asserts _git_ behaviour at three
   places — `'skips snapshot refs for binary and large live diffs'` (line 760),
   `'skips untracked files above the text diff limit'` (line 801), and
   `'omits blob text when the opened snapshot exceeds the text limit'`
   (line 817). Those tests only pass if `app.ts` still hands fs's resolved limit
   to `GitService`, which is exactly the contract step 3 makes mandatory. They
   are the reason no new test is needed here.
3. **The required-option change is proven by the compiler, not by a test.**
   `bun run typecheck` exiting 0 is a stronger guarantee than any test could
   give: it means zero constructions rely on an implicit limit.

If you disagree and want to add a test, the honest one to add would assert that
`GitService` cannot be constructed without the option — but that is a
compile-time property, not a runtime one, and a runtime test for it would have
to cast away the type. Don't. Writing new test files is out of scope.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `cd apps/server && bun run typecheck` exits 0
- [ ] `cd apps/server && bun run lint` exits 0
- [ ] `cd apps/server && bun run format:check` exits 0
- [ ] `cd apps/server && bun run test` exits 0, all tests pass
- [ ] `grep -rn "function entryFromStat\|function pathBasename" apps/server/src`
      returns exactly 2 lines, both in `apps/server/src/fs/entry.ts`
- [ ] `grep -rn "209_715_200" apps/server/src` returns exactly 1 line, in
      `apps/server/src/fs/limits.ts`
- [ ] `grep -n "maxTextFileBytes" apps/server/src/git/service.ts` shows
      `maxTextFileBytes: number` (no `?`) in `GitServiceOptions`
- [ ] `grep -rn "options: GitServiceOptions = {}" apps/server/src` returns nothing
- [ ] `grep -rn "maxTextFileBytes: DEFAULT_MAX_TEXT_FILE_BYTES" apps/server/src/git/tests apps/server/src/orchestration/tests | wc -l`
      returns `27`
- [ ] `git status --short -- apps/server` lists **exactly 19 entries** — 2 new
      (`?? apps/server/src/fs/entry.ts`, `?? apps/server/src/fs/limits.ts`),
      3 modified source (`fs/service.ts`, `fs/watch.ts`, `git/service.ts`), and
      the 14 modified test files. Scope the command to `apps/server` exactly as
      written:
      `apps/server` was clean before you started, so **everything** it lists is
      yours. A bare `git status --short` also shows pre-existing uncommitted
      work in `apps/web`, `packages/contracts`, `scripts/`, `docs/` and
      `plans/` — do not stage, revert, or format any of it.
- [ ] `plans/README.md` row 044 says `DONE`

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check prints any file, and the live code does not match the
  excerpts in "Current state".
- After step 3, `bun run typecheck` reports an error that is **not** "missing
  property `maxTextFileBytes`" at a `new GitService(...)` construction. A
  different error means something about `GitServiceOptions` is load-bearing in
  a way this plan did not anticipate.
- A test that passed before your change fails after it. The only intended
  behavioural delta in the whole plan is that `GitService` no longer rescues a
  zero/negative/non-integer `maxTextFileBytes` to 200 MB — and no test passes
  such a value. A failure means the two `entryFromStat` copies were not as
  identical as this plan claims, or something imports through a path this plan
  broke. Report the failing test name and its output; do not "fix" the test.
- `grep -rn "new GitService" apps/server/src packages scripts` (note: **not**
  bare `apps/` — that would also match the gitignored bundle
  `apps/server/dist/index.js`, which is not a finding) reports a construction
  that is **not** in the step 3 table and **not** `apps/server/src/app.ts:68`.
  The file set has drifted; report the extra site rather than guessing what
  limit it should use.
- Adding `import { entryFromStat } from './entry'` produces a circular-import
  warning or a test that hangs at import time. The new module is type-only by
  design; if it somehow acquired a runtime import, that is the cause.
- You find yourself wanting to touch `apps/server/src/index.ts`,
  `packages/contracts/src/settings/keys.ts`, or the web `pathBasename` — all
  three are explicitly out of scope; report the reason instead.
- Any step's verification command still fails after one focused fix attempt.
  This plan has no branch points: every step is a deletion, a move, or adding a
  known key to an object literal. A second failure means a premise is wrong, not
  that you need a third idea. Report the command and its full output.

## Maintenance notes

For whoever owns this next:

- **What a reviewer should scrutinize.** Two things only: (a) that
  `apps/server/src/fs/entry.ts` is byte-equivalent to the deleted bodies — diff
  it against `ace313f`'s `fs/watch.ts:454-470` if in doubt; (b) that no test
  quietly acquired a _different_ `maxTextFileBytes` value. Every one of the 27
  test sites should read `DEFAULT_MAX_TEXT_FILE_BYTES`, nothing else. The rest of
  the diff is a compiler-driven mechanical sweep and can be skimmed.
- **The seam this leaves for the settings registry.** After this change there is
  exactly one place to point a future `files.maxTextFileBytes` registry key at:
  `apps/server/src/fs/limits.ts`. `docs/settings-registry-inventory.md:137` and
  `:343` already spec that key and already name this duplication as the reason
  it must be registered carefully; that doc's remaining complaint after this
  plan is the _two env names_ for one value —
  `FS_DEV_MAX_TEXT_FILE_BYTES` (`apps/server/src/index.ts:23`) and
  `MAX_TEXT_FILE_BYTES` (`apps/server/src/fs/service.ts:71`), only the second of
  which is validated. **Deliberately deferred**: collapsing those two env reads
  onto one registry entry is boot-critical, `requiresRestart`, and needs a
  consumer wired in the same pass per `AGENTS.md`. It is a settings plan, not
  this one.
- **What will interact with this later.** Any new field on `TreeEntry`
  (`packages/contracts`, re-exported through `apps/server/src/fs/contracts.ts:221`)
  now has exactly one projection to update. That is the whole point — if a future
  change re-introduces a second projection, this plan has been undone.
- **Dropped validation.** `GitService` no longer runs `positiveInteger` over
  `maxTextFileBytes`. Every producer is already validated:
  `numberFromEnv` (`index.ts:98-103`) returns `undefined` for anything not
  `> 0`, and `resolveMaxTextFileBytes` (`fs/service.ts:70-85`) clamps to
  `1..2_147_483_647` with an `fs.invalid_max_text_file_bytes` process warning.
  Note the one remaining hole, out of scope here: `FileSystemServiceOptions.maxTextFileBytes`
  itself is _not_ validated (`fs/service.ts:112` is a bare `??`), so a caller
  passing `0` directly to `createApp` would now propagate `0` to git instead of
  being silently rescued to 200 MB. That is arguably the correct behaviour —
  the old rescue meant fs and git could disagree — but if it ever needs
  guarding, guard it once in `FileSystemService`, not again in `GitService`.
- **Not worth doing, considered and dropped**: exporting `pathBasename` from
  `fs/entry.ts` so other call sites could use it. There are five other
  `basename`-shaped helpers in this repo with four different fallback
  behaviours, and `plans/README.md` already rejected consolidating them because
  swapping a call site is a silent behaviour change typecheck cannot catch.
  Keeping it private is the deliberate choice.
