# Plan 007: Remove the redundant read-parse-merge-stringify of `latestTurnJson` in the projection pipeline

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 445a97d..HEAD -- apps/server/src/orchestration/projection-pipeline.ts apps/server/src/orchestration/snapshot-query.ts`
> If either changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as a
> STOP condition.

## Status

- **Priority**: P3
- **Effort**: S–M
- **Risk**: MED (this is a core chat-state projection path; behavior must be byte-identical)
- **Depends on**: none, but **do Step 1 (characterization tests) before any refactor** — that is the whole safety mechanism here
- **Category**: perf / tech-debt
- **Planned at**: commit `445a97d`, 2026-06-18

## Why this matters

`projectionThreads.latestTurnJson` is a denormalized JSON blob duplicating fields
that already live as columns on the `projectionTurns` row the thread points at
(`latestTurnId`). Two handlers update it with a read-parse-merge-stringify
cycle — they `SELECT` the thread row, `JSON.parse` the existing blob, spread it,
and `JSON.stringify` a new one — when the canonical data is already in hand or one
indexed single-table read away:

- `completeTurn` (`projection-pipeline.ts:440-456`)
- `updateThreadLatestTurnForAssistantMessage` (`projection-pipeline.ts:514-536`)

Meanwhile two other writers (`:353` and the revert path `:575`) already build the
blob the clean way, via the `latestTurnJson(turn)` helper (`:740`) straight from a
`projectionTurns` row. Unifying the two merge sites onto that same helper removes
a cross-table `SELECT` + a `JSON.parse` per turn-state change and collapses four
write paths to one shape — fewer ways for the denormalized blob to drift from the
turns table. This is a small, contained change; the value is correctness-of-shape
and removing redundant work, not a hot-path emergency (these run per turn, not per
token).

## Current state

The canonical shape builder (the target every write should converge on):

```ts
// projection-pipeline.ts:740
function latestTurnJson(turn: typeof projectionTurns.$inferSelect) {
  return {
    assistantMessageId: turn.assistantMessageId,
    completedAt: turn.completedAt,
    requestedAt: turn.requestedAt,
    sourceProposedPlan: parseJsonOrUndefined(turn.sourceProposedPlanJson),
    startedAt: turn.startedAt,
    state: turn.state,
    turnId: turn.turnId,
  }
}
```

The two merge sites to clean up:

```ts
// completeTurn — projection-pipeline.ts:435-456
this.database
  .update(projectionTurns)
  .set({ assistantMessageId: nextAssistantMessageId, completedAt, state })
  .where(and(eq(projectionTurns.threadId, threadId), eq(projectionTurns.turnId, turnId)))
  .run()
const row = this.database
  .select()
  .from(projectionThreads)
  .where(eq(projectionThreads.threadId, threadId))
  .get()
const current = row?.latestTurnJson ? (JSON.parse(row.latestTurnJson) as object) : {}
this.updateThread(threadId, {
  latestTurnJson: JSON.stringify({
    ...current,
    assistantMessageId: nextAssistantMessageId,
    completedAt,
    state,
    turnId,
  }),
  updatedAt: completedAt,
})
```

```ts
// updateThreadLatestTurnForAssistantMessage — projection-pipeline.ts:514-536
const row = this.database
  .select()
  .from(projectionThreads)
  .where(eq(projectionThreads.threadId, event.payload.threadId))
  .get()
