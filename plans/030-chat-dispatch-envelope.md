# Plan 030: One `dispatchChatCommand` helper

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
> git diff --stat ace313f..HEAD -- apps/web/src/features/chat/lib/chat-command-dispatch.ts apps/web/src/features/chat/lib/chat-command-sync.ts apps/web/src/features/chat/lib/tests/chat-command-sync.test.ts apps/web/src/features/chat/utils apps/web/src/features/chat/components/chat-view.tsx apps/web/src/features/chat/components/chat-draft-view.tsx apps/web/src/features/chat/providers/composer-modes-provider.tsx apps/web/src/features/chat/providers/pending-requests-provider.tsx apps/web/src/features/chat/providers/plan-follow-up-provider.tsx apps/web/src/features/chat/notify-command-error.ts apps/web/src/features/chat-mode/hooks/use-session-actions.ts apps/web/src/features/chat-mode/hooks/use-project-actions.ts apps/web/src/features/chat-mode/hooks/use-save-project-script.ts apps/web/src/features/chat-mode/state/rail-order-commands.ts apps/web/src/features/chat-mode/components/project-rename-dialog.tsx
> ```
>
> Expected at the time of writing: only files that plan 021 creates/changes
> appear. If any _other_ in-scope file changed, compare the "Current state"
> excerpts below against the live code before proceeding; on a mismatch, treat
> it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED — no behaviour is meant to change, but the diff touches every
  chat command path in the app and two rewrites (Step 2's state-setter ordering,
  Step 5's merged accepted-path callback) are deliberate small deviations. Both
  are called out where they happen.
- **Depends on**: pairs with `plans/021-async-rejection-boundaries.md` (hard precondition — see Step 0)
- **Category**: architecture
- **Planned at**: commit `ace313f`, 2026-08-16

Closes one instance of cross-cutting theme **T3 — "no shared home for a 10-line
utility → N copies"** from `plans/README.md`, and it is the largest instance:
**ten** dispatch-with-telemetry envelopes in three incompatible dialects, plus
seven `elapsedMs` copies inside `features/chat/` (six of which collapse here).

## Why this matters

**The cost is observability, not line count.** Every chat command the user
triggers goes through some hand-copied try/catch/finally, and they do not agree
on how a dispatch is recorded:

- **Dialect A** (`chat/components`, `chat/providers`, 7 functions) builds a
  `createChatPipelineScope(...)` wide event and increments
  `command.dispatchStartCount` / `command.dispatchAcceptedCount` /
  `command.dispatchFailedCount`, sets `outcome`, and ends with `durationMs`.
- **Dialect B** (`chat-mode`, 3 functions in scope + 1 left out) emits
  `log.info` / `log.warn` with `action` + `area` + `outcome` + `reason`.
  **No counters. No `durationMs`.**
- **Dialect C** (4 more sites, the ones plan 021 is currently patching) has no
  telemetry and no error handling at all — just `void environment.dispatchCommand(...)`.

The consequence is concrete: a dashboard keyed on `command.dispatchAcceptedCount`
silently reports **zero** for archiving a session, deleting a project, or
reordering the rail; a grep for `action:"chat.session.*"` finds nothing for
sending a turn, stopping a turn, reverting a checkpoint, answering an approval,
or switching composer mode. Neither query is wrong — there is simply no single
shape to query.

**The three dialects are one root cause, and dialect C proves it.** Four call
sites skipped error handling entirely because writing the envelope by hand is 25
lines, so `void dispatchCommand(...)` won. Plan 021 patches those four with
`.catch(notifyChatCommandError)`; this plan gives them — and the other ten — the
door that should have existed, so the _next_ chat command gets telemetry and a
rejection boundary by construction rather than by discipline. That is why 021 and
030 are paired.

Two secondary wins fall out: `dispatchChatCommand` **never rejects**, so
`void dispatchChatCommand({...})` is a genuine rejection boundary where
`void environment.dispatchCommand(...)` was not; and the magic replay offsets
(`sequence - 2`, `sequence - 3`, and an open-coded third `sequence - 2`) become
one derived function instead of three hand-maintained copies of server
knowledge.

After this lands: one wide event per chat command dispatch, same field names
everywhere on that path, and one file to change when the shape needs to change.
(Two `project.create` sites keep their own handling — named in "Out of scope".)

## Current state

Everything below was re-read at `ace313f` and matches the live code unless a
note says otherwise.

### Correction to the audit finding this plan came from

The finding says **seven** envelopes. Opening every file found **ten** that this
plan converts. The three it missed are `dispatchPlanTurn`
(`plan-follow-up-provider.tsx:224`), `dispatchProjectDelete`
(`use-project-actions.ts:71`) and `dispatchRailOrder`
(`rail-order-commands.ts:114`). The finding also cited `chat-command-sync.ts:73`
for the replay helpers; they are at **:75 and :79** (`:73` is a closing brace).

Two further `dispatchCommand` call sites exist and are **deliberately left
alone** — see "Out of scope". Do not convert them, and do not treat their
survival as an incomplete job:

- `apps/web/src/features/chat-mode/hooks/use-project-retry.ts:50` — an eleventh
  envelope, dialect B.
- `apps/web/src/features/chat/hooks/use-workspace-chat-project.ts:60` — try/catch
  with no telemetry.

So "one shape everywhere" is true of the _chat command_ path after this lands,
not of every `dispatchCommand(...)` in the app.

### The ten envelopes

| #   | File                                                                 | Function                                 | Line     | Dialect |
| --- | -------------------------------------------------------------------- | ---------------------------------------- | -------- | ------- |
| 1   | `apps/web/src/features/chat/components/chat-view.tsx`                | `submitChatTurn`                         | 215      | A       |
| 2   | `apps/web/src/features/chat/components/chat-view.tsx`                | `dispatchThreadStop`                     | 297      | A       |
| 3   | `apps/web/src/features/chat/components/chat-view.tsx`                | `revertThreadToCheckpoint`               | 331      | A       |
| 4   | `apps/web/src/features/chat/components/chat-draft-view.tsx`          | `handleSend` + `dispatchDraftSubmission` | 84 / 173 | A       |
| 5   | `apps/web/src/features/chat/providers/composer-modes-provider.tsx`   | `dispatchModeSet`                        | 95       | A       |
| 6   | `apps/web/src/features/chat/providers/pending-requests-provider.tsx` | `dispatchPendingRequestResponse`         | 97       | A       |
| 7   | `apps/web/src/features/chat/providers/plan-follow-up-provider.tsx`   | `dispatchPlanTurn`                       | 224      | A       |
| 8   | `apps/web/src/features/chat-mode/hooks/use-session-actions.ts`       | `dispatchSessionCommand`                 | 133      | B       |
| 9   | `apps/web/src/features/chat-mode/hooks/use-project-actions.ts`       | `dispatchProjectDelete`                  | 71       | B       |
| 10  | `apps/web/src/features/chat-mode/state/rail-order-commands.ts`       | `dispatchRailOrder`                      | 114      | B       |

Plus the four dialect-C sites plan 021 patches: `chat-view.tsx:98-110`,
`chat-draft-view.tsx:71-83`, `use-save-project-script.ts:42-50`,
`project-rename-dialog.tsx:37-44`.

### Dialect A, verbatim — `chat-view.tsx:297-329` (the smallest, whole)

```ts
async function dispatchThreadStop({
  environment,
  setInterrupting,
  setSendError,
  thread,
}: {
  environment: ChatEnvironment
  setInterrupting: (value: boolean) => void
  setSendError: (value: string | null) => void
  thread: ChatThread
}) {
  setInterrupting(true)
  const startedAt = performance.now()
  const command = createThreadInterruptCommand({
    threadId: thread.id,
    turnId: thread.latestTurn?.turnId,
  })
  const scope = createChatPipelineScope('chat.stop.dispatch.summary', chatCommandSummary(command))
  try {
    scope.increment('command.dispatchStartCount')
    await environment.dispatchCommand(command)
    scope.increment('command.dispatchAcceptedCount')
    scope.set({ outcome: 'ok' })
  } catch (error) {
    scope.increment('command.dispatchFailedCount')
    scope.warn('Stop command dispatch failed.', { error })
    scope.set({ outcome: 'error' })
    setSendError(errorMessage(error, 'Chat command failed.'))
  } finally {
    scope.end({ durationMs: elapsedMs(startedAt) })
    setInterrupting(false)
  }
}
```

The other six dialect-A functions are this same body with extra bookkeeping
threaded through it (optimistic add/remove, a responding-set, a projection sync,
a host callback). `chat-view.tsx:380-382` is the local helper:

```ts
function elapsedMs(startedAt: number) {
  return Math.round((performance.now() - startedAt) * 100) / 100
}
```

The same three lines are copied at `chat-draft-view.tsx:220-222` and
`transport/orchestration-rpc-client.ts:773-775`, and inlined at
`pending-requests-provider.tsx:133`, `plan-follow-up-provider.tsx:244`,
`composer-modes-provider.tsx:124` and `chat-command-sync.ts:46`. **Seven** copies
inside `features/chat/`; this plan collapses six of them. The seventh, in
`transport/`, is out of scope — so every check below that counts occurrences
excludes `apps/web/src/features/chat/transport/`.

### Dialect B, verbatim — `use-project-actions.ts:71-94` (whole)

```ts
async function dispatchProjectDelete(environment: ChatEnvironment, projectId: ProjectId) {
  const command = createProjectDeleteCommand({ projectId })
  try {
    const result = await environment.dispatchCommand(command)
    log.info({
      action: 'chat.project.delete',
      area: 'chat',
      commandType: command.type,
      deduped: result.deduped,
      outcome: 'ok',
      projectId,
      sequence: result.sequence,
    })
  } catch (error) {
    log.warn({
      action: 'chat.project.delete',
      area: 'chat',
      commandType: command.type,
      outcome: 'error',
      projectId,
      reason: errorMessage(error, 'Chat command failed.'),
    })
  }
}
```

Note what is missing versus dialect A: no counters, no `durationMs`, no
`commandId`.

### The three replay offsets

`chat-command-sync.ts:75-81` (verbatim):

```ts
export function replayAfterTurnDispatch(result: ThreadCommandDispatchResult) {
  return Math.max(0, result.sequence - 2)
}

