# Plan 032: One session status enum

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
>   packages/contracts/src/chat-model.ts \
>   apps/server/src/db/schema.ts \
>   apps/server/src/provider \
>   apps/server/src/orchestration \
>   apps/web/src/features/chat/lib \
>   apps/web/src/features/chat/state \
>   apps/web/src/features/chat-mode/utils \
>   apps/web/src/features/chat-mode/hooks
> ```
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: api-design
- **Planned at**: commit `ace313f`, 2026-08-16

## Why this matters

A provider session that is blocked on an approval, or compacting its context,
is reported by the server in four contradictory ways at the same time. The
projected session says `running` (a hand-written mapper rewrites `waiting` to
`running` on the way out). The provider binding row says `waiting`. The reuse
predicate `isActiveBinding` says the binding is **not active**, so that session
cannot be reused, does not appear in `listSessions()`, and — worst — is never
torn down when its thread is repointed at another provider instance, leaking a
live CLI child process. Meanwhile the reaper's own doc comment says `waiting`
is "the agent mid-work … loses real state if the process dies".

This plan makes one canonical status set, has every layer speak it verbatim,
keeps the reaper's reading of `waiting` (it is the correct one), and fixes
`isActiveBinding`. Eight hand-written status→status mappers drop to four, and
the two that actively contradicted each other are deleted outright.

This is the sharpest instance of **theme T1** in `plans/README.md`: _"a second
representation must be derived, never maintained."_

## Current state

### The four enums (verified at `ace313f`)

**1. `packages/contracts/src/chat-model.ts:223-231` — the contract, 7 members, no `waiting`:**

```ts
export const orchestrationSessionStatusSchema = v.picklist([
  'idle',
  'starting',
  'running',
  'ready',
  'interrupted',
  'stopped',
  'error',
])
```

`OrchestrationSessionStatus` is derived from it at `chat-model.ts:354`, and it
is already exported from the package barrel (`packages/contracts/src/index.ts:143`
for the schema, `:167` for the type).

**2. `apps/server/src/provider/provider-session-directory.ts:24-30` — the binding row, 6 members, has `waiting`:**

```ts
export type ProviderRuntimeBindingStatus =
  | 'starting'
  | 'ready'
  | 'running'
  | 'waiting'
  | 'stopped'
  | 'error'
```

**3. `apps/server/src/provider/types.ts:123-129` — the adapter's session state, the same 6 members spelled again:**

```ts
type ProviderRuntimeSessionState =
  | 'starting'
  | 'ready'
  | 'running'
  | 'waiting'
  | 'stopped'
  | 'error'
```

**4. `apps/server/src/provider/types.ts:145` — the `session.set` event status, a fourth inline spelling:**

```ts
status: 'starting' | 'running' | 'ready' | 'interrupted' | 'stopped' | 'error'
```

…re-typed a fifth time at `apps/server/src/orchestration/provider-command-reactor.ts:576`:

```ts
status: 'starting' | 'running' | 'ready' | 'interrupted' | 'stopped' | 'error'
```

…and a sixth and seventh time as drizzle column enums,
`apps/server/src/db/schema.ts:206-208`:

```ts
    status: text('status', {
      enum: ['idle', 'starting', 'running', 'ready', 'interrupted', 'stopped', 'error'],
    }).notNull(),
```

and `apps/server/src/db/schema.ts:304-306`:

```ts
    status: text('status', {
      enum: ['starting', 'ready', 'running', 'waiting', 'stopped', 'error'],
    }).notNull(),
```

Both columns are plain `status TEXT NOT NULL` in `apps/server/src/db/migrations.ts`
(lines 251, 358, 433, 513) — there is **no SQL `CHECK` constraint**, so the
drizzle `enum` is a TypeScript-only constraint and widening it needs no
migration.

### The contradiction

`apps/server/src/orchestration/provider-runtime-ingestion.ts:623-629` —
the mapper that erases `waiting` on the way to the UI:

```ts
function sessionStatusFromRuntimeState(
  state: 'error' | 'ready' | 'running' | 'starting' | 'stopped' | 'waiting',
) {
  if (state === 'waiting') return 'running'

  return state
}
```

It exists only because `orchestrationSessionStatusSchema` has no `waiting` and
`threadSessionSetCommandSchema` (`packages/contracts/src/orchestration-commands.ts:329-335`)
validates the command with `orchestrationSessionSchema` at runtime.

`apps/server/src/provider/provider-service.ts:746-752` — the _same_ runtime
event, mapped the other way:

```ts
function bindingStatusFromSessionState(
  state: Extract<ProviderRuntimeEvent, { type: 'session.state.changed' }>['payload']['state'],
): ProviderRuntimeBindingStatus {
  if (state === 'waiting') return 'waiting'

  return state
}
```

So one `session.state.changed` event leaves the projected session saying
`running` and the binding row saying `waiting`.

`apps/server/src/provider/provider-session-directory.ts:32-42` — and `waiting`
is then treated as dead:

```ts
/**
 * A binding that still has a turn behind it.
 *
 * Rows are never deleted — `markStatus` writes `stopped`, it does not remove —
 * so "a row exists" means "this instance was used once", not "it is busy". Every
 * liveness question has to go through this predicate or it answers `true`
 * forever.
 */
export function isActiveBinding(binding: { status?: ProviderRuntimeBindingStatus }) {
  return binding.status === 'starting' || binding.status === 'ready' || binding.status === 'running'
}
```

### The two `isSessionRunningTurn` twins

The dual projection keeps the _same_ predicate in two files, and both read
session status directly. They must be edited together or the projections
diverge — and `projection-convergence.test.ts` exists precisely to catch that.

`apps/server/src/orchestration/projection-pipeline.ts:599-607` (SQL projection):

```ts
  private isSessionRunningTurn(threadId: string, turnId: string) {
    const session = this.database
      .select()
      .from(projectionThreadSessions)
      .where(eq(projectionThreadSessions.threadId, threadId))
      .get()
    if (session?.status !== 'running') return false

    return session.activeTurnId === turnId
  }
