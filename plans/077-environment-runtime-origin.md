# Plan 077: Runtime server origin, environment identity, and per-environment chat transport

> **Executor instructions:** Read this plan completely, then read `AGENTS.md`, root `PLAN.md`,
> `docs/environments-and-remote-plan.md`, and the never-nester skill. Execute the phases in order.
> Keep the current worktree; do not create a branch, worktree, commit, push, or PR unless the
> operator asks. Preserve all user-owned dirty files. Reuse the running dev server; a second local
> server started for verification must use a distinct `PORT` and `FS_METADATA_DB` and be stopped
> when the check ends.

## Status

- **State:** Ready — first executable slice of the environments lane
- **Priority:** P1 for the environments initiative
- **Effort:** L
- **Risk:** MEDIUM — touches the global client seam every feature imports, the chat transport
  wiring, and the WS handshake contract. Nothing binds off loopback.
- **Category:** Infrastructure
- **Platform baseline:** `1325b003`
- **Prepared:** 2026-09-05
- **Dependency:** none. Plan 068 (session domain) requires this plan; Plan 078 requires both.
- **Adjacent landed contract:** the diagnostic peek adds `onDidNavigateDiagnostic` plumbing in
  `apps/web/src/features/editor/utils/language-server-plugin.ts`. Phase 3 step 6 changes the same
  file and must preserve that callback while replacing its origin read.

Root `PLAN.md` is the sole execution-order authority.

## Drift-check preamble — this is the audit

Run before editing:

```sh
git rev-parse HEAD
git status --short
rg -n "export const serverUrl|import \{ serverUrl \}|serverUrl" apps/web/src --glob '!**/tests/**'
rg -n "localOrchestrationRpcClient|localThreadDetailSubscriptionCache|localThreadEarlierPageLoader" apps/web/src
rg -n "ChatEnvironment|createLocalChatEnvironment" apps/web/src -l
rg -n "isUnauthorizedClose|wasClean && !deliveredMessage" apps/web/src/features/chat/transport
rg -n "SERVER_INSTANCE_ID|serverInstanceId" apps/server/src/orchestration/ws-rpc.ts packages/contracts/src/orchestration-ws.ts
rg -n "version: 9" apps/server/src/db/migrations.ts
```

Expected before work: nine `serverUrl` consumers, three module singletons, twenty `ChatEnvironment`
files, one heuristic, `serverInstanceId` in the handshake with no `environmentId`, migration 9 as the
last entry. If any anchor below has moved, fix the anchor first; do not implement from a stale line.

### Verified current source

- `apps/web/src/lib/client.ts:9` exports `serverUrl` from `import.meta.env.VITE_SERVER_URL`, inlined
  by Vite; `:13-15` builds one `treaty<App>` at module scope; `:20-28` is the `getClient`/`setClient`
  holder that tests use as their seam (`apps/web/test/fixtures.ts:31-39`, `apps/web/test/env/dom.ts:21-26`).
- Nine modules read `serverUrl` directly: `apps/web/src/lib/client-logging.ts:164`,
  `apps/web/src/features/workbench/utils/wallpaper-query.ts:7` (module-scope constant),
  `apps/web/src/lib/default-nerd-font.ts:120,126`,
  `apps/web/src/features/chat/utils/attachment-image.ts:30`,
  `apps/web/src/features/editor/utils/language-server-plugin.ts:296`,
  `apps/web/src/features/chat/transport/orchestration-rpc-client.ts:21,688`, plus two browser tests
  (`features/settings/tests/appearance-optimistic.browser.tsx`,
  `features/workbench/tests/editor-visible-snapshot.browser.tsx`).
- `apps/web/src/lib/server-sockets.ts:32,42` already derives terminal and LSP sockets from
  `getClient()`. They follow whatever client the holder returns; nothing to change there.
- `OrchestrationRpcClient` accepts `url?: () => string` (`orchestration-rpc-client.ts:54-60`) and
  resolves it per socket; `openSocket` (`:344`) returns a live socket; `teardownSocket` (`:470`) is
  private and reachable only from close, error, or heartbeat paths; there is no public disconnect.
- `orchestration-rpc-client.ts:662-676` instantiates one module-level client and exports five bound
  methods. `local-chat-environment.ts:17-26` wires those five into `ChatEnvironment`.
  `thread-detail-subscriptions.ts:443-448` and `thread-earlier-pages.ts:88-92` are module singletons
  consumed by `chat-view.tsx` and `hooks/use-thread-earlier-page.ts`.