const current = row?.latestTurnJson ? (JSON.parse(row.latestTurnJson) as { turnId?: string }) : null
if (current?.turnId && current.turnId !== event.payload.turnId) return // cross-turn guard
this.updateThread(event.payload.threadId, {
  latestTurnId: event.payload.turnId,
  latestTurnJson: JSON.stringify({
    ...current,
    assistantMessageId: event.payload.messageId,
    completedAt: turn.completedAt,
    requestedAt: turn.requestedAt,
    startedAt: turn.startedAt,
    state: turn.state,
    turnId: event.payload.turnId,
  }),
  updatedAt: event.payload.updatedAt,
})
```

Key facts:

- `selectTurn(threadId, turnId)` (`:459`) reads a single `projectionTurns` row by composite key.
- `projectionThreads` has a `latestTurnId` **column** (written at `:525`, `:574`) — so the cross-turn guard can read `row.latestTurnId` instead of parsing JSON.
- The blob is read back via `snapshot-query.ts:241`: `latestTurn: parseJson<OrchestrationLatestTurn | null>(row.latestTurnJson, null)`. **That read path is your behavioral oracle** — assert against the parsed `latestTurn` it returns, not against raw JSON strings (key order / whitespace are irrelevant; the parsed object is what consumers see).
- Existing orchestration tests live in `apps/server/src/orchestration/tests/` — `engine.test.ts` drives the full engine (which owns this pipeline) against a temp DB; `provider-runtime-ingestion.test.ts` shows the plain-Vitest style (`import { describe, expect, it } from 'vitest'`, valibot-parsed ids). **Read `engine.test.ts` first** to learn how to construct the engine/pipeline and feed it events end-to-end; reuse that harness.

## Commands you will need

| Purpose        | Command                                                   | Expected         |
| -------------- | --------------------------------------------------------- | ---------------- |
| Run orch tests | `bun --bun vitest run orchestration` (from `apps/server`) | all pass         |
| Server tests   | `bun run --filter server test` (from repo root)           | exit 0, all pass |
| Typecheck      | `bun run --filter server typecheck` (from repo root)      | exit 0           |
| Lint           | `bun run --filter server lint` (from repo root)           | exit 0           |

Repo-level commands from `/Users/shaul/Desktop/D/platform`; the `vitest` filter from `apps/server`.

## Scope

**In scope**:

- `apps/server/src/orchestration/projection-pipeline.ts` — only `completeTurn` and `updateThreadLatestTurnForAssistantMessage`.
- `apps/server/src/orchestration/tests/` — add a characterization test file (or extend `engine.test.ts` if that is the established place; prefer a new file `projection-latest-turn.test.ts` to keep the diff isolated).

**Out of scope** (do NOT touch):

- The `latestTurnJson(turn)` helper (`:740`), the revert path (`pruneThreadAfterRevert`, `:539`), and the initial write (`:353`) — they are already canonical; changing them is unnecessary risk.
- The database schema / Drizzle table definitions. This plan does **not** drop the `latestTurnJson` column or change the snapshot read shape — it only changes how the two merge sites compute the blob.
- `snapshot-query.ts` — it is your oracle, not your patient.
- Any other event handler.

## Git workflow

- **Work directly on `main`. Do NOT create a branch, worktree, or PR.** (Operator rule: everything happens on `main`.)
- Commit style: conventional commits — e.g. `refactor(orchestration): derive latestTurnJson from the turn row`. **Only commit if the operator asked; otherwise leave for review.**
- Do NOT push.

## Steps

### Step 1: Characterization tests FIRST (the safety net)

Read `apps/server/src/orchestration/tests/engine.test.ts` to learn the harness. Create `apps/server/src/orchestration/tests/projection-latest-turn.test.ts` that drives the engine through real event sequences and asserts on the `latestTurn` returned by the snapshot read path (the same one `snapshot-query.ts:241` uses). Cover at least:

1. **Single turn lifecycle**: start a turn → assistant message-sent → turn completed. Assert the final `latestTurn` has the expected `turnId`, `state: 'completed'`, `assistantMessageId`, `completedAt`, `requestedAt`, `startedAt`, and `sourceProposedPlan` (if the start event carries one).
2. **Interrupted / error completion**: drive a turn to `state: 'interrupted'` (and/or `'error'`); assert `latestTurn.state`.
3. **Cross-turn guard**: with turn A as the thread's latest, deliver a `thread.message-sent` for an _older_ turn B (different turnId) and assert `updateThreadLatestTurnForAssistantMessage`'s guard left `latestTurn.turnId` pointing at A (the older message did not overwrite the newer latest turn). This locks the `:522` guard behavior.

**Verify**: `bun --bun vitest run orchestration` (from `apps/server`) → all pass, **including the new file**, against the _unmodified_ pipeline. These green tests are the contract the refactor must preserve. If you cannot reproduce the cross-turn guard scenario through the engine API, STOP and report — do not refactor without that case covered.

### Step 2: Dedup `completeTurn`

Replace the thread `SELECT` + `JSON.parse` + merge with a single-table re-read of the just-updated turn, fed through the canonical helper:

- After the `projectionTurns` update (which sets `assistantMessageId`/`completedAt`/`state`), re-select the turn: `const updatedTurn = this.selectTurn(threadId, turnId)`.
- Set `latestTurnJson: updatedTurn ? JSON.stringify(latestTurnJson(updatedTurn)) : null` and keep `updatedAt: completedAt`.
- Remove the `projectionThreads` SELECT and the `JSON.parse(row.latestTurnJson)` line.

**Verify**: `bun --bun vitest run orchestration` → all Step-1 tests still pass with **identical** `latestTurn` snapshots. If any snapshot changes, the merge was carrying a field the turn row lacks — STOP and report (do not "fix" the test). Run `bun run --filter server typecheck` → exit 0.

### Step 3: Dedup `updateThreadLatestTurnForAssistantMessage`

- Replace the cross-turn guard's data source: read `row.latestTurnId` (the column) instead of parsing `latestTurnJson`. Guard stays: if `row?.latestTurnId && row.latestTurnId !== event.payload.turnId` → `return`.
- Build the new blob from the canonical turn row plus the assistant message id, rather than spreading parsed JSON: re-select the turn (`this.selectTurn(event.payload.threadId, event.payload.turnId)`) and produce `latestTurnJson(turnRow)` with `assistantMessageId` set to `event.payload.messageId` (the helper already reads `assistantMessageId` from the row; if the row's value is not yet `event.payload.messageId`, set the column or override the field — keep the resulting parsed object identical to what Step 1 captured).
- Keep `latestTurnId: event.payload.turnId` and `updatedAt: event.payload.updatedAt`.

**Verify**: `bun --bun vitest run orchestration` → all Step-1 tests still pass with identical snapshots. If the only way to keep them identical is to re-introduce a merge with the old JSON, that means the denormalized blob holds state the turns table does not — STOP and report; the deeper "delete the denormalization" change is then a maintainer-scoped follow-up, not this plan.

### Step 4: Full server verification

From repo root: `bun run --filter server typecheck && bun run --filter server lint && bun run --filter server test`.

**Verify**: all exit 0.

## Test plan

- New file: `apps/server/src/orchestration/tests/projection-latest-turn.test.ts` (single-turn lifecycle, interrupted/error, cross-turn guard).
- Pattern source: `apps/server/src/orchestration/tests/engine.test.ts` (harness) and `provider-runtime-ingestion.test.ts` (style).
- The tests are written and made green in Step 1 **before** any production change, then re-run unchanged after Steps 2–3 — they are the regression contract.
- Verification: `bun run --filter server test` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `apps/server/src/orchestration/tests/projection-latest-turn.test.ts` exists and passes
- [ ] `grep -n "JSON.parse(row.latestTurnJson)" apps/server/src/orchestration/projection-pipeline.ts` → no matches (both merge-site parses removed)
- [ ] `bun run --filter server test` exits 0
- [ ] `bun run --filter server typecheck` exits 0
- [ ] `bun run --filter server lint` exits 0
- [ ] The `latestTurn` snapshots asserted in Step 1 are unchanged by Steps 2–3
- [ ] `git status` shows only `projection-pipeline.ts` + the new test changed
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The Step 1 cross-turn guard scenario cannot be reproduced through the engine API.
- Any Step 1 snapshot changes after Step 2 or Step 3 (the denormalized blob holds state not in the turns table — the dedup is unsafe as scoped).
- The current excerpts in "Current state" don't match the live file (drift).
- Removing the parse requires touching `snapshot-query.ts`, the schema, or a third handler.

## Maintenance notes

- Deferred, maintainer-scoped follow-up: **delete the `latestTurnJson` column entirely** and have `snapshot-query.ts` derive `latestTurn` by joining `projectionThreads.latestTurnId` to `projectionTurns` and calling `latestTurnJson()` on read. That removes the denormalization (and this whole class of drift) rather than just unifying its writers — but it changes the read path and the schema, so it needs its own plan and migration-of-dev-DB note (per AGENTS.md greenfield rules: delete the dev DB rather than migrate).
- A reviewer should confirm the four write sites (`:353`, the two changed here, and the revert path) all now produce the **same** parsed shape — that is the invariant this plan establishes.
