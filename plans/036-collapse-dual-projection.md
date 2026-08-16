# Plan 036: Collapse the two hand-written projections of the event log into one

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If anything in the "STOP conditions" section occurs, stop and report —
> do not improvise. When done, update the status row for this plan in
> `plans/README.md` — unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**, from the repo root `/Users/shaul/Desktop/D/platform`:
>
> ```bash
> git diff --stat ace313f..HEAD -- \
>   apps/server/src/orchestration/engine.ts \
>   apps/server/src/orchestration/projector.ts \
>   apps/server/src/orchestration/projection-pipeline.ts \
>   apps/server/src/orchestration/read-model.ts \
>   apps/server/src/orchestration/snapshot-query.ts \
>   apps/server/src/orchestration/tests/factories/projection.ts \
>   apps/server/src/orchestration/tests/projection-convergence.test.ts \
>   apps/server/src/orchestration/tests/read-model-bounds.test.ts \
>   apps/server/src/orchestration/tests/pending-request-counters.test.ts \
>   apps/server/src/orchestration/tests/proposed-plan-projection.test.ts \
>   apps/server/src/orchestration/tests/checkpoint-projection.test.ts \
>   apps/server/src/orchestration/tests/engine.test.ts
> ```
>
> **Expected: no output.** If any in-scope file appears, compare the "Current
> state" excerpts below against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: `plans/028-orchestration-event-catalog-derived.md` (must land first)
- **Category**: architecture
- **Planned at**: commit `ace313f`, 2026-08-16

## Why this matters

The orchestration event log is folded into a read model **twice, by hand**:
`projection-pipeline.ts` folds it into SQL rows (1,238 lines, a 30-case switch),
and `projector.ts` folds the _same 30 events_ into the in-memory
`OrchestrationReadModel` (625 lines, a second 30-case switch). Nothing enforces
that the two agree. They have already drifted twice in ways only found after the
fact, and both fixes are recorded as comments in `projector.ts` — one where a
revised streaming activity stayed frozen in memory while the row moved on, one
where nulling the session on stop "left the two read models answering
differently". The tax is a 551-line convergence test suite whose only job is
asserting `sqlThread.X === memory.X`.

Today, adding an orchestration event or changing a projection rule is a
three-site edit: SQL fold, memory fold, convergence test. Two of those three
sites are unenforced — you can change one and ship.

After this plan there is **one** fold. The in-memory model becomes a _cache_ of
the SQL projection: the projection already writes inside the same transaction
`commitCommand` opens, so once that transaction commits, refreshing the touched
aggregates is a matter of re-reading the rows it just wrote, through the exact
`threadFromRow` / `messageFromRow` / `activityFromRow` mapping `fullReadModel()`
already uses. `projector.ts` is deleted (625 lines), three now-unreachable
helpers in `read-model.ts` go with it, and the projection rules — text merging,
turn settling, checkpoint placeholder precedence, revert pruning, the actionable
plan flag — exist in exactly one place.

This closes the flagship instance of cross-cutting theme **T1** in
`plans/README.md`:

> **T1 — Parallel hand-maintained representations of one truth** … The event log
> is folded twice by hand (1,238 + 625 lines, policed by a 551-line convergence
> test). … **One rule closes all of them: a second representation must be
> _derived_, never _maintained_.**

## Current state

Everything below was read at commit `ace313f`. Line counts are exact
(`wc -l`): `projection-pipeline.ts` 1,238; `projector.ts` 625;
`tests/projection-convergence.test.ts` 551; `snapshot-query.ts` 500;
`engine.ts` 522; `read-model.ts` 278.

### The files

| File                                                   | Role                                                                             |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `apps/server/src/orchestration/projection-pipeline.ts` | The SQL fold. **Survives untouched** — it becomes the only fold.                 |
| `apps/server/src/orchestration/projector.ts`           | The in-memory fold. **Deleted by this plan.**                                    |
| `apps/server/src/orchestration/snapshot-query.ts`      | Rows → model. Already has `fullReadModel()`. **Gains the incremental refresh.**  |
| `apps/server/src/orchestration/engine.ts`              | Owns `this.readModel`; calls `projectEvents` twice. **Switched to the refresh.** |
| `apps/server/src/orchestration/read-model.ts`          | Model types + shared helpers. **Loses three projector-only helpers.**            |

### `engine.ts` — the two call sites being replaced

`apps/server/src/orchestration/engine.ts:37`

```ts
import { projectEvents } from './projector'
```

`apps/server/src/orchestration/engine.ts:214-230` — the commit path. Note that
`commitCommand` (line 287-306) runs `projectionPipeline.applyEvents(events)`
**inside** the database transaction, so by the time line 223 runs the rows are
already committed and readable:

```ts
  private commitNewCommand(command: OrchestrationCommand, summary: OrchestrationCommandSummary) {
    try {
      const pendingEvents = decideOrchestrationCommand(command, this.readModel)
      recordChatPipelineInfo('chat.pipeline.command.decided', {
        ...summary,
        eventCount: pendingEvents.length,
        eventTypes: pendingEvents.map((event) => event.type),
      })
      const committed = this.commitCommand(command, pendingEvents)
      this.readModel = projectEvents(committed.events, this.readModel)

      return { ...committed, published: this.publishCommitted(committed.events) }
    } catch (error) {
      this.recordDispatchFailure(command, summary, error)
      throw error
    }
  }
```

`apps/server/src/orchestration/engine.ts:256-279` — the reconcile path:

```ts
  /**
   * Re-derives the command read model from the event log. Without this a
   * dispatch that threw after its events were durable leaves the engine
   * deciding later commands against a read model that is missing them.
   */
  private reconcileReadModel() {
    try {
      const events = this.eventStore.readAfter({ afterSequence: this.readModel.sequence })
      if (events.length === 0) return { reconciledEventCount: 0 }

      this.readModel = projectEvents(events, this.readModel)
      const published = this.publishCommitted(events)

      return {
        reconciledEventCount: events.length,
        reconciledSequence: this.readModel.sequence,
        reconcileReactorFailures: published.failures,
      }
    } catch (error) {
      // Reconcile is best-effort: the dispatch failure it is annotating is the
      // error the caller has to see, so this one rides along as a field.
      return { reconcileError: errorMessage(error), reconciledEventCount: 0 }
    }
  }
```

**This reconcile path has a trap you must handle.** `engine.test.ts:146-169`
(`reconciles the read model from the event log after a failed dispatch`)
appends an event straight to the event store _without_ running the projection
pipeline, then forces a failing dispatch and asserts the model picked the event
up. Reading rows cannot see an event the pipeline never applied, so the reconcile
must run `this.projectionPipeline.catchUp()` first. Step 3 spells this out.

### `snapshot-query.ts` — the mapping that already exists

`apps/server/src/orchestration/snapshot-query.ts:76-100` — the cold hydration
this plan makes incremental:

```ts
  fullReadModel(sequence = this.currentSequence()): OrchestrationReadModel {
    const model = createEmptyReadModel(sequence)

    for (const row of this.database.select().from(projectionProjects).all()) {
      model.projects.set(row.projectId, projectFromRow(row))
    }
    for (const row of this.database.select().from(projectionThreads).all()) {
      const thread = threadFromRow(
        row,
        this.recentThreadMessages(row.threadId),
        this.recentThreadActivities(row.threadId),
        this.threadSession(row.threadId),
      )
      model.threads.set(row.threadId, {
        ...thread,
        checkpointByTurnId: boundCheckpoints(this.threadCheckpointIndex(row.threadId)),
        hasActionableProposedPlan: row.hasActionableProposedPlan,
        latestUserMessageAt: row.latestUserMessageAt,
        pendingApprovalCount: row.pendingApprovalCount,
        pendingUserInputCount: row.pendingUserInputCount,
      })
    }

    return model
  }
```

The four re-set fields are not redundant: `threadFromRow` ends in
`v.parse(orchestrationThreadSchema, …)` (line 409) and valibot's `object()`
strips entries the schema does not declare. `OrchestrationProjectedThread` is
`OrchestrationThread` **plus** `checkpointByTurnId`, `hasActionableProposedPlan`,
`latestUserMessageAt`, `pendingApprovalCount`, `pendingUserInputCount`
(`read-model.ts:32-38`), so those five have to be re-attached after the parse.
Your refresh must do the same.

The private query helpers you will reuse, all already in the class:

```ts
  private recentThreadMessages(threadId: string) {          // :229-231
    return this.messagesBefore(threadId, null, MAX_THREAD_MESSAGES).rows
  }

  private recentThreadActivities(threadId: string) {        // :233-235
    return this.activitiesBefore(threadId, null, MAX_THREAD_ACTIVITIES).rows
  }

  private threadSession(threadId: string) {                 // :237-243
    return this.database
      .select()
      .from(projectionThreadSessions)
      .where(eq(projectionThreadSessions.threadId, threadId))
      .get()
  }

  private threadCheckpointIndex(threadId: string) {         // :266-272
    const entries = this.threadCheckpointRows(threadId).map(
      (row) => [row.turnId, projectedCheckpointFromRow(row)] as const,
    )

    return Object.fromEntries(entries) as Record<string, OrchestrationProjectedCheckpoint>
  }
```

And the module-private row mappers you will call: `projectFromRow` (:315),
`threadFromRow` (:403), `messageFromRow` (:417), `activityFromRow` (:431),
`projectedCheckpointFromRow` (:472). **They stay module-private** — the refresh
lives in the same file, so nothing new is exported.

### `read-model.ts` — the three helpers that die with `projector.ts`

`apps/server/src/orchestration/read-model.ts:68-107`. Verified with
`git grep -nwP "setThreadSession|setLatestTurnState|settleRunningTurn" -- apps`
(13 hits, all in `projector.ts` and `read-model.ts`): these three are referenced
**only** by `projector.ts` and by each other.

**Do not confuse `settleRunningTurn` with `settleRunningTurns`** (plural), a
private method of `projection-pipeline.ts` at `:144`, `:251` and `:845`. It is a
different function in an out-of-scope file and it stays. This is why every grep
in this plan is word-anchored (`-w` / `\b` under `-P`).

```ts
export function setThreadSession(
  thread: OrchestrationProjectedThread,
  session: OrchestrationSession | null,
) { … }

export function setLatestTurnState(
  thread: OrchestrationProjectedThread,
  state: OrchestrationLatestTurn['state'],
  timestamp: string,
  assistantMessageId = thread.latestTurn?.assistantMessageId ?? null,
) { … }

export function settleRunningTurn(
  thread: OrchestrationProjectedThread,
  state: 'completed' | 'interrupted' | 'error',
  timestamp: string,
) { … }
```

Everything else in `read-model.ts` has a surviving consumer and must stay:
`appendBounded` (:260) is used by `streams.ts` **and** by your new refresh;
`boundCheckpoints` (:267) by `snapshot-query.ts`; `mergedMessageText` (:139) and
`settledTurnStateForSessionStatus` (:116) by `projection-pipeline.ts`;
`MAX_THREAD_MESSAGES` / `MAX_THREAD_ACTIVITIES` by `snapshot-query.ts`;
`createEmptyReadModel`, `requireProject`, `threadPlanProgress`,
`isPlanProgressActivityKind`, `PLAN_PROGRESS_ACTIVITY_KIND` by other modules.

### Why the refresh must be per-row, not per-window

`projector.ts:20-25` records a regression this project already paid for once:

```ts
/**
 * Projects in place. The read model is engine-private and every consumer reads
 * it through `getReadModel()` at the moment of use, so nobody held the old
 * value — the per-event deep clone only copied every message and activity of
 * every thread, which made dispatch cost grow with thread length.
 */
```

Under `assistantDeliveryMode === 'streaming'`, **every provider token delta
dispatches a command** (`provider-runtime-ingestion.ts:273-275`), so every delta
runs `commitNewCommand` and therefore your refresh. A refresh that re-read the
thread's whole retained window would re-`v.parse` up to `MAX_THREAD_MESSAGES`
(2,000) messages and `MAX_THREAD_ACTIVITIES` (500) activities **per token**. That
is the exact regression the comment above describes, reintroduced.

So the refresh is: **two point reads for the thread's scalars (row + session),
and one point read per event for the single row that event wrote.** Cost is
proportional to the committed batch, never to thread length.

This is not a judgment call you have to make at review time — it is pinned by an
existing test. `tests/read-model-bounds.test.ts:64-96` asserts _object identity_
of the retained messages after projecting one more, and its comment explains why
identity beats a stopwatch here:

```ts
  /**
   * The regression this guards is that projecting one message used to *clone*
   * the retained messages, so dispatch cost grew with thread length (17x at 4k).
   * … cloning is observable directly and exactly, as object identity. A
   * projector that copies cannot keep the references, and a projector that
   * keeps them cannot be copying — no timing, no flake …
   */
  it('does not copy the retained messages to project one more', () => {
```

A whole-window refresh fails that test. Keep it green.

### The two cross-aggregate writes you must not miss

Almost every projection write targets the event's own aggregate
(`decider.ts:772-778` sets `aggregateId` from `payload.threadId` or
`payload.projectId`, so `event.aggregateKind` / `event.aggregateId` is a reliable
key). There is exactly **one** exception, at
`projection-pipeline.ts:470-491`:

```ts
  private markProposedPlanImplemented(
    event: Extract<OrchestrationEvent, { type: 'thread.turn-start-requested' }>,
  ) {
    const source = event.payload.sourceProposedPlan
    if (!source) return
    …
    this.refreshActionableProposedPlan(source.threadId)
  }
```

`source.threadId` can be a **different thread** from the one running the turn, so
a `thread.turn-start-requested` batch touches up to two threads. Miss this and a
plan stays offered as "Implement" forever on the thread that proposed it. Step 4
adds the test that catches it.

The second thing that is not a point read: `thread.reverted` prunes messages,
activities, turns, checkpoints and proposed plans arbitrarily
(`projection-pipeline.ts:955-999`). For that one event type, re-hydrate the
thread's streams from SQL wholesale. It happens once per user-initiated revert.

### Two behaviours that change (deliberately), because SQL becomes authoritative

1. **Activity `sequence`.** The memory fold stamps `sequence: event.sequence`
   unconditionally (`projector.ts:495`); the SQL fold writes
   `event.payload.activity.sequence ?? event.sequence`
   (`projection-pipeline.ts:671`). Nothing in the repo currently sets
   `activity.sequence` on a command payload, so the two agree today. After this
   plan the SQL rule is the only rule. This is the intended direction.
2. **Activity ordering within one `createdAt`.** The memory fold keeps arrival
   order; SQL reads back ordered by `(createdAt, activityId)`
   (`snapshot-query.ts:219-222` + `takeBackwardsPage`). The incremental refresh
   preserves arrival order (it splices by id into the array it already holds), so
   this is unchanged from today. Do **not** "fix" it.

### Conventions that apply here — quoted verbatim from `AGENTS.md`, which you have not read

- > This project is greenfield and not live: no releases, no external users, no
  > data anyone needs migrated.
- > No backward compatibility shims, no legacy aliases, no deprecation windows.
  > Update every call site in the same pass.
- > Delete obsolete tests instead of preserving old behavior.
- > Remove duplicate code aggressively.
- > Keep nesting depth to 3 or less.
- > Use guard clauses and early returns. Keep the happy path shallow.
- > In loops, use inverted conditions with `continue` instead of wrapping the
  > body in `if`.
- > Do not use `else` after an early return.
- > Never use nested ternaries. Split the logic into `if` statements or a named
  > helper.
- > Never throw `new Error`. Create errors with `createError` from `evlog` — in
  > practice through the feature's `structured-errors.ts` wrapper. _(You should
  > not need to throw anything at all in this plan.)_
- > Logging is wide-event style (evlog). Always prefer wide logs: enrich the one
  > event per operation/request with more fields instead of emitting extra narrow
  > log lines. _(This plan adds **no** log lines — see Maintenance notes.)_
- > Do not repeat the folder name in file or symbol names.
- > Treat readonly/mutable mismatches as contract bugs first. Do not copy
  > containers just to satisfy TypeScript.
- > Tests run on Vitest. Apps run under Bun: `bun --bun vitest`.
- > A dev server is always running. Never spin up your own server to test or
  > verify changes — reuse the running one. _(This plan needs no browser
  > verification at all.)_

**Which testing rules apply.** The `AGENTS.md` rules about
`apps/web/test/fixtures.ts` and `renderWithProviders` are **web-app rules and do
not apply here**. `apps/server` tests import `describe`, `expect`, `it` straight
from `vitest` and build state through `tests/factories/projection.ts`. Follow the
neighbouring files. The rule that _does_ apply, and hard:

- > Do not `mock.module` or `vi.mock` our server, client, or feature modules.
- > Build real state.
- > Put shared builders in `test/factories/`. Do not redefine per-file factories.

