# Plan 027: Type the orchestration WebSocket RPC responses

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
> PATHS="packages/contracts/src/orchestration-ws.ts packages/contracts/src/index.ts packages/contracts/src/tests/orchestration.test.ts apps/server/src/orchestration/engine.ts apps/server/src/orchestration/ws-rpc.ts apps/server/src/orchestration/schemas.ts apps/server/src/orchestration/tests/engine.test.ts apps/web/src/features/chat/transport/orchestration-rpc-client.ts apps/web/src/features/chat/environment/chat-environment.ts apps/web/src/features/chat/lib/chat-command-sync.ts apps/web/src/features/chat/providers/plan-follow-up-provider.tsx"
> git diff --stat ace313f..HEAD -- $PATHS   # committed drift
> git diff --stat -- $PATHS                 # uncommitted drift
> ```
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
>
> **Expected uncommitted drift at `ace313f`**: exactly one file,
> `packages/contracts/src/index.ts`, `1 file changed, 3 insertions(+)`. The three
> lines are `SETTING_ROW_IDS`, `settingRowIds`, `settingRowOwner` added to the
> `from './settings/registry'` export block around line 498 — _below_ the
> `from './orchestration-ws'` block this plan edits, so the line numbers quoted
> for that block still hold. That hunk is someone else's in-flight settings work.
> Do not revert it, do not stage it, do not format it. Any _other_ uncommitted
> drift in the list above is a STOP condition.
>
> ---
>
> > **THE BASELINE IS NOT GREEN. READ THIS BEFORE YOU RUN ANY GATE.**
> >
> > At `ace313f`, in this working tree, before you change a single line:
> >
> > - `cd apps/web && bun run typecheck` **exits 1** with exactly three errors,
> >   all in `src/features/editor/`:
> >   ```
> >   src/features/editor/editor-plugins.ts(37,8): error TS2307: Cannot find module '@singapor/tree-sitter-languages' or its corresponding type declarations.
> >   src/features/editor/tests/editor-syntax-worker.browser.tsx(8,52): error TS2307: Cannot find module '@singapor/tree-sitter-languages' or its corresponding type declarations.
> >   src/features/editor/tests/editor-syntax-worker.browser.tsx(42,45): error TS7006: Parameter 'contribution' implicitly has an 'any' type.
> >   ```
> > - `cd apps/web && bun run test` **exits 1** with
> >   `Test Files 2 failed | 242 passed (244)`, `Tests 1753 passed (1753)`. The two
> >   failed _suites_ are `src/features/git/components/tests/diff-view.test.tsx`
> >   and `src/features/git/components/tests/diff-line-comment.test.tsx`, both
> >   failing at import with
> >   `Failed to resolve entry for package "@singapor/tree-sitter-languages"`.
> >   Zero individual tests fail.
> >
> > `@singapor/tree-sitter-languages` is a sibling-checkout symlink that is not
> > installed here. **It is not yours to fix and it has nothing to do with this
> > plan.** Do not install it, do not stub it, do not edit anything under
> > `src/features/editor/` or `packages/editor-*`. Your gate is the _delta_: the
> > same three typecheck errors and the same two failing suites, and nothing new.
> > If you find yourself debugging tree-sitter, you have taken a wrong turn — STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: `plans/022-delete-unreachable-code.md`
- **Category**: api-design
- **Planned at**: commit `ace313f`, 2026-08-16

This plan closes one instance of **theme T2 — "typed contracts that stop being
typed exactly where the consumer needs them"** from `plans/README.md`.

## Why this matters

`packages/contracts/src/orchestration-ws.ts` describes the orchestration
WebSocket protocol precisely in one direction and not at all in the other. The
_request_ side is a four-member `v.variant('method', …)` where every payload is
schema-checked. The _response_ side is `data: v.unknown()`. The consequence is
that each of the four RPC methods' result shapes lives wherever a caller
happened to write it down: three of them assert a contract type by hand, and
`dispatchCommand` asserts an inline object literal (`{ deduped: boolean;
sequence: number }`) that exists nowhere in `packages/contracts` — it is written
once on the client and once, differently, on the server, and they agree by
coincidence. A change to the server's dispatch result compiles on both sides,
ships, and only fails in the browser at runtime.

After this plan there is one `ORCHESTRATION_WS_RESULTS` map in contracts, keyed
by request method. The client's `sendRequest` return type and the server's
handler return types are both read off that map, so a shape change on either
side is a build error on the other. `bun run typecheck` becomes the proof that
the two sides agree — which is exactly what nothing checks today.

### What the comparison already showed (read this before Step 5)

This plan was written by doing the comparison by hand. The answer:

- The client's `{ deduped, sequence }` **matches** the server for the two fields
  the client reads. Every consumer of `dispatchCommand` in `apps/web` reads only
  `result.deduped` and `result.sequence`.
- The server additionally ships a third field, `receipt` — a whole
  `OrchestrationCommandReceipt` object — on every dispatch response.
  **Zero code reads it.** `rg -n "receipt" apps/web/src` at `ace313f` returns one
  hit and it is an unrelated comment in `terminal-context-chip.tsx`. On the
  server, `rg -n "\.receipt\b" apps/server/src` returns exactly one line —
  `engine.ts:209`, `receipt: committed.receipt` — which is a _write_, not a read.
  The field is put into a dispatch result in two places (`engine.ts:209` and
  `dedupedDispatchResult` at `engine.ts:509`) and read in none.
  `apps/server/src/orchestration/tests/` mentions `receipt` only in prose and in
  an unrelated `orchestrationCommandReceipts` table query
  (`attachment-ingest.test.ts:154`), so no test asserts on it either.

So the honest fix is not to bless `receipt` in the contract — that would force
every fake dispatcher in the `apps/web` test suite (about fifteen `{ deduped:
false, sequence: N }` literals) to materialise a receipt object for a field
nothing reads. Step 5 deletes `receipt` from the dispatch result instead. That
is the greenfield rule in `AGENTS.md`: _"No backward compatibility shims, no
legacy aliases, no deprecation windows. Update every call site in the same
pass."_

**If typecheck surfaces any disagreement other than that one, STOP and report
it — do not adjust the schema to make the error go away.** A field the client
reads that the server does not send is a live bug, and the point of this plan is
to find it, not to launder it.

## Current state

### Files and their role

| File                                                               | Role                                                                                                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `packages/contracts/src/orchestration-ws.ts`                       | The WS protocol. Requests typed, responses `unknown` (line 247).                                                                |
| `packages/contracts/src/index.ts`                                  | The package's only entry point (`"exports": { ".": "./src/index.ts" }`). Every new public name must be re-exported here.        |
| `packages/contracts/src/orchestration-snapshots.ts`                | Home of `orchestrationThreadDetailPageSchema` (line 122) and `orchestrationReplayEventsResultSchema` (line 191).                |
| `apps/server/src/orchestration/schemas.ts`                         | 52-line re-export of `@workspace/contracts` names used by the orchestration server. Server files import contracts _through_ it. |
| `apps/server/src/orchestration/ws-rpc.ts`                          | The Elysia WS route. `resolveOrchestrationRpcRequest` (line 197) picks the handler; no declared return contract.                |
| `apps/server/src/orchestration/engine.ts`                          | Owns `OrchestrationDispatchResult` (line 47) — the real, server-local dispatch result type.                                     |
| `apps/web/src/features/chat/transport/orchestration-rpc-client.ts` | The browser RPC client. `sendRequest<T>` (line 184) is a bare type assertion.                                                   |
| `apps/web/src/features/chat/environment/chat-environment.ts`       | The `ChatEnvironment` seam type; re-declares the dispatch result inline.                                                        |
| `apps/web/src/features/chat/lib/chat-command-sync.ts`              | Declares `ThreadCommandDispatchResult` — a third copy of the same two fields.                                                   |
| `apps/web/src/features/chat/providers/plan-follow-up-provider.tsx` | The only other consumer of `ThreadCommandDispatchResult`.                                                                       |

### The untyped response — `packages/contracts/src/orchestration-ws.ts:242-255`

```ts
export const orchestrationWsResponseMessageSchema = v.variant('ok', [
  v.object({
    kind: v.literal('response'),
    requestId: orchestrationWsRequestIdSchema,
    ok: v.literal(true),
    data: v.unknown(),
  }),
  v.object({
    kind: v.literal('response'),
    requestId: orchestrationWsRequestIdSchema,
    ok: v.literal(false),
    error: orchestrationWsErrorSchema,
  }),
])
```

### The fully typed request side, for contrast — `packages/contracts/src/orchestration-ws.ts:126-150`

```ts
export const orchestrationWsRequestSchema = v.variant('method', [
  v.object({
    kind: v.literal('request'),
    requestId: orchestrationWsRequestIdSchema,
    method: v.literal('dispatchCommand'),
    command: clientOrchestrationCommandSchema,
  }),
  v.object({
    kind: v.literal('request'),
    requestId: orchestrationWsRequestIdSchema,
    method: v.literal('threadDetailPage'),
    input: orchestrationWsThreadDetailPageInputSchema,
  }),
  v.object({
    kind: v.literal('request'),
    requestId: orchestrationWsRequestIdSchema,
    method: v.literal('replayEvents'),
    input: orchestrationWsReplayInputSchema,
  }),
  v.object({
    kind: v.literal('request'),
    requestId: orchestrationWsRequestIdSchema,
    method: v.literal('serverConfig'),
  }),
])
```

Four methods: `dispatchCommand`, `threadDetailPage`, `replayEvents`,
`serverConfig`. (No client code ever sends a `serverConfig` request — the
handshake pushes the config as the first `connected` frame. The method stays in
the protocol and therefore in the result map; deleting it is out of scope.)

### The client's three assertions — `apps/web/src/features/chat/transport/orchestration-rpc-client.ts`

Lines 86-93:

```ts
const request: OrchestrationWsRequest = {
  command,
  kind: 'request',
  method: 'dispatchCommand',
  requestId: this.nextRequestId('dispatchCommand'),
}

