# Plan 037: Normalize the chat thread: five records and four types become one

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
> git diff --stat ace313f..HEAD -- \
>   apps/web/src/features/chat/state/chat-projection-store.ts \
>   apps/web/src/features/chat/state/chat-projection-writers.ts \
>   apps/web/src/features/chat/state/chat-projection-selectors.ts \
>   apps/web/src/features/chat/state/chat-projection-cache.ts \
>   apps/web/src/features/chat/state/thread-detail-subscriptions.ts \
>   apps/web/src/features/chat/state/tests/ \
>   apps/web/src/features/chat/lib/ \
>   apps/web/src/features/chat/components/chat-panel-header.tsx \
>   apps/web/src/features/chat-mode/ \
>   apps/web/src/components/command-palette/use-command-palette-sessions.ts \
>   apps/web/test/factories/chat.ts
> ```
>
> At the time this plan was written that command printed **nothing** (no diff)
> other than whatever `plans/023-chat-per-delta-work.md` legitimately landed in
> `chat-projection-writers.ts` (see "Expected drift from plan 023" below). If any
> other in-scope file changed, compare the "Current state" excerpts against the
> live code before proceeding; on a mismatch, treat it as a STOP condition.

## CORRECTION 2026-08-17 — read this before anything else

This plan was **BLOCKED by its own Done criteria, not by the code.** Two things
were wrong and are now fixed. If you read an earlier version of this file,
these override it:

1. **The `bun run verify` gate is gone.** The old Done criteria required
   `bun run verify` (repo root) to exit 0, with no fallback. `verify` runs the
   whole monorepo and short-circuits, so one unrelated failure anywhere makes
   the gate unreachable and it proves nothing about this change. It is replaced
   by per-workspace gates — `cd apps/web && bun run typecheck` / `bun run lint`
   / `bun run test` — each **diffed against a Step 0 snapshot**. This plan
   touches `apps/web` only, so those are the only workspaces that matter. Do
   not run `bun run verify` at any point in this plan.
2. **Absolute test counts are gone.** Counts like "`Tests 844 passed (844)`"
   and "`Tests 847 passed (847)`" were measured at commit `ace313f`. Plans
   013-047 have landed since and moved every one of them. **Absolute counts are
   forbidden as done criteria**: a plan authored at one commit cannot assert a
   number a sibling plan will change. Every count in this file is now a
   **baseline delta** — no test that passed in your Step 0 snapshot may fail
   after, and no new lint error may appear. Any number still quoted below is
   historical context, never a gate.

**Known pre-existing failure — it must NOT block this plan.** At HEAD `b467b3f`,
`cd apps/web && bun run test` reports **1 failed | 1795 passed (1796)** across
**1 failed | 249 passed (250)** files. The single failure is:

```
src/features/settings/tests/page.test.tsx > refuses an application-scoped key from the workspace tab, and says why
```

It is a one-line test-query defect with **nothing to do with the chat
projection**: `getByText(/can only be set in User settings/)` now matches two
elements because a second scope-restricted row became visible; the fix is
`getAllByText` or a more specific query, and it is tracked separately. It must
appear in your Step 0 snapshot, it is **out of scope for this plan**, and it
does not block completion. Do not fix it here — that would put a file outside
the in-scope list into your diff.

**Step 2 has already landed — do not redo it.** Commit `57d956c`
(_"test(chat): pin the three thread-merge precedence rules before
normalizing"_) added all three step-2 characterization tests, +99 lines across
exactly two files:

- `apps/web/src/features/chat/state/tests/chat-projection-selectors.test.ts`
  (+60) — _"a published null session outranks a detail snapshot that still
  carries one"_ and _"a thread with no published turn still shows the turn its
  detail snapshot carried"_
- `apps/web/src/features/chat/state/tests/chat-projection-writers.test.ts`
  (+39) — _"a shell resnapshot preserves the arranged pin slot"_ plus its
  `threadPinnedEvent` builder

All three pass against unmodified source. **Consequence for a resuming
executor**: your Step 0 snapshot already contains those three tests, so the
end-state target is **baseline + 0 new tests**, not baseline + 3. Read step 2,
confirm the three tests are present and green, then go straight to step 3.

## Status

- **Priority**: P3
- **Effort**: L
- **Risk**: MED
- **Depends on**: `plans/023-chat-per-delta-work.md` (must land first)
- **Category**: architecture
- **Planned at**: commit `ace313f`, 2026-08-16

This plan closes an instance of cross-cutting theme **T1 — "parallel
hand-maintained representations of one truth"** (see `plans/README.md`), the
dominant theme of the third audit pass. The rule the theme states is: _a second
representation must be derived, never maintained._ Here, one chat thread is
maintained as **five parallel `Record<ThreadId, …>` slices** described by **four
overlapping types**, and nothing in the type system links them.

### Expected drift from plan 023

Plan 023 rewrites `applyThreadMessageSentEvent` and
`applyThreadActivityAppendedEvent` in `chat-projection-writers.ts` and adds an
`appendActivity` helper. Those functions are **not** rewritten by this plan —
this plan only changes the three lines in each that call `patchThreadShell(...)`
(they become `patchThread(...)`). If plan 023 has landed, expect those two
functions to look different from any excerpt here; that is fine and expected.
If plan 023 has **not** landed, STOP and report — see "STOP conditions".

## Why this matters

A chat thread's scalar facts live in five separate store slices
(`threadShellById`, `threadDetailMetaById`, `sidebarThreadSummaryById`,
`threadSessionById`, `threadTurnStateById`), typed by four near-identical types
that redeclare the same ten or eleven fields. Adding one thread-level field
today means five edits in lockstep — write it in two or three of the records,
add it to `retainDetailSlices`, add it to `removeThreadState`, and merge it in
`selectChatThreadById` — and **the compiler enforces none of them**. Forgetting
the `removeThreadState` line is a silent per-thread leak; forgetting the
`retainDetailSlices` line silently wipes the field on every reconnect.

The cost is already visible in the code: the selector needs a hand-written
eight-key `WeakMap` identity comparison purely to avoid rebuilding a thread
assembled from five independently-updated sources; `removeThreadState` is a
17-line hand enumeration; `isProtectedThread` in
`thread-detail-subscriptions.ts` asks the same two questions ("is a turn
running?", "is the session busy?") twice each, once per record; and the
pin-order key needed its own slice-scoped writer because it fits no record
cleanly.

After this plan there is one `threadById: Record<ThreadId, ProjectionThread>`,
one `ProjectionThread` type, and the shell-versus-detail precedence that the
record separation used to encode implicitly becomes an **explicit merge in one
writer**, gated by two named provenance stamps. Adding a field becomes one edit
to one type, and the compiler finds every site that must fill it in.

**This is a behaviour-preserving refactor.** Four small behaviour changes are
unavoidable; each is listed with a rationale under "Maintenance notes". Nothing
else about what the UI shows may change.

## Current state

### Files and roles

| File                                                                          | Role                                                                   |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `apps/web/src/features/chat/state/chat-projection-store.ts` (328 lines)       | Zustand store; defines the four thread types and `ChatProjectionState` |
| `apps/web/src/features/chat/state/chat-projection-writers.ts` (1,566 lines)   | Every pure state transition (snapshots, stream items, events)          |
| `apps/web/src/features/chat/state/chat-projection-selectors.ts` (326 lines)   | Read models; `selectChatThreadById` is where shell and detail meet     |
| `apps/web/src/features/chat/state/chat-projection-cache.ts` (265 lines)       | `localStorage` round trip; replays through the real writers            |
| `apps/web/src/features/chat/state/thread-detail-subscriptions.ts` (454 lines) | Subscription lifecycle; reads four of the five records                 |
| `apps/web/test/factories/chat.ts`                                             | Shared factories (`thread`, `sidebarThreadSummary`, `threadShell`)     |

### The five records (`chat-projection-store.ts:135-164`)

```ts
export type ChatProjectionState = {
  activityByThreadId: Record<ThreadId, Record<EventId, OrchestrationThreadActivity>>
  activityIdsByThreadId: Record<ThreadId, EventId[]>
  bootstrapComplete: boolean
  lastAppliedShellSequence: number
  lastAppliedShellUpdatedAt: string | null
  messageByThreadId: Record<ThreadId, Record<MessageId, OrchestrationMessage>>
  messageIdsByThreadId: Record<ThreadId, MessageId[]>
  projectById: Record<ProjectId, OrchestrationProjectShell>
  projectIds: ProjectId[]
  proposedPlanByThreadId: Record<ThreadId, Record<ProposedPlanId, OrchestrationProposedPlan>>
  proposedPlanIdsByThreadId: Record<ThreadId, ProposedPlanId[]>
  sidebarThreadSummaryById: Record<ThreadId, ChatSidebarThreadSummary> // ← 1
  threadDetailMetaById: Record<ThreadId, ChatProjectionThreadDetailMeta> // ← 2
  /** … */
  threadHasEarlierById: Record<ThreadId, boolean>
  threadDetailSequenceById: Record<ThreadId, number>
  threadIds: ThreadId[]
  threadIdsByProjectId: Record<ProjectId, ThreadId[]>
  threadSessionById: Record<ThreadId, OrchestrationSession | null> // ← 3
  threadShellById: Record<ThreadId, ChatProjectionThreadShell> // ← 4
  threadTurnStateById: Record<ThreadId, ChatProjectionThreadTurnState> // ← 5
  turnDiffIdsByThreadId: Record<ThreadId, TurnId[]>
  turnDiffSummaryByThreadId: Record<ThreadId, Record<TurnId, ChatTurnDiffSummary>>
}
```

22 keys, 17 of them `Record` slices. `latestTurn` is stored in three of them,
`session` in three.

### The four types (`chat-projection-store.ts:51-108`)

```ts
export type ChatProjectionThreadShell = Pick<
  OrchestrationThreadShell,
  | 'archivedAt'
  | 'branch'
  | 'createdAt'
  | 'id'
  | 'interactionMode'
  | 'modelSelection'
  | 'projectId'
  | 'runtimeMode'
  | 'title'
  | 'updatedAt'
  | 'worktreePath'
>

/**
 * The metadata a thread detail snapshot carries about the thread itself. It is kept
 * apart from `threadShellById` because the shell and detail subscriptions run
 * independently: a detail cached before a reconnect can land after a newer shell
 * snapshot, and the shell is authoritative for branch/worktree/title/session.
 * `selectChatThreadById` merges the two shell-wins; nothing merges them in a write.
 */
export type ChatProjectionThreadDetailMeta = ChatProjectionThreadShell & {
  latestTurn: OrchestrationLatestTurn | null
  session: OrchestrationSession | null
}

export type ChatProjectionThreadTurnState = {
  latestTurn: OrchestrationLatestTurn | null
  pendingSourceProposedPlan?: OrchestrationLatestTurn['sourceProposedPlan']
}

export type ChatSidebarThreadSummary = Pick<
  OrchestrationThreadShell,
  | 'archivedAt'
  | 'branch'
  | 'createdAt'
  | 'hasActionableProposedPlan'
  | 'id'
  | 'interactionMode'
  | 'latestTurn'
  | 'latestUserMessageAt'
  | 'pendingApprovalCount'
  | 'pendingUserInputCount'
  | 'planProgress'
  | 'projectId'
  | 'session'
  | 'title'
  | 'updatedAt'
  | 'worktreePath'
> & {
  /**
   * The slot the user dragged this session into, `null` while it holds none.
   * Event-derived rather than shell-derived: the thread shell carries no pin
   * state, so the writers keep this field across a resnapshot themselves.
   */
  pinOrderKey?: string | null
}
```

**The comment at lines 66-72 is the load-bearing design constraint of this
plan.** Read it again: the shell/detail split exists because _a detail snapshot
cached before a reconnect can land after a newer shell snapshot_. That
precedence rule must survive normalization exactly.

### The merge, today (`chat-projection-selectors.ts:89-176`)

```ts
/**
 * The one place shell and detail meet. Both subscriptions run independently, so a
 * detail cached before a reconnect can be older than the rail's copy of the thread —
 * the shell record therefore wins on branch, worktree, title and session, and the
 * detail record only fills in for a thread the shell has not delivered yet. Writers
 * stay slice-scoped so neither can quietly revert the other.
 */
