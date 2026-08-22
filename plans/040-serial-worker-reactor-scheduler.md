# Plan 040: `SerialWorker` and one `ReactorScheduler`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first — informational, not a gate)**:
>
> ```
> git diff --stat ace313f..HEAD -- apps/server/src/orchestration apps/server/src/provider
> ```
>
> This output is **expected to be non-empty**: substantial sibling work landed after this
> plan was authored and moved these files around. Do not treat a non-empty diff
> as a STOP condition. What matters is that the _shapes_ quoted under "Current
> state" still exist. Confirm that by symbol, not by line number — every line
> number in this plan is from `ace313f` and most have shifted:
>
> ```
> grep -rn "settleAdapterRuntimeEvents\|streamEvents" apps/server/src
> grep -rn "DrainableProviderIntentWorker\|DrainableCheckpointWorker" apps/server/src
> grep -n "drain()" apps/server/src/orchestration/provider-runtime-ingestion.ts
> ```
>
> Verified at `b467b3f`: `settleAdapterRuntimeEvents` still exists (now
> `provider-service.ts:227` call / `:769` definition), `streamEvents` is still the
> SPI (`types.ts:498`) with the three adapter delegations and two test collectors,
> and `ProviderRuntimeIngestion.drain()` still returns the chain tail. STOP only
> if one of those constructs is **gone** — then the work is already done or was
> done differently, and this plan needs re-planning, not execution.

## CORRECTION — 2026-08-17, at `b467b3f` (read this if you read an earlier version)

This plan was authored at `ace313f`. Its **Done criteria were unsatisfiable** and
have been repaired. The engineering substance below is unchanged — only the gates
are different.

What was wrong:

1. **It required the `apps/server` suite to still be red.** The old baseline and
   Done criteria asserted `Tests 1 failed | 772 passed (773)`, with the failure
   being `src/tests/app.test.ts > fs rpc events > reports external file updates
from the native watcher`. **The watcher-classification fix resolved that bug** (commits `f93dd1d`,
   `1f8eb0d`). `apps/server` is now **fully green: 819 tests, 0 failures, 88
   files**. An executor could not satisfy the old criterion without breaking
   working code. Every mention of a "pre-existing failure" in `apps/server` is
   deleted: **any failure this plan sees is its own.**
2. **It hardcoded absolute test counts.** `773`, `778`, `391`, `396`, `397`, and
   file counts `37`/`38`/`81`/`82` were all measured at `ace313f`. Later sibling work
   changed every one of them. A plan cannot assert a count a sibling plan will
   move.

What changed:

- A new **Step 0** captures the baseline into `/tmp/040-*-before.txt` before
  anything is touched.
- Every absolute count is replaced by a **baseline delta**: no test that passed at
  Step 0 may fail at the end, and no new lint finding may appear. The focused
  suite (`src/orchestration src/provider`) must be fully green both before and
  after; the full suite is compared pass-set to pass-set.
- The counts this plan may still state are **its own additions**: the 5 cases in
  the new `serial-worker.test.ts` and the 1 case added to
  `provider-runtime-ingestion.test.ts` — 6 net new tests. That is a delta, not a
  total.
- Root `bun run verify` is **not** a gate anywhere. It runs the whole monorepo and
  short-circuits, so one unrelated failure elsewhere makes it unreachable and it
  proves nothing about this change. The per-workspace `typecheck` / `lint` /
  `format:check` / `test` scripts in `apps/server` are the gate.
- The drift check above is informational. It will be non-empty; that is fine.

---

## Status

- **Priority**: P3
- **Effort**: L
- **Risk**: MED
- **Depends on**: none
- **Category**: complexity (tech-debt)
- **Planned at**: commit `ace313f`, 2026-08-16
- **Criteria repaired at**: commit `b467b3f`, 2026-08-17 — see CORRECTION above.
  Line numbers throughout are still `ace313f`'s; locate code by symbol.

**What this closes**: five hand-rolled async work queues, each with its own
notion of "drained", plus a sixth idleness notion assembled by hand at two call
sites. This plan gives them one implementation and one owner. Step 8 folds in a
small, independent `BoundedTtlCache` hot-path cleanup in the same files.

---

## Why this matters

There is a `setTimeout(resolve, 0)` in the **production** `sendTurn` path
(`apps/server/src/provider/provider-service.ts:239`) with no comment saying what
it guarantees. It is not decoration: it exists because five different queues in
this pipeline each define "drained" differently, and one of them —
`ProviderRuntimeIngestion.drain()` — returns its promise-chain _tail at call
time_, so work enqueued a microtask later is genuinely never awaited. The sleep
buys enough real time for the adapter's runtime events to land in the ingestion
chain before anyone reads that tail. It is a timing guess standing in for an
ordering invariant, and neither the type system nor the logs can see it.

After this plan: one `SerialWorker<Task>` with one `enqueue`/`drain`/`isIdle`
contract backs all five queues; adapter runtime events are pushed into a
drainable worker **synchronously** at publish time instead of being buffered
inside an async-iterator nobody can inspect; a single `ReactorScheduler` owns
composite idleness so `OrchestrationEngine.providerRuntimeIdle()` is one call
that loops until _every_ registered source reports idle; and the sleep is
deleted because the ordering is now guaranteed by construction. Net effect: the
provider-runtime suites stop being timing-shaped, shutdown ordering stops being
a matter of reading comments, and one more reactor can be added without
re-deriving "is the pipeline idle?".

---

## Current state

Everything below was read at commit `ace313f`. Line numbers are exact.

### The five queues

**1. `DrainableProviderIntentWorker`** — array queue + `active` flag + `waiters` array.
`apps/server/src/orchestration/provider-command-reactor.ts:910-961`:

```ts
class DrainableProviderIntentWorker<Event> {
  private active = false
  private readonly handler: (event: Event) => Promise<void>
  private readonly queue: Event[] = []
  private readonly waiters: Array<() => void> = []

  constructor(handler: (event: Event) => Promise<void>) {
    this.handler = handler
  }

  enqueue(event: Event) {
    this.queue.push(event)
    void this.run()
  }

  isIdle() {
    return !this.active && this.queue.length === 0
  }

  drain() {
    if (this.isIdle()) return Promise.resolve()

    return new Promise<void>((resolve) => {
      this.waiters.push(resolve)
    })
  }

  private async run() {
    if (this.active) return

    this.active = true
    try {
      while (this.queue.length > 0) {
        const event = this.queue.shift() as Event
        await this.handler(event)
      }
    } finally {
      this.active = false
      this.resolveWaitersIfIdle()
      if (this.queue.length > 0) void this.run()
    }
  }

  private resolveWaitersIfIdle() {
    if (!this.isIdle()) return

    const waiters = this.waiters.splice(0)
    for (const waiter of waiters) {
      waiter()
    }
  }
}
```

**2. `DrainableCheckpointWorker`** — promise chain + `pending` counter + re-reading `while`.
`apps/server/src/orchestration/checkpoint-reactor.ts:349-376`:

```ts
/**
 * Captures run one at a time per process: two `git add --all` passes over the
 * same worktree race on the object store, and the turn count a capture claims
 * is read from the read model at the moment it runs.
 */
class DrainableCheckpointWorker {
  private readonly handler: (task: CheckpointTask) => Promise<void>
  private pending = 0
  private queue = Promise.resolve()

  constructor(handler: (task: CheckpointTask) => Promise<void>) {
    this.handler = handler
  }

  enqueue(task: CheckpointTask) {
    this.pending += 1
    const next = this.queue.then(() => this.handler(task)).finally(() => (this.pending -= 1))
    this.queue = next.then(noop, noop)
  }

  async drain() {
    // Re-read `queue` each pass: a capture dispatches, and a dispatch can enqueue
    // the next task behind the one being awaited.
    while (this.pending > 0) {
      await this.queue
    }
  }
}
```

**3. `SessionCheckoutReactor`** — per-thread `chains` Map + `pending` Set.
`apps/server/src/orchestration/session-checkout-reactor.ts:36-37, 65-88`:

```ts
  private readonly chains = new Map<ThreadId, Promise<void>>()
  private readonly pending = new Set<Promise<void>>()
...
  /** Test and shutdown hook: settle every in-flight read. */
  async drain() {
    while (this.pending.size > 0) {
      await Promise.all(Array.from(this.pending))
    }
  }

  /**
   * Serialized per thread, because `thread.created` and
   * `thread.turn-start-requested` arrive in the same batch: run concurrently,
   * the plain stamp reads the project root while the worktree is still being
   * made and records the root's branch — the very race one reactor was supposed
   * to remove. Chaining makes the second see the first's result.
   */
  private enqueue(threadId: ThreadId, requestWorktree: boolean) {
    const previous = this.chains.get(threadId) ?? Promise.resolve()
    const task = previous.then(() => this.establish(threadId, requestWorktree))
    this.chains.set(threadId, task)
    this.pending.add(task)
    void task.finally(() => {
      this.pending.delete(task)
      if (this.chains.get(threadId) === task) this.chains.delete(threadId)
    })
  }
```

**4. `ThreadDeletionReactor`** — `cleanups` Set + `cleaningThreads` dedupe Set.
`apps/server/src/orchestration/thread-deletion-reactor.ts:38-39, 71-91`:

```ts
  private readonly cleanups = new Set<Promise<void>>()
  private readonly cleaningThreads = new Set<ThreadId>()
...
  /** Test/shutdown hook: settle every in-flight stop. */
  async drain() {
    while (this.cleanups.size > 0) {
      await Promise.all(Array.from(this.cleanups))
    }
  }

  private enqueueCleanup(event: ThreadDeletedEvent) {
    const threadId = event.payload.threadId
    // A redelivered batch (or the same thread appearing twice in a cascade) must
    // not race a second stop against the binding the first one is releasing.
    if (this.cleaningThreads.has(threadId)) return

    this.cleaningThreads.add(threadId)
    let cleanup: Promise<void>
    cleanup = this.cleanupThread(event).finally(() => {
      this.cleaningThreads.delete(threadId)
      this.cleanups.delete(cleanup)
    })
    this.cleanups.add(cleanup)
  }
```

**5. `ProviderRuntimeIngestion`** — bare promise chain; `drain()` returns the tail.
`apps/server/src/orchestration/provider-runtime-ingestion.ts:53, 84-92`:

```ts
  private queue = Promise.resolve()
...
  ingest(event: ProviderRuntimeEvent) {
    const task = this.queue.then(() => this.processEvent(event))
    this.queue = task.then(noop, noop)
    return task
  }

  drain() {
    return this.queue
  }
```

`drain()` hands back whatever the chain tail was **at call time**. Anything
enqueued after that instant is not awaited. This is the hole the sleep papers over.

### The smoking gun

`apps/server/src/provider/provider-service.ts:236-243` (inside production `sendTurn`):

```ts
    try {
      this.sessionDirectory.markStatus(input.thread.id, 'running')
      await adapter.sendTurn(turn)
      await settleAdapterRuntimeEvents()
      recordChatPipelineInfo('chat.pipeline.provider_service.send_turn.complete', {
        ...providerTurnSummary(input),
        durationMs: elapsedMs(startedAt),
      })
```

`apps/server/src/provider/provider-service.ts:850-854` — no doc comment, no
explanation:

```ts
async function settleAdapterRuntimeEvents() {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}
```

**Why it is load-bearing today** (read this before you delete anything):

1. Adapters publish runtime events _synchronously_ inside `sendTurn` —
   `MockProviderAdapter.sendTurn` (`apps/server/src/provider/adapters/mock.ts:219-267`)
   calls `this.events.publish(...)` four times.
2. `ProviderRuntimeEventStream.publish` (`apps/server/src/provider/provider-runtime-event-stream.ts:8-12`)
   fans out to `subscribers`. The only subscriber `ProviderService` installs is
   the one created inside `iterator()` (line 21-24), which **pushes into a local
   array and returns**. The events are now parked in a buffer nobody outside the
   generator can see.
3. `ProviderService.consumeAdapterEvents` (`provider-service.ts:451-462`) is a
   separate `for await` task. It only reaches `ingestion.ingest(...)` after the
   event loop hands it back control.
4. So when `adapter.sendTurn()` returns, `ProviderRuntimeIngestion.queue` does
   **not** yet contain those events. Without the sleep,
   `ProviderCommandReactor.drain()` reads a stale tail and reports idle before
   the turn's output has been ingested.

`ProviderService.consumeAdapterEvents`, `provider-service.ts:444-462`:

```ts
  /**
   * Ends on shutdown or when the instance leaves the registry. Both are checked
   * on arrival rather than raced against the pending `next()`: racing inserts an
   * extra microtask between an adapter event and the binding write, which is
   * enough to let a later write (a session stop) be overwritten by an earlier
   * event.
   */
  private async consumeAdapterEvents(
    adapter: ReturnType<ProviderAdapterRegistry['getByInstance']>,
    providerInstanceId: ProviderInstanceId,
  ) {
    for await (const event of adapter.streamEvents()) {
      if (this.shuttingDown) return
      if (!this.streamedProviderInstances.has(providerInstanceId)) return

      this.recordRuntimeEvent(event, adapter)
      await this.emitRuntimeEvent(event)
    }
  }
```

`apps/server/src/provider/provider-runtime-event-stream.ts` in full (45 lines):

```ts
import type { ProviderRuntimeEvent } from './types'

type ProviderRuntimeEventSubscriber = (event: ProviderRuntimeEvent) => void

export class ProviderRuntimeEventStream {
  private readonly subscribers = new Set<ProviderRuntimeEventSubscriber>()

  publish(event: ProviderRuntimeEvent) {
    for (const subscriber of this.subscribers) {
      subscriber(event)
    }
  }

  stream(): AsyncIterable<ProviderRuntimeEvent> {
    return this.iterator()
  }

  private async *iterator() {
    const queue: ProviderRuntimeEvent[] = []
    const wakeups: Array<() => void> = []
    const subscriber = (event: ProviderRuntimeEvent) => {
      queue.push(event)
      wakeups.shift()?.()
    }

    this.subscribers.add(subscriber)
    try {
      for (;;) {
        const event = queue.shift()
        if (event) {
          yield event
          continue
        }

        await new Promise<void>((resolve) => {
          wakeups.push(resolve)
        })
      }
    } finally {
      this.subscribers.delete(subscriber)
      wakeups.splice(0)
    }
  }
}
```

Note the `finally` only runs when the `for await` loop exits, which requires a
_further_ event to arrive — so today a shut-down `ProviderService` leaks its
subscriber until the next publish. Step 6 fixes that for free.

### Composite idleness, assembled by hand in two places

`apps/server/src/orchestration/engine.ts:163-171`:

```ts
  /**
   * Provider work first: ingestion is what settles a turn, and settling a turn
   * is what gives the checkpoint reactor something to capture.
   */
  async providerRuntimeIdle() {
    await this.providerCommandReactor?.drain()
    await this.checkpointReactor?.drain()
    await this.sessionCheckoutReactor?.drain()
  }
```

`apps/server/src/orchestration/provider-command-reactor.ts:117-134`:

```ts
  async drain() {
    for (;;) {
      await this.worker.drain()
      await this.drainProviderActions()
      await this.ingestion.drain()
      if (this.isIdle()) return
    }
  }

  private isIdle() {
    return this.worker.isIdle() && this.pendingProviderActions.size === 0
  }

  private async drainProviderActions() {
    if (this.pendingProviderActions.size === 0) return

    await Promise.all(Array.from(this.pendingProviderActions))
  }
```

`isIdle()` does not consult `ingestion` at all — a sixth hole.

**The `ThreadDeletionReactor` is never drained by the engine.** `engine.ts:390-399`
constructs it inline and keeps no reference, so `providerRuntimeIdle()` cannot
reach it:

```ts
// Stopping a deleted thread's session is only meaningful where a runtime
// exists to stop, so the deletion reactor attaches with this one.
this.domainEvents.subscribe(
  new ThreadDeletionReactor({
    attachmentsDir: this.attachmentsDir,
    database: this.database,
    providerService,
    worktrees: providerRuntimeOptions?.checkpointGit
      ? new GitWorktreeService(providerRuntimeOptions.checkpointGit)
      : null,
  }),
)
```

`apps/server/src/orchestration/tests/thread-deletion-reactor.test.ts:162-166`
works around it with `vi.waitFor`.

### The other hand-rolled bounded-TTL map

`apps/server/src/orchestration/provider-command-reactor.ts:49-50, 64-70, 610-638`:

```ts
const HANDLED_TURN_START_KEY_MAX = 10_000
const HANDLED_TURN_START_KEY_TTL_MS = 30 * 60 * 1000
...
  private readonly now: () => number
  private readonly turnStartKeyTtlMs: number
  private readonly turnStartKeys = new Map<string, number>()
...
  private hasHandledTurnStart(
    event: Extract<ProviderIntentEvent, { type: 'thread.turn-start-requested' }>,
  ) {
    const now = this.now()
    const key = turnStartKeyForEvent(event)
    this.pruneHandledTurnStartKeys(now)
    const expiresAt = this.turnStartKeys.get(key)
    this.turnStartKeys.set(key, now + this.turnStartKeyTtlMs)
    this.pruneHandledTurnStartKeyCapacity()

    return expiresAt !== undefined && expiresAt > now
  }

  private pruneHandledTurnStartKeys(now: number) {
    for (const [key, expiresAt] of this.turnStartKeys) {
      if (expiresAt > now) continue

      this.turnStartKeys.delete(key)
    }
  }

  private pruneHandledTurnStartKeyCapacity() {
    while (this.turnStartKeys.size > HANDLED_TURN_START_KEY_MAX) {
      const oldestKey = this.turnStartKeys.keys().next().value
      if (!oldestKey) return

      this.turnStartKeys.delete(oldestKey)
    }
  }
```

`this.now` and `this.turnStartKeyTtlMs` have **no other consumer** in the file —
verified: `this.now` appears only at line 613, `this.turnStartKeyTtlMs` only at
line 617.

The class it duplicates already exists and is already imported by the sibling
checkpoint reactor (`checkpoint-reactor.ts:14`) and by ingestion
(`provider-runtime-ingestion.ts:26`) —
`apps/server/src/orchestration/provider-runtime-buffers.ts:26-86`:

```ts
export class BoundedTtlCache<Key, Value> {
  private readonly capacity: number
  private readonly entries = new Map<Key, CacheEntry<Value>>()
  private readonly now: () => number
  private readonly ttlMs: number

  constructor(options: { capacity: number; now?: () => number; ttlMs: number }) { ... }

  get(key: Key) {
    this.purgeExpired()
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (!this.isExpired(entry)) return entry.value

    this.entries.delete(key)
    return undefined
  }

  set(key: Key, value: Value) {
    this.purgeExpired()
    this.entries.delete(key)
    this.entries.set(key, { expiresAt: this.now() + this.ttlMs, value })
    this.trimToCapacity()
  }

  delete(key: Key) { this.entries.delete(key) }

  has(key: Key) { return this.get(key) !== undefined }

  keys() {
    this.purgeExpired()
    return Array.from(this.entries.keys())
  }

  private purgeExpired() {
    for (const [key, entry] of this.entries) {
      if (!this.isExpired(entry)) continue
      this.entries.delete(key)
    }
  }

  private trimToCapacity() {
    while (this.entries.size > this.capacity) {
      const key = this.entries.keys().next().value
      if (key === undefined) return
      this.entries.delete(key)
    }
  }

  private isExpired(entry: CacheEntry<Value>) {
    return entry.expiresAt <= this.now()
  }
}
```

And the free cleanup folded into this plan (`provider-runtime-buffers.ts:114-131`):

```ts
  rememberAssistantMessageId(threadId: ThreadId, turnId: TurnId, messageId: MessageId) {
    const key = turnCacheKey(threadId, turnId)
    const messageIds = new Set(this.assistantMessageIdsByTurn.get(key) ?? [])
    messageIds.add(messageId)
    this.assistantMessageIdsByTurn.set(key, messageIds)
  }

  forgetAssistantMessageId(threadId: ThreadId, turnId: TurnId, messageId: MessageId) {
    const key = turnCacheKey(threadId, turnId)
    const messageIds = new Set(this.assistantMessageIdsByTurn.get(key) ?? [])
    messageIds.delete(messageId)
    if (messageIds.size === 0) {
      this.assistantMessageIdsByTurn.delete(key)
      return
    }

    this.assistantMessageIdsByTurn.set(key, messageIds)
  }
```

`rememberAssistantMessageId` is called on **every** assistant delta
(`provider-runtime-ingestion.ts:270-271`), and each call is a full `Set` copy
plus two full-map sweeps (`get` + `set`).

### Repo conventions this plan must honor

Quoted verbatim from `AGENTS.md` — the executor has not read that file.

> **Greenfield, No Backward Compatibility**
>
> - This project is greenfield and not live: no releases, no external users, no data anyone needs migrated.
> - No backward compatibility shims, no legacy aliases, no deprecation windows. Update every call site in the same pass.

> **Control Flow**
>
> - Keep nesting depth to 3 or less.
> - Use guard clauses and early returns. Keep the happy path shallow.
> - In loops, use inverted conditions with `continue` instead of wrapping the body in `if`.
> - Do not use `else` after an early return.
> - Never use nested ternaries.

> **Code Organization**
>
> - Import exact files through `@/`. Do not add barrel `index.ts` files.
> - Barrel files are allowed only at package entry points such as `packages/*/src/index.ts`.

> **Naming And Refactors**
>
> - Do not repeat the folder name in file or symbol names.
> - Delete obsolete tests instead of preserving old behavior.
> - Remove duplicate code aggressively.

> **Logs**
>
> - Logging is wide-event style (evlog). Always prefer wide logs: enrich the one event per operation/request with more fields instead of emitting extra narrow log lines.
> - Never throw `new Error`. Create errors with `createError` from `evlog` — in practice through the feature's `structured-errors.ts` wrapper (`createStructuredError` or a `defineErrorCatalog` entry) so the error carries `code`, `status`, `why`, and `fix`.

> **Dev Server**
>
> - A dev server is always running. Never spin up your own server to test or verify changes — reuse the running one.

Concrete pointers for the error rule: use
`createInternalError(message: string, cause?: unknown)` exported from
`apps/server/src/observability/structured-errors.ts:157`. It is already imported
in `provider-command-reactor.ts:1` as
`import { createInternalError } from '../observability/structured-errors'`.
`apps/server/src/orchestration/` files use relative imports (`../provider/...`),
**not** `@/` — that alias is `apps/web` only. Match the surrounding files.

Server tests import from `vitest` directly (e.g.
`apps/server/src/orchestration/tests/provider-runtime-ingestion.test.ts:7`:
`import { assert, describe, expect, it } from 'vitest'`). The
`apps/web/test/fixtures.ts` rule in AGENTS.md applies to `apps/web` only — do not
try to use it here.

---

## Commands you will need

| Purpose               | Command                                                                         | Expected on success                                   |
| --------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Typecheck (server)    | `cd apps/server && bun run typecheck`                                           | exit 0, only the `$ tsgo --noEmit` echo               |
| Lint (server)         | `cd apps/server && bun run lint`                                                | exit 0; `oxlint` prints nothing when clean            |
| Format check (server) | `cd apps/server && bun run format:check`                                        | exit 0, `All matched files use the correct format.`   |
| Format (server)       | `cd apps/server && bun run format`                                              | rewrites files; run before `format:check`             |
| Full server suite     | `cd apps/server && bun run test` (= `bun --bun vitest run`)                     | 0 failures, and no test from the Step 0 snapshot lost |
| Focused suite         | `cd apps/server && bun --bun vitest run src/orchestration src/provider`         | fully green (0 failures) before and after             |
| Single file           | `cd apps/server && bun --bun vitest run src/orchestration/tests/engine.test.ts` | all pass                                              |

`--reporter=basic` is **not** a valid reporter in this Vitest version — it errors
at startup. Do not pass it.

### Baseline: measure it, do not read it from this plan

**`apps/server` is fully green at `b467b3f`.** Measured: **819 tests, 0 failures,
88 files**. The native `@parcel/watcher` failure that was red when this plan was
authored (`src/tests/app.test.ts > fs rpc events > reports external file updates
from the native watcher`) was a real event-classification bug and **the
watcher-classification fix resolved it** (commits `f93dd1d`, `1f8eb0d`). There
is nothing left to excuse.

So: **any failing test you see is yours.** There is no allowance, no
known-failure carve-out, and no "second failure is your regression" arithmetic in
this plan any more.

Those two numbers are stated here for orientation only. **Do not assert them.**
They will drift as other plans land, exactly as `773` did. The gate is a delta
against a snapshot you take yourself in Step 0:

- no test that passed at Step 0 may fail at the end;
- no new lint finding may appear;
- the focused suite (`src/orchestration src/provider`) is green at Step 0 and must
  be green at the end.

Never gate on root `bun run verify`. It runs the whole monorepo and
short-circuits, so an unrelated failure in any other workspace makes it
unreachable while proving nothing about this change. The per-workspace commands in
the table above are the gate.

---

## Scope

**In scope** (the only files you may modify or create):

- `apps/server/src/orchestration/serial-worker.ts` _(create)_
- `apps/server/src/orchestration/reactor-scheduler.ts` _(create)_
- `apps/server/src/orchestration/tests/serial-worker.test.ts` _(create)_
- `apps/server/src/orchestration/provider-runtime-ingestion.ts`
- `apps/server/src/orchestration/checkpoint-reactor.ts`
- `apps/server/src/orchestration/session-checkout-reactor.ts`
- `apps/server/src/orchestration/thread-deletion-reactor.ts`
- `apps/server/src/orchestration/provider-command-reactor.ts`
- `apps/server/src/orchestration/provider-runtime-buffers.ts`
- `apps/server/src/orchestration/engine.ts`
- `apps/server/src/orchestration/tests/provider-runtime-ingestion.test.ts` _(add cases)_
- `apps/server/src/provider/provider-service.ts`
- `apps/server/src/provider/provider-runtime-event-stream.ts`
- `apps/server/src/provider/types.ts` _(one SPI member)_
- `apps/server/src/provider/adapters/mock.ts` _(one method)_
- `apps/server/src/provider/adapters/codex.ts` _(one method)_
- `apps/server/src/provider/adapters/claude.ts` _(one method)_
- `apps/server/src/provider/adapters/tests/codex.test.ts` _(one helper)_
- `apps/server/src/provider/adapters/tests/claude.test.ts` _(one helper)_
- `plans/README.md` _(status row only)_

**Out of scope** (do NOT touch, even though they look related):

- The current projection pipeline — the dual-projection collapse already
  landed. Reconcile the live file names during the drift check and do not modify
  that ownership here.
- `apps/server/src/orchestration/decider.ts`, `command-invariants.ts`,
  `command-receipts.ts` — pure, synchronous, inside the command transaction. No
  queues, nothing to unify.
- `OrchestrationEngine.dispatch`'s own `private queue = Promise.resolve()`
  (`engine.ts:67, 128-131`) — that is a _serializer for a synchronous
  transaction_, not a work queue with a drain contract, and its `dispatch()`
  return value is the caller's result. Converting it would change the public
  dispatch signature. Leave it exactly as is.
- `apps/server/src/lsp/stdio-rpc.ts:16-19` — has a method named `drain()` but it
  is a byte-buffer parser, unrelated.
- `apps/server/src/orchestration/streams.ts` — SSE/WS fan-out, a different
  concern.
- Any `apps/web` file. This change is server-internal; no route, schema, or
  contract shape moves.
- `packages/*` — nothing here crosses a package boundary.
- The `settleRuntimeEvents()` helper local to
  `apps/server/src/provider/adapters/tests/codex.test.ts:1194` (two microtask
  hops, ~10 call sites in that file). It settles the _adapter's own internal_ CLI
  pump, not the stream buffer, and is still needed. Leave it, and leave its call
  sites. (`claude.test.ts` has no such helper — do not add one.)
