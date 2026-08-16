# Plan 023: Stop rebuilding the chat projection once per streamed token delta

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
> git diff --stat ace313f -- \
>   apps/web/src/features/chat/state/chat-projection-writers.ts \
>   apps/web/src/features/chat/state/chat-optimistic-store.ts \
>   apps/web/src/features/chat/components/chat-view.tsx \
>   apps/web/src/features/chat/lib/chat-work-log.ts \
>   apps/web/src/features/chat/state/tests/chat-projection-writers.test.ts \
>   apps/web/src/features/chat/lib/tests/chat-work-log.test.ts
> ```
>
> (No `..HEAD` — that form compares commits only, and would miss an in-scope
> file that is dirty in the working tree.) At the time this plan was written the
> command printed **nothing** (no diff, and every in-scope file was clean).
> If any in-scope file changed since, compare the "Current state" excerpts
> against the live code before proceeding; on a mismatch, treat it as a STOP
> condition.
>
> **Path note**: if `apps/web/src/features/chat/lib/` no longer exists,
> `plans/011-chat-lib-utils-collapse.md` landed first and renamed two files —
> `lib/chat-work-log.ts` → `utils/work-log.ts` and `lib/chat-timeline-items.ts`
> → `utils/timeline-items.ts`, and `lib/tests/chat-work-log.test.ts` →
> `utils/tests/work-log.test.ts`. Substitute those paths everywhere below; the
> contents and every instruction are otherwise unchanged. Nothing else moves.
>
> **Pre-existing failures**: this repo's working tree may already carry
> unrelated modifications (a settings-feature WIP was in progress when this plan
> was written) that make the _repo-wide_ gates fail before you touch anything.
> Every gate in this plan is therefore scoped to `apps/web/src/features/chat`.
> Do not "fix" a failure in a file you did not edit — that is an out-of-scope
> modification.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `ace313f`, 2026-08-16

This plan closes an instance of cross-cutting theme **T6 — "right gate, wrong
data structure behind it"** (see `plans/README.md`): a correct predicate guards
an operation that then does full-collection work. Step 4 also removes one
instance of **T1 — parallel hand-maintained representations of one truth**: the
order of a thread's activities is currently established twice, by two
comparators that can disagree.

**Must land before `plans/037-normalize-chat-thread.md`** (chat thread
normalization). Plan 037 rewrites the five parallel per-thread records this plan
touches; doing 037 first means writing this optimization twice.

## Why this matters

`applyThreadMessageSentEvent` runs **once per streamed assistant token delta**.
There is no batching anywhere between the provider and the store: the server
turns every `thread.message.assistant.delta` command into one
`thread.message-sent` event, and the client applies one store write per streamed
item. Per delta, that handler currently does a linear `includes` scan of the id
list, a full spread of the per-thread message record, a `new Set(...)` over
every retained id, and a two-pass `Object.entries → flatMap → fromEntries`
rebuild of the whole record — four to five O(N) passes plus one throwaway array
per key, where N is the entire retained transcript (cap: 2,000 messages), not
the delta. The cost therefore grows with conversation length, so long sessions
degrade exactly when the user has invested the most in them.

On top of that, `ChatView` builds a `Set` of every message id in the thread on
every delta and hands it to the optimistic-message store, which then increments
log counters and drives a debouncer before discovering there is nothing to
clear. Optimistic messages only exist in the ~200 ms window between clicking
send and the server echoing the message back; for the entire rest of a streaming
turn this is pure waste.

Separately, `chat-work-log.ts` re-sorts the store's already-ordered activities
with a comparator that looks only at `createdAt`, while the store orders by
`(sequence, createdAt, id)`. **These two orders can contradict each other** —
that is a latent correctness bug, not just redundant work, and it is fixed here.

After this plan: the steady-state streaming delta is a single record spread and
nothing else; the optimistic store bails in O(1); and the thread's activity
order is established once, by the store.

### The structural alternative (stated, deliberately not taken)

`AGENTS.md` requires naming the structural fix before tuning an implementation.
The bigger win is **coalescing deltas before they reach the store**:
`apps/web/src/features/chat/state/thread-detail-subscriptions.ts:340` applies one
store write per streamed event with no batching, and each of those writes also
forces a full timeline re-projection (`chat-timeline-items.ts`, 778 lines) and a
virtualizer pass. Batching deltas into one animation frame would cut the render
side as well as the reducer side, and would beat every local tweak here.

It is **not** in this plan because it changes observable streaming smoothness,
it interacts with the timeline's 108 lines of hand-rolled identity sharing (whose
value the audit found unmeasured — no chat component uses `React.memo`), and it
overlaps plan 037. Do this plan first: it is cheap and nearly behaviour-neutral
(two deliberate exceptions, both listed in "Maintenance notes"), and
it makes the reducer cost small enough that a later coalescing measurement can
attribute what is left to the render side.

## Current state

### Files and roles

- `apps/web/src/features/chat/state/chat-projection-writers.ts` (1,566 lines) —
  the client-side event fold. `applyThreadMessageSentEvent` (761–803) and
  `applyThreadActivityAppendedEvent` (805–841) are the hot handlers; the record
  helpers are at 1,449–1,538.
- `apps/web/src/features/chat/state/chat-cache-constants.ts` — the caps this
  cost scales to.
- `apps/web/src/features/chat/state/chat-optimistic-store.ts` (181 lines) —
  zustand store for messages that exist only until the server echoes them.
- `apps/web/src/features/chat/components/chat-view.tsx` (395 lines) — the only
  caller of `clearResolvedOptimisticMessages`.
- `apps/web/src/features/chat/lib/chat-work-log.ts` (403 lines) — derives work-log
  rows from a thread's activities.
- `apps/web/src/features/chat/state/tests/chat-projection-writers.test.ts`
  (785 lines, 13 tests) — the existing pass/fail signal for the writers.
- `apps/web/src/features/chat/lib/tests/chat-work-log.test.ts` (10 tests). Note:
  unlike the writers test, this file imports `{ describe, expect, it }` from
  `vitest` and wraps its cases in one `describe('chat work log entries', ...)`.
  Match that file's own style when you add to it.

### The caps (`chat-cache-constants.ts:1-4`, verbatim)

```ts
export const CHAT_MESSAGE_CACHE_LIMIT = 2_000
export const CHAT_CHECKPOINT_CACHE_LIMIT = 500
export const CHAT_PROPOSED_PLAN_CACHE_LIMIT = 200
export const CHAT_ACTIVITY_CACHE_LIMIT = 500
```

### `chat-projection-writers.ts:761-803` — the per-delta handler

```ts
function applyThreadMessageSentEvent(
  state: ChatProjectionState,
  event: Extract<OrchestrationEvent, { type: 'thread.message-sent' }>,
): ChatProjectionState {
  const threadId = event.payload.threadId
  const message = messageFromEvent(event)
  const currentIds = state.messageIdsByThreadId[threadId] ?? []
  const currentById = state.messageByThreadId[threadId] ?? {}
  const nextMessage = mergeMessage(currentById[message.id], message)
  const appendedIds = appendId(currentIds, message.id)
  const nextIds = boundedTail(appendedIds, CHAT_MESSAGE_CACHE_LIMIT, currentIds.length)
  const nextById = retainRecordKeys(
    {
      ...currentById,
      [message.id]: nextMessage,
    },
    new Set(nextIds),
  )

  const nextState = patchThreadShell(
    markTrimmedFront(
      {
        ...state,
        messageByThreadId: {
          ...state.messageByThreadId,
          [threadId]: nextById,
        },
        messageIdsByThreadId: {
          ...state.messageIdsByThreadId,
          [threadId]: nextIds,
        },
      },
      threadId,
      appendedIds.length - nextIds.length,
    ),
    threadId,
    {
      updatedAt: event.payload.updatedAt,
    },
  )

  return writeAssistantMessageTurnState(nextState, event)
}
```

### `chat-projection-writers.ts:805-841` — the activity handler

```ts
function applyThreadActivityAppendedEvent(
  state: ChatProjectionState,
  event: Extract<OrchestrationEvent, { type: 'thread.activity-appended' }>,
): ChatProjectionState {
  const activity = {
    ...event.payload.activity,
    sequence: event.payload.activity.sequence ?? event.sequence,
  }
  const threadId = event.payload.threadId
  const currentById = state.activityByThreadId[threadId] ?? {}
  const activities = recordValues<OrchestrationThreadActivity>({
    ...currentById,
    [activity.id]: activity,
  }).sort(compareActivities)
  const heldCount = state.activityIdsByThreadId[threadId]?.length ?? 0
  const cappedActivities = boundedTail(activities, CHAT_ACTIVITY_CACHE_LIMIT, heldCount)
  const nextIds = cappedActivities.map((entry) => entry.id)

  return writeTurnFailureState(
    markTrimmedFront(
      {
        ...patchThreadShell(state, threadId, { updatedAt: activity.createdAt }),
        activityByThreadId: {
          ...state.activityByThreadId,
          [threadId]: recordById(cappedActivities, (entry) => entry.id),
        },
        activityIdsByThreadId: {
          ...state.activityIdsByThreadId,
          [threadId]: nextIds,
        },
      },
      threadId,
      activities.length - cappedActivities.length,
    ),
    activity,
  )
}
```

### The helpers it leans on (`chat-projection-writers.ts:1449-1538`)

```ts
function appendId<T extends string>(ids: readonly T[], id: T): T[] {
  if (ids.includes(id)) return ids as T[]

  return [...ids, id]
}
```

```ts
function retainRecordKeys<TKey extends string, TValue>(
  record: Record<TKey, TValue>,
  keys: ReadonlySet<TKey>,
): Record<TKey, TValue> {
  return Object.fromEntries(
    Object.entries(record).flatMap(([key, value]) =>
      keys.has(key as TKey) ? [[key, value] as const] : [],
    ),
  ) as Record<TKey, TValue>
}