export function selectChatThreadById(
  state: ChatProjectionState,
  threadId: ThreadId | null | undefined,
): ChatThread | undefined {
  if (!threadId) return undefined

  const detailMeta = state.threadDetailMetaById[threadId]
  const meta = state.threadShellById[threadId] ?? detailMeta
  if (!meta) return undefined

  const session = selectSessionForThread(state, threadId, detailMeta)
  const turnState = state.threadTurnStateById[threadId]
  const messages = selectChatMessagesForThread(state, threadId)
  const activities = selectChatActivitiesForThread(state, threadId)
  const proposedPlans = selectChatProposedPlansForThread(state, threadId)
  const turnDiffSummaries = selectChatTurnDiffSummariesForThread(state, threadId)
  const latestTurn = latestTurnForSession(
    turnState?.latestTurn ?? detailMeta?.latestTurn ?? null,
    session,
  )
  const summary = state.sidebarThreadSummaryById[threadId]
  const cached = threadCache.get(meta)

  if (
    cached &&
    cached.activities === activities &&
    cached.detailMeta === detailMeta &&
    cached.messages === messages &&
    cached.proposedPlans === proposedPlans &&
    cached.session === session &&
    cached.summary === summary &&
    cached.turnDiffSummaries === turnDiffSummaries &&
    cached.turnState === turnState
  ) {
    return cached.thread
  }
  /* … builds ChatThread from five sources … */
}

/**
 * `null` is a real session value (stopped), so presence decides: only a thread the
 * shell has never delivered falls back to whatever its detail snapshot carried.
 */
function selectSessionForThread(
  state: ChatProjectionState,
  threadId: ThreadId,
  detailMeta: ChatProjectionThreadDetailMeta | undefined,
) {
  if (Object.hasOwn(state.threadSessionById, threadId)) {
    return state.threadSessionById[threadId] ?? null
  }

  return detailMeta?.session ?? null
}
```

**The exact precedence rules encoded above**, which the new writer must
reproduce verbatim:

1. **Meta group** (the 11 `ChatProjectionThreadShell` fields): if a shell record
   exists, _all eleven_ come from it; otherwise all eleven come from the detail
   record. All-or-nothing, per record, never per field.
2. **Session**: `Object.hasOwn(threadSessionById, id)` — **presence**, not
   truthiness, because `null` is a real session value meaning "stopped". The
   detail's session is used only when no authoritative writer has ever published
   one for the thread.
3. **Turn**: `turnState?.latestTurn ?? detailMeta?.latestTurn ?? null` —
   **value** nullish-coalescing, not presence.
4. **Shell-only counters** (`hasActionableProposedPlan`, `latestUserMessageAt`,
   `pendingApprovalCount`, `pendingUserInputCount`): read from
   `sidebarThreadSummaryById`, with `hasActionableProposedPlan` falling back to
   `hasOpenPlan(proposedPlans)` when there is no summary record. A summary
   record exists **iff** a shell record exists — `writeThreadShellState` writes
   both together and nothing else creates either.

### The hand-enumerations

`chat-projection-writers.ts:189-204` — 12 slices retained by hand on every shell
resnapshot:

```ts
function retainDetailSlices(state: ChatProjectionState, threadIds: ReadonlySet<ThreadId>) {
  return {
    activityByThreadId: retainThreadScopedRecord(state.activityByThreadId, threadIds),
    activityIdsByThreadId: retainThreadScopedRecord(state.activityIdsByThreadId, threadIds),
    messageByThreadId: retainThreadScopedRecord(state.messageByThreadId, threadIds),
    messageIdsByThreadId: retainThreadScopedRecord(state.messageIdsByThreadId, threadIds),
    proposedPlanByThreadId: retainThreadScopedRecord(state.proposedPlanByThreadId, threadIds),
    proposedPlanIdsByThreadId: retainThreadScopedRecord(state.proposedPlanIdsByThreadId, threadIds),
    threadDetailMetaById: retainThreadScopedRecord(state.threadDetailMetaById, threadIds),
    threadDetailSequenceById: retainThreadScopedRecord(state.threadDetailSequenceById, threadIds),
    threadHasEarlierById: retainThreadScopedRecord(state.threadHasEarlierById, threadIds),
    threadTurnStateById: retainThreadScopedRecord(state.threadTurnStateById, threadIds),
    turnDiffIdsByThreadId: retainThreadScopedRecord(state.turnDiffIdsByThreadId, threadIds),
    turnDiffSummaryByThreadId: retainThreadScopedRecord(state.turnDiffSummaryByThreadId, threadIds),
  }
}
```

`chat-projection-writers.ts:1207-1228` — 17 lines to delete one thread:

```ts
function removeThreadState(state: ChatProjectionState, threadId: ThreadId): ChatProjectionState {
  return {
    ...state,
    activityByThreadId: removeRecordKey(state.activityByThreadId, threadId),
    activityIdsByThreadId: removeRecordKey(state.activityIdsByThreadId, threadId),
    messageByThreadId: removeRecordKey(state.messageByThreadId, threadId),
    messageIdsByThreadId: removeRecordKey(state.messageIdsByThreadId, threadId),
    proposedPlanByThreadId: removeRecordKey(state.proposedPlanByThreadId, threadId),
    proposedPlanIdsByThreadId: removeRecordKey(state.proposedPlanIdsByThreadId, threadId),
    sidebarThreadSummaryById: removeRecordKey(state.sidebarThreadSummaryById, threadId),
    threadDetailMetaById: removeRecordKey(state.threadDetailMetaById, threadId),
    threadDetailSequenceById: removeRecordKey(state.threadDetailSequenceById, threadId),
    threadHasEarlierById: removeRecordKey(state.threadHasEarlierById, threadId),
    threadIds: removeId(state.threadIds, threadId),
    threadIdsByProjectId: removeThreadFromAllProjectIndexes(state.threadIdsByProjectId, threadId),
    threadSessionById: removeRecordKey(state.threadSessionById, threadId),
    threadShellById: removeRecordKey(state.threadShellById, threadId),
    threadTurnStateById: removeRecordKey(state.threadTurnStateById, threadId),
    turnDiffIdsByThreadId: removeRecordKey(state.turnDiffIdsByThreadId, threadId),
    turnDiffSummaryByThreadId: removeRecordKey(state.turnDiffSummaryByThreadId, threadId),
  }
}
```

`chat-projection-writers.ts:457-478` — the pin key needed its own writer because
it fits no record:

```ts
/**
 * Slice-scoped to the sidebar summary: the arranged slot never reaches the
 * thread shell, so writing it through `patchThreadShellAndSummary` would put a
 * field on the shell record that no shell write can ever refresh.
 */
function writeThreadPinOrderKey(/* … */) {
  const summary = state.sidebarThreadSummaryById[threadId]
  if (!summary) return state
  if ((summary.pinOrderKey ?? null) === pinOrderKey) return state
  /* … */
}
```

`thread-detail-subscriptions.ts:393-407` — the same two questions, asked twice
each because the answer lives in two records:

```ts
function isProtectedThread(threadId: ThreadId) {
  const state = store.getState()
  const summary = state.sidebarThreadSummaryById[threadId]

  if (summary?.hasActionableProposedPlan) return true
  if ((summary?.pendingApprovalCount ?? 0) > 0) return true
  if ((summary?.pendingUserInputCount ?? 0) > 0) return true
  if (summary?.latestTurn?.state === 'running') return true
  if (isBusySession(summary?.session ?? null)) return true

  const turnState = state.threadTurnStateById[threadId]
  if (turnState?.latestTurn?.state === 'running') return true
  if (turnState?.pendingSourceProposedPlan !== undefined) return true

  return isBusySession(state.threadSessionById[threadId] ?? null)
}
```

### The two records the writers keep deliberately out of step

These are **not** copies of one fact and must both survive:

- `sidebarThreadSummaryById[id].latestTurn` — the turn the **server last
  published** in a shell snapshot/stream item. Read by the rail
  (`thread-status.ts`, `running-turn.ts`, `session-unread.ts`,
  `session-rail-model.ts`, `chat-formatters.ts`).
- `threadTurnStateById[id].latestTurn` — the same turn **advanced by this
  client's own events** since the last shell publish. Read only by
  `selectChatThreadById`, and only by the transcript.

`chat-projection-writers.test.ts:351` asserts they stay out of step ("keeps
sidebar summaries shell-owned while detail events update local turn state").
**Do not merge them.** In the normalized record they become two named fields —
`latestTurn` and `liveTurn` — with a comment explaining that they are two
different facts.

### External consumers that read the raw records (all must be updated)

| File:line                                                                             | Reads                                                 |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `apps/web/src/components/command-palette/use-command-palette-sessions.ts:15`          | `state.sidebarThreadSummaryById`                      |
| `apps/web/src/features/chat-mode/hooks/use-session-actions.ts:121`                    | `…getState().sidebarThreadSummaryById[threadId]`      |
| `apps/web/src/features/chat-mode/hooks/use-session-menu.ts:20`                        | `state.sidebarThreadSummaryById[session.id]?.session` |
| `apps/web/src/features/chat-mode/hooks/use-session-tool-root.ts:20`                   | `…?.worktreePath`                                     |
| `apps/web/src/features/chat-mode/components/chat-stage.tsx:31`                        | the whole summary                                     |
| `apps/web/src/features/chat-mode/components/session-rail.tsx:60`                      | `state.sidebarThreadSummaryById`                      |
| `apps/web/src/features/chat-mode/providers/session-provider.tsx:50`                   | `state.sidebarThreadSummaryById`                      |
| `apps/web/src/features/chat-mode/state/session-commands.ts:143`                       | `projection.sidebarThreadSummaryById`                 |
| `apps/web/src/features/chat-mode/state/rail-order-commands.ts:198`                    | `projection.sidebarThreadSummaryById`                 |
| `apps/web/src/features/chat-mode/state/rail-order-store.ts:59`                        | `…?.pinOrderKey`                                      |
| `apps/web/src/features/chat/state/thread-detail-subscriptions.ts:159,181,394,402,406` | four of the five records                              |

`ChatSidebarThreadSummary` is additionally imported as a _type only_ by:
`chat-mode/providers/session-context.ts`, `chat-mode/utils/running-turn.ts`,
`chat-mode/utils/session-order.ts`, `chat-mode/utils/session-rail-model.ts`,
`chat-mode/utils/session-threads.ts`, `chat-mode/utils/session-unread.ts`,
`chat/lib/thread-status.ts`, `chat/lib/chat-formatters.ts`,
`chat/components/chat-panel-header.tsx`,
`chat-mode/utils/tests/session-rail-model.test.ts`, `test/factories/chat.ts`.

### A finding bullet that was checked and REFUTED — do not act on it

The original audit claimed that `threadStatus()`
(`chat/lib/thread-status.ts:21`), `isChatThreadBusy()`
(`chat/lib/chat-thread-status.ts:5`) and `hasRunningTurn()`
(`chat-mode/utils/running-turn.ts:8`) are "three near-identical predicates that
exist only because the thread has three incompatible shapes". **That is wrong
and adversarial verification killed it.** They have three different semantics:

```ts
// chat-mode/utils/running-turn.ts:3-14 — the comment states the difference outright
/**
 * A turn the provider is still working on. Deliberately not `threadStatus(thread) ===
 * 'working'`: that vocabulary reports the *user-facing* state, so a thread blocked on an
 * approval reads 'waiting' while its turn is very much still open.
 */
