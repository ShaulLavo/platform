# Plan 031: Type `runtimePayload` instead of sniffing it in five places

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat ace313f..HEAD -- apps/server/src/provider apps/server/src/orchestration/provider-command-reactor.ts apps/server/src/orchestration/checkpoint-reactor.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: api-design
- **Planned at**: commit `ace313f`, 2026-08-16

Closes an instance of **cross-cutting theme T2** from `plans/README.md`: _typed
contracts that stop being typed exactly where the consumer needs them._

## Why this matters

`runtimePayload` is the value that decides whether a **live child process is
reused or torn down**. `canReuseProviderBinding()` compares the stored payload's
`cwd`, `runtimeMode` and `modelSelection` against the incoming request; if they
match, the running `codex app-server` / Claude SDK child keeps serving the
thread. That value is typed `unknown | null` at the persistence boundary, so
every comparison goes through a hand-written sniffer.

The concrete failure mode: **a typo in a payload key is silent.** Write
`modelSelction` instead of `modelSelection` at any of the six upsert sites and
nothing complains — not the compiler, not a test, not a log line. The key lands
in the JSON column, `canReuseProviderBinding` reads `payload.modelSelection`,
gets `undefined`, `modelSelectionsEqual(undefined, …)` returns `false`, and the
running agent process is torn down and restarted on every single turn. The user
sees a slower app; nobody sees a bug.

That is not hypothetical drift — it has **already happened, benignly**:
`ProviderSessionRuntimePayload` (provider-service.ts:61-69) declares seven
fields, and three code paths write an eighth, `providerThreadId`, that the type
has never heard of and nothing ever reads back.

After this plan, the payload is parsed once by a valibot schema at the moment it
leaves SQLite, every reader downstream is typed, and a mistyped key is a
compile error. Deleted along the way: four ad-hoc validators, three duplicated
`isRecord` copies, and both `createInternalError` throws on the turn-start path.

## Current state

### The files

| File                                                                    | Role                                                                                                    |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `apps/server/src/provider/provider-service.ts` (854 lines)              | Owns `ProviderSessionRuntimePayload`, `ensureSession`, `canReuseProviderBinding`, and all five sniffers |
| `apps/server/src/provider/provider-session-directory.ts` (385 lines)    | SQLite persistence for `provider_session_runtime`; erases the payload type on the way in and out        |
| `apps/server/src/orchestration/provider-command-reactor.ts` (973 lines) | Builds the payload from the thread/project context; sniffs `cwd` back out for checkpoint reverts        |
| `apps/server/src/orchestration/checkpoint-reactor.ts`                   | Sniffs `cwd` back out to pick the git workspace path                                                    |
| `apps/server/src/db/schema.ts:293-317`                                  | The `provider_session_runtime` table — one `runtime_payload_json` text column                           |

### The declared type that never survives persistence

`apps/server/src/provider/provider-service.ts:61-69`:

```ts
export type ProviderSessionRuntimePayload = {
  activeTurnId?: TurnId | null
  cwd?: string
  interactionMode?: InteractionMode
  lastError?: string | null
  lastRuntimeEvent?: string
  modelSelection?: ModelSelection
  runtimeMode?: RuntimeMode
}
```

`apps/server/src/provider/provider-session-directory.ts:44-67` erases it on both
sides of the boundary:

```ts
export type ProviderRuntimeBinding = {
  adapterKey?: string
  providerDriverKind: ProviderDriverKind
  providerInstanceId?: ProviderInstanceId
  providerSessionId?: string | null
  resumeCursor?: unknown | null
  runtimeMode?: RuntimeMode
  runtimePayload?: unknown | null // <- line 51
  status?: ProviderRuntimeBindingStatus
  threadId: ThreadId
}

export type ProviderRuntimeBindingWithMetadata = {
  // …
  runtimePayload: unknown | null // <- line 64
  // …
}
```

`provider-session-directory.ts:318-333` hydrates it with a bare `JSON.parse`, no
schema:

```ts
function rowToBinding(row: ProviderSessionRuntimeRow): ProviderRuntimeBindingWithMetadata {
  const providerDriverKind = v.parse(providerDriverKindSchema, row.providerDriverKind)

  return {
    adapterKey: row.adapterKey,
    lastSeenAt: row.lastSeenAt,
    providerDriverKind,
    providerInstanceId: v.parse(providerInstanceIdSchema, row.providerInstanceId),
    providerSessionId: row.providerSessionId,
    resumeCursor: parseNullableJson(row.resumeCursorJson),
    runtimeMode: v.parse(runtimeModeSchema, row.runtimeMode),
    runtimePayload: parseNullableJson(row.runtimePayloadJson), // <- line 329, untyped
    status: parseRuntimeStatus(row.status),
    threadId: v.parse(threadIdSchema, row.threadId),
  }
}
```

Note every _other_ field on that row goes through a valibot schema. The payload
is the one that does not.

`provider-session-directory.ts:349-354` — blind spread merge:

```ts
function mergeRuntimePayload(existing: unknown | null, next: unknown | null | undefined) {
  if (next === undefined) return existing ?? null
  if (isRecord(existing) && isRecord(next)) return { ...existing, ...next }

  return next
}
```

`provider-session-directory.ts:383-385` — `isRecord` copy #1:

```ts
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
```

### The five sniffers in `provider-service.ts`

Lines 805-832:

```ts
function runtimePayloadRecord(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value

  return {}
}

function modelSelectionsEqual(left: unknown, right: ModelSelection | undefined) {
  if (!right) return false
  if (!isModelSelectionLike(left)) return false
  if (left.providerInstanceId !== right.providerInstanceId) return false
  if (left.model !== right.model) return false

  return jsonEqual(left.options ?? null, right.options ?? null)
}

function isModelSelectionLike(value: unknown): value is ModelSelection {
  if (!isRecord(value)) return false
  if (typeof value.providerInstanceId !== 'string') return false

  return typeof value.model === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  // copy #2
  if (value === null) return false
  if (typeof value !== 'object') return false

  return !Array.isArray(value)
}
```