```

`apps/server/src/orchestration/projector.ts:275-278` (in-memory projection):

```ts
function isSessionRunningTurn(session: OrchestrationSession | null, turnId: string) {
  if (session?.status !== 'running') return false

  return session.activeTurnId === turnId
}
```

### `isActiveBinding`

`isActiveBinding` gates four things:

- `apps/server/src/provider/provider-service.ts:792` — `canReuseProviderBinding`
- `apps/server/src/provider/provider-service.ts:347` — `listSessions()`
- `apps/server/src/provider/provider-service.ts:469` — `stopReplacedBinding` (**process leak**)
- `apps/server/src/app.ts:103` — `hasLiveSessions`, which defers adapter disposal

`apps/server/src/provider/provider-session-reaper.ts:16-22` — the opposite
reading, which this plan **keeps**:

```ts
/**
 * The only status a reaper may touch. `running` and `waiting` are the agent
 * mid-work — `waiting` covers compaction and an unanswered approval, both of
 * which lose real state if the process dies. `starting` has not reported yet,
 * and `stopped`/`error` have no process left to reclaim.
 */
const REAPABLE_STATUS: ProviderRuntimeBindingStatus = 'ready'
```

`waiting` is live, not theoretical — `apps/server/src/provider/adapters/claude.ts:2364-2374`:

```ts
/** `compacting` is the CLI working with the turn parked, which is `waiting`. */
function claudeStatusState(status: 'compacting' | 'requesting' | null) {
  return status === 'compacting' ? ('waiting' as const) : ('running' as const)
}