- `isUnauthorizedClose` (`orchestration-rpc-client.ts:773-776`) returns
  `event.wasClean && !deliveredMessage`; `use-chat-shell-subscription.ts:109-114` parks the
  supervisor in `blocked` on it. The server closes a rejected upgrade with `socket.close()` and no
  code (`apps/server/src/orchestration/ws-rpc.ts:88-96`).
- `orchestrationWsServerConfig()` (`ws-rpc.ts:43-55`) carries `serverInstanceId` minted per process
  (`:40`); the schema is `orchestrationWsServerConfigSchema`
  (`packages/contracts/src/orchestration-ws.ts:222-235`). `ORCHESTRATION_WS_PROTOCOL_VERSION` is `3`
  (`:31`).
- `server-connection-store.ts:36-63` is single-valued; `generation` bumps when `serverInstanceId`
  changes. `server-restart-invalidation.ts:21-39` invalidates the whole query cache on a bump.
- `apps/web/src/main.tsx:30,79` creates one module-scope `queryClient` and installs the restart
  invalidation on it.
- `/health` returns `{ ok, ...fs.info() }` (`apps/server/src/app.ts:192-195`). `fs.info()`
  (`apps/server/src/fs/service.ts:164-175`) has no identity fields.
- Migrations are an ordered array ending at version 9 (`apps/server/src/db/migrations.ts:26-38`);
  the platform database has no singleton/identity table (`apps/server/src/db/schema.ts`).
- The desktop shell computes `SERVER_URL` and passes it as `VITE_SERVER_URL` to vite
  (`apps/desktop/src/bun/index.ts:45,126`) and spawns exactly one server (`:96-108`).
- `ChatModeSessionProvider` creates the transport with `createLocalChatEnvironment()` under
  `useMemo` (`apps/web/src/features/chat-mode/providers/session-provider.tsx:34`) and exposes it as
  `environment` on `ChatModeSession` (`session-context.ts:10`).
- `assertLoopbackHost` (`apps/server/src/index.ts:27,130`) refuses non-loopback binds. This plan
  does not touch it.

## Outcome

After this plan:

1. The server origin is a runtime value. `getClient()` returns the client of the **active
   environment**; no module captures an origin at import time.
2. Every server has a durable `environmentId` stored in its own database, carried in the WS
   handshake and `/health`, and the client refuses a handshake whose id drifts from the one it
   recorded for that origin.
3. Chat has one `ChatTransport` per environment, created by a factory, closable, and holding its
   own RPC client, detail-subscription cache, and earlier-page loader. The word "environment" is
   free for machines.
4. Query cache is one `QueryClient` per environment, swapped synchronously when the active
   environment changes. Same-process restart invalidation still works per environment.
5. Auth refusal on the WS upgrade is an explicit `1008`; a silent clean close no longer parks chat.
6. A developer can point the running app at a second local server and back with a dev-only palette
   command, and every surface follows: tree, editor, git, terminal, LSP, chat.

Not in this plan: machines UI, persistence scoping, more than one chat connection at once, SSH,
any non-loopback bind, migration of old state. Those are Plans 068 and 078.

## Locked design

### Environment identity (server)

- Append migration **10** `environment_identity`: `environment_identity(id TEXT PRIMARY KEY,
created_at TEXT NOT NULL)`; exactly one row, inserted by the migration with `crypto.randomUUID()`.
  Plan 068's later orchestration reset must leave this table alone; it is not orchestration state.
- `readEnvironmentIdentity(database)` in `apps/server/src/db/environment-identity.ts` returns the row
  and creates it if a database predates the migration row (a fresh `:memory:` test database runs the
  migration and has one). Never re-mint; a wiped database is a new environment by design.
- `orchestrationWsServerConfig()` gains `environmentId`; the contract schema gains
  `environmentId: trimmedNonEmptyStringSchema`. Bump `ORCHESTRATION_WS_PROTOCOL_VERSION` to `4`: the
  handshake shape changed and an old client must not accept a config it cannot check.
- `/health` grows into the authenticated descriptor:
  `{ ok, environmentId, label, protocolVersion, serverVersion, platform: { os, arch }, ...fs.info() }`.
  `label` is `os.hostname()`; `platform.os` is `process.platform`, `platform.arch` is `process.arch`.
  Add `healthDescriptorSchema` to `packages/contracts/src/health.ts` and export it from the package
  entry. No unauthenticated variant.
