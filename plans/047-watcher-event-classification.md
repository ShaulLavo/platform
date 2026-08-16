# Plan 047: Stop reporting a modified pre-existing file as `created`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat ace313f -- apps/server/src/fs/watch.ts apps/server/src/tests/app.test.ts apps/web/src/lib/workspace-event-model.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED — this moves client-visible event semantics. The fix itself is
  small; deciding _which_ fix, and confirming the client survives it, is the work.
- **Depends on**: none. Independent of every other plan in this set — no plan
  touches `apps/server/src/fs/watch.ts`.
- **Category**: correctness
- **Planned at**: commit `826df96`, 2026-08-16

## Why this matters

The first modification of any file that existed **before the watcher started** is
reported to clients as `created` instead of `changed`. The `changed` event that
tells the client to refresh that file's tree entry never arrives. It self-heals
after one event per path, which is why it survived this long.

There is already a test asserting the correct behavior, and it has been failing:
`apps/server/src/tests/app.test.ts > fs rpc events > reports external file
updates from the native watcher` times out after ~15s waiting for a `changed`
event that never comes. **This plan's real done criterion is that test going
green** — it is a pre-written oracle for exactly this bug.

Two things make this worth a plan rather than a one-line patch:

1. **Two candidate fixes with different long-term costs** (see "The decision").
2. **A second, separate defect sits right next to it** — the parcel→node backend
   fallback is a bare `catch` that logs nothing, which is both how this bug
   reaches production _and_ a violation of the repo's own logging rules. Fixing
   the classifier without fixing the silent fallback leaves the more dangerous
   half in place.

## Current state

All line references are `apps/server/src/fs/watch.ts` unless stated otherwise.

### The classifier (the bug)

`:202-213`:

```ts
  private async nativeEventType(
    relativePath: string,
    nativeEvent: string,
  ): Promise<'created' | 'changed' | 'deleted'> {
    if (nativeEvent === 'change') return 'changed'

    const exists = await pathExists(this.paths, relativePath)
    if (!exists) return 'deleted'
    if (this.knownNativePaths.has(relativePath)) return 'changed'

    return 'created'
  }
```

When Node's raw `fs.watch` event is `rename` — which is what macOS reports for
the temp-file-plus-rename atomic save most editors perform — this falls through
to `created` for any path not already in the set.

### The set is never seeded

`knownNativePaths` has **exactly four references in the entire file**. Confirm:

```bash
grep -n "knownNativePaths" apps/server/src/fs/watch.ts
```

→ expect exactly these four:

```
41:  private readonly knownNativePaths = new Set<string>()      declared
210:    if (this.knownNativePaths.has(relativePath)) return 'changed'   read
217:      this.knownNativePaths.delete(relativePath)              removed on delete
221:    this.knownNativePaths.add(relativePath)                   added on emit
```

`:215-222`:

```ts
  private recordNativeEventPath(relativePath: string, type: 'created' | 'changed' | 'deleted') {
    if (type === 'deleted') {
      this.knownNativePaths.delete(relativePath)
      return
    }

    this.knownNativePaths.add(relativePath)
  }
```

The only writer is `recordNativeEventPath`, called from `handleNodeEvent` — i.e.
**the set is populated only by events the watcher itself already emitted.**
Nothing seeds it when the watcher attaches, so at watch time it is empty even
though the files are all there.

### Observed behavior

Probing the live `/fs/events` stream on a file that existed before the watcher
started:

```
801ms:  write 'after'               → created   ← wrong, the file already existed
2802ms: write 'much-longer-content' → changed   ← right, path is now in the set
```

### Which backend is affected — read this before estimating blast radius

**The parcel backend is correct and is NOT part of this bug.** `:327-332`:

```ts
function parcelEventType(type: ParcelWatchEvent['type']): 'created' | 'changed' | 'deleted' {
  if (type === 'create') return 'created'
  if (type === 'update') return 'changed'

  return 'deleted'
}
```

It maps parcel's own `create`/`update`/`delete` directly. No `knownNativePaths`,
no inference. `handleParcelEvent` (`:170-184`) never calls
`recordNativeEventPath`.

So only the **node** backend misclassifies. Production defaults to `'auto'`
(`:50`, `options.backend ?? 'auto'`), which prefers parcel. **But the node path
is still reachable in production**, via `:124-132`:

```ts
  private async createWatcher(relativeRoot: string): Promise<WatchRelease> {
    if (this.backend === 'node') return this.createNodeWatcher(relativeRoot)

    try {
      return await this.createParcelWatcher(relativeRoot)
    } catch {
      return this.createNodeWatcher(relativeRoot)
    }
  }
```

**That bare `catch` is the second defect.** If `parcelWatcher.subscribe` throws —
a plausible scenario, since `@parcel/watcher` is a native module and the server
build marks it `--external @parcel/watcher` (see `apps/server/package.json`
`build` script) — the app silently downgrades to the buggy backend and **logs
nothing**. The user gets wrong event semantics with no signal anywhere.

`AGENTS.md` is explicit and this violates it:

> - Logging is wide-event style (evlog). Always prefer wide logs: enrich the one
>   event per operation/request with more fields instead of emitting extra narrow
>   log lines.
> - If the logs do not explain the failure, that is itself the bug to fix first:
>   add the missing log events or fields, then debug with the better logs. Do not
>   debug blind.

### The client-side consequence

`apps/web/src/lib/workspace-event-model.ts:112-114`:

```ts
function changedTreeEntries(events: readonly WorkspaceFilesystemEvent[]) {
  return events.flatMap((event) => (event.type === 'changed' && event.entry ? [event.entry] : []))
}
```

**Only `changed` events feed `patch-changed-tree-entries`.** A `created` event
does not. So a misclassified modification leaves the file's tree entry stale —
its size and mtime in the file tree keep showing the pre-edit values until some
later event corrects them.

Also relevant, same file:

- `:319` — `if (event.type !== 'created' && event.type !== 'changed') continue`
  in `recreatedOpenFilePaths`; treats both alike, so no divergence there.
- `:249` — `if (event.type === 'changed') continue` in the open-file path.

**Step 1 requires you to audit these three sites before changing anything**,
because a client that currently compensates for the wrong classification could
break when it is corrected.

### The failing test — your oracle

`apps/server/src/tests/app.test.ts:519-541`:

```ts
  it('reports external file updates from the native watcher', async () => {
    const root = await fixtureRoot()
    // Seed before the watcher exists, the way the deletion test does. Creating
    // and then updating a file through a live watcher puts both writes in one
    // inotify batch, which coalesces them into the single `created` event — so
    // the update this test is about would never arrive on its own.
    await writeFile(path.join(root, 'external-update.txt'), 'before')

    const app = testApp(root)
    ...
    await writeFile(path.join(root, 'external-update.txt'), 'after')
    const event = await nextMatchingEvent(
      events,
      (candidate) => candidate.type === 'changed' && candidate.path === 'external-update.txt',
    )
```

Note `testApp` (`:998-1013`) passes `watchBackend: options.watchBackend ?? 'node'`
— the test deliberately exercises the node backend, which is why it catches this.
Its own comment shows the author already understood the seeding subtlety. The
test is well-built; do not modify it.

### Conventions that apply

From `AGENTS.md`:

> - Never throw `new Error`. Create errors with `createError` from `evlog` — in
>   practice through the feature's `structured-errors.ts` wrapper.
> - Use guard clauses and early returns. Keep the happy path shallow.
> - Drive the real in-process Elysia server. Build real state.
> - Do not `mock.module` or `vi.mock` our server, client, or feature modules.
> - Calibrate the instrument before trusting its readings. Before debugging
>   "X isn't happening", first confirm X would be observable if it did happen.

## The decision — Step 0 asks the operator, do not pick unilaterally

### Option A — seed `knownNativePaths` when the watcher attaches _(smaller)_

Walk the directory once in `createNodeWatcher` and add every existing path to the
set before the watcher goes live.

- **For**: smallest diff; keeps the existing design; the test flips green.
- **Against**: preserves a classifier whose correctness depends on a Set staying
  in sync with the filesystem — the same assumption class that produced this bug.
  It also adds a full directory walk to every node-backend watcher attach, and
  the set grows unbounded with the tree.
- **Race to handle**: a file created between the scan and the watcher going live
  would be misclassified as `changed`. Attach the watcher _first_, then scan, and
  make the seed non-destructive (never overwrite a path the watcher already
  recorded).

### Option B — classify from the filesystem, not from watcher memory _(more robust)_

Drop the set. On a `rename` event where the path exists, decide `created` vs
`changed` from stat data — `birthtime` vs `mtime`, or comparing against the entry
the hub already fetches at `:198` / `nativeEventEntry` (`:443`).