function claudeSessionState(state: 'idle' | 'running' | 'requires_action') {
  if (state === 'running') return 'running' as const
  if (state === 'requires_action') return 'waiting' as const

  return 'ready' as const
}
```

### The mappers, before and after

| #   | Location                                                                | Today                                | After this plan                                                         |
| --- | ----------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------- |
| 1   | `provider-service.ts:635-647` `providerBindingStatusFromSession`        | six-case switch that is the identity | **deleted**, inlined as `input.status ?? session.status`                |
| 2   | `provider-service.ts:704-720` `bindingStatusFromSessionSet`             | six-case switch                      | kept, reduced to one real rule (`interrupted` → `ready`)                |
| 3   | `provider-service.ts:722-744` `bindingStatusFromRuntimeEvent`           | event type → status                  | kept — event→status is a real derivation, not an enum translation       |
| 4   | `provider-service.ts:746-752` `bindingStatusFromSessionState`           | identity, typed as a mapper          | **deleted**                                                             |
| 5   | `provider-runtime-ingestion.ts:577-595` `lifecycleSessionStatus`        | event type → status                  | kept, same reason as #3                                                 |
| 6   | `provider-runtime-ingestion.ts:623-629` `sessionStatusFromRuntimeState` | **lossy: `waiting` → `running`**     | **deleted**                                                             |
| 7   | `read-model.ts:116-130` `settledTurnStateForSessionStatus`              | session status → turn state          | kept — genuinely different codomain                                     |
| 8   | `provider-session-directory.ts:335-347` `parseRuntimeStatus`            | hand-written six-case validator      | **deleted**, replaced by `v.parse(orchestrationSessionStatusSchema, …)` |

### Behaviour rule this plan follows

**Everywhere a reader asks "is this orchestration session `running`?", it must
now also accept `waiting` — because until this change `waiting` arrived spelled
`running`.** That keeps every existing behaviour identical. The single
deliberate behaviour _change_ is `isActiveBinding`, which is the bug fix.

### Repo conventions that apply (from `AGENTS.md` — the executor has not read it)

- _"This project is greenfield and not live: no releases, no external users, no
  data anyone needs migrated."_ / _"No backward compatibility shims, no legacy
  aliases, no deprecation windows. Update every call site in the same pass."_
  → delete the old type names, do not alias them.
- _"When removing a redundant prefix, rename the file, exports, and all call
  sites in one pass."_
- _"Delete obsolete tests instead of preserving old behavior."_
- _"Keep nesting depth to 3 or less. Use guard clauses and early returns … Do
  not use `else` after an early return. Never use nested ternaries."_
- _"Never throw `new Error`. Create errors with `createError` from `evlog` — in
  practice through the feature's `structured-errors.ts` wrapper."_ The server
  wrapper is `apps/server/src/observability/structured-errors.ts`, used as
  `createInternalError(...)`.
- _"Logging is wide-event style (evlog). Always prefer wide logs: enrich the one
  event per operation/request with more fields instead of emitting extra narrow
  log lines."_ → do not add log lines in this plan.
- _"Import exact files through `@/`. Do not add barrel `index.ts` files."_
  (`@/` is `apps/web/src/` in the web app.)
- _"A dev server is always running. Never spin up your own server."_
- Tests: _"Import `{ test, expect }` from `apps/web/test/fixtures.ts`"_ for
  **app** tests; _"Do not `mock.module` or `vi.mock` our server, client, or
  feature modules"_; _"`MockProviderAdapter` is a production adapter, not a test
  stub. Prefer it over the real Codex adapter."_ Note that the server-side files
  you touch here (`apps/server/src/**/tests/*.test.ts`) import
  `{ describe, expect, it }` from `vitest` directly — match each file's existing
  imports rather than introducing a new style.

## Commands you will need

| Purpose                 | Command                                                            | Expected on success |
| ----------------------- | ------------------------------------------------------------------ | ------------------- |
| Typecheck contracts     | `cd packages/contracts && bun run typecheck`                       | exit 0, no errors   |
| Typecheck server        | `cd apps/server && bun run typecheck`                              | exit 0, no errors   |
| Typecheck web           | `cd apps/web && bun run typecheck`                                 | exit 0, no errors   |
| Server tests (all)      | `cd apps/server && bun --bun vitest run`                           | all pass            |
| Server tests (filtered) | `cd apps/server && bun --bun vitest run src/provider`              | all pass            |
| Web tests               | `cd apps/web && bun --bun vitest run --project node --project dom` | all pass            |
| Contracts tests         | `cd packages/contracts && bun run test`                            | all pass            |
| Lint (per workspace)    | `bun run lint`                                                     | exit 0              |
| Format check            | `bun run format:check`                                             | exit 0              |
| Everything              | `bun run verify` (from repo root)                                  | exit 0              |

Two caveats, both pre-existing and **not** caused by this plan:

- `apps/server`'s vitest run opens and migrates the developer's real
  `~/.platform/fs-metadata.sqlite` (that is plan 013's job to fix). Expect it;
  do not "fix" it here.
- `bun run verify` at the repo root also runs `packages/tree` and `packages/ui`;
  failures there are unrelated to this plan.

## Scope

**In scope** (the only files you may modify):

Contracts:

- `packages/contracts/src/chat-model.ts`

Server:

- `apps/server/src/db/schema.ts`
- `apps/server/src/provider/provider-session-directory.ts`
- `apps/server/src/provider/provider-service.ts`
- `apps/server/src/provider/types.ts`
- `apps/server/src/orchestration/provider-runtime-ingestion.ts`
- `apps/server/src/orchestration/provider-command-reactor.ts`
- `apps/server/src/orchestration/read-model.ts`
- `apps/server/src/orchestration/command-invariants.ts`
- `apps/server/src/orchestration/decider.ts`
- `apps/server/src/orchestration/projection-pipeline.ts`
- `apps/server/src/orchestration/projector.ts` — **exactly one line** (see step 7);
  do not touch anything else in this file, plan 036 deletes it wholesale
- `apps/server/src/provider/tests/provider-service.test.ts`
- `apps/server/src/orchestration/tests/projection-convergence.test.ts`

Web:

- `apps/web/src/features/chat/lib/chat-thread-status.ts`
- `apps/web/src/features/chat/lib/thread-status.ts`
- `apps/web/src/features/chat/state/chat-projection-writers.ts`
- `apps/web/src/features/chat-mode/utils/session-menu.ts`
- `apps/web/src/features/chat-mode/utils/running-turn.ts`
- `apps/web/src/features/chat/lib/tests/chat-thread-status.test.ts`
- `apps/web/src/features/chat-mode/utils/tests/session-menu.test.ts`
- `apps/web/src/features/chat-mode/utils/tests/running-turn.test.ts` (create)

**Out of scope** (do NOT touch, even though they look related):

- `apps/server/src/provider/provider-session-reaper.ts` — `REAPABLE_STATUS = 'ready'`
  is the reading this plan **keeps**. Changing it would flip the decision this
  plan makes. The only edit it may need is the type import name (step 3); if it
  needs nothing, leave it untouched.
- `apps/server/src/provider/adapters/claude.ts`, `codex.ts`, `mock.ts` — the
  adapters already emit the canonical vocabulary. Changing them would change
  _which states exist_, which is a different question.
- `apps/server/src/orchestration/checkpoint-reactor.ts:118` —
  `if (!settledTurnStateForSessionStatus(event.payload.session.status)) return null`.
  After step 1 that call returns `undefined` for `waiting`, and after step 7's
  `read-model.ts` edit it returns `null` — both falsy, both meaning "the turn has
  not settled, no checkpoint". Verified; no edit needed.
- `apps/server/src/provider/provider-session-directory.ts`'s
  `markRunningIfActive` (lines 226-238) — it overwrites `waiting` with `running`
  when a turn starts, which is correct: a turn _did_ start. Tempting to guard;
  don't. That is a different question from this plan's.
- `apps/server/src/orchestration/streams.ts:388` and
  `orchestration-logging.ts:247` — both only forward `session.status` into a log
  field. Widening the enum needs no edit there. Verified.
- `apps/server/src/db/migrations.ts` — the two status columns are `TEXT NOT NULL`
  with no `CHECK`, so widening the drizzle enum needs no migration statement.
  Adding one would be a no-op that future readers have to reason about.
- `apps/web/src/features/chat/state/thread-detail-subscriptions.ts:440-444` —
  `isBusySession` is `status !== 'idle' && status !== 'stopped'`; `waiting` is
  already busy under it. Verified; no edit needed.
- `apps/web/src/features/chat/state/chat-projection-selectors.ts:183-197` —
  `latestTurnForSession` special-cases only `error`/`interrupted`/`stopped`;
  `waiting` falls through to `return latestTurn`, exactly as `running` does
  today. Verified; no edit needed.
- `apps/server/src/orchestration/provider-command-reactor.ts:804-808`
  `hasActiveSession` — `status !== 'stopped'` already includes `waiting`. Edit
  only line 576 in this file.
- `apps/web/src/features/chat/lib/thread-status.ts`'s `ThreadStatus` union
  (`'waiting' | 'working' | 'failed' | 'idle'`) — this is the **user-facing**
  vocabulary ("Waiting for you") and is a different codomain from session
  status. Do not merge it into the session enum. You will add one line to the
  `threadStatus` function, and nothing else in that file changes.
- `apps/web/src/features/chat-mode/**` rail/stage components (`session-row.tsx`,
  `stage-header.tsx`, `session-rail-model.ts`) — their `session.status` is a
  `ThreadStatus`, not an `OrchestrationSessionStatus`. Verified; no edit needed.
- `packages/editor-*` — these are symlinks to a sibling checkout. Never in scope.

## Git workflow

**All work happens on `main`** — no new branches, worktrees, commits, pushes, or
PRs unless the operator explicitly asks. If the operator does ask for a commit,
use conventional commits with a lowercase descriptive subject. Real examples
from `git log`:

```
refactor(orchestration): the server prepares a session's worktree (M-C)
fix(address): bound the URL, and stop escaping slashes in ?tabs=
```

A fitting subject here: `refactor(provider): one session status enum, and waiting stops meaning three things`.

## Steps

### Step 1: Add `waiting` to the canonical enum in contracts

In `packages/contracts/src/chat-model.ts:223-231`, insert `'waiting'` after
`'running'`:

```ts
/**
 * One vocabulary for a session's liveness, shared by the projection, the
 * provider binding row and the adapter event stream — the three used to spell
 * it separately and `waiting` meant a different thing in each.
 *
 * `waiting` is the agent mid-work with the turn parked: compaction, or an
 * approval nobody has answered. It is live state that dies with the process,
 * which is why it counts as active everywhere and is never reclaimable.
 */
