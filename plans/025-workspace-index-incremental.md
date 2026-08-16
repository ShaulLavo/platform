# Plan 025: Give `WorkspaceIndex` running counters, a parent→children map, and delete the per-event snapshot clone

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**, from the repo root
> `/Users/shaul/Desktop/D/platform`:
> `git diff --stat ace313f..HEAD -- apps/server/src/fs/workspace-index.ts apps/server/src/fs/tests/workspace-index.test.ts`
> Expected: empty output. If either in-scope file changed since this plan was
> written, compare the "Current state" excerpts against the live code before
> proceeding; on a mismatch, treat it as a STOP condition.
>
> **The working tree is not clean, and that is expected.** At planning time
> `git status --porcelain` already listed ~21 modified files under `apps/web/`,
> `packages/contracts/`, `docs/`, `scripts/`, `plans/README.md`, `bun.lock` and
> `package.json`, plus ~40 untracked `plans/*.md` files — including this plan
> itself. **None of it is under `apps/server/`.** Do not revert, stash, commit,
> or clean any of it, and do not treat it as drift. Every "did I touch only my
> files?" check in this plan is scoped to `apps/server` for that reason.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `ace313f`, 2026-08-16

This plan closes the `WorkspaceIndex` instance of cross-cutting theme **T6 —
"Right gate, wrong data structure behind it"** from `plans/README.md`: a correct
predicate guards an operation that then does full-collection work.

## Why this matters

`WorkspaceIndex` is the server's in-memory map of every file in the workspace.
It backs workspace search (`apps/server/src/fs/search.ts`). It is updated
incrementally from filesystem watch events — and every one of those incremental
updates does work proportional to the **entire index**, not to the thing that
changed.

Saving one file produces (at minimum) one `changed` event, and that single event
runs this chain:

| Step            | Call                                                                     | Cost                                                               |
| --------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| watcher enqueue | `markSubtreeStale(path)` (`workspace-index.ts:214`)                      | full map scan                                                      |
| ↳ inside it     | `staleLiveStatus` → `staleEntryCount(entries)` (`:1214`)                 | full map scan                                                      |
| flush           | `commitScannedEntries` → `removeEntriesAt(scanPath)` (`:333`)            | `Array.from(map.keys())` — an N-string array — then N prefix tests |
| ↳ then          | `incrementalStatus` → `staleEntryCount` + `fileCount` (`:1214`, `:1202`) | two full map scans                                                 |
| ↳ then          | `return this.snapshot()` (`:330`) → `entries()` (`:112`)                 | **N cloned entry objects**                                         |
| flush return    | `applyWatchEvents` → `return this.snapshot()` (`:176`)                   | **N more cloned entry objects**                                    |

That is five full traversals, one N-element string array, and 2N freshly
allocated entry objects — per event. And the clones are pure waste: the only
production caller, `WorkspaceIndexEventWatcher.applyPendingEvents`
(`workspace-index.ts:532`), writes `await this.index.applyWatchEvents(events)`
and discards the result. Nothing in `apps/server` or `apps/web` ever reads
`snapshot().entries` or `entries()` — only the test file does.

On this repository the index is small enough that nobody notices. On a 100k-entry
monorepo a single keystroke-triggered save allocates 200k+ objects on the
server's main thread, and a burst of E coalesced events multiplies it by E.

After this plan: `fileCount` and `staleEntryCount` are running counters mutated
by the same code that inserts and deletes entries; subtree removal and subtree
staling walk only the subtree via a parent→children map; and the snapshot clone
is **deleted**, not made lazy, because nothing consumes it. Per-event cost stops
depending on index size.

## Structural alternative (state it before tuning — repo rule)

`AGENTS.md` ("Optimization And Performance Work") requires stating the
structural alternative before tuning. It was considered and is written down here
so nobody re-derives it:

**The real frame problem is that a tree is stored as a flat `Map<fullPath,
Entry>`.** Every subtree operation therefore degrades into a linear scan with
string-prefix tests, and every aggregate degrades into a linear fold. The
domain-correct structure is a real tree: interned path segments, per-directory
child indices, and subtree aggregates maintained on mutation. This repository
already contains a mature implementation of exactly that —
`packages/tree/src/utils/path-store/child-index.ts`, which keeps
`childIdByNameId`, `childIds`, `childPositionById`, and running
`totalChildSubtreeNodeCount` / `totalChildVisibleSubtreeCount` aggregates updated
by `applyChildAggregateDelta` instead of rescanning. **Read that file before you
start; it is the in-repo precedent for the map this plan adds.**

**It is deliberately not adopted here**, for one concrete reason: the dominant
_read_ of this index is a full flat iteration.
`PathIndexSearchProvider.searchNames` (`apps/server/src/fs/search.ts:147`) does
`for (const entry of entriesByPath.values())` over the whole map on every search,
and `ContentIndexFilter.rgExcludeGlobs` (`search.ts:189`) does the same. A tree
store would force a rewrite of that measured, tuned hot loop and would buy the
read path nothing. The flat map is the right shape for how the data is actually
read; it is the wrong shape only for the subtree _write_. Adding one side index
for writes, while leaving `entryMap()` byte-for-byte the same for readers, is the
minimal change that fixes the actual defect.

**Revisit the tree store if** a second side index appears, if subtree or prefix
_reads_ become hot, or if the index ever needs ordering/visibility semantics.
Then the path-store shape wins outright and the search provider should move with
it.

Also note the honest part of the win: two of the three sub-changes are structural
(O(N) → O(subtree), O(N) → O(1)); the third is a **deletion**, not an
optimization. `snapshot()` does not need to be made lazy. It needs to not exist.

## Current state

Files:

- `apps/server/src/fs/workspace-index.ts` (1,309 lines) — the `WorkspaceIndex`
  class (lines 95–368), its watcher (`WorkspaceIndexEventWatcher`, 389–547), the
  scanner (549–669), and the module-level status helpers (1,083–1,238).
- `apps/server/src/fs/tests/workspace-index.test.ts` (816 lines, one
  `describe('workspace index', ...)` block containing **28** `it(...)` tests) —
  the only consumer of `entries()` and `snapshot()`.
- `apps/server/src/fs/search.ts` — the only _production_ consumer of the index's
  entry data, and it reads through `entryMap()` (lines 147 and 178), never
  through `entries()`/`snapshot()`. **Out of scope.**
- `packages/tree/src/utils/path-store/child-index.ts` — reference only, do not
  modify.

### The class fields and the mutation sites (`workspace-index.ts:95-100`)

```ts
export class WorkspaceIndex {
  private entriesByPath = new Map<string, WorkspaceIndexEntry>()
  private pendingCreatedPaths = new Set<string>()
  private readonly paths: WorkspacePaths
  private rebuildSequence = 0
  private state: WorkspaceIndexMutableStatus
```

`entriesByPath` is mutated in exactly five places, all inside the class:

- `rebuild()` success — `this.entriesByPath = result.entries` (`:143`)
- `rebuild()` failure — `this.entriesByPath = new Map()` (`:150`)
- `markSubtreeStale()` — `this.entriesByPath.set(entryPath, { ...entry, stale: true })` (`:225`)
- `commitScannedEntries()` — `this.entriesByPath.set(entry.path, entry)` (`:326`)
- `removeEntriesAt()` — `.clear()` (`:336`) and `.delete(entryPath)` (`:343`)

That short list is what makes running counters safe.

### `entries()` / `entryMap()` / `snapshot()` (`:111-117`, `:362-367`)

```ts
  entries() {
    return Array.from(this.entriesByPath.values(), cloneEntry)
  }

  entryMap(): ReadonlyMap<string, Readonly<WorkspaceIndexEntry>> {
    return this.entriesByPath
  }
```

```ts
  snapshot() {
    return {
      entries: this.entries(),
      status: this.status(),
    }
  }
```

`cloneEntry` is `(entry) => ({ ...entry })` (`:1236`).

### `markSubtreeStale` — full-map scan (`:214-231`)

```ts
  markSubtreeStale(relativePath: string) {
    if (!canApplyIncrementalUpdates(this.state.readiness)) return

    const normalized = indexPathKey(relativePath)
    let changed = false

    for (const [entryPath, entry] of this.entriesByPath) {
      if (!isSameOrChildPath(entryPath, normalized)) continue
      if (entry.stale) continue

      changed = true
      this.entriesByPath.set(entryPath, { ...entry, stale: true })
    }

    if (!changed && this.state.readiness === 'stale') return

    this.state = staleLiveStatus(this.state, this.entriesByPath)
  }
```

### `removeEntriesAt` — full key array + full prefix scan (`:333-345`)

```ts
  private removeEntriesAt(relativePath: string) {
    const normalized = indexPathKey(relativePath)
    if (!normalized) {
      this.entriesByPath.clear()
      return
    }

    for (const entryPath of Array.from(this.entriesByPath.keys())) {
      if (!isSameOrChildPath(entryPath, normalized)) continue

      this.entriesByPath.delete(entryPath)
    }
  }
```

### `commitScannedEntries` (`:312-331`)

```ts
  private commitScannedEntries(
    scanPath: string,
    result: ScanResult,
    updateId: number,
    removePaths: readonly string[] = [],
  ) {
    if (!this.canCommitIncrementalUpdate(updateId)) return this.snapshot()

    for (const removePath of removePaths) {
      this.removeEntriesAt(removePath)
    }

    this.removeEntriesAt(scanPath)
    for (const entry of result.entries.values()) {
      this.entriesByPath.set(entry.path, entry)
    }

    this.state = incrementalStatus(this.state, this.entriesByPath, result)
    return this.snapshot()
  }
```

### The status helpers that fold the whole map (`:1096-1224`)

```ts
function readyStatus(
  scanRoot: string,
  result: ScanResult,
  startedAt: number,
  reason: string,
): WorkspaceIndexStatus {
  return {
    entryCount: result.entries.size,
    fileCount: fileCount(result.entries),
    // ...
    staleEntryCount: 0,
  }
}
```

`failedLiveStatus` (`:1138`), `staleLiveStatus` (`:1157`) and `incrementalStatus`
(`:1171`) each take `entries: ReadonlyMap<...>` and call `fileCount(entries)`
and/or `staleEntryCount(entries)`:

```ts
function fileCount(entries: ReadonlyMap<string, WorkspaceIndexEntry>) {
  let count = 0

  for (const entry of entries.values()) {
    if (entry.type !== 'file') continue

    count += 1
  }

  return count
}

function staleEntryCount(entries: ReadonlyMap<string, WorkspaceIndexEntry>) {
  let count = 0

  for (const entry of entries.values()) {
    if (!entry.stale) continue

    count += 1
  }

  return count
}
```

### Path key facts you must honor

- `indexPathKey()` (`:879`) normalizes to POSIX and maps the workspace root to
  the **empty string** `''`.
- The workspace root **is itself an entry**, stored under key `''` — see
  `scanWorkspaceIndex` (`:552`): `await scanEntry(context, paths.workspaceRoot, '')`.
- `isSameOrChildPath(path, parent)` (`:942`) returns `true` for **every** path
  when `parent` is `''`. That is why `markSubtreeStale('')` marks the whole index
  and `removeEntriesAt('')` clears it. Preserve both behaviours exactly.
- Entry keys never have a leading or trailing slash. The parent of `'src/app.ts'`
  is `'src'`; the parent of `'src'` is `''`; `''` has no parent.
- Every entry produced by a scan has `stale: false` (`workspace-index.ts:663`).
  That is why step 5 may replace `readyStatus`'s hardcoded `staleEntryCount: 0`
  with `counts.staleEntryCount` without changing behaviour.

### The one invariant this refactor depends on — read this twice

The old `removeEntriesAt` / `markSubtreeStale` scanned **every** key and used a
string-prefix test. That is robust to holes: an entry `'a/b/c.ts'` whose parent
`'a/b'` is _not_ itself an entry is still matched by the prefix `'a'`.

A parent→children walk is **not** robust to holes. `collectSubtreePaths('a')`
reaches `'a/b/c.ts'` only if `'a/b'` is also an entry, because `linkChildPath`
files `'a/b/c.ts'` under the key `'a/b'` and nothing ever visits that key.

The invariant that makes the walk equivalent is: **every entry's full ancestor
chain is also an entry, up to the root key `''`.** The existing code maintains
it — `refreshScanPath` (`:304-310`) widens any targeted scan to
`firstMissingAncestorPath(...)` (`:923`) precisely so a leaf create also
materializes its missing directories, and the test
`'indexes a missing parent directory from a leaf create event'`
(`tests/workspace-index.test.ts:444`) is the existing guard for it.

You are not asked to add code that repairs holes. You **are** asked to treat any
test failure that looks like "an entry survived a subtree delete" or "an entry
was not marked stale" as a possible invariant violation, and to report it (see
STOP conditions) rather than papering over it by falling back to a full scan.

### Repo conventions that apply (from `AGENTS.md` — you have not read it)

Quoted verbatim; these are binding:

- "Keep nesting depth to 3 or less." / "Use guard clauses and early returns. Keep
  the happy path shallow." / "In loops, use inverted conditions with `continue`
  instead of wrapping the body in `if`." / "Do not use `else` after an early
  return." / "Never use nested ternaries."
- "This project is greenfield and not live… No backward compatibility shims, no
  legacy aliases, no deprecation windows. Update every call site in the same
  pass."
- "Delete obsolete tests instead of preserving old behavior."
- "Remove duplicate code aggressively."
- "Never throw `new Error`. Create errors with `createError` from `evlog` — in
  practice through the feature's `structured-errors.ts` wrapper." →
  `workspace-index.ts` throws no errors of its own today. **Do not add any.** The
  `throw new Error(...)` calls at `tests/workspace-index.test.ts:681`, `:755` and
  `:808` are pre-existing test scaffolding — leave them alone.
- "Logging is wide-event style (evlog). Always prefer wide logs: enrich the one
  event per operation/request with more fields instead of emitting extra narrow
  log lines." → `workspace-index.ts` emits **no** logs today. Do not add any.