function recordValues<TValue>(record: object): TValue[] {
  return Object.values(record) as TValue[]
}
```

```ts
function recordById<TValue, TKey extends string>(
  values: readonly TValue[],
  getKey: (value: TValue) => TKey,
): Record<TKey, TValue> {
  return Object.fromEntries(values.map((value) => [getKey(value), value] as const)) as Record<
    TKey,
    TValue
  >
}
```

The store's authoritative activity comparator, `chat-projection-writers.ts:1529-1538`:

```ts
function compareActivities(left: OrchestrationThreadActivity, right: OrchestrationThreadActivity) {
  const leftSequence = left.sequence ?? Number.MAX_SAFE_INTEGER
  const rightSequence = right.sequence ?? Number.MAX_SAFE_INTEGER

  return (
    leftSequence - rightSequence ||
    left.createdAt.localeCompare(right.createdAt) ||
    left.id.localeCompare(right.id)
  )
}
```

And the trimming helper, `chat-projection-writers.ts:143-155` (note the comment —
its semantics must not change):

```ts
/**
 * The cache limit bounds what the live stream may grow to on its own; it must
 * not shrink a transcript the user explicitly paged back into, so an already
 * expanded thread keeps its length and slides forward instead. ...
 */
function boundedTail<TValue>(rows: TValue[], limit: number, heldCount: number): TValue[] {
  const max = Math.max(limit, heldCount)
  if (rows.length <= max) return rows

  return rows.slice(-max)
}
```

### The invariant this plan relies on (verified)

**`*IdsByThreadId[threadId]` is always exactly the ordered key list of
`*ByThreadId[threadId]`.** Every writer in `chat-projection-writers.ts` writes
the two together, from the same array, in the same object literal — lines
104–119, 191–194, 577–592, 784–791, 827–834, 941–954, 1210–1213. There is no
code path that adds an id without adding the record entry. That is what makes
`byId[id] !== undefined` a valid, O(1) replacement for `ids.includes(id)`.

### The sequence guard you will trip over when writing events (`chat-projection-writers.ts:271-277, 366-376`)

```ts
function shouldApplyThreadSequence(state, threadId, sequence) {
  return sequence > (state.threadDetailSequenceById[threadId] ?? 0)
}

function applyThreadEventWithSequenceGuard(state, event) {
  const threadId = event.payload.threadId
  if (!shouldApplyThreadSequence(state, threadId, event.sequence)) return state
  ...
}
```

**Every `thread.*` event you synthesise must carry a strictly increasing
`event.sequence`, and the first one must be `>= 1`.** An event with
`sequence: 0` on a fresh state is silently dropped (`0 > 0` is false), and the
call returns the state unchanged with no error. This bites the benchmark in
Step 1 and the new tests in the test plan — both start their loops at 1 for
exactly this reason.

### `chat-optimistic-store.ts:66-92` — the log-before-guard problem

```ts
  clearResolvedOptimisticMessages: (threadId, resolvedMessageIds) => {
    recordOptimisticMutation('clearResolved', {
      resolvedMessageCount: resolvedMessageIds.size,
      threadId,
    })
    set((state) => clearResolvedMessages(state, threadId, resolvedMessageIds))
  },