export const orchestrationSessionStatusSchema = v.picklist([
  'idle',
  'starting',
  'running',
  'waiting',
  'ready',
  'interrupted',
  'stopped',
  'error',
])
```

**Verify**: `cd packages/contracts && bun run typecheck && bun run test`
→ exit 0, all tests pass.

> ⚠️ **Read this before continuing.** Adding a picklist member produces almost
> **no** TypeScript errors. No workspace sets `noImplicitReturns` (see the root
> `tsconfig.json`), so `settledTurnStateForSessionStatus` — a switch with no
> `default` — just starts returning `undefined` for `waiting`, and all three of
> its callers treat that as falsy. Every other reader is an `if`-chain or an
> array literal. **The compiler will not find the call sites for you.** Steps
> 6–9 list every one, grep-verified at `ace313f`. If you want to re-derive the
> list yourself:
>
> ```bash
> grep -rn "status === 'running'\|status !== 'running'" apps/server/src apps/web/src
> ```
>
> That returns **exactly 10 hits at `ace313f`**, and every one is accounted for:
> `provider-service.ts:641` (deleted in step 5), `provider-session-directory.ts:41`
> (step 6), `projection-pipeline.ts:605` + `projector.ts:276` +
> `command-invariants.ts:278` + `decider.ts:552` (step 7), and
> `chat-projection-writers.ts:734` + `thread-status.ts:25` +
> `chat-thread-status.ts:15` + `running-turn.ts:11` (step 8). If your run returns
> an 11th hit, the code has drifted — treat it as a STOP condition.

### Step 2: Widen both drizzle status columns

`apps/server/src/db/schema.ts:206-208` (`projectionThreadSessions`) and
`:304-306` (`providerSessionRuntime`) each hand-write the member list. Derive
both from the contract instead.

Add at the top of the file, after the existing drizzle import:

```ts
import { orchestrationSessionStatusSchema } from '@workspace/contracts'
```

and replace both column definitions' `enum` with:

```ts
    status: text('status', { enum: orchestrationSessionStatusSchema.options }).notNull(),
```

**Fallback**: if `tsgo` rejects `.options` against drizzle's expected
`readonly [string, ...string[]]`, write the literal tuple
`['idle', 'starting', 'running', 'waiting', 'ready', 'interrupted', 'stopped', 'error']`
in both places, drop the import, and note it in your report. Do not spend more
than one attempt on the derivation.

No SQL migration is needed — see "Current state" for why.

**Verify**: `cd apps/server && bun run typecheck` → exit 0.

### Step 3: Collapse the server's three status aliases into the contract type

**`apps/server/src/provider/types.ts`**

- Delete the `ProviderRuntimeSessionState` declaration at lines 123-129.
- Replace its two uses with `OrchestrationSessionStatus`:
  - line 311, the `session.state.changed` payload:
    `payload: { detail?: unknown; reason?: string; state: OrchestrationSessionStatus }`
  - line 498, `ProviderAdapterSession.status`.
- Replace the inline union at line 145 (the `session.set` event) with
  `status: OrchestrationSessionStatus`.
- Add `OrchestrationSessionStatus` to the existing
  `import type { … } from '@workspace/contracts'` block.

**`apps/server/src/provider/provider-session-directory.ts`**

- Delete the `ProviderRuntimeBindingStatus` declaration at lines 24-31.
- Add `orchestrationSessionStatusSchema` and `type OrchestrationSessionStatus`
  to the existing `@workspace/contracts` import.
- Replace the `ProviderRuntimeBindingStatus` annotations on lines 40, 52, 65,
  184 and 212 with `OrchestrationSessionStatus`. (Line 335 is
  `parseRuntimeStatus`'s return type — that whole function is deleted in the
  next bullet, so do not re-annotate it.)
- Delete `parseRuntimeStatus` (lines 335-347) and change the call in
  `rowToBinding` (line 330) to
  `status: v.parse(orchestrationSessionStatusSchema, row.status),`. This matches
  the two `v.parse` calls already on lines 325 and 331 of the same object
  literal. `createInternalError` is still used by `resolveProviderInstanceId`
  (line 281) — keep that import.

**`apps/server/src/provider/provider-service.ts`** and
**`apps/server/src/provider/provider-session-reaper.ts`** — update the imports
and annotations that referenced `ProviderRuntimeBindingStatus`
(`provider-service.ts:22, 57, 75, 637, 638, 706, 724, 748`;
`provider-session-reaper.ts:8, 22`) to `OrchestrationSessionStatus` from
`@workspace/contracts`. Do not change `REAPABLE_STATUS`'s value.

**`apps/server/src/orchestration/provider-command-reactor.ts:576`** — replace the
inline union with `status: OrchestrationSessionStatus` and add the type to the
existing `import type { … } from '@workspace/contracts'` block at lines 3-14.

**Verify**:

```bash
grep -rn "ProviderRuntimeBindingStatus\|ProviderRuntimeSessionState" apps/server/src
```

→ **no matches**.

```bash
cd apps/server && bun run typecheck
```

→ exit 0.

### Step 4: Delete the two contradicting mappers

**`apps/server/src/orchestration/provider-runtime-ingestion.ts`**

Delete `sessionStatusFromRuntimeState` (lines 623-629) and change the last case
of `lifecycleSessionStatus` (line 592-593) to return the state verbatim:

```ts
    case 'session.state.changed':
      return event.payload.state
