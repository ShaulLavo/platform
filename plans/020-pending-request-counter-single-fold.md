# Plan 020: One gated, indexed fold for the pending-request counters

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
>
> ```
> git diff --stat ace313f..HEAD -- apps/server/src/orchestration/pending-requests.ts apps/server/src/orchestration/projection-pipeline.ts apps/server/src/orchestration/projector.ts apps/server/src/orchestration/command-invariants.ts apps/server/src/db/schema.ts apps/server/src/db/migrations.ts apps/server/src/db/tests/migrations.test.ts apps/server/src/orchestration/tests/pending-request-counters.test.ts apps/server/src/orchestration/tests/thread-lifecycle.test.ts
> ```
>
> Expected: no output (nothing changed since this plan was written). Also run
> `git status --porcelain -- apps/server` — expected: no output, since the
> committed diff above cannot see uncommitted work. If any in-scope file changed
> either way, compare the "Current state" excerpts against the live code before
> proceeding; on a mismatch, treat it as a STOP condition. Unrelated uncommitted
> changes elsewhere in the tree (e.g. under `apps/web`) are fine — leave them
> alone.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `ace313f`, 2026-08-16

Closes one instance of cross-cutting theme **T6 — "right gate, wrong data
structure behind it"** from `plans/README.md`: a correct predicate guards an
operation that then does full-collection work anyway.

## Why this matters

The "how many approval / user-input requests is this thread blocked on" counter
is computed by folding a thread's activity history. That one counter is folded
in **three** places, and all three fold more than they need to:

1. The SQL projection selects **every** activity row for the thread — no kind
   filter, no limit — and `JSON.parse`s every payload, although the fold only
   ever reacts to six kinds. Tool-call payloads carry diffs and command output,
   so on a long thread this parses megabytes synchronously on Bun's main thread,
   inside a write transaction, on every approval open/close. There is no
   retention prune on that table, so the cost grows with thread age.
2. The in-memory projector reruns the same fold on **every**
   `thread.activity-appended` event — including the streaming storm of tool and
   thinking activities — while the SQL twin directly above it gates the
   identical fold behind `isPendingRequestActivityKind` with a comment saying
   exactly why.
3. The settle/snooze guard `hasOpenBlockingRequest` folds a third time, even
   though the thread object it is handed already carries the counters the fold
   would produce.

After this plan there is one fold, it reads only the six kinds it cares about,
it is served by an index, and the two consumers that already have the answer
read the answer instead of recomputing it.

**Honest sizing** — do not overclaim this in a commit message. The in-memory
`{...thread}` spread is _shallow_: ~30 fields, array references, no rows copied.
And `upsertActivity` already runs an ungated `findLastIndex` over the same ≤500
element array on every activity event, so gating the in-memory fold (item 2)
removes a constant factor, not a complexity class. The real, unbounded win is
item 1: the SQL read plus `JSON.parse`.

## Current state

Files and their role:

- `apps/server/src/orchestration/pending-requests.ts` — the shared fold
  (`pendingRequestCounts`) plus the `isPendingRequestActivityKind` predicate.
  The six kinds it reacts to are spelled out in two `if`-chains here.
- `apps/server/src/orchestration/projection-pipeline.ts` — the SQL projection.
  `requestActivities` (the unfiltered read) and `refreshPendingRequestCounts`
  live here, next to the already-filtered `planActivities`.
- `apps/server/src/orchestration/projector.ts` — the in-memory twin of that
  projection, used by the decider and the reactors.
- `apps/server/src/orchestration/command-invariants.ts` — `hasOpenBlockingRequest`,
  the settle/snooze guard.
- `apps/server/src/db/schema.ts` — drizzle table definitions and indexes.
- `apps/server/src/db/migrations.ts` — the forward-only migration ledger.

### The six kinds, `pending-requests.ts:78-92` (verbatim)

```ts
function openedRequestKind(kind: string): RequestKind | null {
  if (kind === 'approval.requested') return 'approval'
  if (kind === 'user-input.requested') return 'user-input'

  return null
}

function isBlockingRequestCloseKind(kind: string) {
  return (
    kind === 'approval.resolved' ||
    kind === 'user-input.resolved' ||
    kind === 'provider.approval.respond.failed' ||
    kind === 'provider.user-input.respond.failed'
  )
}
```

and `pending-requests.ts:47-49`:

```ts
export function isPendingRequestActivityKind(kind: string) {
  return openedRequestKind(kind) !== null || isBlockingRequestCloseKind(kind)
}
```

`foldActivity` (`pending-requests.ts:64-76`) only ever mutates its map when
`openedRequestKind(kind)` is non-null or `isBlockingRequestClosed(kind, payload)`
is true, and the latter returns `false` for any kind outside the four close
kinds. **Every other activity row is a no-op for the fold.** That is what makes
the SQL filter in Step 2 result-identical rather than merely "close enough".

### The unfiltered read, `projection-pipeline.ts:796-812` (verbatim)

```ts
  private requestActivities(threadId: string) {
    const rows = this.database
      .select({
        kind: projectionThreadActivities.kind,
        payloadJson: projectionThreadActivities.payloadJson,
      })
      .from(projectionThreadActivities)
      .where(eq(projectionThreadActivities.threadId, threadId))
      .orderBy(
        asc(projectionThreadActivities.sequence),
        asc(projectionThreadActivities.createdAt),
        asc(projectionThreadActivities.activityId),
      )
      .all()

    return rows.map((row) => ({ kind: row.kind, payload: parseActivityPayload(row.payloadJson) }))
  }
```

