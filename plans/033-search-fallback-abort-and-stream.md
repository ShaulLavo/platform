# Plan 033: Thread the AbortSignal through the search fallback and make it stream

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first, from the repository root — the pathspecs below are
> repo-root-relative and will match nothing from a subdirectory)**:
> `git diff --stat ace313f..HEAD -- apps/server/src/fs/search-fallback.ts apps/server/src/fs/search.ts apps/server/src/fs/search-shared.ts apps/server/src/fs/search-measurement.ts apps/server/src/fs/tests/`
> If any of those files changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: correctness
- **Planned at**: commit `ace313f`, 2026-08-16

## Why this matters

Workspace search normally shells out to `fd` and `rg`. When neither is on
`PATH` — a fresh clone, a packaged desktop build, any machine that has not
installed them — search silently switches to a pure-Node fallback walker. That
walker has two defects at once. It is **batch behind a streaming signature**:
it `await`s a full recursive walk into a `matches[]` array and only then starts
yielding, so a streaming API delivers nothing until the walk finishes. And it
**never observes the abort** that the HTTP route already wires up, so a query
the user has already abandoned keeps stat-ing and reading files.

The two defects share one root cause and one fix: the walk is an `await`, not a
`yield`. A generator suspended inside an `await` cannot be unwound — calling
`.return()` on it (which is exactly what the SSE layer does when the client
disconnects) queues the return until the generator next reaches a `yield`, and
that never happens until the whole tree is walked. Turning the walk into a real
`async function*` makes cancellation work through the existing unwind path, and
an explicit `signal.aborted` check makes it prompt.

**Honest bound on the impact** (the original audit overstated this): the walk
_does_ stop early once it has collected `options.limit` matches, so a query that
matches a lot of files is already bounded. The unbounded case is a query that
matches **few or no** files — which is precisely the mid-typing prefix the user
is about to replace with the next keystroke, and therefore precisely the query
that gets cancelled. Several keystrokes stack several full-tree walks.

This closes an instance of theme **T5 — Holes in the verification baseline**
from `plans/README.md`: CI installs `fd` and `rg` on purpose
(`.github/actions/setup/action.yml`) so that the search tests assert against
the real providers, which means this entire provider has **zero** test
coverage and has never executed in CI. Secondarily it is a **T6** instance —
the gate (`canUseSearchTools`) is correct, the thing behind it is not.

## Current state

### Files involved

- `apps/server/src/fs/search-fallback.ts` — the whole fallback walker, 236
  lines. `searchWithFallback` is its **only** export and `apps/server/src/fs/search.ts`
  is its **only** importer. Verified from the repository root with
  `grep -rn "search-fallback" apps/server/src packages/*/src`, which returns
  exactly one line:
  `apps/server/src/fs/search.ts:17:import { searchWithFallback } from './search-fallback'`.
  (Do **not** widen that grep to `apps packages` — it walks `apps/web/dist/`
  and dumps hundreds of KB of unrelated bundled JS.)
- `apps/server/src/fs/search.ts` — provider dispatch. Chooses index / fd / rg /
  fallback, owns `createFindContext`, and enforces `options.limit` +
  `truncated` on the consumer side.
- `apps/server/src/fs/search-shared.ts` — `FindContext`, `FindOptions`,
  `FindMatch`, `safeEntryStats`, and the small pure helpers both the tool path
  and the fallback share.
- `apps/server/src/fs/search-measurement.ts` — `SearchMeasurementRecorder`.
  Every `safeEntryStats` call goes through `measureStat`, so
  `measurement.snapshot().statCallCount` is an exact count of how many entries
  a walk touched. **This is the observable the new tests assert on.**
- `apps/server/src/fs/tests/search.test.ts` — the existing 1,300-line search
  suite. Model the new test file's structure on it.

### The dispatch that drops the signal — `apps/server/src/fs/search.ts:330-349`

```ts
if (!(await canUseTools({ content: searchContent, names: needsFd }))) {
  // TODO: remove this fallback after fd/rg installation or tool discovery is guaranteed.
  recordRequestContext({ search: { provider: 'fallback' } })
  yield * measureProvider(context, 'fallback', searchWithFallback(context))
  return
}

recordRequestContext({ search: { provider: searchProviderLabel(pathIndexProvider, needsFd) } })
if (pathIndexProvider) {
  yield * measureProvider(context, 'index', pathIndexProvider.searchNames(context))
} else if (searchNames) {
  yield * measureProvider(context, 'fd', searchNamesWithFd(paths, context, signal, runtime))
}
if (!searchContent) return

yield *
  measureProvider(context, 'rg', searchContentWithRg(paths, context, signal, contentIndexFilter))
```

`signal` is in scope on line 333. The `fd` branch (`:341`) and the `rg` branch
(`:345-349`) both receive it; the fallback branch does not.

### The batch walk — `apps/server/src/fs/search-fallback.ts:30-67`

```ts
export async function* searchWithFallback(context: FindContext) {
  const matches: FindMatch[] = []
  await searchDirectory(
    context.root.absolutePath,
    context.root.relativePath,
    context,
    context.options,
    matches,
    1,
  )

  for (const match of matches) yield match
}

async function searchDirectory(
  absoluteDirectory: string,
  relativeDirectory: string,
  context: FindContext,
  options: FindOptions,
  matches: FindMatch[],
  depth: number,
) {
  if (matches.length >= options.limit) return

  const dirents = await readdir(absoluteDirectory, { withFileTypes: true })
  for (const dirent of sortedDirents(dirents)) {
    if (matches.length >= options.limit) return
    await searchEntry(
      absoluteDirectory,
      relativeDirectory,
      dirent.name,
      context,
      options,
      matches,
      depth,
    )
  }
}
```