- WS auth refusal closes with `socket.close(1008, 'unauthorized')`. `orchestrationRpcWebSocket`'s
  wrapper (`ws-rpc.ts:460-463`) forwards code and reason.

### Runtime origin and client registry (web)

- `apps/web/src/lib/client.ts` exports:
  - `createEnvironmentClient(origin: string): Client` — the existing `treaty` construction with the
    instance header.
  - `activeServerOrigin(): string` and `setActiveServerOrigin(origin: string)` — the active origin,
    seeded once from `import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'`.
  - `environmentClientFor(origin: string): Client` — a `Map<string, Client>` keyed by origin.
  - `getClient()` — returns `environmentClientFor(activeServerOrigin())` unless a test installed one
    with `setClient`; `setClient(client)` keeps its meaning of "the active environment's client" so
    `apps/web/test/fixtures.ts` and `test/env/dom.ts` do not change.
  - Delete `export const serverUrl`.
- The five raw-URL consumers become call-time functions of `activeServerOrigin()`:
  `client-logging.ts:164`, `wallpaper-query.ts:7` (turn the constant into `desktopWallpaperUrl()`),
  `default-nerd-font.ts:120,126`, `attachment-image.ts:30`. `language-server-plugin.ts:296` builds a
  `ws://` URL that `EdenLanguageServerWebSocket` parses straight back into path, root, and server
  and re-dials through `getClient().lsp.subscribe()` (`server-sockets.ts:42`); replace the origin
  half with a fixed placeholder origin and a comment saying the origin is dead, or thread the path
  triple directly if the plugin's constructor allows it while preserving diagnostic navigation.
- `attachment-image.ts` is a tripwire for Plan 078: an `<img src>` has no ambient context, so under
  federation it must take the owning environment's origin. Leave a one-line comment naming Plan 078.

### Environments store (web)

- New feature `apps/web/src/features/environments/` with
  `state/environments-store.ts` (Zustand):

  ```ts
  type EnvironmentEntry = {
    readonly origin: string
    readonly environmentId: string | null // learned from the first handshake
    readonly label: string | null // from /health after connect
    readonly kind: 'primary' | 'dev' // 'dev' entries exist only in this plan
  }
  type EnvironmentsState = {
    readonly activeOrigin: string
    readonly entries: Readonly<Record<string, EnvironmentEntry>> // by origin
    readonly connectionByOrigin: Readonly<Record<string, ServerConnectionState>>
  }
  ```

  Actions: `activate(origin)`, `recordHandshake(origin, config)`, `recordDescriptor(origin, health)`,
  `addDevEnvironment(origin)`. `activate` calls `setActiveServerOrigin` synchronously before any
  React state updates so the next `getClient()` already answers for the new origin.

- `recordHandshake` performs the drift check: if `entries[origin].environmentId` is set and differs
  from `config.environmentId`, the connection state becomes
  `{ phase: 'identity-drift', expected, received }` and the config is **not** applied. The chat
  supervisor treats `identity-drift` like `blocked`: no retry ladder, surfaced with the reason.
- `server-connection-store.ts` is deleted; its state and the `generation` logic move into
  `connectionByOrigin`. `selectServerProtocolSkew` and `resetServerConnectionStore` keep their names
  and move with it; update their consumers.
- `server-restart-invalidation.ts` subscribes per origin and invalidates **that origin's**
  `QueryClient` on a generation bump. A switch never invalidates anything.

### One QueryClient per environment

- `apps/web/src/features/environments/state/query-clients.ts`: `queryClientFor(origin)` with a
  `Map<string, QueryClient>`, each created with the options `main.tsx` uses today, each receiving
  `installServerRestartInvalidation`.
- `apps/web/src/features/environments/providers/environment-query-provider.tsx` renders
  `<QueryClientProvider client={queryClientFor(activeOrigin)}>`; `main.tsx` mounts it where the
  single provider is today. Swapping the provider's client is the synchronous "nothing from A is
  valid" signal; no query key gains an environment segment.
- This is required, not deferred: with one shared cache, `fileSystemKeys.tree(rootPath)` for
  `/work/projects/platform` answers from machine A for machine B, which reads as data corruption.

### Chat transport per environment