The comment on the sibling query, `projection-pipeline.ts:761-765`, already
names the asymmetry:

```ts
  /**
   * Filtered by kind in SQL rather than folded over the whole history: unlike
   * the request counters, plan snapshots are a handful of rows in a thread that
   * can hold thousands.
   */
  private planActivities(threadId: string) {
```

`planActivities` carries `eq(projectionThreadActivities.kind, PLAN_PROGRESS_ACTIVITY_KIND)`
inside its `and(...)`. `requestActivities` is the one that does not. `inArray` is
**already imported** at `projection-pipeline.ts:1` — you do not need a new import
for it.

### The ungated in-memory fold, `projector.ts:77-93` (verbatim)

```ts
    case 'thread.activity-appended':
      updateThread(model, event.payload.threadId, (thread) => {
        upsertActivity(thread.activities, event)
        // The counters are a fold over the retained activities, recomputed
        // rather than incremented: a replayed batch or a reverted turn can
        // never leave them drifted from the request state they describe.
        const counts = pendingRequestCounts(thread.activities)

        return {
          ...thread,
          latestTurn: latestTurnAfterActivity(thread.latestTurn, event),
          pendingApprovalCount: counts.approvals,
          pendingUserInputCount: counts.userInputs,
          updatedAt: event.payload.activity.createdAt,
        }
      })
      return
```

The SQL twin's gate, `projection-pipeline.ts:707-717` (verbatim) — this is the
pattern to copy:

```ts
  /**
   * Only a request-relevant activity can move the counters, so the streaming
   * storm of tool-call activities never pays for the fold.
   */
  private refreshPendingRequestCountsForActivity(
    event: Extract<OrchestrationEvent, { type: 'thread.activity-appended' }>,
  ) {
    if (!isPendingRequestActivityKind(event.payload.activity.kind)) return

    this.refreshPendingRequestCounts(event.payload.threadId)
  }
```

The other mutation site that keeps the in-memory counters honest is
`projector.ts:313-339` (`revertedThread`), which refolds the **retained**
activities after a revert at line 324. That one stays exactly as it is — a
revert genuinely can drop request activities.

### The redundant third fold, `command-invariants.ts:237-248` (verbatim)

```ts
/**
 * Blocked-on-you work derived from the thread's retained activities: a request
 * with no later resolution for the same `requestId`. The read model caps
 * activities at the most recent few hundred, which is safe here — an open
 * request blocks its turn, so a thread cannot pile up hundreds of later
 * activities while one is outstanding.
 */
export function hasOpenBlockingRequest(thread: OrchestrationProjectedThread) {
  const counts = pendingRequestCounts(thread.activities)

  return counts.approvals + counts.userInputs > 0
}
```

`pendingRequestCounts` is imported at `command-invariants.ts:4` and is used
**nowhere else in that file** (`rg -n "pendingRequestCounts" apps/server/src/orchestration/command-invariants.ts`
returns lines 4 and 245 only). `apps/server/tsconfig.json` sets
`"noUnusedLocals": true`, so you must delete the import in the same edit or
typecheck fails.

The single caller is `command-invariants.ts:212`, inside `requireNoParkedWork`,
reached from `requireSnoozable` → `decider.ts:416` (`thread.snooze`) and the
settle path.

### Why reading the stored counters is not just cheaper but _more_ correct

At boot the engine hydrates from SQL: `engine.ts:91` does
`this.readModel = this.snapshotQuery.fullReadModel()`. In `fullReadModel`
(`snapshot-query.ts:76-100`) the counters come from the **row**
(`pendingApprovalCount: row.pendingApprovalCount`) while `activities` comes from
`recentThreadActivities(...)`, which is the tail capped at `MAX_THREAD_ACTIVITIES`
(`read-model.ts:20`, value `500`). A thread whose open request has aged out of
that 500-row tail therefore has a stored counter of `1` and a refold result of
`0`. The current comment argues the cap is safe; reading the counter removes the
need for the argument.

### The index gap, `db/schema.ts:184-200` (verbatim)

```ts
export const projectionThreadActivities = sqliteTable(
  'projection_thread_activities',
  {
    activityId: text('activity_id').primaryKey(),
    threadId: text('thread_id').notNull(),
    turnId: text('turn_id'),
    tone: text('tone', { enum: ['info', 'tool', 'thinking', 'approval', 'error'] }).notNull(),
    kind: text('kind').notNull(),
    summary: text('summary').notNull(),
    payloadJson: text('payload_json').notNull(),
    sequence: integer('sequence'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('projection_thread_activities_thread_created_idx').on(table.threadId, table.createdAt),
  ],
)
```

Only `(thread_id, created_at)`. Measured on a scratch in-memory SQLite with this
exact DDL (this is the before/after you are reproducing in Step 5):

| Query                                               | Plan                                                                                                                        |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `WHERE thread_id=?` (today)                         | `SEARCH … USING INDEX projection_thread_activities_thread_created_idx (thread_id=?)`                                        |
| `WHERE thread_id=? AND kind IN (…)`, old index only | `SEARCH … USING INDEX projection_thread_activities_thread_created_idx (thread_id=?)` — still visits every row of the thread |
| `WHERE thread_id=? AND kind IN (…)`, with new index | `SEARCH … USING INDEX projection_thread_activities_thread_kind_idx (thread_id=? AND kind=?)`                                |

So the filter alone is _not_ enough: without the index SQLite still walks every
activity row of the thread (it just stops parsing them in JS). The index is what
makes the read proportional to the number of request rows.

### Repo conventions that apply (quoted from `AGENTS.md` — you have not read it)