- **For**: removes the mutable state that can be wrong; no unbounded set; no
  attach-time walk; correct for files that appear while the watcher is live.
- **Against**: larger change; `birthtime` reliability varies by filesystem (it is
  good on APFS/macOS, less so on some Linux filesystems); needs its own tests.
- **Note**: `nativeEventEntry` already stats the path for the emitted entry, so
  the data may be available without an extra syscall — check before assuming a
  cost.

**Recommendation: Option B**, on the grounds that AGENTS.md's optimization
guidance applies to correctness too — "question the expensive work's right to
exist… can the computation be done once instead of cached". The set is a cache of
something the filesystem already knows. But this is genuinely the operator's
call, and Option A is a defensible smaller step.

**Option C — do nothing to the classifier and only fix the silent fallback** is
_not_ acceptable: the test stays red and the bug stays shipped.

## Commands you will need

| Purpose           | Command                                                                                                                   | Expected on success                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| The oracle test   | `cd apps/server && bun --bun vitest run src/tests/app.test.ts -t "reports external file updates from the native watcher"` | passes (currently fails, ~15s timeout) |
| All watcher tests | `cd apps/server && bun --bun vitest run src/fs`                                                                           | all pass                               |
| Full server suite | `cd apps/server && bun run test`                                                                                          | **773/773** — see baseline note        |
| Server typecheck  | `cd apps/server && bun run typecheck`                                                                                     | exit 0                                 |
| Server lint       | `cd apps/server && bun run lint`                                                                                          | exit 0                                 |
| Web tests         | `cd apps/web && bun run test`                                                                                             | all pass                               |
| Dev server        | **already running** — do not start one                                                                                    | `http://localhost:5173`                |

**Baseline:** at `826df96` the server suite is **772 passed / 1 failed (773)**,
and the single failure is the oracle test this plan fixes. When you are done it
must be **773/773**. That makes this the one plan in the set whose success is
visible as a change in the suite's own headline number.

Do **not** run `bun run verify` as a gate — it runs the whole monorepo and is
slower than you need; the scoped commands above are the real signal.

## Scope

**In scope**:

- `apps/server/src/fs/watch.ts` — the classifier and the fallback logging
- New tests in `apps/server/src/fs/tests/`
- `apps/web/src/lib/workspace-event-model.ts` — **only** if Step 1's audit proves
  the client compensates for the current wrong behavior

**Out of scope** (do NOT touch):

- `apps/server/src/tests/app.test.ts` — **the oracle. Do not modify it.** If it
  still fails after your fix, the fix is wrong. Changing the test to match your
  implementation defeats the entire purpose of this plan.
- `handleParcelEvent` (`:170-184`) and `parcelEventType` (`:327-332`) — the
  parcel path is correct. Read them as the reference for what right looks like.
- The `renamed` event path (`broadcastRenamed` `:264`, `renamedCreateEvent`
  `:351`, `renamedDeleteEvent` `:363`) — a different mechanism with its own
  semantics.
- `isStaleParcelRootCreate` (`:334`) — an existing, deliberate parcel-specific
  guard.
- Switching the default backend away from `'auto'`, or removing the node backend.
  The fallback must keep working; it just has to be honest and correct.
- `entryFromStat` / `pathBasename` (`:454`, `:467`) — plan 044 owns those (they
  are duplicated with `fs/service.ts`). Do not deduplicate them here.
- Any performance work in this file.

## Git workflow

Per the operator rule in `plans/README.md`: **all work happens on `main`** — no
new branches, worktrees, or PRs unless the operator explicitly asks.

Conventional commits. Suggested subjects:

```
fix(fs): a modified file stops arriving as a creation
fix(fs): the watcher says so when it falls back to the node backend
```

Commit the classifier fix and the fallback-logging fix **separately** — they are
independent defects and separately revertable.

## Steps

### Step 0: Get the decision

Present Option A and Option B to the operator with the trade-offs above and get
an explicit choice. **Do not pick for them.** This changes client-visible event
semantics, which is a product decision.

If you are running unattended and no answer is available, **stop here and
report**. Do not default to one.

**Verify**: you have an explicit A or B before writing any code.

### Step 1: Audit the client before changing the server

Read all three divergence sites in
`apps/web/src/lib/workspace-event-model.ts` — `:113`, `:249`, `:319` — and
determine, in writing, what changes for the client when a modification starts
arriving as `changed` instead of `created`.