- "Measure before and after. An optimization without a benchmark or profile is a
  guess." → Steps 1 and 8 are that measurement, and they are mandatory.
- "A dev server is always running. Never spin up your own server to test or
  verify changes." → this plan needs no server; do not start one.

Formatting: 2-space indent, no semicolons, single quotes, trailing commas — match
the surrounding file. `oxfmt` enforces it; `bun run format:check` is a gate.

## Commands you will need

Run these from `/Users/shaul/Desktop/D/platform/apps/server` unless stated
otherwise.

| Purpose           | Command                                                                                                                               | Expected on success     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Drift check       | (repo root) `git diff --stat ace313f..HEAD -- apps/server/src/fs/workspace-index.ts apps/server/src/fs/tests/workspace-index.test.ts` | empty output            |
| Typecheck         | `bun run typecheck` (= `tsgo --noEmit`)                                                                                               | exit 0, no output       |
| Focused tests     | `bun --bun vitest run src/fs/tests/workspace-index.test.ts`                                                                           | all tests pass          |
| Search tests      | `bun --bun vitest run src/fs/tests/search.test.ts`                                                                                    | all tests pass          |
| Full server suite | `bun run test`                                                                                                                        | all tests pass          |
| Lint              | `bun run lint` (= `oxlint .`)                                                                                                         | exit 0, no warnings     |
| Format check      | `bun run format:check` (= `oxfmt --check .`)                                                                                          | exit 0                  |
| Auto-format       | `bun run format`                                                                                                                      | rewrites files in place |
| Benchmark         | (anywhere) `bun /tmp/workspace-index-bench.ts`                                                                                        | JSON with `msPerEvent`  |

Notes:

- `bun run test` in `apps/server` is `bun --bun vitest run`. The `--bun` flag is
  required — without it `bun:sqlite` and `Bun.spawn` do not resolve.
- `apps/server/tsconfig.json` sets **`noUnusedLocals: true`** and
  `noUnusedParameters: true`. tsgo therefore reports _unused private class
  members_ as errors. This matters: steps 2–4 leave the file half-wired, so
  `bun run typecheck` is **expected to fail** between step 2 and step 5. Step 5
  is the first typecheck gate — do not try to "fix" the intermediate errors.
- The `rg` commands in this plan use repo-root-relative paths. Run them from
  `/Users/shaul/Desktop/D/platform`, not from `apps/server`.
- The full `apps/server` suite currently opens the developer's real
  `~/.platform/fs-metadata.sqlite`. That is a known, separately-tracked wart
  (plan 013), **not** something this plan caused or fixes. Do not chase it.
- Do not run the repo-root `bun run verify` for this plan; the `apps/server`
  gates above are the relevant ones and root verify additionally builds every
  other workspace.

## Scope

**In scope** (the only files you may modify):

- `apps/server/src/fs/workspace-index.ts`
- `apps/server/src/fs/tests/workspace-index.test.ts`
- `plans/README.md` — **the status row for 025 only**, nothing else in the file.
  (Its title cell reads "lazy snapshot"; that wording is stale — this plan
  deletes the snapshot rather than making it lazy. Leave the title alone, change
  only the status cell.)

Scratch file, deliberately outside the repository:
`/tmp/workspace-index-bench.ts` (created in step 1, deleted in step 8).

**Out of scope** (do NOT touch, even though they look related):

- `apps/server/src/fs/search.ts` — reads the index through `entryMap()`, whose
  identity, contents and type are unchanged by this plan. Its iteration loop is
  measured and tuned; changing it is a separate, benchmarked concern.
- `apps/server/src/fs/service.ts` — only calls `status()` and `rebuild()`, both
  of which keep working. No edit is needed there; if you think one is, STOP.
- `apps/server/src/fs/watch.ts` / `FileChangeHub` — produces watch events. This
  plan changes only how they are consumed.
- `workspaceGitIgnoreMatcher(paths)` at `workspace-index.ts:568` — it re-reads
  `.gitignore` from disk on **every** targeted scan. That is a real per-event
  cost, but it is O(1) in index size and caching it needs its own invalidation
  story. Deliberately deferred; see "Maintenance notes".
- `apps/server/scripts/workspace-search-benchmark.ts` — benchmarks _search_, not
  index mutation. Do not extend it; this plan's benchmark lives outside the repo.
- `packages/tree/**` — the child-index precedent you are told to read. Reference
  only. It is a Preact package with its own plan (014) already queued against it.
- The public method `deleteSubtree()` (`workspace-index.ts:200`) has no callers
  in the repo today. Do **not** delete it — that belongs to the unreachable-code
  pass (plan 022), not to a perf plan. Keep it; it just returns `status()`
  instead of `snapshot()` after step 4, and step 7's root-key test uses it.
- Anything under `packages/editor-*` — those are symlinks to a sibling checkout
  and are never in scope for any plan.
- `apps/server/src/fs/tests/search.test.ts` — it is a canary you **run** (see
  STOP conditions), never a file you edit. If it fails, that is a signal, not a
  test to update.
- The **field list** of the `WorkspaceIndexStatus` type
  (`workspace-index.ts:38`-ish, the object literal shape returned by `status()`).
  `apps/web/src/lib/file-system-types.ts:19` declares its own structural copy
  with no compile-time link to the server, so adding, removing or renaming a
  status field silently breaks the web app and nothing will tell you. This plan
  changes only _how_ the existing fields are computed.
- `entryMap()`'s signature and return value. It must keep returning the live
  `ReadonlyMap<string, Readonly<WorkspaceIndexEntry>>`. Do not make it return the
  new child index, a copy, or a wrapper.
- Adding logs or `createError` calls to `workspace-index.ts`. It has neither
  today; a perf plan is not the place to introduce them.

## Git workflow

- **All work happens on `main`** — no new branches, worktrees, commits, pushes,
  or PRs unless the operator explicitly asks.
- If (and only if) the operator asks for a commit: conventional commits,
  lowercase descriptive subject. Real examples from `git log`:
  - `refactor(orchestration): the server prepares a session's worktree (M-C)`
  - `fix(address): bound the URL, and stop escaping slashes in ?tabs=`
  - A fitting subject here: `perf(fs): make workspace-index updates cost the subtree, not the index`

## Steps

### Step 1 (mandatory): measure the current per-event cost

Write this file **outside the repository** at `/tmp/workspace-index-bench.ts`.
It must not end up in `git status`.