Line 629-633:

```ts
function interactionModeFromPayload(value: unknown): InteractionMode | undefined {
  if (value === 'default' || value === 'plan') return value

  return undefined
}
```

### The two throws that a type makes unrepresentable

`provider-service.ts:597-621`:

```ts
function providerSessionStartInput(
  input: ProviderStartSessionInput | ProviderEnsureSessionInput,
  payload: Record<string, unknown>,
  reusableBinding?: ProviderRuntimeBindingWithMetadata | null,
): ProviderSessionStartInput {
  const cwd = payload.cwd
  if (typeof cwd !== 'string' || cwd.trim().length === 0) {
    throw createInternalError(`Provider session ${input.threadId} is missing a cwd.`)
  }

  const modelSelection = payload.modelSelection
  if (!isModelSelectionLike(modelSelection)) {
    throw createInternalError(`Provider session ${input.threadId} is missing a model selection.`)
  }

  return {
    cwd,
    interactionMode: interactionModeFromPayload(payload.interactionMode),
    modelSelection,
    providerInstanceId: input.providerInstanceId,
    resumeCursor: reusableBinding?.resumeCursor ?? startInputResumeCursor(input),
    runtimeMode: input.runtimeMode,
    threadId: input.threadId,
  }
}
```

### The consumer whose correctness rests on all of it

`provider-service.ts:786-803`:

```ts
function canReuseProviderBinding(
  binding: ProviderRuntimeBindingWithMetadata | null,
  input: ProviderEnsureSessionInput,
  adapter: ReturnType<ProviderAdapterRegistry['getByInstance']>,
) {
  if (!binding) return false
  if (!isActiveBinding(binding)) return false
  if (binding.adapterKey !== adapter.adapterKey) return false
  if (binding.providerDriverKind !== adapter.driverKind) return false
  if (binding.providerInstanceId !== input.providerInstanceId) return false
  if (binding.runtimeMode !== input.runtimeMode) return false

  const payload = runtimePayloadRecord(binding.runtimePayload)
  if (payload.cwd !== input.runtimePayload.cwd) return false
  if (payload.runtimeMode && payload.runtimeMode !== input.runtimeMode) return false

  return modelSelectionsEqual(payload.modelSelection, input.runtimePayload.modelSelection)
}
```

And `provider-service.ts:586-595`:

```ts
function bindingModelChanged(
  binding: ProviderRuntimeBindingWithMetadata | null,
  modelSelection: ModelSelection | undefined,
) {
  if (!binding) return false

  const payload = runtimePayloadRecord(binding.runtimePayload)

  return !modelSelectionsEqual(payload.modelSelection, modelSelection)
}
```

### The two `cwd` sniffers outside the provider folder