```

**`apps/server/src/provider/provider-service.ts`**

Delete `bindingStatusFromSessionState` (lines 746-752) and change the matching
case in `bindingStatusFromRuntimeEvent` (lines 729-730) to:

```ts
    case 'session.state.changed':
      return event.payload.state
```

**Verify**:

```bash
grep -rn "sessionStatusFromRuntimeState\|bindingStatusFromSessionState" apps/server/src
```

→ **no matches**.

```bash
cd apps/server && bun run typecheck
```

→ exit 0.

### Step 5: Reduce the two remaining binding mappers

**`apps/server/src/provider/provider-service.ts:635-647`** — delete
`providerBindingStatusFromSession` entirely. It is the identity plus an
override. Inline it at both call sites:

- line 151 (in `startSession`): `status: input.status ?? session.status,`
- line 212 (in `ensureSession`): `status: input.status ?? session.status,`

(Confirm the argument order first: both call sites read
`providerBindingStatusFromSession(session.status, input.status)`, and the
function returns `override` when set — so `input.status` wins. This is also
already the shape used by `ensureSession`'s reuse path at line 180,
`status: input.status ?? activeReusableBinding.status` — match it.)

Why the deleted function was the identity, and why the inline stays faithful:
its input was `ProviderAdapterSession['status']`, the 6-member set, and it
handled `waiting`/`running`/`starting`/`error`/`stopped` explicitly with a
trailing `return 'ready'` that only `ready` could reach. Step 3 widens that
input type to the 8-member set, so `idle` and `interrupted` become _typeable_
here for the first time — but no adapter emits them (`adapters/claude.ts`,
`codex.ts` and `mock.ts` return only the 6), so nothing changes at runtime. Do
not add a guard for them.

**`apps/server/src/provider/provider-service.ts:704-720`** — reduce
`bindingStatusFromSessionSet` to its one real rule:

```ts
/**
 * The one rule left between a session status and the binding row it writes:
 * `interrupted` describes the turn that just ended, and the process behind it
 * is idle and reclaimable — which is exactly what `ready` means to the reaper,
 * the only status it may touch. Everything else is copied through.
 */
function bindingStatusFromSessionSet(status: OrchestrationSessionStatus) {
  if (status === 'interrupted') return 'ready' as const

  return status
}
```

**Verify**:

```bash
grep -rn "providerBindingStatusFromSession" apps/server/src
```

→ **no matches**.

```bash
cd apps/server && bun run typecheck && bun --bun vitest run src/provider
```

→ exit 0, all pass.

### Step 6: Fix `isActiveBinding` — the bug

`apps/server/src/provider/provider-session-directory.ts:32-42`. Replace the
allowlist with the dead-set, and rewrite the doc comment:

```ts
/**
 * A binding that may still have a process behind it.
 *
 * Rows are never deleted — `markStatus` writes `stopped`, it does not remove —
 * so "a row exists" means "this instance was used once", not "it is busy". Every
 * liveness question has to go through this predicate or it answers `true`
 * forever.
 *
 * Stated as the dead set rather than the live set on purpose. The previous
 * allowlist silently excluded `waiting`, so a session parked on an approval
 * stopped being reusable, vanished from `listSessions`, and — the real cost —
 * was never torn down when its thread was repointed at another provider
 * instance, leaking the child process. A status nobody classified must default
 * to "there may be a process here": `ensureSession` re-checks with
 * `adapter.hasSession`, so a false positive costs one probe, while a false
 * negative leaks a CLI child.
 */
export function isActiveBinding(binding: { status?: OrchestrationSessionStatus }) {
  if (!binding.status) return false
  if (binding.status === 'idle') return false
  if (binding.status === 'stopped') return false
  if (binding.status === 'error') return false

  return true
}
```

Nothing else in this file changes.

**Verify**: `cd apps/server && bun --bun vitest run src/provider` → all pass,
**including** `provider-session-reaper.test.ts`'s
`'never reclaims a session that is mid-work, however long it has been quiet'`,
which asserts a `waiting` binding is not reaped. That test must stay green — it
is the reading this plan keeps.

### Step 7: Teach the five server readers that `waiting` is live

Each of these currently sees `running` where it will now see `waiting`. All five
edits are behaviour-preserving.

**`apps/server/src/orchestration/read-model.ts:116-130`** — group `waiting` with
`starting`/`running` (a parked turn has not ended, so it must not settle), and
extend the doc comment's first sentence to say so:

```ts
    case 'starting':
    case 'running':
    case 'waiting':
      return null