- `apps/server/src/tests/app.test.ts` — nothing in `src/tests/` is in scope. It is
  green after the watcher-classification fix, and it must stay green: if this plan makes it fail, that is
  a regression from this plan, not a pre-existing condition.
- `apps/server/src/provider/provider-session-reaper.ts` — timer-driven idle
  session reaping. It looks like "another scheduler" and is not: it has no drain
  contract, no queue, and reaps on a wall-clock deadline. Do not register it as
  an `IdleSource` and do not fold it into `ReactorScheduler`.
- `apps/server/src/orchestration/domain-events.ts` (the `OrchestrationDomainEventBus`)
  — fan-out, synchronous, no queue. Registration stays explicit per reactor;
  do not auto-register from `subscribe()`.
- Do **not** move `SerialWorker` into `packages/`. Nothing outside
  `apps/server/src` uses it, and a package move drags in a build/export change
  this plan does not budget for.
- Do **not** raise `MAX_DRAIN_PASSES` or `MAX_IDLE_PASSES` above `1_000`. If a
  cap is hit, that is the bug — see STOP conditions.

---

## Git workflow

- **All work happens on `main`** — no new branches, worktrees, commits, pushes,
  or PRs unless the operator explicitly asks.
- If the operator does ask for commits: conventional commits, lowercase
  descriptive subject. Real examples from this repo's `git log`:
  - `refactor(orchestration): the server prepares a session's worktree (M-C)`
  - `fix(address): bound the URL, and stop escaping slashes in ?tabs=`
  - A fitting subject for this work: `refactor(orchestration): one SerialWorker behind every reactor queue`

---

## Steps

### Step 0: Capture the baseline (do this before touching anything)

Every later gate is a comparison against these files. Run from the repo root:

```
cd apps/server && bun run test 2>&1 | tail -30 > /tmp/040-server-test-before.txt
cd apps/server && bun run lint 2>&1 | tail -20 > /tmp/040-server-lint-before.txt
cd apps/server && bun --bun vitest run src/orchestration src/provider 2>&1 | tail -20 > /tmp/040-focused-test-before.txt
```

Then read all three and record in your report:

- the full-suite pass/fail counts and, **if anything failed, the name of every
  failing test**;
- the lint finding count;
- the focused-suite counts.

Expected at `b467b3f`: full suite 0 failures, lint clean, focused suite 0
failures. If the full suite is **not** 0 failures, that is a surprise — the
watcher-classification fix made it green. Report the failing test names before you start; a failure you
recorded here is not yours, but a failure that appears later is.

Do **not** copy any of these numbers into a Done criterion. They are the left-hand
side of a comparison, nothing else.

---

### Step 1: Add `SerialWorker<Task>`

Create `apps/server/src/orchestration/serial-worker.ts`. This is the only queue
implementation the rest of the plan uses.

Required contract:

- `enqueue(task: Task): Promise<void>` — appends and starts the runner. The
  returned promise settles when **that task** has run: it resolves on success and
  **rejects** if the handler throws. This mirrors today's
  `ProviderRuntimeIngestion.ingest()` exactly, which the 33 `ingest(...)` call
  sites in `provider-runtime-ingestion.test.ts` depend on.
- `drain(): Promise<void>` — resolves when the queue is empty **and** nothing is
  running. It must re-check after the runner finishes, not capture a tail. It
  never rejects.
- `isIdle(): boolean` — `!active && queue.length === 0`.

Target shape (write it in this style; `never-nester` rules apply):

```ts
type PendingTask<Task> = {
  reject: (error: unknown) => void
  resolve: () => void
  task: Task
}

/**
 * One task at a time, in enqueue order, with a drain that re-reads the queue
 * instead of capturing its tail — the property five hand-rolled queues each
 * spelled differently, and one of them (ingestion) got wrong.
 *
 * `enqueue` rejects when the handler throws. Ignoring the returned promise is
 * only safe for handlers that catch everything themselves; every caller in this
 * repo either awaits it or passes a total handler.
 */
export class SerialWorker<Task> {
  private active = false
  private readonly handler: (task: Task) => Promise<void>
  private readonly queue: Array<PendingTask<Task>> = []
  private readonly waiters: Array<() => void> = []

  constructor(handler: (task: Task) => Promise<void>) {
    this.handler = handler
  }

  enqueue(task: Task) {
    const { promise, reject, resolve } = Promise.withResolvers<void>()
    this.queue.push({ reject, resolve: () => resolve(), task })
    void this.run()

    return promise
  }

  isIdle() {
    return !this.active && this.queue.length === 0
  }

  drain() {
    if (this.isIdle()) return Promise.resolve()

    return new Promise<void>((resolve) => {
      this.waiters.push(resolve)
    })
  }

  private async run() {
    if (this.active) return

    this.active = true
    try {
      while (this.queue.length > 0) {
        const pending = this.queue.shift() as PendingTask<Task>
        await this.settle(pending)
      }
    } finally {
      this.active = false
      this.resolveWaitersIfIdle()
      if (this.queue.length > 0) void this.run()
    }
  }

  private async settle(pending: PendingTask<Task>) {
    try {
      await this.handler(pending.task)
      pending.resolve()
    } catch (error) {
      pending.reject(error)
    }
  }

  private resolveWaitersIfIdle() {
    if (!this.isIdle()) return

    const waiters = this.waiters.splice(0)
    for (const waiter of waiters) {
      waiter()
    }
  }
}
```

`Promise.withResolvers` typechecks under this repo's `tsgo` config — verified at
`ace313f`. If that ever stops being true, hand-roll the three locals instead of
adding a lib/tsconfig change.

Import sites for later steps (no barrel, exact file, relative — see conventions):
the five files in `apps/server/src/orchestration/` use
`import { SerialWorker } from './serial-worker'`; `provider-service.ts` uses
`import { SerialWorker } from '../orchestration/serial-worker'`.

Also create `apps/server/src/orchestration/tests/serial-worker.test.ts` with
exactly these five cases (import `{ describe, expect, it }` from `'vitest'`):

1. `runs tasks one at a time in enqueue order` — a handler that records
   `start:N` / `end:N` around an `await Promise.resolve()`; enqueue three; assert
   the log is `['start:1','end:1','start:2','end:2','start:3','end:3']`.
2. `drain settles work enqueued while an earlier task is running` — the handler
   for task 1 enqueues task 2; call `drain()` _before_ awaiting anything; assert
   both handlers ran when `drain()` resolves. (This is the exact bug in
   `ProviderRuntimeIngestion.drain()`.)
3. `drain settles work enqueued after drain was called` — call `drain()`, then
   synchronously `void worker.enqueue(task)`, then `await` the drain; assert the
   task ran.
4. `keeps running after a handler throws` — handler throws for task 1; assert
   `await expect(worker.enqueue(one)).rejects.toThrow()`, then task 2 still runs
   and `drain()` resolves.
5. `isIdle is false while a task is in flight and true after drain` — gate the
   handler on a manually-resolved promise; assert `isIdle()` is `false` before
   release and `true` after `drain()`.

**Verify**:

```
cd apps/server && bun run typecheck && bun --bun vitest run src/orchestration/tests/serial-worker.test.ts
```

→ typecheck exit 0; `Test Files 1 passed (1)`, `Tests 5 passed (5)`. This one count
is safe to assert: it is a file you just created with exactly the five cases listed
above, and no other plan can move it.

From here on, the focused suite must gain exactly **+1 file and +5 tests** against
`/tmp/040-focused-test-before.txt` — and stay at 0 failures. Compare the delta; do
not assert a total.

---

### Step 2: Rebuild `ProviderRuntimeIngestion` on `SerialWorker`

In `apps/server/src/orchestration/provider-runtime-ingestion.ts`:

- Delete `private queue = Promise.resolve()` (line 53). Also delete the
  module-level `function noop() {}` at line 1290 — its only use in this file is
  line 86 (`this.queue = task.then(noop, noop)`), which goes away with the queue.
- Add `private readonly worker: SerialWorker<ProviderRuntimeEvent>`, constructed
  in the constructor as
  `new SerialWorker((event) => this.processEvent(event))`.
- `ingest(event)` becomes `return this.worker.enqueue(event)` — same return
  contract as before.
- `drain()` becomes `return this.worker.drain()`.
- Add `isIdle()` returning `this.worker.isIdle()`.

Add one new case to
`apps/server/src/orchestration/tests/provider-runtime-ingestion.test.ts`, right
after the existing `'drains unawaited ingestion work when idle'` test at line
206 (model the new one on it):

```
it('drains work enqueued after drain was called', ...)
```

Body: call `const drained = ingestion.drain()`, then synchronously
`void ingestion.ingest(assistantDelta('delta-1', 'late'))`, then
`await drained`, then assert `dispatched` contains the delta command. Confirm
this test **fails** if you temporarily revert `drain()` to `return this.queue` —
that is what proves it covers the real hole.

**Verify**:

```
cd apps/server && bun run typecheck && bun --bun vitest run src/orchestration src/provider
```

→ typecheck exit 0; focused suite **0 failures**, and against
`/tmp/040-focused-test-before.txt` exactly **+1 file / +6 tests** (5 from Step 1,
1 here). Assert the delta and the zero-failure property, not a total.

---

### Step 3: Rebuild `CheckpointReactor` on `SerialWorker`

In `apps/server/src/orchestration/checkpoint-reactor.ts`:

- Delete the `DrainableCheckpointWorker` class (lines 349-376) **and** the
  module-level `noop` at line 378 if it has no other caller.