```ts
// Scratch benchmark for plan 025. Not part of the repository.
// Run: bun /tmp/workspace-index-bench.ts
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const REPO = '/Users/shaul/Desktop/D/platform'
const DIRS = 100
const FILES = 100
const EVENTS = 200
const WARMUP = 20

const { createWorkspacePaths } = await import(`${REPO}/apps/server/src/fs/path.ts`)
const { buildWorkspaceIndex } = await import(`${REPO}/apps/server/src/fs/workspace-index.ts`)

const root = await mkdtemp(path.join(tmpdir(), 'workspace-index-bench-'))

for (let dirIndex = 0; dirIndex < DIRS; dirIndex += 1) {
  const directory = path.join(root, `dir-${dirIndex}`)
  await mkdir(directory, { recursive: true })
  await Promise.all(
    Array.from({ length: FILES }, (_unused, fileIndex) =>
      writeFile(
        path.join(directory, `file-${fileIndex}.ts`),
        `export const value = ${fileIndex}\n`,
      ),
    ),
  )
}

const index = await buildWorkspaceIndex(createWorkspacePaths(root), { reason: 'bench' })
const entryCount = index.status().entryCount

async function applyOne(iteration: number) {
  const relativePath = `dir-${iteration % DIRS}/file-${iteration % FILES}.ts`
  index.markSubtreeStale(relativePath)
  await index.applyWatchEvents([{ type: 'changed', path: relativePath }])
}

for (let iteration = 0; iteration < WARMUP; iteration += 1) await applyOne(iteration)

const startedAt = performance.now()
for (let iteration = 0; iteration < EVENTS; iteration += 1) await applyOne(iteration)
const totalMs = performance.now() - startedAt

await rm(root, { recursive: true, force: true })

console.log(
  JSON.stringify(
    {
      entryCount,
      events: EVENTS,
      msPerEvent: Math.round((totalMs / EVENTS) * 1000) / 1000,
      totalMs: Math.round(totalMs * 100) / 100,
    },
    null,
    2,
  ),
)
```

Run it three times and keep the output:

```
bun /tmp/workspace-index-bench.ts
```

**Verify**: JSON is printed, `entryCount` is `10101` (= `DIRS * FILES + DIRS + 1`
— the extra 1 is the workspace root entry under key `''`), and `msPerEvent` is a
positive number. Record all three `msPerEvent` values — you will report the
before/after comparison at the end. Building 10,000 files takes a few seconds;
that setup time is outside the measured window.

This script was executed against the current code at planning time and works as
written — the dynamic `import()` of the two `.ts` modules resolves, and
`entryCount` matched `DIRS * FILES + DIRS + 1` exactly. If module resolution
nevertheless fails on your machine, run it as
`cd /Users/shaul/Desktop/D/platform && bun /tmp/workspace-index-bench.ts` before
concluding anything is wrong; do not start editing the benchmark's imports.

**STOP** if the three `msPerEvent` readings differ by more than 3× from each
other (the machine is too noisy to measure on) — report and wait.

### Step 2: add the parent→children index and the running counters

Read `packages/tree/src/utils/path-store/child-index.ts` first — it is the
in-repo precedent for what you are about to add (a per-directory child set plus
aggregates maintained on mutation rather than recomputed).

In `apps/server/src/fs/workspace-index.ts`:

**2a.** Add a counts type next to the other module types (near `ScanResult`, around line 87):

```ts
type WorkspaceIndexCounts = {
  entryCount: number
  fileCount: number
  staleEntryCount: number
}
```

**2b.** Add a module-level parent helper next to `indexPathKey` (around line 879):

```ts
// Returns undefined for the workspace root (key ''), which has no parent.
function parentIndexPath(entryPath: string) {
  if (!entryPath) return undefined

  const separatorIndex = entryPath.lastIndexOf('/')
  if (separatorIndex < 0) return ''

  return entryPath.slice(0, separatorIndex)
}
```

**2c.** Add the new fields to the class (`:95-100`):

```ts
export class WorkspaceIndex {
  private childPathsByParent = new Map<string, Set<string>>()
  private entriesByPath = new Map<string, WorkspaceIndexEntry>()
  private fileEntryCount = 0
  private pendingCreatedPaths = new Set<string>()
  private readonly paths: WorkspacePaths
  private rebuildSequence = 0
  private staleEntryCount = 0
  private state: WorkspaceIndexMutableStatus
```

**2d.** Add the private mutation funnel as new private methods on the class (put
them next to `removeEntriesAt`, before `nextRebuildId`):

```ts
  private counts(): WorkspaceIndexCounts {
    return {
      entryCount: this.entriesByPath.size,
      fileCount: this.fileEntryCount,
      staleEntryCount: this.staleEntryCount,
    }
  }

  private applyCountDelta(entry: WorkspaceIndexEntry, delta: number) {
    if (entry.type === 'file') this.fileEntryCount += delta
    if (entry.stale) this.staleEntryCount += delta
  }

  private setEntry(entry: WorkspaceIndexEntry) {
    const previous = this.entriesByPath.get(entry.path)
    if (previous) this.applyCountDelta(previous, -1)
    if (!previous) this.linkChildPath(entry.path)

    this.entriesByPath.set(entry.path, entry)
    this.applyCountDelta(entry, 1)
  }

  private replaceEntries(entries: Map<string, WorkspaceIndexEntry>) {
    this.entriesByPath = entries
    this.childPathsByParent = new Map()
    this.fileEntryCount = 0
    this.staleEntryCount = 0

    for (const entry of entries.values()) {
      this.linkChildPath(entry.path)
      this.applyCountDelta(entry, 1)
    }
  }

  // `.clear()`, not `= new Map()`. The old removeEntriesAt('') cleared in place,
  // and `entryMap()` hands the live map to ContentIndexFilter — swapping the
  // instance here would change what an in-flight search observes.
  private clearEntries() {
    this.entriesByPath.clear()
    this.childPathsByParent.clear()
    this.fileEntryCount = 0
    this.staleEntryCount = 0
  }

  private linkChildPath(entryPath: string) {
    const parent = parentIndexPath(entryPath)
    if (parent === undefined) return

    const siblings = this.childPathsByParent.get(parent)
    if (siblings) {
      siblings.add(entryPath)
      return
    }

    this.childPathsByParent.set(parent, new Set([entryPath]))
  }

  private unlinkChildPath(entryPath: string) {
    const parent = parentIndexPath(entryPath)
    if (parent === undefined) return

    const siblings = this.childPathsByParent.get(parent)
    if (!siblings) return

    siblings.delete(entryPath)
    if (siblings.size > 0) return

    this.childPathsByParent.delete(parent)
  }

  // Materializes the subtree rooted at `normalized` (inclusive) by walking the
  // parent->children links instead of scanning every key in the index.
  private collectSubtreePaths(normalized: string) {
    const collected: string[] = []
    const stack: string[] = [normalized]

    while (stack.length > 0) {
      const current = stack.pop()
      if (current === undefined) continue

      collected.push(current)
      const children = this.childPathsByParent.get(current)
      if (!children) continue

      for (const child of children) stack.push(child)
    }

    return collected
  }

  private deleteEntryPath(entryPath: string) {
    const entry = this.entriesByPath.get(entryPath)
    this.entriesByPath.delete(entryPath)
    // Every descendant of this path is deleted in the same pass, so its whole
    // child set goes with it; only the subtree root needs unlinking from its
    // parent's set.
    this.childPathsByParent.delete(entryPath)
    if (!entry) return

    this.applyCountDelta(entry, -1)
  }
```

Do not wire anything up yet. Nothing calls these methods after this step.

**Do not run `bun run typecheck` here.** `apps/server/tsconfig.json` sets
`noUnusedLocals: true`, so tsgo _will_ report every one of these still-unwired
private methods as "declared but its value is never read". That is expected, not
a failure to fix. The first typecheck gate is step 5.

