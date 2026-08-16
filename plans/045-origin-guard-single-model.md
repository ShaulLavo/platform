# Plan 045: Origin guard: pick one model and delete the other

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for plan 045
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **This plan encodes a decision.** Section "The decision" states three options
> and picks one. Step 0 is a confirmation gate. Do not implement a different
> option than the one confirmed.
>
> **Drift check (run first)** — note the missing `..HEAD`: this form compares
> `ace313f` against the **working tree**, so uncommitted edits count as drift too.
>
> ```bash
> cd /Users/shaul/Desktop/D/platform && git diff --stat ace313f -- \
>   apps/server/src/auth.ts apps/server/src/app.ts apps/server/src/index.ts \
>   apps/server/src/tests/app.test.ts apps/server/src/observability/tests/runtime.test.ts \
>   apps/server/src/terminal/tests/service.test.ts \
>   apps/web/vite.config.ts scripts/runtime-network.ts scripts/runtime-network.test.ts \
>   turbo.json .env.example docs/environments-and-remote-plan.md docs/prelaunch-file-system.md
> ```
>
> Empty output means no drift. If any in-scope file changed since this plan was
> written, compare the "Current state" excerpts against the live code before
> proceeding; on a mismatch, treat it as a STOP condition.
>
> **Baselines (capture BEFORE you edit anything — they are how every gate in
> this plan is judged).** The working tree already has ~60 porcelain entries from
> unrelated in-flight work (settings/editor), and **the repo's `bun run verify`
> is red today for those unrelated reasons**. So there is no "exit 0" to aim at.
> Snapshot what red looks like now, then require that you added nothing to it:
>
> ```bash
> cd /Users/shaul/Desktop/D/platform
> git status --porcelain > /tmp/045-baseline.txt
> bun run typecheck    > /tmp/045-typecheck-before.txt  2>&1; echo "exit=$?" >> /tmp/045-typecheck-before.txt
> bun run lint         > /tmp/045-lint-before.txt       2>&1; echo "exit=$?" >> /tmp/045-lint-before.txt
> bun run format:check > /tmp/045-format-before.txt     2>&1; echo "exit=$?" >> /tmp/045-format-before.txt
> ```
>
> Known pre-existing red at the time of writing: `apps/web` `format:check` fails
> on uncommitted settings work (e.g.
> `apps/web/src/features/settings/hooks/use-setting-inspection.ts`). That is not
> yours. **Never run `bun run format`** — it would rewrite another developer's
> uncommitted files and blow the "no stray edits" criterion.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `ace313f`, 2026-08-16

## Why this matters

This is **not a live exploit report**. Platform is a local developer tool: the
server binds loopback only (`assertLoopbackHost`, `apps/server/src/index.ts:26,105-109`),
and a hostile process already running as the same user has everything anyway.

What is wrong is narrower and real: **`SERVER_ALLOWED_ORIGINS` is a control that
does not control.** The server has two auth modes and neither one makes the
operator's list the boundary:

- In `dev-origin` mode — the only mode any shipping client can run in — the
  allowlist is consulted first and then _widened_ to any http(s) origin on
  `localhost` / `127.0.0.1` / `[::1]` on **any port** (`auth.ts:109-115`). An
  operator who sets `SERVER_ALLOWED_ORIGINS` to one exact origin gets all of
  loopback.
- In `session-token` mode the list _is_ exact — but no shipping client sends the
  token, so setting `FS_SESSION_TOKEN` locks the user out of their own app
  instead of hardening it. The repo already says so, twice:
  `docs/environments-and-remote-plan.md:394` — "**it is dead code today**" — and
  `docs/t3code-parity-second-sweep.md:66`.

So the knob is decorative in one mode and unreachable in the other. Behind the
guard sits `/fs/*` over a workspace root that defaults to the filesystem root,
plus `/git` mutations and `/terminal` PTYs. The concrete exposure is
**browser-scoped**: any page the user has open from a _different_ localhost
origin can make credentialed cross-origin calls that the CORS layer
(`app.ts:147`, same predicate) currently approves. Exact origins close that;
loopback-wide trust does not.

What improves when this lands: one auth model, honestly described, where the
configured allowlist is the actual boundary — and ~60 lines of dead auth code
gone. This closes an instance of theme **T4 — exported-but-unreachable surface**
in `plans/README.md`, and the "process observation" note there that this repo's
docs record debt nobody burns down.

## The decision

Three options were considered. **Option A is recommended and is what the Steps
below implement.**

### Option A — one model: exact origin allowlist _(recommended)_

Delete `session-token` mode entirely. Delete the loopback widening. Make the
launchers responsible for handing the server every origin the app can actually
be reached at, and make the resolved web port authoritative
(`strictPort: true`). `SERVER_ALLOWED_ORIGINS` becomes the real boundary.

Why this one:

1. It is the only option that makes an **existing** knob true rather than
   deleting it or replacing it with a bigger mechanism.
2. Most of it is already built. `scripts/dev.ts:27-31,51-60` already probes for a
   free web port _before_ spawning anything and writes the exact origin into
   `SERVER_ALLOWED_ORIGINS`; the only reason the server then ignores it is the
   `isLoopbackOrigin` fallback. The desktop launcher
   (`apps/desktop/src/bun/index.ts:38-42`) and the prod launcher
   (`scripts/prod.ts:96,111`) both call the same helper, and `spawnWeb()`
   (`apps/desktop/src/bun/index.ts:101-113`) already passes `--strictPort` to
   vite. All three launchers inherit Steps 1–2 with no edits of their own.
3. It does not preempt real sessions. When milestone M4 in
   `docs/environments-and-remote-plan.md:386-394` lands, exact origins remain the
   outer gate; nothing here has to be undone.