- Keep the class's doc comment — move it onto the `worker` field so the
  "captures run one at a time per process / `git add --all` races on the object
  store" rationale is not lost.
- `private readonly worker: DrainableCheckpointWorker` becomes
  `private readonly worker: SerialWorker<CheckpointTask>`; the constructor line
  `this.worker = new DrainableCheckpointWorker((task) => this.runTask(task))`
  becomes `new SerialWorker((task) => this.runTask(task))`.
- `handleEvents` (line 99) currently calls `this.worker.enqueue(task)` and
  discards the return. Write `void this.worker.enqueue(task)`.
- `drain()` (line 104-106) already delegates — no change needed.
- Add `isIdle()` returning `this.worker.isIdle()`; Step 7 needs it.

**Already verified for you**: `runTask` (line 139) cannot reject. Its only
awaited call is `this.taskOutcome(task)` (line 164), whose whole body is a
`try { ... } catch (error) { return { captured: false, error } }`. So `void
this.worker.enqueue(task)` needs no `.catch`. If you find that `taskOutcome`
no longer has that `catch`, treat it as drift and STOP.

**Verify**:

```
cd apps/server && bun --bun vitest run src/orchestration/tests/checkpoint-reactor.test.ts
```

→ all pass.

---

### Step 4: Rebuild `SessionCheckoutReactor` and `ThreadDeletionReactor`

**`session-checkout-reactor.ts`**: replace `chains` + `pending` with one
`SerialWorker<{ requestWorktree: boolean; threadId: ThreadId }>` whose handler is
`(task) => this.establish(task.threadId, task.requestWorktree)`.

- `enqueue(threadId, requestWorktree)` becomes
  `void this.worker.enqueue({ requestWorktree, threadId })`.
- `drain()` becomes `return this.worker.drain()`.
- Add `isIdle()`.

**This is a deliberate behavior change**: work is now serialized globally rather
than per thread, so two threads' checkouts no longer overlap. Replace the
per-thread rationale comment with one that says so, e.g.:

```ts
/**
 * Serialized across every thread, not just within one. Per-thread order was
 * the original requirement — `thread.created` and `thread.turn-start-requested`
 * arrive in the same batch, and run concurrently the plain stamp reads the
 * project root while the worktree is still being made. Going fully serial
 * keeps that and adds the one this reactor never had: two `git worktree add`
 * calls in the same repository contend on `index.lock`.
 */
```

Do not try to preserve cross-thread concurrency. This is a local dev tool with a
handful of live threads, and the git work here is I/O against one repository.

**`thread-deletion-reactor.ts`**: replace the `cleanups` Set with one
`SerialWorker<ThreadDeletedEvent>` whose handler is
`(event) => this.cleanupThread(event)`.

- **Keep `cleaningThreads`.** It is a dedupe guard, not a queue, and its comment
  ("A redelivered batch … must not race a second stop") states why. `enqueueCleanup`
  keeps its early return, then does:
  ```ts
  this.cleaningThreads.add(threadId)
  void this.worker
    .enqueue(event)
    .catch((error) => {
      recordChatPipelineWarning('chat.pipeline.thread_deletion_reactor.cleanup', {
        ...orchestrationEventSummary(event),
        error,
      })
    })
    .finally(() => this.cleaningThreads.delete(threadId))
  ```
  The `.catch` must come **before** the `.finally`: a `.finally` alone re-throws,
  so the ignored promise would still be an unhandled rejection. And
  `cleanupThread` really can reject despite its "Never rejects" doc comment — it
  reads the database synchronously outside its `try` blocks (`bindingForThread`
  at line 101, `threadWorktree` at line 170). The action name
  `chat.pipeline.thread_deletion_reactor.cleanup` is the one the method already
  uses at lines 121 and 125, so no new narrow event appears;
  `recordChatPipelineWarning` and `orchestrationEventSummary` are already
  imported in this file.
- `drain()` becomes `return this.worker.drain()`.
- Add `isIdle()`.

**Verify**:

```
cd apps/server && bun --bun vitest run src/orchestration/tests/session-checkout-reactor.test.ts src/orchestration/tests/thread-deletion-reactor.test.ts
```

→ all pass.

---

### Step 5: Rebuild the intent worker and delete the hand-rolled TTL map

In `apps/server/src/orchestration/provider-command-reactor.ts`:

**5a. Intent worker.** Delete the `DrainableProviderIntentWorker` class (lines
910-961). Change the field to
`private readonly worker: SerialWorker<ProviderIntentEvent>` and construct it as
`new SerialWorker((event) => this.handleEventSafely(event))` (line 99).
`handleEvents` (line 113) becomes `void this.worker.enqueue(event)`.
`handleEventSafely` already try/catches its whole body (lines 136-145), so the
ignored promise can never reject.

**5b. Turn-start dedupe.** Delete `turnStartKeys`, `pruneHandledTurnStartKeys`,
`pruneHandledTurnStartKeyCapacity`, the `now` field, and the `turnStartKeyTtlMs`
field. Keep both constructor **options** (`now?`, `turnStartKeyTtlMs?`): `now` is
passed by `createStandaloneProviderReactor` (`engine.test.ts:1134-1143`, called at
`engine.test.ts:675`); `turnStartKeyTtlMs` has no caller today but keeping the
option costs nothing and removing it is a separate change. Feed both to the cache:

```ts
this.handledTurnStarts = new BoundedTtlCache({
  capacity: HANDLED_TURN_START_KEY_MAX,
  now,
  ttlMs: turnStartKeyTtlMs ?? HANDLED_TURN_START_KEY_TTL_MS,
})
```

Field: `private readonly handledTurnStarts: BoundedTtlCache<string, true>`.
Import: add `BoundedTtlCache` to the existing import from
`'./provider-runtime-buffers'` — there is no such import in this file yet, so add
`import { BoundedTtlCache } from './provider-runtime-buffers'` next to the other
`./` imports.

`hasHandledTurnStart` collapses to:

```ts
  private hasHandledTurnStart(
    event: Extract<ProviderIntentEvent, { type: 'thread.turn-start-requested' }>,
  ) {
    const key = turnStartKeyForEvent(event)
    const handled = this.handledTurnStarts.has(key)
    this.handledTurnStarts.set(key, true)

    return handled
  }
```

Semantics are identical: `BoundedTtlCache.has` → `get` → deletes the entry when
`expiresAt <= now`, and `set` refreshes the expiry — exactly what the prune +
re-set did. The only difference is that `set` on an existing key moves it to the
end of insertion order, so capacity eviction becomes least-recently-_written_
instead of least-recently-_inserted_. At a 10,000 capacity keyed per
(thread, turn) that is not observable; note it in the PR description rather than
working around it.

Do **not** change `ProviderCommandReactor.drain()` or `isIdle()` yet — Step 6
does that, and it needs a method that does not exist until then.

**Verify**:

```
cd apps/server && bun run typecheck && bun --bun vitest run src/orchestration/tests/engine.test.ts
```

→ typecheck exit 0; all pass, including
`expires provider turn-start dedupe keys after the reactor TTL` (engine.test.ts:670).

---

### Step 6: Push the adapter runtime-event pump, then delete the sleep

This is the step that removes `settleAdapterRuntimeEvents`. Do the whole step
before running the suite; the intermediate states do not compile.

**6a. `provider-runtime-event-stream.ts`** — replace the async-iterator with a
subscription. Delete `stream()` and `iterator()`; add:

```ts
  /**
   * Synchronous fan-out at publish time. The pull iterator this replaced parked
   * events in a buffer only the generator could see, which is why draining the
   * pipeline needed a timer to guess when they had been handed on.
   */
  subscribe(subscriber: ProviderRuntimeEventSubscriber) {
    this.subscribers.add(subscriber)

    return () => {
      this.subscribers.delete(subscriber)
    }
  }
```

**6b. SPI** — `apps/server/src/provider/types.ts:549`:

```ts
streamEvents: () => AsyncIterable<ProviderRuntimeEvent>
```

becomes

```ts
  subscribeEvents: (subscriber: (event: ProviderRuntimeEvent) => void) => () => void
```

**6c. Three adapters** — each is a one-line delegation. In
`adapters/mock.ts:169-171`, `adapters/codex.ts:272-274`, `adapters/claude.ts:317-319`,
replace

```ts
  streamEvents() {
    return this.events.stream()
  }
```

with

```ts
  subscribeEvents(subscriber: (event: ProviderRuntimeEvent) => void) {
    return this.events.subscribe(subscriber)
  }
```

(`ProviderRuntimeEvent` is already imported in all three files; confirm and add
the type import if not.)

**6d. `ProviderService`** — `apps/server/src/provider/provider-service.ts`:

- Replace `private readonly streamedProviderInstances = new Set<ProviderInstanceId>()`
  (line 91) with
  `private readonly adapterSubscriptions = new Map<ProviderInstanceId, () => void>()`.
- Add the pump worker:
  ```ts
  private readonly runtimeEvents = new SerialWorker<ProviderRuntimeEventTask>(
    (task) => this.handleRuntimeEvent(task),
  )
  ```
  with `type ProviderRuntimeEventTask = { adapter: ReturnType<ProviderAdapterRegistry['getByInstance']>; event: ProviderRuntimeEvent; providerInstanceId: ProviderInstanceId }`.
  Import `SerialWorker` from `'../orchestration/serial-worker'` — this direction
  already exists (`provider-service.ts:33` imports from
  `'../orchestration/orchestration-logging'`).