`apps/server/src/orchestration/provider-command-reactor.ts:839-855` (`isRecord`
copy #3), reached from line 700-703:

```ts
function workspacePathForCheckpointRevert(input: {
  fallbackWorkspacePath: string
  providerPayload: unknown
}) {
  if (!isRecord(input.providerPayload)) return input.fallbackWorkspacePath

  return typeof input.providerPayload.cwd === 'string'
    ? input.providerPayload.cwd
    : input.fallbackWorkspacePath
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null) return false
  if (typeof value !== 'object') return false

  return !Array.isArray(value)
}
```

`apps/server/src/orchestration/checkpoint-reactor.ts:289-299` and `338-343`
(`isRecord` copy #4 — there are **four** local copies in total, not three):

```ts
  /**
   * The running session's cwd wins: an agent may have been launched against a
   * worktree the thread row does not know about yet, and checkpointing the
   * wrong tree is worse than not checkpointing at all.
   */
  private workspacePathForThread(thread: OrchestrationProjectedThread, workspaceRoot: string) {
    const payload = this.providerService.bindingForThread(thread.id)?.runtimePayload
    if (isRecord(payload) && typeof payload.cwd === 'string') return payload.cwd

    return thread.worktreePath ?? workspaceRoot
  }
```

### The producer

`provider-command-reactor.ts:790-802` — the one place a _complete_ payload is
built, and it is already fully typed:

```ts
function runtimePayloadFromSessionContext(
  context: ProviderSessionContext,
  turnId: TurnId | null,
): ProviderSessionRuntimePayload {
  return {
    activeTurnId: turnId,
    cwd: context.thread.worktreePath ?? context.project.workspaceRoot,
    interactionMode: context.interactionMode,
    lastError: null,
    modelSelection: context.modelSelection,
    runtimeMode: context.runtimeMode,
  }
}
```

### The six _patch_ writes (partial payloads — this is why the merge exists)

- `provider-service.ts:147-150` — `{ ...runtimePayloadRecord(input.runtimePayload), providerThreadId: session.providerThreadId ?? null }`
- `provider-service.ts:208-211` — `{ ...input.runtimePayload, providerThreadId: session.providerThreadId ?? null }`
- `provider-service.ts:270` — `runtimePayload: { activeTurnId: null }`
- `provider-service.ts:292` — `runtimePayload: { activeTurnId: null }`
- `provider-service.ts:490` — `runtimePayload: { activeTurnId: null, lastError: providerErrorMessage(error) }`
- `provider-service.ts:515-520` — `{ activeTurnId, lastError, lastRuntimeEvent: event.type, providerThreadId }`

`providerThreadId` appears at three of them and in **no type**. Nothing anywhere
reads `payload.providerThreadId` back (verified: `grep -rn "providerThreadId"
apps/server/src` has no read site against a payload).

### Conventions this plan must honor

From `AGENTS.md`, quoted verbatim because the executor has not read it:

- _"This project is greenfield and not live: no releases, no external users, no data anyone needs migrated."_
- _"No backward compatibility shims, no legacy aliases, no deprecation windows. Update every call site in the same pass."_
- _"When a bug fix invalidates state the buggy code already persisted (localStorage, caches, on-disk files), do not write healing or migration code. Delete the bad state, or tell the user what to delete."_
- _"Never throw `new Error`. Create errors with `createError` from `evlog` — in practice through the feature's `structured-errors.ts` wrapper (`createStructuredError` or a `defineErrorCatalog` entry) so the error carries `code`, `status`, `why`, and `fix`."_
- _"Logging is wide-event style (evlog). Always prefer wide logs: enrich the one event per operation/request with more fields instead of emitting extra narrow log lines."_
- _"Remove duplicate code aggressively."_
- _"Do not repeat the folder name in file or symbol names."_
- _"Do not add barrel `index.ts` files."_
- _"Use guard clauses and early returns. Keep the happy path shallow." / "Never use nested ternaries."_
- _"Do not `mock.module` or `vi.mock` our server, client, or feature modules."_
- _"A dev server is always running. Never spin up your own server to test or verify changes — reuse the running one."_

TypeScript settings that will bite you (`apps/server/tsconfig.json`):
`"verbatimModuleSyntax": true` (type-only imports **must** use `import type`),
`"noUnusedLocals": true` and `"noUnusedParameters": true` (a helper you stop
calling but forget to delete is a typecheck failure — use that as your gate).

Canonical `isRecord` already exists at `packages/contracts/src/is-record.ts` and
is exported from `@workspace/contracts` (`packages/contracts/src/index.ts:97`).
Do not add a fifth copy; after this plan the provider/orchestration code needs
none at all.

## The design decision, and the alternative that was rejected

The finding offered two shapes. Both are stated here so a reviewer can check the
call.

**Option A — one JSON column, parsed once by valibot at `rowToBinding`. ← CHOSEN.**

**Option B — promote the payload fields to real columns on
`provider_session_runtime`.** Rejected, for four reasons:

1. **The merge is _patch_ semantics and SQL cannot express it.** Six call sites
   upsert partial payloads (`{ activeTurnId: null }`) and expect `cwd` and
   `modelSelection` to survive — that is exactly what `mergeRuntimePayload` and
   the existing directory test assert. With real columns, `onConflictDoUpdate`'s
   `set` would need `coalesce(excluded.col, table.col)` per column to preserve
   absent fields — and that _also_ stops `activeTurnId: null` from clearing the
   value, which `interruptTurn`, `stopSession` and `markTurnFailed` do on
   purpose. Distinguishing "absent" from "explicitly null" would mean building
   the `set` object dynamically per call: the TypeScript merge, reimplemented in
   SQL, worse.
2. **`modelSelection` stays JSON either way.** It is a nested object whose
   `options` bag is a `v.looseObject` (`packages/contracts/src/orchestration-runtime.ts:27-35`),
   deliberately open so adapters can read their own keys. Option B is at best
   six columns _plus_ a JSON column.
3. **It costs a migration for zero extra type safety.** `apps/server/src/db/migrations.ts:14-37`
   is a forward-only ledger — _"never edit or renumber an existing one"_ — so
   Option B needs a version 9 with seven `ALTER TABLE ADD COLUMN`s and a
   backfill. Option A gets 100% of the compile-time win with none of that.
4. **Nothing queries the payload in SQL.** The only SQL predicates on this table
   are on `status` and `last_seen_at` (`listIdleSince`, directory lines 184-197).
   The one thing Option B would buy — `WHERE cwd = ?` — has no caller.

Option A's honest cost: the payload stays opaque to SQL, so if a future feature
needs to query sessions by cwd or model it will have to revisit this. Say so in
the PR description.

## Commands you will need

| Purpose                  | Command                                                                                                             | Expected on success                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Typecheck (server)       | `cd /Users/shaul/Desktop/D/platform/apps/server && bun run typecheck`                                               | exit 0, no output                         |
| Lint (server)            | `cd /Users/shaul/Desktop/D/platform/apps/server && bun run lint`                                                    | exit 0, "Found 0 warnings and 0 errors"   |
| Format check (server)    | `cd /Users/shaul/Desktop/D/platform/apps/server && bun run format:check`                                            | exit 0                                    |
| Format (server)          | `cd /Users/shaul/Desktop/D/platform/apps/server && bun run format`                                                  | rewrites files; run before `format:check` |
| Targeted tests           | `cd /Users/shaul/Desktop/D/platform/apps/server && bun --bun vitest run src/provider/tests src/orchestration/tests` | all pass                                  |
| Full server suite        | `cd /Users/shaul/Desktop/D/platform/apps/server && bun run test`                                                    | all pass                                  |
| Root verify (final gate) | `cd /Users/shaul/Desktop/D/platform && bun run verify`                                                              | exit 0                                    |

Notes:

- The `--bun` flag is mandatory. Without it `bun:sqlite` does not resolve and
  every test in this area fails at import.
- Known repo issue (owned by plan 013, **not** this plan): running the _full_
  `apps/server` suite can open and WAL-lock the developer's real
  `~/.platform/fs-metadata.sqlite`. The targeted command above only runs
  provider/orchestration tests, all of which inject `:memory:` databases.
  `bun run verify` at the root _does_ run the full suite. If it fails on
  fs-metadata/SQLite locking or on a test that never mentions `runtimePayload`,
  that is the known pre-existing issue: record the failing test names in your
  report and treat the targeted command plus typecheck/lint/format as the gate.
  Do **not** try to fix it here.
- A dev server is already running at `http://localhost:5173`. Do not start one.
  This change is server-internal with no UI surface, so no browser verification
  step is required.

## Scope

**In scope** (the only files you should modify):

- `apps/server/src/provider/session-payload.ts` — **create**
- `apps/server/src/provider/provider-session-directory.ts`
- `apps/server/src/provider/provider-service.ts`
- `apps/server/src/orchestration/provider-command-reactor.ts`
- `apps/server/src/orchestration/checkpoint-reactor.ts`
- `apps/server/src/provider/tests/provider-session-directory.test.ts`
- `apps/server/src/provider/tests/provider-service.test.ts` — _only if typecheck
  demands it_; it is expected to compile unchanged
- `plans/README.md` — the status row for plan 031 only (see executor
  instructions at the top). Nothing else in that file.

**Out of scope** (do NOT touch, even though they look related):

- `apps/server/src/db/schema.ts` and `apps/server/src/db/migrations.ts` — Option
  B was rejected above; the column stays `runtime_payload_json TEXT`. No
  migration is needed and adding one is a regression against this plan's
  rationale.
- `resumeCursor` (`ProviderRuntimeBinding.resumeCursor?: unknown | null`) — it is
  genuinely opaque: each adapter mints its own cursor format (Codex stores a
  provider thread id, others differ). Typing it needs a per-driver discriminated
  union, which is a different plan.
- `ProviderService.startSession()` (provider-service.ts:129-159) — it has **no
  production caller**; the only caller in the repo is
  `provider-service.test.ts:175`. Retype its input like everything else, but do
  **not** delete it here; dead-surface removal is plan 022's job and deleting it
  mid-refactor would confuse that plan's inventory.
- The other ~90 `isRecord` call sites across `lsp/`, `terminal/`, `settings/`,
  `observability/` — they already import the canonical one from
  `@workspace/contracts`. Only the four local copies named in this plan go.
- Anything under `packages/editor-*` — those are symlinks to a separate
  repository checkout and are never in scope.
- `apps/web` — the payload never crosses the HTTP boundary. `listSessions()` and
  `bindingForThread()` have server-only callers (verified: `grep -rn
"listSessions\|bindingForThread" apps/server/src apps/web/src` returns only
  provider-service, `provider-command-reactor.ts:702`,
  `checkpoint-reactor.ts:295`, `thread-deletion-reactor.ts:101` and tests).
- `apps/server/src/orchestration/thread-deletion-reactor.ts` — it calls
  `bindingForThread` but never touches `.runtimePayload`, so nothing about it
  changes. If it shows a typecheck error, something in step 3 is wrong.
- **The three `providerThreadId` writes** (provider-service.ts:149, 210, 519).
  They stay. The field is added to the schema precisely so they keep working;
  deleting them is plan 022's job and doing it here makes the diff untestable.
- `jsonEqual` in provider-service.ts:834 — do **not** swap it for a contracts
  helper. It is `JSON.stringify` equality, so it is key-order sensitive;
  replacing it changes when a session is reused.
- Do not run `bun run format` from the **repo root**. It fans out to every
  workspace (`bun run --filter '*' format`) and rewrites unrelated files,
  including symlinked editor packages. Format only inside `apps/server`.

## Git workflow

- **All work happens on `main`** — no new branches, worktrees, commits, pushes,
  or PRs unless the operator explicitly asks.
- If the operator does ask for a commit: conventional commits, lowercase
  descriptive subject. Real examples from `git log`:
  - `refactor(orchestration): the server prepares a session's worktree (M-C)`
  - `fix(address): bound the URL, and stop escaping slashes in ?tabs=`
  - A fitting subject here: `refactor(provider): parse the session runtime payload once`

## Steps

### Step 1: Add the schema module

Create `apps/server/src/provider/session-payload.ts`. (Filename deliberately
omits the `provider-` prefix: _"Do not repeat the folder name in file or symbol
names."_)

```ts
import * as v from 'valibot'
import {
  interactionModeSchema,
  modelSelectionSchema,
  runtimeModeSchema,
  turnIdSchema,
  type ModelSelection,
} from '@workspace/contracts'

/**
 * Everything a provider session remembers about itself between turns, stored as
 * one JSON column (`provider_session_runtime.runtime_payload_json`).
 *
 * Parsed exactly once, on the way out of SQLite in `rowToBinding`. That is what
 * makes `canReuseProviderBinding` — the predicate deciding whether a live child
 * process is reused or torn down — a typed comparison instead of a key sniff.
 * `v.object` drops unknown entries, so a mistyped key cannot survive a round
 * trip and quietly cost a session restart.
 *
 * Every field is optional because the six upsert sites write *patches*:
 * `{ activeTurnId: null }` must not erase `cwd`. Session start needs more than
 * that, and says so through `ProviderSessionStartPayload`.
 */
export const providerSessionRuntimePayloadSchema = v.object({
  activeTurnId: v.optional(v.nullable(turnIdSchema)),
  // Non-empty by construction: every producer derives it from
  // `thread.worktreePath ?? project.workspaceRoot`, both of which are
  // `trimmedNonEmptyStringSchema` in contracts. Asserting it here is what lets
  // the checkpoint reactors treat `payload.cwd` as a usable git path.
  cwd: v.optional(v.pipe(v.string(), v.minLength(1))),
  interactionMode: v.optional(interactionModeSchema),
  lastError: v.optional(v.nullable(v.string())),
  lastRuntimeEvent: v.optional(v.string()),
  modelSelection: v.optional(modelSelectionSchema),
  /**
   * Write-only today: three call sites in `ProviderService` record the
   * provider's own conversation id and nothing reads it back. Declared anyway
   * because those writes exist — leaving it out of the schema would silently
   * discard data on every round trip, which is the exact failure this module
   * exists to prevent.
   */
  providerThreadId: v.optional(v.nullable(v.string())),
  runtimeMode: v.optional(runtimeModeSchema),
})

export type ProviderSessionRuntimePayload = v.InferOutput<
  typeof providerSessionRuntimePayloadSchema
>

/**
 * The payload a session *start* requires. `cwd` and `modelSelection` are
 * mandatory here because `providerSessionStartInput` needs both and used to
 * re-derive them from an `unknown` blob, throwing an internal error when they
 * were missing. Requiring them at the one boundary that needs them makes that
 * failure unrepresentable.
 */
export type ProviderSessionStartPayload = ProviderSessionRuntimePayload & {
  cwd: string
  modelSelection: ModelSelection
}
```

**Verify**: `cd /Users/shaul/Desktop/D/platform/apps/server && bun run typecheck`
→ exit 0. (The new file compiles standalone; nothing imports it yet.)

### Step 2: Type the persistence boundary

Edit `apps/server/src/provider/provider-session-directory.ts`.

1. Add to the imports at the top:
   ```ts
   import {
     providerSessionRuntimePayloadSchema,
     type ProviderSessionRuntimePayload,
   } from './session-payload'
   ```
2. Line 51: `runtimePayload?: unknown | null` → `runtimePayload?: ProviderSessionRuntimePayload | null`
3. Line 64: `runtimePayload: unknown | null` → `runtimePayload: ProviderSessionRuntimePayload | null`
4. Line 257 in `resolveBindingForWrite`: replace
   `const existingRuntimePayload = parseNullableJson(existing?.runtimePayloadJson)`
   with
   `const existingRuntimePayload = parseRuntimePayload(existing?.runtimePayloadJson, binding.threadId)`
5. Line 329 in `rowToBinding`: replace
   `runtimePayload: parseNullableJson(row.runtimePayloadJson),`
   with
   `runtimePayload: parseRuntimePayload(row.runtimePayloadJson, row.threadId),`
6. Replace `mergeRuntimePayload` (lines 349-354) with the typed version:

   ```ts
   function mergeRuntimePayload(
     existing: ProviderSessionRuntimePayload | null,
     next: ProviderSessionRuntimePayload | null | undefined,
   ): ProviderSessionRuntimePayload | null {
     if (next === undefined) return existing
     if (next === null) return null
     if (!existing) return next

     return { ...existing, ...next }
   }
   ```

   (Behaviour preserved exactly: absent patch keeps the old payload, explicit
   `null` clears it, a patch merges over the existing record.)

7. Add the parse helper next to `parseNullableJson`:

   ```ts
   /**
    * The one place the payload is validated. A row that fails the schema is a
    * row our own writer could not have produced — a stale developer database,
    * or a hand-edited one. It degrades to "no payload", which is what every
    * reader already handles, and it says so loudly rather than making the next
    * session reuse fail for no visible reason. (Syntactically broken JSON still
    * throws out of `parseNullableJson`, exactly as it did before.)
    */
   function parseRuntimePayload(
     value: string | null | undefined,
     threadId: string,
   ): ProviderSessionRuntimePayload | null {
     const parsed = parseNullableJson(value)
     if (parsed === null) return null

     const result = v.safeParse(providerSessionRuntimePayloadSchema, parsed)
     if (result.success) return result.output

     recordChatPipelineWarning('chat.pipeline.provider_session_directory.runtime_payload.invalid', {
       issues: result.issues.map((issue) => issue.message),
       threadId,
     })

     return null
   }
   ```

8. Delete `isRecord` (lines 383-385). `noUnusedLocals` will tell you if you
   missed a caller.

Keep `parseNullableJson`; `resolveResumeCursor` still uses it.

On the logging rule: this is the only new event, it fires only on the error
path, and the happy path emits nothing extra — the wide-event rule targets
narrow lines added alongside a normal operation, which this is not.

**Verify**: `cd /Users/shaul/Desktop/D/platform/apps/server && bun run typecheck`
→ **expected to fail** with errors in `provider-service.ts` (its
`runtimePayload: unknown` sites no longer match) and possibly the reactors. That
is the point of this step — the type now propagates. Proceed to step 3.

### Step 3: Delete the sniffers in `provider-service.ts`

Edit `apps/server/src/provider/provider-service.ts`.

1. **Delete** the local `ProviderSessionRuntimePayload` type (lines 61-69) and
   import both types instead:

   ```ts
   import type {
     ProviderSessionRuntimePayload,
     ProviderSessionStartPayload,
   } from './session-payload'
   ```

   Re-export nothing — `provider-command-reactor.ts` will be repointed in step 4.

   Then **delete `InteractionMode` (line 4) and `TurnId` (line 10) from the
   `@workspace/contracts` type-import block**. Verified at `ace313f`: their only
   uses in this file are lines 62 and 64 (inside the type you just deleted) and
   line 629 (`interactionModeFromPayload`, deleted in item 8). Everything else
   that greps as `TurnId` is the substring inside `activeTurnId`. Leaving them
   imported is a `noUnusedLocals` typecheck failure. Keep `ModelSelection` — it
   is still used by `bindingModelChanged` and `modelSelectionsEqual`.

2. Line 56 (`ProviderStartSessionInput`): `runtimePayload?: unknown | null` →
   `runtimePayload: ProviderSessionStartPayload`. It is required now — the one
   caller (`provider-service.test.ts:175`) already passes a complete payload.
3. Line 74 (`ProviderEnsureSessionInput`): `runtimePayload: ProviderSessionRuntimePayload`
   → `runtimePayload: ProviderSessionStartPayload`.
4. Line 138: `providerSessionStartInput(input, runtimePayloadRecord(input.runtimePayload))`
   → `providerSessionStartInput(input, input.runtimePayload)`.
5. Lines 147-150: `{ ...runtimePayloadRecord(input.runtimePayload), providerThreadId: … }`
   → `{ ...input.runtimePayload, providerThreadId: session.providerThreadId ?? null }`.
6. Line 199: `providerSessionStartInput(input, runtimePayloadRecord(input.runtimePayload), continuation)`
   → `providerSessionStartInput(input, input.runtimePayload, continuation)`.
7. Rewrite `providerSessionStartInput` (lines 597-621) with **both throws gone**:
   ```ts
   function providerSessionStartInput(
     input: ProviderStartSessionInput | ProviderEnsureSessionInput,
     payload: ProviderSessionStartPayload,
     reusableBinding?: ProviderRuntimeBindingWithMetadata | null,
   ): ProviderSessionStartInput {
     return {
       cwd: payload.cwd,
       interactionMode: payload.interactionMode,
       modelSelection: payload.modelSelection,
       providerInstanceId: input.providerInstanceId,
       resumeCursor: reusableBinding?.resumeCursor ?? startInputResumeCursor(input),
       runtimeMode: input.runtimeMode,
       threadId: input.threadId,
     }
   }
   ```
8. **Delete** `interactionModeFromPayload` (lines 629-633).
9. Retype `bindingModelChanged` (lines 586-595):

   ```ts
   function bindingModelChanged(
     binding: ProviderRuntimeBindingWithMetadata | null,
     modelSelection: ModelSelection | undefined,
   ) {
     if (!binding) return false

     return !modelSelectionsEqual(binding.runtimePayload?.modelSelection, modelSelection)
   }
   ```

10. Retype the payload reads in `canReuseProviderBinding` (lines 798-802):

    ```ts
    const payload = binding.runtimePayload
    if (payload?.cwd !== input.runtimePayload.cwd) return false
    if (payload?.runtimeMode && payload.runtimeMode !== input.runtimeMode) return false

    return modelSelectionsEqual(payload?.modelSelection, input.runtimePayload.modelSelection)
    ```

    Behaviour is identical to today: `runtimePayloadRecord(null)` returned `{}`,
    whose `.cwd` was `undefined`, so a null payload already failed the first
    comparison.

11. Retype `modelSelectionsEqual` and **delete** `runtimePayloadRecord`,
    `isModelSelectionLike` and `isRecord`:

    ```ts
    function modelSelectionsEqual(
      left: ModelSelection | undefined,
      right: ModelSelection | undefined,
    ) {
      if (!left) return false
      if (!right) return false
      if (left.providerInstanceId !== right.providerInstanceId) return false
      if (left.model !== right.model) return false

      return jsonEqual(left.options ?? null, right.options ?? null)
    }
    ```

    Keep the local `jsonEqual` as-is — swapping it for the contracts helper is a
    behaviour change (key-order sensitivity) and is not in scope.

12. Check whether `createInternalError` is still used in this file. It is —
    `rollbackConversation` at line 364 throws it. Keep the import.

**Verify**:

```
cd /Users/shaul/Desktop/D/platform/apps/server && bun run typecheck
```

→ remaining errors should now be confined to `provider-command-reactor.ts` and
`checkpoint-reactor.ts` (the type import moved) plus possibly
`provider-session-directory.test.ts`. Zero errors inside `provider-service.ts`.

### Step 4: Repoint the two reactors and delete their `isRecord` copies

Edit `apps/server/src/orchestration/provider-command-reactor.ts`:

1. Line 21 currently reads:
   ```ts
   import type {
     ProviderService,
     ProviderSessionRuntimePayload,
   } from '../provider/provider-service'
   ```
   Replace it with (both new types are needed — `ProviderSessionStartPayload` in
   item 2, `ProviderSessionRuntimePayload` in item 3):
   ```ts
   import type { ProviderService } from '../provider/provider-service'
   import type {
     ProviderSessionRuntimePayload,
     ProviderSessionStartPayload,
   } from '../provider/session-payload'
   ```
2. Change `runtimePayloadFromSessionContext`'s return type (line 793) from
   `ProviderSessionRuntimePayload` to `ProviderSessionStartPayload`. Its body
   already supplies `cwd` and `modelSelection`, so no other change is needed.
3. Replace `workspacePathForCheckpointRevert` (lines 839-847):
   ```ts
   function workspacePathForCheckpointRevert(input: {
     fallbackWorkspacePath: string
     providerPayload: ProviderSessionRuntimePayload | null | undefined
   }) {
     return input.providerPayload?.cwd ?? input.fallbackWorkspacePath
   }
   ```
   The `| undefined` is load-bearing: the only caller (line 700-703) passes
   `this.providerService.bindingForThread(thread.id)?.runtimePayload`, which is
   `undefined` when no binding exists.
4. **Delete** `isRecord` (lines 850-855) — no other caller in this file.

Edit `apps/server/src/orchestration/checkpoint-reactor.ts`:

5. Replace the body of `workspacePathForThread` (lines 294-299), keeping the
   doc comment above it verbatim:

   ```ts
   private workspacePathForThread(thread: OrchestrationProjectedThread, workspaceRoot: string) {
     const payload = this.providerService.bindingForThread(thread.id)?.runtimePayload

     return payload?.cwd ?? thread.worktreePath ?? workspaceRoot
   }
   ```

6. **Delete** `isRecord` (lines 338-343) — no other caller in this file.

**Verify**:

```
cd /Users/shaul/Desktop/D/platform/apps/server && bun run typecheck
```

→ exit 0, except possibly `provider-session-directory.test.ts` (step 5).

```
cd /Users/shaul/Desktop/D/platform && grep -rn "function isRecord" apps/server/src/provider apps/server/src/orchestration
```

→ **no matches**.

```
cd /Users/shaul/Desktop/D/platform && grep -rn "runtimePayloadRecord\|isModelSelectionLike\|interactionModeFromPayload" apps/server/src
```

→ **no matches**.

### Step 5: Fix the one test that asserts the untyped behaviour

`apps/server/src/provider/tests/provider-session-directory.test.ts:27` currently
writes a payload key that does not exist — `model: 'gpt-5-codex'` — and line 41
asserts it round-trips:

```ts
      runtimePayload: { cwd: '/workspace', model: 'gpt-5-codex' },
      …
    expect(binding?.runtimePayload).toEqual({
      activeTurnId: 'turn-1',
      cwd: '/workspace',
      model: 'gpt-5-codex',
    })
```

That test is a fossil of exactly the bug this plan removes: `model` is not a
payload field (the real one is `modelSelection`), and today it survives silently.
Update the existing test to use real fields, and **add a second test** that pins
the new guarantee.

First, extend the `@workspace/contracts` import block (lines 5-10) with
`turnIdSchema`, and add `import { eq } from 'drizzle-orm'`. Both are needed
below; the file already imports `* as v`, `drizzle` from
`drizzle-orm/bun-sqlite`, and `* as schema`.

Replace the payload literal at line 27 with:

```ts
      runtimePayload: {
        cwd: '/workspace',
        modelSelection: {
          model: 'gpt-5-codex',
          providerInstanceId: DEFAULT_PROVIDER_INSTANCE_ID,
        },
      },
```

Line 34 also has to change. It currently reads
`runtimePayload: { activeTurnId: 'turn-1' },` — a raw string. `TurnId` is a
**branded** type (`turnIdSchema = v.pipe(trimmedNonEmptyStringSchema,
v.brand('TurnId'))`, `packages/contracts/src/chat-ids.ts:10-17`), so once
`runtimePayload` is typed, a bare `'turn-1'` is a typecheck error. Replace it
with:

```ts
      runtimePayload: { activeTurnId: v.parse(turnIdSchema, 'turn-1') },
```

The assertion below stays a plain string — a branded id is an ordinary string at
runtime and `toEqual`'s expected argument is unconstrained.

Replace the assertion at lines 41-45 with:

```ts
expect(binding?.runtimePayload).toEqual({
  activeTurnId: 'turn-1',
  cwd: '/workspace',
  modelSelection: {
    model: 'gpt-5-codex',
    providerInstanceId: DEFAULT_PROVIDER_INSTANCE_ID,
  },
})
```

Then add a new `it` block in the same `describe`, reusing the file's existing
`createFixture()` helper (do not add a new fixture — _"Do not redefine per-file
factories"_):

```ts
it('drops payload keys that are not part of the runtime payload schema', () => {
  const fixture = createFixture()
  const directory = new ProviderSessionDirectory(fixture.database)
  const threadId = v.parse(threadIdSchema, 'thread-2')

  directory.upsert({
    providerDriverKind: DEFAULT_PROVIDER_DRIVER_KIND,
    providerInstanceId: DEFAULT_PROVIDER_INSTANCE_ID,
    runtimeMode: DEFAULT_RUNTIME_MODE,
    runtimePayload: { cwd: '/workspace' },
    status: 'running',
    threadId,
  })
  // A key nothing declares — what a typo looks like once it reaches SQLite.
  fixture.database
    .update(schema.providerSessionRuntime)
    .set({ runtimePayloadJson: JSON.stringify({ cwd: '/workspace', modelSelction: 'oops' }) })
    .where(eq(schema.providerSessionRuntime.threadId, threadId))
    .run()

  expect(directory.getBinding(threadId)?.runtimePayload).toEqual({ cwd: '/workspace' })
  fixture.close()
})
```

`apps/server/src/provider/tests/provider-service.test.ts`,
`provider-shutdown.test.ts` and
`apps/server/src/orchestration/tests/thread-deletion-reactor.test.ts` are
expected to compile and pass **unchanged** — all three already build payloads out
of `cwd` + `modelSelection` + optional real fields. If one of them fails to
typecheck, that is a signal you got a type wrong; re-read the failure before
editing the test.

**Verify**:

```
cd /Users/shaul/Desktop/D/platform/apps/server && bun --bun vitest run src/provider/tests src/orchestration/tests
```

→ all pass, including the new "drops payload keys" case.

### Step 6: Prove a typo is now a compile error

This is the whole point of the plan, so verify it directly rather than assuming.

1. Temporarily edit `apps/server/src/provider/provider-service.ts:270`,
   changing `runtimePayload: { activeTurnId: null },` to
   `runtimePayload: { activeTurnIdd: null },`.
2. Run `cd /Users/shaul/Desktop/D/platform/apps/server && bun run typecheck`.
   → **expected**: a non-zero exit with an error naming `activeTurnIdd`
   (object-literal excess-property check against `ProviderSessionRuntimePayload`).
3. **Revert the edit** — restore `activeTurnId`. Confirm with
   `cd /Users/shaul/Desktop/D/platform && git diff apps/server/src/provider/provider-service.ts | grep activeTurnIdd`
   → **no output**, and re-run
   `cd /Users/shaul/Desktop/D/platform/apps/server && bun run typecheck`
   → exit 0.

If step 6.2 does _not_ produce an error, the payload type is not reaching that
call site — stop and report, because the plan's central claim is unproven.

### Step 7: Format, lint, full verify

```
cd /Users/shaul/Desktop/D/platform/apps/server && bun run format
cd /Users/shaul/Desktop/D/platform/apps/server && bun run format:check
cd /Users/shaul/Desktop/D/platform/apps/server && bun run lint
cd /Users/shaul/Desktop/D/platform && bun run verify
```

All four exit 0.

## Test plan

- **Modified**: `apps/server/src/provider/tests/provider-session-directory.test.ts`
  — the existing "merges runtime payloads and preserves resume cursors on upsert"
  case stops using the non-existent `model` key and uses `modelSelection`. The
  merge semantics it guards (patch does not erase `cwd`, resume cursor survives)
  are unchanged and remain the regression gate for `mergeRuntimePayload`.
- **New**, same file, modeled structurally on the test directly above it
  (same `createFixture()`, same `directory.upsert` → `directory.getBinding`
  shape): _"drops payload keys that are not part of the runtime payload schema"_ —
  writes an undeclared key straight into the JSON column and asserts it is gone
  after a round trip. This is the read-side half of the guarantee; step 6 proves
  the write-side (compile-time) half.
- **No new tests** for `canReuseProviderBinding`, `providerSessionStartInput` or
  the checkpoint cwd sniffers: those paths are behaviour-preserving and already
  covered. `provider-service.test.ts:23` ("reuses compatible session bindings
  and resets incompatible ones") exercises reuse-on-match, reuse-on-turn-id-patch
  and reset-on-cwd-change — that is the negative gate proving the new schema did
  not start rejecting payloads production writes; `provider-service.test.ts:62`
  ("carries the resume cursor across a mid-conversation model switch") exercises
  the model switch through `bindingModelChanged`; `provider-shutdown.test.ts` drives a real
  child process through `ensureSession`. Adding parallel tests would pad the
  suite without adding a gate.
- The two deleted `createInternalError` throws had no test coverage — they were
  unreachable given the producers (`thread.worktreePath` and
  `project.workspaceRoot` are both `trimmedNonEmptyStringSchema` in
  `packages/contracts/src/chat-model.ts:160` and `:330`, and `modelSelection`
  comes from `ProviderSessionContext` where it is a required `ModelSelection`).
  Nothing to replace.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `cd apps/server && bun run typecheck` exits 0
- [ ] `cd apps/server && bun run lint` exits 0
- [ ] `cd apps/server && bun run format:check` exits 0
- [ ] `cd apps/server && bun --bun vitest run src/provider/tests src/orchestration/tests` — all pass, including the new "drops payload keys" test
- [ ] `bun run verify` from the repo root exits 0
- [ ] `grep -rn "function isRecord" apps/server/src/provider apps/server/src/orchestration` → no matches
- [ ] `grep -rn "runtimePayloadRecord\|isModelSelectionLike\|interactionModeFromPayload" apps/server/src` → no matches
- [ ] `grep -rn "runtimePayload.*unknown" apps/server/src` → no matches
- [ ] `grep -rn "is missing a cwd\|is missing a model selection" apps/server/src` → no matches
- [ ] Step 6 produced a compile error for the deliberately typo'd key, and the typo was reverted
- [ ] No files outside the in-scope list are modified (`git status --porcelain`)
- [ ] `plans/README.md` row for plan 031 updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" does not match the excerpts —
  the codebase has drifted since this plan was written.
- Step 6's deliberate typo does **not** cause a typecheck failure. The plan's
  headline claim is that a mistyped payload key becomes a compile error; if it
  does not, the type is not reaching the upsert call sites and the design needs
  a rethink before anything ships.
- Making the change appears to require a database migration or a `schema.ts`
  edit. It does not — the column shape is unchanged. If you believe otherwise,
  you have drifted into rejected Option B.
- `provider-service.test.ts`, `provider-shutdown.test.ts` or
  `thread-deletion-reactor.test.ts` fail to **typecheck**. They are expected to
  compile unchanged; a failure there means one of the new types is wrong (most
  likely `ProviderSessionStartPayload` requiring a field a producer does not
  supply). Report the error rather than loosening the type to make it go away.
- Any test that passed before now fails at **runtime** with a payload-related
  assertion other than the one you deliberately changed in step 5. That would
  mean the valibot schema is rejecting a shape production actually writes —
  report the failing payload rather than widening the schema to `v.looseObject`.
- You find a read site for `payload.providerThreadId` anywhere. This plan assumes
  it is write-only; if it is read, the field's nullability needs a second look.
- The new "drops payload keys" test **fails** — the undeclared key survives the
  round trip. That means the schema is not stripping (a `v.looseObject` crept in,
  or `parseRuntimePayload` is not on the read path). Report it; do not delete the
  test.
- Any step's verification command fails twice after one reasonable fix attempt.
  Report the exact command and its output rather than trying a third shape.

## Maintenance notes

For whoever owns this code next:

- **What a reviewer should scrutinize**: (1) `mergeRuntimePayload`'s three-way
  behaviour — `undefined` keeps, `null` clears, object merges. Getting `null` vs
  `undefined` backwards silently wipes `cwd` on the next interrupt and restarts
  every session. (2) That `canReuseProviderBinding`'s `payload?.cwd !==
input.runtimePayload.cwd` still returns `false` for a null payload, matching
  the old `runtimePayloadRecord(null) → {}` behaviour.
- **Adding a payload field**: add it to `providerSessionRuntimePayloadSchema` in
  `apps/server/src/provider/session-payload.ts` and nowhere else. If you forget,
  the write site is a compile error — which is the entire point. Do **not** reach
  for `v.looseObject` to make an unknown key pass; that reintroduces exactly the
  silent-typo failure this plan removed.
- **Stale developer databases**: a `~/.platform/fs-metadata.sqlite` written
  before this change may contain payloads with keys the schema drops (`model`,
  from the old test's shape). They are dropped silently at read time, which is
  correct and matches _"Delete the bad state, or tell the user what to delete."_
  No healing code. If a session refuses to be reused after this lands, delete the
  file and restart.
- **Deliberately deferred**:
  - `providerThreadId` is kept in the schema but is still write-only, and for the
    Codex adapter it duplicates `resumeCursor` (`adapters/codex.ts:480` sets the
    cursor to the same provider thread id). Deleting the three writes is a clean
    follow-up but belongs with plan 022's dead-surface sweep, not here.
  - `resumeCursor` remains `unknown | null` — see the out-of-scope note.
  - `ProviderService.startSession()` has no production caller; plan 022 owns that
    call.
  - The payload is still opaque to SQL. If a future feature needs
    `WHERE cwd = ?` or `WHERE model = ?` over `provider_session_runtime`,
    revisit rejected Option B — and note it will have to solve the
    absent-vs-explicit-null merge problem documented above.
- **Schema failure is all-or-nothing**: `cwd` is `v.pipe(v.string(),
v.minLength(1))`, so a row whose `cwd` is `''` or a number drops the _whole_
  payload, not just that field. No producer can write such a row (both sources
  are `trimmedNonEmptyStringSchema`), which is why the strictness is worth it —
  but if you ever loosen a producer, loosen this in the same pass.
- **What will interact with this**: plan 032 (one session status enum) touches
  `ProviderRuntimeBindingStatus` on the same two files. Land whichever comes
  first; they do not overlap textually (status vs payload) but will conflict in
  the import block of `provider-session-directory.ts`.
- **`modelSelectionsEqual` survives** the sniffer purge — it is a value
  comparison, not a validator. Four things are deleted:
  `runtimePayloadRecord`, `isModelSelectionLike`, `interactionModeFromPayload`,
  and four `isRecord` copies.