4. Origin is the right control for the threat that is actually in scope. Page
   JavaScript cannot forge the `Origin` header a browser sends; a non-browser
   local process can, but that adversary is explicitly out of scope
   (`docs/environments-and-remote-plan.md`, adversary #3).

### Option B — one model: real session token _(not now)_

Mint a per-launch token, deliver it to the web app, send it as `Authorization`
from `apps/web/src/lib/client.ts` and as a handshake parameter from
`orchestrationRpcUrl()`, then drop the origin fallback.

Why not now: the security of Option B is **entirely** the token _delivery_
channel, and there is no cheap safe one. A token compiled into the dev bundle is
served by the vite dev server to whoever can read it; a token on the URL leaks
into history and logs. Doing it properly means an out-of-band handoff, a stored
credential, and revocation — which is exactly the scope of milestone M4
(`docs/environments-and-remote-plan.md:386-394`: pairing credential table,
one-time consume, short-lived WS token, desktop bootstrap over fd 3). That is a
milestone, not a cleanup. Cutting a corner here would ship a _second_
control-that-does-not-control.

### Option C — accept loopback trust and delete the knob

Delete `SERVER_ALLOWED_ORIGINS`, `allowedOriginsForWebPort` and
`DEFAULT_ALLOWED_ORIGINS`; keep `isLoopbackOrigin` as the entire rule; delete the
same dead `session-token` half that Option A deletes; document plainly that every
localhost page is trusted.

What C genuinely gets you, stated without spin: it removes the same ~60 lines of
dead auth code, it removes a knob that lies, it has **zero** lockout risk, and it
leaves the launcher, `strictPort`, and the origin-spelling problem entirely out
of the picture — Steps 1, 2 and 6a disappear. Its threat surface is _unchanged
from today_, so it cannot regress anything. It is a smaller, safer diff.

Why A instead: C permanently concedes the one attack the guard could actually
stop — a page on some other localhost port making credentialed cross-origin
calls to `/fs/*`, `/git`, `/terminal`. That is a real (if low-likelihood)
browser-scoped attack on a machine where the user runs other local dev servers.
A costs one launcher helper and a `strictPort` flag to close it. If the operator
weighs the dev-UX cost of exactness (below) higher than that attack, C is the
correct call and is not a bad answer.

**C's steps are not written in this plan.** If C is chosen, STOP and report;
do not improvise C from this outline.

**The dev-UX cost of Option A, stated up front**: with exact origins, a browser
tab at `http://localhost:PORT` is a _different_ origin from
`http://127.0.0.1:PORT`. Step 1 exists specifically to make the launcher emit
both spellings; without it, Option A locks users out. Step 3 adds the rejected
origin to the denial log event so any residual lockout is one `grep` away.

## Current state

Files and their role:

- `apps/server/src/auth.ts` — the whole guard (186 lines). Origin check, the dead
  session-token machinery, WS data adapters.
- `apps/server/src/app.ts` — wires the guard: CORS predicate at `:147`, HTTP guard
  at `:154`, `/health` exposes `authMode` at `:158`.
- `apps/server/src/index.ts` — reads `SERVER_ALLOWED_ORIGINS` and
  `FS_SESSION_TOKEN` from the environment.
- `scripts/runtime-network.ts` — `allowedOriginsForWebPort` builds the list every
  launcher passes to the server.
- `scripts/dev.ts:44-60` — dev launcher; picks a free web port with
  `selectAvailablePort`, then `configureRuntime` writes the result into
  `env.SERVER_ALLOWED_ORIGINS` via `allowedOriginsForWebPort`.
- `apps/web/vite.config.ts` — dev server host/port; `strictPort: false` today.
- **A stale build artifact exists**: `apps/server/dist/index.js` (3.1 MB,
  gitignored, built 2026-06-14) still contains the compiled old auth code and the
  string `FS_SESSION_TOKEN`. Every repo-wide grep in this plan therefore passes
  `--exclude-dir=dist`. Do not edit, delete, or rebuild it.
- The three WebSocket routes (`terminal/service.ts:104`,
  `orchestration/ws-rpc.ts:86`, `lsp/routes.ts:56`) all call
  `authenticateWebSocketData`, so they share **exactly** the same origin
  predicate as HTTP. They are not a weaker path; do not "fix" them separately.

### `apps/server/src/auth.ts:39-46` — mode is chosen by an env var nothing satisfies

```ts
export function createAuthConfig(options: AuthOptions = {}): AuthConfig {
  return {
    allowedOrigins: options.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS,
    mode: options.sessionToken ? 'session-token' : 'dev-origin',
    principal: localAuthPrincipal,
    sessionToken: options.sessionToken,
  }
}
```

### `apps/server/src/auth.ts:109-129` — the list is checked, then widened

```ts
function hasTrustedOrigin(auth: AuthConfig, origin: string | null) {
  if (!origin) return false
  if (auth.allowedOrigins.includes(origin)) return true
  if (auth.mode === 'dev-origin') return isLoopbackOrigin(origin)

  return false
}

// In dev-origin mode the web port is a moving target (vite falls to the next
// free port when the preferred one is taken), so trust any loopback origin
// rather than an exact port list. Session-token mode stays exact.
function isLoopbackOrigin(origin: string) {
  try {
    const url = new URL(origin)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false

    return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
  } catch {
    return false
  }
}
```

Note the comment: the widening is a **deliberate, documented** choice, not an
oversight. Step 2 removes its stated justification (the moving port) before Step
3 removes the widening.

### `apps/server/src/auth.ts:73-96,131-142,152-183` — the dead half

```ts
function authenticateRequest(
  request: Request,
  auth: AuthConfig,
  options: { allowMissingSessionToken?: boolean } = {},
): FsError | null {
  const originError = localBrowserOriginError(auth, request.headers.get('origin'))
  if (originError) return originError
  if (options.allowMissingSessionToken) return null

  const tokenError = sessionTokenError(auth, request.headers.get('authorization'))
  if (tokenError) return tokenError

  return null
}
```

`sessionTokenError` (`:131-136`) compares `authorization === \`Bearer ${token}\``.
`authorizationFromWebSocketData`/`authorizationHeaderFromWebSocketData`/`queryTokenFromWebSocketData` (`:152-183`) read a `?token=`/`?authToken=`
parameter. Nothing writes either one:

- `apps/web/src/lib/client.ts:13-15` — the production treaty client sends only
  the instance header:
  ```ts
  const productionClient: Client = treaty<App>(serverUrl, {
    headers: () => ({ [instanceHeaderName]: clientInstanceId() }),
  })
  ```
- `apps/web/src/features/chat/transport/orchestration-rpc-client.ts:677-682` —
  the WS URL carries no token parameter:

  ```ts
  function orchestrationRpcUrl() {
    const url = new URL('/orchestration/rpc', serverUrl)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'

    return url.toString()
  }
  ```

- `grep -rnI "Authorization\|Bearer" apps/web/src` (case-sensitive) finds
  **zero** matches — exit status 1, no output. Case-insensitively
  (`grep -rnIi "authorization\|bearer" apps/web/src`) there are exactly three,
  none of which sends anything:

  ```
  apps/web/src/features/chat/lib/chat-command-builders.ts:54:  'bearer',
  apps/web/src/lib/client-logging.ts:30:  'authorization',
  apps/web/src/lib/client-error-reporting.ts:17:  'authorization',
  ```

  The first is a `SENSITIVE_THREAD_TITLE_WORDS` entry; the other two are
  `sensitiveFields` redaction sets. All three are _scrubbing_ lists.

The file ends mid-sentence at `auth.ts:185-186`:

```ts
// TODO(auth): This guard intentionally supports only today's local browser app:
// TODO(auth): If we add remote/browser sessions later, mount Better Auth or a
```

### `scripts/runtime-network.ts:52-58` — one spelling only

```ts
export function allowedOriginsForWebPort(
  configuredOrigins: string | undefined,
  webHost: string,
  webPort: number,
) {
  return unique([runtimeUrl(webHost, webPort), ...originsFromEnv(configuredOrigins)]).join(',')
}
```

With `WEB_HOST=127.0.0.1` (the value in `.env.example` and in the repo's `.env`)
this emits `http://127.0.0.1:PORT` and nothing else. A user who types
`localhost:PORT` sends a different `Origin` — today the loopback widening
rescues them; under exact matching they would be locked out. Step 1 fixes this.

### `apps/web/vite.config.ts:43-53` — the port is allowed to move

```ts
  server: {
    fs: {
      allow: uniquePaths([workspaceRoot, resolveEditorSourceRoot(), ...editorRepoRoots]),
    },
    host: devServerHost,
    port: devServerPort,
    // Port-agnostic dev: if the preferred port is taken, vite moves to the next
    // free one. The dev server trusts any loopback origin (see auth.ts), so the
    // fallback port needs no allowlist plumbing.
    strictPort: false,
  },
```

`devServerPort` comes from `WEB_PORT`, which `scripts/dev.ts:51-58` has already
set to a port it verified was free.

### Every caller that passes a session token (complete list — verified by grep)

- `apps/server/src/index.ts:22,30`
- `apps/server/src/tests/app.test.ts:63,997,1006`
- `apps/server/src/observability/tests/runtime.test.ts:148,235,324,328`

Every other `createApp({ auth: ... })` call site passes only `allowedOrigins`.

### Repo conventions that apply here

From `AGENTS.md`, quoted verbatim — the executor has not read this file:

> - This project is greenfield and not live: no releases, no external users, no
>   data anyone needs migrated.
> - No backward compatibility shims, no legacy aliases, no deprecation windows.
>   Update every call site in the same pass.

> - Delete obsolete tests instead of preserving old behavior.

> - Never throw `new Error`. Create errors with `createError` from `evlog` — in
>   practice through the feature's `structured-errors.ts` wrapper
>   (`createStructuredError` or a `defineErrorCatalog` entry) so the error
>   carries `code`, `status`, `why`, and `fix`.

(This plan adds no new error types. The server's wrapper is `FsError` in
`apps/server/src/fs/errors.ts`; keep using `new FsError('FORBIDDEN_ORIGIN')` as
the existing code does — `FsError` extends `EvlogError`, it is not `new Error`.)

> - Logging is wide-event style (evlog). Always prefer wide logs: enrich the one
>   event per operation/request with more fields instead of emitting extra
>   narrow log lines.

> - Use guard clauses and early returns. Keep the happy path shallow.
> - Do not use `else` after an early return.

> - A dev server is always running. Never spin up your own server to test or
>   verify changes — reuse the running one.

> - Do not `mock.module` or `vi.mock` our server, client, or feature modules.

Server tests use plain `vitest` imports (`apps/server/src/tests/app.test.ts:4`)
and drive the real in-process app via `createApp` + `app.handle`. Match that.

## Commands you will need

| Purpose                 | Command                                                                                        | Expected on success                                |
| ----------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Server tests            | `cd /Users/shaul/Desktop/D/platform/apps/server && bun --bun vitest run`                       | exit 0, all pass                                   |
| Server tests (one file) | `cd /Users/shaul/Desktop/D/platform/apps/server && bun --bun vitest run src/tests/app.test.ts` | exit 0, all pass                                   |
| Scripts test            | `cd /Users/shaul/Desktop/D/platform && bun run test:scripts`                                   | exit 0, 5 pass                                     |
| Typecheck (all)         | `cd /Users/shaul/Desktop/D/platform && bun run typecheck`                                      | exit 0, no errors                                  |
| Lint (all)              | `cd /Users/shaul/Desktop/D/platform && bun run lint`                                           | **no new** failure vs `/tmp/045-lint-before.txt`   |
| Format check            | `cd /Users/shaul/Desktop/D/platform && bun run format:check`                                   | **no new** failure vs `/tmp/045-format-before.txt` |

**Do not use `bun run verify` as a gate.** It is `typecheck && lint &&
format:check && test`, it short-circuits on the first failure, and it is already
failing at HEAD on unrelated uncommitted work — so a red `verify` proves nothing
about your change and a green one is unreachable. Run the four legs separately
and compare each against its `/tmp/045-*-before.txt` snapshot. `typecheck` is
expected to be a clean 0 both before and after; `lint` and `format:check` are
judged as "no new file appears in the failure list, and no in-scope file appears
at all".

Two things these gates do **not** cover: `lint` and `format:check` both run
`--filter '*'`, which reaches only the workspaces under `apps/` and `packages/` —
the root-level `scripts/` directory is linted and formatted only by the
pre-commit hook. Match the surrounding style in `scripts/runtime-network.ts` by
hand (2-space indent, no semicolons, single quotes); no gate will catch it for
you.

**On the server suite**: `bun --bun vitest run` in `apps/server` is the full
suite and it is slow. Run the three files you touched first (they are the only
ones whose behavior changes), and the full suite exactly once, at the end:

```bash
cd /Users/shaul/Desktop/D/platform/apps/server && bun --bun vitest run \
  src/tests/app.test.ts src/observability/tests/runtime.test.ts \
  src/terminal/tests/service.test.ts
```

## Scope

**In scope** (the only files you may modify):

- `scripts/runtime-network.ts`
- `scripts/runtime-network.test.ts`
- `apps/web/vite.config.ts`
- `apps/server/src/auth.ts`
- `apps/server/src/app.ts`
- `apps/server/src/index.ts`
- `apps/server/src/tests/app.test.ts`
- `apps/server/src/observability/tests/runtime.test.ts`
- `apps/server/src/terminal/tests/service.test.ts`
- `turbo.json`
- `.env.example`
- `docs/environments-and-remote-plan.md`
- `docs/prelaunch-file-system.md`
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch, even though they look related):

- `apps/web/src/lib/client.ts` — adding an `Authorization` header is Option B
  work. Under Option A the client is already correct.
- `apps/web/src/features/chat/transport/orchestration-rpc-client.ts` — the
  missing `?token=` is Option B work for the same reason. Do not add one.
- `apps/desktop/src/bun/index.ts` — it already calls `allowedOriginsForWebPort`
  (`:38-42`) and `spawnWeb()` already passes `--strictPort` (`:112`), so it
  inherits Step 1 and Step 2 for free. Editing it duplicates the fix.
- `scripts/dev.ts` and `scripts/prod.ts` — both already route their web origin
  through `allowedOriginsForWebPort` (`dev.ts:54`, `prod.ts:96,111`). They
  inherit Step 1 unchanged. Adding a second loopback spelling at the call site
  would double-apply the fix.
- `apps/server/dist/**` — a stale gitignored build artifact that still contains
  the old compiled auth code. Never edit it, delete it, or rebuild it to make a
  grep clean.
- `apps/server/src/provider/adapters/codex-protocol/generated/**` — generated
  from an upstream schema; its `authMode` field is Codex's, unrelated to ours.
- `apps/web/test/server.ts` — the dom-test fixture already pins
  `allowedOrigins: [TEST_ORIGIN]` with `TEST_ORIGIN = 'http://localhost:5173'`
  (`:16,34`) and sends exactly that origin, so exact matching does not affect it.
- `apps/web/test/env/browser-file-server.ts` — its `allowedOrigins()` helper
  (`:111-118`) already lists both loopback spellings of both ports exactly.
  Nothing to change.
- `assertLoopbackHost` in `apps/server/src/index.ts:105-109` — the bind guard is
  what makes all of this acceptable. Do not relax or "improve" it.
- The `workspaceRoot = configuredWorkspaceRoot ?? systemRoot` default at
  `apps/server/src/index.ts:19` — the filesystem-root default is a separate
  decision about the _surface_, not about the _gate_. Coupling them makes both
  un-reviewable.
- `apps/server/src/fs/errors.ts` — `UNAUTHORIZED` (missing origin) and
  `FORBIDDEN_ORIGIN` (wrong origin) both stay, with their existing status codes
  and messages. `apps/web/src/lib/client-error-taxonomy.ts:25-26,43-44` already
  maps both.
- `docs/t3code-parity-second-sweep.md` — a dated point-in-time sweep record, not
  a living document. Leave its history intact.
- `.claude/worktrees/**` — a stale checkout of this same repo lives there and
  will match every grep. Never edit anything under it.
- `packages/editor-*` — symlinks into a sibling checkout, never in scope.
- **`.env` (the repo's real one, not `.env.example`)** — it is the operator's
  local machine config and is gitignored. If something 403s, the fix is Step 1,
  not pasting an origin into `.env`. Same for exporting `SERVER_ALLOWED_ORIGINS`
  in your shell to make a check pass.
- `DEFAULT_ALLOWED_ORIGINS` in `auth.ts:25-32` — keep the six entries exactly as
  they are. Adding a port to make a failing test or a failing curl go green
  converts a real signal into a silent widening; that is the same mistake this
  plan exists to undo.
- `apps/server/src/observability/**` — Step 3c enriches the existing auth event
  in place. Do not add a log line, a new event name, or a redaction rule.
- `logs/**` and any file under `~/.platform` — read them, never delete or edit
  them.
- The ~60 files already modified in the working tree (settings/editor WIP). Do
  not revert, stage, commit, or reformat any of them, and never run
  `bun run format` (it is repo-wide and would rewrite all of them).

## Git workflow

**All work happens on `main`** — no new branches, worktrees, commits, pushes, or
PRs unless the operator explicitly asks. If the operator asks for a commit, use
conventional commits with a lowercase descriptive subject. Real examples from
`git log`:

```
refactor(orchestration): the server prepares a session's worktree (M-C)
fix(address): bound the URL, and stop escaping slashes in ?tabs=
```

A fitting subject for this work: `refactor(auth): one origin model, exactly enforced`.

## Steps

### Step 0: Confirm the decision

This plan implements **Option A**. A half-Option-B (token sent by the client but
still falling back to loopback trust) is strictly worse than either endpoint.

**Decide mechanically — do not ask and wait:**

- The message that dispatched you names Option B or Option C, or says "don't
  change the origin behavior" → **STOP and report**. Do not implement A, and do
  not improvise B or C — neither one's steps exist in this file.
- The message names Option A, or says nothing about options at all → **proceed
  with Option A.** Silence is not a blocker; Option A is this plan's default and
  every later step is reversible with `git checkout`.

**Verify**: no command. Write one line in your final report stating which of the
two branches above you took and why.

### Step 1: Make the launcher emit every origin the app can be reached at

Edit `scripts/runtime-network.ts`. Replace `allowedOriginsForWebPort`
(`:52-58`) with a version that emits both loopback spellings of the resolved
port when the web host is itself a loopback alias, and keeps a non-loopback host
exact:

```ts
const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost'] as const

// Exact origins are the whole guard (apps/server/src/auth.ts), so the launcher
// owes the server every spelling a browser can actually send for the resolved
// web port: `localhost` and `127.0.0.1` are different origins even though they
// reach the same socket.
export function allowedOriginsForWebPort(
  configuredOrigins: string | undefined,
  webHost: string,
  webPort: number,
) {
  return unique([
    ...browserOriginsForWebPort(webHost, webPort),
    ...originsFromEnv(configuredOrigins),
  ]).join(',')
}

function browserOriginsForWebPort(webHost: string, webPort: number) {
  const configured = runtimeUrl(webHost, webPort)
  if (!isLoopbackHost(webHost)) return [configured]

  return [configured, ...LOOPBACK_HOSTS.map((host) => runtimeUrl(host, webPort))]
}

function isLoopbackHost(host: string) {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1'
}
```

Placement: put `LOOPBACK_HOSTS` at the top of the file beside the existing
`MAX_PORT_ATTEMPTS` const (`:5`), and the two new private helpers below the
exported functions next to the other private helpers (`closePortProbe`,
`originsFromEnv`, `unique`, `urlHost`). `unique` and `runtimeUrl` already exist
in this file — reuse them, do not redefine.

Then update `scripts/runtime-network.test.ts`. Change the existing
`builds exact origins for the selected web port` expectation (`:25-29`) to:

```ts
test('builds exact origins for the selected web port', () => {
  expect(
    allowedOriginsForWebPort('http://custom.local:4000,http://127.0.0.1:3000', '127.0.0.1', 3000),
  ).toBe('http://127.0.0.1:3000,http://localhost:3000,http://custom.local:4000')
})
```

and add one new test directly after it:

```ts
test('keeps a non-loopback web host exact', () => {
  expect(allowedOriginsForWebPort(undefined, 'custom.local', 4000)).toBe('http://custom.local:4000')
})
```

**Verify**: `cd /Users/shaul/Desktop/D/platform && bun run test:scripts` →
exit 0, **5 tests pass** (4 existing + 1 new).

### Step 2: Make the resolved web port authoritative

Edit `apps/web/vite.config.ts:49-52`. Replace the comment and the flag:

```ts
    host: devServerHost,
    port: devServerPort,
    // The port is authoritative, not a preference: the server's origin
    // allowlist is exact (apps/server/src/auth.ts) and the launcher computed
    // this port with `selectAvailablePort` before spawning us. Silently moving
    // to another port would produce an app that loads and then 403s on every
    // request; failing to bind is the honest outcome.
    strictPort: true,
```

Do not change `host` or `port`.

**Verify**: `cd /Users/shaul/Desktop/D/platform && bun run typecheck` → exit 0.
(`apps/web`'s `tsconfig.node.json` type-checks `vite.config.ts`; `apps/desktop`
type-checks its import of `scripts/runtime-network.ts`. Both cover Steps 1–2.)

### Step 3: Collapse `auth.ts` to one exactly-enforced model

> **Expect a red suite from here until Step 5.** Three server tests reference
> the deleted session-token mode and will fail. That is planned — do not "fix"
> them by restoring the deleted code.

Edit `apps/server/src/auth.ts`:

**3a. Types (`:13-23`)** — drop `sessionToken` and `mode`:

```ts
export type AuthOptions = {
  allowedOrigins?: readonly string[]
}

export type AuthConfig = {
  allowedOrigins: readonly string[]
  principal: AuthPrincipal
}
```

Keep `DEFAULT_ALLOWED_ORIGINS` (`:25-32`) exactly as it is — with exact matching
it becomes the safety net for a hand-started server (`cd apps/server && bun run
server`) that no launcher configured.

**3b. `createAuthConfig` (`:39-46`)**:

```ts
export function createAuthConfig(options: AuthOptions = {}): AuthConfig {
  return {
    allowedOrigins: options.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS,
    principal: localAuthPrincipal,
  }
}
```

**3c. `authGuard` (`:48-71`)** — call the origin check directly and enrich the
denial event with the rejected origin (one wide event, no new log lines):

```ts
export function authGuard(auth: AuthConfig) {
  return ({ request, set }: { request: Request; set: { status?: number | string } }) => {
    const origin = request.headers.get('origin')
    const error = localBrowserOriginError(auth, origin)
    if (!error) {
      recordRequestContext({ auth: { outcome: 'success' } })
      return undefined
    }

    set.status = error.statusCode
    recordRequestWarning('auth rejected request', {
      area: 'auth',
      auth: {
        errorCode: error.code,
        origin,
        outcome: 'denied',
      },
      operation: 'authenticate',
      status: error.statusCode,
    })
    return errorPayload(error)
  }
}
```

Two things that look risky here and are not: `recordRequestContext` and
`recordRequestWarning` take `Record<string, unknown>`
(`apps/server/src/observability/logging.ts:65`), so dropping `mode` and adding
`origin` needs no type change anywhere. And this stays **one** event per request,
which is what the wide-event rule asks for — do not add a second log line.

**3d. Delete `authenticateRequest` (`:73-86`)** — it is now a one-line wrapper.

**3e. `authenticateWebSocketData` (`:88-96`)**:

```ts
export function authenticateWebSocketData(data: unknown, auth: AuthConfig): FsError | null {
  return localBrowserOriginError(auth, originFromWebSocketData(data))
}
```

**3f. `hasTrustedOrigin` (`:109-115`)** — exact, and delete `isLoopbackOrigin`
(`:117-129`) along with its comment:

```ts
function hasTrustedOrigin(auth: AuthConfig, origin: string | null) {
  if (!origin) return false

  return auth.allowedOrigins.includes(origin)
}
```

**3g. Delete the rest of the dead half**: `sessionTokenError` (`:131-136`),
`isClientLogIngestRequest` (`:138-142`),
`authorizationFromWebSocketData` (`:152-159`),
`authorizationHeaderFromWebSocketData` (`:161-167`),
`queryTokenFromWebSocketData` (`:169-183`).

Keep `localBrowserOriginError` and `originFromWebSocketData` unchanged. The
`isRecord` import stays (still used by `originFromWebSocketData`).

Deleting `isClientLogIngestRequest` changes no behavior: its only effect was
setting `allowMissingSessionToken` for `POST /_log/ingest`, i.e. skipping the
**token** check. The origin check always applied to that route and still does.
The runtime.test.ts case that covers it (Step 5b) must stay green.

**3h. Replace the truncated TODO (`:185-186`)** with a comment that is true:

```ts
// This guard is the origin allowlist and nothing else, and it is exact. The
// launcher owes the server every origin the app can be reached at
// (`allowedOriginsForWebPort` in scripts/runtime-network.ts), and
// `assertLoopbackHost` (index.ts) keeps the socket on loopback — those two
// facts are what make an origin-only guard adequate for a local dev tool.
// There is no token mode: the previous FS_SESSION_TOKEN one could not be
// satisfied by any shipping client and was deleted. Real, revocable sessions
// are milestone M4 in docs/environments-and-remote-plan.md.
```

**Verify**: `cd /Users/shaul/Desktop/D/platform/apps/server && bun run typecheck`
→ **expected to FAIL** with errors only in the three files listed in Step 4 and
Step 5 (`src/index.ts`, `src/tests/app.test.ts`,
`src/observability/tests/runtime.test.ts`), each about `sessionToken` not
existing on the auth options type. Any error in a _different_ file is a STOP
condition.

### Step 4: Drop `FS_SESSION_TOKEN` from the runtime wiring

**4a. `apps/server/src/index.ts`** — two string edits, not line-number edits
(deleting the first line shifts the second):

- delete the whole line `const sessionToken = Bun.env.FS_SESSION_TOKEN` (`:22`)
- replace `  auth: { allowedOrigins, sessionToken },` (`:30`) with
  `  auth: { allowedOrigins },`

**4b. `apps/server/src/app.ts:156-160`** — `/health` no longer has a mode to
report. Delete the `authMode` line:

```ts
    .get('/health', () => ({
      ok: true,
      ...fs.info(),
    }))
```

(Verified: the only other _code_ reference is
`apps/server/src/tests/app.test.ts:85`, deleted in Step 5a. The desktop launcher
only checks that `/health` responds — `apps/desktop/src/bun/index.ts:72,82`.
`docs/environments-and-remote-plan.md:87,92` describe it in prose and are fixed in
Step 6b. `authMode` at
`apps/server/src/provider/adapters/codex-protocol/generated/schema.gen.ts:165` is
an unrelated Codex protocol field in generated code — never touch it.)

**4c. `turbo.json`** — remove the now-dangling `"FS_SESSION_TOKEN",` entry from
`globalPassThroughEnv` (line 9). Leave `SERVER_ALLOWED_ORIGINS` in place.

**Verify**: `grep -rn "FS_SESSION_TOKEN\|sessionToken" apps/server/src turbo.json`
→ only matches remaining are in `apps/server/src/tests/app.test.ts` and
`apps/server/src/observability/tests/runtime.test.ts` (fixed in Step 5).

### Step 5: Update the tests and add the regression cases

**5a. `apps/server/src/tests/app.test.ts`**

Delete the whole `it('requires the bootstrap session token when configured', ...)`
block — obsolete behavior, per the AGENTS.md rule quoted above. It spans exactly
`:62-86`: `:62` is the `it(` line, `:86` is its closing `  })`. **`:87` is the
`})` that closes `describe('fs rpc auth', ...)` — leave it.** After the delete,
`it('sets CORS headers for trusted origins', ...)` must be the last `it` in that
describe, followed by a single `})`.

Extend the `testApp` helper (`:992-1018`) so a test can supply its own origin
list: replace `sessionToken?: string` (`:997`) in the options type with
`allowedOrigins?: readonly string[]`, and change the `auth` field to:

```ts
    auth: {
      allowedOrigins: options.allowedOrigins ?? [TRUSTED_ORIGIN],
    },
```

Add two tests to the existing `describe('fs rpc auth', ...)` block, after
`it('sets CORS headers for trusted origins', ...)` (`:50-60`). Model their shape
on `it('rejects disallowed origins', ...)` (`:38-48`) — same `testApp` /
`app.handle` / `errorCode` helpers:

```ts
it('rejects a loopback origin that is not on the allowlist', async () => {
  const app = testApp(await fixtureRoot())
  const response = await app.handle(
    new Request('http://local/health', {
      headers: { origin: 'http://localhost:9999' },
    }),
  )

  expect(response.status).toBe(403)
  expect(await errorCode(response)).toBe('FORBIDDEN_ORIGIN')
  expect(response.headers.get('access-control-allow-origin')).toBeNull()
})

it('accepts every launcher-listed spelling of the web origin', async () => {
  const app = testApp(await fixtureRoot(), {
    allowedOrigins: ['http://127.0.0.1:5173', 'http://localhost:5173'],
  })

  for (const origin of ['http://127.0.0.1:5173', 'http://localhost:5173']) {
    const response = await app.handle(new Request('http://local/health', { headers: { origin } }))

    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe(origin)
  }
})
```

The first test is the regression gate: before Step 3 it returns `200`.

**5b. `apps/server/src/observability/tests/runtime.test.ts`**

- `it('does not persist authorization secrets', ...)` (`:143-164`): drop the
  `{ sessionToken: token }` argument at `:148` so it reads `testApp(root)`, and
  keep sending `authorization: \`Bearer ${token}\``on the request. The assertion
under test is log hygiene — that no request header is ever serialized — and it
is still worth having. Rename it to`'does not persist authorization headers'`. Also rename the local literal at
`:146`from`'secret-session-token'`to`'secret-bearer-value'`so no`session-token` string survives in the file (a Done-criteria grep depends on
  this).
- `it('accepts batched client drain payloads without a session token', ...)`
  (`:231-273`): drop the `{ sessionToken: 'secret-session-token' }` argument at
  `:235` and rename it to `'accepts batched client drain payloads'`. The rest of
  the body is unchanged.
- Simplify the local `testApp` helper (`:324-334`) to take only `root` and pass
  `auth: { allowedOrigins: [TRUSTED_ORIGIN] }`.

**5c. `apps/server/src/terminal/tests/service.test.ts`** — one WS-side test, so
the shared predicate is covered on both transports.

Give the `fakeSocket` helper (`:231-249`) an origin parameter:

```ts
function fakeSocket(root: string, session?: string, origin: string = TRUSTED_ORIGIN) {
```

and use it in the `data.headers` literal (`:237`): `headers: { origin },`.

Add this test inside the existing `describe('terminal service', ...)` block:

```ts
it('closes a websocket opened from an untrusted loopback origin', async () => {
  const root = await fixtureRoot()
  const pty = createFakePtyFactory()
  const service = testService(root, { env: {}, ptyFactory: pty.factory })
  const ws = fakeSocket('', undefined, 'http://localhost:9999')

  service.routes(auth()).open(ws)

  expect(ws.closed).toBe(true)
  expect(pty.spawns).toEqual([])
})
```

**Verify**:

```bash
cd /Users/shaul/Desktop/D/platform/apps/server && bun --bun vitest run \
  src/tests/app.test.ts src/observability/tests/runtime.test.ts \
  src/terminal/tests/service.test.ts
```

→ exit 0, all pass, including the three new cases. Then once, the full suite:
`cd /Users/shaul/Desktop/D/platform/apps/server && bun --bun vitest run` → exit 0.
And `grep -rn "sessionToken" apps/server/src` → no matches.

### Step 6: Make the documentation true

**6a. `.env.example:12-13`** — replace the comment above
`SERVER_ALLOWED_ORIGINS` with one that states the guard is exact:

```
# Extra browser origins. The allowlist is EXACT — an origin not listed here (or
# emitted by the launcher for the active WEB_HOST/WEB_PORT) is refused with 403.
# Launchers always add both loopback spellings of the active web port.
# SERVER_ALLOWED_ORIGINS=http://custom.local:4000
```

**6b. `docs/environments-and-remote-plan.md`** — three edits, all in the
"Today's baseline, stated honestly" list and the M4 milestone:

- `:242` — replace the "Two modes, chosen only by whether `FS_SESSION_TOKEN` was
  in the environment" bullet with: `- One mode: an exact origin allowlist
(`apps/server/src/auth.ts`). There is no token mode.`
- `:243` — delete the `session-token` bullet entirely (the mode no longer
  exists).
- `:244` — replace "`dev-origin` mode trusts any loopback origin regardless of
  port … which is deliberate and correct given the bind guard" with: `- The
allowlist is exact; the launcher (`scripts/runtime-network.ts`
`allowedOriginsForWebPort`) hands the server both loopback spellings of the
resolved web port, and `apps/web/vite.config.ts`pins that port with`strictPort`.`
- `:247` — the bullet describing the truncated TODO at `auth.ts:185-186` is
  stale after Step 3h; delete it.
- `:388` and `:390` (inside M4) — these reference `auth.ts:131-136` and
  `auth.ts:150-183`, both deleted. Rewrite them as _additive_: M4 introduces
  issued sessions and a short-lived WS token; there is no static token to
  replace. Keep the M4 "Done when" sentence at `:394` but delete its
  parenthetical "(This also makes `session-token` mode reachable for the first
  time — it is dead code today.)" and its opening clause "with `FS_SESSION_TOKEN`
  unset" (the var no longer exists).
- `:87` and `:92` — both describe `GET /health` as returning `authMode`, which
  Step 4b deletes. At `:87` drop `authMode` from the `{ ok, authMode,
...fs.info() }` shape; at `:92` drop `authMode,` from the proposed descriptor
  field list. Change nothing else in that section.

**6c. `docs/prelaunch-file-system.md`** — two references to `FS_SESSION_TOKEN`:

- `:2` (the STATUS note) — drop `FS_SESSION_TOKEN` from the parenthetical, leave
  `FS_DEV_MAX_TEXT_FILE_BYTES`.
- `:11-12` — replace "`FS_SESSION_TOKEN` is the current bootstrap hook;
  Origin-only auth is dev-only." with "Origin-only auth is dev-only; the
  bootstrap credential is milestone M4 in
  `docs/environments-and-remote-plan.md`."

Do not restructure or re-status either document beyond these lines.

**Verify**:

```bash
cd /Users/shaul/Desktop/D/platform && grep -rn "FS_SESSION_TOKEN" \
  --exclude-dir=node_modules --exclude-dir=.claude --exclude-dir=logs \
  --exclude-dir=dist --exclude-dir=.git .
```

→ matches **only** in `docs/t3code-parity-second-sweep.md` (a dated record, out of
scope) and in `plans/045-origin-guard-single-model.md` (this file's own prose).
No match in `apps/`, `scripts/`, `turbo.json`, `.env.example`,
`docs/environments-and-remote-plan.md`, or `docs/prelaunch-file-system.md`.

`--exclude-dir=dist` is not optional: `apps/server/dist/index.js` is a stale
gitignored build output that still contains the string. Its presence is expected
and is not a task for you.

### Step 7: Compare every gate against its baseline

Run the four legs separately. **Do not run `bun run verify`** (see "Commands you
will need" — it is red at HEAD for unrelated reasons and short-circuits).

```bash
cd /Users/shaul/Desktop/D/platform
bun run typecheck    > /tmp/045-typecheck-after.txt  2>&1; echo "exit=$?" >> /tmp/045-typecheck-after.txt
bun run lint         > /tmp/045-lint-after.txt       2>&1; echo "exit=$?" >> /tmp/045-lint-after.txt
bun run format:check > /tmp/045-format-after.txt     2>&1; echo "exit=$?" >> /tmp/045-format-after.txt
diff /tmp/045-typecheck-before.txt /tmp/045-typecheck-after.txt
diff /tmp/045-lint-before.txt      /tmp/045-lint-after.txt
diff /tmp/045-format-before.txt    /tmp/045-format-after.txt
```

Expected: `typecheck` ends `exit=0` in **both** files. For `lint` and
`format:check`, the only acceptable difference is none — and in particular **no
in-scope file may appear in the "after" failure list**. If one does, fix that
file's formatting/lint by hand; do **not** run `bun run format`, which would
rewrite the ~60 unrelated modified files in the tree.

Then the tests:

```bash
cd /Users/shaul/Desktop/D/platform/apps/server && bun --bun vitest run
cd /Users/shaul/Desktop/D/platform && bun run test:scripts
```

→ both exit 0.

**Optional live smoke check — NOT a gate, and not a done criterion.** It can
only produce a useful reading if the operator restarts the server themselves; a
still-running old process answers `200` to everything and proves nothing. You
must not start or restart a server. If one is already running and the operator
has restarted it since Step 3, derive the values instead of guessing them:

```bash
cd /Users/shaul/Desktop/D/platform
SERVER_PORT=$(grep -E '^PORT=' .env | cut -d= -f2); SERVER_PORT=${SERVER_PORT:-3001}
WEB=$(grep -E '^WEB_PORT=' .env | cut -d= -f2); WEB=${WEB:-3000}
# an origin the launcher emits for the active web port — expect HTTP 200
curl -s -o /dev/null -w "%{http_code}\n" -H "origin: http://127.0.0.1:$WEB" "http://127.0.0.1:$SERVER_PORT/health"
# a loopback origin nobody configured — expect HTTP 403
curl -s -o /dev/null -w "%{http_code}\n" -H "origin: http://localhost:9999" "http://127.0.0.1:$SERVER_PORT/health"
```

`200` from both = stale process, inconclusive, move on. If the operator reloads
the app and it breaks, the newest `logs/*.jsonl` now names the rejected origin:

```bash
grep "auth rejected request" $(ls -t /Users/shaul/Desktop/D/platform/logs/*.jsonl | head -1) | tail -5
```

Compare the logged `auth.origin` against `SERVER_ALLOWED_ORIGINS` in the server
process's environment. A mismatch there is a Step 1 bug, not a reason to restore
the loopback fallback.

## Test plan

The exact bodies are in Step 1 and Step 5; this is the summary a reviewer reads.

Both directions are covered, which is the point:

- **Tightening proved** — `rejects a loopback origin that is not on the
allowlist` (`app.test.ts`) and `closes a websocket opened from an untrusted
loopback origin` (`service.test.ts`). The first is the regression gate for the
  whole plan: it returns `200` against today's code and `403` after Step 3. The
  second proves the same predicate now rejects on the WS transport, and that no
  PTY is spawned.
- **Not-broken proved** — `accepts every launcher-listed spelling of the web
origin` (`app.test.ts`) and `builds exact origins for the selected web port` /
  `keeps a non-loopback web host exact` (`runtime-network.test.ts`). Without
  these, a plan that tightens the guard has no evidence it did not lock the user
  out, which is Option A's one real failure mode.

Also: one test deleted (`requires the bootstrap session token when configured`)
and two de-tokenized in `runtime.test.ts`.

Structural pattern to copy: `apps/server/src/tests/app.test.ts:38-48`
(`rejects disallowed origins`) for the HTTP cases,
`apps/server/src/terminal/tests/service.test.ts:23-46` for the WS case.

No browser-project tests. The behavior is server-side and fully reachable from
the in-process `node` project; the `browser` vitest project is slow and has been
observed to hang at the RUN banner.

Verification: `cd apps/server && bun --bun vitest run` → all pass;
`bun run test:scripts` → 5 pass.

## Done criteria

Machine-checkable. ALL must hold. Run every command from
`/Users/shaul/Desktop/D/platform`.

- [ ] `bun run typecheck` exits 0 (and `/tmp/045-typecheck-before.txt` also ended `exit=0`)
- [ ] `diff /tmp/045-lint-before.txt /tmp/045-lint-after.txt` and
      `diff /tmp/045-format-before.txt /tmp/045-format-after.txt` show no new failing
      file, and no in-scope file in either "after" list. (**Not** "verify exits 0" —
      `bun run verify` is red at HEAD on unrelated uncommitted settings/editor work
      and cannot be made green by this plan.)
- [ ] `cd apps/server && bun --bun vitest run` exits 0
- [ ] `grep -rn "sessionToken\|FS_SESSION_TOKEN" apps/server/src turbo.json` → no matches
- [ ] `grep -rn "isLoopbackOrigin\|'dev-origin'\|session-token" apps/server/src` → no matches.
      (`session-token` currently also appears in the string literal at
      `observability/tests/runtime.test.ts:146`; Step 5b renames it. Do **not**
      widen this grep to `authMode` — the unrelated Codex field at
      `provider/adapters/codex-protocol/generated/schema.gen.ts:165` will always match.)
- [ ] `grep -rn "authMode" apps/server/src --exclude-dir=generated` → no matches
- [ ] `grep -n "strictPort" apps/web/vite.config.ts` → `strictPort: true,`
- [ ] `cd apps/server && bun --bun vitest run src/tests/app.test.ts` passes and includes
      `rejects a loopback origin that is not on the allowlist`
- [ ] `bun run test:scripts` → 5 tests pass
- [ ] `grep -rn "FS_SESSION_TOKEN" apps scripts docs turbo.json .env.example --exclude-dir=dist`
      → matches only `docs/t3code-parity-second-sweep.md`
- [ ] `git status --porcelain | diff /tmp/045-baseline.txt -` shows changes only to files
      on the "In scope" list. The baseline already contains ~60 unrelated entries
      from in-flight settings/editor work — those are **not** yours and must not be
      reverted, committed, reformatted, or "cleaned up".
- [ ] `plans/README.md` row 045 status updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 0 lands on the "STOP" branch (the dispatching message asked for B or C).
- The drift check prints anything, or the "Current state" excerpts do not match
  the live code.
- `grep -rnIi "authorization\|bearer" apps/web/src` returns any line that is not
  one of the three scrubbing-list entries quoted in "Current state"
  (`chat-command-builders.ts:54`, `client-logging.ts:30`,
  `client-error-reporting.ts:17`). A fourth match — especially one inside a
  `headers`, `fetch`, `treaty`, or URL-building expression — would mean some
  client _does_ send a token, making the premise "session-token mode is
  unreachable" false. Fewer than three matches is fine and is not a stop.
- After Step 3, `bun run typecheck` in `apps/server` reports an error in any file
  other than `src/index.ts`, `src/tests/app.test.ts`, or
  `src/observability/tests/runtime.test.ts` — or reports **no** error at all,
  which would mean the type edits in 3a did not take effect.
- After Step 5, any test outside the three files listed in Step 5 fails. The
  specific thing this would mean: some code path was reaching the server from an
  origin the allowlist does not contain, and loopback-wide trust was silently
  covering for it. Report which test, which origin, and stop — do not add the
  origin to `DEFAULT_ALLOWED_ORIGINS` to make it green.
- `bun run --filter '*' test` fails inside `apps/web` or `apps/desktop` after
  Step 2 with a port/bind error. That points at `strictPort: true` (a port
  collision at test time), not at auth. Report the bound port; do not revert to
  `strictPort: false`.
- `bun run typecheck` did **not** end `exit=0` in the _before_ snapshot. The
  whole "compare to baseline" scheme assumes typecheck starts green. If it does
  not, stop and report the pre-existing errors rather than trying to separate
  yours from them.
- Any gate tempts you toward `bun run format`, `git checkout -- <file you did not
edit>`, `git stash`, or `git add`. None of those are part of this plan; the
  tree's ~60 pre-existing modifications belong to someone else.
- The live smoke check shows the real app 403-ing with an origin that IS present
  in the server's `SERVER_ALLOWED_ORIGINS`. Do not restore `isLoopbackOrigin` to
  make it pass; report the logged `auth.origin` value and the configured list.
- You find yourself wanting to touch `apps/web/src/lib/client.ts`,
  `orchestration-rpc-client.ts`, `scripts/dev.ts`, `scripts/prod.ts`, or
  `apps/desktop/src/bun/index.ts`. Under Option A none needs a change; wanting to
  edit the first two means the plan drifted into Option B, and wanting to edit
  the last three means Step 1 was done wrong (they call the helper, they do not
  duplicate it).

## Maintenance notes

For whoever owns this next:

- **The launcher is now load-bearing.** `allowedOriginsForWebPort` is the only
  thing standing between an exact guard and a lockout. Any new way to start the
  app (a new script, a container, a second desktop entry point) must route its
  web origin through it. `DEFAULT_ALLOWED_ORIGINS` in `auth.ts:25-32` covers only
  ports 3000/4173/5173.
- **What a reviewer should scrutinize**: (1) that both loopback spellings really
  reach `SERVER_ALLOWED_ORIGINS` for the _resolved_ port, not the preferred one;
  (2) that `strictPort: true` did not break a workflow that relied on vite
  hopping ports (e.g. two Platform checkouts running at once — they must now use
  different `WEB_PORT` values, which is the honest requirement); (3) that no
  `else` branches or nesting crept into `auth.ts` (AGENTS.md caps nesting at 3
  and forbids `else` after an early return).
- **Deferred on purpose**: real sessions (M4,
  `docs/environments-and-remote-plan.md:386-394`) — when it lands it _adds_ a
  credential on top of the exact origin check; no mode switch, no widening
  fallback. And the default workspace root (`index.ts:19`), which is about the
  surface behind the gate, not the gate.
- **Second thing this narrows, beyond ports.** `isLoopbackOrigin` accepted
  `https:` as well as `http:`; `runtimeUrl` only ever emits `http://`. So a
  future https dev server on loopback, which works today, would 403 under the
  exact list until `allowedOriginsForWebPort` learns to emit its scheme. Nothing
  in the repo serves https today — this is a note for whoever adds TLS, not a
  task now.
- **Known residual**: `localhost` and `127.0.0.1` are listed as separate origins
  because they are separate origins to a browser. On a host where `localhost`
  resolves to `::1` first and some other process holds `[::1]:PORT`, a page from
  that process would present an allowlisted origin string. This is far narrower
  than today's any-loopback-any-port trust, and closing it entirely would mean
  dropping the `localhost` spelling and telling users to type `127.0.0.1`. Judged
  not worth the UX cost; revisit if the app ever binds a dual-stack host.