export function replayAfterDraftTurnDispatch(result: ThreadCommandDispatchResult) {
  return Math.max(0, result.sequence - 3)
}
```

and the open-coded third at `chat-view.tsx:364-368` (verbatim):

```ts
scheduleThreadProjectionSyncAfterDispatch({
  environment,
  replayAfterSequence: Math.max(0, result.sequence - 2),
  threadId: thread.id,
})
```

**Where those numbers come from** (verified in the server, so you do not have to
guess and must not change them):

- `result.sequence` is the sequence of the **last** event the command committed
  (`apps/server/src/orchestration/engine.ts:204-211`).
- A plain `thread.turn.start` decides `thread.message-sent` +
  `thread.turn-start-requested` — 2 events
  (`apps/server/src/orchestration/decider.ts:631-664`). Hence `- 2`.
- A `thread.turn.start` carrying `bootstrap.createThread` prepends
  `thread.created` — 3 events (`decider.ts:665`, `bootstrapThreadCreated`).
  Hence `- 3`.
- `thread.checkpoint.revert` decides exactly **one** event
  (`decider.ts:157-164`, via `one(...)`). Its `- 2` therefore opens the replay
  window one sequence wider than needed. Replay is idempotent (the projection
  applies events by id), so this is conservative, not a bug. **Preserve it.**

### The command shape that decides the offset

`chat-pipeline-logging.ts:41` already discriminates the bootstrap case:

```ts
summary.bootstrapCreateThread = Boolean(command.bootstrap?.createThread)
```

and `createDraftThreadSubmission` is the only builder that sets it
(`chat-command-builders.ts:216-231`). So `command.type === 'thread.turn.start' &&
command.bootstrap?.createThread` is an exact, typed discriminator for `- 3`.

### The pieces the new helper composes

`chat-pipeline-logging.ts:25-52` (verbatim) — scope factory and command summary:

```ts
export function createChatPipelineScope(action: string, context: ChatLogContext = {}) {
  return createWideEventScope(chatLogEvent(action, context))
}

export function chatCommandSummary(command: ClientOrchestrationCommand) {
  const summary: ChatLogContext = {
    commandId: command.commandId,
    commandType: command.type,
  }

  if ('threadId' in command) summary.threadId = command.threadId
  if ('projectId' in command) summary.projectId = command.projectId
  if ('turnId' in command) summary.turnId = command.turnId
  ...
```

`chatLogEvent` (`chat-pipeline-logging.ts:135-142`) stamps
`{ action, area: 'chat', pipeline: 'chat' }` on every event.

`ChatPipelineScope` is `WideEventScope` (`@/lib/wide-event-scope.ts:18-33`):
`set`, `increment(path, by?)`, `count`, `warn(message, context?)`, `error`,
`getContext`, `end(overrides?)`. All of its methods are internally guarded and
never throw (`wide-event-scope.ts:108-114`).

`ChatEnvironment['dispatchCommand']`
(`apps/web/src/features/chat/environment/chat-environment.ts:16-18`):

```ts
dispatchCommand: (command: ClientOrchestrationCommand) =>
  Promise<{ deduped: boolean; sequence: number }>
```

It is a plain function property, never a method that needs `this` — the app
already passes it unbound at `chat-view.tsx:176` and `:181`. Passing
`environment.dispatchCommand` into the helper is safe.

`errorMessage` (`apps/web/src/lib/error-message.ts`, whole file):

```ts
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error

  return fallback
}
```

### One behaviour you must preserve — the accepted callback is not a dispatch failure

`plan-follow-up-provider.tsx:321-333` (verbatim):

```ts
/**
 * Host code, so it is kept outside the dispatch guard and off the result: the
 * command is accepted either way, and a host that cannot show the new thread must
 * not read back as a failed dispatch.
 */