export function hasRunningTurn(thread: ChatSidebarThreadSummary | undefined | null) {
  if (!thread) return false
  if (thread.latestTurn?.state === 'running') return true
  if (thread.session?.status !== 'running') return false

  return thread.session.activeTurnId !== null // ← an extra requirement the others lack
}
```

`threadStatus()` returns a four-state user-facing vocabulary
(`waiting | working | failed | idle`), not a boolean. **Do not merge, delete or
"unify" these three functions.** Their only change in this plan is the type
rename (`ChatSidebarThreadSummary` → `ProjectionThread`).

### Repo conventions that apply (quoted from `AGENTS.md` — the executor has not read it)

- _"This project is greenfield and not live: no releases, no external users, no
  data anyone needs migrated. No backward compatibility shims, no legacy
  aliases, no deprecation windows. Update every call site in the same pass."_
- _"When a bug fix invalidates state the buggy code already persisted
  (localStorage, caches, on-disk files), do not write healing or migration code.
  Delete the bad state, or tell the user what to delete."_
- _"When removing a redundant prefix, rename the file, exports, and all call
  sites in one pass."_ / _"Delete obsolete tests instead of preserving old
  behavior."_ / _"Remove duplicate code aggressively."_
- _"Keep nesting depth to 3 or less. Use guard clauses and early returns… Do not
  use `else` after an early return. Never use nested ternaries."_
- _"`utils/` — pure, stateless, non-React code only. No stores… Stores are
  stateful, so they never go in `utils/`."_ (The projection store stays in
  `state/`; do not move files in this plan.)
- _"Import exact files through `@/`. Do not add barrel `index.ts` files."_
- _"Avoid manual React memoization… Use them only for measured performance
  issues, required stable identity, or correctness."_ (The `WeakMap` caches in
  the selectors are the "required stable identity" case — they feed zustand
  selectors and a fresh array per read is a render loop. Keep them.)
- _"A dev server is always running. Never spin up your own server to test or
  verify changes — reuse the running one."_ (It is at `http://localhost:5173`.)
- Tests: _"Import `{ test, expect }` from `apps/web/test/fixtures.ts`, not from
  `vitest`, for app tests."_ / _"Do not `mock.module` or `vi.mock` our server,
  client, or feature modules."_ / _"Put shared builders in `test/factories/`. Do
  not redefine per-file factories."_

## Commands you will need

| Purpose | Command | Expected on success |
| ------- | ------- | ------------------- |

Every expectation below is **relative to your own Step 0 snapshot**. Record the
numbers you actually see; never assert the ones quoted here.

| Purpose                  | Command                                                                                                                                                                                                                                        | Expected on success                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Projection tests         | `cd apps/web && bun --bun vitest run --project node src/features/chat/state/tests/`                                                                                                                                                            | 0 failures; file/test counts equal to your Step 0 snapshot for the same glob                               |
| The three key files only | `cd apps/web && bun --bun vitest run --project node src/features/chat/state/tests/chat-projection-writers.test.ts src/features/chat/state/tests/chat-projection-selectors.test.ts src/features/chat/state/tests/chat-projection-cache.test.ts` | 0 failures; test count equal to your Step 0 snapshot for the same three files                              |
| Full blast radius        | `cd apps/web && bun --bun vitest run --project node --project dom src/features/chat src/features/chat-mode src/components/command-palette`                                                                                                     | 0 failures; test count equal to your Step 0 snapshot for the same glob                                     |
| Typecheck                | `cd apps/web && bun run typecheck`                                                                                                                                                                                                             | exit 0, no output                                                                                          |
| Lint                     | `cd apps/web && bun run lint`                                                                                                                                                                                                                  | no error that is not already in `/tmp/037-lint-before.txt`                                                 |
| Format                   | `cd apps/web && bun run format` then `bun run format:check`                                                                                                                                                                                    | exit 0                                                                                                     |
| Whole app suite          | `cd apps/web && bun run test`                                                                                                                                                                                                                  | no test that passed in `/tmp/037-test-before.txt` fails; the one snapshotted pre-existing failure may stay |

**There is no repo-root gate.** The old table row `bun run verify` → exit 0 is
deleted; see the correction block at the top. `verify` is whole-monorepo and
short-circuits, so it cannot report anything about `apps/web` specifically.

Notes on the toolchain (the counts once quoted here were measured at `ace313f`
and are stale; the commands themselves are still correct):

- A benign `error: ECONNREFUSED` line is printed by the dom project during the
  full run and does **not** fail it. Judge by the `Test Files … passed` summary.
- `apps/web/tsconfig.app.json` sets `"include": ["src"]`, so files under
  `apps/web/test/` are only typechecked because `src/**/tests/*` import them.
  They _are_ checked — but if you ever see a factory error vanish, that is why.
- `noUnusedLocals` and `noUnusedParameters` are on: every helper and import you
  orphan **must** be deleted or typecheck fails. That is the intended safety net
  for this refactor.
- `verbatimModuleSyntax` is on: type-only imports must use `import type`.
- Do **not** run `bun run format` at the repo root; run it inside `apps/web`.

## Scope

**In scope** (the only files you may modify):

- `apps/web/src/features/chat/state/chat-projection-store.ts`
- `apps/web/src/features/chat/state/chat-projection-writers.ts`
- `apps/web/src/features/chat/state/chat-projection-selectors.ts`
- `apps/web/src/features/chat/state/chat-projection-cache.ts`
- `apps/web/src/features/chat/state/thread-detail-subscriptions.ts`
- `apps/web/src/features/chat/state/tests/chat-projection-writers.test.ts`
- `apps/web/src/features/chat/state/tests/chat-projection-selectors.test.ts`
- `apps/web/src/features/chat/state/tests/chat-projection-cache.test.ts`
- `apps/web/src/features/chat/lib/thread-status.ts`
- `apps/web/src/features/chat/lib/chat-formatters.ts`
- `apps/web/src/features/chat/lib/tests/thread-status.test.ts`
- `apps/web/src/features/chat/components/chat-panel-header.tsx`
- `apps/web/src/features/chat-mode/hooks/use-session-actions.ts`
- `apps/web/src/features/chat-mode/hooks/use-session-menu.ts`
- `apps/web/src/features/chat-mode/hooks/use-session-tool-root.ts`
- `apps/web/src/features/chat-mode/components/chat-stage.tsx`
- `apps/web/src/features/chat-mode/components/session-rail.tsx`
- `apps/web/src/features/chat-mode/components/tests/stage-header.test.tsx`
- `apps/web/src/features/chat-mode/providers/session-context.ts`
- `apps/web/src/features/chat-mode/providers/session-provider.tsx`
- `apps/web/src/features/chat-mode/state/session-commands.ts`
- `apps/web/src/features/chat-mode/state/rail-order-commands.ts`
- `apps/web/src/features/chat-mode/state/rail-order-store.ts`
- `apps/web/src/features/chat-mode/utils/running-turn.ts`
- `apps/web/src/features/chat-mode/utils/session-order.ts`
- `apps/web/src/features/chat-mode/utils/session-rail-model.ts`
- `apps/web/src/features/chat-mode/utils/session-threads.ts`
- `apps/web/src/features/chat-mode/utils/session-unread.ts`
- `apps/web/src/features/chat-mode/utils/tests/session-rail-model.test.ts`
- `apps/web/src/components/command-palette/use-command-palette-sessions.ts`
- `apps/web/test/factories/chat.ts`
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch, even though they look related):

- `packages/contracts/**` — `OrchestrationThreadShell` / `OrchestrationThread`
  are the wire contract shared with `apps/server`. This plan changes only how
  the _client_ stores what arrives; changing the wire shape would drag the
  server, its tests, and the persisted-cache schema in with it.
- `apps/web/src/features/chat/lib/thread-status.ts`'s **logic**, and
  `chat-mode/utils/running-turn.ts` / `chat/lib/chat-thread-status.ts` in full —
  three deliberately different predicates (see the REFUTED section above). Type
  rename only.
- `applyThreadMessageSentEvent` and `applyThreadActivityAppendedEvent` bodies —
  plan 023 owns them. Change only their `patchThreadShell(` → `patchThread(`
  call.
- `chat-projection-cache.ts`'s `CHAT_PROJECTION_CACHE_VERSION` and the cached
  schema — the cache stores `OrchestrationThreadShell` values, which this plan
  does not change, so the persisted shape is untouched and no version bump is
  warranted.
- The list-shaped slices (`messageByThreadId`, `activityByThreadId`,
  `proposedPlanByThreadId`, `turnDiffSummaryByThreadId` and their `…IdsBy…`
  partners), `threadHasEarlierById`, `threadDetailSequenceById`, `threadIds`,
  `threadIdsByProjectId`, `projectById`, `projectIds` — genuinely list- or
  index-shaped, correctly separate. Leave them alone.
- `apps/web/src/features/chat/lib/chat-timeline-items.ts` and the timeline
  derivation — a separate audit item, explicitly deferred (see `plans/README.md`
  "Findings considered and rejected").
- Any file-or-folder move or rename beyond the identifier renames listed here —
  plans 009-012 own the layout reorg and run last.
- `apps/web/src/features/chat/state/tests/thread-detail-subscriptions.test.ts`
  and `apps/web/src/features/chat-mode/utils/tests/archived-auto-pick.test.ts` —
  both drive the projection only through public writers and the shared
  factories, so they need no edit. They are the controls that prove step 6 and
  step 7c preserved behaviour; editing either destroys the evidence.
- `apps/server/**` and the persisted cache payload — nothing on the wire or in
  `localStorage` changes, so a server or schema edit means you have gone wrong.
- Deriving a summary-shaped view in a selector to keep the nine chat-mode
  consumers untouched. Tempting, because it makes step 7a a no-op — but it
  reintroduces the per-thread memo apparatus this plan exists to delete. Rename
  the record read, do not wrap it.
- Adding an `index.ts` barrel to re-export `ProjectionThread` so the imports get
  shorter. `AGENTS.md` forbids feature barrels; import the exact file.
- Any other `plans/*.md` file, including `plans/023-chat-per-delta-work.md`.
  Only this plan's status row in `plans/README.md` may change.

## Git workflow

**All work happens on `main`** — no new branches, worktrees, commits, pushes, or
PRs unless the operator explicitly asks. If you are asked to commit, use
conventional commits with a lowercase descriptive subject. Real examples from
`git log`:

```
refactor(orchestration): the server prepares a session's worktree (M-C)
fix(address): bound the URL, and stop escaping slashes in ?tabs=
```

A fitting subject for this work: `refactor(chat): one projection record per
thread`.

## Steps

> **Before step 1, check the dependency gate.** This plan is blocked on plan 023.
> Run:
>
> ```bash
> grep -n "^| 023 " plans/README.md
> rg -c "appendActivity" apps/web/src/features/chat/state/chat-projection-writers.ts
> ```
>
> If the 023 row is not `DONE`, or the `rg` finds no `appendActivity`, **STOP and
> report** — do not start step 1. At the time this plan was written the 023 row
> read `TODO`, so this gate is expected to fire until 023 lands.

> **Between steps 3 and 7 the codebase will not typecheck.** That is expected
> for this refactor — there is no incremental path that keeps it green without a
> compatibility shim, and `AGENTS.md` forbids shims. Do not treat a typecheck
> failure inside steps 3-6 as a STOP condition; it must pass at the end of step 7.

### Step 1 (= Step 0): Capture the baseline snapshot, before touching anything

**Do this first, before any edit.** These four files are the only gate this plan
has. Every later check is a diff against them.

```bash
cd apps/web && bun run test           2>&1 | tail -5 > /tmp/037-test-before.txt
cd apps/web && bun run lint           2>&1 | tail -5 > /tmp/037-lint-before.txt
cd apps/web && bun run typecheck      2>&1 | tail -5 > /tmp/037-typecheck-before.txt
cd apps/web && bun --bun vitest run --project node --project dom \
  src/features/chat src/features/chat-mode src/components/command-palette \
                                      2>&1 | tail -5 > /tmp/037-blast-before.txt
```

Read all four back and write the numbers down. They are **your** baseline; the
numbers this plan once quoted (`Test Files 112 passed (112)`, `Tests 844 passed
(844)`) were measured at `ace313f` and are stale.

**A pre-existing failure in the snapshot is not your problem.** `bun run test`
is expected to show one failure —
`src/features/settings/tests/page.test.tsx > refuses an application-scoped key
from the workspace tab, and says why` — a known unrelated test-query defect (see
the correction block at the top). Confirm it is the only failure and that it is
in `/tmp/037-test-before.txt`, then carry on. The blast-radius glob does **not**
include `features/settings`, so `/tmp/037-blast-before.txt` should be fully
green; a failure there **is** a STOP condition.