return this.sendRequest<{ deduped: boolean; sequence: number }>(request)
```

Lines 114-121:

```ts
const request: OrchestrationWsRequest = {
  input,
  kind: 'request',
  method: 'threadDetailPage',
  requestId: this.nextRequestId('threadDetailPage'),
}

return this.sendRequest<OrchestrationThreadDetailPage>(request)
```

Lines 140-147:

```ts
const request: OrchestrationWsRequest = {
  input,
  kind: 'request',
  method: 'replayEvents',
  requestId: this.nextRequestId('replayEvents'),
}

return this.sendRequest<OrchestrationReplayEventsResult>(request)
```

And the assertion machinery itself, lines 184-214 (abridged — the parts this
plan touches):

```ts
  private async sendRequest<T>(message: OrchestrationWsRequest): Promise<T> {
    const socket = await this.connect()

    return new Promise<T>((resolve, reject) => {
      …
      this.pendingRequests.set(message.requestId, {
        method: message.method,
        reject,
        resolve: (value) => resolve(value as T),
        slowTimeoutId,
        startedAt: performance.now(),
        timeoutId,
      })
```

`pending.resolve` is typed `(value: unknown) => void` on `PendingRequest`
(line 41) and is called at line 417 with `message.data`, i.e. the
envelope-parsed-but-payload-unvalidated value:

```ts
if (message.ok) {
  pending.resolve(message.data)
  return
}
```

### The server's untyped resolver — `apps/server/src/orchestration/ws-rpc.ts:197-206`

```ts
function resolveOrchestrationRpcRequest(
  engine: OrchestrationEngine,
  message: OrchestrationWsRequest,
) {
  if (message.method === 'dispatchCommand') return engine.dispatchClientCommand(message.command)
  if (message.method === 'serverConfig') return orchestrationWsServerConfig()
  if (message.method === 'threadDetailPage') return engine.threadDetailPage(message.input)

  return engine.replay(message.input)
}
```

### The real dispatch result — `apps/server/src/orchestration/engine.ts:47-51`

```ts
export type OrchestrationDispatchResult = {
  deduped: boolean
  receipt: ReturnType<OrchestrationCommandReceipts['find']>
  sequence: number
}
```

It is produced in exactly two places. `engine.ts:207-211`:

```ts
return {
  deduped: false,
  receipt: committed.receipt,
  sequence: committed.sequence,
}
```

and `engine.ts:504-512`:

```ts
function dedupedDispatchResult(
  receipt: NonNullable<ReturnType<OrchestrationCommandReceipts['find']>>,
) {
  return {
    deduped: true,
    receipt,
    sequence: receipt.resultSequence ?? 0,
  }
}
```

`OrchestrationDispatchResult` is exported but referenced only inside
`engine.ts` (as the return annotation of `dispatchNow` at line 176).

### The client's other two copies of the same shape

`apps/web/src/features/chat/environment/chat-environment.ts:15-18`:

```ts
export type ChatEnvironment = {
  dispatchCommand: (
    command: ClientOrchestrationCommand,
  ) => Promise<{ deduped: boolean; sequence: number }>
```

`apps/web/src/features/chat/lib/chat-command-sync.ts:12-15`:

```ts
export type ThreadCommandDispatchResult = {
  deduped: boolean
  sequence: number
}
```

used at `chat-command-sync.ts:75` and `:79`, and imported by
`plan-follow-up-provider.tsx:19` for use at `:239` and `:249`. Declaration plus
five uses; `rg -n "ThreadCommandDispatchResult" apps/web/src` returns exactly
those six lines and nothing else in the repo references it.

### Repo conventions that apply here

From `AGENTS.md`, verbatim — the executor has not read this file:

- _"Import exact files through `@/`. Do not add barrel `index.ts` files. Barrel
  files are allowed only at package entry points such as `packages/_/src/index.ts`that back the package's`"."`export."* —`packages/contracts/src/index.ts` is
  that sanctioned barrel; add the new names there.
- _"This project is greenfield and not live: no releases, no external users, no
  data anyone needs migrated. No backward compatibility shims, no legacy
  aliases, no deprecation windows. Update every call site in the same pass."_
- _"Remove duplicate code aggressively."_ and _"Delete obsolete tests instead of
  preserving old behavior."_
- _"Never throw `new Error`. Create errors with `createError` from `evlog`."_
  (No new errors are needed in this plan; do not add any.)
- _"Use guard clauses and early returns… Do not use `else` after an early
  return. Never use nested ternaries."_ — this is why Step 4's dispatch stays an
  `if`-chain of early returns.
- Tests: _"Import `{ test, expect }` from `apps/web/test/fixtures.ts`, not from
  `vitest`, for app tests."_ and _"Do not `mock.module` or `vi.mock` our server,
  client, or feature modules."_ (`packages/contracts` is not an app: its tests
  import from `vitest` directly — see `packages/contracts/src/tests/orchestration.test.ts:1`.)

Local style to match: `packages/contracts/src/orchestration-ws.ts` documents
_why_ a bound or a shape exists in a block comment above it (see lines 17-28,
31-37, 152-159). New exported schemas in that file get the same treatment.

## Commands you will need

Run these from the repository root unless stated otherwise.

All measured at `ace313f` by running them. "Expected" is the **baseline**, i.e.
what you should still see when you are done — not necessarily exit 0.

| Purpose                   | Command                                                                       | Baseline, and therefore expected at the end                                                                                                                           |
| ------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typecheck contracts       | `bun run --filter '@workspace/contracts' typecheck`                           | exit 0, no diagnostics                                                                                                                                                |
| Typecheck server          | `cd apps/server && bun run typecheck`                                         | exit 0, prints only `$ tsgo --noEmit`                                                                                                                                 |
| Typecheck web             | `cd apps/web && bun run typecheck`                                            | **exit 1 with exactly the 3 pre-existing `src/features/editor/` errors quoted at the top of this file, and nothing else**                                             |
| Test contracts            | `bun run --filter '@workspace/contracts' test`                                | `Test Files 14 passed (14)`, `Tests 120 passed (120)` before this plan; 122 after                                                                                     |
| Test server orchestration | `cd apps/server && bun --bun vitest run src/orchestration`                    | `Test Files 21 passed (21)`, `Tests 207 passed (207)`                                                                                                                 |
| Test the RPC client       | `cd apps/web && bun --bun vitest run --project node orchestration-rpc-client` | `Test Files 1 passed (1)`, `Tests 7 passed (7)`                                                                                                                       |
| Test web (full)           | `cd apps/web && bun run test`                                                 | **exit 1 with exactly `Test Files 2 failed \| 242 passed (244)`, `Tests 1753 passed (1753)`** — the two pre-existing editor-import suite failures, zero failing tests |
| Lint contracts            | `bun run --filter '@workspace/contracts' lint`                                | exit 0, no output past `$ oxlint .`                                                                                                                                   |
| Lint server               | `cd apps/server && bun run lint`                                              | exit 0, no output past `$ oxlint .`                                                                                                                                   |
| Lint web                  | `cd apps/web && bun run lint`                                                 | exit 0 with **7 pre-existing warnings** (listed below)                                                                                                                |
| Format in-scope files     | `node_modules/.bin/oxfmt --write <paths>` (from repo root)                    | exit 0                                                                                                                                                                |

### Baselines measured at `ace313f` — do not chase these

- `cd apps/web && bun run lint` exits 0 but emits **seven** warnings, none of them
  yours: `src/keymap/commands.ts:151`,
  `src/features/editor/components/compare-saved-view.tsx:42`,
  `src/features/settings/components/widgets/font-widget.tsx:44`,
  `src/features/settings/components/widgets/number-widget.tsx:38`,
  `src/features/settings/components/widgets/string-widget.tsx:30`,
  `vitest.config.ts:9`, `scripts/editor-scroll-benchmark.mjs:16`. Leave every one
  of them. The rule that matters is narrower and does not depend on the count:
  **no warning may name any of the ten files you edited.** Check with
  `cd apps/web && bun run lint 2>&1 | rg "chat/(transport|environment|lib|providers)"`
  → no matches.
- `bun run format:check` already **fails** in two workspaces because of
  uncommitted work in progress that is not yours:
  `apps/web/src/features/settings/hooks/use-setting-inspection.ts` and
  `packages/contracts/src/settings/keys.ts`. **Do not run `bun run format` or
  `bun run --filter … format`** — `oxfmt --write .` would rewrite those files.
  Format only the files you touched, by path, with
  `node_modules/.bin/oxfmt --write <path> …`.
- The working tree at `ace313f` has unrelated modified files (settings, editor,
  `bun.lock`, `docs/settings-reference.md`, and an untracked
  `plans/009-…md`). `git status` will show them. Leave them alone; they are not
  yours to revert or commit.
- **Do not run the full `apps/server` test suite** (`bun --bun vitest run` with
  no path). At this commit it opens, migrates and WAL-locks the developer's real
  `~/.platform/fs-metadata.sqlite` while the dev server is running — that is
  plan 013's job to fix. Scope server test runs to `src/orchestration`.
- **Do not run `bun run verify` or the root `bun run test` / `bun run typecheck`.**
  They fan out to every workspace, which drags in both red baselines above plus
  the full server suite. Use the scoped commands in the table.

## Scope

**In scope** (the only files you should modify):

- `packages/contracts/src/orchestration-ws.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/tests/orchestration.test.ts`
- `apps/server/src/orchestration/schemas.ts`
- `apps/server/src/orchestration/ws-rpc.ts`
- `apps/server/src/orchestration/engine.ts`
- `apps/server/src/orchestration/tests/engine.test.ts` (one added assertion, Step 5e)
- `apps/web/src/features/chat/transport/orchestration-rpc-client.ts`
- `apps/web/src/features/chat/environment/chat-environment.ts`
- `apps/web/src/features/chat/lib/chat-command-sync.ts`
- `apps/web/src/features/chat/providers/plan-follow-up-provider.tsx`
- `plans/README.md` — the status row for 027 only, per the executor instructions
  at the top. Eleven in-scope files, then, not ten.

**Out of scope** (do NOT touch, even though they look related):

- **Adding runtime validation of `message.data`.** Tempting, and the map makes
  it a one-liner, but a `replayEvents` page is up to 1,000 events
  (`ORCHESTRATION_REPLAY_MAX_EVENTS`) and a `threadDetailPage` is a full page of
  messages and activities — deep-parsing every response on the UI thread is a
  real cost with no measurement behind it. Deliberately deferred; see
  "Maintenance notes".
- **`ORCHESTRATION_WS_PROTOCOL_VERSION`** (`orchestration-ws.ts:29`). Its
  contract is _"Bumped whenever a shape in this file changes in a way an older
  peer cannot read."_ Removing a field no peer reads does not qualify. Leave it
  at `3`.
- **`orchestrationRpcResultSummary`** (`ws-rpc.ts:383-393`) and its
  `data as OrchestrationThreadDetailPage` cast. `OrchestrationThreadDetailPage`
  is already `InferOutput<typeof orchestrationThreadDetailPageSchema>`, so
  retargeting the cast at the map would change nothing but the spelling.
- **The `serverConfig` request method.** It has no client caller, but deleting a
  protocol member is a separate decision with its own blast radius (the handshake
  frame, the protocol version, any non-browser peer). Not this plan's. Keep all
  four methods.
- **The `data: v.unknown()` field on the response envelope.** Do not make
  `orchestrationWsResponseMessageSchema` generic in the method, and do not
  narrow `data` to a union of the four results. The envelope is parsed before
  anyone knows which request it answers — `requestId` is the only key — so a
  narrowed `data` would have to be re-widened one line later. The map replaces
  the _assertions_, not the envelope.
- **Adding `receipt` to `orchestrationDispatchResultSchema` "to be safe".** That
  is the exact thing Step 5 exists to prevent; see "What the comparison already
  showed".
- **The `apps/server/src/orchestration/schemas.ts` re-export barrel itself.**
  `AGENTS.md` bans barrels outside package entry points and this file is one.
  It is pre-existing, every orchestration server file imports through it, and
  dissolving it is a large unrelated refactor. Add your three names to it and
  move on.
- **The pre-existing uncommitted settings work**
  (`packages/contracts/src/settings/keys.ts`,
  `apps/web/src/features/settings/**`) and the three
  `src/features/settings/components/widgets/*` lint warnings. Not yours.
- **`@singapor/tree-sitter-languages` and everything under
  `apps/web/src/features/editor/`.** See the baseline callout at the top of this
  file: they are red before you start and stay red.
- **`orchestrationCommandReceiptSchema`** (`orchestration-snapshots.ts:215`) and
  `apps/server/src/orchestration/command-receipts.ts`. The receipt row is real,
  durable idempotency state and is still written on every accepted command. Only
  its appearance in the _dispatch return value_ goes away.
- **`commitCommand`'s returned `receipt` property** (`engine.ts:298-304`). After
  Step 5 nothing reads it, but the `receipts.recordAccepted(...)` call that
  produces it is load-bearing (it inserts the ledger row). Leave the method
  alone.
- **The ~15 `{ deduped: false, sequence: N }` literals in `apps/web` test files.**
  They keep compiling because the contract result is exactly those two fields.
  If you find yourself editing them, you have taken a wrong turn — STOP.
- **`packages/editor-*`** — those are symlinks into a sibling checkout. Never in
  scope for anything.

## Git workflow

- **All work happens on `main`** — no new branches, worktrees, commits, pushes,
  or PRs unless the operator explicitly asks.
- If the operator does ask for a commit: conventional commits, lowercase
  descriptive subject. Real examples from `git log`:
  `refactor(orchestration): the server prepares a session's worktree (M-C)`,
  `fix(address): bound the URL, and stop escaping slashes in ?tabs=`.
  A fitting subject here: `refactor(orchestration): key the ws rpc results on the request method`.

## Steps

### Step 1: Mint the result map in contracts

Edit `packages/contracts/src/orchestration-ws.ts`.

**1a.** Extend the existing import from `./orchestration-snapshots` (lines 9-15)
with the two result schemas. It becomes:

```ts
import {
  ORCHESTRATION_THREAD_DETAIL_MAX_PAGE_SIZE,
  orchestrationReplayEventsInputSchema,
  orchestrationReplayEventsResultSchema,
  orchestrationShellStreamItemSchema,
  orchestrationThreadDetailAnchorSchema,
  orchestrationThreadDetailPageSchema,
  orchestrationThreadStreamItemSchema,
} from './orchestration-snapshots'
```

(`orchestration-snapshots.ts` does not import `orchestration-ws.ts`, so this
adds no cycle.)

**1b.** Immediately after the `orchestrationWsResponseMessageSchema` block
(after line 255, before `orchestrationWsSubscriptionItemSchema`), insert:

```ts
/**
 * The wire form of what dispatching a command returns. `sequence` is the stream
 * position the command's events landed at; `deduped` says the command id had
 * already been accepted, so nothing new was appended and `sequence` is the
 * earlier attempt's. Both are what a caller needs to know where to resume its
 * projection from — nothing else about the command's receipt crosses the wire.
 */
export const orchestrationDispatchResultSchema = v.object({
  deduped: v.boolean(),
  sequence: nonNegativeIntegerSchema,
})

/**
 * One result schema per request method. The response envelope carries no method
 * — `requestId` is what pairs a response with its request — so without this map
 * a result shape exists only in whatever each caller happened to assert, and
 * client and server agree by coincidence. Keyed here, both sides read the same
 * entry and a change to one is a build error in the other.
 */
export const ORCHESTRATION_WS_RESULTS = {
  dispatchCommand: orchestrationDispatchResultSchema,
  replayEvents: orchestrationReplayEventsResultSchema,
  serverConfig: orchestrationWsServerConfigSchema,
  threadDetailPage: orchestrationThreadDetailPageSchema,
} satisfies Record<OrchestrationWsRequest['method'], v.GenericSchema>
```

**1c.** Add the derived types to the type block at the bottom of the file. Put
them next to the other `OrchestrationWs*` types (after
`export type OrchestrationWsRequestId = …`, currently line 325):

```ts
export type OrchestrationDispatchResult = v.InferOutput<typeof orchestrationDispatchResultSchema>
/** The single request variant for one method — what a caller builds and sends. */
export type OrchestrationWsRequestOf<M extends OrchestrationWsRequest['method']> = Extract<
  OrchestrationWsRequest,
  { method: M }
>
/**
 * Mapped rather than a bare indexed access on purpose: written this way, a
 * method added to `orchestrationWsRequestSchema` without an entry in
 * `ORCHESTRATION_WS_RESULTS` is a compile error here.
 */
type OrchestrationWsResults = {
  [M in OrchestrationWsRequest['method']]: v.InferOutput<(typeof ORCHESTRATION_WS_RESULTS)[M]>
}
export type OrchestrationWsResult<M extends OrchestrationWsRequest['method']> =
  OrchestrationWsResults[M]
```

Type aliases hoist, so referencing `OrchestrationWsRequest` at line ~256 while it
is declared at line ~324 is fine.

**Verify**: `bun run --filter '@workspace/contracts' typecheck` → exit 0.

### Step 2: Export the new names from the contracts barrel

Edit the `from './orchestration-ws'` export block in
`packages/contracts/src/index.ts` (it spans lines 392-447 at `ace313f`). Keep the
block's existing ordering convention: SCREAMING_CASE constants first, then
camelCase values, then `type` names, each group alphabetical. Add exactly five
names:

- `ORCHESTRATION_WS_RESULTS,` — after `ORCHESTRATION_WS_PROTOCOL_VERSION,`
- `orchestrationDispatchResultSchema,` — before `orchestrationSearchThreadsInputSchema,`
- `type OrchestrationDispatchResult,` — before `type OrchestrationSearchThreadsInput,`
- `type OrchestrationWsRequestOf,` — after `type OrchestrationWsRequestId,`
- `type OrchestrationWsResult,` — after `type OrchestrationWsResponseMessage,`

Do not export `OrchestrationWsResults` (the mapped helper); it stays internal to
`orchestration-ws.ts`.

**Verify**: `bun run --filter '@workspace/contracts' typecheck` → exit 0, and

```
rg -n "ORCHESTRATION_WS_RESULTS|[Oo]rchestrationDispatchResult|OrchestrationWsRequestOf|OrchestrationWsResult\b" packages/contracts/src/index.ts
```

→ exactly five matching lines, one per name above. (The `[Oo]` matters: the
schema is `orchestrationDispatchResultSchema` and the type is
`OrchestrationDispatchResult`, so a lowercase-only pattern silently finds four.)

### Step 3: Re-export the new types through the server's schemas module

Edit `apps/server/src/orchestration/schemas.ts` (one 52-line re-export
statement). Add three names inside it:

- `type OrchestrationDispatchResult,` — after `type OrchestrationCommandReceipt,`
- `type OrchestrationWsRequestOf,` — after `type OrchestrationWsRequest,`
- `type OrchestrationWsResult,` — after `type OrchestrationWsRequestOf,`

**Verify**: `cd apps/server && bun run typecheck` → exit 0.

### Step 4: Bind the server handlers to the map

Edit `apps/server/src/orchestration/ws-rpc.ts`.

**4a.** Add `type OrchestrationWsRequestOf,` and `type OrchestrationWsResult,` to
the existing `from './schemas'` import (lines 23-31), keeping its alphabetical
order.

**4b.** Replace `resolveOrchestrationRpcRequest` (lines 197-206, quoted in full
under "Current state") with a handler record plus a dispatch chain:

```ts
/**
 * One handler per method, declared against the contract's result map. The
 * record is what makes each handler's return type checkable: inside an
 * `if (message.method === …)` chain the branch's type is whatever the engine
 * happens to return, and nothing compares it to the wire contract.
 */
type OrchestrationRpcHandlers = {
  [M in OrchestrationWsRequest['method']]: (
    engine: OrchestrationEngine,
    message: OrchestrationWsRequestOf<M>,
  ) => OrchestrationWsResult<M> | Promise<OrchestrationWsResult<M>>
}

const orchestrationRpcHandlers: OrchestrationRpcHandlers = {
  dispatchCommand: (engine, message) => engine.dispatchClientCommand(message.command),
  replayEvents: (engine, message) => engine.replay(message.input),
  serverConfig: () => orchestrationWsServerConfig(),
  threadDetailPage: (engine, message) => engine.threadDetailPage(message.input),
}

function resolveOrchestrationRpcRequest(
  engine: OrchestrationEngine,
  message: OrchestrationWsRequest,
) {
  if (message.method === 'dispatchCommand') {
    return orchestrationRpcHandlers.dispatchCommand(engine, message)
  }
  if (message.method === 'serverConfig') {
    return orchestrationRpcHandlers.serverConfig(engine, message)
  }
  if (message.method === 'threadDetailPage') {
    return orchestrationRpcHandlers.threadDetailPage(engine, message)
  }

  return orchestrationRpcHandlers.replayEvents(engine, message)
}
```

Two things to preserve, because they are load-bearing:

- The chain narrows `message` down to the `replayEvents` variant by elimination,
  so the final call is exhaustiveness-checked without a `default` or a cast. Do
  **not** collapse it to `orchestrationRpcHandlers[message.method](engine, message)`
  — indexing the record with the union key produces a union of function types
  that is not callable with the union argument, and the only way to silence that
  is a cast, which throws away everything this step buys.
- `handleOrchestrationRpcRequest` (declared at line 160) keeps its
  `const data = await resolveOrchestrationRpcRequest(engine, message)` at line
  170 unchanged. `data`'s type becomes the union of the four results; the
  envelope's `data` field is `v.unknown()`, so it still fits.

**Expected at this point: this step typechecks cleanly.** In particular, the
`dispatchCommand` handler compiles even though `engine.dispatchClientCommand`
still returns the extra `receipt` field, because TypeScript's excess-property
check only fires on fresh object literals — a _value_ with extra properties is
assignable to a narrower object type. So after Step 4 the wire still ships
`receipt`; Step 5 is what removes it. `dispatchClientCommand` is `async`
(`engine.ts:112`), which is why the handler record's return type is
`OrchestrationWsResult<M> | Promise<OrchestrationWsResult<M>>`.

If typecheck reports an error here that is **not** about `receipt`, that is the
disagreement this plan was written to find — STOP and report it.

**Verify**:

```
cd apps/server && bun run typecheck
cd apps/server && bun --bun vitest run src/orchestration
```

→ typecheck exit 0; `Test Files 21 passed (21)`, `Tests 207 passed (207)`.

### Step 5: Make the engine's dispatch result the contract's

Edit `apps/server/src/orchestration/engine.ts`.

**5a.** Delete the local type at lines 47-51:

```ts
export type OrchestrationDispatchResult = {
  deduped: boolean
  receipt: ReturnType<OrchestrationCommandReceipts['find']>
  sequence: number
}
```

**5b.** Import the contract type instead. Add `type OrchestrationDispatchResult,`
to the existing `from './schemas'` import (lines 6-11), which becomes:

```ts
import {
  clientOrchestrationCommandSchema,
  type OrchestrationCommand,
  type OrchestrationDispatchResult,
  type OrchestrationEvent,
  type OrchestrationThreadDetailPageInput,
} from './schemas'
```

`dispatchNow`'s annotation at line 176 (`): OrchestrationDispatchResult {`)
stays exactly as it is — it now points at the contract type.

**5c.** Drop `receipt` from the two producers. At lines 207-211:

```ts
return {
  deduped: false,
  sequence: committed.sequence,
}
```

and at lines 504-512:

```ts
function dedupedDispatchResult(
  receipt: NonNullable<ReturnType<OrchestrationCommandReceipts['find']>>,
): OrchestrationDispatchResult {
  return {
    deduped: true,
    sequence: receipt.resultSequence ?? 0,
  }
}
```

The parameter stays — it is where `resultSequence` comes from. Only the returned
field goes.

**5d.** `OrchestrationCommandReceipts` must still be imported in `engine.ts` — it
is constructed at line 86 and used in the two helper signatures. Do not remove
the import.

**5e.** This is the one place the plan changes runtime behaviour, so pin it with
a test. `apps/server/src/orchestration/tests/engine.test.ts` already has
`it('dedupes commands by command receipt', …)` at line 56, whose two assertions
at lines 63-64 are `toMatchObject` — which passes whether or not a stray
`receipt` is present, and so proves nothing about the removal. Add one line after
them so the _narrowing_ is what is asserted:

```ts
expect(first).toMatchObject({ deduped: false, sequence: 1 })
expect(duplicate).toMatchObject({ deduped: true, sequence: 1 })
// Both dispatch paths — fresh and deduped — return the wire contract and
// nothing more. `toMatchObject` above would not notice a re-added field.
expect([Object.keys(first).sort(), Object.keys(duplicate).sort()]).toEqual([
  ['deduped', 'sequence'],
  ['deduped', 'sequence'],
])
```

This is an added `expect`, not an added `it`, so the test count stays 207.

**Verify**:

```
cd apps/server && bun run typecheck
rg -n "receipt" apps/server/src/orchestration/engine.ts
cd apps/server && bun --bun vitest run src/orchestration
```

→ typecheck exit 0. The `rg` output must contain **no** line reading
`receipt: committed.receipt` and **no** `receipt:` inside a returned dispatch
object; the surviving hits are the `OrchestrationCommandReceipts` import, the
`this.receipts` field and its uses, `commitCommand`'s
`const receipt = receipts.recordAccepted(...)` / `receipt,` at lines ~298-302,
and the two `receipt:` _parameters_ of `dedupedDispatchResult` and
`previouslyRejectedCommandError`. Tests: `21 passed (21)` / `207 passed (207)`.

### Step 6: Key the client's `sendRequest` on the method

Edit `apps/web/src/features/chat/transport/orchestration-rpc-client.ts`.

**6a.** Update the `@workspace/contracts` import (lines 1-17). Add
`type OrchestrationWsRequestOf,` and `type OrchestrationWsResult,` (alphabetical:
`…RequestOf` after `…Request`, `…Result` after `…RequestOf`). Keep
`type OrchestrationWsRequest` — `PendingRequest.method` (line 39) and
`RpcSubscription` still use it.

Then remove `type OrchestrationReplayEventsResult` and
`type OrchestrationThreadDetailPage`. Do **6c first**, then confirm with a
command rather than by eye:

```
rg -n "OrchestrationThreadDetailPage\b|OrchestrationReplayEventsResult\b" apps/web/src/features/chat/transport/orchestration-rpc-client.ts
```

→ after 6c this must return only the two import lines; delete exactly those two
lines. (`OrchestrationWsThreadDetailPageInput` is a different name and will not
match. If the command returns anything besides the two import lines, leave the
corresponding import in place.)

**6b.** Replace the `sendRequest` signature and its inner promise (lines
184-214). Only the four marked lines change:

```ts
  /**
   * The response envelope carries no method, so the result type is read off
   * `ORCHESTRATION_WS_RESULTS` by the method that was sent. The parameter is
   * spelled as an intersection rather than `OrchestrationWsRequestOf<M>`
   * because `M` is still generic here: property access on a deferred
   * conditional type is fragile, and `message.requestId` / `message.method`
   * below must keep resolving.
   */
  private async sendRequest<M extends OrchestrationWsRequest['method']>(
    message: OrchestrationWsRequest & { method: M },
  ): Promise<OrchestrationWsResult<M>> {
    const socket = await this.connect()

    return new Promise<OrchestrationWsResult<M>>((resolve, reject) => {
      // …timeouts unchanged…
      this.pendingRequests.set(message.requestId, {
        method: message.method,
        reject,
        resolve: (value) => resolve(value as OrchestrationWsResult<M>),
        slowTimeoutId,
        startedAt: performance.now(),
        timeoutId,
      })
      // …send/catch unchanged…
    })
  }
```

Everything else in the method body — both `setTimeout`s, the `try/catch` around
`sendSocketMessage` — is untouched.

**6c.** Retype the three request literals and drop the explicit result type
arguments. `dispatchCommand` (lines 86-93):

```ts
const request: OrchestrationWsRequestOf<'dispatchCommand'> = {
  command,
  kind: 'request',
  method: 'dispatchCommand',
  requestId: this.nextRequestId('dispatchCommand'),
}

return this.sendRequest(request)
```

`threadDetailPage` (lines 114-121):

```ts
const request: OrchestrationWsRequestOf<'threadDetailPage'> = {
  input,
  kind: 'request',
  method: 'threadDetailPage',
  requestId: this.nextRequestId('threadDetailPage'),
}

return this.sendRequest(request)
```

`replayEvents` (lines 140-147):

```ts
const request: OrchestrationWsRequestOf<'replayEvents'> = {
  input,
  kind: 'request',
  method: 'replayEvents',
  requestId: this.nextRequestId('replayEvents'),
}

return this.sendRequest(request)
```

`M` is inferred from the literal's `method` property. If inference misfires and
`tsgo` reports the result as a union of all four shapes, pass the argument
explicitly — `this.sendRequest<'dispatchCommand'>(request)` — rather than
reintroducing a result-type assertion.

**Verify**:

```
cd apps/web && bun run typecheck
cd apps/web && bun --bun vitest run --project node orchestration-rpc-client
```

→ typecheck exit 0; `Test Files 1 passed (1)`, `Tests 7 passed (7)`.

### Step 7: Collapse the client's two remaining copies of the shape

**7a.** `apps/web/src/features/chat/environment/chat-environment.ts` — add
`OrchestrationDispatchResult` to the `@workspace/contracts` type import
(alphabetically, before `OrchestrationReplayEventsInput`) and change lines 16-18
to:

```ts
dispatchCommand: (command: ClientOrchestrationCommand) => Promise<OrchestrationDispatchResult>
```

**7b.** `apps/web/src/features/chat/lib/chat-command-sync.ts` — delete the
`ThreadCommandDispatchResult` declaration (lines 12-15) and extend the existing
first import to:

```ts
import type { OrchestrationDispatchResult, ThreadId } from '@workspace/contracts'
```

Then update lines 75 and 79:

```ts
export function replayAfterTurnDispatch(result: OrchestrationDispatchResult) {
  return Math.max(0, result.sequence - 2)
}

export function replayAfterDraftTurnDispatch(result: OrchestrationDispatchResult) {
  return Math.max(0, result.sequence - 3)
}
```

**7c.** `apps/web/src/features/chat/providers/plan-follow-up-provider.tsx` —
remove `type ThreadCommandDispatchResult,` from the
`'@/features/chat/lib/chat-command-sync'` import (line 19), add
`OrchestrationDispatchResult,` to the `@workspace/contracts` type import (lines
1-6, alphabetically first in that list), and change the two use sites:

- line 239: `replayAfterSequence: (result: OrchestrationDispatchResult) => number`
- line 249: `let result: OrchestrationDispatchResult`

**Verify**:

```
rg -n "ThreadCommandDispatchResult" apps/web/src
rg -n "deduped: boolean" apps/web/src packages/contracts/src apps/server/src
cd apps/web && bun run typecheck
```

→ the first `rg` returns **no matches**. The second returns **exactly one**:
`packages/contracts/src/orchestration-ws.ts` is the only remaining declaration
of the shape (test files that build `{ deduped: false, sequence: N }` _values_
are fine and expected). Typecheck: still exits 1, with **only** the three
pre-existing `src/features/editor/` errors from the baseline callout — no error
whose path contains `features/chat`.

### Step 8: Add the contract tests, then format, lint and run everything

**8a.** Add two cases to `packages/contracts/src/tests/orchestration.test.ts`.
That file imports from `vitest` directly and from `'../index'` (see its lines
1-16) — match that. Extend the import list with `ORCHESTRATION_WS_RESULTS,`,
`orchestrationDispatchResultSchema,` and `orchestrationWsRequestSchema,`. That
list is only _roughly_ sorted (`providerListResultSchema` already sits out of
order) — insert your three near their alphabetical neighbours and do **not**
re-sort the rest. Then append inside the existing
`describe('orchestration contracts', …)` block:

```ts
it('types the dispatch result the wire actually carries', () => {
  const result = v.parse(orchestrationDispatchResultSchema, {
    deduped: false,
    sequence: 8,
  } as unknown)

  expect(result.deduped).toBe(false)
  expect(result.sequence).toBe(8)
  expect(() =>
    v.parse(orchestrationDispatchResultSchema, { deduped: false, sequence: -1 } as unknown),
  ).toThrow()
  expect(() => v.parse(orchestrationDispatchResultSchema, { sequence: 8 } as unknown)).toThrow()
})

it('has exactly one result schema per request method', () => {
  // The response envelope carries no method, so this map is the only place
  // the payload shape is pinned. A method added to the request variant
  // without an entry here would ship an unchecked `data` again.
  const methods = orchestrationWsRequestSchema.options.map(
    (option) => option.entries.method.literal,
  )

  expect([...methods].sort()).toEqual(Object.keys(ORCHESTRATION_WS_RESULTS).sort())
})
```

**8b.** Format only what you touched, from the repository root:

```
node_modules/.bin/oxfmt --write \
  packages/contracts/src/orchestration-ws.ts \
  packages/contracts/src/index.ts \
  packages/contracts/src/tests/orchestration.test.ts \
  apps/server/src/orchestration/schemas.ts \
  apps/server/src/orchestration/ws-rpc.ts \
  apps/server/src/orchestration/engine.ts \
  apps/server/src/orchestration/tests/engine.test.ts \
  apps/web/src/features/chat/transport/orchestration-rpc-client.ts \
  apps/web/src/features/chat/environment/chat-environment.ts \
  apps/web/src/features/chat/lib/chat-command-sync.ts \
  apps/web/src/features/chat/providers/plan-follow-up-provider.tsx
```

**8c.** Run the gates. Run each line **separately** — do not chain the `apps/web`
ones with `&&`, because `bun run typecheck` and `bun run test` both exit 1 at
baseline (see the callout at the top) and `&&` would skip the rest:

```
bun run --filter '@workspace/contracts' typecheck
bun run --filter '@workspace/contracts' lint
bun run --filter '@workspace/contracts' test
cd apps/server && bun run typecheck && bun run lint && bun --bun vitest run src/orchestration
cd apps/web && bun run typecheck
cd apps/web && bun run lint
cd apps/web && bun run test
```

**Verify**, against the baselines, not against exit 0:

- contracts typecheck exit 0; contracts lint exit 0; contracts test
  `Test Files 14 passed (14)`, `Tests 122 passed (122)` (120 before, plus your 2).
- server: typecheck exit 0, lint exit 0, tests `21 passed (21)` /
  `207 passed (207)` (Step 5e adds an assertion, not a test).
- web typecheck: exit 1 with **exactly the same three `src/features/editor/`
  errors** and nothing else. Confirm the delta is zero:
  `cd apps/web && bun run typecheck 2>&1 | rg -c "error TS"` → `3`, and
  `cd apps/web && bun run typecheck 2>&1 | rg "features/chat"` → no matches.
- web lint: exit 0, the same seven pre-existing warnings, none naming a file you
  edited.
- web test: exit 1 with **exactly** `Test Files 2 failed | 242 passed (244)` and
  `Tests 1753 passed (1753)` — the same two editor-import suite failures, zero
  failing tests. Any third failing file, or any non-zero failing _test_ count, is
  yours and is a STOP condition.

## Test plan

- **New tests — 2, both in `packages/contracts/src/tests/orchestration.test.ts`**
  (exact bodies in Step 8a):
  1. `types the dispatch result the wire actually carries` — parses the happy
     path, and asserts the schema rejects a negative `sequence` and a missing
     `deduped`. This is the shape that previously had no schema at all.
  2. `has exactly one result schema per request method` — reads the method
     literals off `orchestrationWsRequestSchema.options` at runtime and compares
     them to `Object.keys(ORCHESTRATION_WS_RESULTS)`. The `satisfies` clause and
     the `OrchestrationWsResults` mapped type already catch this at compile
     time; the runtime case is what a reviewer can read in a diff.
     Model them on the existing `it('validates model selection with the Codex
default provider instance shape', …)` in the same file (line 25) — same
     `v.parse(schema, x as unknown)` idiom, same `expect(() => …).toThrow()` for
     the negative case.
- **One added assertion — `apps/server/src/orchestration/tests/engine.test.ts`,
  Step 5e.** Removing `receipt` is the only behaviour change in this plan, and
  the existing `toMatchObject` assertions at `engine.test.ts:63-64` pass whether
  or not it is there. The added `Object.keys` check is what proves the wire
  actually narrowed — and, on the other side of the same coin, that both the
  fresh and the deduped dispatch paths still carry `deduped` and `sequence`. No
  new `it`, so the count stays 207.
- **No new client tests.** Everything else here is type-level. The gate is the
  three typechecks plus the existing suites: `apps/server/src/orchestration`
  (21 files, 207 tests) and
  `apps/web/src/features/chat/transport/tests/orchestration-rpc-client.test.ts`
  (7 tests, which drive the real `sendRequest`/`handleResponseMessage` path over
  a `FakeSocket`). Note those 7 assert socket lifecycle, not payload shapes —
  they prove `sendRequest` still resolves, not that it resolves to the right
  type. The typecheck is what proves the type.
- **No browser tests.** Nothing here paints. (For future reference: the `browser`
  vitest project is known to hang at the RUN banner on this machine; if you ever
  need real-paint coverage, drive the already-running dev server at
  `http://localhost:5173` instead.)

## Done criteria

Machine-checkable. ALL must hold. Two of them are _deltas against a red
baseline_, not exit-0 checks — see the callout at the top of this file.

- [ ] `bun run --filter '@workspace/contracts' typecheck` exits 0
- [ ] `cd apps/server && bun run typecheck` exits 0
- [ ] `cd apps/web && bun run typecheck 2>&1 | rg -c "error TS"` → `3`, and
      `cd apps/web && bun run typecheck 2>&1 | rg "features/chat"` → no matches
      (the three are the pre-existing `src/features/editor/` errors)
- [ ] `bun run --filter '@workspace/contracts' test` → `14 passed (14)` files,
      `122 passed (122)` tests
- [ ] `cd apps/server && bun --bun vitest run src/orchestration` →
      `21 passed (21)` files, `207 passed (207)` tests
- [ ] `cd apps/web && bun run test` → `Test Files 2 failed | 242 passed (244)`,
      `Tests 1753 passed (1753)`, and the two failures are still
      `diff-view.test.tsx` and `diff-line-comment.test.tsx`
- [ ] `bun run --filter '@workspace/contracts' lint` and
      `cd apps/server && bun run lint` exit 0 with no output past `$ oxlint .`
- [ ] `cd apps/web && bun run lint 2>&1 | rg "chat/(transport|environment|lib|providers)"`
      → no matches (the seven pre-existing warnings elsewhere are fine)
- [ ] `rg -n "data: v.unknown\(\)" packages/contracts/src/orchestration-ws.ts`
      still returns one line — the _envelope_ stays permissive on purpose; the
      map is what types the payload
- [ ] `rg -n "sendRequest<\{" apps/web/src` returns no matches
- [ ] `rg -n "ThreadCommandDispatchResult" apps/web/src` returns no matches
- [ ] `rg -n "deduped: boolean" apps/web/src packages/contracts/src apps/server/src`
      returns exactly one match, in `packages/contracts/src/orchestration-ws.ts`
- [ ] `rg -c "receipt" apps/server/src/orchestration/engine.ts` → `15`
      (18 at baseline; Step 5 deletes exactly three lines — `49: receipt:
ReturnType<…>`, `209: receipt: committed.receipt,` and `509: receipt,`).
      Line `302: receipt,` inside `commitCommand` **stays**; see out-of-scope.
- [ ] `rg -n "receipt: committed" apps/server/src` returns no matches
- [ ] `git status --porcelain` shows changes only to the eleven in-scope files,
      plus the pre-existing unrelated modifications listed under "Baselines"
- [ ] `plans/README.md` row for 027 updated

## STOP conditions

Stop and report back (do not improvise) if:

- **Typecheck reports a disagreement other than the `receipt` field.** For
  example: a field the client's `dispatchCommand`, `threadDetailPage` or
  `replayEvents` consumers read that the server does not send, or a type
  mismatch on `sequence`. That is a live wire bug and the whole point of this
  plan. Report the exact `tsgo` diagnostic and which side you believe is wrong —
  do not widen the schema to make it compile.
- `satisfies Record<OrchestrationWsRequest['method'], v.GenericSchema>` in Step
  1b does not compile. Concrete valibot schemas are assignable to
  `v.GenericSchema` in this repo (`defineSetting` in
  `packages/contracts/src/settings/registry.ts:124` is built on that constraint),
  so a failure means valibot's types moved. Report the diagnostic; the mapped
  `OrchestrationWsResults` type alone already enforces the missing-key half, so
  dropping the `satisfies` clause is a possible fallback — but ask first.
- The `engine.replay(...)` or `engine.threadDetailPage(...)` handler in Step 4
  fails to satisfy its map entry. Those returns are supposed to already be the
  contract types (`{ events: OrchestrationEvent[] }` and
  `OrchestrationThreadDetailPage`); if they are not, the server has drifted from
  the snapshot contracts and that is a separate finding.
- Any `apps/web` test file needs editing to keep compiling. The contract result
  is exactly `{ deduped, sequence }` precisely so that the existing fake
  dispatchers keep working; if one breaks, the shape you minted is wrong.
- **Step 8a's second test does not compile**, i.e. `tsgo` rejects
  `orchestrationWsRequestSchema.options.map((option) => option.entries.method.literal)`.
  This reaches into valibot's `VariantSchema` internals, which are public but not
  guaranteed stable across versions (this repo is on `valibot@^1.4.1`). If
  `.options` or `.entries` is not typed as expected, do **not** cast your way
  through it and do **not** delete the test: the compile-time half is already
  covered by the `satisfies` clause and the `OrchestrationWsResults` mapped type,
  so report the diagnostic and ask whether to drop that one case.
- **The `apps/web` typecheck or test baseline does not match** the numbers in the
  callout at the top _before_ you have edited anything. That means the tree has
  moved and every "expected" in this plan is stale — re-measure and report, do
  not proceed on the old numbers.
- **You are about to touch `@singapor/tree-sitter-languages`,
  `apps/web/src/features/editor/**`, or `packages/editor-\*`.\*\* Nothing in this
  plan requires it. The three typecheck errors and two failing suites they cause
  are pre-existing and stay.
- `plans/021-async-rejection-boundaries.md` has landed and
  `orchestration-rpc-client.ts` no longer matches the excerpts in "Current
  state". 021 touches the same file (its own scope list names it) but in the
  `dispatchCommand` call sites of `chat-view.tsx`/`chat-draft-view.tsx`, not in
  `sendRequest`. If `sendRequest` itself has changed, re-read it and report the
  difference before editing.
- `bun run format:check` fails on a file you did not touch **other than**
  `apps/web/src/features/settings/hooks/use-setting-inspection.ts` and
  `packages/contracts/src/settings/keys.ts`.

## Maintenance notes

For the human or agent who owns this code next:

- **Adding a fifth RPC method is now a three-place edit, and the compiler names
  all three**: the request variant in `orchestrationWsRequestSchema`, an entry in
  `ORCHESTRATION_WS_RESULTS` (the `OrchestrationWsResults` mapped type errors
  without it), and a handler in `orchestrationRpcHandlers` (the record type
  errors without it). That is the property this plan bought; do not route a new
  method around it.
- **Runtime validation of `message.data` was deliberately deferred.** The map
  makes it a one-line change in `handleResponseMessage`
  (`orchestration-rpc-client.ts:401`), where `pending.method` is already tracked
  on `PendingRequest`: `v.parse(ORCHESTRATION_WS_RESULTS[pending.method], message.data)`.
  It was left out because `replayEvents` can return 1,000 events and
  `threadDetailPage` a full page of messages and activities, and deep-parsing
  those on the UI thread on every response is a cost nobody has measured.
  `AGENTS.md`: _"Measure before and after. An optimization without a benchmark or
  profile is a guess"_ — the same standard applies to accepting a new cost. If
  you do add it, benchmark a 1,000-event replay first.
- **What a reviewer should scrutinize**: (1) that Step 4's chain was not
  "simplified" into `orchestrationRpcHandlers[message.method](engine, message)`
  with a cast — that silently undoes the checking; (2) that the `sendRequest`
  parameter is still the intersection form and the call sites still use
  `OrchestrationWsRequestOf<'…'>` — the two spellings are not interchangeable and
  the comment in the code says why; (3) that `receipt` really had no reader
  before accepting its removal — `rg -n "\.receipt\b" apps/server/src apps/web/src`
  returned exactly one line at `ace313f`, `engine.ts:209`, and that line is the
  _write_ this plan deletes.
- **`serverConfig` is a request method with no caller.** It stays in the
  protocol and therefore in the map. If a later cleanup deletes it, delete the
  map entry and the handler in the same pass; the mapped type will not complain
  about a _surplus_ entry, only the `satisfies` clause will.
- **The `receipt` row is untouched.** `OrchestrationCommandReceipts` still
  records every accepted command, `previouslyRejectedCommandError` still reads
  it, and `orchestrationCommandReceiptSchema` still exists for whoever exposes
  the ledger over an API. Only the dispatch _return value_ stopped carrying it.
- **`ORCHESTRATION_WS_PROTOCOL_VERSION` was intentionally not bumped.** Its
  documented rule is "a shape change an older peer cannot read"; dropping a
  field no peer ever read is not that. A stale browser tab keeps working.