function runOnAccepted(onAccepted: () => void, scope: ChatPipelineScope) {
  try {
    onAccepted()
  } catch (error) {
    scope.increment('command.acceptedCallbackFailedCount')
    scope.warn('Plan follow-up accepted callback failed.', { error })
  }
}
```

The new helper generalises this: `onAccepted` runs in its own try/catch and can
never turn an accepted dispatch into a failed one.

### Repo conventions that apply (quoted from `AGENTS.md` — you have not read it)

- **Code organization**: "Group by feature, then by kind: `components/` — React
  render components only (`.tsx`) … `providers/` — context providers and
  `*-context.ts` modules … `utils/` — pure, stateless, non-React code only. No
  stores, no module-level mutable state, no subscriptions, nothing that imports
  React". "Import exact files through `@/`. **Do not add barrel `index.ts`
  files.**"
  → The dispatch helper reaches the client logger (module-level state), so it
  belongs in `features/chat/lib/` next to `chat-command-sync.ts` and
  `chat-pipeline-logging.ts`, **not** `utils/`. The `elapsedMs` helper is pure
  and goes in `features/chat/utils/`.
- **Naming**: "Do not repeat the folder name in file or symbol names." /
  "When removing a redundant prefix, rename the file, exports, and all call
  sites in one pass."
- **Control flow**: "Keep nesting depth to 3 or less." / "Use guard clauses and
  early returns. Keep the happy path shallow." / "Do not use `else` after an
  early return." / "Never use nested ternaries."
- **React**: "Avoid manual React memoization. Do not add `memo`, `useMemo`, or
  `useCallback` for ordinary render values or callbacks. Use them only for
  measured performance issues, required stable identity, or correctness. Add a
  short reason when you do." → Every `useMemo`/`useCallback` you touch already
  carries that reason in a comment. **Keep the comment and the dependency array
  byte-identical**; you are only changing the body.
  `oxc-react-compiler/preserve-manual-memoization` is at `error` in
  `.oxlintrc.json:12`.
- **Logging**: "Logging is wide-event style (evlog). Always prefer wide logs:
  enrich the one event per operation/request with more fields instead of
  emitting extra narrow log lines." / "Never throw `new Error`. Create errors
  with `createError` from `evlog` — in practice through the feature's
  `structured-errors.ts` wrapper." **This plan creates no errors and adds no new
  log events**; it merges existing ones. (Test files may construct plain
  `Error`s as fixtures — the existing suites do, e.g.
  `pending-approval-panel.test.tsx:64`.)
- **Greenfield**: "No backward compatibility shims, no legacy aliases, no
  deprecation windows. Update every call site in the same pass." → When you
  delete `replayAfterTurnDispatch` / `replayAfterDraftTurnDispatch`, delete them
  outright; do not re-export them from the new module.
- **Refactors**: "Remove duplicate code aggressively." / "Delete obsolete tests
  instead of preserving old behavior."
- **Dev server**: "A dev server is always running. Never spin up your own server
  to test or verify changes — reuse the running one." One is live at
  http://localhost:5173.
- **Testing**: "Import `{ test, expect }` from `apps/web/test/fixtures.ts`, not
  from `vitest`, for app tests." (`.test.ts` under `src/**` runs in the `node`
  project, `.test.tsx` in `dom` — `apps/web/vitest.config.ts:35,46`.) "Do not
  `mock.module` or `vi.mock` our server, client, or feature modules." "Use
  `render.tsx`; `renderWithProviders` mirrors the app's `main.tsx` provider
  stack."
  → **Resolving the apparent contradiction with Step 1c**: `fixtures.ts` exports
  a `test` extended with `server` and `client` fixtures (real in-process Elysia +
  Eden). Your new file needs neither — it tests a pure client-side helper against
  a stub function. Follow its neighbour `chat-command-sync.test.ts`, which
  imports `{ describe, expect, it }` from `vitest` for exactly that reason. Do
  not pull in the server fixture to satisfy the letter of the rule.
- **Logs**: "The app writes structured JSONL logs to `logs/`, one file per day."

### Fact you need before writing any test

Under Vitest, `import.meta.env.MODE === 'test'`, so `clientLoggingEnabled()`
returns `false` (`apps/web/src/lib/client-logging.ts:148-153` →
`observabilityEnabledFromEnv`, `packages/observability/src/env.ts:4-7`), and
`createWideEventScope` returns `noopScope` (`wide-event-scope.ts:46`).

**Therefore the telemetry is invisible to every automated test.** Do not try to
assert on emitted events, and do not add a mock to make them visible. The
automated gate is the helper's _control flow_ (result shape, callbacks,
never-rejects) plus the existing behaviour suites.

### Fact you need before trusting the Step 9 log check

Client wide events _can_ reach `logs/*.jsonl` — `logs/2026-08-12.jsonl` holds
652 lines with `"action":"chat.optimistic.summary"` and `"source":"client"`.

But at `ace313f` **no dispatch-summary event appears in any log file**:

```
grep -ho '"action":"chat[^"]*"' logs/*.jsonl | sort | uniq -c
```

returns zero for `chat.command.dispatch.summary`, `chat.stop.dispatch.summary`
and `chat.session.archive`. Either nobody dispatched a chat command while those
logs were collected, or the client drain was not running. **You cannot tell
which from the file alone**, which is why Step 0 makes you calibrate the
instrument on the _unchanged_ code before Step 9 uses it as a gate.

### Verification errors are typecheck errors, not lint errors

`apps/web/tsconfig.app.json:15-16` sets `noUnusedLocals` and
`noUnusedParameters`, so a leftover import fails `bun run --filter web typecheck`.
`oxlint` reports the same thing as a **warning** and still exits 0 — verified:
adding an unused import and running `bunx oxlint .` in `apps/web` prints
`warning eslint(no-unused-vars)` and exits `0`. So **typecheck** is the proof you
removed the right imports. Lint is still run at every step, but for the React
Compiler rules, not for dead imports.

## Commands you will need

| Purpose                           | Command (from repo root unless noted)                                                                                                        | Expected on success                                                                                      |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Typecheck web                     | `bun run --filter web typecheck`                                                                                                             | exit 0, no errors                                                                                        |
| Lint web                          | `bun run --filter web lint`                                                                                                                  | exit 0                                                                                                   |
| Format (fix, **only your files**) | `cd apps/web && bunx oxfmt --write <the paths you edited>`                                                                                   | exit 0                                                                                                   |
| Format check                      | `bun run --filter web format:check`                                                                                                          | see the warning below — **not** exit 0 today                                                             |
| Chat node tests                   | `cd apps/web && bun --bun vitest run --project node src/features/chat/lib/tests src/features/chat/state/tests src/features/chat/utils/tests` | **53 files, 478 tests pass** (baseline at `ace313f`)                                                     |
| Chat dom tests                    | `cd apps/web && bun --bun vitest run --project dom src/features/chat/components/tests src/features/chat-mode/components/tests`               | **29 files, 183 tests pass** (baseline at `ace313f`)                                                     |
| Web tests (all)                   | `bun run --filter web test`                                                                                                                  | all pass                                                                                                 |
| Full verify                       | `bun run verify`                                                                                                                             | typecheck + lint + tests pass; `format:check` fails on the one pre-existing file — see the warning below |

> The dom run prints `ECONNREFUSED` stack noise from the MSW/log-drain edge.
> That is expected at `ace313f` and is **not** a failure — read the
> `Test Files … Tests …` summary lines, not the stderr.

> Do **not** run `bun run --filter web test:browser`. The `browser` project is
> known to hang at the RUN banner in this repo; nothing in this plan needs it.

> **`bun run verify` does not exit 0 on a clean checkout of `ace313f` + the
> working tree you inherit.** Verified: `typecheck` exits 0, but `format:check`
> exits 1 on `apps/web/src/features/settings/hooks/use-setting-inspection.ts`,
> an unrelated uncommitted file from other work in progress. `verify` runs
> `format:check`, so it inherits that failure.
>
> Consequence: **never run `bun run --filter web format`** (it rewrites the whole
> app and silently reformats someone else's WIP). Format only the files you
> edited, with `cd apps/web && bunx oxfmt --write <paths>`. And record `verify`'s
> baseline failure set in Step 0 so you can tell your failures from the ones that
> were already there.

## Scope

**In scope** (the only files you may create or modify):

- `apps/web/src/features/chat/utils/elapsed-ms.ts` (create)
- `apps/web/src/features/chat/lib/chat-command-dispatch.ts` (create)
- `apps/web/src/features/chat/lib/tests/chat-command-dispatch.test.ts` (create)
- `apps/web/src/features/chat/lib/chat-command-sync.ts`
- `apps/web/src/features/chat/lib/tests/chat-command-sync.test.ts`
- `apps/web/src/features/chat/components/chat-view.tsx`
- `apps/web/src/features/chat/components/chat-draft-view.tsx`
- `apps/web/src/features/chat/providers/composer-modes-provider.tsx`
- `apps/web/src/features/chat/providers/pending-requests-provider.tsx`
- `apps/web/src/features/chat/providers/plan-follow-up-provider.tsx`
- `apps/web/src/features/chat-mode/hooks/use-session-actions.ts`
- `apps/web/src/features/chat-mode/hooks/use-project-actions.ts`
- `apps/web/src/features/chat-mode/hooks/use-save-project-script.ts`
- `apps/web/src/features/chat-mode/state/rail-order-commands.ts`
- `apps/web/src/features/chat-mode/components/project-rename-dialog.tsx`
- `plans/README.md` (the status cell of row 030 only)

**Out of scope** (do NOT touch, even though they look related):

- `apps/web/src/features/chat/notify-command-error.ts` — plan 021 owns this
  file's contents. You call it; you do not change its signature.
- `apps/web/src/features/chat/transport/orchestration-rpc-client.ts` — it wraps
  every dispatch in `observeClientOperation`, which already emits an
  error-shaped event and rethrows. Adding this envelope on top is fine; _changing_
  the RPC layer would produce a second event and break the wide-event rule.
- `apps/web/src/features/chat/state/thread-detail-subscriptions.ts`,
  `thread-earlier-pages.ts`, `chat-optimistic-store.ts`,
  `chat-projection-store.ts` — they use `createChatPipelineScope` for
  subscriptions and stores, not for command dispatch. Different lifecycle,
  different event, not this envelope.
- `apps/web/src/features/chat-mode/hooks/use-project-retry.ts` — its
  `requestWorkspaceProject` (line 40) is a genuine eleventh dialect-B envelope,
  and it stays. It dispatches `project.create`, whose failure feeds a **retry
  state machine** (`setAttempt({ error, retrying })`), not the chat command path;
  its useful field is `rootPath`, which `chatCommandSummary` does not carry
  because the command has no `threadId` or `projectId`. Converting it means
  designing that context and re-testing the retry banner — a separate change.
- `apps/web/src/features/chat/hooks/use-workspace-chat-project.ts` — same
  command, same reason. It has a try/catch and no telemetry; adding the envelope
  here would emit two `project.create` events for one workspace open, because
  `use-project-retry.ts` already logs the retry of the same command.
- The four `elapsedMs` copies **outside** `features/chat/`
  (`lib/client-logging.ts:244`, `lib/file-server.ts:455`,
  `components/use-pick-entry.tsx:183`,
  `features/search/search-providers.ts:211`), **and** the one inside
  `features/chat/transport/orchestration-rpc-client.ts:773` — that file is
  already out of scope for the reason above. A repo-wide home for `elapsedMs` is
  plan 043's `lib/` membership work; pulling five unrelated features into this
  diff buys nothing and triples the review surface.
- Adding a `toast` to the `use-session-actions.ts` commands. Plan 021 left that
  call to this plan; the call is **no** — reasoning in Maintenance notes.
- Renaming any `action` string. `chat.session.archive` and
  `chat.command.dispatch.summary` stay exactly as they are — the win here is a
  uniform event _shape_, and renaming actions breaks existing greps for nothing.
- `apps/server/**` — the offsets are derived from the server, but nothing on the
  server changes.
- `packages/editor-*` — symlinks to a sibling checkout. Never in scope.

## Git workflow

- **All work happens on `main`** — no new branches, worktrees, commits, pushes,
  or PRs unless the operator explicitly asks. Leave the work in the working tree
  unless told otherwise.
- If (and only if) the operator asks for a commit: conventional commits,
  lowercase descriptive subject. Real examples from `git log`:
  - `refactor(orchestration): the server prepares a session's worktree (M-C)`
  - `fix(address): bound the URL, and stop escaping slashes in ?tabs=`
  - A fitting subject here: `refactor(chat): one envelope for every command dispatch`

## Steps

### Step 0: Confirm plan 021 has landed

```
ls apps/web/src/features/chat/notify-command-error.ts
```

- **File exists** → continue with Step 1.
- **File does not exist** → **STOP and report**: "plan 021 must land first;
  030 folds its four call sites into the shared envelope." Do not create the
  file yourself and do not proceed with a reduced scope.

Also record your baselines now, so a later failure is attributable:

```
cd apps/web && bun --bun vitest run --project node src/features/chat/lib/tests src/features/chat/state/tests src/features/chat/utils/tests
cd apps/web && bun --bun vitest run --project dom src/features/chat/components/tests src/features/chat-mode/components/tests
```

→ 478 and 183 passing at `ace313f` (both re-run and confirmed exactly). Plan 021
adds 2 dom tests (`project-rename-dialog.test.tsx`), so 185 is also correct.
Write the two numbers down.

Also record the working tree you started from, because the repo already carries
unrelated modified files and "no files outside the in-scope list" can only mean
_new_ ones:

```
git status --porcelain > /tmp/030-baseline-status.txt
bun run --filter web format:check > /tmp/030-baseline-format.txt 2>&1
```

At `ace313f` that second command exits 1 and names
`src/features/settings/hooks/use-setting-inspection.ts` — pre-existing, not
yours. Any file in the Step 9 format check that is **not** in this baseline file
is yours to fix.

**Calibrate the log instrument now, before you change anything.** Step 9 checks
that dispatch telemetry reaches `logs/`, and at `ace313f` no dispatch event has
ever appeared there. Prove the instrument reads before you rely on it: in the
dev server already running at http://localhost:5173, **send one chat turn**,
then

```
grep -c 'chat.command.dispatch.summary' logs/$(date +%F)*.jsonl
```

- **≥ 1** → the drain works. Step 9's check is a real gate; go to Step 1.
- **0** → the client log drain is not reaching `logs/` on this machine. This is
  **not** caused by anything in this plan and is **not** a reason to stop. Note
  it, treat Step 9's log check as _skipped_, and say so in your final report.
  Do **not** try to fix the drain — that is out of scope.

### Step 1: Create the shared `elapsedMs` and the envelope

**1a.** Create `apps/web/src/features/chat/utils/elapsed-ms.ts`:

```ts
/** Milliseconds since a `performance.now()` mark, rounded to two decimals. */
export function elapsedMs(startedAt: number) {
  return Math.round((performance.now() - startedAt) * 100) / 100
}
```

**1b.** Create `apps/web/src/features/chat/lib/chat-command-dispatch.ts`:

```ts
import type { ClientOrchestrationCommand } from '@workspace/contracts'