The expected answer: it strictly improves — `changedTreeEntries` (`:113`) starts
patching the tree entry it currently skips, so a stale size/mtime gets corrected.
Nothing should _depend_ on the wrong classification.

Also check `apps/web/src/hooks/use-workspace-events.ts` and
`apps/web/src/hooks/workspace-event-conflict-adapter.ts` for a `created` branch
that would now stop firing for these paths.

**If you find client code that only works because modifications currently arrive
as `created`, STOP and report it.** That inverts the plan: the client would need
fixing first, in its own plan.

**Verify**: a written statement of the client-side delta, and no compensating
logic found. Record it in your final report.

### Step 2: Reproduce the bug and confirm your instrument

```bash
cd apps/server && bun --bun vitest run src/tests/app.test.ts -t "reports external file updates from the native watcher"
```

**Verify**: it fails with a ~15s timeout. This is your before-state. Per
AGENTS.md's debugging rule, confirm the failure mode is what this plan claims —
a timeout waiting for `changed`, not an assertion mismatch on some other field.

### Step 3: Fix the classifier (per the Step 0 decision)

Implement Option A or Option B in `nativeEventType` (and, for A,
`createNodeWatcher`).

For **Option A**, the ordering constraint is load-bearing: attach the watcher
first, then seed, and never let the seed overwrite a path the watcher already
recorded — otherwise a file created during the scan window is misclassified.

For **Option B**, remove `knownNativePaths` entirely along with
`recordNativeEventPath` and its two call sites in `handleNodeEvent` (`:198`,
`:191`). Leaving a now-unused private Set behind is exactly the dead state this
repo's greenfield rule tells you to delete.

**Verify**:

```bash
cd apps/server && bun --bun vitest run src/tests/app.test.ts -t "reports external file updates from the native watcher"
```

→ **passes**. Then:

```bash
cd apps/server && bun --bun vitest run src/fs
```

→ all pass. And for Option B:

```bash
grep -c "knownNativePaths" apps/server/src/fs/watch.ts
```

→ `0`.

### Step 4: Make the backend fallback honest

Replace the bare `catch` at `:128-130` so a parcel subscribe failure is
observable. Per AGENTS.md this is a wide-event enrichment, not a new narrow log
line: emit one `warn` carrying the watched root, the backend actually selected,
and the error — enough that "why are my file events wrong?" is answerable from
`logs/` alone.

Do **not** change the fallback behavior itself. Falling back to the node backend
is correct; doing it silently is not.

Do **not** use `new Error` — AGENTS.md forbids it. Use the feature's structured
error/logging path; find it with:

```bash
grep -rn "createStructuredError\|defineErrorCatalog\|logger\." apps/server/src/fs/ | head
```

**Verify**: `cd apps/server && bun run typecheck && bun run lint` → exit 0, and
the new log event appears in a test that forces a parcel failure (see test plan)
or, failing that, is confirmed by reading.

### Step 5: Full gate

```bash
cd apps/server && bun run lint && bun run typecheck && bun run test
cd apps/web && bun run test
```

**Verify**: server suite is **773 passed / 0 failed** — the headline number
changes from 772/773. Web suite unchanged from its baseline.

### Step 6: Update the README baseline note

`plans/README.md` carries a 🔴 block saying the one failing server test is
catching a real bug and the honest baseline is 772/773. **Once this plan lands
that note is wrong.** Replace it with a one-line record that F-WATCH was fixed by
plan 047 and the baseline is 773/773, and change F-WATCH's entry in the
"investigated and CONFIRMED" section to say it is resolved.

**Verify**: `grep -n "772 passed" plans/README.md` → no matches.

## Test plan

New tests in `apps/server/src/fs/tests/` (a new `watch-classification.test.ts` is
appropriate; check whether an existing watcher test file is the better home
first). Drive the real server per AGENTS.md; do not mock.

1. **The core regression** — a file written before the watcher attaches, then
   modified, emits `changed` (not `created`). This duplicates the oracle at a
   lower level, which is worth it: the oracle is an SSE integration test and this
   one isolates the classifier.
2. **A genuinely new file still emits `created`.** The failure mode of both
   fixes is over-correcting so that everything becomes `changed`. This is the
   test that catches it and it is the most important one here.
3. **A deleted file still emits `deleted`**, and a path deleted then recreated
   emits `created` again — the `recordNativeEventPath` delete branch (`:217`)
   exists for this; make sure whichever fix you chose preserves it.