**Verify**:

```
cd /Users/shaul/Desktop/D/platform && rg -c "private (counts|applyCountDelta|setEntry|replaceEntries|clearEntries|linkChildPath|unlinkChildPath|collectSubtreePaths|deleteEntryPath)\(" apps/server/src/fs/workspace-index.ts
```

→ prints `9`.

```
cd /Users/shaul/Desktop/D/platform && rg -n "^function parentIndexPath\(|^type WorkspaceIndexCounts = \{" apps/server/src/fs/workspace-index.ts
```

→ two matches, one for each.

### Step 3: route every `entriesByPath` mutation through the funnel

Five edits, all inside `workspace-index.ts`:

**3a.** `rebuild()` success path (`:143`): replace `this.entriesByPath = result.entries`
with `this.replaceEntries(result.entries)`.

**3b.** `rebuild()` failure path (`:150`): replace `this.entriesByPath = new Map()`
with `this.clearEntries()`. This one site changes from "swap in a fresh Map" to
"empty the existing Map". That is intentional and benign: the only holder of the
old reference is a `ContentIndexFilter` mid-search, which on an emptied map falls
back to "no exclusions, content search allowed" — the same conservative answer it
gives for an unknown path. Do not add a second clear-variant to preserve the
distinction.

**3c.** `commitScannedEntries` (`:325-327`): replace the insert loop body
`this.entriesByPath.set(entry.path, entry)` with `this.setEntry(entry)`.

**3d.** `removeEntriesAt` (`:333-345`) becomes:

```ts
  private removeEntriesAt(relativePath: string) {
    const normalized = indexPathKey(relativePath)
    if (!normalized) {
      this.clearEntries()
      return
    }

    for (const entryPath of this.collectSubtreePaths(normalized)) {
      this.deleteEntryPath(entryPath)
    }

    this.unlinkChildPath(normalized)
  }
```

**3e.** `markSubtreeStale` (`:214-231`) becomes — note the empty-path case must
keep marking the whole index, which `collectSubtreePaths('')` does because `''`
is the root entry's own key and the root's children hang off it:

```ts
  markSubtreeStale(relativePath: string) {
    if (!canApplyIncrementalUpdates(this.state.readiness)) return

    const changed = this.markSubtreeEntriesStale(indexPathKey(relativePath))
    if (!changed && this.state.readiness === 'stale') return

    this.state = staleLiveStatus(this.state, this.counts())
  }

  private markSubtreeEntriesStale(normalized: string) {
    let changed = false

    for (const entryPath of this.collectSubtreePaths(normalized)) {
      const entry = this.entriesByPath.get(entryPath)
      if (!entry) continue
      if (entry.stale) continue

      this.setEntry({ ...entry, stale: true })
      changed = true
    }

    return changed
  }
```

Note the deliberate use of `setEntry` rather than a direct
`entriesByPath.set(...)` plus a hand-rolled `this.staleEntryCount += 1`.
`setEntry` subtracts the previous entry's contribution and adds the new one, so
it produces exactly `+1` stale and `±0` files, and it is what keeps the review
grep in "Maintenance notes" honest: after this plan, **`entriesByPath.set` /
`.delete` / `.clear` must appear only inside `setEntry`, `deleteEntryPath`,
`replaceEntries` and `clearEntries`.** `collectSubtreePaths` returns a
materialized array, so mutating the map while iterating it is safe.

(`staleLiveStatus` does not accept `WorkspaceIndexCounts` yet — step 5 changes
its signature. Typecheck will fail between steps 3 and 5; that is expected.)

**Verify** (this is a grep gate, not a typecheck gate):

```
cd /Users/shaul/Desktop/D/platform && rg -n "entriesByPath\.(set|delete|clear)|entriesByPath = " apps/server/src/fs/workspace-index.ts
```

→ every remaining hit is inside `setEntry`, `deleteEntryPath`, `replaceEntries`
or `clearEntries`. In particular there must be **no** hit inside `rebuild`,
`commitScannedEntries`, `removeEntriesAt` or `markSubtreeEntriesStale`. If one
survives there, you missed an edit — fix it before step 4.

Then go straight to step 4. Do not try to make the file typecheck in between.

### Step 4: delete `snapshot()` and `entries()`

Both have zero production callers; `applyPendingEvents` (`:532`) discards the
result and `service.ts` never reads it. Confirmed by grep across the whole repo:
the only hits are three lines in the test file, fixed in step 6.

- Delete the `entries()` method (`:111-113`).
- Delete the `snapshot()` method (`:362-367`).
- **Keep `cloneEntry`** (`:1236`). `get()` still calls it (`:123`), and the
  clone-on-`get` contract is what the rewritten test in step 6b covers.
- Replace all 15 occurrences of `return this.snapshot()` with
  `return this.status()`: `:141`, `:146`, `:148`, `:159`, `:162`, `:170`, `:176`,
  `:180`, `:189`, `:201`, `:207`, `:211`, `:244`, `:318`, `:330`. Nothing else
  changes on those lines. Leave every _other_ `return this.<something>(...)`
  alone — `return this.rebuildAndMarkFailed(...)` (`:161`), the three
  `return this.rebuild(...)` (`:164`, `:182`, `:192`),
  `return this.commitScannedEntries(...)` (`:197`) and
  `return this.deleteSubtreeForUpdate(...)` (`:203`) all forward a callee's value
  that is now `WorkspaceIndexStatus` (or a promise of one) for free.
- `rebuildAndMarkFailed` (`:247`) returns `this.markFailed(...)`, which now
  returns `WorkspaceIndexStatus`. No edit needed there either.

After this step every public mutator (`rebuild`, `applyWatchEvents`, `refresh`,
`deleteSubtree`, `markFailed`, `rebuildAndMarkFailed`) returns
`WorkspaceIndexStatus`. That is the new uniform contract.

**Verify** (from the repo root):

```
cd /Users/shaul/Desktop/D/platform && rg -n "snapshot\(\)|this\.entries\(\)" apps/server/src/fs/workspace-index.ts
```

→ no matches. (Still no typecheck here — step 5 is the gate.)

### Step 5: make the status helpers take counts instead of the map

The point of this step is that the helpers become **structurally unable** to
traverse the index — they no longer receive it.

In `workspace-index.ts`:

- `readyStatus(scanRoot, result, startedAt, reason)` → `readyStatus(scanRoot, counts, result, startedAt, reason)`;
  body uses `entryCount: counts.entryCount`, `fileCount: counts.fileCount`,
  `staleEntryCount: counts.staleEntryCount`. Call site (`:145`) becomes
  `readyStatus(this.paths.workspaceRoot, this.counts(), result, startedAt, reason)`
  — and it must be called **after** `this.replaceEntries(result.entries)`.
- `failedLiveStatus(previous, entries, reason, error)` → `(previous, counts, reason, error)`;
  `entryCount: counts.entryCount`, `fileCount: counts.fileCount`,
  `staleEntryCount: counts.staleEntryCount`. Call site (`:243`) passes `this.counts()`.