import { errorMessage } from '@/lib/error-message'
import type { ChatEnvironment } from '../environment/chat-environment'
import { elapsedMs } from '../utils/elapsed-ms'
import type { ThreadCommandDispatchResult } from './chat-command-sync'
import {
  chatCommandSummary,
  createChatPipelineScope,
  type ChatPipelineScope,
} from './chat-pipeline-logging'

export type DispatchCommand = ChatEnvironment['dispatchCommand']

export type ChatCommandDispatchOutcome =
  | { readonly ok: true; readonly result: ThreadCommandDispatchResult }
  | { readonly error: unknown; readonly message: string; readonly ok: false }

/**
 * The one door every chat command dispatch goes through.
 *
 * Before this existed the same try/catch/finally was hand-copied ten times in
 * three telemetry dialects, so a dashboard over `command.dispatchAcceptedCount`
 * missed every chat-mode action and a grep over `action:"chat.session.*"` missed
 * every chat-view command. Worse, writing the envelope by hand cost enough that
 * four more call sites skipped error handling entirely and dispatched into
 * `void`. One entry point is what makes the telemetry uniform and the rejection
 * boundary free.
 *
 * Never rejects. Every hook it calls is guarded, so `void dispatchChatCommand({…})`
 * is a real rejection boundary — which `void environment.dispatchCommand(…)` was not.
 */
export async function dispatchChatCommand({
  action,
  beforeDispatch,
  command,
  context,
  dispatchCommand,
  onAccepted,
  onFailed,
}: {
  /** The wide event's `action`. Keep the name the call site already used. */
  readonly action: string
  /**
   * Optimistic writes and their counters, on the same wide event. Runs inside
   * the guard: a throw here emits the event with `dispatchFailedCount` and no
   * `dispatchStartCount`, which is exactly "never left the client".
   */
  readonly beforeDispatch?: (scope: ChatPipelineScope) => void
  readonly command: ClientOrchestrationCommand
  /** Extra fields for the wide event, merged over `chatCommandSummary`. */
  readonly context?: Record<string, unknown>
  readonly dispatchCommand: DispatchCommand
  /**
   * Host work the server's acceptance unlocks. Guarded separately: the command
   * is accepted either way, and a host that cannot show the result must not
   * read back as a failed dispatch.
   */
  readonly onAccepted?: (result: ThreadCommandDispatchResult) => void
  /** Rollback for whatever the call site committed optimistically. */
  readonly onFailed?: (error: unknown) => void
}): Promise<ChatCommandDispatchOutcome> {
  const startedAt = performance.now()
  const scope = createChatPipelineScope(action, {
    ...chatCommandSummary(command),
    ...context,
  })

  try {
    beforeDispatch?.(scope)
    scope.increment('command.dispatchStartCount')
    const result = await dispatchCommand(command)
    scope.increment('command.dispatchAcceptedCount')
    scope.set({ deduped: result.deduped, outcome: 'ok', sequence: result.sequence })
    runGuarded(() => onAccepted?.(result), scope, 'command.acceptedCallbackFailedCount')

    return { ok: true, result }
  } catch (error) {
    runGuarded(() => onFailed?.(error), scope, 'command.failedCallbackFailedCount')
    scope.increment('command.dispatchFailedCount')
    scope.warn('Chat command dispatch failed.', { error })
    scope.set({ outcome: 'error' })

    return { error, message: errorMessage(error, 'Chat command failed.'), ok: false }
  } finally {
    scope.end({ durationMs: elapsedMs(startedAt) })
  }
}

/**
 * How many events the server appends for this command, so the replay window
 * opens just before the first of them. `result.sequence` is the last committed
 * event: a plain turn start decides message-sent + turn-start-requested, and a
 * bootstrapped one prepends thread.created. Everything else replays two wide —
 * one more than a single-event command needs, which replay's idempotence makes
 * free and which is what the call sites already did.
 */
export function replayAfterDispatch(
  command: ClientOrchestrationCommand,
  result: ThreadCommandDispatchResult,
) {
  return Math.max(0, result.sequence - eventsCommittedBy(command))
}

function eventsCommittedBy(command: ClientOrchestrationCommand) {
  if (command.type !== 'thread.turn.start') return 2

  return command.bootstrap?.createThread ? 3 : 2
}