4. **Second modification still emits `changed`** — guards the self-healing path
   that already worked.
5. **Option A only**: a file created _during_ the seeding window is classified
   `created`, not `changed`. This is the race Step 3 warns about.
6. **Option B only**: a file whose `birthtime` is unavailable or equal to
   `mtime` still classifies sensibly — name the fallback behavior and assert it.
7. **Step 4**: a parcel subscribe failure produces the warn event and still
   yields a working watcher. If forcing a parcel failure needs an injection seam
   the code does not have, say so rather than adding a mock — AGENTS.md permits
   injectable factories, not `mock.module`.

Model on the existing watcher tests: find them with
`ls apps/server/src/fs/tests/`.

Verification: `cd apps/server && bun run test` → 773 passed, plus your new tests.

## Done criteria

ALL must hold:

- [ ] `cd apps/server && bun --bun vitest run src/tests/app.test.ts -t "reports external file updates from the native watcher"` → **passes**
- [ ] `cd apps/server && bun run test` → **773 passed, 0 failed** (was 772/1)
- [ ] `apps/server/src/tests/app.test.ts` is **unmodified** (`git diff --name-only` must not list it)
- [ ] Option B only: `grep -c "knownNativePaths" apps/server/src/fs/watch.ts` → `0`
- [ ] The parcel fallback at `:128` emits an observable log event; no bare `catch` remains there
- [ ] `grep -n "new Error" apps/server/src/fs/watch.ts` → no matches
- [ ] New tests exist covering: pre-existing-file modification → `changed`, genuinely-new file → `created`, delete → `deleted`, recreate → `created`
- [ ] `cd apps/server && bun run typecheck && bun run lint` → exit 0
- [ ] `cd apps/web && bun run test` → unchanged from baseline
- [ ] Step 1's client audit is written down in your report
- [ ] `plans/README.md`: the 🔴 772/773 block is replaced and F-WATCH marked resolved
- [ ] `git diff --name-only` lists only `apps/server/src/fs/watch.ts`, the new test file, and `plans/README.md` (plus `workspace-event-model.ts` only if Step 1 justified it)

## STOP conditions

Stop and report back (do not improvise) if:

- **Step 0 has no operator answer.** Do not default to A or B.
- **Step 1 finds client code that depends on modifications arriving as `created`.**
  That inverts this plan's order and needs its own plan first.
- **The oracle test still fails after your fix.** Do not modify the test. A
  passing implementation and a failing oracle means the implementation is wrong;
  a modified oracle means the bug ships forever.
- **The oracle passes but test 2 fails** (a genuinely new file now reports
  `changed`). You have over-corrected — the classifier now says `changed` for
  everything and the test suite would have let it through if you had skipped
  test 2.
- **Any other server test starts failing.** The suite is 772/773 today with one
  known failure; any _second_ failing test name is yours.
- **Option A's directory walk is prohibitively slow** on a large workspace root.
  Report it — that is the argument for Option B and the operator should hear it.
- **`birthtime` proves unreliable** on the target filesystem under Option B.
  Report rather than silently falling back to the Set.
- **You cannot force a parcel failure** for test 7 without mocking our own
  modules. Skip that test, say so, and confirm Step 4 by reading instead.

## Maintenance notes

- **The durable lesson**: `knownNativePaths` was a cache of something the
  filesystem already knew, seeded from a source (the watcher's own emissions)
  that could never contain the startup state. If Option A was chosen, that shape
  survives — a reviewer should watch for any future code that assumes the set is
  complete.
- The parcel path is the reference implementation. Any future watcher work should
  ask "how does `handleParcelEvent` do this?" first.
- **A reviewer should check one thing above all**: that
  `apps/server/src/tests/app.test.ts` is untouched. That test failing was how
  this bug was found; a diff that makes it pass by editing it is the single worst
  possible outcome of this plan.
- **Deliberately deferred**: `entryFromStat` and `pathBasename` in this file are
  character-identical duplicates of versions in `fs/service.ts`. Plan 044 owns
  that; do not fix it here even though you will be reading right past it.
- **Deliberately deferred**: this plan does not add a test proving the _parcel_
  backend classifies correctly. It does today, but nothing pins it. Worth a
  follow-up, and cheap once test 1–4's harness exists.
- Once this lands, `bun run test` in `apps/server` is a clean 773/773 and every
  other plan's "all pass" done criterion becomes literally true again — which
  removes a standing footnote from the whole plan set.