## Commands you will need

All from the repo root `/Users/shaul/Desktop/D/platform`.

| Purpose                            | Command                                                                                                 | Expected on success                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Server typecheck                   | `bun run --filter 'server' typecheck`                                                                   | exit 0, no errors                                     |
| Server lint                        | `bun run --filter 'server' lint`                                                                        | exit 0                                                |
| **Orchestration suite (the gate)** | `cd apps/server && FS_METADATA_DB=:memory: bun --bun vitest run src/orchestration`                      | `Test Files 21 passed (21)`, `Tests 207 passed (207)` |
| One test file                      | `cd apps/server && FS_METADATA_DB=:memory: bun --bun vitest run src/orchestration/tests/<name>.test.ts` | all pass                                              |
| Format the touched files           | `./node_modules/.bin/oxfmt --write <paths…>`                                                            | exit 0                                                |
| Confirm formatting                 | `./node_modules/.bin/oxfmt --check <paths…>`                                                            | `All matched files use the correct format.`           |
| Whole-repo typecheck               | `bun run typecheck`                                                                                     | exit 0; 7 workspaces each report `Done`               |
| Whole-repo lint                    | `bun run lint`                                                                                          | exit 0                                                |

**`FS_METADATA_DB=:memory:` is mandatory** on every server test command in this
plan. Without it, `apps/server`'s suite opens, migrates and WAL-locks the
developer's real `~/.platform/fs-metadata.sqlite` — that is the defect
`plans/013-test-baseline-repairs.md` fixes, and it is not yours to fix here. With
the env var set, the whole `src/orchestration` directory runs clean in ~13s.

**Baselines measured at `ace313f`** (record these before you touch anything;
Step 0 has you re-measure):

| Suite                                    | Files | Tests |
| ---------------------------------------- | ----- | ----- |
| `src/orchestration` (all)                | 21    | 207   |
| `tests/projection-convergence.test.ts`   | 1     | 25    |
| `tests/read-model-bounds.test.ts`        | 1     | 4     |
| `tests/pending-request-counters.test.ts` | 1     | 5     |
| `tests/proposed-plan-projection.test.ts` | 1     | 4     |
| `tests/checkpoint-projection.test.ts`    | 1     | 7     |
| `tests/engine.test.ts`                   | 1     | 28    |

This plan **adds one test** and deletes none, so the target after Step 6 is
`21 files / 208 tests`.

## Suggested executor toolkit

- Invoke the **`never-nester`** skill if available
  (`/Users/shaul/.agents/skills/never-nester/SKILL.md`) before Step 1 — the
  refresh dispatcher is a flat chain of guard clauses, not a nested switch.
- Read `apps/server/src/orchestration/shell-row-reader.ts` first (172 lines). It
  is the pattern you are copying at a different granularity: a reader that
  answers about **one** aggregate with point reads instead of paying for a full
  snapshot, with a doc comment explaining exactly why.

## Scope

**In scope** (the only files you may modify or delete):

- `apps/server/src/orchestration/snapshot-query.ts` — gains `refreshReadModel`
  and its private helpers.
- `apps/server/src/orchestration/engine.ts` — two call sites + one import.
- `apps/server/src/orchestration/read-model.ts` — delete three helpers.
- `apps/server/src/orchestration/projector.ts` — **delete the file.**
- `apps/server/src/orchestration/tests/factories/projection.ts` — add
  `applyIncrementally` and `threadCreatedEvent`; fix `pendingEvent`'s
  `aggregateId`; delete `withSequences`.
- `apps/server/src/orchestration/tests/projection-convergence.test.ts` — renamed
  to `tests/projection-cache-coherence.test.ts` and re-pointed.
- `apps/server/src/orchestration/tests/read-model-bounds.test.ts`
- `apps/server/src/orchestration/tests/pending-request-counters.test.ts`
- `apps/server/src/orchestration/tests/proposed-plan-projection.test.ts`
- `apps/server/src/orchestration/tests/checkpoint-projection.test.ts`
- `apps/server/src/orchestration/tests/engine.test.ts` — one test rewritten.
- `plans/README.md` — status row only.

**Out of scope** (do NOT touch, even though they look related):

- `apps/server/src/orchestration/projection-pipeline.ts` — the surviving fold.
  Not one line. If a test only passes after you edit it, the two folds genuinely
  disagreed on that case and a human has to choose; see STOP conditions.
- `apps/web/src/features/chat/state/chat-projection-writers.ts` — the _client_
  side projection. It is a third fold, it is real, and it is
  `plans/037-normalize-chat-thread.md`'s job. Touching it here doubles the blast
  radius of a server refactor.
- `hasOpenBlockingRequest` in `command-invariants.ts:244-248` — it folds
  `thread.activities` although the thread already carries
  `pendingApprovalCount` / `pendingUserInputCount`. Real finding, owned by
  `plans/020-pending-request-counter-single-fold.md`. Changing it here would
  collide with that plan.
- Dropping `messages` / `activities` from `OrchestrationProjectedThread`
  entirely. That is the deeper structural win (see Maintenance notes) and it
  rewrites three reactors. Not this plan.
- The unused `requireThread` export in `read-model.ts:61-66` (only
  `requireThreadNotDeleted` in `command-invariants.ts` is live). Dead-surface
  removal belongs to `plans/022-delete-unreachable-code.md`.
- Adding a `default: never` exhaustiveness arm to the surviving switch.
  `plans/028` explicitly defers this; it is a good follow-up, not this plan.