function runGuarded(run: () => void, scope: ChatPipelineScope, counter: string) {
  try {
    run()
  } catch (error) {
    scope.increment(counter)
    scope.warn('Chat command dispatch callback failed.', { error })
  }
}
```

**1c.** Create `apps/web/src/features/chat/lib/tests/chat-command-dispatch.test.ts`
(node project — `.test.ts`). Model it on
`apps/web/src/features/chat/lib/tests/chat-command-sync.test.ts`, which imports
`{ describe, expect, it }` from `vitest` and builds real contract objects with
`v.parse(...)`. Build the commands with the real builders from
`../chat-command-builders` — do not hand-roll command literals.

Seven cases on the envelope:

1. `an accepted dispatch returns the server result` — stub
   `dispatchCommand: async () => ({ deduped: false, sequence: 12 })`, expect
   `outcome.ok === true` and `outcome.result.sequence === 12`.
2. `a refused dispatch returns the error and its message` — stub throws
   `new Error('socket closed')`; expect `outcome.ok === false`,
   `outcome.message === 'socket closed'`, and `outcome.error` is that Error.
3. `a non-Error rejection falls back to the generic message` — stub rejects with
   the string `'nope'`; expect `outcome.message === 'nope'` (the `errorMessage`
   string branch), then a second case rejecting with `{}` expecting
   `'Chat command failed.'`.
4. `onFailed runs on refusal and not on acceptance` — assert a counter variable
   in both directions; same for `onAccepted`.
5. `a throwing onAccepted does not turn an accepted dispatch into a failure` —
   `onAccepted: () => { throw new Error('host blew up') }`; expect
   `outcome.ok === true`. **This is the regression this plan must not lose**
   (`plan-follow-up-provider.tsx:321-325` states the rule today).
6. `a throwing onFailed does not escape` — `onFailed` throws; expect the
   returned promise to resolve with `ok === false` rather than reject.
7. `a throwing beforeDispatch never sends the command` — `beforeDispatch`
   throws, and `dispatchCommand` is a stub that increments a counter. Expect
   `outcome.ok === false` **and** the counter still `0`. This is the negative
   half of case 5: `onAccepted`/`onFailed` failures must not change the dispatch
   outcome, and a `beforeDispatch` failure must stop the dispatch entirely.

Plus one case for the offsets, replacing the assertion currently at
`chat-command-sync.test.ts:87-90`:

8. `derives the replay window from the command shape` —
   `replayAfterDispatch(turnCommand, { deduped: false, sequence: 12 })` → `10`;
   `replayAfterDispatch(draftCommand, { deduped: false, sequence: 12 })` → `9`;
   `replayAfterDispatch(checkpointRevertCommand, { deduped: false, sequence: 12 })`
   → `10`; and `replayAfterDispatch(turnCommand, { deduped: false, sequence: 1 })`
   → `0` (the `Math.max` floor).

**Verify**:

```
bun run --filter web typecheck
cd apps/web && bun --bun vitest run --project node src/features/chat/lib/tests/chat-command-dispatch.test.ts
```

→ typecheck exit 0; **8 tests pass**. Nothing else in the repo has changed yet,
so the two baselines from Step 0 must still hold.

### Step 2: `chat-view.tsx` — three envelopes

Rewrite the three functions. Keep every comment that explains a decision.

**`submitChatTurn` (215-295)** — the body from `const startedAt` to the closing
brace becomes:

```ts
setSendError(null)
setSending(true)
try {
  const outcome = await dispatchChatCommand({
    action: 'chat.command.dispatch.summary',
    beforeDispatch: (scope) => {
      scope.increment('command.submitCount')
      useChatOptimisticStore
        .getState()
        .addOptimisticMessage(submission.command.commandId, submission.optimisticMessage)
      scope.increment('command.optimisticAddedCount')
      scope.set({
        optimistic: optimisticMessageSummary({
          commandId: submission.command.commandId,
          messageId: submission.optimisticMessage.id,
          textLength: text.length,
          threadId: thread.id,
        }),
      })
    },
    command: submission.command,
    context: {
      attachmentCount: attachments.length,
      interactionMode,
      model: modelSelection.model,
      providerInstanceId: modelSelection.providerInstanceId,
      runtimeMode,
      terminalContextCount: terminalContexts.length,
      textLength: text.length,
    },
    dispatchCommand: environment.dispatchCommand,
    onAccepted: (result) =>
      scheduleThreadProjectionSyncAfterDispatch({
        environment,
        replayAfterSequence: replayAfterDispatch(submission.command, result),
        threadId: thread.id,
      }),
    onFailed: () =>
      useChatOptimisticStore
        .getState()
        .removeOptimisticMessage(thread.id, submission.optimisticMessage.id),
  })
  if (outcome.ok) return true

  setSendError(outcome.message)
  return false
} finally {
  setSending(false)
}
```

Deliberate ordering change: `setSendError(null)` / `setSending(true)` now run
_before_ the optimistic add instead of after. Both are synchronous and happen in
the same tick before the first `await`, so React batches them identically. Note
it in your commit message if you write one; do not "fix" it back.

**`dispatchThreadStop` (297-329)** — body becomes:

```ts
setInterrupting(true)
try {
  const outcome = await dispatchChatCommand({
    action: 'chat.stop.dispatch.summary',
    command: createThreadInterruptCommand({
      threadId: thread.id,
      turnId: thread.latestTurn?.turnId,
    }),
    dispatchCommand: environment.dispatchCommand,
  })
  if (!outcome.ok) setSendError(outcome.message)
} finally {
  setInterrupting(false)
}
```

**`revertThreadToCheckpoint` (331-378)** — body becomes:

```ts
setRevertingCheckpoint(true)
setSendError(null)
const command = createCheckpointRevertCommand({ threadId: thread.id, turnCount })
try {
  const outcome = await dispatchChatCommand({
    action: 'chat.checkpoint_revert.dispatch.summary',
    command,
    dispatchCommand: environment.dispatchCommand,
    onAccepted: (result) =>
      scheduleThreadProjectionSyncAfterDispatch({
        environment,
        replayAfterSequence: replayAfterDispatch(command, result),
        threadId: thread.id,
      }),
  })
  if (!outcome.ok) setSendError(outcome.message)
} finally {
  setRevertingCheckpoint(false)
}
```

Then delete `elapsedMs` (380-382) and fix the imports:

- **Remove**: `errorMessage` from `@/lib/error-message`; `replayAfterTurnDispatch`
  from `../lib/chat-command-sync`; `chatCommandSummary` and
  `createChatPipelineScope` from `../lib/chat-pipeline-logging` (keep
  `optimisticMessageSummary`).
- **Add**: `import { dispatchChatCommand, replayAfterDispatch } from '../lib/chat-command-dispatch'`.

Leave `handlePersistModelSelection` (98-110) alone for now — Step 8 owns it.

**Verify**:

```
bun run --filter web typecheck
bun run --filter web lint
```

→ both exit 0. **Typecheck** is what proves you removed the right imports:
`apps/web/tsconfig.app.json` sets `noUnusedLocals`, so a leftover import is a
build error. `oxlint` only warns about it and exits 0 — never read a green lint
as "no dead imports". Lint is here for the React Compiler rules.

### Step 3: `chat-draft-view.tsx` — collapse `handleSend` + `dispatchDraftSubmission`

Delete `dispatchDraftSubmission` (173-210) and `elapsedMs` (220-222). Keep the
`addOptimisticMessage` / `removeOptimisticMessage` wrappers (212-218).

Inside `handleSend`, everything from `const scope = createChatPipelineScope(` to
the closing `}` of the `finally { scope.end(...) }` block (113-140) goes away —
the scope, `const startedAt`, the `try`, the `finally`, and the
`scope.increment('command.submitCount')` line, which moves into `beforeDispatch`.
So the body after the `if (!project)` guard, the `consumeIsolation()` call and
the `createDraftThreadSubmission` call becomes:

```ts
const outcome = await dispatchChatCommand({
  action: 'chat.draft.dispatch.summary',
  beforeDispatch: (scope) => {
    scope.increment('command.submitCount')
    addOptimisticMessage(submission.command.commandId, submission.optimisticMessage)
    scope.increment('command.optimisticAddedCount')
    scope.set({
      optimistic: optimisticMessageSummary({
        commandId: submission.command.commandId,
        messageId: submission.optimisticMessage.id,
        textLength: submission.optimisticMessage.text.length,
        threadId: submission.optimisticMessage.threadId,
      }),
    })
  },
  command: submission.command,
  context: {
    attachmentCount: attachments.length,
    interactionMode,
    model: modelSelection.model,
    projectId: project.id,
    providerInstanceId: modelSelection.providerInstanceId,
    runtimeMode,
    terminalContextCount: terminalContexts.length,
    textLength: text.length,
  },
  dispatchCommand: environment.dispatchCommand,
  onAccepted: (result) =>
    scheduleThreadProjectionSyncAfterDispatch({
      environment,
      replayAfterSequence: replayAfterDispatch(submission.command, result),
      threadId: submission.command.threadId,
    }),
  onFailed: () => removeOptimisticMessage(submission.optimisticMessage),
})
if (!outcome.ok) {
  setSendError(outcome.message)
  return false
}

setSendError(null)
onThreadCreated(submission.command.threadId)