- The seam moves into `apps/web/src/features/chat/transport/`, where the RPC client already lives.
  `environment/chat-environment.ts` → `transport/chat-transport.ts` exporting `type ChatTransport`
  (same shape plus `close(): void`, `retainThreadDetail(threadId)`, `loadEarlierPage(threadId)`);
  `environment/local-chat-environment.ts` → `transport/create-chat-transport.ts` exporting
  `createChatTransport(origin: string): ChatTransport`. Delete the `environment/` folder.
- `createChatTransport(origin)` constructs its own `OrchestrationRpcClient({ url: () =>
new URL('/orchestration/rpc', origin).toString() })`, its own
  `createThreadDetailSubscriptionCache(...)`, and its own `createThreadEarlierPageLoader(...)`, and
  exposes the HTTP snapshot read through `environmentClientFor(origin)` rather than `getClient()`.
  Delete the five bound exports (`orchestration-rpc-client.ts:662-676`) and both module singletons.
- `OrchestrationRpcClient.close()`: public; tears down the live socket with a structured
  `createOrchestrationRpcClosedError()` so in-flight subscriptions end, clears the heartbeat, and
  sets a `closed` flag that makes `openSocket()` refuse to reopen. Without it, a switch leaves the
  old socket alive and dispatches land on the previous backend.
- `ChatModeSessionProvider` derives the transport with `useMemo(() => createChatTransport(origin),
[origin])` where `origin` is the environments store's `activeOrigin`, and closes the previous
  transport in the effect cleanup. `ChatModeSession.environment` is renamed `transport`. Update the
  twenty consumers found by the drift search; test files included.
- `chat-view.tsx` and `use-thread-earlier-page.ts` call `transport.retainThreadDetail` and
  `transport.loadEarlierPage` from context instead of importing singletons.
- Delete `isUnauthorizedClose`. The close handler maps `event.code === 1008` to the existing blocked
  error and everything else to the retryable transport error. `isBlockedStreamError` keeps its
  shape.

### Dev-only origin switch

- One palette command `environment.devSwitchOrigin` registered in `apps/web/src/keymap/table.ts`,
  enabled only when `import.meta.env.DEV` is true. It opens
  `features/environments/components/dev-origin-dialog.tsx` — a single text input built from
  `@workspace/ui` primitives that lists known origins and accepts a new `http://127.0.0.1:<port>` or
  `http://localhost:<port>` origin. Anything non-loopback is refused in the dialog with the reason;
  this plan never talks to a remote host.
- Plan 078 deletes this dialog when the Machines page lands; say so in a comment at the top of it.

### What switching does in this plan

Order, all synchronous except the last: `setActiveServerOrigin`, swap `QueryClientProvider`, close
the previous `ChatTransport`, create the new one, then the workbench re-fetches through the new
client. Persistence is **not** scoped yet: the root folder, tabs and chat selection in localStorage
are shared across the two dev origins. That is acceptable for a dev-only switch and is exactly what
Plan 078 scopes; do not add partial scoping here.

## Scope

### In scope

- Server identity row, migration 10, descriptor, handshake field, protocol bump, `1008` close.
- Runtime origin, client registry, per-environment `QueryClient`.
- Per-environment `ChatTransport` factory, `close()`, singleton deletion, rename.
- Environments store with drift refusal; connection store folded in.
- Dev-only origin switch command and dialog.
- Contract, server, and web tests for each of the above.

### Out of scope

- Any non-loopback bind, SSH, TLS, pairing, sessions, revocation.
- Machines settings entry and page (Plan 078).
- Scoped persistence, wallpaper fallback for remote, per-environment log drains (Plan 078).
- More than one chat connection at once (Plan 078).
- Any change to the session/thread domain (Plan 068).

## Git and state policy

- Work in the existing worktree; preserve unrelated dirty files.
- No migration of browser state. If the developer's two dev origins leave confusing shared
  localStorage behind, the instruction is to clear site data once; ship nothing that does it.
- Production errors use `defineErrorCatalog`/`createStructuredError` through the feature's
  `structured-errors.ts`; wide events only. Never `new Error`.

## Phase 1 — Contracts and server identity

### Work

1. `packages/contracts/src/orchestration-ws.ts`: add `environmentId` to
   `orchestrationWsServerConfigSchema`; bump `ORCHESTRATION_WS_PROTOCOL_VERSION` to `4`.
2. `packages/contracts/src/health.ts` (new): `healthDescriptorSchema` with the fields in Locked
   design; export from `packages/contracts/src/index.ts`.