- **Control flow**: "Keep nesting depth to 3 or less." / "Use guard clauses and
  early returns. Keep the happy path shallow." / "Do not use `else` after an
  early return." / "Never use nested ternaries."
- **Greenfield**: "This project is greenfield and not live: no releases, no
  external users, no data anyone needs migrated." / "No backward compatibility
  shims, no legacy aliases, no deprecation windows. Update every call site in
  the same pass."
- **Errors**: "Never throw `new Error`. Create errors with `createError` from
  `evlog` — in practice through the feature's `structured-errors.ts` wrapper."
  _(This plan adds no error paths. Do not add any.)_
- **Logging**: "Logging is wide-event style (evlog). Always prefer wide logs:
  enrich the one event per operation/request with more fields instead of
  emitting extra narrow log lines." _(This plan adds no log lines.)_
- **Optimization**: "Measure before and after. An optimization without a
  benchmark or profile is a guess." — Step 5 is that measurement.
- **TypeScript fixes**: "Do not copy containers just to satisfy TypeScript. …
  Avoid fake fixes like `sizes: [...node.sizes]`." Relevant here: the new
  `PENDING_REQUEST_ACTIVITY_KINDS` is a `readonly string[]`, and drizzle's
  `inArray` accepts `ReadonlyArray` on its column overload (checked against
  `drizzle-orm@0.45.2`). It typechecks as-is — do **not** "fix" it by spreading
  into a mutable array.
- **Dev server**: "A dev server is always running. Never spin up your own server
  to test or verify changes — reuse the running one." A dev server is live at
  http://localhost:5173. **Do not start one.**
- **Testing**: server tests run `bun --bun vitest run` and import
  `{ describe, it, expect }` **directly from `vitest`** (see
  `apps/server/src/orchestration/tests/pending-request-counters.test.ts:1`). The
  `apps/web/test/fixtures.ts` rule in AGENTS.md applies to **web** tests only —
  do not import it here. "Do not `mock.module` or `vi.mock` our server, client,
  or feature modules." These tests drive the real engine and a real SQLite
  fixture; keep it that way.

### Migration convention (`db/migrations.ts:14-38`, verbatim comment)

```ts
/**
 * The ordered, forward-only ledger for the platform database. Append new
 * versions here; never edit or renumber an existing one — a developer database
 * that already recorded it will not run it again.
 * …
 */
export const platformMigrations: readonly Migration[] = [
  { version: 1, name: 'platform_baseline', up: applyPlatformBaseline },
  …
  { version: 8, name: 'drop_app_settings', up: applyDropAppSettings },
]
```