return true
```

`useCallback`'s dependency array stays `[consumeIsolation, environment, onThreadCreated, project, rootPath]`
— byte-identical.

Imports: remove `errorMessage`, `replayAfterDraftTurnDispatch`,
`chatCommandSummary`, `createChatPipelineScope`, `type ChatPipelineScope`; keep
`optimisticMessageSummary` and `scheduleThreadProjectionSyncAfterDispatch`; add
`dispatchChatCommand` and `replayAfterDispatch` from `../lib/chat-command-dispatch`.

Leave `handlePersistModelSelection` (71-83) alone — Step 8 owns it.

**Verify**: `bun run --filter web typecheck && bun run --filter web lint` → exit 0.

### Step 4: The two composer providers

**`composer-modes-provider.tsx`** — replace the body of `dispatchModeSet`
(104-125), keeping the signature and the rollback comment:

```ts
async function dispatchModeSet({
  command,
  context,
  dispatchCommand,
}: {
  command: ModeSetCommand
  context: Record<string, unknown>
  dispatchCommand: DispatchCommand
}): Promise<boolean> {
  // Nothing is rolled back: the draft override keeps the next turn correct
  // even when the thread-level sync never lands.
  const outcome = await dispatchChatCommand({
    action: 'chat.thread_mode.set.summary',
    command,
    context,
    dispatchCommand,
  })

  return outcome.ok
}
```

Imports: drop `chatCommandSummary` / `createChatPipelineScope`, add
`dispatchChatCommand` from `@/features/chat/lib/chat-command-dispatch`. The
local `type DispatchCommand` alias at line 26 can stay or be replaced by the
one the new module exports — either is fine, but do not export a second copy.

**`pending-requests-provider.tsx`** — replace the body of
`dispatchPendingRequestResponse` (110-134):

```ts
setResponding((current) => withRequestId(current, requestId))
const outcome = await dispatchChatCommand({
  action: 'chat.pending_request.respond.summary',
  command,
  context: { ...context, requestId },
  dispatchCommand,
  // A dropped command leaves the agent blocked, so the row has to come back
  // enabled. A success stays disabled until the resolved activity drops it.
  onFailed: () => setResponding((current) => withoutRequestId(current, requestId)),
})