3. `apps/server/src/db/schema.ts`: add `environmentIdentity` table. `apps/server/src/db/migrations.ts`:
   append `{ version: 10, name: 'environment_identity', up: applyEnvironmentIdentity }` that creates
   the table and inserts the single row.
4. `apps/server/src/db/environment-identity.ts`: `readEnvironmentIdentity(db)`; structured error if
   zero or more than one row.
5. `apps/server/src/orchestration/ws-rpc.ts`: `orchestrationWsServerConfig(engineIdentity)` includes
   `environmentId`; `open()` closes with `1008` on auth failure; the wrapper forwards code and reason.
   Thread the identity from `createApp` (`apps/server/src/app.ts`) through the orchestration options
   rather than reading the default database at module scope.
6. `apps/server/src/app.ts` `/health`: return the descriptor.
7. Log `environmentId` on `server.start` (`apps/server/src/index.ts`) and on
   `chat.pipeline.ws.open`; enrich the existing events, add no new lines.

### Verify

```sh
cd packages/contracts && bun run test -- src/tests/orchestration-ws.test.ts && bun run typecheck && cd ../..
cd apps/server && bun --bun vitest run src/db/tests/migrations.test.ts src/tests/app.test.ts src/orchestration/tests/ws-rpc.test.ts && bun run typecheck && cd ../..
```

Expected: a fresh database and a version-9 fixture both end with exactly one identity row that
survives a second `applyMigrations`; `/health` carries `environmentId` equal to the handshake's;
a rejected upgrade closes with code `1008`; two `createApp` instances over two `:memory:` databases
report different ids.

## Phase 2 — Runtime origin, registry, and query clients

### Work

1. Rewrite `apps/web/src/lib/client.ts` per Locked design; delete `serverUrl`.
2. Create `features/environments/state/environments-store.ts` and fold
   `features/chat/state/server-connection-store.ts` into it; delete the old store; update
   `selectServerProtocolSkew` consumers and the chat supervisor's `recordHandshake` call.
3. Create `features/environments/state/query-clients.ts` and
   `features/environments/providers/environment-query-provider.tsx`; mount in `main.tsx`; move the
   `installServerRestartInvalidation` call into `queryClientFor`.
4. Make `server-restart-invalidation.ts` per-origin.
5. Convert `client-logging.ts`, `wallpaper-query.ts`, `default-nerd-font.ts`, `attachment-image.ts`
   to call-time origin reads. Add the Plan 078 tripwire comment in `attachment-image.ts`.
6. Update the two browser tests that import `serverUrl` to read `activeServerOrigin()`.
7. `client-logging.ts`: add `environmentId` (from the active entry, nullable before the first
   handshake) to every client wide event's base fields.

### Verify

```sh
cd apps/web
bun --bun vitest run --project node --project dom \
  src/lib/tests/client.test.ts \
  src/features/environments/tests/environments-store.test.ts \
  src/features/environments/tests/query-clients.test.ts \
  src/features/chat/hooks/tests/use-chat-shell-subscription.test.tsx
bun run typecheck
if rg -n "serverUrl" src --glob '!**/tests/**'; then exit 1; fi
```

Expected: `getClient()` follows `setActiveServerOrigin`; `setClient` still overrides for tests and
`fixtures.ts` restores the previous; a handshake with a different `environmentId` for a known origin
lands in `identity-drift` and applies no config; two origins get two distinct `QueryClient`s and a
generation bump on one does not touch the other.

## Phase 3 — Per-environment chat transport

### Work

1. Add `OrchestrationRpcClient.close()` and the `closed` refusal in `openSocket()`; add
   `createOrchestrationRpcClosedError` to the transport's structured-error catalog.
2. Delete the module client and five bound exports (`orchestration-rpc-client.ts:662-676`); delete
   the singletons in `thread-detail-subscriptions.ts:443-448` and `thread-earlier-pages.ts:88-92`.
3. Create `transport/chat-transport.ts` and `transport/create-chat-transport.ts`; delete
   `features/chat/environment/`. `ChatTransport` gains `close`, `retainThreadDetail`,
   `loadEarlierPage`.
4. Rename `ChatModeSession.environment` → `transport`; `ChatModeSessionProvider` creates it from the
   active origin and closes it on change/unmount. Update every consumer from the drift search,
   including the eleven test files.