- `staleLiveStatus(previous, entries, pendingCreatedPaths = new Set())` →
  `(previous, counts, pendingCreatedPaths = new Set())`;
  `staleEntryCount: counts.staleEntryCount`. Call sites: `:230` (step 3e) and `:237`.
- `incrementalStatus(previous, entries, result?)` → `(previous, counts, result?)`;
  `entryCount: counts.entryCount`, `fileCount: counts.fileCount`,
  `staleEntryCount: counts.staleEntryCount`, and
  `readiness: counts.staleEntryCount === 0 ? 'ready' : 'stale'`. Call sites:
  `:210` and `:329`, both pass `this.counts()`.
- Delete the module functions `fileCount` (`:1202-1212`) and `staleEntryCount`
  (`:1214-1224`) — both are now unreferenced. `replaceEntries` computes the same
  totals in one pass.

**All line numbers in this step are pre-step-4 numbers.** Step 4 deleted ~10
lines from the middle of the class, so everything below `entries()` has shifted
up. Locate each call site by **symbol name**, not by line number, and use the
line numbers only as a rough "which half of the file" hint. The same applies to
every `file:line` in steps 6 and 7.

**Verify** (first command from `apps/server`, the greps from the repo root):

```
cd /Users/shaul/Desktop/D/platform/apps/server && bun run typecheck
```

→ exit 0, no output. This is the first typecheck gate in the plan; if it fails,
the errors point at the call sites you have not converted yet.

```
cd /Users/shaul/Desktop/D/platform && rg -n "^function (fileCount|staleEntryCount)\(" apps/server/src/fs/workspace-index.ts
```

→ no matches.

```
cd /Users/shaul/Desktop/D/platform && rg -n "entries: ReadonlyMap" apps/server/src/fs/workspace-index.ts
```

→ exactly one match, the `entries` parameter of `firstMissingAncestorPath`
(currently `:924`), which is a `.has()` lookup, not a fold.

### Step 6: run the existing suite unchanged except for the three dead lines

The test file still calls `entries()`/`snapshot()` on lines 45, 219 and 221, so
it will not typecheck yet. Fix exactly those three call sites now (step 7 adds
the new tests):

**6a.** `tests/workspace-index.test.ts:45` — replace
`entryCount: index.entries().length,` with `entryCount: index.entryMap().size,`.

**6b.** `tests/workspace-index.test.ts:212-230` — the test
`'returns entry snapshots instead of mutable index entries'` asserts clone
semantics for three accessors, two of which no longer exist. Per AGENTS.md
("Delete obsolete tests instead of preserving old behavior") reduce it to the
surviving accessor:

```ts
it('returns cloned entries from get so callers cannot mutate the index', async () => {
  const root = await fixtureRoot()
  await mkdir(path.join(root, 'src'), { recursive: true })
  await writeFile(path.join(root, 'src', 'app.ts'), 'export const app = true\n')

  const index = await buildWorkspaceIndex(createWorkspacePaths(root))
  const entry = requireEntry(index.get('src/app.ts'))

  entry.stale = true

  expect(index.get('src/app.ts')).toMatchObject({ stale: false })
  expect(index.status()).toMatchObject({ staleEntryCount: 0 })
})
```

**Verify**:

```
cd /Users/shaul/Desktop/D/platform/apps/server && bun --bun vitest run src/fs/tests/workspace-index.test.ts
```

→ **28 tests pass, 0 fail.** This is the real correctness gate for steps 2–5: the
file already covers create/change/delete/rename, gitignored subtrees,
default-ignored roots, missing-parent creation, stale marking across a nested
subtree, root gitignore rebuilds, event-limit rebuilds, and watcher failure
paths.

**STOP** if any of these fail after one honest fix attempt — a counter that
drifts or a subtree that is missed is exactly the failure this refactor risks,
and guessing at it is worse than reporting it.

### Step 7: add the counter-drift tests

The counters are new _state_ that can silently disagree with the map. Add these
to `tests/workspace-index.test.ts`, inside the existing `describe('workspace index', ...)`
block, after the `'applies create, change, delete, and rename watch events'`
test (currently ending at line 298).

Import style: this file imports `{ afterEach, describe, expect, it } from 'vitest'`
directly (line 6) because it is an `apps/server` test. **Do not** import from
`apps/web/test/fixtures.ts` — that applies to web app tests only. Match the
existing file.

No new imports are needed. The file already imports everything the tests below
use: `mkdir, mkdtemp, rename, rm, writeFile` from `node:fs/promises` (line 2),
`path` from `node:path` (line 4), and `{ WorkspaceIndex, buildWorkspaceIndex,
watchWorkspaceIndex }` plus `createWorkspacePaths` (lines 8–11). `WorkspaceIndex`
is imported as a value, so using it as the parameter type of `derivedCounts`
typechecks without adding a `import type` line.

First add this helper next to `requireEntry` (near line 678), so every new
assertion compares the reported status against a value recomputed from the live
map:

```ts
function derivedCounts(index: WorkspaceIndex) {
  let fileCount = 0
  let staleEntryCount = 0

  for (const entry of index.entryMap().values()) {
    if (entry.type === 'file') fileCount += 1
    if (entry.stale) staleEntryCount += 1
  }

  return { entryCount: index.entryMap().size, fileCount, staleEntryCount }
}
```

Then the four new tests:

```ts
it('keeps status counts in step with the entry map across watch events', async () => {
  const root = await fixtureRoot()
  await mkdir(path.join(root, 'src'), { recursive: true })
  const index = await buildWorkspaceIndex(createWorkspacePaths(root))
  expect(index.status()).toMatchObject(derivedCounts(index))

  await writeFile(path.join(root, 'src', 'created.ts'), 'export const created = true\n')
  await index.applyWatchEvents([{ type: 'created', path: 'src/created.ts' }])
  expect(index.status()).toMatchObject(derivedCounts(index))

  await writeFile(path.join(root, 'src', 'created.ts'), 'export const changed = true\n')
  await index.applyWatchEvents([{ type: 'changed', path: 'src/created.ts' }])
  expect(index.status()).toMatchObject(derivedCounts(index))

  await rename(path.join(root, 'src', 'created.ts'), path.join(root, 'src', 'renamed.ts'))
  await index.applyWatchEvents([
    { type: 'renamed', oldPath: 'src/created.ts', path: 'src/renamed.ts' },
  ])
  expect(index.status()).toMatchObject(derivedCounts(index))

  await rm(path.join(root, 'src', 'renamed.ts'))
  await index.applyWatchEvents([{ type: 'deleted', path: 'src/renamed.ts' }])
  expect(index.status()).toMatchObject(derivedCounts(index))
  expect(index.get('src/renamed.ts')).toBeUndefined()
})

it('removes a whole subtree and its counts from one delete event', async () => {
  const root = await fixtureRoot()
  await mkdir(path.join(root, 'src', 'nested', 'deep'), { recursive: true })
  await writeFile(path.join(root, 'src', 'a.ts'), 'export const a = true\n')
  await writeFile(path.join(root, 'src', 'nested', 'b.ts'), 'export const b = true\n')
  await writeFile(path.join(root, 'src', 'nested', 'deep', 'c.ts'), 'export const c = true\n')
  await writeFile(path.join(root, 'keep.ts'), 'export const keep = true\n')
  const index = await buildWorkspaceIndex(createWorkspacePaths(root))

  await rm(path.join(root, 'src'), { recursive: true, force: true })
  await index.applyWatchEvents([{ type: 'deleted', path: 'src' }])

  expect(index.get('src')).toBeUndefined()
  expect(index.get('src/a.ts')).toBeUndefined()
  expect(index.get('src/nested/b.ts')).toBeUndefined()
  expect(index.get('src/nested/deep/c.ts')).toBeUndefined()
  expect(index.get('keep.ts')).toMatchObject({ type: 'file' })
  expect(index.status()).toMatchObject(derivedCounts(index))
  expect(index.status().fileCount).toBe(1)
})

it('marks only the target subtree stale and clears the count on refresh', async () => {
  const root = await fixtureRoot()
  await mkdir(path.join(root, 'src', 'nested'), { recursive: true })
  await mkdir(path.join(root, 'other'), { recursive: true })
  await writeFile(path.join(root, 'src', 'nested', 'b.ts'), 'export const b = true\n')
  await writeFile(path.join(root, 'other', 'c.ts'), 'export const c = true\n')
  const index = await buildWorkspaceIndex(createWorkspacePaths(root))

  index.markSubtreeStale('src')
  // src, src/nested, src/nested/b.ts
  expect(index.status().staleEntryCount).toBe(3)
  expect(index.status()).toMatchObject(derivedCounts(index))
  expect(index.get('other/c.ts')).toMatchObject({ stale: false })

  // Marking the same subtree twice must not double-count.
  index.markSubtreeStale('src')
  expect(index.status().staleEntryCount).toBe(3)

  await index.refresh('src')
  expect(index.status()).toMatchObject({ readiness: 'ready', staleEntryCount: 0 })
  expect(index.status()).toMatchObject(derivedCounts(index))
})

// The opposite case: this refactor NARROWS two full-index walks into subtree
// walks. This test proves the whole-index case was not narrowed with them.
// `indexPathKey('.')` is '', the workspace root's own key, and both
// markSubtreeStale('') and removeEntriesAt('') must still reach everything.
it('still marks and clears the whole index from the workspace root key', async () => {
  const root = await fixtureRoot()
  await mkdir(path.join(root, 'src', 'nested'), { recursive: true })
  await writeFile(path.join(root, 'src', 'nested', 'b.ts'), 'export const b = true\n')
  await writeFile(path.join(root, 'keep.ts'), 'export const keep = true\n')
  const index = await buildWorkspaceIndex(createWorkspacePaths(root))
  const totalEntries = index.entryMap().size

  expect(totalEntries).toBeGreaterThan(3)

  index.markSubtreeStale('.')
  expect(index.status()).toMatchObject({
    readiness: 'stale',
    staleEntryCount: totalEntries,
  })
  expect(index.status()).toMatchObject(derivedCounts(index))

  index.deleteSubtree('.')
  expect(index.entryMap().size).toBe(0)
  expect(index.status()).toMatchObject({
    entryCount: 0,
    fileCount: 0,
    staleEntryCount: 0,
  })
  expect(index.status()).toMatchObject(derivedCounts(index))
})
```

**Verify**:

```
cd /Users/shaul/Desktop/D/platform/apps/server && bun --bun vitest run src/fs/tests/workspace-index.test.ts
```

→ **32 tests pass, 0 fail** (28 existing + 4 new; the rewritten `'returns cloned
entries from get...'` test replaces one in place, so it does not add to the
count).

### Step 8 (mandatory): re-measure, then run every gate

Re-run the same benchmark, unchanged, three times:

```
bun /tmp/workspace-index-bench.ts
```

**Verify**: `entryCount` is still `10101` (identical index contents), and the
median `msPerEvent` is **lower** than the median from step 1.

Then pick whichever acceptance form applies — **either** is a pass:

- **Form A (ratio).** After-median ≤ 0.5 × before-median at 10,101 entries. Done;
  report both medians.
- **Form B (flatness).** If the ratio is between 0.5 and 1.0, that is expected on
  a workspace this size: a large fixed cost per event remains (the targeted
  `stat` + 512-byte content sniff, plus the `.gitignore` re-read noted under
  "Maintenance notes"), and this plan does not touch it. Prove the real claim
  instead: raise `DIRS` to `200` (20,100 entries), re-run three times, and report
  the medians at both sizes. **Pass condition: the 20,100-entry median is within
  25% of the 10,101-entry median** — i.e. doubling the index no longer roughly
  doubles per-event cost. Flatness is the actual claim; the ratio is its shadow.

You cannot re-run "before" at 20,100 entries without reverting the change, so do
not try to; report the after-numbers at both sizes.

Then run every gate:

```
cd /Users/shaul/Desktop/D/platform/apps/server
bun run typecheck
bun run lint
bun run format:check
bun run test
```

If `format:check` fails, run `bun run format` and re-check.

Finally delete the scratch benchmark:

```
rm -f /tmp/workspace-index-bench.ts
```

## Test plan

New tests — all in `apps/server/src/fs/tests/workspace-index.test.ts`, all listed
in step 7:

1. `keeps status counts in step with the entry map across watch events` — the
   drift guard. Asserts `status()` equals counts recomputed from `entryMap()`
   after each of create / change / rename / delete. Catches every "forgot to
   adjust a counter" bug in one test.
2. `removes a whole subtree and its counts from one delete event` — proves the
   parent→children walk reaches grandchildren (3 levels) and does not touch a
   sibling subtree, and that the counters follow.
3. `marks only the target subtree stale and clears the count on refresh` — exact
   stale count (3, not "≥ 4" like the existing watcher test), sibling untouched,
   idempotent re-marking does not double-count, and the count returns to 0.
4. `still marks and clears the whole index from the workspace root key` — the
   **negative** of tests 2 and 3. Those two prove the walk got narrower; this one
   proves it did not get narrower where it must not. Both `markSubtreeStale('.')`
   and `deleteSubtree('.')` normalize to the root key `''` and must still reach
   every entry, and `clearEntries` must zero all three counters.

Structural pattern to model on: the existing
`'applies create, change, delete, and rename watch events'` test
(`tests/workspace-index.test.ts:265-298`) — same `fixtureRoot()` setup, same
`buildWorkspaceIndex(createWorkspacePaths(root))`, same real files on disk driven
through `applyWatchEvents`. No mocks: this suite builds real temp workspaces and
drives the real index, which is what the repo requires.

One test is rewritten rather than added:
`'returns entry snapshots instead of mutable index entries'` (`:212-230`) becomes
`'returns cloned entries from get so callers cannot mutate the index'` because
two of the three accessors it covered are deleted.

The rest of the existing 28-test suite is the behaviour-preservation gate and
must pass unchanged. Final count: 32.

## Done criteria

Machine-checkable. ALL must hold:

From `apps/server`:

- [ ] `bun run typecheck` exits 0
- [ ] `bun run lint` exits 0
- [ ] `bun run format:check` exits 0
- [ ] `bun run test` exits 0 (full server suite)
- [ ] `bun --bun vitest run src/fs/tests/workspace-index.test.ts` reports **32** passing tests, 0 failing
- [ ] `bun --bun vitest run src/fs/tests/search.test.ts` exits 0

From the repo root `/Users/shaul/Desktop/D/platform`:

- [ ] `rg -n "snapshot\(\)|this\.entries\(\)" apps/server/src/fs/workspace-index.ts` returns no matches
- [ ] `rg -n "^function (fileCount|staleEntryCount)\(" apps/server/src/fs/workspace-index.ts` returns no matches
- [ ] `rg -n "Array\.from\(this\.entriesByPath" apps/server/src/fs/workspace-index.ts` returns no matches
- [ ] `rg -n "entriesByPath\.(set|delete|clear)|entriesByPath = " apps/server/src/fs/workspace-index.ts` returns hits **only** inside `setEntry`, `deleteEntryPath`, `replaceEntries` and `clearEntries`
- [ ] `git status --porcelain --untracked-files=all apps/server packages` lists exactly two lines, both ` M`: `apps/server/src/fs/workspace-index.ts` and `apps/server/src/fs/tests/workspace-index.test.ts`. Nothing under `packages/`, and no untracked file under `apps/server/`. **Scope the check to those two directories** — see the executor header for why a bare `git status` is noisy here.
- [ ] `test -e /tmp/workspace-index-bench.ts` exits non-zero (the scratch benchmark was deleted in step 8)
- [ ] `git diff -- plans/README.md` shows your 025 status-cell edit and nothing else you authored. That file already had pending edits from someone else before you started — leave those alone; do not revert them and do not "clean up" the table.

Reported, not machine-checked:

- [ ] Benchmark numbers from step 1 and step 8 are reported: before median, after median, and `entryCount` for each run. The claim to substantiate is **flatness**, not a fixed ratio — see step 8 for exactly which of the two acceptance forms applies.

## STOP conditions

**Not** a STOP condition: `bun run typecheck` failing anywhere between step 2 and
step 5. The file is deliberately half-wired there (see the note in "Commands you
will need"). Keep going to step 5.

Stop and report back (do not improvise) if:

- The drift check prints a non-empty diff, or any excerpt in "Current state" does
  not match the live file at the cited line. (Unrelated modified files elsewhere
  in the working tree are expected and are not drift — see the executor header.)
- The existing `workspace-index.test.ts` suite fails after step 6 and one honest
  fix attempt. The two most likely causes, in order:
  1. **`rebuild()` did not rebuild `childPathsByParent`.** A full rescan replaces
     the entry map; if the child index survives from the previous generation,
     subtree deletes silently miss entries and `get()` starts returning ghosts.
     `replaceEntries` must reset **both** maps and **both** counters.
  2. **`setEntry` double-counted an overwrite.** Re-scanning an existing path
     calls `set` on a key that is already present; the previous entry's
     contribution must be subtracted before the new one is added, and
     `linkChildPath` must run only when the key is genuinely new.
- A status count disagrees with `derivedCounts(index)` in any test. That is a
  real counter-drift bug — report the failing scenario, do not "fix" it by
  recomputing the count from the map inside `counts()` (that would silently undo
  the entire plan).
- A test shows an entry **surviving** a subtree delete, or **not** being marked
  stale, that the old code handled. That is the ancestor-chain invariant from
  "Current state" being violated: an entry exists whose parent directory is not
  itself an entry, so the parent→children walk cannot reach it. Report it with
  the exact entry path and its missing ancestor. Do **not** patch it by falling
  back to a full-map prefix scan, and do **not** add a "repair the chain" pass —
  either would put back the O(N) work this plan exists to remove, and the right
  fix (if the invariant really is breakable) is in `refreshScanPath`, which is a
  different change with a different risk profile.
- The step-8 benchmark shows the change made things **slower**, or shows no
  measurable difference at 20,100 entries.
- You conclude the fix requires editing `apps/server/src/fs/search.ts`,
  `service.ts`, or anything under `packages/`. It does not — `entryMap()` is
  unchanged in identity, type and contents.
- `bun --bun vitest run src/fs/tests/search.test.ts` fails. It exercises
  `markCreatedPathPending` (`tests/search.test.ts:745`) through the real index and
  is the canary for status-shape regressions reaching search.

## Maintenance notes

For whoever owns this code next:

- **What a reviewer should scrutinize.** Exactly two things: (1) every write to
  `entriesByPath` goes through `setEntry` / `deleteEntryPath` / `replaceEntries` /
  `clearEntries` — a stray `this.entriesByPath.set(...)` added later reintroduces
  counter drift with no test failure until someone reads `status()`; (2)
  `replaceEntries` resets the child index. A grep worth putting in review:
  `rg -n "entriesByPath\.(set|delete|clear)" apps/server/src/fs/workspace-index.ts`
  should only match inside those four private methods.
- **The invariant is testable in one line.** `derivedCounts(index)` in the test
  file recomputes what the counters claim. Any future test touching the index can
  assert `expect(index.status()).toMatchObject(derivedCounts(index))` for free.
- **`markSubtreeStale` is still called before coalescing.** The watcher calls it
  from `addPendingEvent` (`:481-489`) per distinct `type:path` key, before the
  flush batches events. That is now O(subtree) instead of O(index), which is the
  point — but if the stale-marking is ever moved after coalescing, this plan's
  child index is still the right structure; do not revert it.
- **Deliberately deferred: the per-event `.gitignore` read.** Every targeted scan
  calls `createScanContext` → `workspaceGitIgnoreMatcher(paths)`
  (`workspace-index.ts:568`), which re-reads and re-parses the root `.gitignore`
  from disk. That is one file read per watch event. It is O(1) in index size so
  it was out of scope here, and caching it needs an invalidation story — though
  the hook is already there: a `.gitignore` change forces a full rebuild
  (`shouldRebuildForFilesystemEvent`, `:1034`), so the cache could simply be
  dropped in `rebuild()`. Worth a small follow-up plan; measure first.
- **Deliberately deferred: `deleteSubtree()` has no _production_ caller.** The
  public method at `:200` was called from nowhere in the repo before this plan;
  the new root-key test in step 7 is now its only caller. Deleting dead public
  surface belongs to the unreachable-surface sweep (plan 022), not to a perf
  change — and note that if plan 022 removes it, that test must switch to
  `applyWatchEvents([{ type: 'deleted', path: '.' }])`.
- **If the index ever needs ordered or visible-subtree queries**, stop extending
  the side index and move to the `packages/tree` path-store shape described in
  the "Structural alternative" section above — at that point the flat map is
  losing on reads too, and the trade that justified keeping it no longer holds.
- **`entryMap()` hands out the live map.** `ContentIndexFilter`
  (`search.ts:178`) captures it for the duration of a search, so a concurrent
  `rebuild()` — which swaps in a whole new `Map` — leaves that filter reading the
  previous generation. That is pre-existing behaviour, unchanged by this plan,
  and it is benign (a search sees a consistent older snapshot). Do not "fix" it
  by cloning; that is the allocation this plan just deleted.