return outcome.ok
```

Same import swap. The `useMemo` dependency arrays in both files are unchanged.

**Verify**:

```
bun run --filter web typecheck
bun run --filter web lint
cd apps/web && bun --bun vitest run --project dom src/features/chat/components/tests/pending-approval-panel.test.tsx src/features/chat/components/tests/pending-user-input-panel.test.tsx src/features/chat/components/tests/composer-controls-menu.test.tsx
```

→ typecheck and lint exit 0; all three files pass with the same test counts as
your Step 0 baseline. `pending-approval-panel.test.tsx` has two cases that pin
this exact behaviour — `the decisions stay disabled while a response is in flight`
(line 53) and `a failed dispatch re-enables the row so the agent can still be
unblocked` (line 63). If either fails, your `onFailed` wiring is wrong.

### Step 5: `plan-follow-up-provider.tsx`

Replace `dispatchPlanTurn` (224-279) and delete `runOnAccepted` (326-333):

```ts
async function dispatchPlanTurn({
  action,
  command,
  context,
  environment,
  onAccepted,
  optimisticMessage,
  planThreadId,
}: {
  action: string
  command: ThreadTurnStartCommand
  context: Record<string, unknown>
  environment: ChatEnvironment
  onAccepted: () => void
  optimisticMessage: OrchestrationMessage
  /** The thread the plan lives on, which is not always the one running the turn. */
  planThreadId: ThreadId
}): Promise<boolean> {
  const outcome = await dispatchChatCommand({
    action,
    beforeDispatch: () =>
      useChatOptimisticStore.getState().addOptimisticMessage(command.commandId, optimisticMessage),
    command,
    context: { ...context, planThreadResynced: planThreadId !== command.threadId },
    dispatchCommand: environment.dispatchCommand,
    onAccepted: (result) => {
      syncThreadsAfterPlanTurn({
        environment,
        planThreadId,
        replayAfterSequence: replayAfterDispatch(command, result),
        turnThreadId: command.threadId,
      })
      onAccepted()
    },
    // Only the dispatch is guarded here. Anything after it runs on a command the
    // server accepted, and rolling the message back then would erase a turn that
    // is already running.
    onFailed: () =>
      useChatOptimisticStore
        .getState()
        .removeOptimisticMessage(optimisticMessage.threadId, optimisticMessage.id),
  })

  return outcome.ok
}
```

`syncThreadsAfterPlanTurn` loses its `scope` parameter and its
`scope.set({ planThreadResynced })` line (line 306) — that field now rides in
`context`, computed from the same comparison. Keep the long comment above the
function verbatim.

One accepted behaviour change: the sync and the host callback used to be two
statements, and are now one guarded `onAccepted`. If `syncThreadsAfterPlanTurn`
throws, `onAccepted()` no longer runs. `scheduleThreadProjectionSyncAfterDispatch`
swallows its own failures (`chat-command-sync.ts:65-72`), so it does not throw in
practice. Do not split them back apart to "be safe" — that reintroduces an
unguarded call in the accepted path.

The two callers change from passing a pre-built `scope` and a
`replayAfterSequence` function to passing `action` + `context`:

- `dispatchPlanFollowUpTurn` (154-169) →
  `action: 'chat.plan_follow_up.dispatch.summary'` and
  `context: { implementsPlan: followUp.implementsPlan, planId: plan.id, planThreadId: plan.threadId, sourcePlanId: sourceProposedPlan?.planId ?? null, terminalContextCount: draft.terminalContexts.length }`.
  Drop `scope:` and `replayAfterSequence:`.
- `dispatchPlanImplementationThread` (206-221) →
  `action: 'chat.plan_implementation_thread.dispatch.summary'` and
  `context: { planId: plan.id, planThreadId: plan.threadId, sourceThreadId: thread.id }`.
  Keep its `onAccepted: () => onThreadCreated(command.threadId)` and the comment
  above it.

Note the `chatCommandSummary(...)` spread disappears from both — the helper
applies it. Imports: drop `chatCommandSummary`, `createChatPipelineScope`,
`type ChatPipelineScope`, `replayAfterTurnDispatch`,
`replayAfterDraftTurnDispatch`, `type ThreadCommandDispatchResult`; add
`dispatchChatCommand` and `replayAfterDispatch`.

**Verify**:

```
bun run --filter web typecheck
bun run --filter web lint
cd apps/web && bun --bun vitest run --project dom src/features/chat/components/tests/plan-follow-up-banner.test.tsx
```

→ exit 0 and all cases pass.

### Step 6: The three chat-mode dialect-B sites

**`use-session-actions.ts`** — delete `dispatchSessionCommand` (133-165) and
shrink the inner `dispatch` helper (40-42). `chatCommandSummary` puts
`threadId`, `commandId` and `commandType` on the event for every one of these
commands, so the `threadId` parameter is redundant:

```ts
function dispatch(action: string, command: ClientOrchestrationCommand) {
  void dispatchChatCommand({ action, command, dispatchCommand: environment.dispatchCommand })
}
```

Update the **five** call sites to drop the `threadId` argument (lines 69, 89,
105, 108, 111) — e.g.
`dispatch('chat.session.archive', createThreadArchiveCommand({ threadId }))`.
Keep the action strings unchanged. The `void` is now safe:
`dispatchChatCommand` never rejects.

Imports: `log` is still used by the `outcome: 'blocked'` warn at line 52 — keep
it. `ThreadId` is still used by the exported actions — keep it. `errorMessage`
and `ChatEnvironment` become unused — remove them. Add `dispatchChatCommand`.

**`use-project-actions.ts`** — delete `dispatchProjectDelete` (71-94) and
replace line 53:

```ts
void dispatchChatCommand({
  action: 'chat.project.delete',
  command: createProjectDeleteCommand({ projectId: request.projectId }),
  dispatchCommand: environment.dispatchCommand,
})
```

`log`, `errorMessage` and `ChatEnvironment` become unused imports; `ProjectId` is
still used by `archiveAllSessions` and `projectThreadIds`, so it stays. Remove
whichever **typecheck** flags (`noUnusedLocals`) — lint will not tell you.

**`rail-order-commands.ts`** — replace the body of `dispatchRailOrder`
(129-157), keeping the signature:

```ts
await dispatchChatCommand({
  action: 'chat.rail.reorder',
  command,
  context: { kind, orderKey: 'orderKey' in command ? command.orderKey : null, rowId: id },
  dispatchCommand: environment.dispatchCommand,
  onAccepted: settle,
  // The optimistic key was the only thing holding the row in its new slot, so
  // dropping it is what puts the list back on the server's order.
  onFailed: release,
})
```

Leave `logReorderBlocked` (160-178) exactly as it is — it records a refusal
before any dispatch, not a dispatch. `log` stays imported for it; `errorMessage`
becomes unused.

**Verify**:

```
bun run --filter web typecheck
bun run --filter web lint
cd apps/web && bun --bun vitest run --project dom src/features/chat-mode/components/tests
```

→ exit 0; every chat-mode component test passes. `session-menu.test.tsx:57`
(`archiving a session dispatches the archive command…`) and
`session-rail-drag.test.tsx` are the ones that matter here.

### Step 7: Delete the superseded replay helpers and the last inline `elapsedMs`

In `apps/web/src/features/chat/lib/chat-command-sync.ts`:

- Delete `replayAfterTurnDispatch` (75-77) and `replayAfterDraftTurnDispatch`
  (79-81). Do not re-export them from the new module.
- Replace the inline duration at line 45-47 with the shared helper:

  ```ts
    } finally {
      scope.end({ durationMs: elapsedMs(startedAt) })
    }
  ```

  and `import { elapsedMs } from '../utils/elapsed-ms'`.

- `ThreadCommandDispatchResult` (12-15) stays — the new module imports it.

In `apps/web/src/features/chat/lib/tests/chat-command-sync.test.ts`:

- Delete the case `computes replay windows for turn and draft-thread dispatches`
  (87-90) and drop `replayAfterDraftTurnDispatch` / `replayAfterTurnDispatch`
  from the import at lines 21-25. Step 1's case 8 replaces it, with better
  coverage (it derives from the command rather than asserting two constants).
  AGENTS.md: "Delete obsolete tests instead of preserving old behavior."

**Verify**:

```
bun run --filter web typecheck
rg -n "replayAfterTurnDispatch|replayAfterDraftTurnDispatch" apps/web/src
rg -n "sequence - [23]" apps/web/src
rg -n "Math.round\(\(performance.now\(\) - startedAt\) \* 100\) / 100" apps/web/src/features/chat --glob '!**/transport/**'
cd apps/web && bun --bun vitest run --project node src/features/chat/lib/tests
```

→ typecheck exit 0; the first two `rg` calls return **no matches**; the third
returns **exactly one** hit, in `apps/web/src/features/chat/utils/elapsed-ms.ts`.
The `--glob '!**/transport/**'` is load-bearing: `transport/orchestration-rpc-client.ts:774`
has the same expression and is out of scope, so without it the check reads two
and you would be tempted to "finish the job".

The node run passes with no failures. Its file/test totals move (a new file, a
deleted case, and `elapsed-ms.ts` has no test of its own), so **do not pin a
number here** — just confirm zero failures and that `src/features/chat/lib/tests`
still reports more tests than it did at Step 0.

### Step 8: Fold plan 021's four sites into the same door

These are the sites that had no telemetry at all. After this step they emit the
same wide event as everything else.

**`chat-view.tsx`, `handlePersistModelSelection` (98-110)** — keep the
`useCallback`, its comment, and its dependency array `[environment, projectId]`
byte-identical. The body becomes:

```ts
void dispatchChatCommand({
  action: 'chat.project.default_model.set',
  command: createProjectDefaultModelCommand({
    defaultModelSelection: next,
    projectId,
  }),
  dispatchCommand: environment.dispatchCommand,
  onFailed: (error) => notifyChatCommandError(error, 'Could not save the default model'),
})
```

**`chat-draft-view.tsx`, `handlePersistModelSelection` (71-83)** — identical,
with `projectId: project.id`, dependency array `[environment, project]`
unchanged.

**`use-save-project-script.ts` (42-50)**:

```ts
void dispatchChatCommand({
  action: 'chat.project.scripts.set',
  command: createProjectScriptsCommand({
    projectId: project.id,
    scripts: [script, ...remaining],
  }),
  dispatchCommand: environment.dispatchCommand,
  onFailed: (error) => notifyChatCommandError(error, 'Could not save the project script'),
})
```

**`project-rename-dialog.tsx`, `save()`** — plan 021 turned this into an
`async` function with a try/catch and a `saving` flag. Replace only the
try/catch with the helper; keep `saving`, the `disabled={!canSave || saving}`
button, the `void save()` call sites, and the render-time title sync untouched:

```tsx
async function save() {
  if (!request || !canSave || saving) return

  setSaving(true)
  try {
    const outcome = await dispatchChatCommand({
      action: 'chat.project.rename',
      command: createProjectMetaCommand({ projectId: request.projectId, title: trimmed }),
      dispatchCommand: environment.dispatchCommand,
    })
    if (!outcome.ok) {
      // Closing on dispatch rather than on the result told the user the rename
      // landed; the old name then came back on the next projection sync with no
      // explanation.
      notifyChatCommandError(outcome.error, 'Could not rename the project')
      return
    }

    dismissRename()
  } finally {
    setSaving(false)
  }
}
```

`notifyChatCommandError(error, title)` computes the description with
`errorMessage` itself, so passing `outcome.error` (not `outcome.message`) keeps
plan 021's test assertion `{ description: 'socket closed' }` green.

**Verify**:

```
bun run --filter web typecheck
bun run --filter web lint
rg -n "void environment\.dispatchCommand\(" apps/web/src
cd apps/web && bun --bun vitest run --project dom src/features/chat-mode/components/tests/project-rename-dialog.test.tsx
```

→ typecheck and lint exit 0; the `rg` returns **no matches**; the rename dialog's
2 tests pass.

### Step 9: Full verification, one live check, and the index

Format **only the files you edited** — the full-app formatter would rewrite
unrelated WIP:

```
cd apps/web && bunx oxfmt --write src/features/chat/utils/elapsed-ms.ts src/features/chat/lib/chat-command-dispatch.ts src/features/chat/lib/tests/chat-command-dispatch.test.ts src/features/chat/lib/chat-command-sync.ts src/features/chat/lib/tests/chat-command-sync.test.ts src/features/chat/components/chat-view.tsx src/features/chat/components/chat-draft-view.tsx src/features/chat/providers/composer-modes-provider.tsx src/features/chat/providers/pending-requests-provider.tsx src/features/chat/providers/plan-follow-up-provider.tsx src/features/chat-mode/hooks/use-session-actions.ts src/features/chat-mode/hooks/use-project-actions.ts src/features/chat-mode/hooks/use-save-project-script.ts src/features/chat-mode/state/rail-order-commands.ts src/features/chat-mode/components/project-rename-dialog.tsx
```

Then, from the repo root:

```
bun run verify > /tmp/030-verify.txt 2>&1; echo $?
diff /tmp/030-baseline-format.txt <(bun run --filter web format:check 2>&1)
```

→ `verify` fails **only** on the pre-existing
`src/features/settings/hooks/use-setting-inspection.ts` format issue recorded in
Step 0, and the `diff` shows **no new file names**. Typecheck, lint and the test
run inside `verify` must all pass — read `/tmp/030-verify.txt` to confirm each
one, do not stop at the exit code. Any _other_ failure is yours.

Then the one thing no test can prove — that the telemetry is actually uniform.
**Skip this whole check if Step 0's calibration returned 0** and say so in your
report; a silent drain makes it meaningless, not failing.

The dev server is already running at http://localhost:5173; **do not start
one**. In the browser:

1. Send a chat turn.
2. Archive a session from the rail's context menu.
3. Switch the composer between plan and build mode.

Then, from the repo root (substitute today's date; the highest-numbered
continuation for a day is the newest):

```
grep -o '"action":"chat[^"]*"' logs/$(date +%F)*.jsonl | sort | uniq -c
grep -h '"command":{"dispatch' logs/$(date +%F)*.jsonl | head -3
```

Expected: the three actions you triggered
(`chat.command.dispatch.summary`, `chat.session.archive`,
`chat.thread_mode.set.summary`) each appear, and **each one carries a
`command.dispatchAcceptedCount` of 1, an `outcome` of `ok`, and a `durationMs`**.
Before this plan, `chat.session.archive` carried none of the three.

- All three present with counters → done, record it.
- `chat.command.dispatch.summary` present but `chat.session.archive` missing its
  counters → your Step 6 rewrite is wrong. STOP and report.
- **None** of the three present, even though Step 0's calibration found the turn
  event → the drain stopped between Step 0 and now. Re-run Step 0's calibration
  command; if it is also 0 now, the instrument died, not the code. Report that
  and do not chase it.

Finally, flip the status cell for row `030` in `plans/README.md` from `TODO` to
`DONE` (the row already exists in the Phase 3 table — do not add a new one).

## Test plan

| File                                                                                     | Cases                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/features/chat/lib/tests/chat-command-dispatch.test.ts` (new, node project) | 1 `an accepted dispatch returns the server result`; 2 `a refused dispatch returns the error and its message`; 3 `a non-Error rejection falls back to the generic message`; 4 `onFailed runs on refusal and not on acceptance`; 5 `a throwing onAccepted does not turn an accepted dispatch into a failure`; 6 `a throwing onFailed does not escape`; 7 `a throwing beforeDispatch never sends the command`; 8 `derives the replay window from the command shape` |
| `apps/web/src/features/chat/lib/tests/chat-command-sync.test.ts` (edit)                  | delete `computes replay windows for turn and draft-thread dispatches` (currently at lines 87-90) — case 8 above supersedes it                                                                                                                                                                                                                                                                                                                                    |

Structural pattern to copy: `apps/web/src/features/chat/lib/tests/chat-command-sync.test.ts`
(imports `{ describe, expect, it }` from `vitest`, builds real contract objects
with `v.parse(...)`, hands the unit under test a plain object stub for
`ChatEnvironment` rather than mocking a module).