Note three things: the single `await` that swallows the whole walk; the
`options` parameter that is always `context.options` (a hand-carried duplicate
of a field the `context` already has); and that the only stopping condition
anywhere in the file is `matches.length >= options.limit`. `grep -n "signal"
apps/server/src/fs/search-fallback.ts` returns **nothing**.

### The consumer that already enforces the limit — `apps/server/src/fs/search.ts:250-274`

```ts
  const context = await createFindContext(paths, options)
  const matches = searchWithTools(paths, context, signal, runtime, providerOptions)
  const state: SearchState = { count: 0, truncated: false }

  for await (const match of matches) {
    if (state.count >= options.limit) {
      state.truncated = true
      break
    }

    state.count += 1
    yield { type: 'match', match }
  }

  const measurement = context.measurement.snapshot()
  recordRequestContext({ search: { measurement } })

  yield {
    count: state.count,
    measurement,
    path: context.root.relativePath,
    query: context.query,
    truncated: state.truncated,
    type: 'done',
  }
```

**This is why the rewrite can drop every internal limit check.** The consumer
already stops at `options.limit`; breaking out of a `for await` calls
`.return()` on the generator, which unwinds the whole `yield*` recursion chain
and runs every `finally`.

### The signal really is wired up, all the way to the door the fallback ignores

- `apps/server/src/fs/routes.ts:40` —
  `toErrorYieldingSse(fs.searchEvents(query, request.signal), { ... })`
- `apps/server/src/fs/service.ts:330-346` — `searchEvents(options, signal)`
  forwards `signal` into `findInWorkspaceStream`.
- `apps/server/src/sse.ts:35-37` — `toSse` ends with
  `finally { await iterator.return?.() }`, the unwind path a streaming
  generator can respond to and a batch one cannot.
- `apps/web/src/features/search/use-run-search-buffer.ts:30` and `:59` — the
  client makes a fresh `AbortController` per query and its effect cleanup calls
  `controller.abort()`, i.e. on every query change.

### `FindContext` — `apps/server/src/fs/search-shared.ts:21-32`

```ts
export type FindContext = {
  root: {
    absolutePath: string
    relativePath: string
  }
  query: string
  matcher: WorkspaceSearchMatcher
  measurement: SearchMeasurementRecorder
  options: FindOptions
  gitIgnore: GitIgnoreMatcher
  statCache: SearchStatCache
}
```

No `signal` field — **and this plan deliberately does not add one.** The two
sibling providers already take the signal as an explicit parameter
(`searchNamesWithFd(paths, context, signal, runtime)`,
`searchContentWithRg(paths, context, signal, contentIndexFilter)`). Putting it
on the context would create a second place the same value lives, which the
fd/rg paths would then ignore — the exact "parallel hand-maintained
representation" pattern this repo's audit calls its dominant defect. One
representation: the parameter. (The original finding sketched the context-field
approach; this plan overrides it, on purpose.)

### Why this path is reachable — `apps/server/src/fs/search-tool-runner.ts:18-23`

```ts
export async function canUseSearchTools(requirements: SearchToolRequirements) {
  if (requirements.names && !(await commandExists('fd'))) return false
  if (!requirements.content) return true

  return commandExists('rg')
}
```

`commandExists` spawns `<command> --version` and caches the result per process.
Nothing in this repo installs `fd`/`rg` for a developer or ships them in the
desktop build. CI installs them explicitly, in
`.github/actions/setup/action.yml`, under a step named `Install search tools`
whose own comment says search _"silently degrades to a different provider when
either is missing — so without these the search tests do not fail loudly, they
assert against the fallback's results."_

### Repo conventions that apply here

Quoted verbatim from `AGENTS.md`, which you have not read:

- _"Keep nesting depth to 3 or less."_ / _"Use guard clauses and early returns.
  Keep the happy path shallow."_ / _"In loops, use inverted conditions with
  `continue` instead of wrapping the body in `if`."_ / _"Do not use `else` after
  an early return."_
- _"Remove duplicate code aggressively."_
- _"This project is greenfield and not live… No backward compatibility shims,
  no legacy aliases, no deprecation windows. Update every call site in the same
  pass."_
- _"Never throw `new Error`. Create errors with `createError` from `evlog`…"_
  — you will not need to create any error in this plan. Do not add one.
- _"Logging is wide-event style (evlog). Always prefer wide logs: enrich the one
  event per operation/request with more fields instead of emitting extra narrow
  log lines."_ — do not add log calls in this plan. The existing
  `recordRequestWarning` in `reportSearchContentError` stays exactly as it is.
- _"Treat readonly/mutable mismatches as contract bugs first… Do not copy
  containers just to satisfy TypeScript."_
- _"Apps run under Bun: `bun --bun vitest`."_ / _"`node` — pure logic and
  in-process server tests."_
- _"Do not redefine per-file factories."_ — but note the practical shape of
  `apps/server`: there is **no** shared test harness there. Every server test
  file rolls its own `mkdtemp` fixture root (`search.test.ts`, `watch.test.ts`,
  `terminal/tests/service.test.ts`, …). Follow that.