```

```ts
function recordOptimisticMutation(kind: string, context: Record<string, unknown>) {
  const scope = currentOptimisticLogScope()
  scope.increment('optimistic.mutationCount')
  scope.increment(`optimistic.${kind}Count`)
  scope.set({
    optimistic: {
      latest: {
        kind,
        ...context,
      },
    },
  })
  optimisticLogFlush.maybeExecute()
}
```

The actual guard is five lines further down, at `chat-optimistic-store.ts:130-131`:

```ts
const messages = state.messagesByThreadId[threadId]
if (!messages) return state
```

and `replaceThreadMessages` (160–181) **deletes the thread key** when the last
optimistic message resolves — so `messagesByThreadId[threadId]` really is
`undefined` in the common case, and the guard is a plain O(1) lookup.

### `chat-view.tsx:118-127` — the caller

```tsx
useEffect(() => {
  if (!thread) return

  useChatOptimisticStore
    .getState()
    .clearResolvedOptimisticMessages(
      thread.id,
      new Set(thread.messages.map((message) => message.id)),
    )
}, [thread])
```

`thread` is a fresh object on every delta (the projection writes a new
`messageByThreadId`, the selector rebuilds `ChatThread`), so this effect and its
`Set` allocation run once per token.

### `chat-work-log.ts:69-96` and `:146-148` — the contradicting sort

```ts
export function chatWorkLogEntries({
  activities,
}: {
  activities: readonly OrchestrationThreadActivity[]
}) {
  const ordered = [...activities].toSorted(compareActivities)
  const planRows = turnPlanRows(ordered)
  const entries: DerivedChatWorkLogEntry[] = []

  for (const activity of ordered) {
```

```ts
function compareActivities(left: OrchestrationThreadActivity, right: OrchestrationThreadActivity) {
  return left.createdAt.localeCompare(right.createdAt)
}
```

Two problems. `[...activities].toSorted(...)` makes **two** copies (`toSorted`
already returns a new array). And this comparator ignores `sequence`, so for two
activities where `sequence` and `createdAt` disagree — e.g. `{sequence: 5,
createdAt: "…T10"}` followed by `{sequence: 6, createdAt: "…T09"}` — the store
renders them in one order and the work log in the other.

The only production caller is `chat-timeline-items.ts:157`,
`chatWorkLogEntries({ activities })`, where `activities` is `thread.activities`
straight out of the store selector — i.e. already in `(sequence, createdAt, id)`
order. The store's order is the contract.

### Repo conventions that apply here (`AGENTS.md`, quoted verbatim — you have not read it)

> - Keep nesting depth to 3 or less.
> - Use guard clauses and early returns. Keep the happy path shallow.
> - In loops, use inverted conditions with `continue` instead of wrapping the body in `if`.
> - Do not use `else` after an early return.
> - Never use nested ternaries. Split the logic into `if` statements or a named helper.

> - Do not repeat the folder name in file or symbol names.
> - Delete obsolete tests instead of preserving old behavior.

> - This project is greenfield and not live: no releases, no external users, no data anyone needs migrated.
> - No backward compatibility shims, no legacy aliases, no deprecation windows. Update every call site in the same pass.

> - Measure before and after. An optimization without a benchmark or profile is a guess.

> - Never throw `new Error`. Create errors with `createError` from `evlog` — in practice through the feature's `structured-errors.ts` wrapper.

> - Logging is wide-event style (evlog). Always prefer wide logs: enrich the one event per operation/request with more fields instead of emitting extra narrow log lines.

> - A dev server is always running. Never spin up your own server to test or verify changes — reuse the running one.

> - Import `{ test, expect }` from `apps/web/test/fixtures.ts`, not from `vitest`, for app tests.
> - Do not `mock.module` or `vi.mock` our server, client, or feature modules.

> - Avoid manual React memoization. Do not add `memo`, `useMemo`, or `useCallback` for ordinary render values or callbacks. Use them only for measured performance issues, required stable identity, or correctness. Add a short reason when you do.

Nothing in this plan needs a new error, a new log line, a new setting, or any
styling. If you find yourself adding one, you have gone out of scope.

## Commands you will need

All commands run from the repo root unless the `cd` is shown.

| Purpose             | Command                                                                                                            | Expected on success                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Chat writer tests   | `cd apps/web && bun --bun vitest run --project node src/features/chat/state/tests/chat-projection-writers.test.ts` | exit 0; `Tests 13 passed` before your changes                           |
| Work-log tests      | `cd apps/web && bun --bun vitest run --project node src/features/chat/lib/tests/chat-work-log.test.ts`             | exit 0; `Tests 10 passed` before your changes                           |
| All chat tests      | `cd apps/web && bun --bun vitest run --project node --project dom src/features/chat`                               | exit 0; `Test Files 103 passed`, `Tests 792 passed` before your changes |
| Web typecheck       | `cd apps/web && bun run typecheck`                                                                                 | exit 0; output is exactly `$ tsgo --build`                              |
| Chat lint           | `cd apps/web && bunx oxlint src/features/chat`                                                                     | exit 0, no warnings under `src/features/chat`                           |
| Chat format (write) | `cd apps/web && bunx oxfmt --write src/features/chat`                                                              | exit 0                                                                  |
| Chat format (check) | `cd apps/web && bunx oxfmt --check src/features/chat`                                                              | `All matched files use the correct format.`                             |

Notes:

- **Verified baselines at commit `ace313f`**, so you can tell your breakage from
  the repo's: the whole chat suite is `103 files / 792 tests`, all passing;
  `cd apps/web && bun run typecheck` exits 0; `bunx oxlint src/features/chat`
  is clean.
- The chat suite prints **`error: ECONNREFUSED`** stack traces during the run.
  That is the client log drain trying to POST to a server that is not running.
  It is pre-existing noise, not a failure. Judge only the final
  `Test Files … passed` / `Tests … passed` summary lines.
- **Do not use the repo-wide gates** `bun run verify`, `cd apps/web && bun run
lint`, or `cd apps/web && bun run format:check`. At `ace313f` with the
  working tree as it was, `format:check` already failed on
  `src/features/settings/hooks/use-setting-inspection.ts` and `oxlint .`
  already printed seven warnings — all in files this plan must not touch. The
  scoped commands above are the gate.
- The `--bun` flag is required for every `vitest` invocation in `apps/web`.
  Without it `bun:sqlite` and `Bun.spawn` do not resolve.
- Do **not** run `bun run test:browser` for this plan — no browser test is involved, and that project is known to hang at the RUN banner in this repo.
- Do **not** start a dev server. One is already running at `http://localhost:5173`.

## Scope

**In scope** (the only files you may modify):

- `apps/web/src/features/chat/state/chat-projection-writers.ts`
- `apps/web/src/features/chat/state/chat-optimistic-store.ts`
- `apps/web/src/features/chat/components/chat-view.tsx`
- `apps/web/src/features/chat/lib/chat-work-log.ts`
- `apps/web/src/features/chat/state/tests/chat-projection-writers.test.ts` (add tests)
- `apps/web/src/features/chat/lib/tests/chat-work-log.test.ts` (add one test)
- `apps/web/src/features/chat/state/tests/chat-optimistic-store.test.ts` (create)
- `plans/README.md` (status row only, at the very end)

Plus one file created and then **deleted** inside this plan:
`apps/web/src/features/chat/state/tests/projection-delta-bench.test.ts`.

**Out of scope** (do NOT touch, even though they look related):

- `apps/web/src/features/chat/lib/chat-timeline-items.ts` — the two
  `messages.toSorted(compareMessagesByCreatedAt)` calls at lines 572 and 595 look
  like the same redundancy, but they are **not**. The store never sorts messages
  (`messageIdsByThreadId` is arrival order), and `timelineMessages` appends
  optimistic messages after the resolved ones, so those sorts are load-bearing.
  Removing them is a silent behaviour change typecheck cannot catch.
- `apps/web/src/features/chat/components/messages-timeline.tsx` — the timeline
  `useMemo` re-runs because the activities array content changed, which this plan
  does not and cannot prevent. Touching it buys nothing here.
- `apps/web/src/features/chat/state/thread-detail-subscriptions.ts` — batching
  store writes is the structural alternative named above; it is a separate,
  riskier change.
- `retainThreadScopedRecord` (`chat-projection-writers.ts:1459-1468`) — same
  `flatMap` shape as `retainRecordKeys`, but it runs on shell snapshots, not per
  delta. Leave it.
- The body of `retainRecordKeys` (`chat-projection-writers.ts:1470-1479`) — after
  Step 2 it runs only on a trim, roughly once per turn instead of once per token.
  Rewriting its `entries → flatMap → fromEntries` as a loop is a real but
  invisible win and widens the diff. Leave it.
- `apps/web/src/features/chat/state/chat-projection-selectors.ts` — `collectByIds`
  rebuilds the messages array every delta because its `WeakMap` is keyed on
  `(idsArray, byIdObject)` identity and `byId` is a new object each time. That is
  structural (plan 037), not a local tweak. Do not touch the selectors.
- `apps/web/src/features/chat/lib/chat-pipeline-logging.ts` and
  `apps/web/src/lib/client-logging.ts` — the `ECONNREFUSED` noise in the test
  output comes from here. It is pre-existing and harmless. Do not silence it,
  do not add a guard, do not change the log drain.
- Every file already modified in the working tree when you started (run
  `git status --short` first and write the list down). Several are settings-feature
  WIP and some are not oxfmt-clean. Do not format them, do not fix their lint
  warnings, do not revert them.
- `packages/editor-*` — these are symlinks to a sibling checkout, never in scope.
- Anything in `apps/server/` — the server side of this stream is correct; the
  waste is entirely client-side.

## Git workflow

- **All work happens on `main`** — no new branches, worktrees, commits, pushes,
  or PRs unless the operator explicitly asks.
- If (and only if) the operator asks you to commit: conventional commits,
  lowercase descriptive subject. Real examples from `git log`:
  - `refactor(orchestration): the server prepares a session's worktree (M-C)`
  - `fix(address): bound the URL, and stop escaping slashes in ?tabs=`
    A fitting subject here: `perf(chat): append streamed rows instead of rebuilding the thread slice`.

## Steps

### Step 1: Record the baseline with a temporary benchmark

`AGENTS.md` requires a measurement. Create
`apps/web/src/features/chat/state/tests/projection-delta-bench.test.ts` with
**exactly** this content:

```ts
// TEMPORARY — created and deleted inside plans/023-chat-per-delta-work.md.
// Not a test: a stopwatch over the streaming-delta reducer path.
import {
  commandIdSchema,
  eventIdSchema,
  messageIdSchema,
  threadIdSchema,
  turnIdSchema,
  type OrchestrationEvent,
} from '@workspace/contracts'
import * as v from 'valibot'

import { expect, test } from '../../../../../test/fixtures'
import { createInitialChatProjectionState } from '../chat-projection-store'
import { applyChatProjectionEvent } from '../chat-projection-writers'

const THREAD_ID = v.parse(threadIdSchema, 'bench-thread')
const TURN_ID = v.parse(turnIdSchema, 'bench-turn')
const HISTORY = 2_000
const DELTAS = 500

function at(index: number) {
  return new Date(Date.UTC(2026, 0, 1) + index * 1_000).toISOString()
}

function messageEvent(
  sequence: number,
  messageId: string,
  text: string,
  streaming: boolean,
): OrchestrationEvent {
  return {
    actorKind: 'provider',
    aggregateId: THREAD_ID,
    aggregateKind: 'thread',
    causationEventId: null,
    commandId: v.parse(commandIdSchema, `command-${sequence}`),
    correlationId: v.parse(commandIdSchema, `command-${sequence}`),
    eventId: v.parse(eventIdSchema, `event-${sequence}`),
    metadata: {},
    occurredAt: at(sequence),
    payload: {
      attachments: [],
      createdAt: at(sequence),
      messageId: v.parse(messageIdSchema, messageId),
      role: 'assistant',
      streaming,
      text,
      threadId: THREAD_ID,
      turnId: TURN_ID,
      updatedAt: at(sequence),
    },
    sequence,
    type: 'thread.message-sent',
  }
}

// The 60s timeout is not decoration: Vitest's default is 5s, this repo sets no
// override, and building 2,000 history messages through the *unoptimised*
// reducer is quadratic. Without it the BEFORE run can time out and you would
// have no baseline.
test('BENCH streamed deltas into a full-cap transcript', () => {
  let state = createInitialChatProjectionState()
  // Sequences start at 1: `applyThreadEventWithSequenceGuard` drops an event
  // whose sequence is not > 0, silently and without error.
  for (let index = 1; index <= HISTORY; index += 1) {
    state = applyChatProjectionEvent(state, messageEvent(index, `message-${index}`, 'x', false))
  }

  const started = performance.now()
  for (let index = 0; index < DELTAS; index += 1) {
    // One streaming id, re-sent DELTAS times. It is a 2,001st id, so the *first*
    // delta trims one row through the slow path and the remaining 499 are pure
    // steady state — which is what this is measuring.
    state = applyChatProjectionEvent(
      state,
      messageEvent(HISTORY + 1 + index, 'message-streaming', 'tok ', true),
    )
  }
  const elapsed = performance.now() - started

  console.log(
    `[bench] ${DELTAS} deltas over ${HISTORY} held messages: ${elapsed.toFixed(1)}ms total, ${(
      elapsed / DELTAS
    ).toFixed(4)}ms/delta`,
  )
  expect(state.messageIdsByThreadId[THREAD_ID]?.length).toBe(HISTORY)
}, 60_000)
```

Run it three times and write down the **lowest** `ms/delta` figure:

```bash
cd apps/web && bun --bun vitest run --project node src/features/chat/state/tests/projection-delta-bench.test.ts
```

**Verify**: the run reports `Tests 1 passed` and prints a `[bench] …` line
containing `ms/delta`. Record the lowest of the three — call it `BEFORE`. You
will compare against it in Step 6.

If the file fails to typecheck, or the run reports `Tests 0 passed`, or the
`toBe(HISTORY)` assertion fails, STOP: the event shape or the sequence guard has
drifted from what this plan assumes. Do not "fix" the bench to make it pass.

Note: this file lives under `src/features/chat/`, so it will also appear in the
whole-chat-suite runs in Steps 3 and 5 (`Test Files 104`, one extra test, plus a
`[bench]` line). That is expected until Step 6 deletes it.

### Step 2: Give the message handler an O(1) append and a guarded trim

In `apps/web/src/features/chat/state/chat-projection-writers.ts`, replace the
first block of `applyThreadMessageSentEvent` (lines 765–778 in the excerpt above)
with:

```ts
const threadId = event.payload.threadId
const message = messageFromEvent(event)
const currentIds = state.messageIdsByThreadId[threadId] ?? []
const currentById = state.messageByThreadId[threadId] ?? {}
const heldMessage = currentById[message.id]
const nextMessage = mergeMessage(heldMessage, message)
// The id list and the by-id record are written together by every writer in
// this file, so record membership *is* the id-list membership test. A streamed
// delta re-sends an id that is already held, and this runs once per token: a
// linear `includes` over the retained transcript is the wrong instrument.
const appendedIds = heldMessage ? currentIds : [...currentIds, message.id]
const nextIds = boundedTail(appendedIds, CHAT_MESSAGE_CACHE_LIMIT, currentIds.length)
const grownById = {
  ...currentById,
  [message.id]: nextMessage,
}
// Only a trim can drop keys, and the steady-state delta never trims — so the
// record rebuild is paid on the rare append that crosses the cap, not per token.
const nextById =
  nextIds.length === appendedIds.length ? grownById : retainRecordKeys(grownById, new Set(nextIds))
```

Leave the rest of the function (the `patchThreadShell(markTrimmedFront(...))`
block and the `writeAssistantMessageTurnState` return) **exactly** as it is.

`appendId` is still used at lines 490 and 1407 — do **not** delete it.

**Verify**:

```bash
cd apps/web && bun --bun vitest run --project node src/features/chat/state/tests/chat-projection-writers.test.ts
```

→ `Tests 13 passed`.

```bash
cd apps/web && bun run typecheck
```

→ exit 0.

### Step 3: Give the activity handler a tail-append fast path

Still in `chat-projection-writers.ts`. Add `type EventId` to the existing
`@workspace/contracts` import at the top of the file (keep the list
alphabetical — it goes immediately after `DEFAULT_RUNTIME_MODE,` and before
`type OrchestrationCheckpointSummary,`).

Replace `applyThreadActivityAppendedEvent` (805–841) with:

```ts
function applyThreadActivityAppendedEvent(
  state: ChatProjectionState,
  event: Extract<OrchestrationEvent, { type: 'thread.activity-appended' }>,
): ChatProjectionState {
  const activity = {
    ...event.payload.activity,
    sequence: event.payload.activity.sequence ?? event.sequence,
  }
  const threadId = event.payload.threadId
  const currentIds = state.activityIdsByThreadId[threadId] ?? []
  const currentById = state.activityByThreadId[threadId] ?? {}
  const appended = appendActivity(currentIds, currentById, activity)
  const nextIds = boundedTail(appended.ids, CHAT_ACTIVITY_CACHE_LIMIT, currentIds.length)
  const nextById =
    nextIds.length === appended.ids.length
      ? appended.byId
      : retainRecordKeys(appended.byId, new Set(nextIds))

  return writeTurnFailureState(
    markTrimmedFront(
      {
        ...patchThreadShell(state, threadId, { updatedAt: activity.createdAt }),
        activityByThreadId: {
          ...state.activityByThreadId,
          [threadId]: nextById,
        },
        activityIdsByThreadId: {
          ...state.activityIdsByThreadId,
          [threadId]: nextIds,
        },
      },
      threadId,
      appended.ids.length - nextIds.length,
    ),
    activity,
  )
}

/**
 * Activities arrive in `sequence` order, so the append is a tail push. The full
 * rebuild-and-sort is kept for the cases that are not a tail push — an id already
 * held (a revision), an out-of-order replay, or a snapshot row carrying no
 * `sequence` (which `compareActivities` sorts last) — so as long as the held
 * slice is already sorted, the order this produces is identical to sorting every
 * time. The slice is sorted by construction: every writer that builds it either
 * sorts or takes the server's order.
 */
function appendActivity(
  ids: readonly EventId[],
  byId: Record<EventId, OrchestrationThreadActivity>,
  activity: OrchestrationThreadActivity,
): { byId: Record<EventId, OrchestrationThreadActivity>; ids: EventId[] } {
  const lastId = ids.at(-1)
  const last = lastId ? byId[lastId] : undefined
  const isTailAppend =
    byId[activity.id] === undefined && (!last || compareActivities(last, activity) < 0)
  if (isTailAppend) {
    return {
      byId: { ...byId, [activity.id]: activity },
      ids: [...ids, activity.id],
    }
  }

  const ordered = recordValues<OrchestrationThreadActivity>({
    ...byId,
    [activity.id]: activity,
  }).sort(compareActivities)

  return {
    byId: recordById(ordered, activityKey),
    ids: ordered.map(activityKey),
  }
}
```

`activityKey` already exists at `chat-projection-writers.ts:139-141` — reuse it,
do not redefine it. Place `appendActivity` directly beneath
`applyThreadActivityAppendedEvent`.

The `const isTailAppend = …` line above is 104 characters; oxfmt's `printWidth`
is 100, so it will be rewrapped. That is expected — Step 6 runs the formatter.
Do not hand-wrap it into something else.

Note the one deliberate semantic detail: the fast path reads the _ordered ids
array_ to find the last activity, whereas the old code read `Object.values` of
the record. Both are the same set; the ids array is the one that carries the
order, so this is strictly more correct.

**Verify**:

```bash
cd apps/web && bun --bun vitest run --project node --project dom src/features/chat
```

→ all pass.

```bash
cd apps/web && bun run typecheck
```

→ exit 0.

### Step 4: Delete the contradicting re-sort in the work log (correctness)

This is the correctness fix, not a perf tweak — treat it as the step a reviewer
will look hardest at.

In `apps/web/src/features/chat/lib/chat-work-log.ts`:

1. Replace lines 74–78 so the function consumes the caller's order directly, and
   extend the existing doc comment above `chatWorkLogEntries` to state the
   contract:

```ts
/**
 * Every turn's work is derived, not just the running one: scrolling back through a
 * finished thread must still show the tool calls, reasoning and approvals that produced it.
 *
 * The caller passes the store's order — `(sequence, createdAt, id)`, established
 * once in `chat-projection-writers.ts`. Re-sorting here by `createdAt` alone used
 * to be able to contradict it, so the rows and the transcript disagreed. The store
 * is the authority; do not re-establish the order.
 */
export function chatWorkLogEntries({
  activities,
}: {
  activities: readonly OrchestrationThreadActivity[]
}) {
  const planRows = turnPlanRows(activities)
  const entries: DerivedChatWorkLogEntry[] = []

  for (const activity of activities) {
```

2. Delete the now-unused local `compareActivities` at lines 146–148 **in this
   file only**. Do not touch the one in `chat-projection-writers.ts:1529`.

`turnPlanRows` already accepts `readonly OrchestrationThreadActivity[]`
(`chat-work-log.ts:173`), so no signature change is needed.

**Verify**:

```bash
cd apps/web && bun --bun vitest run --project node src/features/chat/lib/tests/chat-work-log.test.ts
```

→ `Tests 10 passed`. (All existing fixtures already pass activities in ascending
order, so nothing should change.)

```bash
grep -n "compareActivities" apps/web/src/features/chat/lib/chat-work-log.ts
```

→ no matches.

```bash
grep -rn "chatWorkLogEntries" apps/web/src --include='*.ts' --include='*.tsx' | grep -v '/tests/'
```

→ exactly these three lines, and no others:

```
apps/web/src/features/chat/lib/chat-work-log.ts:69:export function chatWorkLogEntries({
apps/web/src/features/chat/lib/chat-timeline-items.ts:19:  chatWorkLogEntries,
apps/web/src/features/chat/lib/chat-timeline-items.ts:157:  const workLogEntries = chatWorkLogEntries({ activities })
```

(The first is the export, the other two are one import and its single call.)
If a **second production call site** appears, STOP — it may be passing
activities that are not in the store's order.

### Step 5: Make the optimistic clear bail before it allocates

Two coordinated edits. The `Set` must stop being built at the **caller**, so the
action takes the message list and builds the `Set` only when it has work to do.

**5a — `apps/web/src/features/chat/state/chat-optimistic-store.ts`**

Change the action type (lines 22–25) from a `ReadonlySet<MessageId>` to the
message list:

```ts
  clearResolvedOptimisticMessages: (
    threadId: ThreadId,
    resolvedMessages: readonly OrchestrationMessage[],
  ) => void
```

Change the store factory line 39 from `create<ChatOptimisticStore>((set) => ({`
to `create<ChatOptimisticStore>((set, get) => ({`, and replace the action body
(lines 66–72) with:

```ts
  clearResolvedOptimisticMessages: (threadId, resolvedMessages) => {
    // Runs once per streamed token delta. An optimistic message only exists in the
    // window between send and the server's echo, and `replaceThreadMessages` drops
    // the thread key when the last one resolves — so this bail is the common case,
    // and it has to happen before the id set is built and before the log scope is
    // touched, or a streaming turn drives the debouncer per token.
    if (!get().messagesByThreadId[threadId]) return

    const resolvedMessageIds = new Set(resolvedMessages.map((message) => message.id))
    recordOptimisticMutation('clearResolved', {
      resolvedMessageCount: resolvedMessageIds.size,
      threadId,
    })
    set((state) => clearResolvedMessages(state, threadId, resolvedMessageIds))
  },
```

`OrchestrationMessage` is already imported at the top of the file — no import
change is needed. Leave `clearResolvedMessages` (125–141) untouched: its
`if (!messages) return state` guard stays as the correctness backstop for the
`set` updater.

**5b — `apps/web/src/features/chat/components/chat-view.tsx`**

Replace the effect at lines 118–127 with:

```tsx
useEffect(() => {
  if (!thread) return

  useChatOptimisticStore.getState().clearResolvedOptimisticMessages(thread.id, thread.messages)
}, [thread])
```

**Verify**:

```bash
grep -rn "clearResolvedOptimisticMessages" apps/web/src
```

→ exactly three lines at this point in the plan — the type in
`chat-optimistic-store.ts:22`, the implementation at `chat-optimistic-store.ts:66`,
and the single call site in `chat-view.tsx`. (The new test file in Step 6 will
add a fourth; that is expected.) There must be **no** occurrence of `new Set(`
on the same line as the call.

```bash
cd apps/web && bun run typecheck
```

→ exit 0.

```bash
cd apps/web && bun --bun vitest run --project node --project dom src/features/chat
```

→ all pass.

### Step 6: Add the tests, re-measure, delete the bench, run the gates

Write the tests described in "Test plan" below, then re-run the benchmark from
Step 1 three more times and take the lowest `ms/delta` — call it `AFTER`.

**Gate**: `BEFORE / AFTER >= 2`. Expect roughly 4–8×: the change removes the
`includes` scan, the `Set`, and the two-pass record rebuild, leaving one record
spread. **If the ratio is below 2, STOP and report** — the fast path is not
firing and something about the invariant in "Current state" is wrong.

Then delete the bench file:

```bash
rm apps/web/src/features/chat/state/tests/projection-delta-bench.test.ts
```

Report `BEFORE` and `AFTER` in your final summary.

Finally, format and run the scoped gate — in this order, because the formatter
rewrites the lines you pasted from this plan:

```bash
cd apps/web && bunx oxfmt --write src/features/chat
cd apps/web && bunx oxfmt --check src/features/chat
```

→ the check prints `All matched files use the correct format.`

```bash
cd apps/web && bunx oxlint src/features/chat
```

→ exit 0, no warnings.

```bash
cd apps/web && bun run typecheck
```

→ exit 0.

```bash
cd apps/web && bun --bun vitest run --project node --project dom src/features/chat
```

→ `Test Files 104 passed`, `Tests 798 passed` (103 → 104 files, 792 → 798
tests: 6 new cases). Ignore the `ECONNREFUSED` traces; read only the summary
lines.

**Verify**:

```bash
git status --short
```

→ compare against the list you wrote down at the start. The only _new_ entries
must be the in-scope files, and `projection-delta-bench.test.ts` must **not**
appear. Leave every pre-existing entry exactly as it was.

## Test plan

Six new test cases. Do not mock anything. Match each target file's **own**
import style: `chat-projection-writers.test.ts` uses `test` from
`'../../../../../test/fixtures'`, while `chat-work-log.test.ts` uses
`describe`/`it`/`expect` imported from `'vitest'` — add to the existing
`describe('chat work log entries', ...)` block there rather than introducing a
second style.

Steps 2, 3 and 5 each replace an unconditional operation with a guarded fast
path. Cases 1, 2a and 5b below exist specifically to prove the **slow** path
still fires — that is the half a typecheck cannot see.

**In `apps/web/src/features/chat/state/tests/chat-projection-writers.test.ts`**
(the file's helpers `parseThreadId`, `parseMessageId`, `parseTurnId`,
`parseEventId`, `makeThreadEvent`, `makeActivity`, `assistantMessageEvent`,
`timestamp` already exist — reuse them, do not redefine. `assistantMessageEvent`
takes a single object argument: `{ messageId, sequence, streaming, text,
threadId, turnId }`):

1. **`trims the oldest message when a streamed append crosses the cache limit`** —
   drive `CHAT_MESSAGE_CACHE_LIMIT` distinct `assistantMessageEvent`s into a
   fresh state, then one more with a new message id. Assert
   `state.messageIdsByThreadId[threadId]` has length `CHAT_MESSAGE_CACHE_LIMIT`,
   that the first original id is **gone from both** `messageIdsByThreadId` and
   `messageByThreadId`, and that `state.threadHasEarlierById[threadId] === true`.
   This is the branch Step 2 puts behind a guard; nothing covers it today.

   Two traps, both of which make this test fail for reasons unrelated to your
   change:
   - **Start `sequence` at 1, not 0.** A `sequence: 0` event on a fresh state is
     dropped by `applyThreadEventWithSequenceGuard` (see "Current state"), you
     would only hold `CHAT_MESSAGE_CACHE_LIMIT - 1` messages, no trim would
     happen, and the "first id is gone" assertion would fail while the length
     assertion passed.
   - `timestamp(index)` only zero-pads two digits, so above 59 it emits strings
     like `2026-05-24T00:00:2000.000Z`. Nothing in this path parses or sorts
     `createdAt` for messages, so that is harmless — do not "fix" it.

   Give this case an explicit timeout — `test('…', () => { … }, 30_000)` — for
   the same reason as the benchmark: 2,001 events is well past what Vitest's
   5s default comfortably covers on a cold run.

2. **`orders an out-of-sequence appended activity by sequence, not arrival`** —
   append three `thread.activity-appended` events whose payload activities carry
   sequences `1`, `3`, `2` (use `makeActivity(index, threadId, { sequence })`),
   then assert `state.activityIdsByThreadId[threadId]` equals the ids in
   sequence order `1, 2, 3`. This proves the Step 3 fallback still fires. You
   will need a small helper alongside the existing event builders:

   ```ts
   function activityAppendedEvent(
     threadId: ReturnType<typeof parseThreadId>,
     eventSequence: number,
     activity: OrchestrationThreadActivity,
   ): OrchestrationEvent {
     return {
       ...makeThreadEvent(threadId, eventSequence, `activity-${eventSequence}`),
       payload: { activity, threadId },
       type: 'thread.activity-appended',
     }
   }
   ```

   Start `eventSequence` at 1 and keep it strictly increasing; vary only the
   _activity_ `sequence` field. `providerFailureActivityEvent`
   (`chat-projection-writers.test.ts:684-703`) is the existing exemplar of an
   activity-appended event in this file — look at it before writing the helper.

   Call this case **2a**, and add **2b** in the same file:

2b. **`trims the oldest activity when an appended activity crosses the cache limit`** —
append `CHAT_ACTIVITY_CACHE_LIMIT + 1` activity events (event sequences
`1…CHAT_ACTIVITY_CACHE_LIMIT + 1`, activity `sequence` ascending in step) and
assert `state.activityIdsByThreadId[threadId]` has length
`CHAT_ACTIVITY_CACHE_LIMIT`, that the first id is gone from both
`activityIdsByThreadId` and `activityByThreadId`, and that
`state.threadHasEarlierById[threadId] === true`. The one existing trim test
(`chat-projection-writers.test.ts:174`) reaches the cap through a _snapshot_,
never through the append path Step 3 rewrites.

**In `apps/web/src/features/chat/lib/tests/chat-work-log.test.ts`** (add an `it`
inside the existing `describe`; reuse its local `activity(id, overrides)` helper,
whose `overrides` type is `Omit<Partial<OrchestrationThreadActivity>, 'turnId'> &
{ turnId?: string | null }`, so a `sequence` override passes straight through):

3. **`keeps the caller's order when createdAt disagrees with sequence`** — pass
   two `tool.completed` activities in store order, where the first has the later
   `createdAt` and the smaller `sequence`. Assert
   `entries.map((entry) => entry.id)` comes back in the order given. Before Step 4
   this test fails (the rows come back swapped); after it passes. That is the
   regression this plan actually fixes.
   Give the two activities different `payload.detail` values and no tool-call id
   so they stay two rows: `collapseWorkLogEntries` never folds a `tool.completed`
   into a following entry (`chat-work-log.ts:342`), so two of them are safe.

**New file `apps/web/src/features/chat/state/tests/chat-optimistic-store.test.ts`**
— model it on `apps/web/src/features/chat/state/tests/chat-input-draft-store.test.ts`,
which is the existing precedent for testing a zustand store in the `node`
project (`.test.ts`, imports `{ expect, test }` from
`'../../../../../test/fixtures'`). Both cases below are required; use a thread id
unique to each test, because the store is a module singleton with no reset export.

The store's logging path works fine in the `node` project — the whole chat suite
already drives it. It prints `ECONNREFUSED` traces because the log drain cannot
reach a server. That is not a failure and **must not** be mocked or silenced.

5a. **`clearResolvedOptimisticMessages does nothing for a thread with no optimistic messages`** —
capture `useChatOptimisticStore.getState().messagesByThreadId`, call
`clearResolvedOptimisticMessages(threadId, [])` for an untouched thread id, and
assert the `messagesByThreadId` reference is `toBe`-identical afterwards.

**Be honest about what this proves.** It is a regression guard, _not_ proof
that the new early return ran: zustand's `setState` already no-ops when the
updater returns the same state object, which is what `clearResolvedMessages`
did before this plan. The bail itself is proven by the code shape and by the
`grep` in Step 5 — do not go looking for a stronger runtime assertion, and do
not reach into the logging internals to manufacture one.

5b. **`clearResolvedOptimisticMessages drops an optimistic message the server has echoed`** —
this is the case that can actually break. `addOptimisticMessage(commandId,
   message)`, then call `clearResolvedOptimisticMessages(threadId, [message])`
passing the **array** (the new signature), and assert
`useChatOptimisticStore.getState().messagesByThreadId[threadId]` is
`undefined` — `replaceThreadMessages` deletes the thread key when the last
optimistic message resolves. Without this case, an early return that bails too
eagerly would ship green.

**Verification**:

```bash
cd apps/web && bun --bun vitest run --project node --project dom src/features/chat
```

→ `Test Files 104 passed`, `Tests 798 passed`: the writer file goes 13 → 16, the
work-log file 10 → 11, and the new optimistic-store file contributes 2.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `cd apps/web && bun run typecheck` exits 0
- [ ] `cd apps/web && bunx oxlint src/features/chat` exits 0 with no warnings
- [ ] `cd apps/web && bunx oxfmt --check src/features/chat` prints `All matched files use the correct format.`
- [ ] `cd apps/web && bun --bun vitest run --project node --project dom src/features/chat` → `Test Files 104 passed`, `Tests 798 passed`
- [ ] `cd apps/web && bun --bun vitest run --project node src/features/chat/state/tests/chat-projection-writers.test.ts` → `Tests 16 passed`
- [ ] `cd apps/web && bun --bun vitest run --project node src/features/chat/lib/tests/chat-work-log.test.ts` → `Tests 11 passed`
- [ ] `grep -n "ids.includes" apps/web/src/features/chat/state/chat-projection-writers.ts` → **exactly one** match: line ~1450, inside `appendId`. (`grep` is case-sensitive, so `state.threadIds.includes` at line ~1157 does not match this pattern.)
- [ ] `grep -n "compareActivities" apps/web/src/features/chat/lib/chat-work-log.ts` → no matches
- [ ] `grep -n "compareActivities" apps/web/src/features/chat/state/chat-projection-writers.ts` → still present (the store's comparator must survive; Step 3 uses it)
- [ ] `grep -rn "new Set(thread.messages" apps/web/src` → no matches
- [ ] `ls apps/web/src/features/chat/state/tests/projection-delta-bench.test.ts` → "No such file or directory"
- [ ] `git status --short` adds nothing beyond the in-scope list, and leaves every pre-existing entry untouched
- [ ] `BEFORE` and `AFTER` ms/delta figures are recorded in the final report, with `BEFORE / AFTER >= 2`
- [ ] `plans/README.md` status row for 023 updated to DONE

Deliberately **not** a criterion: repo-wide `bun run verify`. It already failed
at `ace313f` on unrelated working-tree files (see "Commands you will need"), so
it cannot distinguish your work from theirs.

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check prints a diff and any "Current state" excerpt no longer matches
  the live code.
- The benchmark ratio `BEFORE / AFTER` is below 2. The fast path is not firing;
  the likely cause is that `heldMessage` is falsy when it should be truthy, or
  that the ids/record invariant does not hold. Report the two numbers and the
  handler as you wrote it.
- Any of the existing 13 writer tests or 10 work-log tests fail at any point.
  They are the behaviour contract. This plan changes observable behaviour in
  exactly two places, neither of which any existing test asserts: Step 4's
  ordering fix, and Step 3 no longer re-sorting an already-held activity slice
  (see the last Maintenance note). Any _other_ existing test turning red means
  you broke something.
- The whole chat suite reports fewer than `103` passing files or fewer than
  `792` passing tests **plus** your new cases. (`ECONNREFUSED` traces in the
  output are pre-existing noise and are not a failure — never treat them as one,
  and never "fix" them.)
- `grep -rn "chatWorkLogEntries" apps/web/src` finds a production call site other
  than `chat-timeline-items.ts:157`. Step 4 assumes the store's order is the only
  input order; a second caller could be passing unsorted activities.
- Test case 5b fails — the optimistic message is still in the store after
  `clearResolvedOptimisticMessages`. The Step 5 bail is returning early when it
  should not; report the store body as you wrote it rather than loosening the
  guard until the test goes green.
- A scoped gate fails inside a file you did not edit. That is pre-existing
  breakage in someone else's working-tree change; report it, do not fix it.
- Any writer in `chat-projection-writers.ts` turns out to update
  `messageIdsByThreadId` or `activityIdsByThreadId` **without** updating the
  matching `*ByThreadId` record in the same expression. Steps 2 and 3 rest on
  that invariant.
- A fix appears to require editing `chat-timeline-items.ts`,
  `messages-timeline.tsx`, `thread-detail-subscriptions.ts`, or anything under
  `apps/server/` — all out of scope.
- You find yourself adding `memo`/`useMemo`/`useCallback`, a new setting, a new
  log line, or a `new Error`. None of those belong in this plan.

## Maintenance notes

For whoever owns this code next:

- **Plan 037 (`plans/037-normalize-chat-thread.md`) collapses these five parallel
  per-thread records into one.** When it lands, `appendActivity` and the guarded
  trim should move onto whatever structure replaces
  `activityByThreadId`/`activityIdsByThreadId` rather than being reimplemented.
  Land 023 first; 037 second.
- **What is still O(N) per delta, on purpose.** The `{...currentById, [id]: msg}`
  spread remains, and so does `collectByIds` in
  `chat-projection-selectors.ts` (which rebuilds the messages array because the
  selector's `WeakMap` cache is keyed on `(idsArray, byIdObject)` identity, and
  `byId` is a new object every delta). Removing those needs a persistent map or a
  mutable-with-version store — that is plan 037's territory, not a local tweak.
- **What a reviewer should scrutinize**: (1) that `heldMessage ? currentIds :
[...currentIds, message.id]` preserves array _identity_ when the id is already
  held, exactly as `appendId` did — several consumers memoize on that identity;
  (2) that `appendActivity`'s fast-path predicate uses `compareActivities(last,
activity) < 0` and not a raw `sequence` comparison, so an activity with an
  absent `sequence` (schema-optional; `orchestrationThreadActivitySchema` has
  `sequence: v.optional(...)`, and `snapshot-query.ts:437` maps a null column to
  `undefined`) still routes to the full sort; (3) that Step 4 did not also delete
  the _store's_ `compareActivities`; (4) the one real behaviour change — the
  activity slice is no longer re-sorted on every append, so it now inherits the
  order `prependChatProjectionThreadDetailPage` leaves behind (see the last
  bullet below).
- **Deliberately not done, with reasons**:
  - `retainRecordKeys`'s `Object.entries → flatMap → fromEntries` shape is left
    as-is. After Step 2 it only runs on a trim, i.e. roughly once per turn on a
    capped thread, not once per token. Rewriting it as a loop is a real but tiny
    win and would widen the diff for no measurable gain.
  - The two `messages.toSorted(...)` calls in `chat-timeline-items.ts` are left
    alone; unlike activities, message order is _not_ established by the store, so
    they are load-bearing (see "Out of scope").
  - Coalescing store writes per animation frame — the structural alternative
    named at the top — is the next real perf step, and it should be measured
    against a React Profiler trace of a streaming turn, not against this
    microbenchmark.
- **The one behaviour this plan does change, deliberately.** Before Step 3, every
  appended activity re-sorted the whole slice, which meant any pre-existing
  disorder was silently healed on the next append. After Step 3 it is not:
  `prependChatProjectionThreadDetailPage` (`chat-projection-writers.ts:95-123`)
  prepends the server's page order without sorting, and a subsequent live append
  has a _higher_ sequence than the last held row, so it takes the fast path and
  leaves the prepended rows in whatever order they arrived. The slice therefore
  now depends on the server sending each backwards page in `(sequence, createdAt,
id)` order. It does today. **If activity ordering ever misbehaves after a
  "load earlier" page, that assumption is where to look** — the fix belongs in
  the prepend writer (sort the merged slice once), not in `appendActivity`.
