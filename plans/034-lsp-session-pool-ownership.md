# Plan 034: `LspSessionPool` with an owner and `disposeAll()`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for plan 034 in
> `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat ace313f -- apps/server/src/lsp/proxy-session.ts apps/server/src/lsp/routes.ts apps/server/src/app.ts apps/server/src/lsp/tests/proxy-session.test.ts apps/server/src/lsp/tests/routes.test.ts
> ```
>
> (No `..HEAD` on purpose — this form compares the planning commit against your
> **working tree**, so uncommitted edits to in-scope files show up too.)
>
> Expected: **no output** (no in-scope file has changed since this plan was
> written). If any file is listed, compare the "Current state" excerpts below
> against the live code before proceeding; on a mismatch, treat it as a STOP
> condition.
>
> **Record the baseline before you touch anything** — you will need both files
> in step 6 and in "Done criteria":
>
> ```bash
> git status --porcelain > /tmp/034-status-before.txt
> cd apps/server && bun --bun vitest run > /tmp/034-tests-before.txt 2>&1; tail -5 /tmp/034-tests-before.txt
> ```
>
> The working tree may already carry unrelated changes, and the server suite is
> already red at `ace313f` (see "Known-red baseline" below). Neither is yours.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/013-test-baseline-repairs.md` helps (it stops the server
  suite writing to the developer's real SQLite file); not a hard blocker — this
  plan's new app-level test injects an in-memory database of its own.
- **Category**: architecture
- **Planned at**: commit `ace313f`, 2026-08-16

## Why this matters

The pool of live language-server child processes — jdtls, gopls, rust-analyzer,
tsserver, ty — lives in two module-level `Map`s that nothing outside
`apps/server/src/lsp/proxy-session.ts` can reach. `createApp` therefore has no
handle on it, `appCleanup` cannot dispose it, and **every language server the
server ever spawned keeps running after the server shuts down**, idling on the
developer's machine until they notice and `kill` it by hand. A jdtls instance is
hundreds of megabytes of resident JVM.

The same globality is a correctness bug in-process: the pool key is
`` `${match.server.id}\u0000${match.root}` `` and carries no app identity, so two
`createApp` instances in one process (every server test file builds several) are
silently handed each other's backends.

The test suite already pays for this in cash: `proxy-session.test.ts` mutates a
process env var in `beforeEach`, mints a per-fixture unique server id so pool
entries cannot collide across tests, and sleeps a millisecond after every
dispose. All three vanish once the pool has an owner.

After this plan: the pool is an object constructed by `createApp`, torn down by
`appCleanup` (which Elysia's `.onStop` and `closeApp()` both run), and provable
by a test that asserts the child process was killed.

## Current state

### Files and their roles

- `apps/server/src/lsp/proxy-session.ts` — the LSP proxy. Holds the two global
  pool maps (lines 77–78), the `LspProxySession.create` entry point (81–92), the
  pooled-session class `PooledLspProxySession` (94–629), and the module-level
  pool helpers `pooledLspProxySession` / `removePooledSession` /
  `lspProxySessionKey` (694–721).
- `apps/server/src/lsp/routes.ts` — the `/lsp` WebSocket handler. Already has the
  dependency seam this plan hangs ownership on (lines 38–46).
- `apps/server/src/app.ts` — `createApp` (66–178), `closeApp` (182–184),
  `appCleanup` (186–200). Mounts the LSP routes at line 164.
- `apps/server/src/lsp/tests/proxy-session.test.ts` — three pooling tests plus the
  fake-process fixture. Carries the three workarounds.
- `apps/server/src/lsp/tests/routes.test.ts` — one buffering test; injects fakes
  through `LspRouteDeps`.

### The globals — `apps/server/src/lsp/proxy-session.ts:77-92`

```ts
const pooledSessions = new Map<string, PooledLspProxySession>()
const startingSessions = new Map<string, Promise<PooledLspProxySession | null>>()
const DEFAULT_IDLE_TIMEOUT_MS = 120_000

export class LspProxySession {
  static async create(
    socket: LspProxySocket,
    match: LspServerMatch,
    rootPath: string,
  ): Promise<LspProxyClientSession | null> {
    const session = await pooledLspProxySession(match, rootPath)
    if (!session) return null

    return session.connect(socket)
  }
}
```

Neither map is exported. `LspProxySession` is a static-only class wrapping one
function.

### The pool helpers — `apps/server/src/lsp/proxy-session.ts:694-721`

```ts
async function pooledLspProxySession(match: LspServerMatch, rootPath: string) {
  const key = lspProxySessionKey(match)
  const existing = pooledSessions.get(key)
  if (existing && !existing.isDisposed) return existing
  if (existing) pooledSessions.delete(key)

  const starting = startingSessions.get(key)
  if (starting) return starting

  const created = PooledLspProxySession.spawn(key, match, rootPath)
    .then((session) => {
      if (session) pooledSessions.set(key, session)
      return session
    })
    .finally(() => startingSessions.delete(key))
  startingSessions.set(key, created)
  return created
}

function removePooledSession(session: PooledLspProxySession): void {
  if (pooledSessions.get(session.key) !== session) return

  pooledSessions.delete(session.key)
}

function lspProxySessionKey(match: LspServerMatch): string {
  return `${match.server.id}\u0000${match.root}`
}
```

Note the `.then` handler: it inserts into the map unconditionally. A spawn in
flight when the app shuts down lands in the pool _after_ teardown.

### Disposal today — `apps/server/src/lsp/proxy-session.ts:551-583`

```ts
  private scheduleIdleDisposal(): void {
    this.clearIdleTimer()
    this.idleTimer = setTimeout(() => this.dispose('idle_timeout'), lspIdleTimeoutMs())
  }

  private clearIdleTimer(): void {
    if (!this.idleTimer) return

    clearTimeout(this.idleTimer)
    this.idleTimer = null
  }

  private closeFromProcess(outcome: string): void {
    if (this.disposed) return

    this.disposed = true
    removePooledSession(this)
    this.rejectPendingRequests(createInternalError(`LSP process closed: ${outcome}`))
    this.recordSession(outcome)
    for (const connection of this.connections) connection.closeSocket()
    this.connections.clear()
  }

  private dispose(outcome: string): void {
    if (this.disposed) return

    this.disposed = true
    this.clearIdleTimer()
    removePooledSession(this)
    this.rejectPendingRequests(createInternalError(`LSP session disposed: ${outcome}`))
    this.process.kill()
    this.recordSession(outcome)
  }