**Import `{ describe, it, expect, afterEach }` from `'vitest'` directly.** The
`apps/web/test/fixtures.ts` rule in `AGENTS.md` is for `apps/web` only;
`apps/server/src/fs/tests/search.test.ts:5` imports from `'vitest'`.

## Commands you will need

Run all of these from `/Users/shaul/Desktop/D/platform/apps/server` **unless a
step says otherwise**. Every `bun run …` and `vitest` command below is
cwd-sensitive; the `grep` and `git` verifications in the Steps section name
their own cwd explicitly, so read them before pasting.

| Purpose                | Command                                                                                                           | Expected on success                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Typecheck              | `bun run typecheck`                                                                                               | exit 0, no output                                                                                |
| Lint                   | `bun run lint`                                                                                                    | exit 0, **no output at all** (oxlint prints nothing when clean — do not wait for a summary line) |
| Format (write, scoped) | `node_modules/.bin/oxfmt --write src/fs/search-fallback.ts src/fs/search.ts src/fs/tests/search-fallback.test.ts` | exit 0, `All matched files use the correct format.`                                              |
| Format check           | `bun run format:check`                                                                                            | exit 0, `All matched files use the correct format.`                                              |
| New tests only         | `bun --bun vitest run src/fs/tests/search-fallback.test.ts`                                                       | `Tests 5 passed`                                                                                 |
| Whole search suite     | `bun --bun vitest run src/fs/tests/search.test.ts`                                                                | all pass, 0 failed                                                                               |
| Whole server suite     | `bun run test`                                                                                                    | all pass                                                                                         |

`typecheck`, `lint` and `format:check` were confirmed green at `ace313f`
before this plan was written; `bun run test` (the whole server suite — it
spawns git, PTYs and LSP servers) was **not** pre-verified. Establish its
baseline yourself before editing anything, and see the STOP conditions if it
is already red.

Use the **scoped** `oxfmt --write` command above rather than
`bun run format`; the workspace-wide script rewrites every file it finds and
you must not touch files outside the scope list.

Root-level `bun run verify` also exists (`typecheck && lint && format:check &&
test`) but it builds the sibling editor packages and runs every workspace. It
is not required by this plan — the `apps/server` commands are the gate.

## Scope

**In scope** (the only files you may modify):

- `apps/server/src/fs/search-fallback.ts` — full rewrite of the walker.
- `apps/server/src/fs/search.ts` — exactly two one-line edits (export
  `createFindContext`; pass `signal` to `searchWithFallback`).
- `apps/server/src/fs/tests/search-fallback.test.ts` — **create**.
- `plans/README.md` — status row for plan 033 only.

**Out of scope** (do NOT touch, even though they look related):

- `apps/server/src/fs/search-shared.ts` — do not add a `signal` field to
  `FindContext`; see the reasoning above. Nothing else in it needs to change.
- The `fd` and `rg` branches in `search.ts` — `searchNamesWithFd`
  (`search.ts:465`) and `searchContentWithRg` (`search.ts:662`). Their
  cancellation already works and is covered by the existing suite. Changing
  them puts a working path at risk for zero gain.
- All of `apps/server/src/fs/search-tool-runner.ts` — the gate
  (`canUseSearchTools`, `:18`) is correct and the process plumbing that
  actually honors the signal (`runToolLines` `:25`, `attachAbort` `:100`)
  already works. Only the code _behind_ the gate is broken.
- The `if (signal?.aborted) return` at `search.ts:248` and the `done` event that
  `searchWorkspaceWithDiskTools` emits after an abort. The `fd` path already
  emits `done` after an aborted run; making the fallback behave differently
  would introduce an inconsistency, not remove one.
- `apps/server/src/sse.ts` — the unwind path is already correct; it is the
  fallback that could not respond to it.
- The `// TODO: remove this fallback…` comment at `search.ts:331`. Leave it
  byte-for-byte. See "Fix or delete?" below for why it stays.
- `apps/web/src/features/search/**` — no client change. The wire format and the
  event order are unchanged.
- `apps/server/scripts/workspace-search-benchmark.ts` — it cannot select the
  fallback provider, so it cannot measure this change.
- Deleting the `--sort path` rg flag, the content-index exclude globs, or
  anything else in `rgArgs`. Separate plans.
- `apps/server/src/fs/tests/search.test.ts` — **do not edit a single line of
  it**, and in particular do not "adjust" `reports truncation when the limit is
reached` (`search.test.ts:596-613`). See "One intentional behavior change"
  below: that test currently passes on this machine via the `fd` provider and
  must keep passing untouched. Editing it would hide the only regression signal
  you have on Steps 1–2.
- `findInWorkspace` (`search.ts:205-228`) — it deliberately passes `undefined`
  for `signal` because it is the non-streaming, collect-everything entry point.
  Threading a signal into it is a different change with different callers.
- `apps/server/src/fs/search-line-decoder.ts` — do not add a signal parameter to
  `streamLines`. The `signal?.aborted` check in the `for await` body of
  `fileContentMatches` already bounds a single file, and `stream.destroy()` in
  the `finally` already releases the fd.
- `apps/server/src/fs/service.ts` and `apps/server/src/fs/routes.ts` — the
  signal already arrives correctly at `findInWorkspaceStream`; nothing upstream
  of `search.ts` needs to change.