- The plan-flag ordering "third divergence" the audit speculated about
  (`projection-pipeline.ts:531` newest-plan-wins vs `projector.ts:191-197`
  event's-own-plan-wins). **Do not chase it.** Adversarial verification found no
  code path that produces an out-of-order `updatedAt`, and it is moot the moment
  `projector.ts` is gone. It is already recorded as rejected in
  `plans/README.md`.
- `apps/server/src/orchestration/tests/factories/thread-search.ts`. Its
  `forThread(threadId, event)` helper re-stamps `aggregateId` because today's
  `pendingEvent` pins every thread event to `THREAD_ID`. After Step 4c that
  helper is a redundant no-op and its doc comment is stale — **leave both
  alone.** It still parses through `threadIdSchema`, it costs nothing, and
  deleting it drags a fifth test file into a refactor that does not need it.
- `apps/server/src/orchestration/streams.ts`. It is the other `appendBounded`
  consumer and it publishes the same events; nothing here changes its contract.
- Prose comments in out-of-scope files that mention "the in-memory projector":
  `pending-requests.ts:3`, `command-invariants.ts:72`, `decider.ts:625`,
  `projection-pipeline.ts:527`, `tests/projection-latest-turn.test.ts:62`,
  `tests/thread-detail-pagination.test.ts:23`. They go stale when `projector.ts`
  dies. **Do not fix them here** — six files of comment churn buries the diff.
  List them in your final report instead; see Maintenance notes.
- Anything under `packages/editor-*` — symlinks to a sibling checkout.

## Git workflow

**All work happens on `main`** — no new branches, worktrees, commits, pushes, or
PRs unless the operator explicitly asks. If you are asked to commit, use
conventional commits with a lowercase descriptive subject. Real examples from
`git log`:

```
refactor(orchestration): the server prepares a session's worktree (M-C)
fix(address): bound the URL, and stop escaping slashes in ?tabs=
```

A fitting subject: `refactor(orchestration): the read model becomes a cache of the SQL projection`

Use `git mv` for the test-file rename in Step 5 so history follows.

## Steps

### Step 0: Preconditions and baseline

Run, from the repo root:

```bash
git diff --stat ace313f..HEAD -- apps/server/src/orchestration/
git grep -c "ORCHESTRATION_EVENT_PAYLOADS" -- packages/contracts/src/orchestration-events.ts
cd apps/server && FS_METADATA_DB=:memory: bun --bun vitest run src/orchestration
```

**Verify all three:**

1. The `git diff --stat` prints **nothing**.
2. The `git grep -c` prints a count ≥ 1. If it prints nothing / exits 1,
   `plans/028-orchestration-event-catalog-derived.md` has **not** landed — this
   plan declares a hard dependency on it. **STOP and report**; the operator
   decides whether to run 028 first or waive it.

   **Expect this check to fail as written.** At `ace313f` the symbol does not
   exist yet and 028 is `TODO` in `plans/README.md`, so an executor starting
   from a clean tree will halt here. Give the operator this fact when you
   report: **no step of this plan reads, writes or imports the event catalog** —
   the dependency is a sequencing preference (028 would make the surviving
   switch exhaustive first), not a compile-time or behavioural one. Waiving it
   costs nothing mechanical; the only consequence is that the `default: never`
   arm 028 enables still will not exist when this lands.

3. The suite reports `Test Files 21 passed (21)` and `Tests 207 passed (207)`.

Also confirm `git status --short` lists **no** file under `apps/server/`. At
`ace313f` the working tree already has unrelated in-flight edits under
`apps/web/src/features/settings/`, `packages/contracts/src/settings/` and
`plans/`. Leave every one of them exactly as you found it.

---

### Step 1: Add the incremental refresh to `snapshot-query.ts`

Purely additive — nothing calls it yet, so the tree stays green.

**1a.** Extend two existing imports at the top of
`apps/server/src/orchestration/snapshot-query.ts`.

Add `type OrchestrationEvent` to the `'./schemas'` import list (it is already
exported there; keep the list's existing ordering style):

```ts
  type OrchestrationEvent,
```

Add `appendBounded` to the `'./read-model'` import (lines 53-60), so it reads:

```ts
import {
  appendBounded,
  boundCheckpoints,
  createEmptyReadModel,
  MAX_THREAD_ACTIVITIES,
  MAX_THREAD_MESSAGES,
  type OrchestrationProjectedCheckpoint,
  type OrchestrationProjectedThread,
  type OrchestrationReadModel,
} from './read-model'
```

(`OrchestrationProjectedThread` is new to this import too — the helpers below
need the type.)

**1b.** Add the public method to the `OrchestrationSnapshotQuery` class,
immediately after `fullReadModel()` (i.e. after line 100), and the private
helpers after `threadCheckpointIndex()` (after line 272). Exact shape:

```ts
  /**
   * Refreshes the engine's in-memory model from the rows the committed batch
   * just wrote. This folds nothing: `projection-pipeline.ts` has already applied
   * `events` inside the command transaction, so the model is a *cache* of that
   * projection and every projection rule lives in exactly one place.
   *
   * Cost is the batch, never the thread. A thread's scalars and session are two
   * point reads; a message or activity event re-reads only the single row it
   * wrote and splices it into the array the model already holds.
   * `tests/read-model-bounds.test.ts` pins that as object identity — a refresh
   * that rebuilt the retained rows would fail it and would put dispatch cost
   * back on a curve with thread length, which is the regression that killed the
   * old per-event clone.
   */
  refreshReadModel(model: OrchestrationReadModel, events: OrchestrationEvent[]) {
    for (const projectId of touchedProjectIds(events)) {
      this.refreshProject(model, projectId)
    }
    // Scalars first: a `thread.created` in this batch has to land in the map
    // before the message that shares the batch can splice into it. Order is
    // otherwise irrelevant — every row the batch wrote is already final.
    for (const threadId of touchedThreadIds(events)) {
      this.hydrateThread(model, threadId, model.threads.get(threadId))
    }
    for (const event of events) {
      model.sequence = Math.max(model.sequence, event.sequence)
      this.refreshThreadStreams(model, event)
    }

    return model
  }
```

```ts
  private refreshProject(model: OrchestrationReadModel, projectId: string) {
    const row = this.database
      .select()
      .from(projectionProjects)
      .where(eq(projectionProjects.projectId, projectId))
      .get()
    if (!row) return

    model.projects.set(projectId, projectFromRow(row))
  }

  /**
   * `held` is the thread the model already carries, or undefined to re-read its
   * streams from SQL as well. Passing it is what keeps a refresh O(1) in thread
   * length: the retained messages, activities and checkpoints are rows this
   * model already read and nothing in this batch invalidated wholesale.
   */
  private hydrateThread(
    model: OrchestrationReadModel,
    threadId: string,
    held: OrchestrationProjectedThread | undefined,
  ) {
    const row = this.database
      .select()
      .from(projectionThreads)
      .where(eq(projectionThreads.threadId, threadId))
      .get()
    if (!row) return

    const thread = threadFromRow(row, [], [], this.threadSession(threadId))
    model.threads.set(threadId, {
      ...thread,
      activities: held?.activities ?? this.recentThreadActivities(threadId).map(activityFromRow),
      checkpointByTurnId:
        held?.checkpointByTurnId ?? boundCheckpoints(this.threadCheckpointIndex(threadId)),
      hasActionableProposedPlan: row.hasActionableProposedPlan,
      latestUserMessageAt: row.latestUserMessageAt,
      messages: held?.messages ?? this.recentThreadMessages(threadId).map(messageFromRow),
      pendingApprovalCount: row.pendingApprovalCount,
      pendingUserInputCount: row.pendingUserInputCount,
    })
  }

  private refreshThreadStreams(model: OrchestrationReadModel, event: OrchestrationEvent) {
    if (event.type === 'thread.message-sent') {
      this.refreshMessage(model, event.payload.threadId, event.payload.messageId)
      return
    }
    if (event.type === 'thread.activity-appended') {
      this.refreshActivity(model, event.payload.threadId, event.payload.activity.id)
      return
    }
    if (event.type === 'thread.turn-diff-completed') {
      this.refreshCheckpoint(model, event.payload.threadId, event.payload.turnId)
      return
    }
    // A revert prunes messages, activities, turns, checkpoints and plans at
    // once, so the held streams are the one thing a point read cannot repair.
    if (event.type !== 'thread.reverted') return

    this.hydrateThread(model, event.payload.threadId, undefined)
  }

  private refreshMessage(model: OrchestrationReadModel, threadId: string, messageId: string) {
    const thread = model.threads.get(threadId)
    if (!thread) return

    const row = this.database
      .select()
      .from(projectionThreadMessages)
      .where(eq(projectionThreadMessages.messageId, messageId))
      .get()
    if (!row) return

    upsertById(thread.messages, messageFromRow(row), MAX_THREAD_MESSAGES)
  }

  private refreshActivity(model: OrchestrationReadModel, threadId: string, activityId: string) {
    const thread = model.threads.get(threadId)
    if (!thread) return

    const row = this.database
      .select()
      .from(projectionThreadActivities)
      .where(eq(projectionThreadActivities.activityId, activityId))
      .get()
    if (!row) return

    upsertById(thread.activities, activityFromRow(row), MAX_THREAD_ACTIVITIES)
  }

  /**
   * The row, not the event: a mid-turn placeholder that arrives after a real
   * capture is refused by the projection's upsert, so re-reading the row is how
   * that rule reaches the cache without being written down a second time.
   */
  private refreshCheckpoint(model: OrchestrationReadModel, threadId: string, turnId: string) {
    const thread = model.threads.get(threadId)
    if (!thread) return

    const row = this.database
      .select()
      .from(projectionThreadCheckpoints)
      .where(
        and(
          eq(projectionThreadCheckpoints.threadId, threadId),
          eq(projectionThreadCheckpoints.turnId, turnId),
        ),
      )
      .get()
    if (!row) return

    model.threads.set(threadId, {
      ...thread,
      checkpointByTurnId: boundCheckpoints({
        ...thread.checkpointByTurnId,
        [turnId]: projectedCheckpointFromRow(row),
      }),
    })
  }
```

And these module-level functions, next to the other module-level helpers at the
bottom of the file:

```ts
function touchedProjectIds(events: OrchestrationEvent[]) {
  const ids = new Set<string>()

  for (const event of events) {
    if (event.aggregateKind !== 'project') continue

    ids.add(event.aggregateId)
  }

  return ids
}

/**
 * The event's own aggregate, plus one exception: starting a turn from a proposed
 * plan clears that plan's actionable flag on the thread that *proposed* it,
 * which is not always the thread running the turn
 * (`projection-pipeline.ts:markProposedPlanImplemented`).
 */
function touchedThreadIds(events: OrchestrationEvent[]) {
  const ids = new Set<string>()

  for (const event of events) {
    if (event.aggregateKind === 'thread') ids.add(event.aggregateId)
    if (event.type !== 'thread.turn-start-requested') continue

    const source = event.payload.sourceProposedPlan
    if (!source) continue

    ids.add(source.threadId)
  }

  return ids
}

/** Corrects the entry the row already has, else appends it within the cap. */
function upsertById<Row extends { id: string }>(rows: Row[], row: Row, max: number) {
  const index = rows.findLastIndex((held) => held.id === row.id)
  if (index < 0) {
    appendBounded(rows, row, max)
    return
  }

  rows[index] = row
}
```

`and` is already imported from `drizzle-orm` at line 1;
`projectionThreadCheckpoints`, `projectionThreadMessages`,
`projectionThreadActivities`, `projectionThreads` and `projectionProjects` are
already imported from `../db/schema` at lines 35-51. Add nothing else.

**Verify**:

```bash
bun run --filter 'server' typecheck
cd apps/server && FS_METADATA_DB=:memory: bun --bun vitest run src/orchestration
```

→ typecheck exits 0; suite still `21 files / 207 tests`, all passing (nothing
calls the new method yet).

---

### Step 2: Prove the refresh reproduces the fold, using the convergence suite as the oracle

Do **not** delete anything yet. Re-point the existing convergence suite's
`memory` side at the new refresh and confirm all 25 tests still pass. That is the
equivalence proof for the whole plan.

**2a.** In `apps/server/src/orchestration/tests/factories/projection.ts`, add
this exported helper (keep `withSequences` for now — Step 4 removes it):

```ts
/**
 * Drives the pipeline and the read-model cache exactly as the engine does: one
 * committed batch at a time, SQL first, then the cache refresh over the same
 * events. Tests that assert on the in-memory model must go through this and not
 * through a hand-rolled loop, or they stop testing the path production runs.
 */
export function applyIncrementally(
  fixture: ReturnType<typeof createProjectionFixture>,
  events: PendingOrchestrationEvent[],
): OrchestrationReadModel {
  let model = createEmptyReadModel()

  for (const pending of events) {
    const batch = fixture.append([pending])
    fixture.pipeline.applyEvents(batch)
    model = fixture.snapshots.refreshReadModel(model, batch)
  }

  return model
}
```

It returns the model and nothing else — no caller in this plan needs the
sequenced events back, and an unused `appended` field would be dead surface.

It needs `import { createEmptyReadModel, type OrchestrationReadModel } from
'../../read-model'` added to the file's imports.

**2b.** In `apps/server/src/orchestration/tests/projection-convergence.test.ts`,
change only the two helpers that build the `memory` side.

`project()` at lines 474-490 becomes:

```ts
function project(events: PendingOrchestrationEvent[]) {
  const fixture = createProjectionFixture()
  fixtures.push(fixture)

  const model = applyIncrementally(fixture, events)
  // The production reader, not a hand-read column: a projected field only counts
  // once the delta a rail row actually receives carries it.
  const reader = createShellRowReader(fixture.snapshots, fixture.database)
  reader.beginWindow()

  return {
    memory: projectedThread(model),
    shell: reader.threadShell(THREAD_ID),
    sqlThread: projectedThread(fixture.snapshots.fullReadModel()),
  }
}
```

`projectProject()` at lines 459-472 becomes:

```ts
function projectProject(events: PendingOrchestrationEvent[]) {
  const fixture = createProjectionFixture()
  fixtures.push(fixture)

  const model = applyIncrementally(fixture, events)
  const reader = createShellRowReader(fixture.snapshots, fixture.database)
  reader.beginWindow()

  return {
    memory: model.projects.get(PROJECT_ID),
    shell: reader.projectShell(PROJECT_ID),
  }
}
```

Then drop the now-unused `projectEvents` import (line 4) and add
`applyIncrementally` to the `'./factories/projection'` import list. The
`fixture.append` / `fixture.pipeline.applyEvents` pair inside the crash test at
lines 384-401 stays exactly as it is — that test is about the SQL cursor, not the
cache.

**Verify**:

```bash
cd apps/server && FS_METADATA_DB=:memory: bun --bun vitest run src/orchestration/tests/projection-convergence.test.ts
```

→ `Test Files 1 passed (1)`, `Tests 25 passed (25)`.

(25, not 17 — three of the blocks are `it.each` at lines 37, 59 and 336.)

**This is the load-bearing gate of the plan.** All 25 tests compare the
incrementally-refreshed cache against the SQL projection, case by case: session
settling, streamed-draft merging, attachment backfill, activity revision and
position, plan-progress refolding, revert pruning, project script patching. If
any fails, the refresh does not reproduce the fold — fix the refresh, and do not
touch `projection-pipeline.ts`. See STOP conditions.

**2c. Calibrate the gate before you trust it.** A suite that would pass against
a broken refresh proves nothing. Temporarily make `refreshReadModel` return
`model` untouched (delete the three loop bodies, keep the signature), re-run the
command above, and confirm it **fails** with many failures — not zero, and not
one. Then restore the real body and re-run to green. Record both numbers; if the
stubbed run passes, the `memory` side is not actually being read and Step 2b was
mis-applied.

---

### Step 3: Switch the engine to the refresh

In `apps/server/src/orchestration/engine.ts`:

**3a.** Delete line 37: `import { projectEvents } from './projector'`.

**3b.** In `commitNewCommand` (line 223), replace:

```ts
this.readModel = projectEvents(committed.events, this.readModel)
```

with:

```ts
this.readModel = this.snapshotQuery.refreshReadModel(this.readModel, committed.events)
```

**3c.** Rewrite `reconcileReadModel` (lines 256-279). The body changes; the
`try`/`catch`, the returned field names and the `publishCommitted` call all stay
identical. The new doc comment and the `catchUp()` line are both required:

```ts
  /**
   * Re-derives the command read model from durable truth. Without this a
   * dispatch that threw after its events were durable leaves the engine deciding
   * later commands against a read model that is missing them.
   *
   * The catch-up comes first and is not optional: the model is a cache of the
   * projection rows, so an event the projection has not applied is an event the
   * refresh cannot see. `catchUp()` is a no-op when the cursor is already
   * current, which is the overwhelmingly common case — the commit transaction
   * projects before it returns.
   */
  private reconcileReadModel() {
    try {
      this.projectionPipeline.catchUp()
      const events = this.eventStore.readAfter({ afterSequence: this.readModel.sequence })
      if (events.length === 0) return { reconciledEventCount: 0 }

      this.readModel = this.snapshotQuery.refreshReadModel(this.readModel, events)
      const published = this.publishCommitted(events)

      return {
        reconciledEventCount: events.length,
        reconciledSequence: this.readModel.sequence,
        reconcileReactorFailures: published.failures,
      }
    } catch (error) {
      // Reconcile is best-effort: the dispatch failure it is annotating is the
      // error the caller has to see, so this one rides along as a field.
      return { reconcileError: errorMessage(error), reconciledEventCount: 0 }
    }
  }
```

Note the order: `catchUp()` makes SQL current, then `readAfter(model.sequence)`
picks up **everything** the model has not seen — which is a superset of what
`catchUp` applied, and covers the case where the commit transaction succeeded but
something after it threw (cursor ahead of the model).

`this.projectionPipeline` is already a field, built in the constructor at line 87. Do not construct a second one.

**Verify**:

```bash
bun run --filter 'server' typecheck
cd apps/server && FS_METADATA_DB=:memory: bun --bun vitest run src/orchestration
```

→ typecheck exits 0; `21 files / 207 tests`, all passing. `projector.ts` is now
referenced only by tests.

Specifically confirm `engine.test.ts`'s
`reconciles the read model from the event log after a failed dispatch` passes —
that is the test the `catchUp()` line exists for.

---

### Step 4: Delete `projector.ts`, its dead helpers, and every test import of it

**4a.** Delete the file:

```bash
git rm apps/server/src/orchestration/projector.ts
```

**4b.** In `apps/server/src/orchestration/read-model.ts`, delete
`setThreadSession` (68-77), `setLatestTurnState` (79-97) and `settleRunningTurn`
(99-107), together with the blank lines between them.

Then delete exactly two names from the `@workspace/contracts` type import at the
top of the file: **`OrchestrationLatestTurn`** (line 4; its only use was
`setLatestTurnState`'s `state` parameter at line 81) and **`OrchestrationSession`**
(line 6; its only use was `setThreadSession`'s `session` parameter at line 70).
**Keep** `MessageId` (used at :24), `OrchestrationSessionStatus` (:116),
`OrchestrationThreadShell` (:157), `OrchestrationProject`, `OrchestrationThread`,
`TurnId`. Everything else in the file stays.

**4c.** `apps/server/src/orchestration/tests/factories/projection.ts`:

- Delete `withSequences` **and its doc comment** (lines 52-58) — after 4d-4g
  nothing imports it.
- Delete the now-unused `import * as v from 'valibot'` (line 3) and the **whole**
  `'../../schemas'` import (line 9) — `withSequences` was the only consumer of
  both `orchestrationEventSchema` and `type OrchestrationEvent` in this file.
- Fix `pendingEvent`'s aggregate so a second thread can be expressed. Replace
  lines **37-38** (the `aggregateId:` / `aggregateKind:` pair that keys off
  `type.startsWith('project.')`) with a payload-derived pair, mirroring
  `decider.ts:772-778`:

```ts
export function pendingEvent(
  type: PendingOrchestrationEvent['type'],
  payload: unknown,
  occurredAt = '2026-05-24T00:00:00.000Z',
) {
  const pending = {
    actorKind: 'client',
    // The aggregate follows the payload, exactly as the decider does it, so a
    // fixture can name a thread other than the default one.
    ...aggregate(payload),
    causationEventId: null,
    …
  }

  return pending as PendingOrchestrationEvent
}

function aggregate(payload: unknown) {
  const record = payload as { projectId?: string; threadId?: string }
  if (record.threadId) return { aggregateId: record.threadId, aggregateKind: 'thread' } as const

  return { aggregateId: record.projectId ?? PROJECT_ID, aggregateKind: 'project' } as const
}
```

This is behaviour-preserving for every existing caller: audited at `ace313f`,
every payload passed to `pendingEvent` anywhere under
`apps/server/src/orchestration/tests/` carries a `threadId` (thread events) or
a `projectId` and no `threadId` (`project.created`, `project.meta-updated`),
so the derived pair equals the old `type.startsWith('project.')` pair in all
of them. If your typecheck or the suite says otherwise, a payload gained a
shape this helper does not cover — report it, do not special-case it.

- Add a factory for a second thread, next to `threadBootstrapEvents`:

```ts
export function threadCreatedEvent(threadId: string, createdAt = '2026-05-24T00:00:00.000Z') {
  return pendingEvent(
    'thread.created',
    {
      branch: null,
      createdAt,
      interactionMode: 'default',
      modelSelection: { model: 'gpt-5-codex', providerInstanceId: 'codex' },
      projectId: PROJECT_ID,
      runtimeMode: 'full-access',
      threadId,
      title: 'Projection',
      updatedAt: createdAt,
      worktreePath: null,
    },
    createdAt,
  )
}
```

Rewrite `threadBootstrapEvents` to build its thread through
`threadCreatedEvent(THREAD_ID, createdAt)` so there is one definition, not two.

**4d.** `tests/read-model-bounds.test.ts` — rewrite to drive the cache through
the fixture. Every test keeps its intent; only the driver changes.

- Delete the `projectEvents` import (line 3) and the `withSequences` name from
  the factory import (line 15); add `applyIncrementally` to that same list.
  `createProjectionFixture`, `OrchestrationReadModel` and
  `OrchestrationProjectedThread` are already imported — add nothing else, and in
  particular do **not** import `createEmptyReadModel`: `applyIncrementally`
  makes the empty model itself, and an unused import fails `oxlint`.
- Every test that now builds a fixture must `fixtures.push(fixture)` right after
  `createProjectionFixture()`, like test 4 already does — the file's `afterEach`
  closes that array and a leaked `bun:sqlite` handle per test is how this file
  starts flaking.
- `projectMessages(model, offset, count)` (currently at line 129) becomes a
  helper that appends, applies and refreshes **one message at a time** through a
  fixture (this is what makes the identity assertion meaningful). **Its return
  type changes** from `{ averageMs, model }` to the model itself, so every call
  site's `.model` access goes away: `filled.model` → `filled`, `after.model` →
  `after`. Nothing reads `averageMs`; drop it and the `performance.now()` calls
  with it.

```ts
function projectMessages(
  fixture: ReturnType<typeof createProjectionFixture>,
  model: OrchestrationReadModel,
  offset: number,
  count: number,
) {
  let next = model

  for (let index = 0; index < count; index += 1) {
    const batch = fixture.append([
      messageSentEvent({ messageId: `message-${offset + index}`, streaming: false, text: 'hi' }),
    ])
    fixture.pipeline.applyEvents(batch)
    next = fixture.snapshots.refreshReadModel(next, batch)
  }

  return next
}
```

- Test 1, `keeps only the newest messages and activities`: bootstrap through
  `applyIncrementally`, then drive `MAX_THREAD_MESSAGES + 500` messages through
  `projectMessages`, and `MAX_THREAD_ACTIVITIES + 100` activities through the
  same one-event-per-batch shape (`fixture.append([activityAppendedEvent({ id:
\`event-activity-${index}\` })])`→`fixture.pipeline.applyEvents(batch)`→`model = fixture.snapshots.refreshReadModel(model, batch)`). Keep all four
assertions verbatim, including the two `.at(-1)?.id`ones — they hold because`upsertById`appends in arrival order and`appendBounded` trims from the
  front.

  Do **not** try to shortcut this into one giant batch. Per-event is the shape
  production runs, and the runtime is already proven: test 4 in this same file
  drives `MAX_THREAD_MESSAGES + 50` events through exactly this loop today and
  the whole file runs in well under a second.

- Test 2, rename to `refreshes the caller model in place instead of rebuilding it`.
  Keep both assertions verbatim: `expect(next).toBe(model)` and
  `expect(projectedThread(next).messages).toBe(messages)`. `refreshReadModel`
  returns the same model object and `hydrateThread` reuses the held array, so
  both hold.
- Test 3, `does not copy the retained messages to project one more`: keep the
  whole doc comment and all three `toBe` assertions verbatim. Only the driver
  changes. **This is the perf gate; if it fails, your refresh is re-reading
  windows.**
- Test 4, `hydrates only the newest rows when rebuilding the model from SQL`:
  unchanged — it already drives SQL only.

**4e.** `tests/pending-request-counters.test.ts` — in `project()` (lines
109-120) replace `memory: projectedThread(projectEvents(appended))` (line 117)
with the `applyIncrementally` model, and drop the `projectEvents` import
(line 3). Both
`expectCounts` assertions stay: they now pin incremental-cache against
cold-rebuild, which is the invariant worth keeping.

**4f.** `tests/proposed-plan-projection.test.ts` — `project()` (lines 83-89)
already returns the fixture; keep it, and change `memoryThread(fixture)` (lines
**98-104**) to read from `fixture.snapshots.fullReadModel()` instead of
`projectEvents(fixture.eventStore.readAfter(…))`. Drop the `projectEvents`
import (line 3).

**4g.** `tests/checkpoint-projection.test.ts` — same one-line change to
`memoryThread` (lines 180-186) plus dropping the `projectEvents` import (line 9).
The two tests that call it (lines 96 and 118) are unchanged.

**4h.** `tests/engine.test.ts` — the test at lines 211-224,
`projects replayed events into the same read model shape`, exists to assert that
a second derivation of the log agrees with the engine's. There is no second
derivation any more. Replace its body so it asserts the surviving property — a
cold rebuild from the projection rows matches the engine's live cache — and
rename it:

```ts
it('rebuilds the same read model from the projection rows', async () => {
  const fixture = createFixture()
  const engine = new OrchestrationEngine(fixture.database)

  await dispatchFirstThread(engine)
  const rebuilt = new OrchestrationSnapshotQuery(fixture.database).fullReadModel()
  const thread = rebuilt.threads.get('thread-1')

  expect(rebuilt.projects.get('project-1')?.title).toBe('Platform')
  expect(thread?.latestTurn?.turnId as string).toBe('turn-1')
  expect(thread?.messages[0]?.text).toBe('Build the first slice')
  expect(thread).toEqual(engine.readModelSnapshot().threads.get('thread-1'))
  fixture.close()
})
```

`OrchestrationSnapshotQuery` is already imported at line 27. Drop the
`projectEvents` import (line 25) and, if `createEmptyReadModel` (line 26) has no
other use in the file, drop that too — check with
`git grep -n createEmptyReadModel apps/server/src/orchestration/tests/engine.test.ts`
before deleting.

**Verify**:

```bash
git grep -nP "from '\.\.?/projector'|\bprojectEvents\b|\bwithSequences\b" -- apps/server/src
bun run --filter 'server' typecheck
cd apps/server && FS_METADATA_DB=:memory: bun --bun vitest run src/orchestration
```

→ the `git grep` prints **nothing** (exit 1 with no output is the success
signal). Typecheck exits 0. Suite reports `21 files / 207 tests`, all passing.

**The grep must be exactly this one.** A bare `git grep "projector"` can never
return empty in this repo and will send you chasing ghosts: the projection
cursor table has a column literally named `projector`
(`db/schema.ts:89`, `db/migrations.ts:270`, read at `projection-pipeline.ts:80`
and `snapshot-query.ts:279`), and six out-of-scope files carry the word in prose
comments. At `ace313f` the anchored grep above returns 27 hits across exactly
the nine in-scope files; after this step it returns zero.

---

### Step 5: Retire the convergence suite into a cache-coherence suite, and cover the cross-thread plan flag

**5a.** Rename the file so its name stops claiming something that no longer
exists:

```bash
git mv apps/server/src/orchestration/tests/projection-convergence.test.ts \
       apps/server/src/orchestration/tests/projection-cache-coherence.test.ts
```

Change the `describe` title (line 36) from `'orchestration projection
convergence'` to `'orchestration read-model cache coherence'`, and update the two
comments that talk about "both read models" (lines 209-211 and 492-496) to say
what is now true: the incremental cache is compared against a cold rebuild from
the same rows.

Three `it` titles also still claim two read models. Reword exactly these three,
leaving every other title untouched:

| Line | From                                                                                  | To                                                                                     |
| ---- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 223  | `leaves a revised activity where the first frame put it, in both read models`         | `leaves a revised activity where the first frame put it, in the cache and the rebuild` |
| 266  | `projects the plan step the thread is on, and both read models agree on it`           | `projects the plan step the thread is on, and the cache agrees with the rebuild`       |
| 402  | `carries project scripts through both read models, and lets an empty list clear them` | `carries project scripts into the cache, and lets an empty list clear them`            |

Titles are not asserted on anywhere; this is cosmetic and must not change any
assertion, body or count.

**Why this file is not deleted.** The audit called it "the tax the duplication
charges", and half of that is right — the _convergence between two hand-written
folds_ is gone. But after this plan its two sides are `refreshReadModel` applied
batch-by-batch versus `fullReadModel()` applied once, which are genuinely
different code paths over the same rows. That is not a tautology: activity
ordering, the `MAX_THREAD_*` caps interacting with splicing, revert
re-hydration and the cross-thread plan flag can all make them disagree. Deleting
25 passing tests of the surviving projection's rules to close a duplication
finding would be a net loss of coverage. Keep them; they are now much cheaper to
justify.

**5b.** Add the one new test this refactor needs — the cross-thread plan source.
It is the only place the refresh carries a hand-written rule (`touchedThreadIds`),
and nothing today covers it. Put it in the renamed file, after the existing
`project`-based tests:

```ts
/**
 * A plan can be proposed on one thread and implemented on another, and the
 * projection clears the actionable flag on the *proposing* thread. The cache
 * refresh has to know that a turn-start touches two threads; if it only ever
 * refreshed the event's own aggregate, the proposing thread would keep
 * offering "Implement" forever.
 */
it('clears the plan flag on the proposing thread when another thread implements it', () => {
  const fixture = createProjectionFixture()
  fixtures.push(fixture)
  const implementerId = 'thread-2'

  const model = applyIncrementally(fixture, [
    ...threadBootstrapEvents(),
    proposedPlanUpsertedEvent({ planId: 'plan-1', planMarkdown: '# Plan' }),
    threadCreatedEvent(implementerId),
    turnStartEventOnThread(implementerId, 'turn-1', requestedAt, {
      planId: 'plan-1',
      threadId: THREAD_ID,
    }),
  ])

  expect(model.threads.get(THREAD_ID)?.hasActionableProposedPlan).toBe(false)
  expect(model.threads.get(THREAD_ID)).toEqual(
    fixture.snapshots.fullReadModel().threads.get(THREAD_ID),
  )
})
```

The existing `turnStartEvent` factory hardcodes `THREAD_ID`, so add a
thread-parameterised sibling to `tests/factories/projection.ts` and define
`turnStartEvent` in terms of it:

```ts
export function turnStartEventOnThread(
  threadId: string,
  turnId: string,
  requestedAt: string,
  sourceProposedPlan?: { planId: string; threadId: string },
) {
  return pendingEvent(
    'thread.turn-start-requested',
    {
      createdAt: requestedAt,
      interactionMode: 'default',
      messageId: `message-user-${turnId}`,
      runtimeMode: 'full-access',
      sourceProposedPlan,
      threadId,
      turnId,
    },
    requestedAt,
  )
}

export function turnStartEvent(
  turnId: string,
  requestedAt: string,
  sourceProposedPlan?: { planId: string; threadId: string },
) {
  return turnStartEventOnThread(THREAD_ID, turnId, requestedAt, sourceProposedPlan)
}
```

**Sanity check on the new test**: before you trust it, temporarily delete the
`sourceProposedPlan` branch from `touchedThreadIds` and confirm the test
**fails**. Then restore it. A test that passes either way proves nothing.

**Verify**:

```bash
cd apps/server && FS_METADATA_DB=:memory: bun --bun vitest run src/orchestration/tests/projection-cache-coherence.test.ts
```

→ `Test Files 1 passed (1)`, `Tests 26 passed (26)`.

---

### Step 6: Format, lint, and gate the whole repo

```bash
./node_modules/.bin/oxfmt --write \
  apps/server/src/orchestration/snapshot-query.ts \
  apps/server/src/orchestration/engine.ts \
  apps/server/src/orchestration/read-model.ts \
  apps/server/src/orchestration/tests/factories/projection.ts \
  apps/server/src/orchestration/tests/projection-cache-coherence.test.ts \
  apps/server/src/orchestration/tests/read-model-bounds.test.ts \
  apps/server/src/orchestration/tests/pending-request-counters.test.ts \
  apps/server/src/orchestration/tests/proposed-plan-projection.test.ts \
  apps/server/src/orchestration/tests/checkpoint-projection.test.ts \
  apps/server/src/orchestration/tests/engine.test.ts
./node_modules/.bin/oxfmt --check apps/server/src/orchestration
bun run --filter 'server' lint
bun run typecheck
bun run lint
cd apps/server && FS_METADATA_DB=:memory: bun --bun vitest run src/orchestration
cd .. && git status --short
```

**Verify**:

- `oxfmt --check` prints `All matched files use the correct format.`
- both lint commands exit 0
- `bun run typecheck` exits 0 and prints `Done` for all seven workspaces
- the orchestration suite reports `Test Files 21 passed (21)` and
  `Tests 208 passed (208)` (207 baseline + the one new test)
- `git status --short` shows, under `apps/server/`, only the in-scope files —
  with `projector.ts` deleted and `projection-convergence.test.ts` renamed. Every
  pre-existing dirty file elsewhere in the tree is untouched.

Do **not** run the whole-repo `bun run test`: at `ace313f` `apps/server`'s suite
opens and WAL-locks the developer's real `~/.platform/fs-metadata.sqlite`. If
`plans/013-test-baseline-repairs.md` has landed, running it as an extra gate is
welcome and it must pass.

---

### Step 7: Update the index

In `plans/README.md`, set this plan's row (`| 036 | …`) `Status` to `DONE`.

While you are there, add a one-line note to plan 020's row or the dependency
notes: **020's second item — "the in-memory projector reruns the same fold on
every `thread.activity-appended` event" — no longer exists**, because the
in-memory projector no longer exists. 020's items 1 (the unfiltered SQL activity
scan) and 3 (`hasOpenBlockingRequest` refolding what the thread already carries)
are untouched by this plan and still stand.

## Test plan

**No new behaviour is introduced, so the suite is the gate rather than a pile of
new cases.** The existing 25-test convergence suite _is_ the equivalence proof
(Step 2 runs it against the new refresh before anything is deleted), and the
engine, thread-lifecycle, checkpoint-reactor and session-checkout-reactor suites
(28 + 28 + 7 + 5 tests, measured at `ace313f`) drive the real engine through the
real refresh.

**One new test**, in `tests/projection-cache-coherence.test.ts`:

1. `clears the plan flag on the proposing thread when another thread implements it`
   — the cross-thread `sourceProposedPlan` path. This is the single rule the
   refresh carries that the old fold carried too (`projector.ts:232-238`) and
   that no existing test covers, because the fixture could not express a second
   thread until Step 4c. Model it structurally on the neighbouring tests in the
   same file, and on `tests/proposed-plan-projection.test.ts`, which covers the
   same-thread case.

**Tests rewritten, not deleted** (drivers change; assertions and intent do not):
`read-model-bounds.test.ts` ×4, `pending-request-counters.test.ts` ×5,
`proposed-plan-projection.test.ts` ×4 (2 touched), `checkpoint-projection.test.ts`
×7 (2 touched), `projection-convergence.test.ts` ×25 (renamed).

**One test rewritten in intent**: `engine.test.ts`'s
`projects replayed events into the same read model shape` → `rebuilds the same
read model from the projection rows`. Its premise (two independent derivations of
the log) is exactly what this plan removes; the surviving property is cold
rebuild == live cache.

**Known coverage gap, stated on purpose.** `applyIncrementally` feeds
`refreshReadModel` **one event per batch**, which mirrors the streaming path but
never exercises the scalars-before-streams ordering inside `refreshReadModel`
(the comment "a `thread.created` in this batch has to land in the map before the
message that shares the batch can splice into it"). That ordering is covered only
indirectly, by the engine and thread-lifecycle suites dispatching real
multi-event commands. If those go red while the cache-coherence suite stays
green, look at the ordering first. Pinning it with a direct multi-event-batch
test is a good follow-up, not a blocker for this plan.

**The perf gate is a test, not a benchmark**:
`read-model-bounds.test.ts`'s `does not copy the retained messages to project one
more` asserts object identity of retained messages across a refresh. A refresh
that re-read the thread's window would produce fresh objects and fail. That is
deliberate — the file's own comment (lines 64-76) explains why this project
measures this particular regression with identity rather than a stopwatch.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `git grep -nP "from '\.\.?/projector'|\bprojectEvents\b|\bwithSequences\b" -- apps/server/src` returns **no matches** (bare `"projector"` would match the `projector` DB column and stale prose — do not substitute it)
- [ ] `apps/server/src/orchestration/projector.ts` does not exist
- [ ] `git grep -nwP "setThreadSession|setLatestTurnState|settleRunningTurn" -- apps` returns **no matches** (`-w` is required: without it this matches `settleRunningTurns` in the out-of-scope `projection-pipeline.ts`)
- [ ] `bun run --filter 'server' typecheck` exits 0
- [ ] `bun run typecheck` exits 0 for all seven workspaces
- [ ] `bun run --filter 'server' lint` exits 0 and `bun run lint` exits 0
- [ ] `./node_modules/.bin/oxfmt --check apps/server/src/orchestration` → `All matched files use the correct format.`
- [ ] `cd apps/server && FS_METADATA_DB=:memory: bun --bun vitest run src/orchestration` → `Test Files 21 passed (21)`, `Tests 208 passed (208)`
- [ ] `git diff --stat ace313f..HEAD -- apps/server/src/orchestration/projection-pipeline.ts` shows **no change** to the surviving fold
- [ ] Deleting the `sourceProposedPlan` branch from `touchedThreadIds` makes the new Step 5b test fail (and it was restored afterwards)
- [ ] `git status --short` lists no file outside the Scope list as modified by you
- [ ] `plans/README.md` row 036 updated to `DONE`, with the note about plan 020

## STOP conditions

Stop and report back (do not improvise) if:

- **`ORCHESTRATION_EVENT_PAYLOADS` is not in
  `packages/contracts/src/orchestration-events.ts`.** Plan 028 has not landed and
  this plan declares it as a hard dependency. The operator decides.
- **Any of the 25 convergence tests fails in Step 2.** That means the SQL
  projection and the old in-memory fold genuinely disagree on that case, and the
  test happened to encode the memory rule. **Do not edit
  `projection-pipeline.ts` to make it pass, and do not edit the test's expected
  value.** Report the test name, the SQL value and the memory value; a human
  picks the winner. (Two such disagreements are already documented in
  `projector.ts:416-427` and `:477-514`; a third is possible.)
- **The Step 2c calibration passes.** If a `refreshReadModel` stubbed to return
  `model` untouched still makes the convergence suite green, the suite is no
  longer reading the cache and Step 2b did not take — every later step would be
  verified by an instrument that is disconnected. Re-do 2b; do not proceed.
- **`read-model-bounds.test.ts`'s `does not copy the retained messages to project
one more` fails.** Your refresh is rebuilding whole windows instead of splicing
  single rows, which puts dispatch cost back on a curve with thread length under
  streaming. Fix the refresh; do not widen the test.
- **`engine.test.ts`'s `reconciles the read model from the event log after a
failed dispatch` fails.** The `projectionPipeline.catchUp()` line in Step 3c is
  missing, in the wrong place, or the `readAfter` boundary was changed. Do not
  delete the test — it pins the one path where the event log is ahead of the
  projection.
- **You find yourself writing a projection _rule_ in `snapshot-query.ts`** — a
  text merge, a turn-state settle, a `turnId` backfill, a placeholder-wins check,
  a pruning filter. The refresh must contain zero rules; every one of them
  already exists in `projection-pipeline.ts` and the refresh's job is to read
  what that produced. If a rule seems necessary, the corresponding row read is
  wrong.
- **You need to touch `projection-pipeline.ts`,
  `chat-projection-writers.ts`, `command-invariants.ts`, or any reactor.** All
  four are out of scope for stated reasons; needing one means the plan's model of
  the system is wrong.
- The whole-orchestration suite drops below 208 tests, or any file count other
  than 21 appears.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

For whoever owns this code next:

- **Adding an orchestration event is now a two-site edit**: the catalog row in
  `packages/contracts/src/orchestration-events.ts` (plan 028) and the case in
  `projection-pipeline.ts`. If the event writes a _message_, _activity_ or
  _checkpoint_ row, also add its arm to `refreshThreadStreams` in
  `snapshot-query.ts` — that dispatcher is the one place that knows which single
  row an event wrote. Everything else (scalars, session, counters, the plan flag)
  is picked up by the scalar refresh with no edit at all.
- **What a reviewer should scrutinise**, in order:
  1. `touchedThreadIds` — the `sourceProposedPlan` branch. It is the only
     hand-written knowledge of a cross-aggregate write left in the system. If
     `projection-pipeline.ts` ever grows a second one, this function must grow
     with it, and nothing will tell you. A `default: never` exhaustiveness arm on
     the surviving switch would help here; see plan 028's deferred item.
  2. `hydrateThread`'s `held?.x ?? <full re-read>` lines. The `??` is what makes
     the refresh O(batch); an eager re-read there is invisible in review and
     visible only as the identity test failing.
  3. That the refresh runs **after** `commitCommand` returns, not inside it. The
     rows must be committed before they are read back.
- **Deliberately deferred — the deeper win.** The real ceiling here is that
  `OrchestrationProjectedThread` should probably not carry `messages` and
  `activities` at all. Only three consumers use them:
  `checkpoint-reactor.ts:316` (newest assistant message for a turn),
  `provider-command-reactor.ts:528` (one message by id) and
  `command-invariants.ts:245` (a fold the row's counters already answer, which is
  plan 020's item 3). Each is a single indexed query away. With those gone the
  cache would be pure scalars, `MAX_THREAD_MESSAGES` / `MAX_THREAD_ACTIVITIES`
  and `read-model-bounds.test.ts` would disappear, and dispatch would stop
  touching thread-length-shaped data entirely. It is a separate plan because it
  rewrites two reactors and an invariant, and it is much easier to land _after_
  this one, when there is only one projection to reason about.
- **Deliberately not done — logging.** No new log events or fields. The wide
  events this path already emits (`chat.pipeline.command.decided` carries
  `eventTypes`, `chat.pipeline.command.complete` carries the batch summary,
  `chat.pipeline.projection.apply_event` names each projected event) describe the
  refresh completely, since the refresh is derived from exactly those events.
  `AGENTS.md` asks for wider events rather than more of them; there is nothing
  here the existing ones do not already say.
- **Knowingly left stale.** Six out-of-scope files still describe "the in-memory
  projector" in prose after it is gone: `pending-requests.ts:3`,
  `command-invariants.ts:72`, `decider.ts:625`, `projection-pipeline.ts:527`,
  `tests/projection-latest-turn.test.ts:62`,
  `tests/thread-detail-pagination.test.ts:23`. Kept out of this diff on purpose
  — `projection-pipeline.ts` is untouchable here and the rest is comment churn.
  A one-line follow-up, or fold it into `plans/022`.
- **Interaction with plan 037** (`normalize-chat-thread`). The web client has its
  own fold of this same event stream in
  `apps/web/src/features/chat/state/chat-projection-writers.ts`. This plan
  deliberately leaves it alone. When 037 lands, the question worth asking is
  whether the client can consume projected rows over the wire the way the engine
  now does, rather than folding events a third time — but that is a protocol
  change, not a refactor.