```

**`apps/server/src/orchestration/command-invariants.ts:277-279`**:

```ts
export function isSessionAlive(thread: OrchestrationProjectedThread) {
  const status = thread.session?.status

  return status === 'starting' || status === 'running' || status === 'waiting'
}
```

**`apps/server/src/orchestration/decider.ts:552`** — inside `sessionSet`:

```ts
const status = command.session.status
const alive = status === 'starting' || status === 'running' || status === 'waiting'
```

**`apps/server/src/orchestration/projection-pipeline.ts:605`** — inside
`isSessionRunningTurn`, replace `if (session?.status !== 'running') return false`
with:

```ts
if (session?.status !== 'running' && session?.status !== 'waiting') return false
```

**`apps/server/src/orchestration/projector.ts:276`** — the in-memory twin of the
same predicate. It **must** get the identical change, or the two projections
disagree about whether a parked turn is still open, which is exactly what
`projection-convergence.test.ts` asserts they never do. Replace
`if (session?.status !== 'running') return false` with:

```ts
if (session?.status !== 'running' && session?.status !== 'waiting') return false
```

This is the only line you may change in `projector.ts`.

**Verify**:

```bash
grep -rn "status !== 'running') return false" apps/server/src
```

→ **no matches** (both twins now also accept `waiting`).

```bash
cd apps/server && bun run typecheck && bun --bun vitest run
```

→ exit 0, all pass.

### Step 8: Teach the five web readers that `waiting` is live

**`apps/web/src/features/chat/lib/chat-thread-status.ts:12-16`**:

```ts
export function isBusyChatSession(session: OrchestrationSession | null) {
  if (!session) return false
  if (session.status === 'starting') return true
  if (session.status === 'waiting') return true

  return session.status === 'running'
}
```

**`apps/web/src/features/chat/state/chat-projection-writers.ts:734`** — inside
`applyThreadSessionSetEvent`:

```ts
const status = event.payload.session.status
if (status !== 'running' && status !== 'waiting') return nextState
```

**`apps/web/src/features/chat/lib/thread-status.ts:21-30`** — add one line to
`threadStatus`, after the `running` case. Note the deliberate asymmetry: the
session-level `waiting` means "the agent is parked mid-work", while the
user-facing `ThreadStatus.waiting` means "waiting for **you**" and is decided by
`threadNeedsAttention` above it. A compaction is work, not a question:

```ts
export function threadStatus(thread: ThreadStatusSource): ThreadStatus {
  if (threadNeedsAttention(thread)) return 'waiting'
  if (thread.latestTurn?.state === 'running') return 'working'
  if (thread.session?.status === 'starting') return 'working'
  if (thread.session?.status === 'running') return 'working'
  // A parked session (compaction, or an approval already counted above) is the
  // agent mid-work, not a question for the user.
  if (thread.session?.status === 'waiting') return 'working'
  if (thread.latestTurn?.state === 'error') return 'failed'
  if (thread.session?.status === 'error') return 'failed'

  return 'idle'
}
```

**`apps/web/src/features/chat-mode/utils/running-turn.ts:11`** — `hasRunningTurn`
gates the "you must stop the agent before archiving" guard in
`use-session-actions.ts:48`. Today a parked session reaches it spelled `running`,
so it blocks archiving; after this change it would arrive as `waiting` and the
guard would silently stop firing — a session parked on an approval could be
archived out from under a live process. Replace
`if (thread.session?.status !== 'running') return false` with:

```ts
if (thread.session?.status !== 'running' && thread.session?.status !== 'waiting') return false
```

Keep the optional chain inline rather than hoisting a `const status` — the next
line is `return thread.session.activeTurnId !== null`, and it only typechecks
because the guard narrows `thread.session` to non-null through the chain.

Leave the file's existing doc comment alone — it already explains that this
predicate is deliberately not `threadStatus(thread) === 'working'`.

**`apps/web/src/features/chat-mode/utils/session-menu.ts:22-28`** — add
`'waiting'` to `STOPPABLE_SESSION_STATUSES`; a parked session is exactly the one
a user most wants to stop:

```ts
const STOPPABLE_SESSION_STATUSES: readonly OrchestrationSessionStatus[] = [
  'idle',
  'starting',
  'running',
  'waiting',
  'ready',
  'interrupted',
]
```

**Verify**:

```bash
cd apps/web && bun run typecheck && bun --bun vitest run --project node --project dom
```

→ exit 0. The two existing web tests will now be incomplete but should still
pass; step 9 extends them.

### Step 9: Tests (see "Test plan" for the exact cases)

Add the five test cases listed below, then run the full gate.

**Verify**: from the repo root, `bun run verify` → exit 0.

### Step 10: Confirm the fix in the running app

A dev server is already running at <http://localhost:5173> — **do not start one**.

Open the app, start a chat session against a Claude provider instance, and
trigger an approval-required tool call so the session reaches `waiting`
(`claude.ts:2371` maps `requires_action` → `waiting`). Then, in
`logs/<today>.jsonl`:

```bash
grep 'chat.pipeline.provider_reactor.ingest_session' logs/$(date +%Y-%m-%d)*.jsonl \
  | grep -c '"sessionStatus":"waiting"'