- `plans/README.md` beyond the single `Status` cell on row `033`. Do not
  reword the row's title, priority, effort, or the theme sections above the
  tables.

### Fix or delete? — recommendation: **fix**

`search.ts:331` carries `// TODO: remove this fallback after fd/rg installation
or tool discovery is guaranteed.` That precondition is **not met and nothing in
the repo is working toward it**: no postinstall installs `fd`/`rg`, the desktop
build bundles neither, and the only place installation is guaranteed is the CI
setup action. Deleting the fallback today would make workspace search return
zero results, with no error and no explanation, on every machine that has not
installed two Rust CLIs — and would additionally require designing what the UI
shows instead. That is a larger, riskier change than making 200 lines of
already-written code stream and cancel. Fix it, keep the TODO, and revisit
deletion only if the repo ever gains a real provisioning step.

## Git workflow

- **All work happens on `main`** — no new branches, worktrees, commits, pushes,
  or PRs unless the operator explicitly asks.
- If (and only if) the operator asks for a commit: conventional commits,
  lowercase descriptive subject. Real examples from `git log`:
  `refactor(orchestration): the server prepares a session's worktree (M-C)`,
  `fix(address): bound the URL, and stop escaping slashes in ?tabs=`.
  A fitting subject here: `fix(fs/search): the fallback walker streams and honors the abort signal`.

## Steps

### Step 1: Export `createFindContext` from `search.ts`

The new test needs to build a real `FindContext`. Building one by hand in the
test would duplicate `createFindContext`'s seven fields — a second
hand-maintained copy of the same truth, which is the thing this repo's audit is
trying to stamp out. Export the real one instead.

At `apps/server/src/fs/search.ts:277`, change:

```ts
async function createFindContext(
```

to:

```ts
export async function createFindContext(
```

Change nothing else about the function.

**Verify** (from `apps/server`):
`grep -n "export async function createFindContext" src/fs/search.ts`
→ prints exactly one line, `277:export async function createFindContext(`.

### Step 2: Pass the signal into the fallback

At `apps/server/src/fs/search.ts:333`, change:

```ts
yield * measureProvider(context, 'fallback', searchWithFallback(context))
```

to:

```ts
yield * measureProvider(context, 'fallback', searchWithFallback(context, signal))
```

This will not typecheck until Step 3 lands. That is expected; do Step 3 next
and typecheck after it.

**Verify** (from `apps/server`):
`grep -n "searchWithFallback(context, signal)" src/fs/search.ts`
→ exactly one line, starting `333:`.

### Step 3: Rewrite `search-fallback.ts` as a streaming, cancellable walker

Replace the **entire contents** of `apps/server/src/fs/search-fallback.ts` with
exactly this:

```ts
import { createReadStream } from 'node:fs'
import { readdir } from 'node:fs/promises'
import path from 'node:path'

import {
  isDirectoryEntry,
  isFileEntry,
  matchesEntryType,
  type WorkspaceSearchMatcher,
} from '@workspace/contracts'

import { SEARCH_LINE_BUFFER_BYTES, streamLines } from './search-line-decoder'
import {
  contentMatch,
  globMatchPath,
  isIgnoredSearchPath,
  joinRelative,
  nameSearchMatches,
  safeEntryStats,
  searchMatchMetadata,
  shouldSearchNames,
  type FindContext,
  type FindMatch,
} from './search-shared'
import type { FsEntryStats } from './stat'
import { recordRequestWarning } from '../observability'

// The walker yields as it goes rather than collecting into an array: the caller
// enforces `options.limit` and stops pulling, and an abandoned query aborts
// mid-walk. A generator parked in an `await` can do neither — `.return()` on it
// only lands at the next `yield`.
export async function* searchWithFallback(
  context: FindContext,
  signal?: AbortSignal,
): AsyncGenerator<FindMatch> {
  yield* searchDirectory(context.root.absolutePath, context.root.relativePath, context, signal, 1)
}

async function* searchDirectory(
  absoluteDirectory: string,
  relativeDirectory: string,
  context: FindContext,
  signal: AbortSignal | undefined,
  depth: number,
): AsyncGenerator<FindMatch> {
  if (signal?.aborted) return

  const dirents = await readdir(absoluteDirectory, { withFileTypes: true })
  for (const dirent of sortedDirents(dirents)) {
    if (signal?.aborted) return

    yield* searchEntry(absoluteDirectory, relativeDirectory, dirent.name, context, signal, depth)
  }
}

function sortedDirents<T extends { name: string }>(dirents: T[]) {
  return dirents.sort((left, right) => left.name.localeCompare(right.name))
}

async function* searchEntry(
  absoluteDirectory: string,
  relativeDirectory: string,
  name: string,
  context: FindContext,
  signal: AbortSignal | undefined,
  depth: number,
): AsyncGenerator<FindMatch> {
  const relativePath = joinRelative(relativeDirectory, name)
  if (isIgnoredSearchPath(context, relativePath)) return

  const absolutePath = path.join(absoluteDirectory, name)
  const entryStats = await safeEntryStats(
    absolutePath,
    context.measurement,
    relativePath,
    context.statCache,
  )
  if (!entryStats) return

  if (shouldSearchNames(context.options)) {
    const match = nameMatch(relativePath, name, entryStats, context)
    if (match) yield match
  }

  if (isDirectoryEntry(entryStats)) {
    if (!canSearchChildren(depth, context.options.maxDepth)) return

    yield* searchDirectory(absolutePath, relativePath, context, signal, depth + 1)
    return
  }

  if (!canSearchFileContent(relativePath, entryStats, context)) return

  yield* fileContentMatches(absolutePath, relativePath, entryStats, context, signal)
}

function canSearchChildren(depth: number, maxDepth?: number) {
  if (maxDepth === undefined) return true

  return depth < maxDepth
}

function canSearchFileContent(
  relativePath: string,
  entryStats: FsEntryStats,
  context: FindContext,
) {
  const options = context.options
  if (!matchesEntryType(entryStats, options.entryType)) return false
  if (!context.matcher.pathMatches(globMatchPath(context, relativePath))) return false
  if (!options.includeContent) return false
  if (!isFileEntry(entryStats)) return false
  if (entryStats.targetStats.size > options.maxContentBytes) return false

  return true
}

function nameMatch(
  relativePath: string,
  name: string,
  entry: FsEntryStats,
  context: FindContext,
): FindMatch | null {
  if (!matchesEntryType(entry, context.options.entryType)) return null
  if (!context.matcher.pathMatches(globMatchPath(context, relativePath))) return null
  if (!nameSearchMatches(context, relativePath, name)) return null

  return {
    ...searchMatchMetadata(entry),
    kind: 'name',
    path: relativePath,
    source: 'disk',
    targetType: entry.targetType,
    type: entry.type,
  }
}

async function* fileContentMatches(
  absolutePath: string,
  relativePath: string,
  entry: FsEntryStats,
  context: FindContext,
  signal: AbortSignal | undefined,
): AsyncGenerator<FindMatch> {
  const stream = createReadStream(absolutePath, {
    highWaterMark: SEARCH_LINE_BUFFER_BYTES,
  })
  let bytesRead = 0
  let lineIndex = 0

  try {
    for await (const line of streamLines(stream, SEARCH_LINE_BUFFER_BYTES)) {
      bytesRead += line.byteLength + line.terminatorLength
      if (bytesRead > context.options.maxContentBytes) break
      if (signal?.aborted) break

      yield* contentLineMatches(relativePath, entry, line.text, lineIndex, context.matcher)
      lineIndex += 1
    }
  } catch (error) {
    reportSearchContentError(relativePath, error)
  } finally {
    stream.destroy()
  }
}

function reportSearchContentError(relativePath: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  recordRequestWarning('search fallback skipped file', {
    area: 'search',
    message,
    operation: 'fallback_content',
    path: relativePath,
  })
}

function* contentLineMatches(
  relativePath: string,
  entry: FsEntryStats,
  line: string,
  index: number,
  matcher: WorkspaceSearchMatcher,
): Generator<FindMatch> {
  for (const match of matcher.lineMatches(line)) {
    yield contentMatch({
      columnIndex: match.start,
      endColumnIndex: match.end,
      entry,
      line,
      lineNumber: index + 1,
      relativePath,
    })
  }
}
```

Things to notice, so you do not "fix" them back:

- The `EntryTypeFilter` and `FindOptions` type imports are **gone on purpose** —
  `nameMatch` and `canSearchFileContent` now read `context.options` instead of
  taking a duplicate `options` parameter. Leaving the imports in would fail
  lint.
- `searchChildDirectory` is gone; its two-line guard is inlined into
  `searchEntry`.
- Every `matches.length >= limit` check is gone. The consumer at
  `search.ts:254-262` enforces the limit. Do not reintroduce a limit parameter.
- `yield` inside the `try` of `fileContentMatches` is intentional and correct: a
  consumer `.return()` is a _return completion_, so it runs the `finally`
  (`stream.destroy()`) without entering the `catch`. Before this change the
  read stream was only ever destroyed after the file was read to the end.
- The `signal?.aborted` check inside the line loop means a single enormous file
  cannot outlive a cancelled query.

**Verify** (all from `apps/server`):

1. `bun run typecheck` → exit 0, no output.
2. `bun run lint` → exit 0, no output.
3. `grep -c "matches.length" src/fs/search-fallback.ts` → `0`.
4. `grep -c "signal?.aborted" src/fs/search-fallback.ts` → `3`
   (two guards in `searchDirectory`, one in `fileContentMatches`).
5. `bun --bun vitest run src/fs/tests/search.test.ts` → all pass, 0 failed.
   (On this machine `fd` and `rg` are installed at `/opt/homebrew/bin`, so this
   suite exercises the fd/rg providers, not the code you just changed. It is a
   regression gate on Steps 1–2, not a test of Step 3.)

### Step 4: Write the fallback test file

Create `apps/server/src/fs/tests/search-fallback.test.ts` with exactly this
content:

```ts
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createWorkspacePaths } from '../path'
import { createFindContext } from '../search'
import { searchWithFallback } from '../search-fallback'
import type { FindMatch, FindOptions } from '../search-shared'

// `fd`/`rg` decide which provider `findInWorkspaceStream` picks, and CI installs
// both — so the fallback is only reachable here by calling it directly.
// `measurement.snapshot().statCallCount` counts every entry the walk touched,
// which is what makes "it stopped early" an assertion instead of a stopwatch.

const DIRECTORY_COUNT = 40
const FILES_PER_DIRECTORY = 10
const TOTAL_FILES = DIRECTORY_COUNT * FILES_PER_DIRECTORY

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('workspace search fallback', () => {
  it('yields the first match before it has walked the whole tree', async () => {
    const context = await createFindContext(
      createWorkspacePaths(await wideFixtureRoot()),
      nameSearchOptions(),
    )

    const iterator = searchWithFallback(context)[Symbol.asyncIterator]()
    const first = await iterator.next()
    const statCallCount = context.measurement.snapshot().statCallCount
    await iterator.return?.()

    expect(first.done).toBe(false)
    expect(statCallCount).toBeLessThan(20)
  })

  it('stops walking when the signal aborts mid-walk', async () => {
    const context = await createFindContext(
      createWorkspacePaths(await wideFixtureRoot()),
      nameSearchOptions(),
    )
    const controller = new AbortController()
    const matches: FindMatch[] = []

    for await (const match of searchWithFallback(context, controller.signal)) {
      matches.push(match)
      if (matches.length === FILES_PER_DIRECTORY) controller.abort()
    }

    expect(matches.length).toBeLessThan(TOTAL_FILES / 2)
    expect(context.measurement.snapshot().statCallCount).toBeLessThan(TOTAL_FILES / 2)
  })

  it('walks the whole tree and returns every match when nothing cancels', async () => {
    const context = await createFindContext(
      createWorkspacePaths(await wideFixtureRoot()),
      nameSearchOptions(),
    )

    const matches = await collect(searchWithFallback(context))

    expect(matches).toHaveLength(TOTAL_FILES)
    expect(context.measurement.snapshot().statCallCount).toBeGreaterThan(TOTAL_FILES)
  })

  it('returns name and content matches in directory-walk order', async () => {
    const root = await fixtureRoot()
    await mkdir(path.join(root, 'sub'), { recursive: true })
    await writeFile(path.join(root, 'alpha-needle.txt'), 'first line\n')
    await writeFile(path.join(root, 'beta.txt'), 'needle here\n')
    await writeFile(path.join(root, 'sub', 'gamma.txt'), 'a needle\nand needle again\n')
    const context = await createFindContext(createWorkspacePaths(root), {
      includeContent: true,
      limit: 100,
      maxContentBytes: 1_000_000,
      path: '',
      query: 'needle',
    })

    const matches = await collect(searchWithFallback(context))

    expect(matches.map((match) => `${match.kind}:${match.path}:${match.line ?? 0}`)).toEqual([
      'name:alpha-needle.txt:0',
      'content:beta.txt:1',
      'content:sub/gamma.txt:1',
      'content:sub/gamma.txt:2',
    ])
  })

  it('keeps yielding past options.limit and leaves truncation to the consumer', async () => {
    const context = await createFindContext(createWorkspacePaths(await wideFixtureRoot()), {
      ...nameSearchOptions(),
      limit: 5,
    })

    const matches = await collect(searchWithFallback(context))

    expect(matches).toHaveLength(TOTAL_FILES)
  })
})

function nameSearchOptions(): FindOptions {
  return {
    includeContent: false,
    limit: 100_000,
    maxContentBytes: 1_000_000,
    path: '',
    query: 'file',
  }
}

async function wideFixtureRoot() {
  const root = await fixtureRoot()

  for (let directory = 0; directory < DIRECTORY_COUNT; directory += 1) {
    const directoryPath = path.join(root, `dir-${String(directory).padStart(3, '0')}`)
    await mkdir(directoryPath, { recursive: true })
    await Promise.all(
      Array.from({ length: FILES_PER_DIRECTORY }, (_, file) =>
        writeFile(path.join(directoryPath, `file-${String(file).padStart(2, '0')}.txt`), ''),
      ),
    )
  }

  return root
}

async function fixtureRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'platform-search-fallback-'))
  roots.push(root)
  return root
}

async function collect<T>(events: AsyncIterable<T>) {
  const result: T[] = []
  for await (const event of events) result.push(event)

  return result
}
```

Why each assertion is the number it is — do not loosen these without
understanding them:

- **Test 1.** `createFindContext` stats the root (1). The walk then stats
  `dir-000` (2) and `file-00.txt` (3), which is the first name match. So the
  real value is 3; `< 20` leaves room for filesystem ordering quirks. Against
  the _old_ batch implementation this value would be 441 — the assertion fails
  loudly on unfixed code, which is what makes it a real test.
- **Test 2.** After 10 matches the abort fires while the walk is still inside
  `dir-000`; the next `signal?.aborted` guard unwinds. Real values: ~10 matches,
  ~12 stats. Against the old implementation: 400 matches and 441 stats, because
  the array was already fully built before the first `yield` and `controller.abort()`
  had nothing to act on.