The highest existing version is **8**. Yours is **9**. `db/tests/migrations.test.ts:32-33`
derives its expectations from the ledger itself
(`platformMigrations.map((m) => m.version)`), so appending a version needs **no**
edit to the existing assertions. (Step 3c still _adds_ a test to that file — the
suite has no assertion at all about `projection_thread_activities`'s indexes.)

## Commands you will need

| Purpose                      | Command (run from repo root)                                                                      | Expected on success    |
| ---------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------- |
| Typecheck server             | `bun run --filter server typecheck`                                                               | exit 0, no errors      |
| Lint server                  | `bun run --filter server lint`                                                                    | exit 0                 |
| Format check                 | `bun run --filter server format:check`                                                            | exit 0                 |
| Format (fix)                 | `bun run --filter server format`                                                                  | rewrites files, exit 0 |
| Server tests (all)           | `bun run --filter server test`                                                                    | all pass               |
| One test file                | `cd apps/server && bun --bun vitest run src/orchestration/tests/pending-request-counters.test.ts` | all pass               |
| Full verify (whole monorepo) | `bun run verify`                                                                                  | exit 0                 |

`--filter server` targets `apps/server`, whose `package.json` name is `server`.
`bun run verify` is `typecheck && lint && format:check && test` fanned out across
**every** workspace, not just the server.

## Scope

**In scope** (the only files you may modify):

- `apps/server/src/orchestration/pending-requests.ts`
- `apps/server/src/orchestration/projection-pipeline.ts`
- `apps/server/src/orchestration/projector.ts`
- `apps/server/src/orchestration/command-invariants.ts`
- `apps/server/src/db/schema.ts`
- `apps/server/src/db/migrations.ts`
- `apps/server/src/db/tests/migrations.test.ts`
- `apps/server/src/orchestration/tests/pending-request-counters.test.ts`
- `apps/server/src/orchestration/tests/thread-lifecycle.test.ts`

**Out of scope** (do NOT touch, even though they look related):

- `apps/server/src/orchestration/read-model.ts` — `MAX_THREAD_MESSAGES` /
  `MAX_THREAD_ACTIVITIES` / `appendBounded`. Removing the in-memory row caps is
  a much larger change (`messages`/`activities` are fields of the shared
  contract type `orchestrationThreadSchema` in
  `packages/contracts/src/chat-model.ts`, so it is a type split across every
  construction site, not a deletion). Explicitly deferred.
- `packages/contracts/**` — no contract changes. Nothing the client sees moves.
- `apps/server/src/orchestration/snapshot-query.ts` — the boot hydration is
  already correct (it reads the stored counters).
- `projector.ts`'s `revertedThread` fold at line 324 — a revert really can prune
  request activities; that refold must stay.
- `planActivities` and the rest of the plan-progress code in
  `projection-pipeline.ts` — already filtered; it is the exemplar, not the
  target. The one exception is its stale doc comment, which Step 2 rewrites.
- `apps/web/**` — no client change. The counters are already served from the SQL
  row via `shell-row-reader.ts`.
- Any other index on any other table. One index, one migration.
- `createProjectionTables` in `migrations.ts` (line 267) and every other existing
  `apply*` / `create*` function — those are the bodies of migrations 1-8. Adding
  the index there instead of (or as well as) in version 9 edits an
  already-applied migration, which the ledger comment at `migrations.ts:14-24`
  forbids; it also would not run on any existing developer database.
- `refreshPendingRequestCountsForActivity` in `projection-pipeline.ts` (line 711) — the SQL-side gate is already correct and is the pattern Step 4a copies.
  Do not "unify" the two gates into one helper; they take different arguments and
  live on different sides of the projection boundary.
- `MAX_THREAD_ACTIVITIES` / `MAX_THREAD_MESSAGES` values. Step 4b's whole point is
  that the guard stops depending on the cap; raising or removing the cap is a
  different change and is the deferred work above.
- Adding a `drizzle.config.*` or any generated drizzle-kit SQL. This repo has no
  drizzle-kit setup: `schema.ts` is a model used for typed queries only, and
  `migrations.ts` is the sole thing that runs DDL.
- Retention/pruning for `projection_thread_activities`. The absence of a prune is
  named in "Why this matters" as context for the cost, not as work to do here.

## Git workflow

- **All work happens on `main`** — no new branches, worktrees, commits, pushes,
  or PRs unless the operator explicitly asks. Leave the work in the working
  tree unless told otherwise.
- If (and only if) the operator asks for a commit: conventional commits,
  lowercase descriptive subject. Real examples from `git log`:
  - `refactor(orchestration): the server prepares a session's worktree (M-C)`
  - `fix(address): bound the URL, and stop escaping slashes in ?tabs=`
  - A fitting subject here: `perf(orchestration): one gated, indexed fold for the pending-request counters`

## Steps

### Step 1: Make the six kinds one list in `pending-requests.ts`

The SQL query needs the six kinds as data. Do **not** paste a fourth copy of the
list — derive the existing predicates from one source, so there is nothing to
keep in sync.

In `apps/server/src/orchestration/pending-requests.ts`, replace
`openedRequestKind` and `isBlockingRequestCloseKind` (lines 78-92) with lookups
over module-level constants, and export the combined list. Target shape:

```ts
const OPENED_REQUEST_KINDS = new Map<string, RequestKind>([
  ['approval.requested', 'approval'],
  ['user-input.requested', 'user-input'],
])

const BLOCKING_REQUEST_CLOSE_KINDS = new Set([
  'approval.resolved',
  'user-input.resolved',
  'provider.approval.respond.failed',
  'provider.user-input.respond.failed',
])

/**
 * The only kinds the fold reacts to — every other activity is a no-op for it.
 * The SQL projection filters its read on this list, so the filtered read and
 * the whole-history read produce the same counts by construction rather than by
 * two lists agreeing.
 */
export const PENDING_REQUEST_ACTIVITY_KINDS: readonly string[] = [
  ...OPENED_REQUEST_KINDS.keys(),
  ...BLOCKING_REQUEST_CLOSE_KINDS,
]

function openedRequestKind(kind: string) {
  return OPENED_REQUEST_KINDS.get(kind) ?? null
}

function isBlockingRequestCloseKind(kind: string) {
  return BLOCKING_REQUEST_CLOSE_KINDS.has(kind)
}
```

Leave `pendingRequestCounts`, `isPendingRequestActivityKind`, `foldActivity`,
`isBlockingRequestClosed`, `isRespondFailureKind`, `isDeadRequestFailureDetail`,
`activityRequestId` and `activityPayloadRecord` unchanged. In particular
**do not** try to derive `isRespondFailureKind` from the new Set — it is a
different, narrower question (which close kinds need a dead-request check).

**Verify**:

```
bun run --filter server typecheck && cd apps/server && bun --bun vitest run src/orchestration/tests/pending-request-counters.test.ts
```

→ typecheck exit 0; 5 tests pass (nothing has changed behaviourally yet).

### Step 2: Filter `requestActivities` by kind in SQL

In `apps/server/src/orchestration/projection-pipeline.ts`, change
`requestActivities` (lines 796-812) to add the kind predicate, mirroring
`planActivities` directly above it. `and` and `inArray` are already imported at
line 1; add `PENDING_REQUEST_ACTIVITY_KINDS` to the existing import from
`./pending-requests` at line 31.

Target shape (only the `.where(...)` changes, plus a doc comment):

```ts
  /**
   * Filtered by kind in SQL, exactly like `planActivities`: the fold reacts to
   * six kinds, and a thread's activity table holds every tool call it ever made
   * with its diff in the payload. Reading and parsing those to ignore them is
   * what made an approval cost more the longer the thread ran.
   */
  private requestActivities(threadId: string) {
    const rows = this.database
      .select({
        kind: projectionThreadActivities.kind,
        payloadJson: projectionThreadActivities.payloadJson,
      })
      .from(projectionThreadActivities)
      .where(
        and(
          eq(projectionThreadActivities.threadId, threadId),
          inArray(projectionThreadActivities.kind, PENDING_REQUEST_ACTIVITY_KINDS),
        ),
      )
      .orderBy(
        asc(projectionThreadActivities.sequence),
        asc(projectionThreadActivities.createdAt),
        asc(projectionThreadActivities.activityId),
      )
      .all()

    return rows.map((row) => ({ kind: row.kind, payload: parseActivityPayload(row.payloadJson) }))
  }
```

Keep the `orderBy` exactly as it is — the fold is order-dependent.

Also update the now-stale comment on `planActivities` at
`projection-pipeline.ts:761-765`: the clause "unlike the request counters, plan
snapshots are a handful of rows in a thread that can hold thousands" describes
an asymmetry that no longer exists. Replace that comment with one that no longer
claims the asymmetry, e.g.:

```ts
/**
 * Filtered by kind in SQL rather than folded over the whole history: a plan
 * snapshot is a handful of rows in a thread that can hold thousands.
 */
```

**Verify**:

```
cd apps/server && bun --bun vitest run src/orchestration/tests/pending-request-counters.test.ts src/orchestration/tests/projection-convergence.test.ts
```

→ all pass. `pending-request-counters.test.ts` is the one that asserts the SQL
and in-memory projections agree on `pendingApprovalCount` /
`pendingUserInputCount` — for open, resolved, replayed, transient-failure,
dead-failure and reverted cases. If the filter had changed a result, it fails
here. `projection-convergence.test.ts` never reads the counters; it is the
broader memory-vs-SQL suite (turns, sessions, messages, plan progress) and is
run here only to prove the new `and(...)` did not disturb the pipeline.

### Step 3: Add the `(thread_id, kind)` index — schema, migration 9, and its test

Three edits, all required. `schema.ts` is the drizzle model used for typed
queries — **editing it creates no index anywhere**. `migrations.ts` is the only
thing that runs DDL. `migrations.test.ts` is what proves it ran.

**3a.** In `apps/server/src/db/schema.ts`, add the index to the
`projectionThreadActivities` table's index array (lines 197-199):

```ts
  (table) => [
    index('projection_thread_activities_thread_created_idx').on(table.threadId, table.createdAt),
    index('projection_thread_activities_thread_kind_idx').on(table.threadId, table.kind),
  ],
```

**3b.** In `apps/server/src/db/migrations.ts`, append version 9 to
`platformMigrations` (after the `version: 8` entry) and add its `up` function
next to the other `apply*` functions at the bottom of the file:

```ts
  { version: 9, name: 'thread_activity_kind_index', up: applyThreadActivityKindIndex },
```

```ts
/**
 * The pending-request counters read only six activity kinds out of a table that
 * holds every tool call a thread ever made. Without this index the kind filter
 * still visits every row of the thread — `(thread_id, created_at)` can only
 * seek on the thread.
 */
function applyThreadActivityKindIndex(database: PlatformDatabase) {
  database.run(sql`
		CREATE INDEX IF NOT EXISTS projection_thread_activities_thread_kind_idx
		ON projection_thread_activities (thread_id, kind)
	`)
}
```

Match the surrounding indentation exactly (the file's SQL template literals are
indented with tabs inside the backticks — copy the shape of
`createProviderRuntimeTables` at `migrations.ts:504`, which is the nearest
multi-line `database.run(sql\`…\`)`). `oxfmt`does not reformat template literal
contents; if`format:check`complains, run`bun run --filter server format`.

Do **not** also add the index to `createProjectionTables` (`migrations.ts:267`).
That function is version 1's baseline body; editing it changes an already-applied
migration, which the ledger comment forbids, and it would do nothing on any
existing developer database anyway. Migration 9 is the only place the index is
created.

**3c.** Nothing currently asserts that the index actually reaches a database —
`db/tests/migrations.test.ts` checks tables, columns and a fixed set of _other_
indexes, and no test reads `projection_thread_activities`'s index list. Without
this the whole perf half of the plan can be silently no-op'd by an executor who
edits `schema.ts` (a model file nothing runs) and fluffs `migrations.ts`.

Add this test to `db/tests/migrations.test.ts`, inside
`describe('platform migration ledger', …)`, directly after the existing
`'creates the orchestration lookup indexes the snapshot queries rely on'` test
(which ends at line 97) and modelled on it. `indexNames` is already defined in
that file at line 220:

```ts
it('creates the activity kind index the pending-request fold reads through', () => {
  const handle = openTempDatabase()

  migratePlatformDatabase(handle.db)

  expect(indexNames(handle, 'projection_thread_activities')).toEqual(
    expect.arrayContaining([
      'projection_thread_activities_thread_created_idx',
      'projection_thread_activities_thread_kind_idx',
    ]),
  )
})
```

**Verify**:

```
cd apps/server && bun --bun vitest run src/db/tests/migrations.test.ts
```

→ 9 tests pass (8 existing + the new one). `ledgerVersionNumbers` is derived from
`platformMigrations`, so the "creates every table" and "applies nothing on the
second run" tests expect versions `[1..9]` automatically — you do not edit them.

If the new test fails with only `projection_thread_activities_thread_created_idx`
present, migration 9 is not wired: check that the `{ version: 9, … }` entry is in
`platformMigrations` and that `applyThreadActivityKindIndex` names the table
`projection_thread_activities` (not the drizzle symbol).

### Step 4: Gate the in-memory fold, and stop the third fold

**4a.** In `apps/server/src/orchestration/projector.ts`, add
`isPendingRequestActivityKind` to the existing import at line 3:

```ts
import { isPendingRequestActivityKind, pendingRequestCounts } from './pending-requests'
```

Replace the `case 'thread.activity-appended':` block (lines 77-93) with a call
to a named function, matching how `thread.session-set` at line 72 delegates to
`threadAfterSessionSet`:

```ts
    case 'thread.activity-appended':
      updateThread(model, event.payload.threadId, (thread) => threadAfterActivity(thread, event))
      return
```

Add the two functions next to `threadAfterSessionSet` (line 405). Both type names
they use are already imported in that file — `OrchestrationEvent` at line 1,
`OrchestrationProjectedThread` at line 15. Do not add a second import for either —
a duplicate identifier fails typecheck.

```ts
function threadAfterActivity(
  thread: OrchestrationProjectedThread,
  event: Extract<OrchestrationEvent, { type: 'thread.activity-appended' }>,
) {
  upsertActivity(thread.activities, event)
  const counts = pendingRequestCountsAfterActivity(thread, event)

  return {
    ...thread,
    latestTurn: latestTurnAfterActivity(thread.latestTurn, event),
    pendingApprovalCount: counts.approvals,
    pendingUserInputCount: counts.userInputs,
    updatedAt: event.payload.activity.createdAt,
  }
}

/**
 * Only a request-relevant activity can move the counters, so the streaming
 * storm of tool-call activities never pays for the fold — the same gate the SQL
 * projection applies in `refreshPendingRequestCountsForActivity`.
 *
 * When it does fold, it folds the retained activities rather than incrementing:
 * a replayed batch or a revised activity can then never leave the counters
 * drifted from the request state they describe.
 */
function pendingRequestCountsAfterActivity(
  thread: OrchestrationProjectedThread,
  event: Extract<OrchestrationEvent, { type: 'thread.activity-appended' }>,
) {
  if (!isPendingRequestActivityKind(event.payload.activity.kind)) {
    return { approvals: thread.pendingApprovalCount, userInputs: thread.pendingUserInputCount }
  }

  return pendingRequestCounts(thread.activities)
}
```

Note the intentional behaviour change this makes on threads over the 500-activity
cap: a non-request activity can evict an old, still-open request activity out of
the retained window, and the ungated fold would then silently drop that request
from the count. The gated version keeps the last folded value — which is what
SQL (no cap, source of truth) reports. This _removes_ a divergence.

**4b.** In `apps/server/src/orchestration/command-invariants.ts`, delete the
import at line 4 (`import { pendingRequestCounts } from './pending-requests'`)
and replace `hasOpenBlockingRequest` (lines 237-248) with:

```ts
/**
 * Blocked-on-you work read off the counters both projections maintain: a
 * request with no later resolution for the same `requestId`. Reading the stored
 * counts rather than refolding `thread.activities` is also what makes the answer
 * independent of the read model's activity cap — a thread whose open request has
 * aged out of the retained window still reports as blocked, because the counter
 * was written when the request opened.
 */
export function hasOpenBlockingRequest(thread: OrchestrationProjectedThread) {
  return thread.pendingApprovalCount + thread.pendingUserInputCount > 0
}
```

**Verify**:

```
bun run --filter server typecheck && bun run --filter server lint && bun run --filter server test
```

→ typecheck exit 0 (if it reports `'pendingRequestCounts' is declared but never
used` in `command-invariants.ts`, you missed deleting the import); lint exit 0;
all server tests pass. `thread-lifecycle.test.ts` is the direct gate for 4b — its
`describe('settle guards', …)` block (10 cases, lines 22-140) drives the real
engine through `approval.requested` → settle and asserts
`orchestration.THREAD_BLOCKING_REQUEST`, and through resolve / dead-failure /
transient-failure and asserts the thread _does_ and _does not_ settle. Those are
the negative cases: if reading the stored counters made the guard too sticky, the
`'settles once the request resolves'` and `'settles once a respond failure proves
the request is gone'` cases fail.

### Step 5: Measure — confirm the query plan actually changed

Step 3c proves the index is _created_. This step proves SQLite actually _picks_
it, on the real developer database.

The dev server is already running and applies migration 9 the first time it
restarts after Step 3. Read the developer database **read-only** (a second reader
is safe under WAL):

```
bun --bun -e "
import { Database } from 'bun:sqlite'
import { homedir } from 'node:os'
import path from 'node:path'
const db = new Database(path.join(homedir(), '.platform', 'fs-metadata.sqlite'), { readonly: true })
const kinds = ['approval.requested','user-input.requested','approval.resolved','user-input.resolved','provider.approval.respond.failed','provider.user-input.respond.failed']
const q = \`SELECT kind, payload_json FROM projection_thread_activities WHERE thread_id = 'x' AND kind IN (\${kinds.map(() => '?').join(',')}) ORDER BY sequence, created_at, activity_id\`
console.log(db.query('EXPLAIN QUERY PLAN ' + q).all(...kinds).map((r) => r.detail))
db.close()
"
```

**Expected**:

```
[ "SEARCH projection_thread_activities USING INDEX projection_thread_activities_thread_kind_idx (thread_id=? AND kind=?)",
  "USE TEMP B-TREE FOR ORDER BY" ]
```

**Control (the "before")**: this exact command was run at plan time, against
this exact database, and printed

```
[ "SEARCH projection_thread_activities USING INDEX projection_thread_activities_thread_created_idx (thread_id=?)",
  "USE TEMP B-TREE FOR ORDER BY" ]
```

so the instrument is known to work and the two outcomes are distinguishable. If
you want the before/after pair yourself, run the command _before_ Step 3 lands in
the running server; either way the plan-time output above is the baseline.

If it still names `projection_thread_activities_thread_created_idx`, the index
was not created in _that_ database — the dev server has not restarted since Step
3, or migration 9 did not run. Restart is the operator's call: **report it, do
not restart the server yourself** (AGENTS.md forbids managing the dev server).
The `USE TEMP B-TREE FOR ORDER BY` line is expected and fine; it sorts a handful
of rows.

If `~/.platform/fs-metadata.sqlite` does not exist on this machine, or the
read-only open throws, skip this step and say so in your report. Step 3c is the
gate that must pass regardless — it asserts the index is created on a fresh
temp database, which does not depend on the dev server at all.

### Step 6: Add the two regression tests

See "Test plan" below, then run the full verify:

```
bun run verify
```

→ exit 0. Note this is the **whole monorepo** (`typecheck && lint &&
format:check && test` across every workspace, web included), not just `server`.
Expect it to take minutes. A failure in a workspace you did not touch is a
pre-existing failure, not yours — report it, do not fix it.

## Test plan

Two new tests. Both are cheap and both would fail if a future edit un-gates or
mis-gates the fold.

**Test 1 — `apps/server/src/orchestration/tests/pending-request-counters.test.ts`**
(add inside the existing `describe('pending request counters', …)` block; model
it on the existing transient/dead-failure test at lines 50-74, which is the
existing case that runs two `project(…)` calls in one `it`).

Two cases in one test, and the second one is the point:

1. _An open request survives a storm of unrelated activities in both
   projections_ — guards the Step 2 SQL filter against wrongly **excluding**
   `approval.requested`.
2. _A resolve still closes the counter after that same storm_ — guards the Step 4a
   gate against wrongly **excluding** the close kinds. This is the negative case:
   the tightening in Step 4a stops most activities from refolding, so a test that
   only ever opens a request would pass even if closes stopped landing too.

```ts
it('survives a storm of unrelated activities and still closes on resolve', () => {
  const noise = Array.from({ length: 50 }, (_, index) =>
    activityAppendedEvent({ id: `activity-tool-${index}` }),
  )
  const open = project([
    ...threadBootstrapEvents(),
    turnStartEvent('turn-1', requestedAt),
    approvalRequested('req-1'),
    ...noise,
  ])

  expectCounts(open.memory, 1, 0)
  expectCounts(open.sqlThread, 1, 0)

  const closed = project([
    ...threadBootstrapEvents(),
    turnStartEvent('turn-1', requestedAt),
    approvalRequested('req-1'),
    ...noise,
    requestActivity('approval.resolved', 'activity-resolve-1', 'req-1'),
  ])

  expectCounts(closed.memory, 0, 0)
  expectCounts(closed.sqlThread, 0, 0)
})
```

Every helper this uses (`project`, `expectCounts`, `approvalRequested`,
`requestActivity`) is already defined at the bottom of that file (lines 109-157);
add nothing. `activityAppendedEvent`, `threadBootstrapEvents` and
`turnStartEvent` are already imported at lines 5-13 and `activityAppendedEvent`
defaults to `kind: 'tool.started'`, `tone: 'tool'`, `payload: null`
(`tests/factories/projection.ts:231-259`) — exactly the noise you want, since a
`null` payload carries no `requestId` and the fold ignores it. The ids must be
unique or the upsert path treats them as revisions.

**Test 2 — `apps/server/src/orchestration/tests/thread-lifecycle.test.ts`**
(add inside `describe('settle guards', …)`; model it on
`'refuses to settle a thread with an open approval request'` at lines 33-41).

Case: _the settle guard still refuses after unrelated activity traffic._ This is
the direct guard for Step 4b — `hasOpenBlockingRequest` now reads a stored
counter, so a test that only appends the request itself would pass even if the
counter were never maintained past the first event.

```ts
it('keeps refusing to settle while unrelated activity traffic flows', async () => {
  const { engine } = await createEngineWithThread()
  await engine.dispatch(activityCommand('approval.requested', 'approval'))
  for (let index = 0; index < 20; index += 1) {
    await engine.dispatch(activityCommand('tool.started', 'tool', null))
  }

  await expect(engine.dispatch(settleCommand())).rejects.toMatchObject({
    code: 'orchestration.THREAD_BLOCKING_REQUEST',
    status: 409,
  })
})
```

`activityCommand(kind, tone, payload = { requestId: 'request-1' })` is defined at
`thread-lifecycle.test.ts:488-508` and mints a fresh `activity-N` id per call, so
the loop produces distinct activities. Pass `null` as the third argument so the
noise carries no `requestId`.

**No other new tests.** The rest of this change is behaviour-preserving and the
existing suites are the gate:

- `pending-request-counters.test.ts` (5 existing cases) — asserts memory and SQL
  agree on open / resolved / replayed / transient-failure / dead-failure /
  reverted counters. This is the only existing suite that reads the counters.
- `projection-convergence.test.ts` (551 lines) — the broader memory-vs-SQL suite
  (turns, sessions, messages, plan progress). It does **not** assert the
  counters; it proves the changed `requestActivities` did not disturb the rest of
  the pipeline.
- `thread-lifecycle.test.ts` — `describe('settle guards', …)` holds 10 cases
  (lines 22-140) that drive the real engine over exactly the paths
  `hasOpenBlockingRequest` gates, in both directions (refuses while open, settles
  once resolved or once the request is proven dead).
- `db/tests/migrations.test.ts` — ledger integrity; version 9 is picked up
  automatically, and Step 3c adds the index assertion the file was missing.
- `read-model-bounds.test.ts` (4 cases) — asserts only retained lengths and ids,
  not counters, so the Step 4a gate does not affect it.

**Verification**:

```
bun run --filter server test
```

→ all pass, including the 3 new tests (Step 3c, Test 1, Test 2).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun run --filter server typecheck` exits 0
- [ ] `bun run --filter server lint` exits 0
- [ ] `bun run --filter server format:check` exits 0
- [ ] `bun run --filter server test` exits 0; the 3 new tests above exist and pass
- [ ] `bun run verify` exits 0
- [ ] `rg -n "pendingRequestCounts" apps/server/src/orchestration/command-invariants.ts`
      returns **nothing** — neither the import nor the call survives. (Do not
      count occurrences across the whole folder: the definition, the two imports,
      the pipeline call, the two `projector.ts` calls and an unrelated comment in
      `read-model.ts` all legitimately remain.)
- [ ] `rg -n "projection_thread_activities_thread_kind_idx" apps/server/src/` matches
      in all three of `db/schema.ts`, `db/migrations.ts` and
      `db/tests/migrations.test.ts`
- [ ] `rg -n "unlike" apps/server/src/orchestration/projection-pipeline.ts` returns
      nothing (the stale asymmetry comment is gone)
- [ ] `rg -n "PENDING_REQUEST_ACTIVITY_KINDS" apps/server/src/` matches in exactly
      two files: `orchestration/pending-requests.ts` (definition) and
      `orchestration/projection-pipeline.ts` (import + `inArray` use)
- [ ] Step 5's `EXPLAIN QUERY PLAN` names
      `projection_thread_activities_thread_kind_idx` (or you reported why it could
      not be run)
- [ ] No files outside the in-scope list are modified (`git status --porcelain`)
- [ ] `plans/README.md` row for 020 updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check prints anything, or any "Current state" excerpt does not match
  the live code.
- `pending-request-counters.test.ts` or `projection-convergence.test.ts` fails
  after Step 2. That means the SQL filter changed a count, which contradicts the
  premise that the fold ignores every other kind — do not "fix" the test, report
  which case diverged and by how much.
- `thread-lifecycle.test.ts` fails after Step 4b. That means the stored counters
  are _not_ maintained everywhere `hasOpenBlockingRequest` is reached — a real
  finding that invalidates this plan's core assumption. Report it; do not revert
  to the refold as a workaround.
- You find a **seventh** activity kind that `pendingRequestCounts` reacts to
  (i.e. `foldActivity` mutates its map for a kind not in
  `PENDING_REQUEST_ACTIVITY_KINDS`). The whole plan rests on the list being
  complete.
- `PENDING_REQUEST_ACTIVITY_KINDS` does not end up with exactly six entries, or
  it is a hand-written literal rather than a spread of `OPENED_REQUEST_KINDS` and
  `BLOCKING_REQUEST_CLOSE_KINDS`. A short or hand-copied list makes the SQL read
  drop rows the fold needed, and the counters under-report silently — threads
  stop reporting as blocked and the settle guard lets work be settled away.
- Migration 9 fails to apply, or `migrations.test.ts` reports a version mismatch.
  Never renumber or edit versions 1-8, and never add the index to
  `createProjectionTables`.
- Step 3c's index assertion fails after you believe migration 9 is wired
  correctly. That is the perf half of the plan not landing; report it rather than
  weakening the assertion or moving the DDL into the baseline.
- Step 5 shows the old index still being chosen **after** a confirmed dev-server
  restart.
- The change appears to require touching `read-model.ts`, `snapshot-query.ts`,
  or anything in `packages/contracts/` — those are out of scope by design.
- Any step's verification command still fails after two focused attempts to fix
  what it reported. Report the exact command and its output; do not keep editing.

## Maintenance notes

- **Plan 036 (`Collapse the dual projection — deletes projector.ts`) may delete
  half of this work.** That plan removes the in-memory twin entirely, which
  takes Step 4a with it. That is fine and expected: Step 4a is a ~15-line change
  that makes the two projections agree _today_, and a plan that unifies them
  later starts from a state where the surviving fold is already the gated one.
  Steps 1, 2, 3 and 4b survive 036 unchanged. Do not defer this plan waiting for
  036; do not expand this plan toward 036 either.
- **What a reviewer should scrutinize**: (1) that
  `PENDING_REQUEST_ACTIVITY_KINDS` is genuinely derived from the same constants
  the predicates use, not a fourth hand-written copy — if the two ever diverge,
  the SQL filter silently under-counts and threads stop reporting as blocked;
  (2) the `orderBy` on `requestActivities` is unchanged (the fold is
  order-dependent); (3) migration 9 is appended, never renumbered.
- **If a new request kind is ever added** (say `permission.requested`), it must
  be added to `OPENED_REQUEST_KINDS` or `BLOCKING_REQUEST_CLOSE_KINDS` in
  `pending-requests.ts` and nowhere else. Both the SQL filter and both gates
  follow from there.
- **Deliberately deferred**: dropping `messages` / `activities` from
  `OrchestrationProjectedThread` and deleting `appendBounded` + `MAX_THREAD_*`.
  Those two fields come from the shared contract schema
  (`packages/contracts/src/chat-model.ts:336-337`) that
  `OrchestrationProjectedThread` extends and that `snapshot-query`'s
  `threadFromRow` / `fullReadModel` also build — it needs a server-side thread
  type plus every construction site, an L, not part of this S. The two remaining
  non-projector readers of `thread.messages` (`provider-command-reactor.ts:528`,
  a `find` by message id; `checkpoint-reactor.ts:316`, a reverse scan for the
  last assistant message of a `turnId`) are the point reads that would have to
  move to `OrchestrationSnapshotQuery` first.
- **Also deliberately not done**: indexing `upsertActivity`'s `findLastIndex`
  (`projector.ts:491`), which still scans the retained activity array on every
  activity event. It is bounded at 500 elements over a numeric-comparison
  predicate, and `projector.ts` is scheduled for deletion by plan 036 — building
  an id→index map for it would be work thrown away.