5. `chat-view.tsx` and `use-thread-earlier-page.ts` use the transport from context.
6. Delete `isUnauthorizedClose`; map `code === 1008` to blocked. In
   `language-server-plugin.ts:296`, preserve `onDidNavigateDiagnostic` while replacing the dead
   origin half. If the path triple cannot be threaded directly, read `activeServerOrigin()` there
   and record that residue.
7. Register `environment.devSwitchOrigin` and build `dev-origin-dialog.tsx`.

### Verify

```sh
cd apps/web
bun --bun vitest run --project node --project dom \
  src/features/chat/transport/tests/orchestration-rpc-client.test.ts \
  src/features/chat/transport/tests/create-chat-transport.test.ts \
  src/features/chat/hooks/tests/use-chat-shell-subscription.test.tsx \
  src/features/chat-mode/components/tests/session-rail.test.tsx \
  src/features/chat-mode/components/tests/stage-header.test.tsx
bun run typecheck
bun run lint
if rg -n "ChatEnvironment|createLocalChatEnvironment|localOrchestrationRpcClient|localThreadDetailSubscriptionCache|localThreadEarlierPageLoader|isUnauthorizedClose" src; then exit 1; fi
```

Expected: `close()` ends a live shell subscription with the closed error and a later `openSocket`
refuses; two transports over two in-process servers dispatch to their own server; a clean close with
no frame and no code is `reconnecting`, a `1008` close is `blocked`.

## Phase 4 — Two-server switch gate

### Work

Create `apps/web/src/features/environments/tests/two-server-switch.test.tsx` on
`apps/web/test/fixtures.ts`: boot two `makeTestServer()` instances, register both origins through
`environmentClientFor` backed by `app.handle` (extend `test/env/dom.ts`'s `createInProcessClient` to
take an app), mount the real provider stack with `renderWithProviders`, and assert:

1. Files: writing a file to server A's root and switching to B shows B's tree with no A entries, and
   switching back shows A's from a fresh fetch, not a stale cache.
2. Chat: a project created on A is absent from B's projection after the switch and the previous
   transport is closed (its RPC client reports `closed`).
3. Identity: forging B's handshake to carry A's `environmentId` produces `identity-drift` and no
   projection change.
4. Restart: bumping A's `serverInstanceId` invalidates A's queries only.

Then, by hand against the running dev server: start a second server with
`PORT=3002 FS_METADATA_DB=/tmp/claude-1000/.../env-b.sqlite bun apps/server/src/index.ts`, run
`environment.devSwitchOrigin` to `http://127.0.0.1:3002`, open a folder, edit and save a file, open a
terminal, run a command, open chat, switch back. No reload at any step. Stop the second server.

### Verify

```sh
cd apps/web
bun --bun vitest run --project node --project dom src/features/environments/tests/two-server-switch.test.tsx
bun run typecheck && bun run lint && bun run format:check
cd ../.. && git diff --check && git status --short
```

## Done when

- No module in `apps/web/src` reads an origin at import time; `getClient()` answers for the active
  environment; the test seam is unchanged for existing tests.
- Every server has a stable `environmentId` in its own database, in `/health`, and in the handshake;
  protocol version is `4`; drift is refused.
- One `QueryClient` per origin, swapped synchronously; restart invalidation is per origin.
- One `ChatTransport` per origin with `close()`; no bound module singletons; the folder
  `features/chat/environment/` and the type `ChatEnvironment` no longer exist.
- `1008` on refusal; the silent-clean-close heuristic is gone.
- The two-server gate passes and the manual switch works without reload.
- Diff review shows only intended changes, including preserved diagnostic-navigation plumbing.

## STOP conditions

Stop and ask the operator if:

- Root `PLAN.md` has not scheduled this plan.
- Eden's `treaty` in the installed version exposes a way to re-point a client (then the registry is
  unnecessary and the design should shrink).
- Swapping `QueryClientProvider`'s client at runtime unmounts subtrees or resets state the workbench
  cannot recover from; report what breaks before adding a workaround.
- `OrchestrationRpcClient.close()` cannot end in-flight `AsyncIterable` subscriptions without
  changing the stream protocol.
- Any step would bind a server off loopback or write a credential anywhere.

## Maintenance

If anchors move before execution, update the drift preamble and phase paths first. When complete,
delete this plan, update `docs/environments-and-remote-plan.md` §6 and the Appendix, and replace the
`PLAN.md` lane entry with the landed foundation; git history is the archive.