- **Test 3** is the control (`AGENTS.md`: _"Verify the expected observable on a
  known-good case as a control."_) — it proves the fixture really does contain
  400 findable matches, so tests 1 and 2 are measuring early exit and not an
  empty walk. 441 > 400, hence `toBeGreaterThan(TOTAL_FILES)`.
- **Test 4** pins result-set equality and DFS ordering across the rewrite:
  `readdir` sorted gives `alpha-needle.txt`, `beta.txt`, `sub`; only
  `alpha-needle.txt` matches by name; `beta.txt` and both lines of
  `sub/gamma.txt` match by content. Name matches carry no `line`, hence the
  `?? 0`.
- **Test 5** is the only CI-runnable proof of the behavior change described in
  "One intentional behavior change to expect". The walker must now ignore
  `options.limit` entirely so the consumer can see the `limit + 1`-th match and
  set `truncated: true`. Against the old implementation this yields 5, not 400.
  `createWorkspaceSearchMatcher` does not read `limit` (verified —
  `packages/contracts/src/workspace-search-match.ts:15-27` takes only
  `caseSensitive`, `excludeGlobs`, `includeGlobs`, `matchMode`, `query`,
  `wholeWord`), so lowering `limit` changes nothing except the walk bound.

**Verify** (from `apps/server`):
`bun --bun vitest run src/fs/tests/search-fallback.test.ts` →
`Test Files 1 passed`, `Tests 5 passed`.

### Step 5: Full-suite gate and formatting

From `apps/server`, in this order (format first — `format:check` will fail on
hand-typed code otherwise, and `oxfmt --write` fixing it is expected, not a
sign you copied the code wrong):

```sh
node_modules/.bin/oxfmt --write src/fs/search-fallback.ts src/fs/search.ts src/fs/tests/search-fallback.test.ts
bun run format:check
bun run lint
bun run typecheck
bun run test
```

**Verify**: the first four commands exit 0. `bun run test` reports 0 failed —
or, if you recorded a red baseline outside `src/fs/` in the STOP-conditions
check, exactly the same failures as that baseline and no new ones.

Then confirm you touched nothing else. **From the repository root** (`git
status` prints paths relative to the cwd, so running this from `apps/server`
gives different strings than the ones below):

```sh
git status --short -- apps/server plans
```

**Verify**: exactly three lines, in any order —

```
 M apps/server/src/fs/search-fallback.ts
 M apps/server/src/fs/search.ts
?? apps/server/src/fs/tests/search-fallback.test.ts
```

(`M plans/README.md` joins them after Step 6.) The pathspec deliberately
excludes the rest of the tree: this working copy was **already dirty** before
you started, with pre-existing modifications under `apps/web/`, `packages/`,
`docs/`, `scripts/`, `bun.lock`, and the root `package.json`, plus an untracked
`plans/009-*.md`. Do not revert, stash, commit, or otherwise touch any of them —
they are not yours. If `git status --short -- apps/server plans` shows a
**fourth** line, you edited something out of scope; that is a STOP condition.

### Step 6: Update the plan index

In `plans/README.md`, under the heading `### Phase 3 — Structural
(characterization tests required first)`, change the `Status` cell of the row
whose Plan column is `033` from `TODO` to `DONE`. That is the **last** cell on
the line; leave the `Depends on` cell (`**must write test**`) alone.

**Verify** (from the repository root): `grep -n "| 033 |" plans/README.md` →
one line, ending `| DONE |`.

## Test plan

- **New file**: `apps/server/src/fs/tests/search-fallback.test.ts`, 5 tests,
  written out verbatim in Step 4 — tests 1 and 2 pin the two defects being
  fixed (streaming, cancellation), tests 3 and 4 are the negative controls that
  prove the walk still finds everything and in the same order, and test 5 pins
  the one intentional behavior change. Do not add, rename, or reorder them.
- **Structural model**: `apps/server/src/fs/tests/search.test.ts` — same
  `roots: string[]` + `afterEach` cleanup, same `mkdtemp` fixture helper, same
  local `collect` helper, same plain `vitest` imports.
- **Why direct-call tests rather than driving `findInWorkspaceStream`**: the
  provider is chosen by `canUseSearchTools`, which probes `PATH` and caches the
  answer for the life of the process. Forcing the fallback end-to-end would
  mean mutating `process.env.PATH` inside a test file, which poisons that
  module's cache for every later test in the file and every other `spawn` it
  makes. Rejected as flaky. The direct call is deterministic and exercises the
  real `createFindContext`, the real gitignore matcher, and the real matcher.
- **No new client or route tests.** The wire format, event order, and `done`
  payload shape are unchanged for every machine that has `fd`/`rg` — which is
  every machine in CI.
- **No UI verification.** The dev server at `http://localhost:5173` cannot
  reach this code path: `fd` and `rg` are installed at `/opt/homebrew/bin`, so
  the app always picks the index/fd/rg providers. Do not spend time clicking
  through the search panel; it proves nothing about this change.

**Verification**: `bun --bun vitest run src/fs/tests/search-fallback.test.ts`
→ `Tests 5 passed`; `bun run test` → 0 failed.

## One intentional behavior change to expect

`truncated` on the `done` event becomes **accurate** for the fallback provider.

Today the fallback collects _at most_ `options.limit` matches, so
`searchWorkspaceWithDiskTools` never sees a `limit + 1`-th match and reports
`truncated: false` even when more matches exist. After the rewrite the walker
keeps yielding until the consumer stops, so the consumer sees the extra match
and sets `truncated: true` — exactly what the `fd` path already does (it
deliberately pulls `context.options.limit + 1`, `search.ts:499-507`).

This is a fix, not a regression. It also means the existing test
`reports truncation when the limit is reached` (`search.test.ts:596-613`, which
asserts `{ count: 1, truncated: true }`) will now pass on a machine without
`fd`/`rg`, where today it would fail. Do not "restore" the old behavior.

Because that existing test cannot reach the fallback in CI, **Test 5 in Step 4
is what actually gates this change** — it asserts the walker yields all 400
matches with `limit: 5`. If you find yourself reintroducing any limit check to
make something pass, Test 5 is the thing that will (correctly) fail.

## Done criteria

Machine-checkable. ALL must hold. The first ten run from `apps/server`; the
last two run from the repository root:

- [ ] `bun run typecheck` exits 0, no output
- [ ] `bun run lint` exits 0, no output
- [ ] `bun run format:check` exits 0
- [ ] `bun --bun vitest run src/fs/tests/search-fallback.test.ts` → `Tests 5 passed`
- [ ] `bun --bun vitest run src/fs/tests/search.test.ts` → 0 failed
- [ ] `bun run test` → no test that was passing at your recorded baseline is
      now failing (0 failed overall if the baseline was green)
- [ ] `grep -c "matches.length" src/fs/search-fallback.ts` → `0`
- [ ] `grep -n "searchWithFallback(context, signal)" src/fs/search.ts` → one hit at line 333
- [ ] `grep -n "export async function createFindContext" src/fs/search.ts` → one hit
- [ ] `grep -c "signal" src/fs/search-shared.ts` → `0` (no signal field was added to `FindContext`)
- [ ] `git status --short -- apps/server plans` → exactly the three lines from
      Step 5 plus ` M plans/README.md`, and nothing else. (The working copy was
      already dirty elsewhere before you started — that is expected, see Step 5.)
- [ ] `grep -n "| 033 |" plans/README.md` → one line ending `| DONE |`

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows `search-fallback.ts` or `search.ts` changed since
  `ace313f`, and the excerpts in "Current state" no longer match the live code.
- `bun --bun vitest run src/fs/tests/search.test.ts` fails **before** you make
  any edit. That means the baseline is already broken and nothing you do here
  can be attributed correctly. Report the failing test names.
- `bun run test` is already red before you edit anything, in a file outside
  `src/fs/`. That suite spawns git, PTYs and LSP servers and was not
  pre-verified for this plan. Record the failing file and test names as your
  baseline, proceed with Steps 1–6, and in your final report state that those
  same tests were red before and after — do **not** try to fix them, and do not
  treat the `bun run test` → 0 failed done-criterion as blocking on them.
- Test 1, 2 or 5 passes against the _unmodified_ `search-fallback.ts`. That
  would mean `statCallCount` is not measuring what this plan claims, and every
  assertion in Step 4 is meaningless. This check is **optional diagnostics, not
  a required step** — do not spend more than one attempt on it. If you do try
  it, note that with Step 2 applied and Step 3 reverted `bun run typecheck`
  fails (the call site passes an argument the old signature does not declare);
  `vitest` does not typecheck, so the tests still run. Report and stop rather
  than trying to reconcile that state.
- The existing test `reports truncation when the limit is reached`
  (`apps/server/src/fs/tests/search.test.ts:596-613`) starts failing. It runs
  against the `fd` provider on this machine and this plan does not touch that
  path, so a failure means Step 1 or Step 2 broke something. Report it — do
  **not** edit `search.test.ts` to make it pass.
- Test 3 finds fewer than `TOTAL_FILES` matches. The fixture is not producing
  400 name matches, so tests 1 and 2 are measuring an empty walk. Do not lower
  the expectation to match the observed number — report it.
- `bun run typecheck` reports errors in files you did not edit. Something
  outside this plan's scope is broken; report rather than fixing it here.
- You find yourself wanting to add a `signal` field to `FindContext`, a `limit`
  parameter back into `search-fallback.ts`, or a `try/catch` around `readdir`.
  All three are explicitly out of scope; report why you think you need one.
- Any test starts failing intermittently. Tests 1, 2, 3 and 5 each build a
  fresh 40-directory / 400-file temp tree; if that is slow enough to flake on
  your machine, report it rather than raising `testTimeout` (the server project
  already runs at 30s, set in `apps/server/vitest.config.ts`).

## Maintenance notes

For whoever owns this code next:

- **What a reviewer should scrutinize.** (a) That `fileContentMatches` still
  destroys the read stream on every exit path — the `finally` is the only thing
  standing between a cancelled query and a leaked fd, and it now fires on paths
  it never used to. (b) That no internal `limit` check crept back in; the limit
  lives in exactly one place, `search.ts:254-262`, and a second copy would
  silently make `truncated` wrong again. (c) That `FindContext` still has no
  `signal` field.
- **What will interact with this later.** If a fifth provider is ever added,
  it should take `signal` as a parameter like the other four rather than
  reaching into the context. If `createFindContext` grows a required argument,
  the new test file is a caller and will need updating. If someone adds
  concurrency to the walk (e.g. stat-ing a directory's children in parallel),
  the `signal?.aborted` guards move from "checked between entries" to "checked
  between batches" and the bound in Test 2 must be re-derived.
- **`createFindContext` is now exported for a test.** `knip` is not part of
  `bun run verify`, but `bun run unused:exports` may list it if the test file is
  ever deleted. Delete the export at the same time, not the export alone.
- **Deliberately deferred.** (1) Deleting the fallback entirely — see "Fix or
  delete?"; the TODO at `search.ts:331` stays until something in the repo
  actually guarantees `fd`/`rg`. (2) An end-to-end test that forces the fallback
  through the HTTP route; it needs an injectable seam in `canUseSearchTools`
  (its `commandAvailability` map is module-private and process-cached), which is
  a bigger design change than this fix warrants. (3) Making the fallback rank
  fuzzy name matches the way the fd path does with `createNameCandidateRanker` —
  the fallback returns matches in directory order, which is a real quality gap
  but a separate, behavior-changing piece of work.