Also snapshot the one structural count a later criterion diffs against:

```bash
cd apps/web && rg -c "Record<ThreadId" src/features/chat/state/chat-projection-store.ts \
  > /tmp/037-threadrecords-before.txt
```

**Verify**: all four snapshot files exist and are non-empty, and the only
failing test anywhere is the snapshotted `page.test.tsx` one.

### Step 2: Add the three missing characterization tests — before touching any source

> **ALREADY LANDED in commit `57d956c`** — _"test(chat): pin the three
> thread-merge precedence rules before normalizing"_, +99 lines across exactly
> two files:
> `apps/web/src/features/chat/state/tests/chat-projection-selectors.test.ts`
> (+60, the two selector tests) and
> `apps/web/src/features/chat/state/tests/chat-projection-writers.test.ts`
> (+39, the pin-slot test plus its `threadPinnedEvent` builder). All three pass
> against unmodified source.
>
> **Do not write them again.** Confirm they are present and green:
>
> ```bash
> cd apps/web && rg -n "a published null session outranks|no published turn still shows|preserves the arranged pin slot" \
>   src/features/chat/state/tests/
> ```
>
> → three matches. Then skip to step 3. The rest of this step is retained as the
> record of what those tests must assert and why — step 7d refers back to it.
>
> Because step 2 is already in the tree, your Step 0 snapshot **already
> contains** these three tests. The end-state target is therefore **baseline +
> 0**, not baseline + 3. Every "+3" below is historical.

The existing suite already covers the headline ordering rule in two places, and
you must not lose that coverage:

- `chat-projection-selectors.test.ts:68` — _"a late detail snapshot cannot revert
  newer shell metadata"_ (asserts `branch`, `session`, `title`, `worktreePath`
  through the selector).
- `chat-projection-selectors.test.ts:99` — _"a thread the shell has not delivered
  yet still resolves from its detail snapshot"_.
- `chat-projection-writers.test.ts:138` — _"a thread detail snapshot leaves every
  shell-owned record untouched"_ (asserts **record identity**; step 7 rewrites
  it).

Three precedence rules the suite does **not** cover today. Add them now, against
the **current** code, so they prove the refactor preserved behaviour rather than
documenting whatever it produced.

Add to `apps/web/src/features/chat/state/tests/chat-projection-selectors.test.ts`,
after the existing test at line 99 (before the `staleDetailThread` helper at
line 114). **No new imports and no helper changes are needed**: the file already
imports `threadIdSchema`, `turnIdSchema`, `v`, `createInitialChatProjectionState`,
`syncChatProjectionShellSnapshot`, `syncChatProjectionThreadDetailSnapshot`,
`selectChatThreadById` and the `threadShell` factory, and already defines
`projectId` (line 28), `staleDetailThread` (114) and `timestamp` (187). The two
tests below override `staleDetailThread`'s fields at the call site rather than
changing the helper — leave the helper alone, five existing tests depend on it.

```ts
// `null` is a real session value — "the session stopped" — so the merge decides by
// presence, not truthiness. A shell that published a stopped session must outrank a
// detail snapshot that still remembers a running one, or the composer offers to
// interrupt a session that is already gone.
test('a published null session outranks a detail snapshot that still carries one', () => {
  const threadId = v.parse(threadIdSchema, 'thread-1')
  const shell = threadShell({ id: threadId, projectId, session: null })
  let state = syncChatProjectionShellSnapshot(createInitialChatProjectionState(), {
    projects: [],
    snapshotSequence: 1,
    threads: [shell],
    updatedAt: timestamp(2),
  })

  state = syncChatProjectionThreadDetailSnapshot(state, {
    checkpoints: [],
    proposedPlans: [],
    snapshotSequence: 2,
    thread: { ...staleDetailThread(threadId), session: threadShell().session },
  })

  expect(selectChatThreadById(state, threadId)?.session).toBeNull()
})

// The turn falls back by *value*, not by presence: a thread the shell delivered with
// no turn at all still shows the turn its detail snapshot carried, which is what a
// cold open of an idle-looking thread depends on.
test('a thread with no published turn still shows the turn its detail snapshot carried', () => {
  const threadId = v.parse(threadIdSchema, 'thread-1')
  const turnId = v.parse(turnIdSchema, 'turn-1')
  let state = syncChatProjectionShellSnapshot(createInitialChatProjectionState(), {
    projects: [],
    snapshotSequence: 1,
    threads: [threadShell({ id: threadId, latestTurn: null, projectId, session: null })],
    updatedAt: timestamp(2),
  })

  state = syncChatProjectionThreadDetailSnapshot(state, {
    checkpoints: [],
    proposedPlans: [],
    snapshotSequence: 2,
    thread: {
      ...staleDetailThread(threadId),
      latestTurn: {
        assistantMessageId: null,
        completedAt: timestamp(3),
        requestedAt: timestamp(1),
        startedAt: timestamp(2),
        state: 'completed',
        turnId,
      },
    },
  })

  expect(selectChatThreadById(state, threadId)?.latestTurn).toMatchObject({
    state: 'completed',
    turnId,
  })
})
```

Add to `apps/web/src/features/chat/state/tests/chat-projection-writers.test.ts`
(the arranged slot has no shell producer, so a resnapshot is the one thing that
can silently lose it):

Everything it needs already exists in that file: `applyChatProjectionEvent` and
`syncChatProjectionShellSnapshot` are imported (lines 26-31), and `makeProject`
(478), `makeThreadShell` (494), `makeThreadEvent` (611), `parseThreadId` (759)
and `timestamp` (783) are local helpers. Add the event builder next to the other
`*Event` builders, and the test after the one at line 351.

The `thread.pinned` payload is `threadPinnedPayloadSchema` in
`packages/contracts/src/orchestration-events.ts:179-186`:
`{ threadId, pinnedAt, pinOrderKey?, updatedAt }`. There is no `orderKey` field
on it — that one belongs to `thread.pin-reordered`. Build the whole event through
`makeThreadEvent`, which supplies the envelope (`eventId`, `sequence`,
`aggregateId`, …) that `applyThreadEventWithSequenceGuard` reads; a bare object
literal with an `as OrchestrationEvent` cast will not typecheck and would skip
the sequence guard.

```ts
// The shell carries no pin state, so a resnapshot is the only thing that can drop the
// slot the user dragged this session into. It must survive.
test('a shell resnapshot preserves the arranged pin slot', () => {
  const threadId = parseThreadId('thread-1')
  let state = syncChatProjectionShellSnapshot(createInitialChatProjectionState(), {
    projects: [makeProject()],
    snapshotSequence: 1,
    threads: [makeThreadShell({ id: threadId })],
    updatedAt: timestamp(1),
  })

  state = applyChatProjectionEvent(state, threadPinnedEvent(threadId, 'm'))

  state = syncChatProjectionShellSnapshot(state, {
    projects: [makeProject()],
    snapshotSequence: 3,
    threads: [makeThreadShell({ id: threadId, updatedAt: timestamp(2) })],
    updatedAt: timestamp(2),
  })

  expect(state.sidebarThreadSummaryById[threadId]?.pinOrderKey).toBe('m')
})
```

```ts
function threadPinnedEvent(
  threadId: ReturnType<typeof parseThreadId>,
  pinOrderKey: string,
): OrchestrationEvent {
  return {
    ...makeThreadEvent(threadId, 2, 'pinned'),
    payload: {
      pinOrderKey,
      pinnedAt: timestamp(2),
      threadId,
      updatedAt: timestamp(2),
    },
    type: 'thread.pinned',
  }
}
```

**Verify**:

```bash
cd apps/web && bun --bun vitest run --project node \
  src/features/chat/state/tests/chat-projection-writers.test.ts \
  src/features/chat/state/tests/chat-projection-selectors.test.ts \
  src/features/chat/state/tests/chat-projection-cache.test.ts
```

→ **0 failures, and a test count equal to your Step 0 snapshot for these three
files.** (Historically this read `Tests 26 passed (26)` = 23 + 3; that absolute
number is stale and is not a gate.) Since `57d956c` already landed the three
tests, this run should simply match the snapshot with nothing added.

**All three tests must pass against the unmodified source.** If any fails, the
test encodes the wrong expectation — fix the test, not the source. If you cannot
make one pass, STOP and report which rule you could not reproduce.

### Step 3: Define `ProjectionThread` and the new state shape

In `apps/web/src/features/chat/state/chat-projection-store.ts`:

1. **Delete** `ChatProjectionThreadShell` (lines 51-64),
   `ChatProjectionThreadDetailMeta` (66-76), `ChatProjectionThreadTurnState`
   (78-81) and `ChatSidebarThreadSummary` (83-108).
2. **Add** in their place:

```ts
/**
 * One thread, as this client holds it. Two independent subscriptions produce it —
 * the shell stream (the rail's view of every thread) and the detail stream (the open
 * transcript) — and they can arrive in either order: a detail snapshot cached before
 * a reconnect can land *after* a newer shell one. The shell is authoritative, and
 * `metaSource` / `sessionKnown` are what make that true no matter which arrives last.
 * The rule used to live in the shape of the state (five records merged shell-first at
 * read time); it lives in `threadFromDetail` now, where the compiler can see it.
 */
export type ProjectionThread = Pick<
  OrchestrationThreadShell,
  | 'archivedAt'
  | 'branch'
  | 'createdAt'
  | 'hasActionableProposedPlan'
  | 'id'
  | 'interactionMode'
  | 'latestTurn'
  | 'latestUserMessageAt'
  | 'modelSelection'
  | 'pendingApprovalCount'
  | 'pendingUserInputCount'
  | 'planProgress'
  | 'projectId'
  | 'runtimeMode'
  | 'session'
  | 'title'
  | 'updatedAt'
  | 'worktreePath'
> & {
  /** A detail snapshot has landed for this thread; the cache uses it to pick transcripts. */
  detailSynced: boolean
  /**
   * `latestTurn` advanced by this client's own events since the last shell publish.
   * Deliberately *not* the same fact as `latestTurn`: the rail reports what the server
   * published (so a thread's dot does not flicker on every local event) while the open
   * transcript reports what this client has observed. Both are real; neither derives
   * from the other.
   */
  liveTurn: OrchestrationLatestTurn | null
  /** Which producer owns the meta group. `'shell'` wins and is never downgraded. */
  metaSource: 'shell' | 'detail'
  /** Carried by the turn that implements a proposed plan, cleared by the next turn. */
  pendingSourceProposedPlan?: OrchestrationLatestTurn['sourceProposedPlan']
  /**
   * The slot the user dragged this session into, `null` while it holds none.
   * Event-derived: the thread shell carries no pin state, so a resnapshot must
   * carry this field across itself.
   */
  pinOrderKey: string | null
  /**
   * An authoritative producer (shell snapshot, shell stream item, or a session
   * event) has published a session for this thread. `null` is a real session value
   * — "stopped" — so presence, not truthiness, is what lets a detail snapshot fill
   * in only for a thread nothing authoritative has spoken about yet.
   */
  sessionKnown: boolean
}
```

3. **Rewrite** `ChatThread` (lines 121-133) as:

```ts
/**
 * A thread with its timelines attached — what the transcript renders. `latestTurn`
 * here is the *live* turn corrected for the session's terminal states, not the
 * shell-published one; `liveTurn` is therefore omitted rather than shipped alongside.
 */
export type ChatThread = Omit<ProjectionThread, 'liveTurn'> & {
  activities: OrchestrationThreadActivity[]
  messages: OrchestrationMessage[]
  proposedPlans: OrchestrationProposedPlan[]
  turnDiffSummaries: ChatTurnDiffSummary[]
}
```

4. In `ChatProjectionState`, **delete** the five keys
   `sidebarThreadSummaryById`, `threadDetailMetaById`, `threadSessionById`,
   `threadShellById`, `threadTurnStateById`, and **add** one, in alphabetical
   position (after `proposedPlanIdsByThreadId`):

```ts
threadById: Record<ThreadId, ProjectionThread>
```

5. In `createInitialChatProjectionState()`, delete the same five initializers
   and add `threadById: {},` in alphabetical position.