- `startAdapterEventStream` (lines 427-442) becomes the code below. **Keep the
  `chat.pipeline.provider_service.runtime_stream.failed` warning** that lives in
  today's `.catch` (line 436) — the subscription itself can no longer fail, but
  `handleRuntimeEvent` can (see the next bullet), and dropping the action name
  would delete a log event that exists today:

  ```ts
  private startAdapterEventStream(providerInstanceId: ProviderInstanceId) {
    if (this.adapterSubscriptions.has(providerInstanceId)) return

    const adapter = this.adapterRegistry.adapter(providerInstanceId)
    if (!adapter) return

    this.adapterSubscriptions.set(
      providerInstanceId,
      adapter.subscribeEvents((event) => {
        void this.runtimeEvents
          .enqueue({ adapter, event, providerInstanceId })
          .catch((error) => {
            recordChatPipelineWarning('chat.pipeline.provider_service.runtime_stream.failed', {
              adapterKey: adapter.adapterKey,
              error,
              providerInstanceId,
            })
          })
      }),
    )
  }
  ```

  The `.catch` is **not optional**. `handleRuntimeEvent` calls
  `this.recordRuntimeEvent(...)`, which writes to the session directory
  synchronously (`provider-service.ts:508-524`) and can throw; `SerialWorker.enqueue`
  rejects when its handler throws, and an ignored rejection is an unhandled
  rejection under Bun.

- Delete `consumeAdapterEvents` (lines 444-462) and add `handleRuntimeEvent`,
  carrying its doc comment forward because the arrival-time checks are still the
  point:

  ```ts
  /**
   * Both conditions are checked on arrival rather than raced against a pending
   * read: an extra microtask between an adapter event and the binding write is
   * enough to let a later write (a session stop) be overwritten by an earlier
   * event.
   */
  private async handleRuntimeEvent(task: ProviderRuntimeEventTask) {
    if (this.shuttingDown) return
    if (!this.adapterSubscriptions.has(task.providerInstanceId)) return

    this.recordRuntimeEvent(task.event, task.adapter)
    await this.emitRuntimeEvent(task.event)
  }
  ```

- `forgetRemovedStreams` (lines 418-425) now unsubscribes as well as forgetting:

  ```ts
  private forgetRemovedStreams(liveProviderInstanceIds: readonly ProviderInstanceId[]) {
    const live = new Set(liveProviderInstanceIds)
    for (const [providerInstanceId, unsubscribe] of this.adapterSubscriptions) {
      if (live.has(providerInstanceId)) continue

      unsubscribe()
      this.adapterSubscriptions.delete(providerInstanceId)
    }
  }
  ```

- `shutdown()` (lines 118-127): replace `this.streamedProviderInstances.clear()`
  with a loop that calls every stored unsubscribe, then clears the map. Keep the
  rest of the method and its doc comment unchanged.
- Add the two idleness accessors:

  ```ts
  /** Every adapter event that has been published has been handed to the listeners. */
  drainRuntimeEvents() {
    return this.runtimeEvents.drain()
  }

  runtimeEventsIdle() {
    return this.runtimeEvents.isIdle()
  }
  ```

- **Delete `settleAdapterRuntimeEvents`** (lines 850-854) and its call at line 239. **Leave `noop` at line 844 alone** — it is still used at
  `provider-service.ts:532` (`await Promise.resolve(listener(event)).catch(noop)`).

**6e. `ProviderCommandReactor.drain()`** — `provider-command-reactor.ts:117-128`.
The runtime pump now sits between `sendTurn` and ingestion, so the loop must
drain it, and `isIdle()` must consult every source:

```ts
  /**
   * Loops because each source feeds the next: an intent sends a turn, the turn
   * publishes runtime events, ingestion turns those into commands, and a
   * command can produce another intent. Idle is when all four are idle at the
   * same moment, not when each has been drained once.
   */
  async drain() {
    for (let pass = 0; pass < MAX_DRAIN_PASSES; pass += 1) {
      await this.worker.drain()
      await this.drainProviderActions()
      await this.providerService.drainRuntimeEvents()
      await this.ingestion.drain()
      if (this.isIdle()) return
    }

    throw createInternalError(
      `Provider runtime did not settle within ${MAX_DRAIN_PASSES} drain passes.`,
    )
  }

  private isIdle() {
    return (
      this.worker.isIdle() &&
      this.pendingProviderActions.size === 0 &&
      this.providerService.runtimeEventsIdle() &&
      this.ingestion.isIdle()
    )
  }
```

with `const MAX_DRAIN_PASSES = 1_000` next to `HANDLED_TURN_START_KEY_MAX` /
`HANDLED_TURN_START_KEY_TTL_MS` at lines 49-50. The cap replaces today's
unbounded `for (;;)`: a non-settling pipeline should surface as a structured
error, not a hung test. `createInternalError` is already imported at line 1.

`isIdle()` stays `private` for this step; Step 7 makes it public. Leaving it
private now keeps Step 6 compiling on its own.

**Do not** route `beforeTurnStart` / `turnPrerequisitesSettled` through any of
this — see the STOP conditions.

**6f. Two adapter tests.** In
`apps/server/src/provider/adapters/tests/codex.test.ts:1175-1181` and
`apps/server/src/provider/adapters/tests/claude.test.ts:815-819`, replace

```ts
void (async () => {
  for await (const event of adapter.streamEvents()) {
    events.push(event)
  }
})()
```

with

```ts
adapter.subscribeEvents((event) => {
  events.push(event)
})
```

**Verify**:

```
cd apps/server && bun run typecheck && bun run lint && bun --bun vitest run
```

→ typecheck exit 0; lint prints nothing, and no finding that was not already in
`/tmp/040-server-lint-before.txt`. Full suite: **0 failures**, with exactly
**+1 file / +6 tests** against `/tmp/040-server-test-before.txt` (5 from Step 1, 1
from Step 2). No test that passed in the snapshot may fail here.

This is the riskiest step in the plan, so be precise about what a failure means:
there is **no known-failure allowance**. `apps/server` was green at Step 0
(the watcher-classification fix resolved the last outstanding failure), so any red test after this step was
caused by this step. Diff the failing names against the snapshot before you form a
theory.

```
grep -rn "settleAdapterRuntimeEvents\|streamEvents" apps/server/src
```

→ no matches.

---

### Step 7: One `ReactorScheduler` behind `providerRuntimeIdle()`

Create `apps/server/src/orchestration/reactor-scheduler.ts`:

```ts
import { createInternalError } from '../observability/structured-errors'

const MAX_IDLE_PASSES = 1_000

export type IdleSource = {
  drain: () => Promise<void>
  isIdle: () => boolean
  readonly name: string
}

/**
 * The single owner of "is the provider pipeline idle?". Sources feed each other
 * — ingestion settles a turn, settling a turn gives the checkpoint reactor
 * something to capture — so one pass over them proves nothing. Idle is when
 * every registered source reports idle after the same pass.
 */
export class ReactorScheduler {
  private readonly sources: IdleSource[] = []

  register(source: IdleSource) {
    this.sources.push(source)
  }

  async idle() {
    for (let pass = 0; pass < MAX_IDLE_PASSES; pass += 1) {
      for (const source of this.sources) {
        await source.drain()
      }
      if (this.sources.every((source) => source.isIdle())) return
    }

    throw createInternalError(
      `Reactors did not settle within ${MAX_IDLE_PASSES} passes: ${this.busyNames()}`,
    )
  }

  private busyNames() {
    return this.sources
      .filter((source) => !source.isIdle())
      .map((source) => source.name)
      .join(', ')
  }
}
```

Wire it in `apps/server/src/orchestration/engine.ts`:

- Add `private readonly reactors = new ReactorScheduler()`.
- Replace `providerRuntimeIdle()` (lines 163-171) with:
  ```ts
  /** Settles every registered reactor; the scheduler owns the ordering. */
  providerRuntimeIdle() {
    return this.reactors.idle()
  }
  ```
- Register each source at the point it is constructed. **Registration order does
  not have to reproduce the old comment's "provider work first" ordering** — and
  cannot: `createProviderCommandReactor` (`engine.ts:370`) calls
  `subscribeCheckpointReactor` at line 400 and only then reaches
  `return new ProviderCommandReactor({...})` at line 402, and the
  `ThreadDeletionReactor` is built earlier still at lines 389-399. The scheduler's
  loop is what makes order irrelevant: it re-drains every source until they are
  _all_ idle in the same pass, which is strictly stronger than one ordered sweep.
  Register in whatever order construction reaches them:
  - `createProviderCommandReactor` currently ends with a bare
    `return new ProviderCommandReactor({ ... })`. Bind it to a local first:

    ```ts
    const reactor = new ProviderCommandReactor({
      /* unchanged options */
    })
    this.reactors.register({
      drain: () => reactor.drain(),
      isIdle: () => reactor.isIdle(),
      name: 'provider-command-reactor',
    })

    return reactor
    ```

    This requires making `ProviderCommandReactor.isIdle()` public — it is
    `private` at `provider-command-reactor.ts:126` today; drop the `private`.

  - the `ThreadDeletionReactor` at `engine.ts:389-399` is currently constructed
    anonymously inside `this.domainEvents.subscribe(...)`. Assign it to a local,
    subscribe the local, and register it as `'thread-deletion-reactor'`.
    **This is a behavior change**: `providerRuntimeIdle()` now also settles
    deletion cleanup, which it silently never did.
  - in `subscribeCheckpointReactor` (`engine.ts:346-368`), register
    `this.checkpointReactor` as `'checkpoint-reactor'` and
    `this.sessionCheckoutReactor` as `'session-checkout-reactor'`, each right
    after its `this.domainEvents.subscribe(...)` line. That method early-returns
    when there is no git handle (`if (!git) return`), so with no git nothing is
    registered — which reproduces today's `?.` no-op exactly.