```

→ **at least 1**. This is the one log line that proves the fix: before this
plan the `sessionStatus` field could never be `waiting`, because
`sessionStatusFromRuntimeState` rewrote it to `running` on the way in.

Do **not** use `provider_session_directory.upsert.complete` as the check — its
`status` field already carried `waiting` before this plan (that was half the
contradiction), so it is green either way.

If you cannot reach a `waiting` state interactively (no Claude provider
configured, no approval-required tool), say so in your report and rely on the
automated tests — do **not** invent a way to force the state.

## Test plan

Five cases: four in existing files, one small new file.

**1. `apps/server/src/provider/tests/provider-service.test.ts`** — new `it(...)`
block, the regression test for the actual bug. Add it after the existing
`'hands a turn the cursor of the conversation it continues'` (lines 97-125),
which is where the pattern of holding a `ProviderSessionDirectory` reference
alongside the service comes from; the assertion style comes from
`'reuses compatible session bindings and resets incompatible ones'` (lines 23-60).
The file imports `{ describe, expect, it }` from `vitest` — match that.

```
it('keeps a session parked on an approval reusable and listed', ...)
```

Shape:

- `createFixture()`, `new MockProviderAdapter()`, and a
  `const directory = new ProviderSessionDirectory(fixture.database)` passed to
  `new ProviderService({ adapterRegistry: new ProviderAdapterRegistry([adapter]), sessionDirectory: directory })`.
- `const input = providerTurnInput()` (the file-local factory at line 212).
- First `await service.ensureSession({ providerInstanceId, runtimeMode, runtimePayload: providerSessionPayload(input), threadId: input.thread.id })` —
  `MockProviderAdapter.startSession` returns `status: 'ready'`, so the binding
  lands `ready`.
- `directory.markStatus(input.thread.id, 'waiting')` — this is the compaction /
  unanswered-approval state.
- Second `ensureSession` with the identical payload.
- Assert `expect(second).toMatchObject({ reused: true })` — **fails before
  step 6, passes after**.
- Assert `expect(service.listSessions()).toContainEqual(expect.objectContaining({ status: 'waiting', threadId: input.thread.id }))`.
- **The negative, in the same test — this is what proves the inversion did not
  just make everything active.** `directory.markStatus(input.thread.id, 'stopped')`,
  then assert
  `expect(service.listSessions()).not.toContainEqual(expect.objectContaining({ threadId: input.thread.id }))`.
  Repeat for `'error'` and `'idle'`. All three must stay excluded.
- `fixture.close()`.

The reuse path keeps the status: `ensureSession`'s reuse branch writes
`status: input.status ?? activeReusableBinding.status` (`provider-service.ts:180`)
and the test passes no `input.status`, so the row stays `waiting` for the
`listSessions` assertion.

Reuse is safe here because `ensureSession` confirms liveness with
`adapter.hasSession` (`provider-service.ts:548-555`), and `MockProviderAdapter.hasSession`
(`adapters/mock.ts:283-285`) returns true once a session was started. The
reaper sweep at the top of `ensureSession` does not fire: it only touches
`ready` rows older than the 30-minute deadline.

**2. `apps/server/src/orchestration/tests/projection-convergence.test.ts:59`** —
extend the existing `it.each` table so a parked session does not settle the turn.
The line reads
`it.each(['starting', 'running'])('leaves the turn running while the session is %s', (status) => {`;
add `'waiting'` to the array:

```ts
  it.each(['starting', 'running', 'waiting'])(
    'leaves the turn running while the session is %s',
```

(The `sessionSetEvent` factory at `tests/factories/projection.ts:171` types
`status` as plain `string`, so no other change is needed.)

This is the end-to-end proof that step 7's `read-model.ts` change is right, and
it asserts both projections agree (`projected.sqlThread` vs `projected.memory`).

**3. `apps/web/src/features/chat/lib/tests/chat-thread-status.test.ts:14-21`** —
add one line and rename the test, since the claim changed:

```ts
  it('treats starting, running and waiting sessions as busy', () => {
    expect(isBusyChatSession(makeSession('starting'))).toBe(true)
    expect(isBusyChatSession(makeSession('running'))).toBe(true)
    expect(isBusyChatSession(makeSession('waiting'))).toBe(true)
    …
```

**4. `apps/web/src/features/chat-mode/utils/tests/session-menu.test.ts:69-84`** —
in `'a live agent session can be stopped in every state that still holds a
process'`, add `'waiting'` to the `stoppable` array and a sixth `true` to the
expected array. Leave the test below it (`'a stopped or failed session has
nothing left to stop'`) untouched — that is the negative and it must stay green.

**5. `apps/web/src/features/chat-mode/utils/tests/running-turn.test.ts`** (new
file) — covers the step 8 `hasRunningTurn` change, which nothing tests today.
Model it on `apps/web/src/features/chat-mode/utils/tests/active-session.test.ts`:
the tests in this directory import `{ expect, test }` from
`'../../../../../test/fixtures'`, **not** from `vitest`. Three assertions on a
thread summary carrying `activeTurnId: 'turn-1'`:

- session status `'running'` → `hasRunningTurn(thread) === true` (unchanged)
- session status `'waiting'` → `true` (**the new behaviour**)
- session status `'ready'` → `false` (**the negative — a settled session must not
  become "running" just because the predicate loosened**)

Build the thread summary with the fields `hasRunningTurn` actually reads
(`latestTurn`, `session`), parsing ids with
`v.parse(threadIdSchema, 'thread-1')` as `active-session.test.ts` does.

**Verification**:

```bash
cd apps/server && bun --bun vitest run
cd apps/web && bun --bun vitest run --project node --project dom
cd packages/contracts && bun run test
```

→ all pass, with the five cases above present.

### Which existing test changes — report this explicitly

The audit expected the two contradictory readings of `waiting` to be encoded in
two existing tests that would force the choice. **That is only half true at
`ace313f`, and you should know it before you start:**

- `apps/server/src/provider/tests/provider-session-reaper.test.ts:51-67`
  (`it('never reclaims a session that is mid-work, however long it has been
quiet')`) **does** encode the reading this plan keeps (`waiting` is mid-work,
  never reclaimable), with a comment saying so. It must remain green and
  unmodified.
- `apps/server/src/provider/tests/provider-service.test.ts` does **not** encode
  the opposite reading — it has no `waiting` case at all. So no existing test
  fails, and nothing forces your hand. That is why test case 1 above exists: you
  are _adding_ the missing assertion on the reuse side.

In your final report, state plainly: which existing tests you modified (expected:
only the two web tests, cases 3 and 4, plus the convergence table in case 2),
that `provider-session-reaper.test.ts` was left untouched and green, and that
`waiting` now resolves to **"live, reusable, never reclaimable"** everywhere. If
you found yourself changing the reaper test — or the
`'a stopped or failed session has nothing left to stop'` test in
`session-menu.test.ts` — to make something pass, **stop**: those are the negatives
this change must not break.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `cd packages/contracts && bun run typecheck && bun run test` → exit 0
- [ ] `cd apps/server && bun run typecheck && bun --bun vitest run` → exit 0
- [ ] `cd apps/web && bun run typecheck && bun --bun vitest run --project node --project dom` → exit 0
- [ ] `bun run verify` from the repo root → exit 0
- [ ] `grep -rn "ProviderRuntimeBindingStatus\|ProviderRuntimeSessionState" apps/server/src` → no matches
- [ ] `grep -rn "sessionStatusFromRuntimeState\|bindingStatusFromSessionState\|providerBindingStatusFromSession\|parseRuntimeStatus" apps/server/src` → no matches
- [ ] `grep -n "'waiting'" packages/contracts/src/chat-model.ts` → exactly one match, inside `orchestrationSessionStatusSchema`
- [ ] `grep -rn "status !== 'running') return false" apps/server/src apps/web/src` → no matches (both `isSessionRunningTurn` twins and `hasRunningTurn` now also accept `waiting`)
- [ ] `grep -n "REAPABLE_STATUS" apps/server/src/provider/provider-session-reaper.ts` → still `= 'ready'`
- [ ] `git diff --stat -- apps/server/src/provider/tests/provider-session-reaper.test.ts` → empty
- [ ] `git diff --numstat -- apps/server/src/orchestration/projector.ts` → `1	1	...` (exactly one line changed)
- [ ] The five test cases in "Test plan" exist and pass
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` row for 032 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at any location in "Current state" does not match the excerpt — in
  particular if `isActiveBinding` (`provider-session-directory.ts:40`) is no
  longer the three-way allowlist, or if `orchestrationSessionStatusSchema`
  already contains `waiting`.
- `apps/server/src/provider/tests/provider-session-reaper.test.ts` fails at any
  point. That suite encodes the decision this plan is built on; a failure means
  the reading flipped by accident. Do not edit that file to make it pass.
- Adding `'waiting'` to the picklist produces runtime valibot failures in the
  orchestration suite (`ValiError` on `thread.session.set`) that persist after
  step 1 — that would mean a status list you have not found is still validating
  the old set. Find it and report it rather than adding a translation back.
- You find you must widen the drizzle enums with an actual SQL migration —
  i.e. `apps/server/src/db/migrations.ts` turns out to have a `CHECK` constraint
  on either `status` column after all. Report; do not write a migration.
- `projection-convergence.test.ts` fails with `projected.sqlThread` and
  `projected.memory` disagreeing. That means only one of the two
  `isSessionRunningTurn` twins in step 7 got the edit
  (`projection-pipeline.ts:605` and `projector.ts:276`). Fix that specific pair;
  if it still diverges, stop and report — do not "fix" it by reverting one side.
- The web app at <http://localhost:5173> shows a session stuck as "Working"
  forever after this change (it would mean a turn stopped settling — the
  `read-model.ts` grouping in step 7 is the suspect).
- Step 3 leaves a typecheck error you can only silence with `as` or `any`. The
  point of the collapse is that the four enums really were the same set; a cast
  hides a place where they were not. Report the exact error instead.
- Any step's verification fails twice after a reasonable fix attempt.
- The fix appears to require touching a file on the out-of-scope list.

## Maintenance notes

- **What a reviewer should scrutinize.** Only one behaviour is intended to
  change: `isActiveBinding` now returns `true` for `waiting`. Every other edit is
  a spelling change (`running` was already what `waiting` arrived as). If a
  reviewer sees a diff that changes what settles a turn, what the reaper
  reclaims, or what the sidebar dot shows for anything other than a parked
  session, that is a bug in this plan's execution.
- **The inverted predicate is the durable part.** `isActiveBinding` is now
  stated as the dead set. When a ninth status is added, it defaults to "active"
  — the safe direction, because `ensureSession` re-probes with
  `adapter.hasSession` while a false "dead" leaks a child process. Do not
  "tidy" it back into an allowlist.
- **Two event→status mappers survive and must be kept in agreement.**
  `bindingStatusFromRuntimeEvent` (`provider-service.ts:722`) and
  `lifecycleSessionStatus` (`provider-runtime-ingestion.ts:577`) now return the
  same status for every event type they share (`session.started`,
  `thread.started`, `turn.started`, `turn.completed`, `runtime.error`,
  `session.exited`, `session.state.changed`). `turn.aborted` is handled only by
  the binding side, which is a real difference, not a drift. Any new runtime
  event that means something about session liveness must be added to both, or
  they start contradicting each other again — the exact failure this plan
  closes.
- **Deliberately deferred.** The four enums are now one, but the _event-shape_
  duplication around them is not touched: `session.set` still carries a status
  the reactor also constructs, and `provider-command-reactor.ts` still builds
  runtime events by hand. That belongs to plans 028 (derive the orchestration
  event catalog) and 036 (collapse the dual projection). Do not fold it in here.
- **Interaction with plan 036.** 036 deletes `apps/server/src/orchestration/projector.ts`.
  This plan changes exactly one line in that file (`isSessionRunningTurn`, so the
  two projections keep agreeing), which 036 then deletes along with the rest — no
  conflict worth planning around. More importantly this plan extends the
  convergence table in `projection-convergence.test.ts`, which is 036's safety
  net. Land 032 first: a convergence suite that already knows about `waiting` is
  strictly better cover for 036.
- **Naming call, recorded so it is not re-litigated.** The canonical type keeps
  the name `OrchestrationSessionStatus`: it is already the contract both the
  server and the web app import, and renaming it buys nothing. The web's
  `ThreadStatus` (`'waiting' | 'working' | 'failed' | 'idle'`) stays separate on
  purpose — its `waiting` means "waiting for _you_". Two vocabularies, one
  derived from the other plus the pending-request counts, is fine. Four
  vocabularies with no derivation was not.