**No new component or provider tests.** Every one of the ten rewrites is
behaviour-preserving from the UI's point of view, and the behaviour that could
break is already pinned by existing suites: `pending-approval-panel.test.tsx:53,63`
(disabled-while-in-flight, re-enabled-on-failure), `session-menu.test.tsx:57`
(archive dispatches its command), `session-rail-drag.test.tsx` (reorder
dispatches with the right order key), `plan-follow-up-banner.test.tsx`, and plan
021's `project-rename-dialog.test.tsx`. Those are the gate. Adding parallel
tests that re-assert the same things through a new seam would be padding.

**No test asserts on the telemetry**, because it is unreachable from the test
runner — see "Fact you need before writing any test". Step 9's log check is the
substitute, and it is the honest one: it reads the actual production output.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun run --filter web typecheck` exits 0
- [ ] `bun run --filter web lint` exits 0
- [ ] `diff /tmp/030-baseline-format.txt <(bun run --filter web format:check 2>&1)` names no file you edited (a bare `format:check` exit 0 is **not** achievable — see Step 0)
- [ ] `cd apps/web && bun --bun vitest run --project node src/features/chat/lib/tests/chat-command-dispatch.test.ts` → 8 tests pass
- [ ] `cd apps/web && bun --bun vitest run --project dom src/features/chat/components/tests src/features/chat-mode/components/tests` → no failures, count ≥ your Step 0 baseline
- [ ] `rg -c "command\.dispatchStartCount" apps/web/src` → exactly one file, `apps/web/src/features/chat/lib/chat-command-dispatch.ts`, count 1
- [ ] `rg -ln "createChatPipelineScope" apps/web/src/features/chat/components apps/web/src/features/chat/providers` → no matches
- [ ] `rg -n "replayAfterTurnDispatch|replayAfterDraftTurnDispatch|sequence - 2|sequence - 3" apps/web/src` → no matches
- [ ] `rg -n "Math.round\(\(performance.now\(\) - startedAt\) \* 100\) / 100" apps/web/src/features/chat --glob '!**/transport/**'` → exactly one hit, in `utils/elapsed-ms.ts`
- [ ] `rg -n "void environment\.dispatchCommand\(" apps/web/src` → no matches
- [ ] `rg -n "log\.(info|warn)" apps/web/src/features/chat-mode/hooks/use-project-actions.ts` → no matches (dialect B is gone from that file)
- [ ] `rg -n "new Error" apps/web/src/features/chat/lib/chat-command-dispatch.ts` → no matches
- [ ] `rg -n "dispatchChatCommand" apps/web/src/features/chat-mode/hooks/use-project-retry.ts apps/web/src/features/chat/hooks/use-workspace-chat-project.ts` → no matches (you did not widen the scope)
- [ ] `bun run verify` reaches the test phase and fails on nothing but the pre-existing `use-setting-inspection.ts` format issue from Step 0
- [ ] Step 9's log check shows `command.dispatchAcceptedCount` on a `chat.session.*` event — **or** Step 0's calibration returned 0 and you reported the check as skipped
- [ ] `git status --porcelain | diff - /tmp/030-baseline-status.txt` shows only entries for files on the "In scope" list. The repo carries unrelated modified files from other work; a bare `git status` is **not** the check.
- [ ] `plans/README.md` row 030 status is `DONE` (row already exists at `plans/README.md:76`)

## STOP conditions

Stop and report back (do not improvise) if:

- `apps/web/src/features/chat/notify-command-error.ts` does not exist at Step 0
  — plan 021 has not landed and Step 8 has nothing to call.
- Any excerpt in "Current state" does not match the live code, beyond the
  line-number shifts plan 021 introduces in `chat-view.tsx`,
  `chat-draft-view.tsx`, `use-save-project-script.ts` and
  `project-rename-dialog.tsx`.
- `pending-approval-panel.test.tsx`'s case at line 63 (`a failed dispatch
re-enables the row so the agent can still be unblocked`) fails. That is the
  `onFailed` contract; a failure means the rollback is running at the wrong time
  or not at all. Do not "fix" it by changing the test.
- Any `oxc-react-compiler/*` rule fires — especially
  `preserve-manual-memoization` (at `error`). It means a `useMemo` /
  `useCallback` dependency array changed. Restore the array; do **not** disable
  or downgrade a lint rule, and do not add or remove memoization.
- You find yourself wanting to change a replay offset, or to make
  `replayAfterDispatch` "more correct". The server's turn path emits a variable
  number of events (`decider.ts:676-696`, `lifecycleResetEvents` adds 0–2), so
  the current numbers are already approximate by design and the snapshot half of
  the sync covers the gap. Changing them is a separate, measured change.
- You find yourself wanting to rename an `action` string, add a toast to
  `use-session-actions.ts`, or touch a file in the "Out of scope" list.
- You find yourself about to convert `use-project-retry.ts` or
  `use-workspace-chat-project.ts` "for consistency". They are named in Out of
  scope with reasons; converting them is a different change with a different
  test surface.
- `bun run --filter web typecheck` fails with `noUnusedLocals` on a file you
  edited **and** you cannot tell which import is now dead. Do not delete imports
  by guesswork — the error names the identifier; remove exactly that one.
- The dom test run **hangs** rather than failing. The `browser` vitest project
  is known to hang at the RUN banner in this repo; if you accidentally invoked
  it, kill it and re-run with `--project dom` explicitly.
- `plan-follow-up-banner.test.tsx` fails after Step 5. The new `onAccepted`
  runs `syncThreadsAfterPlanTurn` _and_ the caller's callback inside one guard,
  where the old code ran them as two statements. If the sync throws, the host
  callback is now skipped. That is the one behavioural difference in Step 5 —
  report it rather than reordering the helper.

## Maintenance notes

For the human or agent who owns this next:

- **`dispatchChatCommand` is now the only sanctioned way to send a chat
  command.** A new command should not hand-roll a scope. If a call site needs
  something the helper does not offer, extend the helper rather than forking it —
  forking it is how the three dialects happened.
- **The `void dispatchChatCommand({…})` pattern is load-bearing.** The helper
  catches everything and both callbacks are guarded, so it genuinely never
  rejects. If someone later adds an unguarded hook, `void` silently becomes an
  unhandled-rejection site again — that is the invariant Step 1's cases 5-7
  protect. A reviewer should check any new hook is inside `runGuarded`.
- **The replay offsets are approximate and now say so in one place.**
  `lifecycleResetEvents` (`apps/server/src/orchestration/decider.ts:675-697`)
  makes a turn start emit 2, 3 or 4 events depending on whether the thread was
  settled or snoozed, so `- 2` can open the window too narrowly. The snapshot
  half of `syncThreadProjectionAfterDispatch` is what covers it today.
  **Deliberately not fixed here** — deriving the true count means the server
  returning it, which is a contract change, not a refactor. If the sync ever
  starts dropping events after a settled thread wakes, this is the first place
  to look.
- **Five `elapsedMs` copies survive** — four outside `features/chat/`
  (`lib/client-logging.ts`, `lib/file-server.ts`, `components/use-pick-entry.tsx`,
  `features/search/search-providers.ts`) and one inside it, in
  `features/chat/transport/orchestration-rpc-client.ts`. A repo-wide home
  belongs to plan 043 (`lib/` membership rule). Deliberately deferred.
- **Two dispatch sites still hand-roll their own handling**:
  `chat-mode/hooks/use-project-retry.ts` (dialect B, `chat.project.retry`) and
  `chat/hooks/use-workspace-chat-project.ts` (no telemetry). Both dispatch
  `project.create`, whose failure drives a retry state machine rather than the
  chat command path, and whose useful context (`rootPath`) `chatCommandSummary`
  does not carry. Folding them in means extending the summary for
  project-lifecycle commands — worth doing, but as its own change with its own
  test for the retry banner. **So "every dispatch, one shape" is true of the
  chat command path only.**
- **File placement warning.** `features/chat/lib/` is collapsed into
  `features/chat/utils/` by plan 011, and `features/chat/` is reorganized by
  plans 009/012. If any of those land first, put `chat-command-dispatch.ts`
  wherever the new layout spec says — but keep the module boundary; it is the
  point of this plan, not the path.
- **`use-session-actions.ts` still does not toast on failure**, by decision.
  `archiveSessions` loops over a multi-selection, so a per-command toast would
  fire N times, and the failure is already visible (the row stays put because
  the projection never changed). If someone wants that feedback, the right shape
  is one summary toast after the loop, not `onFailed` per command.
- **What a reviewer should scrutinize**: (1) that no `useMemo` / `useCallback`
  dependency array changed anywhere in the diff; (2) that each rewritten site
  kept its original `action` string; (3) that `onAccepted` is never used for
  rollback and `onFailed` never for host work; (4) that the seven decision
  comments quoted in the steps survived the rewrite — they explain rollback
  choices that are not re-derivable from the code.