- Leave `turnPrerequisitesSettled()` (lines 336-339) **exactly as it is** — two
  direct `drain()` calls, in its own order, with its own comment. See STOP
  conditions for why.
- The `?.` optional chaining disappears from `providerRuntimeIdle` because
  registration only happens when the reactor exists.

`ThreadDeletionReactor` and `SessionCheckoutReactor` already have a `name` field
(`'thread-deletion-reactor'`, `'session-checkout-reactor'`); `CheckpointReactor`
has `'checkpoint-reactor'`. Reuse those strings rather than typing new ones.

The existing `vi.waitFor` at `thread-deletion-reactor.test.ts:164-166` will now
succeed on its first attempt. Leave it — it is testing the engine-wired path and
is still a valid assertion.

**Verify**:

```
cd apps/server && bun run typecheck && bun --bun vitest run src/orchestration src/provider
```

→ typecheck exit 0; focused suite **0 failures**, still **+1 file / +6 tests**
against `/tmp/040-focused-test-before.txt` (this step adds no tests of its own).

```
grep -n "Reactor?.drain()" apps/server/src/orchestration/engine.ts
```

→ exactly two lines, both inside `turnPrerequisitesSettled`:
`this.sessionCheckoutReactor?.drain()` then `this.checkpointReactor?.drain()`.
(Baseline is five such lines — 168, 169, 170, 337, 338; the three in
`providerRuntimeIdle` are gone.)

---

### Step 8: Stop sweeping the whole map on every cache read

`apps/server/src/orchestration/provider-runtime-buffers.ts`. Two edits, both
narrow:

**8a.** Remove the `this.purgeExpired()` call from `get()` (line 39) and from
`set()` (line 49). Keep it in `keys()` (line 64) — `keys()` is only reached from
`clearTurnStateForSession`, once per `session.exited`, and callers there iterate
the result. Expiry stays correct because `get()` already checks the single entry
it read (`if (!this.isExpired(entry)) return entry.value` / else delete), and
memory stays bounded because `trimToCapacity()` is unchanged.

Add a one-line comment on `get()` recording why the sweep is gone: expiry is
per-key and lazy; the sweep was O(n) on the streaming path and, with a two-hour
TTL, almost always deleted nothing.

Accepted consequence, note it in the PR description: with no sweep in `set()`,
`trimToCapacity()` can now evict a live entry while an expired one is still
sitting in the map. Bounded memory is unaffected (the cap is enforced the same
way) and every capacity here is 10k+ against tens of live entries.

**Prove the negative before moving on.** Lazy expiry must still expire. After
Step 5b the turn-start dedupe runs through `BoundedTtlCache`, and
`engine.test.ts:670` (`expires provider turn-start dedupe keys after the reactor
TTL`) advances a fake clock past the 30-minute TTL and asserts the third
`handleEvents` starts a _second_ turn. That test is the proof that removing the
sweep did not make entries immortal, and it must still pass:

```
cd apps/server && bun --bun vitest run src/orchestration/tests/engine.test.ts -t "expires provider turn-start dedupe keys"
```

→ `Tests 1 passed`, rest skipped. Do not assert the skip count — it is the size of
`engine.test.ts` and other plans change it. The only thing that matters is that the
one selected test passes.

**8b.** Stop copying the `Set` on every assistant delta. In
`rememberAssistantMessageId` and `forgetAssistantMessageId` (lines 114-131),
mutate the stored `Set` in place and still call `set()` so the TTL is refreshed:

```ts
  rememberAssistantMessageId(threadId: ThreadId, turnId: TurnId, messageId: MessageId) {
    const key = turnCacheKey(threadId, turnId)
    const messageIds = this.assistantMessageIdsByTurn.get(key) ?? new Set<MessageId>()
    messageIds.add(messageId)
    this.assistantMessageIdsByTurn.set(key, messageIds)
  }

  forgetAssistantMessageId(threadId: ThreadId, turnId: TurnId, messageId: MessageId) {
    const key = turnCacheKey(threadId, turnId)
    const messageIds = this.assistantMessageIdsByTurn.get(key)
    if (!messageIds) return

    messageIds.delete(messageId)
    if (messageIds.size === 0) {
      this.assistantMessageIdsByTurn.delete(key)
      return
    }

    this.assistantMessageIdsByTurn.set(key, messageIds)
  }
```

This is safe because `assistantMessageIdsForTurn` (line 133-135) already returns
a defensive copy, so no caller holds an aliased reference to the stored `Set`.
Verify that line is unchanged before you finish this step.

Do **not** attempt the larger "replace `BoundedTtlCache` with an LRU" rewrite.
The live maps here are keyed per (thread, turn) with a two-hour TTL and hold tens
of entries against a 10k+ capacity; a real LRU buys nothing and is out of scope.

**Verify**:

```
cd apps/server && bun --bun vitest run src/orchestration && bun run typecheck
```

→ all pass; typecheck exit 0.

---

### Step 9: Full gate

```
cd apps/server && bun run format && bun run format:check && bun run lint && bun run typecheck
cd apps/server && bun run test 2>&1 | tail -30 > /tmp/040-server-test-after.txt
cd apps/server && bun run lint 2>&1 | tail -20 > /tmp/040-server-lint-after.txt
diff /tmp/040-server-test-before.txt /tmp/040-server-test-after.txt
diff /tmp/040-server-lint-before.txt /tmp/040-server-lint-after.txt
```

→ `format:check` prints `All matched files use the correct format.`; `lint`
prints nothing; typecheck exit 0.

The suite gate is the **delta**, not a number:

- **0 failures.** Not "one allowed failure" — `apps/server` was green at Step 0.
- Every test name that passed in `/tmp/040-server-test-before.txt` still passes.
- Totals up by exactly **+1 file / +6 tests** (Steps 1 and 2). No other step in
  this plan adds or deletes a test.
- No lint finding present in the after-snapshot that is absent from the
  before-snapshot.

Do **not** run root `bun run verify` as a gate. It is whole-monorepo and
short-circuits: a failure in `apps/web` or any package would mask this change
entirely, and a pass would not tell you anything more than the commands above.
`apps/web` in particular has one known unrelated failure
(`src/features/settings/tests/page.test.tsx > refuses an application-scoped key
from the workspace tab, and says why` — a `getByText` query that now matches two
elements, tracked separately), which is nothing to do with this plan and must not
block it.

Optional live check, only if you can drive a browser: the dev server is already
running at `http://localhost:5173` (do **not** start one). Open a chat thread,
send one turn, and confirm the assistant message streams in. Either way, confirm
the pipeline logged a turn end-to-end from the repo root:

```
cd /Users/shaul/Desktop/D/platform && grep -h "provider_service.send_turn.complete" logs/$(date +%Y-%m-%d)*.jsonl | tail -5
```

→ at least one `chat.pipeline.provider_service.send_turn.complete` line. If
`logs/` has no file for today because nobody used the app, that is not a
failure — skip this check and say so in your report. (Logs are JSONL at the repo
root, one file per day, with numbered continuations `YYYY-MM-DD.N.jsonl` where
the highest number is newest.)

---

## Test plan

**New tests** — 6 cases total:

- `apps/server/src/orchestration/tests/serial-worker.test.ts` _(new file, 5 cases)_
  — listed verbatim in Step 1. Structural model:
  `apps/server/src/orchestration/tests/provider-runtime-ingestion.test.ts`
  (plain `import { describe, expect, it } from 'vitest'`, a small local
  `fixture()` helper, no provider tree, no mocks).
- `apps/server/src/orchestration/tests/provider-runtime-ingestion.test.ts`
  _(1 added case)_ — `drains work enqueued after drain was called`, modelled on
  the existing `drains unawaited ingestion work when idle` at line 206. This is
  the regression test for the specific defect quoted under "Current state":
  `drain()` returning the chain tail.

**No other new tests.** The rest of this plan is behavior-preserving by
construction, and the existing suite is already the gate — it exercises every
path being rewritten:

| Suite                                                         | What it pins                                                                                                                                                                                                                                      |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/orchestration/tests/engine.test.ts`                      | the whole runtime turn (`starts a provider runtime turn and projects assistant output`, `waits for in-flight provider actions when draining the runtime`, `expires provider turn-start dedupe keys after the reactor TTL`, interrupt/stop/revert) |
| `src/orchestration/tests/checkpoint-reactor.test.ts`          | serial capture, placeholder upgrade, replay dedupe, engine-wired drain                                                                                                                                                                            |
| `src/orchestration/tests/session-checkout-reactor.test.ts`    | branch stamping and worktree ordering through `providerRuntimeIdle()`                                                                                                                                                                             |
| `src/orchestration/tests/thread-deletion-reactor.test.ts`     | cleanup dedupe, engine-wired session stop, blob reclaim                                                                                                                                                                                           |
| `src/orchestration/tests/provider-runtime-ingestion.test.ts`  | the 33 `ingest()` call sites that depend on the awaited-per-task contract                                                                                                                                                                         |
| `src/provider/tests/provider-service.test.ts`                 | `subscribeRuntimeEvents` fan-out order (`assistant.delta`, `assistant.complete`, `turn.completed`)                                                                                                                                                |
| `src/provider/tests/provider-shutdown.test.ts`                | teardown reaches the child process                                                                                                                                                                                                                |
| `src/provider/adapters/tests/codex.test.ts`, `claude.test.ts` | the adapters' own event emission through the new `subscribeEvents`                                                                                                                                                                                |

Apart from the two mechanical helper swaps in Step 6f (`collectAdapterEvents` in
`codex.test.ts`, the inline collector in `claude.test.ts`), **no assertion in any
of these files may change**. If one has to, that is a signal you changed
behavior — stop and report rather than adjusting the assertion.

**Browser tests**: none. Nothing here renders, and `apps/server` has no browser
Vitest project. Every command in this plan is `bun --bun vitest run` in
`apps/server`.

---

## Done criteria

Machine-checkable. ALL must hold. **No criterion states an absolute test count** —
each suite criterion is a delta against the Step 0 snapshot, because a total
measured at authoring time is invalidated by every sibling plan that lands.

- [ ] `cd apps/server && bun run typecheck` exits 0
- [ ] `cd apps/server && bun run lint` exits 0, and reports no finding absent from `/tmp/040-server-lint-before.txt`
- [ ] `cd apps/server && bun run format:check` exits 0
- [ ] `cd apps/server && bun run test` reports **0 failures**
- [ ] Every test that passed in `/tmp/040-server-test-before.txt` still passes
- [ ] Full-suite totals are exactly **+1 test file and +6 tests** vs. `/tmp/040-server-test-before.txt` — the new `serial-worker.test.ts` (5 cases) and the one case added to `provider-runtime-ingestion.test.ts`. No other test is added, renamed, or deleted
- [ ] `cd apps/server && bun --bun vitest run src/orchestration src/provider` reports **0 failures**, with the same **+1 file / +6 tests** delta vs. `/tmp/040-focused-test-before.txt`
- [ ] Root `bun run verify` was **not** used as a gate (it is whole-monorepo and short-circuits; `apps/web` has one unrelated known failure)
- [ ] `grep -rn "settleAdapterRuntimeEvents" apps/server/src` → no matches
- [ ] `grep -rn "streamEvents" apps/server/src` → no matches
- [ ] `grep -rn "DrainableProviderIntentWorker\|DrainableCheckpointWorker" apps/server/src` → no matches
- [ ] `grep -rn "turnStartKeys\|pruneHandledTurnStartKey" apps/server/src` → no matches
- [ ] `grep -c "purgeExpired()" apps/server/src/orchestration/provider-runtime-buffers.ts` → `2` (the definition and the one call left in `keys()`)
- [ ] `grep -rn "new SerialWorker" apps/server/src --include=*.ts | grep -v "/tests/"` → exactly 6 matches (ingestion, checkpoint, session-checkout, thread-deletion, provider-command intent worker, provider-service runtime pump). Do **not** drop the `grep -v` — `tests/serial-worker.test.ts` constructs several of its own.
- [ ] `grep -n "providerRuntimeIdle" apps/server/src/orchestration/engine.ts` → exactly one match, whose body is `return this.reactors.idle()`
- [ ] `git status --porcelain` shows no modified file outside the in-scope list
- [ ] `plans/README.md` row for 040 updated from its current `BLOCKED` status (find the row by `grep -n "^| 040" plans/README.md`; the line number moves)

---

## STOP conditions

Stop and report back (do not improvise) if:

- **A construct this plan exists to remove is already gone.** A non-empty drift
  diff is expected and is not a STOP — later sibling work shifted every line number
  here. STOP only if `settleAdapterRuntimeEvents`, `streamEvents`, one of the five
  queues, or `ProviderRuntimeIngestion.drain()`-returns-the-tail cannot be found at
  all, or if a quoted "Current state" excerpt has changed in _shape_ (not merely in
  line number). Then the premise moved and the plan needs re-planning.
- **You are tempted to route `turnPrerequisitesSettled()` through the
  `ReactorScheduler`.** It is called from `beforeTurnStart`, which runs _inside_
  the provider intent worker's own task. Draining that worker from inside itself
  deadlocks: `worker.drain()` waits on `active === false`, which cannot happen
  until the task calling it returns. `turnPrerequisitesSettled` must stay two
  direct `drain()` calls on the checkout and checkpoint reactors, in that order.
  If any verification hangs after Step 7, this is the first thing to check.
- **A test hangs instead of failing.** With the pass caps added in Steps 6 and 7,
  a non-settling pipeline should throw a structured error naming the busy
  sources. A hang means something is waiting on a drain that can never resolve —
  report the test name and the busy-source names, do not raise the cap.
- **You find a `void worker.enqueue(...)` whose handler can reject and this plan
  did not already give it a `.catch`.** Verified at `ace313f`, of the six
  handlers: `handleEventSafely` (wraps its body in try/catch, lines 136-145),
  `establish` (documented "Never rejects") and `runTask` (its only await is
  `taskOutcome`, which catches) are total. `cleanupThread` and
  `handleRuntimeEvent` are **not** — Steps 4 and 6d attach the `.catch`
  explicitly; keep them. An ignored rejecting promise becomes an unhandled
  rejection under Bun. If you find a seventh site, add the `.catch` with the
  feature's existing log action rather than changing `SerialWorker`'s contract.
- **`Promise.withResolvers` fails to typecheck.** It typechecked at `ace313f`, so
  a failure means the toolchain moved. Hand-roll the resolvers inside `enqueue`;
  do not edit `tsconfig`, `lib`, or add a polyfill package.
- **Any existing assertion has to change to pass.** Every step of this plan is
  behavior-preserving except two explicitly named changes: session-checkout work
  becomes globally serial (Step 4) and `providerRuntimeIdle()` now also settles
  thread deletion (Step 7). If a third behavior change appears, report it.
- **A codex/claude adapter test starts seeing an extra leading event after Step
  6f.** The pull iterator only registered its subscriber when the `for await`
  first pulled — one microtask after `collectAdapterEvents` was called
  (`codex.test.ts:1175`, `claude.test.ts:815`). `subscribeEvents` registers
  synchronously, so it can now capture an event published in that gap. That is a
  third behavior change beyond the two this plan sanctions: report it with the
  test name and the extra event's `type`, do not silence it by deferring the
  subscribe.
- **A step's verification fails twice after a reasonable fix attempt.** There is no
  carve-out. `apps/server` is green at Step 0 — the watcher-classification fix resolved the native-watcher
  classification bug (`f93dd1d`, `1f8eb0d`) that used to be the one excused
  failure. Any red test after Step 0 is caused by this plan. The only exception is
  a failure you **recorded by name** in the Step 0 snapshot; if you did not record
  it, it is yours.
- **The fix appears to require touching an out-of-scope file** — in particular
  `engine.ts`'s own `dispatch` queue, or any `apps/web` file.

---

## Maintenance notes

**What a reviewer should scrutinize, in priority order:**

1. **`ProviderService.handleRuntimeEvent`'s two guards.** The old
   `consumeAdapterEvents` checked `shuttingDown` and instance liveness _on
   arrival_, and its comment says why: an extra microtask between an adapter
   event and the binding write lets a later write be overwritten by an earlier
   event. The new handler must check both in the same place, before
   `recordRuntimeEvent`. Getting this wrong reintroduces a session-status
   overwrite bug that will not show up in any test.
2. **`ProviderCommandReactor.isIdle()`'s four terms.** Dropping any one of them
   silently restores the old "drained once, called it idle" behavior. The only
   test that would catch it is `waits for in-flight provider actions when
draining the runtime` (engine.test.ts:691), and it only covers the
   `pendingProviderActions` term.
3. **Nothing re-adds a sleep.** `grep -rn "setTimeout" apps/server/src/provider`
   should stay empty of settle-shaped helpers. If a future ordering problem
   appears, the answer is a new `IdleSource`, not a timer.

**What will interact with this later:**

- Adding a reactor is now two lines: build it, `reactors.register({...})`. If a
  new reactor is _not_ registered it will silently never be drained — which is
  exactly the `ThreadDeletionReactor` bug this plan fixes. Consider making
  registration part of `subscribeDomainEvents` if a third un-registered reactor
  ever appears.
- The completed projection collapse and session-status normalization both
  landed after this plan was authored. Reconcile the current pipeline and
  `settledTurnStateForSessionStatus` call during the drift check; neither changes
  this plan's queue ownership.

**Deliberately deferred:**

- **`OrchestrationEngine`'s own `queue`** stays a bare promise chain. It
  serializes a synchronous database transaction and returns the caller's result;
  it has no drain contract and no idleness question. Converting it would change
  `dispatch()`'s signature for zero benefit.
- **The bigger `BoundedTtlCache` rewrite** (real LRU, timer-driven expiry) is
  explicitly not worth it: the live map is keyed per (thread, turn) with a
  two-hour TTL and holds tens of entries, nowhere near the capacity ceiling.
  Step 8 takes only the free half.
- **`ProviderCommandReactor` never unsubscribes** its runtime-event listener
  (`provider-command-reactor.ts:100` discards the returned unsubscribe). That is
  a pre-existing leak, unrelated to queue unification, and fixing it needs a
  reactor lifecycle the engine does not have yet.
- **`ProviderRuntimeEventStream` has no backpressure.** Push moves the unbounded
  buffer from the iterator's local array into `SerialWorker`'s array — same
  memory profile, same ordering, no regression, but also no improvement. If a
  provider ever floods faster than ingestion drains, that is the place to add a
  bound.