```

Three facts that matter:

1. `dispose` is `private` and only reachable from the 120-second idle timer.
2. `dispose` does **not** close client sockets — safe today because idle disposal
   only fires when `connections.size === 0`, but wrong the moment shutdown can
   dispose a session that still has clients attached.
3. The idle timer is not `unref`'d, so a 120s handle can hold the process open.

### The routes seam — `apps/server/src/lsp/routes.ts:38-46, 84`

```ts
export type LspRouteDeps = {
  readonly matchServer?: typeof matchLspServer
  readonly createSession?: typeof LspProxySession.create
}

export function lspRoutes(fs: LspRouteFileSystem, auth: AuthConfig, deps: LspRouteDeps = {}) {
  const sessions = new WeakMap<object, PendingLspSession>()
  const matchServer = deps.matchServer ?? matchLspServer
  const createSession = deps.createSession ?? LspProxySession.create
```

```ts
const session = await createSession(socket, match, fs.paths.toRelative(match.root))
```

### The app — `apps/server/src/app.ts:129-131, 164, 175-176, 182-200`

```ts
const auth = createAuthConfig(options.auth)
const cleanup = appCleanup(terminal, fs, settings)
```

```ts
    .ws('/lsp', lspRoutes(fs, auth))
```

```ts
    .onStop(cleanup)
  appCleanups.set(configured, cleanup)
```

```ts
export async function closeApp(app: App) {
  await appCleanups.get(app)?.()
}

function appCleanup(terminal: TerminalService, fs: FileSystemService, settings: SettingsStore) {
  let closed = false

  return async () => {
    if (closed) return

    closed = true
    terminal.dispose()
    // Releases the settings file watchers; without this a test run leaks a
    // native handle per app it builds.
    settings.close()
    await fs.close()
    await flushObservability()
  }
}
```

There is no LSP disposal anywhere in that cleanup. `apps/server/src/index.ts`
installs `SIGINT`/`SIGTERM` handlers that call `app.stop()` (which runs
`.onStop`) and then `process.exit(...)`, so wiring the pool into `appCleanup` is
enough to make production shutdown kill the language servers.

### The three test workarounds — `apps/server/src/lsp/tests/proxy-session.test.ts`

```ts
14  const previousIdleTimeout = process.env.PLATFORM_LSP_IDLE_TIMEOUT_MS
15
16  beforeEach(() => {
17    process.env.PLATFORM_LSP_IDLE_TIMEOUT_MS = '0'
18  })
19
20  afterEach(async () => {
21    process.env.PLATFORM_LSP_IDLE_TIMEOUT_MS = previousIdleTimeout
```

```ts
140      id: `typescript-${path.basename(root)}`,
```

```ts
50    first!.dispose()
51    second!.dispose()
52    await Bun.sleep(1)
```

(The same three-line tail repeats at lines 77–79 and 104–106.)

> **Honesty note on the unique id.** Each fixture already gets a unique
> `mkdtemp` root, and the pool key includes the root, so the per-fixture server
> id was already redundant. Dropping it is a clarity win, not a correctness one.
> The env mutation and the sleeps are load-bearing today and genuinely go away.

### Existing fixture the tests use — `apps/server/src/lsp/tests/proxy-session.test.ts:124-193`

`lspFixture()` builds a `PassThrough`-backed fake `ChildProcessWithoutNullStreams`
with a `vi.fn()` `kill` that emits `exit`, a `vi.fn()` `spawn` returning it, a
`LspServerMatch` pointing at a temp root, and two `FakeSocket`s recording sent
JSON. `fakeProcess()` returns `{ kill, process, stderr, stdin, stdout }` — the
`kill` spy is already exposed but never asserted on.

### Repo conventions that apply here — quoted from `AGENTS.md`

The executor has not read that file. These are the rules this plan must honor:

- > "Never throw `new Error`. Create errors with `createError` from `evlog` — in
  > practice through the feature's `structured-errors.ts` wrapper
  > (`createStructuredError` or a `defineErrorCatalog` entry) so the error carries
  > `code`, `status`, `why`, and `fix`."

  This file already complies: it uses `createInternalError` from
  `../observability/structured-errors` (`proxy-session.ts:1`). All disposal errors
  in new code must go through it too.

- > "Logging is wide-event style (evlog). Always prefer wide logs: enrich the one
  > event per operation/request with more fields instead of emitting extra narrow
  > log lines."

  `recordSession(outcome)` is already that one wide event per session. Shutdown
  reuses it with a new `outcome` value. **Do not add a pool-level log line.**

- > "This project is greenfield and not live: no releases, no external users, no
  > data anyone needs migrated. No backward compatibility shims, no legacy
  > aliases, no deprecation windows. Update every call site in the same pass."

  `LspProxySession` is deleted outright, not kept as an alias.

- > "Keep nesting depth to 3 or less. Use guard clauses and early returns. Keep
  > the happy path shallow. … Do not use `else` after an early return."

- > "Do not create empty folders. Import exact files through `@/`. Do not add
  > barrel `index.ts` files."

- > "A dev server is always running. Never spin up your own server to test or
  > verify changes — reuse the running one."

- > "Do not `mock.module` or `vi.mock` our server, client, or feature modules.
  > … Use injectable factories for PTY and LSP child processes."

  The existing `routes.test.ts` states this in a code comment (lines 53–54):
  _"Inject fakes through lspRoutes' deps instead of mocking modules — Bun module
  mocks are global and would leak the fake registry into other test files."_
  Keep that property.

- Server tests import `{ describe, it, expect }` from `vitest` directly. The
  `apps/web/test/fixtures.ts` rule in AGENTS.md is for **web** app tests; server
  tests under `apps/server/src/**/tests/` use plain vitest imports. Match the
  files around you.

### Known-red baseline — read before you run any test

Measured at `ace313f`, on a clean tree, before any of this plan's edits:

| Command                                               | Baseline result                 |
| ----------------------------------------------------- | ------------------------------- |
| `cd apps/server && bun run typecheck`                 | exit 0                          |
| `cd apps/server && bun run lint`                      | exit 0                          |
| `cd apps/server && bun run format:check`              | exit 0                          |
| `cd apps/server && bun --bun vitest run src/lsp`      | 5 files, **19 passed**          |
| `cd apps/server && bun run test` (whole server suite) | **1 failed / 772 passed (773)** |

The one failure is:

```
FAIL src/tests/app.test.ts > fs rpc events > reports external file updates from the native watcher
Error: timed out waiting for matching filesystem event
```

It reproduces deterministically at `ace313f`, has nothing to do with the LSP
pool, and is **not yours to fix** — it belongs to `plans/013-test-baseline-repairs.md`.
Do not spend a single step on it. Everywhere this plan asks for "the server suite
passes", it means _that one failure and no other_.

## Commands you will need

Run from the repo root unless noted.

| Purpose            | Command                                          | Expected on success                                                      |
| ------------------ | ------------------------------------------------ | ------------------------------------------------------------------------ |
| Typecheck (server) | `cd apps/server && bun run typecheck`            | exit 0, no errors                                                        |
| LSP tests only     | `cd apps/server && bun --bun vitest run src/lsp` | 19 pass before this plan, 26 after                                       |
| Server test suite  | `cd apps/server && bun run test`                 | exits 1 with exactly the one known-red failure above; nothing else fails |
| Lint (server)      | `cd apps/server && bun run lint`                 | exit 0                                                                   |
| Format check       | `cd apps/server && bun run format:check`         | exit 0                                                                   |
| Format (write)     | `cd apps/server && bun run format`               | exit 0                                                                   |
| Full repo verify   | `bun run verify`                                 | not a gate for this plan — see step 6                                    |

`--bun` is mandatory for the server suite — without it `bun:sqlite` and
`Bun.spawn` do not resolve. `bun --bun vitest run src/lsp` filters by path
substring; the server project has no `--project` flags.

## Scope

**In scope** (the only files you may modify):

- `apps/server/src/lsp/proxy-session.ts`
- `apps/server/src/lsp/routes.ts`
- `apps/server/src/app.ts`
- `apps/server/src/lsp/tests/proxy-session.test.ts`
- `apps/server/src/lsp/tests/routes.test.ts`
- `plans/README.md` (status row only, at the end)

**Out of scope** (do NOT touch, even though they look related):

- `apps/server/src/lsp/registry.ts` and `apps/server/src/lsp/installers.ts` — how
  servers are matched, downloaded and spawned. The pool owns lifetimes, not
  discovery; changing them widens the blast radius for zero benefit here.
- `lspIdleTimeoutMs()` and its `PLATFORM_LSP_IDLE_TIMEOUT_MS` /
  `FS_LSP_IDLE_TIMEOUT_MS` env reads (`proxy-session.ts:929-935`) — plan 035
  moves the LSP env knobs onto the settings registry. Editing them here creates a
  conflict with that plan.
- `apps/server/src/terminal/service.ts` — same _shape_ of problem (child
  processes in a map) but it already has an owner and a `dispose()` that
  `appCleanup` calls. Nothing to fix.
- **All of `apps/server/src/tests/app.test.ts`.** It is a read-only reference for
  the `createApp(...)` option shape (step 5e), nothing more. Do not add the LSP
  teardown test there, do not change `testApp`, and above all do not touch the
  failing `reports external file updates from the native watcher` case — that is
  plan 013's known-red baseline.
- `apps/web/test/server.ts` — also a read-only reference (the in-memory-database
  pattern). Copy from it; never edit it.
- Any `apps/web` LSP client code — the wire protocol does not change.
- `apps/server/src/index.ts` shutdown handlers — they already call `app.stop()`,
  which runs `.onStop`. No change needed.
- `apps/server/src/testing.ts` — do **not** re-export `LspSessionPool` from it.
  Nothing outside `apps/server/src` constructs a pool today; adding the export
  now creates a public seam with no consumer.
- `apps/server/src/observability/**` — do not add a pool-level log event. Shutdown
  is already visible as `outcome: "app_shutdown"` on the existing per-session
  `lsp.session` wide event, and AGENTS.md's wide-event rule forbids a second
  narrow line counting the same thing.
- Any other plan file, including `plans/035-lsp-env-knobs-to-settings-registry.md`.
  The only edit outside `apps/server/src` is the one status cell in
  `plans/README.md`.
- The pre-existing `throw new Error(...)` calls inside the LSP test helpers
  (`proxy-session.test.ts:63, 114, 202`). They are test-only and rewriting them
  is a separate concern.
- `packages/editor-*` — these are symlinks to a sibling checkout, never in scope.

## Git workflow

**All work happens on `main`** — no new branches, worktrees, commits, pushes, or
PRs unless the operator explicitly asks. Leave the changes in the working tree
when you are done unless told otherwise.

If the operator does ask for a commit: conventional commits, lowercase
descriptive subject. Real examples from `git log`:

```
refactor(orchestration): the server prepares a session's worktree (M-C)
fix(address): bound the URL, and stop escaping slashes in ?tabs=
```

A fitting subject here: `refactor(lsp): give the session pool an owner and disposeAll()`.

## Steps

> **Steps 1–4 are one atomic edit.** `bun run typecheck` will fail _between_
> them, because step 1 deletes an export that steps 2–4 still reference. That is
> expected. Do not "fix" it by leaving the old globals or the old
> `LspProxySession` class in place. The first verification gate is at the end of
> step 4.

### Step 1: Replace the module globals with an `LspSessionPool` class

File: `apps/server/src/lsp/proxy-session.ts`.

**1a.** Export the socket type so the pool's public signature can name it.
Line 67 changes from `type LspProxySocket = {` to `export type LspProxySocket = {`.

**1b.** Replace lines 77–92 (`pooledSessions`, `startingSessions`, and the whole
`export class LspProxySession { ... }`) with the pool class below. Keep
`const DEFAULT_IDLE_TIMEOUT_MS = 120_000`.

```ts
const DEFAULT_IDLE_TIMEOUT_MS = 120_000

/**
 * The seam `lspRoutes` depends on. `LspSessionPool` satisfies it structurally,
 * so a route test can hand in a stub without spawning a fake child process.
 */
export type LspSessionSource = {
  acquire(
    socket: LspProxySocket,
    match: LspServerMatch,
    rootPath: string,
  ): Promise<LspProxyClientSession | null>
}

/**
 * Owns every pooled language-server child process belonging to one app.
 *
 * This was two module-level Maps. `createApp` had no handle on them, so
 * `closeApp()` left jdtls/gopls/rust-analyzer running on the developer's
 * machine, and the pool key — server id plus root, no app identity — handed two
 * apps in one process each other's backends. The pool is now constructed in
 * `createApp` and torn down by `appCleanup`.
 */
export class LspSessionPool implements LspSessionSource {
  private readonly sessions = new Map<string, PooledLspProxySession>()
  private readonly starting = new Map<string, Promise<PooledLspProxySession | null>>()
  private disposed = false

  /** Live pooled backends. Read by teardown assertions. */
  get size(): number {
    return this.sessions.size
  }

  async acquire(
    socket: LspProxySocket,
    match: LspServerMatch,
    rootPath: string,
  ): Promise<LspProxyClientSession | null> {
    if (this.disposed) return null

    const session = await this.pooledSession(match, rootPath)
    if (!session) return null
    // `pooledSession` is async, so shutdown can land in the await gap.
    if (this.disposed || session.isDisposed) return null

    return session.connect(socket)
  }

  /**
   * Kills every backend and closes every client socket.
   *
   * Idempotent on purpose: Elysia's `.onStop` and an explicit `closeApp()` can
   * both fire for the same app, and a second kill would log a second session
   * event for a process that is already gone.
   */
  disposeAll(): void {
    if (this.disposed) return

    this.disposed = true
    // Array copy: `dispose` calls back into `remove` and mutates the map.
    for (const session of Array.from(this.sessions.values())) session.dispose('app_shutdown')
    this.sessions.clear()
  }

  remove(session: PooledLspProxySession): void {
    if (this.sessions.get(session.key) !== session) return

    this.sessions.delete(session.key)
  }

  private async pooledSession(match: LspServerMatch, rootPath: string) {
    const key = lspProxySessionKey(match)
    const existing = this.sessions.get(key)
    if (existing && !existing.isDisposed) return existing
    if (existing) this.sessions.delete(key)

    const starting = this.starting.get(key)
    if (starting) return starting

    return this.startSession(key, match, rootPath)
  }

  private startSession(key: string, match: LspServerMatch, rootPath: string) {
    const created = PooledLspProxySession.spawn(key, match, rootPath, this)
      .then((session) => this.adoptSession(key, session))
      .finally(() => this.starting.delete(key))
    this.starting.set(key, created)
    return created
  }

  /**
   * A spawn still in flight when the app shuts down would otherwise land in the
   * map after teardown and orphan the child process. Kill it on arrival.
   */
  private adoptSession(key: string, session: PooledLspProxySession | null) {
    if (!session) return null
    if (this.disposed) {
      session.dispose('pool_disposed')
      return null
    }

    this.sessions.set(key, session)
    return session
  }
}
```

**1c.** Give `PooledLspProxySession` a back-reference to its pool.

- Add `private readonly pool: LspSessionPool` to the field list and assign it in
  the constructor. The constructor signature (line 122) becomes:

  ```ts
    private constructor(
      key: string,
      match: LspServerMatch,
      process: ChildProcessWithoutNullStreams,
      rootPath: string,
      pool: LspSessionPool,
    ) {
  ```

  with `this.pool = pool` alongside the existing assignments.

- `static async spawn` (line 136) becomes:

  ```ts
    static async spawn(
      key: string,
      match: LspServerMatch,
      rootPath: string,
      pool: LspSessionPool,
    ) {
      const handle = await match.server.spawn(match.root)
      if (!handle) return null

      return new PooledLspProxySession(key, match, handle.process, rootPath, pool)
    }
  ```

**1d.** Rewrite the disposal block (current lines 551–583) to this:

```ts
  private scheduleIdleDisposal(): void {
    this.clearIdleTimer()
    const timer = setTimeout(() => this.dispose('idle_timeout'), lspIdleTimeoutMs())
    // A 120-second handle must not be the reason the process refuses to exit.
    timer.unref()
    this.idleTimer = timer
  }

  private clearIdleTimer(): void {
    if (!this.idleTimer) return

    clearTimeout(this.idleTimer)
    this.idleTimer = null
  }

  private closeFromProcess(outcome: string): void {
    if (this.disposed) return

    this.disposed = true
    this.clearIdleTimer()
    this.pool.remove(this)
    this.rejectPendingRequests(createInternalError(`LSP process closed: ${outcome}`))
    this.recordSession(outcome)
    this.closeConnections()
  }

  /**
   * Public because the pool disposes its sessions on app shutdown; before that,
   * only the idle timer could reach it.
   */
  dispose(outcome: string): void {
    if (this.disposed) return

    this.disposed = true
    this.clearIdleTimer()
    this.pool.remove(this)
    // Rejected before the sockets close so an in-flight `initialize` can still
    // deliver its JSON-RPC error. Ordinary forwarded requests carry no reject
    // handler: their client learns the turn is over from the socket closing.
    this.rejectPendingRequests(createInternalError(`LSP session disposed: ${outcome}`))
    this.process.kill()
    // Before `closeConnections`, so `activeConnectionCount` reports how many
    // clients shutdown actually cut off.
    this.recordSession(outcome)
    this.closeConnections()
  }

  private closeConnections(): void {
    for (const connection of this.connections) connection.closeSocket()
    this.connections.clear()
  }
```

Three deliberate changes beyond the pool wiring, all required for shutdown
correctness:

- `dispose` is no longer `private` (the pool calls it).
- `dispose` now closes client sockets. Idle disposal only ever runs with zero
  connections, so this is a no-op there; on shutdown it is the difference between
  a client hanging on a dead socket and a clean close.
- `closeFromProcess` also clears the idle timer and reuses `closeConnections`.

**1e.** Delete `pooledLspProxySession` (lines 694–711) and `removePooledSession`
(713–717) entirely. **Keep** `lspProxySessionKey` (719–721) exactly as it is —
the pool calls it.

**Verify** (typecheck is expected to fail here; this checks the deletions only):

```bash
grep -nE "pooledSessions|startingSessions|removePooledSession|pooledLspProxySession|(^|[^A-Za-z])LspProxySession" apps/server/src/lsp/proxy-session.ts
```

→ **no output**.

> The `(^|[^A-Za-z])` prefix is doing real work: macOS ships BSD grep, which does
> **not** honour `\b` in an ERE — `grep -E "\bLspProxySession\b"` happily matches
> inside `PooledLspProxySession` and would report a false failure forever. Use the
> character-class form in every grep in this plan. `LspProxyClientSession`,
> `LspProxySocket` and `PooledLspProxySession` are all correctly _not_ matched by
> this pattern.

### Step 2: Point the routes at an injected pool

File: `apps/server/src/lsp/routes.ts`.

Replace the `LspProxySession` import (line 8) with:

```ts
import type { LspProxyClientSession, LspSessionSource } from './proxy-session'
```

(`verbatimModuleSyntax` is on — a type-only import must say `import type`.)

Replace lines 38–46 with:

```ts
export type LspRouteDeps = {
  readonly matchServer?: typeof matchLspServer
  /**
   * Required: the app owns the pool so `appCleanup` can tear it down. There is
   * deliberately no module-global fallback — that was the bug.
   */
  readonly pool: LspSessionSource
}

export function lspRoutes(fs: LspRouteFileSystem, auth: AuthConfig, deps: LspRouteDeps) {
  const sessions = new WeakMap<object, PendingLspSession>()
  const matchServer = deps.matchServer ?? matchLspServer
```

Note `deps` loses its `= {}` default — the pool has no sensible default.

Replace line 84 with:

```ts
const session = await deps.pool.acquire(socket, match, fs.paths.toRelative(match.root))
```

Nothing else in this file changes. The `spawn_failed` warning emitted when
`session` is null now also covers "the pool was already disposed"; that is an
acceptable label for a WebSocket that opened during shutdown.

**Verify**:

```bash
grep -n "createSession" apps/server/src/lsp/routes.ts
```

→ **no output**.

### Step 3: Own the pool in `createApp` and dispose it in `appCleanup`

File: `apps/server/src/app.ts`.

**3a.** Add the import next to the existing LSP import (after line 13):

```ts
import { LspSessionPool } from './lsp/proxy-session'
```

**3b.** Add a test seam to `AppOptions` (the type already carries `terminal`,
`fonts` and `orchestration` seams for the same reason). Insert after the
`orchestration` block (line 53):

```ts
  lsp?: {
    /**
     * Test seam: inject a pool so a test can put a fake backend in it and
     * assert `closeApp` killed it. Production always builds its own.
     */
    pool?: LspSessionPool
  }
```

**3c.** In `createApp`, construct the pool and hand it to both the routes and the
cleanup. Line 130 becomes two lines:

```ts
const lspPool = options.lsp?.pool ?? new LspSessionPool()
const cleanup = appCleanup(terminal, fs, settings, lspPool)
```

Line 164 becomes:

```ts
    .ws('/lsp', lspRoutes(fs, auth, { pool: lspPool }))
```

**3d.** Extend `appCleanup` (lines 186–200):

```ts
function appCleanup(
  terminal: TerminalService,
  fs: FileSystemService,
  settings: SettingsStore,
  lspPool: LspSessionPool,
) {
  let closed = false

  return async () => {
    if (closed) return

    closed = true
    terminal.dispose()
    // Language servers are child processes. Without this, jdtls, gopls and
    // rust-analyzer outlive the server and idle on the machine until someone
    // notices and kills them by hand.
    lspPool.disposeAll()
    // Releases the settings file watchers; without this a test run leaks a
    // native handle per app it builds.
    settings.close()
    await fs.close()
    await flushObservability()
  }
}
```

`disposeAll()` must run **before** `flushObservability()` so the per-session
`lsp.session` wide events it emits are flushed with the rest.

**Verify**:

```bash
grep -c "lspPool" apps/server/src/app.ts
```

→ exactly `5`. Those five lines, and no others:

1. `const lspPool = options.lsp?.pool ?? new LspSessionPool()`
2. `const cleanup = appCleanup(terminal, fs, settings, lspPool)`
3. `.ws('/lsp', lspRoutes(fs, auth, { pool: lspPool }))`
4. `lspPool: LspSessionPool,` — the new `appCleanup` parameter
5. `lspPool.disposeAll()` inside the returned cleanup closure

Any other count means a step was half-applied. Re-read 3a–3d rather than adding
a sixth reference.

### Step 4: Update the routes test to the new seam

File: `apps/server/src/lsp/tests/routes.test.ts`.

Only `bufferedLspDeps` (lines 55–68) changes. Replace the `createSession` entry
with a `pool` stub:

```ts
// Inject fakes through lspRoutes' deps instead of mocking modules — Bun module
// mocks are global and would leak the fake registry into other test files.
function bufferedLspDeps(root: string, createdSessions: FakeLspProxySession[]): LspRouteDeps {
  return {
    matchServer: (async () => {
      await Bun.sleep(25)
      return { root, server: { id: 'buffered-lsp' } }
    }) as unknown as LspRouteDeps['matchServer'],
    pool: {
      acquire: async () => {
        await Bun.sleep(25)
        const session = new FakeLspProxySession()
        createdSessions.push(session)
        return session
      },
    },
  }
}
```

`FakeLspProxySession` already satisfies `LspProxyClientSession` structurally
(`handleClientMessage` returning `Promise<void>`, `dispose(): void`), so the
`pool` entry needs **no cast**. If you find yourself writing `as unknown as`
here, you made `pool` a nominal `LspSessionPool` instead of the structural
`LspSessionSource` — go back to step 1b.

**Verify** — this is the first real gate:

```bash
cd apps/server && bun run typecheck
```

→ exit 0, no errors.

```bash
cd apps/server && bun --bun vitest run src/lsp/tests/routes.test.ts
```

→ 1 test passed.

### Step 5: Rewrite the pool test and add the teardown cases

File: `apps/server/src/lsp/tests/proxy-session.test.ts`.

**5a. Drop the three workarounds.**

- Delete the `previousIdleTimeout` const (line 14) and the entire `beforeEach`
  block (lines 16–18); remove `beforeEach` from the `vitest` import.
- Delete the env restore line inside `afterEach` (line 21).
- Change the fixture server id (line 140) from
  `` id: `typescript-${path.basename(root)}` `` to `id: 'typescript'`.
- Delete the `first!.dispose(); second!.dispose(); await Bun.sleep(1)` tails from
  all three existing tests (lines 50–52, 77–79, 104–106). The pool's `afterEach`
  disposal replaces them.
  **Keep** the `await Bun.sleep(1)` inside `waitFor` (line 199) — it is the poll
  interval, not a workaround.

**5b. Give each fixture its own pool.** Replace the module preamble (the current
lines 13–23: `roots`, `previousIdleTimeout`, `beforeEach`, `afterEach`) with:

```ts
const databases: { close: () => void }[] = []
const pools: LspSessionPool[] = []
const roots: string[] = []

afterEach(async () => {
  for (const pool of pools.splice(0)) pool.disposeAll()
  // Same reason `appCleanup` closes the settings store: an unclosed SQLite
  // handle per app the file builds is a leaked native handle per test run.
  for (const database of databases.splice(0)) database.close()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
```

and import `LspSessionPool` instead of `LspProxySession`:

```ts
import { LspSessionPool } from '../proxy-session'
```

**5c. Extend `lspFixture`** to own a pool, expose the `kill` spy, and support
holding a spawn open. Target shape (keep everything else in the function as-is):

```ts
async function lspFixture() {
  const root = await fixtureRoot('platform-lsp-pool-')
  const pool = new LspSessionPool()
  pools.push(pool)

  const process = fakeProcess()
  const serverMessages: Record<string, unknown>[] = []
  const reader = new LspStdioMessageReader((message) => {
    serverMessages.push(JSON.parse(message) as Record<string, unknown>)
  })
  process.stdin.on('data', (chunk) => reader.push(chunk))

  // A spawn the test can hold open, to exercise a backend that lands *after*
  // the pool was disposed.
  let spawnGate: Promise<void> | null = null
  let openSpawnGate: (() => void) | null = null
  const spawn = vi.fn(async () => {
    if (spawnGate) await spawnGate
    return { process: process.process }
  })
  const match = {
    root,
    server: {
      extensions: ['.ts'],
      id: 'typescript',
      root: async () => root,
      spawn,
    },
  } satisfies LspServerMatch

  return {
    firstSocket: new FakeSocket(),
    kill: process.kill,
    match,
    pool,
    process,
    secondSocket: new FakeSocket(),
    serverMessages,
    spawn,
    holdSpawn: () => {
      spawnGate = new Promise<void>((resolve) => {
        openSpawnGate = resolve
      })
    },
    initializeMessages: () => serverMessages.filter((message) => message.method === 'initialize'),
    releaseSpawn: () => openSpawnGate?.(),
    respond: (message: unknown) => {
      process.stdout.write(encodeLspStdioMessage(JSON.stringify(message)))
    },
    waitForServerMessageCount: (count: number) =>
      waitFor(() => serverMessages.length >= count, `expected ${count} server messages`),
  }
}

async function fixtureRoot(prefix: string) {
  const root = await mkdtemp(path.join(tmpdir(), prefix))
  roots.push(root)
  return root
}
```

**5d. Swap the three existing tests onto the pool.** There are exactly **four**
call sites of `LspProxySession.create` in this file — lines 28, 29 (test 1) and
lines 112, 113 (inside the `initializedFixture` helper, which tests 2 and 3 use).
Each `LspProxySession.create(fixture.xSocket, fixture.match, '')` becomes
`fixture.pool.acquire(fixture.xSocket, fixture.match, '')`. Nothing else in those
three tests or in `initializedFixture` changes — they must still assert exactly
what they assert today (one spawn, one initialize forwarded, responses routed to
the originating socket, one shared didOpen/didClose).

**5e. Add a second `describe` block** with the seven new cases below. `json`,
`hoverRequest`, `initializeRequest`, `initializedFixture` and `FakeSocket` already
exist in the file — reuse them, do not redefine.

```ts
describe('LspSessionPool ownership', () => {
  it('kills the backend and closes client sockets on disposeAll', async () => {
    const fixture = await lspFixture()
    await fixture.pool.acquire(fixture.firstSocket, fixture.match, '')
    await fixture.pool.acquire(fixture.secondSocket, fixture.match, '')

    fixture.pool.disposeAll()

    expect(fixture.kill).toHaveBeenCalledTimes(1)
    expect(fixture.pool.size).toBe(0)
    expect(fixture.firstSocket.closed).toBe(true)
    expect(fixture.secondSocket.closed).toBe(true)
  })

  it('is idempotent — a second disposeAll kills nothing twice', async () => {
    const fixture = await lspFixture()
    await fixture.pool.acquire(fixture.firstSocket, fixture.match, '')

    fixture.pool.disposeAll()
    fixture.pool.disposeAll()

    expect(fixture.kill).toHaveBeenCalledTimes(1)
    expect(fixture.pool.size).toBe(0)
  })

  it('leaves an in-flight request unanswered and closes the socket instead', async () => {
    const fixture = await initializedFixture()
    const sentBefore = fixture.firstSocket.sent.length
    await fixture.first.handleClientMessage(json(hoverRequest(10, 'file:///repo/a.ts')))

    fixture.pool.disposeAll()

    expect(fixture.firstSocket.sent).toHaveLength(sentBefore)
    expect(fixture.firstSocket.closed).toBe(true)
  })

  it('refuses to spawn a backend after disposeAll', async () => {
    const fixture = await lspFixture()
    fixture.pool.disposeAll()

    const session = await fixture.pool.acquire(fixture.firstSocket, fixture.match, '')

    expect(session).toBeNull()
    expect(fixture.spawn).not.toHaveBeenCalled()
  })

  it('kills a backend whose spawn lands after disposeAll', async () => {
    const fixture = await lspFixture()
    fixture.holdSpawn()
    const acquired = fixture.pool.acquire(fixture.firstSocket, fixture.match, '')

    fixture.pool.disposeAll()
    fixture.releaseSpawn()

    expect(await acquired).toBeNull()
    expect(fixture.kill).toHaveBeenCalledTimes(1)
    expect(fixture.pool.size).toBe(0)
  })

  // The negative case for step 1d. `disposeAll` shuts the pool for good, but a
  // backend that dies on its own must NOT shut the pool — it must be evicted so
  // the next client spawns a fresh one. Without this, tightening disposal could
  // silently wedge a live pool on the first language-server crash.
  it('evicts a backend that exits on its own and respawns for the next client', async () => {
    const fixture = await lspFixture()
    await fixture.pool.acquire(fixture.firstSocket, fixture.match, '')

    fixture.process.process.emit('exit', 0, null)

    expect(fixture.pool.size).toBe(0)
    expect(fixture.firstSocket.closed).toBe(true)

    const next = await fixture.pool.acquire(fixture.secondSocket, fixture.match, '')

    expect(next).not.toBeNull()
    expect(fixture.spawn).toHaveBeenCalledTimes(2)
    expect(fixture.pool.size).toBe(1)
  })

  it('closeApp disposes the pooled LSP sessions', async () => {
    const fixture = await lspFixture()
    const app = lspTestApp(await fixtureRoot('platform-lsp-app-'), fixture.pool)
    await fixture.pool.acquire(fixture.firstSocket, fixture.match, '')

    await closeApp(app)

    expect(fixture.kill).toHaveBeenCalledTimes(1)
    expect(fixture.pool.size).toBe(0)
  })
})

// An in-memory database and a settings file inside the test's own temp root:
// `createApp` otherwise opens the developer's real ~/.platform SQLite and
// settings.json, and this repo keeps no healing code for either.
function lspTestApp(root: string, pool: LspSessionPool) {
  const database = createMetadataDatabase({ databasePath: ':memory:' })
  databases.push(database)
  return createApp({
    auth: { allowedOrigins: ['http://localhost:5173'] },
    lsp: { pool },
    metadataDatabase: database,
    orchestration: { database: database.db },
    settings: testSettingsOptions(root),
    watch: false,
    workspaceRoot: root,
  })
}
```

New imports this file needs:

```ts
import { closeApp, createApp } from '../../app'
import { createMetadataDatabase } from '../../db/client'
import { testSettingsOptions } from '../../settings/testing'
```

`initializedFixture` currently returns `first`/`second` after a non-null throw
guard, so `fixture.first.handleClientMessage(...)` typechecks without `!`. Leave
that helper's body alone apart from the `LspProxySession.create` → `pool.acquire`
swap.

**Verify**:

```bash
cd apps/server && bun --bun vitest run src/lsp
```

→ `Test Files 5 passed (5)`, `Tests 26 passed (26)`.

The arithmetic, so you can tell a real failure from a miscount: the baseline
(measured at `ace313f`) is **19 passed across 5 files** — `proxy-session.test.ts`
(3), `routes.test.ts` (1), plus `registry.test.ts`, `stdio-rpc.test.ts` and
`typescript/tests/session.test.ts`, which this plan does not touch. Adding seven
`LspSessionPool ownership` cases gives 26. If you see a number other than 26 but
all files pass, count the `it(` blocks you actually added before assuming
anything is broken.

```bash
grep -c "Bun.sleep(1)" apps/server/src/lsp/tests/proxy-session.test.ts
```

→ `1` (only the poll inside `waitFor`).

```bash
grep -n "PLATFORM_LSP_IDLE_TIMEOUT_MS\|beforeEach" apps/server/src/lsp/tests/proxy-session.test.ts
```

→ **no output**.

### Step 6: Full verification

```bash
cd apps/server && bun run format && bun run format:check && bun run lint && bun run typecheck
```

→ all four exit 0. Then the whole server suite:

```bash
cd apps/server && bun --bun vitest run > /tmp/034-tests-after.txt 2>&1; tail -20 /tmp/034-tests-after.txt
```

→ exits 1 with **exactly one** failure, and that failure is the known-red
`src/tests/app.test.ts > fs rpc events > reports external file updates from the
native watcher`. Total count rises by seven: baseline `1 failed | 772 passed
(773)` becomes `1 failed | 779 passed (780)`.

Diff the two runs to be sure nothing else moved:

```bash
diff <(grep -E "^ (❯|✓|×|FAIL)" /tmp/034-tests-before.txt) <(grep -E "^ (❯|✓|×|FAIL)" /tmp/034-tests-after.txt)
```

→ the only differences mention `src/lsp/`. Any other file appearing in the diff
is a regression you caused — that is a STOP condition.

**Do not run `git stash`.** The working tree may hold unrelated in-progress work
that is not yours to move, and `git stash` does not carry untracked files anyway,
so the "is it pre-existing?" question it appears to answer, it does not. The
known-red baseline table plus `/tmp/034-tests-before.txt` already answer it.

**`bun run verify` at the repo root is not a gate for this plan.** It runs
`typecheck && lint && format:check && test` across every workspace, including
`apps/web`, and it will inherit both the known-red server test and whatever
unrelated state the tree is in. Run it only if the operator asks; if you do and
something outside `apps/server` fails, report it and stop — do not fix it.

### Step 7: Update the plan index

In `plans/README.md`, change the status cell for row `034` in the "Phase 3 —
Structural" table from `TODO` to `DONE`. Change nothing else in that file.

## Test plan

**New tests** — all in `apps/server/src/lsp/tests/proxy-session.test.ts`, in a new
`describe('LspSessionPool ownership')` block. They live next to the existing
pooling tests because the fake-process fixture is there and AGENTS.md forbids
redefining per-file factories.

| #   | Case                                                                      | What it pins down                                                                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `kills the backend and closes client sockets on disposeAll`               | The core fix: `kill` fires once, pool empties, both client sockets close.                                                                                                                                                                                                                                                                           |
| 2   | `is idempotent — a second disposeAll kills nothing twice`                 | `closeApp()` and Elysia's `.onStop` can both fire for one app.                                                                                                                                                                                                                                                                                      |
| 3   | `leaves an in-flight request unanswered and closes the socket instead`    | The documented in-flight contract: a forwarded request carries no reject handler, so shutdown answers with a socket close, not a JSON-RPC error.                                                                                                                                                                                                    |
| 4   | `refuses to spawn a backend after disposeAll`                             | A WebSocket opening during shutdown must not start a new language server.                                                                                                                                                                                                                                                                           |
| 5   | `kills a backend whose spawn lands after disposeAll`                      | The `adoptSession` guard — the narrow race that used to orphan a process permanently.                                                                                                                                                                                                                                                               |
| 6   | `evicts a backend that exits on its own and respawns for the next client` | **The negative case.** Cases 1–5 prove disposal got tighter; this one proves it did not get tighter in the wrong place. A backend that crashes must be evicted, not treated as a pool shutdown, and the next `acquire` must spawn again. It is also the only cover for `closeFromProcess` gaining `clearIdleTimer` + `closeConnections` in step 1d. |
| 7   | `closeApp disposes the pooled LSP sessions`                               | The app wiring itself: `appCleanup` really calls `disposeAll`.                                                                                                                                                                                                                                                                                      |

**Structural pattern to model on**: the existing
`describe('LspProxySession pooling')` block in the same file — same fixture, same
`FakeSocket`, same `vi.fn()` spies. For the `createApp` options in `lspTestApp`,
model on `testApp` in `apps/server/src/tests/app.test.ts:992-1018` plus the
in-memory-database pattern in `apps/web/test/server.ts:30-45`.

**Rewritten, not new**: the three existing pooling tests keep their assertions
verbatim and only swap `LspProxySession.create(...)` for
`fixture.pool.acquire(...)`. If any of their assertions has to change to keep
them green, that is a behavior regression — STOP.

**Verification**: `cd apps/server && bun --bun vitest run src/lsp` → 26 tests
pass across 5 files (19 at baseline + 7 new ownership cases).

**Manual check (operator only, optional — do not do this yourself).** Proving the
real fix requires restarting the running server, and AGENTS.md says _"A dev server
is always running. Never spin up your own server to test or verify changes."_ If
the operator wants the end-to-end proof: open a `.ts` file in the app at
http://localhost:5173 so a language server spawns, run
`pgrep -fl typescript-language-server`, restart the dev server, and run `pgrep`
again — before this change the process survives, after it does not.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `cd apps/server && bun run typecheck` exits 0
- [ ] `cd apps/server && bun run lint` exits 0
- [ ] `cd apps/server && bun run format:check` exits 0
- [ ] `cd apps/server && bun --bun vitest run` → `1 failed | 779 passed (780)`,
      and the one failure is the known-red native-watcher test in
      `src/tests/app.test.ts`. **Not** "exits 0" — that is impossible at this
      commit and is plan 013's job, not yours.
- [ ] `cd apps/server && bun --bun vitest run src/lsp` → `Tests 26 passed (26)`,
      including the 7 new `LspSessionPool ownership` cases
- [ ] `grep -rnE "(^|[^A-Za-z])LspProxySession" apps/server/src` → no matches
      (BSD grep on macOS ignores `\b`, so do not "simplify" this pattern)
- [ ] `grep -rn "pooledSessions\|startingSessions\|removePooledSession" apps/server/src` → no matches
- [ ] `grep -n "PLATFORM_LSP_IDLE_TIMEOUT_MS\|beforeEach" apps/server/src/lsp/tests/proxy-session.test.ts` → no matches
- [ ] `grep -c "Bun.sleep(1)" apps/server/src/lsp/tests/proxy-session.test.ts` → `1`
- [ ] `grep -c "lspPool" apps/server/src/app.ts` → `5`, and
      `grep -n "lspPool.disposeAll()" apps/server/src/app.ts` → exactly one match,
      inside `appCleanup`
- [ ] `grep -rn "new Error(" apps/server/src/lsp/proxy-session.ts apps/server/src/lsp/routes.ts apps/server/src/app.ts` → no matches
      (all three are clean today; keep them that way — use `createInternalError`)
- [ ] `diff /tmp/034-status-before.txt <(git status --porcelain)` shows **only**
      the six in-scope files. The tree may already have carried unrelated
      changes when you started; the diff against your recorded baseline — not a
      bare `git status` — is what proves you touched nothing else.
- [ ] `plans/README.md` row 034 says `DONE`

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check at the top prints any file, and the "Current state" excerpts do
  not match what is actually in those files.
- `timer.unref()` does not typecheck (`Property 'unref' does not exist`). Both
  `@types/bun` and `@types/node` provide it and `apps/server/tsconfig.json` loads
  both, so this should not happen. **Fallback, then report**: delete the two
  `unref` lines from `scheduleIdleDisposal` and continue — the unref is
  belt-and-braces, since `disposeAll` clears idle timers anyway. Do **not** paper
  over it with a cast or an optional call.
- The `kills the backend...on disposeAll` test reports `kill` called **more than
  once**. That means a session is being disposed twice — most likely
  `adoptSession` is inserting into `this.sessions` a session that then also gets
  disposed by the loop. Re-read step 1b rather than adding another latch.
- Any of the three rewritten pooling tests needs an assertion changed to stay
  green. Their behavior must be identical; a changed assertion means the refactor
  altered proxy semantics.
- The `evicts a backend that exits on its own` test fails. That is the negative
  case, and failing it means step 1d over-tightened disposal — most likely
  `closeFromProcess` now sets the _pool's_ `disposed` flag instead of only the
  session's, so one crashed language server bricks the pool for the whole app.
  Only `disposeAll` may touch `LspSessionPool.disposed`. Do not "fix" it by
  relaxing the test.
- Any test **outside** `src/lsp/` changes result between
  `/tmp/034-tests-before.txt` and `/tmp/034-tests-after.txt`. This plan touches
  `app.ts`, which every server test file builds; a moved result there is a real
  regression, not noise.
- The LSP test run hangs at the end, or Vitest reports the process would not
  exit. That is the idle timer: step 1d's `timer.unref()` was dropped, or a
  fixture pool never reached the `afterEach` `disposeAll()`.
- `routes.test.ts` starts needing a real fake child process or an `as unknown as`
  cast on `pool`. That means `LspRouteDeps.pool` was typed as the concrete
  `LspSessionPool` class instead of the structural `LspSessionSource`.
- The `closeApp disposes the pooled LSP sessions` test throws about a settings
  file path (`settings.FILE_PATH_UNSET`) — `testSettingsOptions(root)` is missing
  from `lspTestApp`.
- You find yourself needing to edit `apps/server/src/lsp/registry.ts`,
  `installers.ts`, or `lspIdleTimeoutMs()`. Those are out of scope and belong to
  plan 035.
- The assumption **"`appCleanup` is the single teardown path for an app"** turns
  out to be false — e.g. you find another place that disposes terminal/fs/settings
  without going through it.
- A verification command fails twice after one reasonable fix attempt.

## Maintenance notes

For whoever owns this next:

- **Deliberate behavior change**: two `createApp` instances in one process no
  longer share a language-server backend. Each app now spawns its own. That is the
  point (the old sharing was a cross-app leak), but it means a test file that
  builds many apps and drives real LSP routes will spawn more processes than
  before. Nothing in the current suite does that; if one appears, it should build
  one app, not N.
- **Residual race, accepted knowingly.** `disposeAll()` is synchronous and does
  not await spawns still in flight — deliberately, because
  `apps/server/src/lsp/installers.ts` can _download and install_ a language server
  inside `match.server.spawn`, and blocking shutdown on a package install is worse
  than the race. The `adoptSession` guard kills such a backend the instant it
  arrives. The one case still unhandled: `apps/server/src/index.ts` calls
  `process.exit(...)` immediately after `app.stop()`, so a spawn that lands after
  that exit is orphaned. Closing it properly means a bounded shutdown deadline in
  `disposeAll`; it was judged not worth the complexity for a window measured in
  milliseconds. Revisit only if orphans are actually observed.
- **What a reviewer should scrutinize**: (1) the ordering inside `dispose()` —
  `rejectPendingRequests` before `process.kill()` before `recordSession()` before
  `closeConnections()`; moving `recordSession` after `closeConnections` silently
  zeroes the `activeConnectionCount` field in the `lsp.session` wide event.
  (2) That `disposeAll` runs before `flushObservability()` in `appCleanup`, or the
  shutdown session events are dropped.
- **Observability**: shutdown surfaces as `outcome: "app_shutdown"` on the
  existing `lsp.session` event — `jq 'select(.outcome=="app_shutdown")' logs/*.jsonl`
  tells you exactly what a shutdown killed. No pool-level event was added on
  purpose: a second count of the same truth is exactly the redundancy theme this
  audit is closing.
- **Deliberately deferred**: `LspSessionPool` is not re-exported from
  `apps/server/src/testing.ts`. Nothing outside `apps/server/src` needs to
  construct one today; add the export when a web-side harness first wants the
  `lsp.pool` seam.
- **Interacts with plan 035** (LSP env knobs → settings registry). That plan
  rewrites `lspIdleTimeoutMs()`, which this plan calls but does not touch. Land
  them in either order; they do not overlap textually.