6. Fix the import list: `OrchestrationThreadShell` is now needed as a `type`
   import in this file (it was previously only referenced by the deleted `Pick`s
   — check whether it is still in the list and add it if not). Remove any import
   that is now unused.

**Verify**: nothing yet — the file will not typecheck until step 7. Just confirm
the file has exactly one `Record<ThreadId, ProjectionThread>`:

```bash
cd apps/web && rg -c "threadById: Record<ThreadId, ProjectionThread>" src/features/chat/state/chat-projection-store.ts
```

→ `1`.

### Step 4: Rewrite the writers

All edits in `apps/web/src/features/chat/state/chat-projection-writers.ts`.

**4a — `syncChatProjectionShellSnapshot` (lines 44-76).** Delete the
`sidebarThreadSummaryById` retain block, the `threadSessionById: {}` and
`threadShellById: {}` wipes and their comment; rename the loop's writer:

```ts
export function syncChatProjectionShellSnapshot(
  state: ChatProjectionState,
  snapshot: OrchestrationShellSnapshot,
): ChatProjectionState {
  if (!shouldApplyShellSnapshot(state, snapshot)) return state

  const nextThreadIds = new Set(snapshot.threads.map((thread) => thread.id))
  let nextState: ChatProjectionState = {
    ...state,
    ...projectStateFromShell(snapshot.projects),
    ...retainSurvivingThreadSlices(state, nextThreadIds),
    bootstrapComplete: true,
    lastAppliedShellSequence: snapshot.snapshotSequence,
    lastAppliedShellUpdatedAt: snapshot.updatedAt,
    threadIds: [],
    threadIdsByProjectId: {},
  }

  for (const thread of snapshot.threads) {
    nextState = writeThreadFromShell(nextState, thread)
  }

  return nextState
}
```

**4b — `retainDetailSlices` (lines 183-204)** becomes
`retainSurvivingThreadSlices`: drop `threadDetailMetaById` and
`threadTurnStateById`, add `threadById`, and update the doc comment:

```ts
/**
 * Everything a surviving thread owns crosses a shell resnapshot; everything a thread
 * the snapshot no longer lists owns is dropped. `threadById` is in here because the
 * record carries facts no shell write can refresh — the arranged pin slot, and the
 * `pendingSourceProposedPlan` whose event the retained detail cursor guarantees is
 * never replayed, so wiping it would lose the plan banner until the next turn.
 */
function retainSurvivingThreadSlices(state: ChatProjectionState, threadIds: ReadonlySet<ThreadId>) {
  return {
    activityByThreadId: retainThreadScopedRecord(state.activityByThreadId, threadIds),
    activityIdsByThreadId: retainThreadScopedRecord(state.activityIdsByThreadId, threadIds),
    messageByThreadId: retainThreadScopedRecord(state.messageByThreadId, threadIds),
    messageIdsByThreadId: retainThreadScopedRecord(state.messageIdsByThreadId, threadIds),
    proposedPlanByThreadId: retainThreadScopedRecord(state.proposedPlanByThreadId, threadIds),
    proposedPlanIdsByThreadId: retainThreadScopedRecord(state.proposedPlanIdsByThreadId, threadIds),
    threadById: retainThreadScopedRecord(state.threadById, threadIds),
    threadDetailSequenceById: retainThreadScopedRecord(state.threadDetailSequenceById, threadIds),
    threadHasEarlierById: retainThreadScopedRecord(state.threadHasEarlierById, threadIds),
    turnDiffIdsByThreadId: retainThreadScopedRecord(state.turnDiffIdsByThreadId, threadIds),
    turnDiffSummaryByThreadId: retainThreadScopedRecord(state.turnDiffSummaryByThreadId, threadIds),
  }
}
```

**4c — `writeThreadShellState` (521-555), `shellFromThreadShell` (1237-1251) and
`sidebarSummaryFromThreadShell` (1271-1294)** collapse into one writer plus one
builder. Delete all three and add:

```ts
function writeThreadFromShell(
  state: ChatProjectionState,
  thread: OrchestrationThreadShell,
): ChatProjectionState {
  const previous = state.threadById[thread.id]
  const nextState = ensureThreadRegistered(state, thread.id, thread.projectId, previous?.projectId)

  return {
    ...nextState,
    threadById: {
      ...nextState.threadById,
      [thread.id]: threadFromShell(thread, previous),
    },
  }
}

/**
 * The shell is the whole truth for everything it publishes. The three client-only
 * facts have no shell producer, so they are carried across explicitly — a resnapshot
 * that dropped them would lose the arranged pin slot and the plan banner.
 */
function threadFromShell(
  thread: OrchestrationThreadShell,
  previous: ProjectionThread | undefined,
): ProjectionThread {
  return {
    archivedAt: thread.archivedAt,
    branch: thread.branch,
    createdAt: thread.createdAt,
    detailSynced: previous?.detailSynced ?? false,
    hasActionableProposedPlan: thread.hasActionableProposedPlan,
    id: thread.id,
    interactionMode: thread.interactionMode,
    latestTurn: thread.latestTurn,
    latestUserMessageAt: thread.latestUserMessageAt,
    liveTurn: thread.latestTurn,
    metaSource: 'shell',
    modelSelection: thread.modelSelection,
    pendingApprovalCount: thread.pendingApprovalCount,
    pendingSourceProposedPlan: carriedPendingSourcePlan(previous, thread.latestTurn),
    pendingUserInputCount: thread.pendingUserInputCount,
    pinOrderKey: previous?.pinOrderKey ?? null,
    planProgress: thread.planProgress,
    projectId: thread.projectId,
    runtimeMode: thread.runtimeMode,
    session: thread.session,
    sessionKnown: true,
    title: thread.title,
    updatedAt: thread.updatedAt,
    worktreePath: thread.worktreePath,
  }
}
```

Rewrite `carriedPendingSourcePlan` (1023-1037) to take the previous record
instead of `(state, threadId)`; the logic and its comment are unchanged. Its only
caller today is `writeThreadLatestTurn`, which this step deletes — after the
rewrite the only caller is `threadFromShell` above:

```ts
function carriedPendingSourcePlan(
  previous: ProjectionThread | undefined,
  latestTurn: OrchestrationLatestTurn | null,
) {
  if (latestTurn?.sourceProposedPlan) return latestTurn.sourceProposedPlan
  if (!previous?.pendingSourceProposedPlan) return undefined
  // Only the turn the plan was implemented by carries it. A newer turn drops it, or a
  // resolved plan would pin the thread's detail subscription against eviction forever.
  if (previous.liveTurn?.turnId !== latestTurn?.turnId) return undefined

  return previous.pendingSourceProposedPlan
}
```

Delete `writeThreadLatestTurn` (1007-1021) — `threadFromShell` now does its job
inline. Update the two references to `writeThreadShellState`
(`applyFreshShellStreamItem` at line 325 and `writeCreatedThread` at 641) to
call `writeThreadFromShell`.

**4d — `writeThreadDetailState` (557-617) and `detailMetaFromThread`
(1253-1269).** Replace the `threadDetailMetaById` block in
`writeThreadDetailState` with:

```ts
      threadById: {
        ...state.threadById,
        [thread.id]: threadFromDetail(thread, state.threadById[thread.id]),
      },
```

and replace `detailMetaFromThread` with the merge that **is** the shell-wins
rule:

```ts
/**
 * The detail subscription is the weaker producer. Both subscriptions run
 * independently, so a detail snapshot cached before a reconnect can land after a
 * newer shell one — it therefore fills in only what nothing authoritative has
 * published yet. `metaSource` decides the meta group all-or-nothing (never per
 * field: the shell publishes them as one row and mixing halves of two rows is how
 * a stale branch ends up next to a fresh worktree), and `sessionKnown` decides the
 * session by presence, because `null` is a real session value.
 *
 * The thread is deliberately *not* registered in `threadIds` here: a thread the
 * shell has not delivered is resolvable by id but is not a rail row.
 */
function threadFromDetail(
  thread: OrchestrationThread,
  previous: ProjectionThread | undefined,
): ProjectionThread {
  if (previous?.metaSource === 'shell') {
    return {
      ...previous,
      detailSynced: true,
      liveTurn: previous.liveTurn ?? thread.latestTurn,
    }
  }

  return {
    archivedAt: thread.archivedAt,
    branch: thread.branch,
    createdAt: thread.createdAt,
    detailSynced: true,
    // Shell-only counters: nothing authoritative has published this thread, so they
    // stand at their zero values and `selectChatThreadById` derives the plan flag
    // from the plans it holds instead.
    hasActionableProposedPlan: false,
    id: thread.id,
    interactionMode: thread.interactionMode ?? DEFAULT_INTERACTION_MODE,
    latestTurn: thread.latestTurn,
    latestUserMessageAt: null,
    liveTurn: previous?.liveTurn ?? thread.latestTurn,
    metaSource: 'detail',
    modelSelection: thread.modelSelection,
    pendingApprovalCount: 0,
    pendingSourceProposedPlan: previous?.pendingSourceProposedPlan,
    pendingUserInputCount: 0,
    pinOrderKey: previous?.pinOrderKey ?? null,
    planProgress: null,
    projectId: thread.projectId,
    runtimeMode: thread.runtimeMode ?? DEFAULT_RUNTIME_MODE,
    session: previous?.sessionKnown ? previous.session : thread.session,
    sessionKnown: previous?.sessionKnown ?? false,
    title: thread.title,
    updatedAt: thread.updatedAt,
    worktreePath: thread.worktreePath,
  }
}
```

**4e — `writeThreadSession` (993-1005)**:

```ts
function writeThreadSession(
  state: ChatProjectionState,
  threadId: ThreadId,
  session: OrchestrationSession | null,
): ChatProjectionState {
  const thread = state.threadById[threadId]
  // A session for a thread the projection has never seen had no reader before either:
  // `selectChatThreadById` resolves nothing without a thread record. Dropping it keeps
  // every record complete instead of half-born.
  if (!thread) return state

  return {
    ...state,
    threadById: {
      ...state.threadById,
      [threadId]: { ...thread, session, sessionKnown: true },
    },
  }
}
```

**4f — `writeThreadTurnState` (1039-1051)** becomes `writeThreadTurn`, and its
parameter makes both turn fields **required** so every call site has to decide
what happens to the pending plan (today, passing an object without
`pendingSourceProposedPlan` silently cleared it — an implicit rule the compiler
could not see):

```ts
/**
 * Both fields are required on purpose. The old turn-state record was *replaced*
 * wholesale by every writer, so omitting `pendingSourceProposedPlan` cleared it and
 * nothing said so. Spreading onto one record would silently preserve it instead, so
 * the type forces each caller to state which it means.
 */
type ThreadTurnWrite = {
  liveTurn: OrchestrationLatestTurn | null
  pendingSourceProposedPlan: OrchestrationLatestTurn['sourceProposedPlan'] | undefined
}

function writeThreadTurn(
  state: ChatProjectionState,
  threadId: ThreadId,
  turn: ThreadTurnWrite,
): ChatProjectionState {
  const thread = state.threadById[threadId]
  if (!thread) return state

  return {
    ...state,
    threadById: {
      ...state.threadById,
      [threadId]: { ...thread, ...turn },
    },
  }
}
```

Update every caller. This table is the authoritative mapping — it preserves
today's clear-or-keep behaviour exactly:

| Caller (current line)                                         | `liveTurn`                                                    | `pendingSourceProposedPlan`                    |
| ------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------- |
| `applyThreadTurnStartRequestedEvent` (696)                    | the newly built `latestTurn`                                  | `event.payload.sourceProposedPlan`             |
| `applyThreadTurnInterruptRequestedEvent` (710)                | the interrupted turn                                          | **keep**: `thread.pendingSourceProposedPlan`   |
| `applyThreadSessionSetEvent` (740)                            | the running turn it builds                                    | `undefined` (today's replace cleared it)       |
| `applyThreadTurnDiffCompletedEvent` (905)                     | the completed turn                                            | `undefined` (today's replace cleared it)       |
| `writeTurnFailureState` (1065)                                | the errored turn                                              | **keep**: `thread.pendingSourceProposedPlan`   |
| `writeAssistantMessageTurnState` (1092)                       | the assistant turn it builds                                  | **keep**: `current?.pendingSourceProposedPlan` |
| `applyThreadRevertedEvent` (973-978, writes the slice inline) | `latestSummary ? latestTurnFromSummary(latestSummary) : null` | `undefined`                                    |

In each of those functions, replace reads of
`state.threadTurnStateById[threadId]` /
`nextState.threadTurnStateById[…]?.latestTurn` with
`state.threadById[threadId]` / `…?.liveTurn`. Note that
`applyThreadTurnInterruptRequestedEvent` and `writeTurnFailureState` currently
spread `...turnState` into the write; with a required-field `ThreadTurnWrite`
that spread is gone, so pass `pendingSourceProposedPlan:
thread.pendingSourceProposedPlan` explicitly instead (this is what the table's
**keep** means).

`applyThreadRevertedEvent` (919-980) is the one that does not call a writer today
— it returns one big object literal whose last key is the inline
`threadTurnStateById: { … }` block at 973-978. Delete that block and wrap the
whole literal:

```ts
return writeThreadTurn(
  {
    ...patchThread(state, threadId, { updatedAt: event.payload.revertedAt }),
    /* … the eight list-slice keys, unchanged … */
  },
  threadId,
  {
    liveTurn: latestSummary ? latestTurnFromSummary(latestSummary) : null,
    pendingSourceProposedPlan: undefined,
  },
)
```

**4g — `patchThreadShellAndSummary` (1108-1128) and `patchThreadShell`
(1130-1149)** collapse into one, and `pickSummaryPatch` (1514-1527) is deleted:

```ts
function patchThread(
  state: ChatProjectionState,
  threadId: ThreadId,
  patch: Partial<ProjectionThread>,
): ChatProjectionState {
  const thread = state.threadById[threadId]
  if (!thread) return state

  const nextThread = compactUpdate(thread, patch)
  if (nextThread === thread) return state

  return {
    ...state,
    threadById: {
      ...state.threadById,
      [threadId]: nextThread,
    },
  }
}
```

Replace **every** `patchThreadShellAndSummary(` and `patchThreadShell(` call
with `patchThread(` — there are eleven, at lines 388, 393, 400, 405, 666, 689,
780, 826, 857, 894, 940. The two functions become one; that is the point.

**4h — `writeThreadPinOrderKey` (457-478)**:

```ts
/**
 * The arranged slot has no shell producer, so it is written here and carried across
 * resnapshots by `threadFromShell`.
 */
function writeThreadPinOrderKey(
  state: ChatProjectionState,
  threadId: ThreadId,
  pinOrderKey: string | null,
): ChatProjectionState {
  const thread = state.threadById[threadId]
  if (!thread) return state
  if (thread.pinOrderKey === pinOrderKey) return state

  return {
    ...state,
    threadById: {
      ...state.threadById,
      [threadId]: { ...thread, pinOrderKey },
    },
  }
}
```

**4i — `removeThreadState` (1207-1228)**: replace the five deleted-record lines
with one:

```ts
    threadById: removeRecordKey(state.threadById, threadId),
```

**4j** — update the file's `import type { … } from './chat-projection-store'`
block: it now needs `ChatProjectionState`, `ChatTurnDiffSummary` and
`ProjectionThread`, and must no longer name the four deleted types.
`OrchestrationThread` is still needed (used by `threadFromDetail` and
`snapshotWindowFull`).

**Verify**: no old record name survives in this file:

```bash
cd apps/web && rg -n "threadShellById|threadDetailMetaById|sidebarThreadSummaryById|threadSessionById|threadTurnStateById|patchThreadShell|pickSummaryPatch" src/features/chat/state/chat-projection-writers.ts
```

→ no output.

### Step 5: Rewrite the selectors

In `apps/web/src/features/chat/state/chat-projection-selectors.ts`:

1. Rename `EMPTY_SIDEBAR_THREADS` → `EMPTY_THREADS` and retype it as
   `ProjectionThread[]`; retype `unarchivedThreadsCache` and
   `unarchivedThreads` from `ChatSidebarThreadSummary` to `ProjectionThread`.
   Their behaviour (filter out `archivedAt`, cache on the collected array's
   identity) is unchanged.
2. `selectChatSidebarThreads` / `selectChatSidebarThreadsForProject`: swap
   `state.sidebarThreadSummaryById` for `state.threadById` and the empty
   constant. Return type becomes `ProjectionThread[]`.
3. Retype `threadCache` to `WeakMap<ProjectionThread, { … }>` with only five
   members — the eight-key comparison collapses because there is now one source
   for every scalar:

```ts
const threadCache = new WeakMap<
  ProjectionThread,
  {
    activities: ChatThread['activities']
    messages: ChatThread['messages']
    proposedPlans: ChatThread['proposedPlans']
    thread: ChatThread
    turnDiffSummaries: ChatThread['turnDiffSummaries']
  }
>()
```

4. Replace `selectChatThreadById` (96-160) and **delete**
   `selectSessionForThread` (162-176, doc comment included):

```ts
/**
 * A thread with its timelines attached. The shell-versus-detail merge that used to
 * happen here now happens once, in `threadFromDetail` — this only has to attach the
 * list slices and correct the live turn for a session that ended without one.
 *
 * Cached on the record's identity: this feeds zustand selectors, and a fresh object
 * per read is a re-render loop.
 */
export function selectChatThreadById(
  state: ChatProjectionState,
  threadId: ThreadId | null | undefined,
): ChatThread | undefined {
  if (!threadId) return undefined

  const projected = state.threadById[threadId]
  if (!projected) return undefined

  const messages = selectChatMessagesForThread(state, threadId)
  const activities = selectChatActivitiesForThread(state, threadId)
  const proposedPlans = selectChatProposedPlansForThread(state, threadId)
  const turnDiffSummaries = selectChatTurnDiffSummariesForThread(state, threadId)
  const cached = threadCache.get(projected)

  if (
    cached &&
    cached.activities === activities &&
    cached.messages === messages &&
    cached.proposedPlans === proposedPlans &&
    cached.turnDiffSummaries === turnDiffSummaries
  ) {
    return cached.thread
  }

  const { liveTurn, ...rest } = projected
  const thread: ChatThread = {
    ...rest,
    activities,
    // Nothing authoritative has published the flag for a detail-only thread, so the
    // plans it holds are the best answer available.
    hasActionableProposedPlan:
      projected.metaSource === 'shell'
        ? projected.hasActionableProposedPlan
        : hasOpenPlan(proposedPlans),
    latestTurn: latestTurnForSession(liveTurn, projected.session),
    messages,
    proposedPlans,
    turnDiffSummaries,
  }

  threadCache.set(projected, {
    activities,
    messages,
    proposedPlans,
    thread,
    turnDiffSummaries,
  })

  return thread
}
```

5. Fix the type imports: this file now needs `ChatProjectionState`, `ChatThread`
   and `ProjectionThread` from `./chat-projection-store`, and no longer needs
   `ChatProjectionThreadDetailMeta`, `ChatProjectionThreadShell`,
   `ChatProjectionThreadTurnState`, `ChatSidebarThreadSummary` or
   `ChatTurnDiffSummary`. `OrchestrationSession` may become unused — delete it
   if so (`noUnusedLocals` will tell you).

`latestTurnForSession`, `terminalLatestTurn`, `hasOpenPlan`, `collectByIds`,
`selectChatThreadHasEarlier`, `chatThreadEarlierPageInput` and
`createChatThreadSelector` are unchanged.

**Verify**:

```bash
cd apps/web && rg -c "cached\." src/features/chat/state/chat-projection-selectors.ts
```

→ `5` (four identity comparisons plus `cached.thread`).

### Step 6: Rewrite the cache and the subscription reads

**`apps/web/src/features/chat/state/chat-projection-cache.ts`** — replace
`cachedShellThreads` (162-180) and delete `cachedThreadSession` (182-191):

```ts
function cachedShellThreads(state: ChatProjectionState) {
  const threads: OrchestrationThreadShell[] = []

  for (const threadId of state.threadIds) {
    if (threads.length >= CHAT_PROJECTION_CACHE_THREAD_LIMIT) break

    const thread = state.threadById[threadId]
    if (!thread) continue

    threads.push(shellFromProjectionThread(thread))
  }

  return threads
}

/**
 * Exactly the fields `orchestrationThreadShellSchema` defines. The client-only facts
 * — the arranged pin slot, the provenance stamps, the live turn — are deliberately
 * absent: the reader parses this back through the same schema and would strip them.
 */
function shellFromProjectionThread(thread: ProjectionThread): OrchestrationThreadShell {
  return {
    archivedAt: thread.archivedAt,
    branch: thread.branch,
    createdAt: thread.createdAt,
    hasActionableProposedPlan: thread.hasActionableProposedPlan,
    id: thread.id,
    interactionMode: thread.interactionMode,
    latestTurn: thread.latestTurn,
    latestUserMessageAt: thread.latestUserMessageAt,
    modelSelection: thread.modelSelection,
    pendingApprovalCount: thread.pendingApprovalCount,
    pendingUserInputCount: thread.pendingUserInputCount,
    // `planProgress` is optional on the schema, so leaving it out would compile and
    // silently drop the plan-progress label from every cache-hydrated rail row.
    planProgress: thread.planProgress,
    projectId: thread.projectId,
    runtimeMode: thread.runtimeMode,
    session: thread.session,
    title: thread.title,
    updatedAt: thread.updatedAt,
    worktreePath: thread.worktreePath,
  }
}
```

Then `cachedTranscripts` (199-218) — the "which threads have a transcript"
question is now the `detailSynced` stamp:

```ts
const threadIds = (Object.keys(state.threadById) as ThreadId[]).filter(
  (threadId) => state.threadById[threadId]?.detailSynced,
)
```

and `threadDetailUpdatedAt` (220-224) collapses, because shell-wins already
happened at write time:

```ts
function threadDetailUpdatedAt(state: ChatProjectionState, threadId: ThreadId) {
  return state.threadById[threadId]?.updatedAt ?? ''
}
```

Fix the imports: `ChatSidebarThreadSummary` → `ProjectionThread`;
`OrchestrationSession` and `ThreadId` may become unused — delete what
`noUnusedLocals` flags.

**`apps/web/src/features/chat/state/thread-detail-subscriptions.ts`** — three
sites:

```ts
// line 159, inside handleProjectionChange. `metaSource === 'shell'`, not mere
// presence: this asks "has the shell delivered this thread?", and a thread known
// only from a detail snapshot has not been.
      if (state.threadById[entry.threadId]?.metaSource === 'shell') {

// line 181, inside getOrCreateEntry
      observedInProjection: store.getState().threadById[threadId]?.metaSource === 'shell',
```

and `isProtectedThread` (393-407), where the duplication disappears:

```ts
function isProtectedThread(threadId: ThreadId) {
  const thread = store.getState().threadById[threadId]
  if (!thread) return false
  if (thread.hasActionableProposedPlan) return true
  if (thread.pendingApprovalCount > 0) return true
  if (thread.pendingUserInputCount > 0) return true
  if (thread.latestTurn?.state === 'running') return true
  if (thread.liveTurn?.state === 'running') return true
  if (thread.pendingSourceProposedPlan !== undefined) return true

  return isBusySession(thread.session)
}
```

**Verify**:

```bash
cd apps/web && rg -n "sidebarThreadSummaryById|threadShellById|threadDetailMetaById|threadSessionById|threadTurnStateById" src/features/chat/state/
```

→ output only from `src/features/chat/state/tests/` (step 7 clears those).

**Verify the opposite case too.** `isProtectedThread` gets _stricter_ here (see
maintenance note 4: the stale shell copy of the session no longer votes). The
control that it did not get stricter for a genuinely busy thread is
`src/features/chat/state/tests/thread-detail-subscriptions.test.ts:69`,
_"protects running and actionable threads from idle eviction"_. That file is
**out of scope** — it must still pass without a single edit:

```bash
cd apps/web && bun --bun vitest run --project node \
  src/features/chat/state/tests/thread-detail-subscriptions.test.ts
```

→ all pass. Run it again after step 7, because it drives the shared
`threadShell()` factory that step 7c rewrites. If it fails, the refactor changed
subscription lifetimes — a STOP condition, not a test to edit.

### Step 7: Update the external consumers, factories and tests

**7a — record rename.** In each of these ten files, `state.sidebarThreadSummaryById`
(or `projection.sidebarThreadSummaryById`, or
`…getState().sidebarThreadSummaryById`) becomes `…threadById`. Nothing else in
them changes:

`components/command-palette/use-command-palette-sessions.ts:15`,
`features/chat-mode/hooks/use-session-actions.ts:121`,
`features/chat-mode/hooks/use-session-menu.ts:20`,
`features/chat-mode/hooks/use-session-tool-root.ts:20`,
`features/chat-mode/components/chat-stage.tsx:31`,
`features/chat-mode/components/session-rail.tsx:60`,
`features/chat-mode/providers/session-provider.tsx:50`,
`features/chat-mode/state/session-commands.ts:143`,
`features/chat-mode/state/rail-order-commands.ts:198`,
`features/chat-mode/state/rail-order-store.ts:59`.

Also fix the prose in `features/chat-mode/utils/session-threads.ts:9`, which
names `sidebarThreadSummaryById` in a doc comment.

**7b — type rename.** `ChatSidebarThreadSummary` → `ProjectionThread` in every
file that imports it: `chat-mode/providers/session-context.ts`,
`chat-mode/hooks/use-session-actions.ts`, `chat-mode/utils/running-turn.ts`,
`chat-mode/utils/session-order.ts`, `chat-mode/utils/session-rail-model.ts`,
`chat-mode/utils/session-threads.ts`, `chat-mode/utils/session-unread.ts`,
`chat/lib/thread-status.ts`, `chat/lib/chat-formatters.ts`,
`chat/components/chat-panel-header.tsx`,
`chat-mode/utils/tests/session-rail-model.test.ts`, plus the projection files
already handled. Every occurrence is in a type position or an `import type`;
none has a value site.

One field changes shape in the rename: `ChatSidebarThreadSummary.pinOrderKey`
was `pinOrderKey?: string | null`, and `ProjectionThread.pinOrderKey` is required
`string | null`. Existing readers already write `thread.pinOrderKey ?? null`
(`session-rail-model.ts:207`, `session-order.ts:19`, `rail-order-store.ts:59`) so
they keep compiling — leave the `?? null` alone rather than "tidying" it. Only an
object _literal_ typed as the thread type would newly fail, and typecheck names
it if one exists.

In `chat-formatters.ts` also rename
`compareChatSidebarThreads`'s parameter types only — leave the function name
alone (it is the sidebar's comparator and `plans/011` owns that file's layout).

**7c — factories** (`apps/web/test/factories/chat.ts`). Today `threadShell()`
derives from `sidebarThreadSummary()` which derives from `thread()`. Invert the
chain so it has no cycle and every factory produces a complete record. Replace
`thread` (85-130), `sidebarThreadSummary` (148-171) and `threadShell` (173-184)
with:

```ts
export function threadShell(
  overrides: Partial<OrchestrationThreadShell> = {},
): OrchestrationThreadShell {
  const threadId = v.parse(threadIdSchema, 'thread-1')
  const turnId = v.parse(turnIdSchema, 'turn-1')

  return {
    archivedAt: null,
    branch: null,
    createdAt: timestamp(1),
    hasActionableProposedPlan: false,
    id: threadId,
    interactionMode: DEFAULT_INTERACTION_MODE,
    latestTurn: {
      assistantMessageId: null,
      completedAt: null,
      requestedAt: timestamp(1),
      startedAt: timestamp(2),
      state: 'running',
      turnId,
    },
    latestUserMessageAt: timestamp(1),
    modelSelection: { model: 'claude-opus-5', providerInstanceId: DEFAULT_PROVIDER_INSTANCE_ID },
    pendingApprovalCount: 0,
    pendingUserInputCount: 0,
    projectId: v.parse(projectIdSchema, 'project-1'),
    runtimeMode: DEFAULT_RUNTIME_MODE,
    session: {
      activeTurnId: turnId,
      lastError: null,
      providerInstanceId: DEFAULT_PROVIDER_INSTANCE_ID,
      providerName: 'Codex',
      providerSessionId: 'provider-session-1',
      runtimeMode: DEFAULT_RUNTIME_MODE,
      status: 'running',
      threadId,
      updatedAt: timestamp(2),
    },
    title: 'Thread',
    updatedAt: timestamp(2),
    worktreePath: null,
    ...overrides,
  }
}

export function projectionThread(overrides: Partial<ProjectionThread> = {}): ProjectionThread {
  const source = threadShell()

  return {
    ...source,
    detailSynced: false,
    liveTurn: source.latestTurn,
    metaSource: 'shell',
    pinOrderKey: null,
    sessionKnown: true,
    ...overrides,
  }
}

export function thread(overrides: Partial<ChatThread> = {}): ChatThread {
  const { liveTurn: _liveTurn, ...source } = projectionThread()

  return {
    ...source,
    activities: [],
    messages: [],
    proposedPlans: [],
    turnDiffSummaries: [],
    ...overrides,
  }
}
```

The field values are byte-identical to today's `thread()`, so no existing
assertion changes. If oxlint objects to `_liveTurn`, build `thread()`'s literal
field by field instead of destructuring — do not silence the rule.

Rename the `sidebarThreadSummary` import to `projectionThread` in its three
consumers: `chat-mode/utils/tests/session-rail-model.test.ts:6`,
`chat-mode/components/tests/stage-header.test.tsx:25`,
`chat/lib/tests/thread-status.test.ts`.

**7d — the three representation-coupled tests.** These assert _how_ the state is
shaped, not what it means, so they must be re-expressed against the new shape.
Per `AGENTS.md` (_"Delete obsolete tests instead of preserving old behavior"_),
do not keep a second copy of the old assertions.

In `chat-projection-writers.test.ts`:

- Line 138, _"a thread detail snapshot leaves every shell-owned record
  untouched"_ — the record-identity assertions
  (`expect(state.threadShellById).toBe(shellById)` etc.) no longer have records
  to compare. Rename it to **"a thread detail snapshot cannot revert
  shell-published metadata"** and assert the meaning instead:

```ts
const threadBefore = state.threadById[threadId]
/* … apply the stale detail snapshot … */
expect(state.threadById[threadId]).toMatchObject({
  branch: 'main',
  metaSource: 'shell',
  session: threadBefore?.session,
  title: 'shell thread',
  worktreePath: threadBefore?.worktreePath,
})
expect(state.threadById[threadId]?.detailSynced).toBe(true)
expect(state.threadIds).toBe(threadIds)
```

- Line 58, _"removes all thread-scoped state when the shell removes a thread"_ —
  replace the five per-record `toBeUndefined()` assertions with one
  `expect(state.threadById[threadId]).toBeUndefined()`; keep the message,
  activity, `threadIds` and `threadIdsByProjectId` assertions as they are.
- Line 351, _"keeps sidebar summaries shell-owned while detail events update
  local turn state"_ — this is the test that guards the two-turn-fields
  distinction and it **must survive in spirit**. Rewrite it as:

```ts
const publishedTurn = state.threadById[threadId]?.latestTurn
/* … apply the turn event … */
// The rail reports what the server published; the transcript reports what this
// client has observed. A local event must move only the second.
expect(state.threadById[threadId]?.latestTurn).toBe(publishedTurn)
expect(state.threadById[threadId]?.liveTurn).toMatchObject({
  /* … as before … */
})
```

- Lines 55, 132-133, 229, 345, 373, 400, 456 read
  `state.threadShellById[…]?.title`, `state.sidebarThreadSummaryById[…]?.title`
  or `state.threadTurnStateById[…]?.latestTurn` — rewrite each as
  `state.threadById[…]?.title` / `?.liveTurn` /
  `?.pendingSourceProposedPlan`. Where two lines now assert the same thing
  (132 and 133), delete one.
- The test you added in step 2 asserts
  `state.sidebarThreadSummaryById[threadId]?.pinOrderKey` — update it to
  `state.threadById[threadId]?.pinOrderKey`.

In `chat-projection-selectors.test.ts`, the five existing tests plus your two
new ones read through `selectChatThreadById` / `selectChatSidebarThreads` and
should need **no change at all**. If one fails, that is a real behaviour
regression, not a test to adjust — treat it as a STOP condition.

In `chat-projection-cache.test.ts`, the five tests drive
`chatProjectionCacheFromState` / `hydrateChatProjectionState` and likewise
should need no change beyond any direct record read. Check for one:

```bash
cd apps/web && rg -n "ById\[" src/features/chat/state/tests/chat-projection-cache.test.ts
```

**Verify**:

```bash
cd apps/web && bun run typecheck
```

→ exit 0. **This is the first point where typecheck must pass.** If it reports
an unused import or helper, delete the thing — do not add an `eslint-disable` or
a `void` reference.

```bash
cd apps/web && rg -n "ChatSidebarThreadSummary|ChatProjectionThreadShell|ChatProjectionThreadDetailMeta|ChatProjectionThreadTurnState|sidebarThreadSummaryById|threadShellById|threadDetailMetaById|threadSessionById|threadTurnStateById|sidebarThreadSummary\(" src test
```

→ no output.

### Step 8: Run every gate, then look at the running app

```bash
cd apps/web && bun --bun vitest run --project node --project dom \
  src/features/chat src/features/chat-mode src/components/command-palette
```

→ **0 failures, and a test count equal to `/tmp/037-blast-before.txt`.** Step 2
already landed in `57d956c`, so the snapshot includes those three tests and
nothing is added here. (This line historically read `Tests 847 passed (847)`;
that absolute number was measured at `ace313f` and is not a gate.) Any failure
here is a behaviour regression — fix the source, not the test, unless the test
was one of the three rewritten in step 7d.

Now the per-workspace gates. Capture each and diff it against the Step 0
snapshot:

```bash
cd apps/web && bun run typecheck 2>&1 | tail -5 > /tmp/037-typecheck-after.txt
cd apps/web && bun run lint      2>&1 | tail -5 > /tmp/037-lint-after.txt
cd apps/web && bun run format && bun run format:check
cd apps/web && bun run test      2>&1 | tail -5 > /tmp/037-test-after.txt

diff /tmp/037-typecheck-before.txt /tmp/037-typecheck-after.txt
diff /tmp/037-lint-before.txt      /tmp/037-lint-after.txt
diff /tmp/037-test-before.txt      /tmp/037-test-after.txt
```

The pass condition is a **delta**, not an absolute:

- `typecheck` exits 0 (it was already 0 at Step 0, so any output is new and is a
  failure).
- `format:check` exits 0.
- `lint` shows **no error that is not already** in
  `/tmp/037-lint-before.txt`. Warning counts may move; new errors may not.
- `test` shows **no test that passed at Step 0 now failing**, and no reduction in
  passing count. The one snapshotted pre-existing failure —
  `features/settings/tests/page.test.tsx > refuses an application-scoped key from
the workspace tab, and says why` — **is expected to still be there and does not
  block this plan.** It is unrelated to the chat projection and is tracked
  separately; fixing it here would put an out-of-scope file in your diff.

**Do not run `bun run verify`.** The old version of this step ended with
`bun run verify` from the repo root → exit 0. That gate is deleted: it runs the
whole monorepo and short-circuits, so the unrelated `page.test.tsx` failure above
makes it permanently red while telling you nothing about `apps/web`. The four
per-workspace commands here are the complete gate. This plan touches `apps/web`
only, so no other workspace needs checking.

**Live check.** A dev server is already running at `http://localhost:5173` —
**do not start one**. Open it and confirm, in order:

1. The session rail lists sessions grouped by project, with their status dots.
2. Opening a session paints its transcript, and the header shows its title and
   branch.
3. Sending a message streams tokens into the transcript, and the composer's
   busy/stop affordance flips while the turn runs and back when it ends.
4. Dragging a session to a new slot in the rail keeps that slot after a hard
   reload (`Cmd-Shift-R`) — this is the `pinOrderKey`-across-resnapshot path
   that step 2's third test guards at the unit level.
5. While the turn from check 3 streams, the rail rows stay in the same order and
   none of them jumps position. This is the one thing maintenance note 2 could
   plausibly break: `updatedAt` now moves on every streamed activity, and the
   comparator must still ignore it.

**One-time local cleanup**: this refactor does not change the persisted cache
shape, so no cache reset is needed. If the app paints a blank rail on first load
after your change, clear the one key and reload —
`localStorage.removeItem('platform.chat-projection')` in the devtools console —
and then report it, because a shape change means something in step 6 diverged.

## Test plan

**Three new tests, written in step 2 against the unmodified source** (this is
deliberate: a characterization test written after the refactor documents the
refactor, not the behaviour). **All three already landed in commit `57d956c`** —
do not write them again; verify and move on:

| File                                | Test                                                                               | Covers                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `chat-projection-selectors.test.ts` | _a published null session outranks a detail snapshot that still carries one_       | precedence rule 2 — session by **presence**, not truthiness |
| `chat-projection-selectors.test.ts` | _a thread with no published turn still shows the turn its detail snapshot carried_ | precedence rule 3 — turn by **value** fallback              |
| `chat-projection-writers.test.ts`   | _a shell resnapshot preserves the arranged pin slot_                               | the one field with no shell producer                        |

Model them on the two tests already in `chat-projection-selectors.test.ts` at
lines 68 and 99 — same imports, same `threadShell` factory, same
`syncChatProjectionShellSnapshot` → `syncChatProjectionThreadDetailSnapshot`
shape, same `expect(selectChatThreadById(state, threadId)).toMatchObject(…)`
assertion style. For the writers test, model on line 319 (_"a shell resnapshot
preserves the pending source proposed plan"_), which is structurally identical:
apply a shell snapshot, apply an event, apply a second shell snapshot, assert
the field survived.

**Three tests rewritten, not added** (step 7d): the record-identity assertions
in `chat-projection-writers.test.ts` at lines 58, 138 and 351. Their _subject_
survives; only the shape of the assertion changes.

**No new tests beyond those three.** The existing ~1,190 lines across
`chat-projection-writers.test.ts` (785), `chat-projection-cache.test.ts` (213)
and `chat-projection-selectors.test.ts` (189) are the gate, and the cache tests
in particular exercise a full write → `localStorage` → read → replay-through-the
-real-writers round trip, which is the single best end-to-end check that the
normalized record still produces an identical projection. Padding the suite with
tests of the new record's field-by-field contents would test the implementation,
not the behaviour.

## Done criteria

Machine-checkable. ALL must hold. Every count is a **delta against the Step 0
snapshot** — no absolute test count is a gate here, because a number measured
when this plan was written cannot survive the sibling plans that landed since.

- [ ] `cd apps/web && bun run typecheck` exits 0
- [ ] `cd apps/web && bun run format:check` exits 0
- [ ] `cd apps/web && bun run lint` introduces **no error that is not already in `/tmp/037-lint-before.txt`** (warning counts may move; new errors may not)
- [ ] `cd apps/web && bun run test` shows **no test that passed in `/tmp/037-test-before.txt` now failing**, and no drop in passing count. The pre-existing `src/features/settings/tests/page.test.tsx > refuses an application-scoped key from the workspace tab, and says why` failure recorded in that snapshot is **out of scope and does not block this plan**
- [ ] `cd apps/web && bun --bun vitest run --project node --project dom src/features/chat src/features/chat-mode src/components/command-palette` reports **0 failures and a test count equal to `/tmp/037-blast-before.txt`** (step 2 landed in `57d956c`, so those three tests are already inside the baseline — the target is baseline + 0, not baseline + 3)
- [ ] `rg -n "ChatSidebarThreadSummary|ChatProjectionThreadShell|ChatProjectionThreadDetailMeta|ChatProjectionThreadTurnState" apps/web/src apps/web/test` returns no matches
- [ ] `rg -n "sidebarThreadSummaryById|threadShellById|threadDetailMetaById|threadSessionById|threadTurnStateById" apps/web/src apps/web/test` returns no matches
- [ ] `rg -n "patchThreadShellAndSummary|pickSummaryPatch|selectSessionForThread|writeThreadLatestTurn" apps/web/src` returns no matches
- [ ] `rg -c "Record<ThreadId" apps/web/src/features/chat/state/chat-projection-store.ts` returns exactly **four fewer** than `/tmp/037-threadrecords-before.txt` (five records deleted, one added). Diff against your snapshot rather than the literal `11` this criterion used to demand — that figure assumed 15 at `ace313f`
- [ ] `removeThreadState` in `chat-projection-writers.ts` is 13 lines of body or fewer (17 at the time of writing)

**No `bun run verify` criterion.** It was the sole reason this plan came back
BLOCKED after step 2 landed green. `verify` is whole-monorepo and
short-circuits, so an unrelated failure in another feature makes it unreachable
while proving nothing about the chat projection. The per-workspace gates above
replace it in full.

- [ ] The five live checks in step 8 pass in the running app at `http://localhost:5173`
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` row for plan 037 updated

## STOP conditions

Stop and report back (do not improvise) if:

- **`plans/023-chat-per-delta-work.md` has not landed** (its row in
  `plans/README.md` is not `DONE`, and
  `rg -n "appendActivity" apps/web/src/features/chat/state/chat-projection-writers.ts`
  finds nothing). Doing this plan first means plan 023's optimization gets
  written against records that no longer exist, and it has to be written twice.
- Any of the three characterization tests you write in **step 2 fails against
  the unmodified source**. That means the precedence rule is not what this plan
  says it is, and every merge decision downstream is built on it.
- Any test in `chat-projection-selectors.test.ts` or
  `chat-projection-cache.test.ts` fails after step 7 and you cannot fix it in
  the _source_. Those two files test behaviour through the public read/write
  surface; if they need editing to pass, the refactor changed behaviour.
- You find a consumer that reads one of the five deleted records but is **not**
  in the "External consumers" table — it means the codebase drifted, and the
  precedence rules in this plan may be incomplete for that consumer.
- You conclude that `latestTurn` and `liveTurn` should be merged into one field.
  They must not be, in this plan (see "The two records the writers keep
  deliberately out of step"). Report the reasoning instead.
- The live check in step 8 shows the rail reordering itself while a turn streams,
  or a session's arranged slot jumping. Either means a write reached the record
  the rail sorts by that did not reach it before.
- The step 8 blast-radius run reports **fewer** tests than
  `/tmp/037-blast-before.txt`, even with everything green. A test that vanished is
  a test you deleted or renamed out of the include glob, not a test that passed.
  (The target is baseline + 0: step 2's three tests landed in `57d956c` and are
  already inside your Step 0 snapshot.)
- A gate you cannot clear turns out to be a **pre-existing failure recorded in
  your Step 0 snapshot**. That is not a STOP condition and not your problem —
  note it and proceed. In particular the known
  `features/settings/tests/page.test.tsx` scope-message query defect must not
  block this plan, and must not be fixed inside it.
- `src/features/chat/state/tests/thread-detail-subscriptions.test.ts` or
  `src/features/chat-mode/utils/tests/archived-auto-pick.test.ts` needs an edit
  to pass. Both are out of scope and drive only public writers and shared
  factories; if either breaks, step 6 or step 7c changed behaviour.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

**Four deliberate behaviour changes**, each unavoidable once the five records
become one. A reviewer should check these specifically:

1. **`use-session-menu.ts:20` now reads a fresher session.** It read
   `sidebarThreadSummaryById[id].session` — the copy written by the last shell
   publish, which `thread.session-set` events never updated. With one session
   field it reads the event-updated one. The session menu's stop/restart items
   therefore stop lagging a shell publish behind. This is a fix, but it is a
   change.
2. **`patchThread` now moves the rail record on detail-stream events.** Two
   things merge here. `patchThreadShell` (the message/activity/plan/turn-diff/
   revert path) wrote only the shell record, so its `updatedAt` bump never
   reached `sidebarThreadSummaryById`; and it short-circuited when there was no
   shell record, so it never reached a detail-only thread at all. With one
   record it does both. Checked before writing this plan: the rail's order is
   `pinOrderKey, createdAt, id` and deliberately excludes activity
   (`session-order.ts:17-23`), so nothing reorders. Two things render it —
   `chat-panel-header.tsx:88` (a date label) and `session-rail-model.ts:203`,
   where `updatedAt` is the **second** fallback for `activityAt`
   (`latestUserMessageAt ?? updatedAt ?? createdAt`) behind a relative-time
   label. So the visible effect is confined to threads that have never carried a
   user message, whose relative-time label now refreshes on provider activity
   too. Watch this one in the step 8 live check.
3. **Writes for a thread the projection has no record of are now dropped.**
   `writeThreadSession` and `writeThreadTurnState` wrote unconditionally, minting
   a session-only or turn-only entry for a thread with no shell and no detail.
   `writeThreadSession` / `writeThreadTurn` now bail on a missing record. Nothing
   could read those half-records at the time they were written
   (`selectChatThreadById` resolves nothing without a thread record); the one
   reachable difference is a detail snapshot arriving _after_ such an event,
   which used to inherit the orphaned session/turn and now takes the detail
   snapshot's own. Every in-app path registers a thread first — `thread.created`
   goes through `writeCreatedThread` — so this needs an out-of-order server
   stream to reach.
4. **`isProtectedThread` drops the stale-session check.** It used to ask
   `isBusySession` twice, once against the shell copy and once against the event
   copy, and a `true` from either protected the subscription. Only the fresher
   one survives. A thread whose shell copy still says "running" while its events
   say "stopped" is now evictable — which is what "stopped" means.

**One divergence that is documented rather than preserved.** Today the detail
snapshot's `latestTurn` is stored in its own record and read as a _fallback at
every read_, so a shell write that sets the live turn to `null` lets the detail
copy resurface. After this plan, `threadFromDetail` applies that fallback once,
at write time, so a later shell publish carrying `latestTurn: null` clears it
for good. This is unreachable while the server publishes a thread's shell row
and detail row from the same source — they disagree only by staleness, and the
shell is authoritative by design. If a "the turn indicator disappeared after a
reconnect" bug ever appears, this is the first place to look.

**What interacts with this later:**

- **Plan 011** (`collapse features/chat/lib/ into utils/`) moves
  `thread-status.ts` and `chat-formatters.ts`, both of which import
  `ProjectionThread`. Land this first; 011 is a pure move afterwards.
- **Plans 009-012** (the folder reorg) are Phase 4 and must run after this. They
  rename files this plan rewrites.
- Adding a new thread-level field is now **one edit** to `ProjectionThread` plus
  whichever of `threadFromShell` / `threadFromDetail` produces it — and the
  compiler will demand both. If you find yourself adding a second record keyed by
  `ThreadId` that holds a scalar, that is the regression this plan exists to
  prevent.
- `ThreadTurnWrite` requires both fields on purpose. If a future writer wants to
  advance the turn without deciding about `pendingSourceProposedPlan`, the right
  answer is to make the decision explicit at that call site, not to make the
  field optional.

**Deliberately deferred, with reasons:**

- **Unifying `latestTurn` and `liveTurn`.** They genuinely disagree during a
  turn, and making the rail live would change when unread marks fire
  (`session-unread.ts` derives completion from `latestTurn`) and when status dots
  move. That is a product decision with a UI consequence, not a refactor; it
  needs its own plan and its own look at the running app. What this plan buys is
  that the disagreement is now two named fields in one type with a comment,
  instead of two records in two slices with the same name.
- **Deriving `ChatSidebarThreadSummary`-shaped views in a selector.** Nine
  consumers subscribe to the record directly for zustand identity; deriving them
  would need a per-thread memo — exactly the apparatus this plan deletes.
- **The `hasActionableProposedPlan` fallback in the selector.** It depends on the
  `proposedPlans` list slice, so it cannot become a stored field without
  recomputing on every plan write. Left as a read-time derivation.
- **Merging the three busy/status predicates** (`threadStatus`,
  `isChatThreadBusy`, `hasRunningTurn`). Verified as three different semantics,
  not three copies — see the REFUTED section. Do not re-audit this.
