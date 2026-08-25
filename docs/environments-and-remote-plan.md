# Environments and Remote Access — Implementation Plan

> **STATUS: REVIEWED STRATEGY; NOT EXECUTABLE (reconciled 2026-08-24).** None of M1–M5 has landed:
> `serverUrl` is still an import-time constant, the client has no environment registry or scoped
> storage, and the silent-clean-close authorization heuristic still exists. Root [`PLAN.md`](../PLAN.md)
> owns cross-project order. Promote M1–M5 one at a time into `plans/` before implementation; M6 is
> explicitly deferred. Do not add compatibility machinery for simultaneous origins.

## 0. Skeptic's preface: what this actually buys us

The reference built environments for a chat client. We are an editor, a workbench, a terminal, an LSP host, a git client, and a chat client. That difference cuts both ways: the prize is bigger and so is the bill.

**What a user concretely gets:**

1. **The agent runs where the horsepower is.** Today every provider process is a child of the one Bun server, and that server is hard-bound to loopback (`apps/server/src/index.ts:24,97-101`). A twenty-minute Codex run burns the laptop you are typing on. An environment means the run happens on the desktop with 64 GB of RAM and the repo already warm, while you drive from the laptop.
2. **The whole workbench follows, not just chat.** The reference's remote environment gives you threads on another machine. Ours gives you the file tree, the editor buffers, the terminal PTY, the language server, git status, and search on another machine — VS Code Remote-SSH shaped. That is a materially larger product than what the reference shipped, and it is the reason we cannot just port their client layer: every one of our 47 `getClient()` calls is a filesystem/git/LSP call, not a chat call.
3. **Pick up a run from a second device.** Open the app on the iPad, see what the laptop is doing. Real, and the only one of the three that requires exposing anything on a network. It is also where all of the security cost lands.

**What it does not buy us, and where I disagree with the reference.** Payoffs 1 and 2 need _a switchable origin_, not _simultaneous origins_. A large fraction of the reference's complexity — per-environment projection sequencing (`refrences/t3code/apps/web/src/environments/runtime/service.ts:112-202`), the refcounted TTL-evicted subscription cache (`service.ts:101-109,419-475`, roughly 300 of that file's 1216 lines), scoped ref pairs threaded through every id (`refrences/t3code/packages/client-runtime/src/scoped.ts:9-64`), cross-environment logical projects (`refrences/t3code/apps/web/src/logicalProject.ts:85-133`) — exists to let one sidebar show threads from several backends at once.

Our sidebar is a file tree of one root. Our editor has one `rootFolder` (`apps/web/src/features/editor/state/editor-workspace-state.tsx`, persisted at `apps/web/src/lib/workspace-cache.ts:57`). Our terminal is a PTY on one machine. **One active environment at a time is not a compromise for us; it is the shape of the product.** I recommend we take it deliberately, and treat the reference's simultaneity machinery as a thing we can add later behind a tripwire rather than a thing we port now.

### Decisions this plan makes

| Question                                              | Decision                                                                                                                                                                           | Where the argument is |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| One active environment or several concurrently?       | **One.** Ambient `getClient()` survives; 47 call sites do not change.                                                                                                              | §3                    |
| One server process per environment?                   | **Yes.** Two module-scope singletons already enforce it (`apps/server/src/orchestration/ws-rpc.ts:33-39`, `apps/server/src/db/client.ts:25-34`) and the honest model matches them. | §1                    |
| What is an environment's identity?                    | Origin resolves it; a UUID in **the platform SQLite** asserts it.                                                                                                                  | §2                    |
| Query cache isolation?                                | **A QueryClient per environment**, not prefixed keys.                                                                                                                              | §3                    |
| Persistence isolation?                                | **One namespaced storage adapter**, not per-key surgery.                                                                                                                           | §2                    |
| Scoped ref pair types (`{environmentId, projectId}`)? | **No, deferred.** Needed for simultaneity, not correctness.                                                                                                                        | §7                    |
| The word "environment"?                               | Code noun is `Host`/`environmentId`; `ChatEnvironment` gets renamed to free the word.                                                                                              | §1                    |
| Plaintext HTTP off loopback?                          | **Refused, not warned about.**                                                                                                                                                     | §4                    |

---

## 1. What an environment is, in our vocabulary

**An environment is one running backend server process, reachable at one origin, owning one SQLite database and one filesystem view of one machine.**

That is the same definition the reference lands on (`refrences/t3code/apps/server/src/environment/Layers/ServerEnvironment.ts:38-67`), and it happens to be the only definition our server can currently support: `SERVER_INSTANCE_ID` is minted once at module scope (`apps/server/src/orchestration/ws-rpc.ts:33-39`) and `getDefaultPlatformDatabase()` opens a process-wide handle (`apps/server/src/db/client.ts:25-34`). Two environments inside one process would report the same instance id and share one database. Keep the one-process rule; it makes the entire multi-environment problem client-side plus launcher.

Mapping onto our existing nouns:

| Our noun                       | Relationship to an environment                                                                                         | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Server origin**              | 1:1. The origin _is_ how you reach an environment.                                                                     | `apps/web/src/lib/client.ts:7-9` — today a build-time constant.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Workspace root**             | Many per environment, and **not** part of its identity.                                                                | `FS_SYSTEM_ROOT` defaults to the filesystem root (`apps/server/src/index.ts:15-16`), so one server exposes the whole disk. A root is a selection _within_ an environment.                                                                                                                                                                                                                                                                                                                                                          |
| **Project**                    | Per environment, by construction.                                                                                      | `{id, title, workspaceRoot, …}` is a row in that server's SQLite (`packages/contracts/src/chat-model.ts:139-151`). Ids are server-minted, so cross-environment collision is a non-issue; the reason a project needs an environment is _routing_ (which client do I ask), not disambiguation. The reference conflates those two motives.                                                                                                                                                                                            |
| **Thread / session / message** | Per environment.                                                                                                       | Same database.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Provider instance**          | **Per environment, and this is a mapping the reference never discusses.**                                              | The Codex/Claude adapters spawn as children of the server (`apps/server/src/provider/provider-adapter-registry.ts`). Their logins, model access, and rate limits belong to the _host machine_. A remote devbox may have no Codex login at all. The descriptor must report which providers are usable, or "Run on devbox" fails at dispatch with a bad error.                                                                                                                                                                       |
| **Terminal session**           | Per environment; a PTY on that machine (`apps/server/src/terminal/service.ts:104`). Not stale when unreachable — dead. |
| **Language server**            | Per environment; a child process on that machine.                                                                      |
| **Editor tab / diff document** | **Does not map cleanly.**                                                                                              | These are client records keyed by absolute path (`apps/web/src/components/workspace/editor-tabs/utils/editor-tab-model.ts:34-48`) and by encoded query payloads (`apps/web/src/features/git/diff-document.ts:48-50`). The reference never had to scope a _document_; their scoped refs cover projects and threads. Paths are our most collision-prone key: `/Users/shaul/Desktop/D/platform` exists on the laptop _and_ on the devbox and means different bytes. Our answer is the storage namespace (§2), not an id shape change. |
| **Workbench pane geometry**    | Global, not per environment.                                                                                           | Its own doc comment already says so; percentages are chrome.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **`ChatEnvironment`**          | A naming collision to remove.                                                                                          | `apps/web/src/features/chat/environment/chat-environment.ts:15-30` is a transport seam, not a machine. Provider `environment` (child-process env vars, `apps/server/src/provider/driver.ts:35`) and evlog `environment` (`import.meta.env.MODE`, `apps/web/src/lib/client-logging.ts:74`) are two more. Three meanings in one repo is a grep hazard. Rename the transport seam to `ChatTransport` in the same pass; user-facing copy says **Machine**; code says `environmentId`/`Host`.                                           |

Where the reference's model does not map cleanly for us, in one line each:

- **Their "primary is derived, never chosen"** (`refrences/t3code/apps/web/src/environments/primary/target.ts:152-158`, and `setActiveEnvironmentId` at `store.ts:1897-1906` is set only from the server welcome) works because "which environment" is a property of the thread you clicked. Our editor, terminal, and LSP are one-machine-at-a-time, so we genuinely need a selection. That is the single biggest divergence and it drives the UI in §5.
- **Their `capabilities: { repositoryIdentity }`** is a chat-grouping flag. Ours needs to be a much wider capability block (providers available, terminal available, git available, OS for path handling) because more of our surface can be absent.
- **Their environment label** is a friendly hostname resolved via `scutil --get ComputerName` / `hostnamectl --pretty` (`ServerEnvironmentLabel.ts:66-103`). Good idea, wrong exposure — see §4.

---

## 2. Data model

### 2.1 Server-side identity

Add a singleton row to the platform database (`apps/server/src/db/client.ts:8-9`, default `~/.platform/fs-metadata.sqlite`):

```
environment(id TEXT PRIMARY KEY, created_at TEXT NOT NULL)
```

Minted on first boot, read forever after.

**Deliberate divergence:** the reference keeps the id in a separate file, `<stateDir>/environment-id` (`ServerEnvironment.ts:38-67`, `config.ts:96`). That lets the file and the database drift — delete the DB, keep the id, and every client's scoped state now points at an empty environment that claims to be the old one. Putting the id _in_ the database it identifies makes a wiped database honestly become a new environment, which it is: all projects and threads are gone.

### 2.2 Contracts

Two endpoints, deliberately split by trust level.

**`GET /environment` — unauthenticated, minimal.**

```ts
{ environmentId: string, protocolVersion: number, pairing: 'supported' | 'unsupported' }
```

Nothing else. This exists only so a client can learn an id _before_ it has a credential, which is what makes "add this machine" idempotent. The reference serves OS, arch, server version and the machine's friendly hostname here with no auth (`refrences/t3code/apps/server/src/http.ts:61-70`), so any LAN scanner learns "Shaul's MacBook Pro, darwin/arm64" from an unauthenticated probe. We refuse that.

**`GET /health` — authenticated, rich.** It already returns `{ ok, ...fs.info() }` including `workspaceRoot`, `systemRoot`, `maxTextFileBytes` (`apps/server/src/app.ts:103-107`). Grow it into the real descriptor rather than adding a third endpoint:

```ts
{
  ok, environmentId, label,            // label resolved like ServerEnvironmentLabel.ts:66-103
  protocolVersion, serverVersion,
  platform: { os, arch },
  roots: { systemRoot, workspaceRoot, maxTextFileBytes },
  capabilities: { terminal, lsp, git, wallpaper, providers: string[] },
}
```

`capabilities.providers` is the one the reference does not have and we need (§1).

**`environmentId` joins the WS handshake.** `orchestrationWsServerConfig()` (`apps/server/src/orchestration/ws-rpc.ts:41-55`) currently carries `serverInstanceId` — a _process_ id. Two different environments both bump the client's `generation` (`apps/web/src/features/chat/state/server-connection-store.ts:53-63`) and are indistinguishable. Add `environmentId` next to it, and have the client **hard-fail on identity drift** the way the reference does (`refrences/t3code/apps/web/src/environments/runtime/connection.ts:87-116`). Without that check, a devbox restarting against a different database silently pours a stranger's projects into an existing environment's slot. This is the invariant that makes every scoped key below safe.

### 2.3 Client persistence

Copy exactly one thing from the reference's runtime layer, because it is unambiguously right: **the persisted/ephemeral split** (`refrences/t3code/apps/web/src/environments/runtime/catalog.ts:14-21` vs `:246-260`).

Persisted, `platform.environments.v1`:

```ts
{ activeEnvironmentId: string | null,
  environments: [{ id, label, httpOrigin, addedAt, lastConnectedAt }] }
```

Ephemeral (Zustand, rebuilt from zero every launch), keyed by environment id:

```ts
{ connectionState: 'connecting'|'connected'|'disconnected'|'error',
  authState: 'authenticated'|'requires-auth'|'unknown',
  descriptor, lastError, lastErrorAt, connectedAt }
```

### 2.4 Scoping existing state — the namespace, not the key

We have these localStorage keys today:

- `apps/web/src/lib/workspace-cache.ts:42-44,53-61,66,74` — `platform.workspace-state.v3.*` covering `rootFolder`, `workspaces` (index), `workspaceLayout`, `uiMode`, `diffViewMode`, `wallpaperHidden`, `chatModePanels`, `chatModeSelection`, plus per-root slices `…workspace:<rootPath>` and `…search:<rootPath>`
- `apps/web/src/features/chat/state/chat-projection-cache.ts:26` — `platform.chat-projection`
- `apps/web/src/features/chat/lib/chat-draft-storage.ts:9` — `platform.chat-input-drafts.v1`
- `apps/web/src/features/chat/lib/chat-changed-files-expansion-storage.ts:3`
- `apps/web/src/features/chat/utils/thread-diff-scope-storage.ts:4`
- `apps/web/src/features/chat/state/prompt-stash-store.ts:10` — `platform:prompt-stash:v1`
- `apps/web/src/features/chat-mode/utils/session-read-storage.ts:6`
- `apps/web/src/features/chat-mode/utils/rail-collapse-storage.ts:4`
- `apps/web/src/features/editor/state/editor-color-theme-store.ts:30`
- `apps/web/src/components/theme-provider.tsx:67` — bare `theme`

Triage:

**Global chrome (unscoped):** `theme`, `platform.editor-color-theme.v1`, `workbenchLayout`, `uiMode`, `diffViewMode`, `wallpaperHidden`, `chatModePanels`, rail collapse. These describe the window, not the machine.

**Per environment:** `rootFolder`, `workspaces` index, every `workspace:<rootPath>` slice, every `search:<rootPath>` buffer, `chatModeSelection`, `platform.chat-projection`, chat input drafts, session reads, changed-files expansion, thread diff scope, prompt stash. These describe server truth or a filesystem that only exists on one machine.

**Mechanism: one adapter, changed in eleven places, not eleven key formats invented.**

```ts
// apps/web/src/state/environment-scoped-storage.ts
export function environmentScopedStorage(environmentId: string): ScopedStorage
// getItem/setItem/removeItem prefixing `env:${environmentId}|`
```

Every per-environment module takes a `ScopedStorage` instead of touching `localStorage` directly. `workspace-cache.ts` is nearly free — it already builds keys from `CACHE_KEY_PREFIX` (`:42`), so eight keys plus two prefixes move with one edit.

The `chat-projection` cache (`chat-projection-cache.ts:26`) is the most user-visible leak if we skip this: it paints projects and threads from localStorage _before any socket connects_, so a cold boot pointed at environment B would show A's sidebar as if it were B's.

**Migration: none.** Per CLAUDE.md's greenfield rule, we do not write healing code and we do not bump-and-orphan. The instruction to the developer is one line: **clear site data for the app origin once after M2 lands.** Nothing ships to do it.

### 2.5 What we do _not_ add to the data model

No `ScopedProjectRef`/`ScopedThreadRef` pair types (`refrences/t3code/packages/contracts/src/environment.ts:62-78`), no `${environmentId}:${localId}` flattened keys (`scoped.ts:9-64`), no environment segment inside editor tab ids or diff document ids (`editor-tab-model.ts:34-48`, `diff-document.ts:48-50`). Under one active environment the environment is ambient and the storage namespace already separates persisted state. The pair types earn their keep only when two environments' objects must coexist in one list — see the M6 tripwire in §6.

---

## 3. Transport

### 3.1 The hard constraint

`treaty<App>(serverUrl, …)` captures the domain in a closure at construction (`apps/web/src/lib/client.ts:13-15`). Eden exposes no `setDomain` and no function-valued domain. **The treaty client cannot be re-pointed, only replaced.** Everything below follows from that.

`serverUrl` itself is worse than a runtime value: `import.meta.env.VITE_SERVER_URL` is statically inlined by Vite (`apps/web/src/lib/client.ts:7-9`; the mechanism is proven by `apps/web/vitest.config.ts:55-60` overriding it through `define`). In a production bundle it is a literal string with no runtime hook.

### 3.2 Module-by-module

| Module                                                                                                                                                                                                                                                                                                | Today                                                                                                                                          | Becomes                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/lib/client.ts:7-9,13-15,17-32`                                                                                                                                                                                                                                                          | Build-time const + one `treaty` singleton behind `activeClient`                                                                                | `createEnvironmentClient(origin)` factory + a `Map<environmentId, Client>`; `getClient()` returns the active environment's client. `setClient`/`resetClient` survive as the test seam (`apps/web/test/fixtures.ts:4,50,52`) but mean "set the active environment's client". The comment at `:17-19` gets rewritten — it is no longer only a test seam. |
| The 47 `getClient()` calls across 16 modules (`features/git/api.ts` ×15, `lib/file-server.ts` ×12, `features/logs/api.ts` ×4, `lib/server-sockets.ts` ×2, `features/settings/api.ts` ×2, `chat/transport/orchestration-http-snapshots.ts` ×2, `chat/lib/checkpoint-diff-query.ts` ×2, plus 9 singles) | Ambient                                                                                                                                        | **Unchanged.** This is the entire payoff of choosing one-active-environment.                                                                                                                                                                                                                                                                           |
| `apps/web/src/lib/server-sockets.ts:30-45`                                                                                                                                                                                                                                                            | Terminal + LSP sockets via `getClient().terminal.subscribe()` / `.lsp.subscribe()`                                                             | **Free.** Eden derives the WS URL from the same captured domain, so they follow whichever client `getClient()` returns.                                                                                                                                                                                                                                |
| `apps/web/src/features/editor/editor-language-server-plugin.ts:11,111`                                                                                                                                                                                                                                | Builds a `ws://` URL from `serverUrl`                                                                                                          | **A decoy, budget nothing.** `EdenLanguageServerWebSocket` parses that URL straight back into `{path, root, server}` and re-dials through `getClient().lsp.subscribe()` (`server-sockets.ts:48-53,105-113`). The origin half is dead. Cosmetic cleanup.                                                                                                |
| `apps/web/src/features/chat/transport/orchestration-rpc-client.ts:677-682`                                                                                                                                                                                                                            | `new URL('/orchestration/rpc', serverUrl)`                                                                                                     | Per-environment instance. The class **already** accepts `url?: () => string` resolved on every fresh socket (`:54-60`), so its internals do not change.                                                                                                                                                                                                |
| Same file, `:652-666`                                                                                                                                                                                                                                                                                 | `const localOrchestrationRpcClient = new OrchestrationRpcClient()` plus five bound module exports                                              | **Deleted.** These pin the environment at import time and defeat the seam. Replace with `chatTransportFor(environmentId)`.                                                                                                                                                                                                                             |
| Same file — **missing capability**                                                                                                                                                                                                                                                                    | No public disconnect; `teardownSocket()` is private and only reachable from a close event, a transport error, or a dead heartbeat (`:447-472`) | Add `close()`. Without it a switch leaves the old socket alive — `openSocket()` returns the live one — and dispatches silently land on the previous backend. This is a prerequisite, not a nicety.                                                                                                                                                     |
| `apps/web/src/features/chat/state/thread-detail-subscriptions.ts:447-455`, `thread-earlier-pages.ts:88-93`                                                                                                                                                                                            | Module-level singletons                                                                                                                        | Per-environment factories. Left alone, thread detail and earlier-page loading keep talking to environment A while the shell supervisor moves to B — a silent split-brain, not a visible error.                                                                                                                                                         |
| `apps/web/src/features/chat/environment/chat-environment.ts:15-30`, `local-chat-environment.ts:17-26`                                                                                                                                                                                                 | `ChatEnvironment` type + `createLocalChatEnvironment()`                                                                                        | Rename to `ChatTransport` / `createChatTransport(deps)`. Chat is already the only backend-parameterized feature; it becomes the model the rest follows.                                                                                                                                                                                                |
| `apps/web/src/lib/client-logging.ts:143-147`                                                                                                                                                                                                                                                          | `logIngestEndpoint()` built from `serverUrl`                                                                                                   | Follows the active environment (that is the server whose `logs/` a developer greps). Add `environmentId` to every client wide event rather than splitting drains — CLAUDE.md's evlog rule is to enrich the one event.                                                                                                                                  |
| `apps/web/src/features/workbench/components/web-wallpaper.tsx:20-22`                                                                                                                                                                                                                                  | Three module-level const URLs, evaluated at import                                                                                             | Functions of the active origin — **and a product decision**: a remote environment's wallpaper is the _remote machine's_ desktop, which is wrong for a backdrop. Wallpaper is chrome; fall back to the bundled image whenever the active environment is not local.                                                                                      |
| `apps/web/src/lib/default-nerd-font.ts:63-66`                                                                                                                                                                                                                                                         | `serverUrl`-derived font URL                                                                                                                   | Follows the active origin. Harmless.                                                                                                                                                                                                                                                                                                                   |
| `apps/web/src/features/chat/utils/attachment-image.ts:26-31`                                                                                                                                                                                                                                          | `<img src>` from `serverUrl`                                                                                                                   | Must follow the environment that owns the thread. An `<img src>` is resolved by the browser with no ambient context — this is the one stored value that genuinely needs the origin baked in. Under one-active-environment the rule "you can only see the active environment's threads" makes it safe; note it as a tripwire for M6.                    |

### 3.3 Reconnect and generation logic

`server-connection-store.ts:12-19` is single-valued and global: one `generation`, one `serverInstanceId`, one `protocolVersion`, one `slowRequestCount`. It becomes per-environment state.

`installServerRestartInvalidation` (`server-restart-invalidation.ts:24-41`) calls unfiltered `queryClient.invalidateQueries()` on a generation bump. That is **exactly right for a restart of the same environment** and **exactly wrong as a switch signal**, for two reasons:

1. It is late by one handshake. Between the switch and the new socket's `connected` frame, every `getClient()`-backed query keeps serving environment A's data with no staleness marker. The UI paints the wrong machine's files and git status for one round trip, which reads as data corruption.
2. It is a sledgehammer. A→B→A re-invalidates the world every time, because nothing is cached per environment.

**Therefore: a QueryClient per environment, swapped synchronously on switch.** Not environment-prefixed keys. Every key in `apps/web/src/lib/query-keys.ts:1-60` is path- or id-based — `fileSystemKeys.tree(rootPath)`, `gitKeys.status(path)`, `documentSymbolKeys.document(rootPath, path, rev)`. Prefixing five factories means auditing every call site, and one forgotten factory is a silent cross-environment cache hit against an identical absolute path. A separate QueryClient cannot leak by construction, and swapping it _is_ the synchronous "nothing from A is valid" signal. Cost: caches do not survive switch-and-switch-back; the namespaced chat projection cache covers the cold-paint case. Accept it.

Keep `installServerRestartInvalidation` for its actual job: same-environment process restarts.

### 3.4 The `isUnauthorizedClose` heuristic is a remote-access bug

`orchestration-rpc-client.ts:740-747` treats _any_ clean WS close that delivered no frame as an auth refusal, and `isBlockedStreamError` (`apps/web/src/features/chat/utils/stream-reconnect.ts:15-25`) then parks the supervisor indefinitely (`use-chat-shell-subscription.ts:109-114`). The heuristic is sound against our own server, which closes a rejected upgrade cleanly and immediately (`apps/server/src/orchestration/ws-rpc.ts:86`). It is wrong through any proxy, tunnel, or mesh VPN that closes an idle or unroutable upgrade cleanly. Against a remote environment, a Tailscale hiccup parks chat forever with no re-auth path in the UI.

**Fix before remote, not after:** the server sends close code `1008` on auth refusal; the client stops inferring from a silent clean close and deletes `event.wasClean && !deliveredMessage` from the predicate.

### 3.5 Server and launcher

- No vite dev proxy (`apps/web/vite.config.ts:43-52`) — cross-origin is already the normal case, so a different origin is not a new class of problem. But any new request header must be added to `allowedHeaders` in the CORS config (`apps/server/src/app.ts:82-96`) or preflight kills it silently. **Recommendation: add no header. The origin is the environment.**
- The desktop shell hard-wires one server: it computes `SERVER_URL` (`apps/desktop/src/bun/index.ts:36`), kills whatever holds the two ports (`:78-79`), spawns the server (`:87`), spawns vite with `VITE_SERVER_URL` (`:117`), and waits on `/health` (`:82`). Under this plan it keeps spawning exactly one local environment; additional environments are rows in the client registry, not extra child processes.

---

## 4. Auth and trust model

This section is the reason to be slow.

### 4.1 What is actually at stake

**Pairing a device is equivalent to handing it a root shell as your user.** Any framing softer than that is dishonest, and it must appear in the pairing UI in those words.

Concretely, an authenticated client of our server can:

- spawn a PTY and run anything (`apps/server/src/terminal/service.ts:104`) — this is RCE by design, it is the feature;
- read and write **every file the user can**, because `FS_SYSTEM_ROOT` defaults to the filesystem root (`apps/server/src/index.ts:15-16`);
- push with the host's git credentials (`apps/server/src/git/service.ts:560`);
- dispatch provider turns, spending the host's Codex/Claude auth and running whatever tools the agent decides to run.

There is no capability partition to hide behind: our one principal holds `['filesystem:read','filesystem:write']` (`apps/server/src/auth.ts:34-37`) and the WS surfaces check only that the request authenticated (`ws-rpc.ts:86`, `lsp/routes.ts:56`, `terminal/service.ts:104`).

### 4.2 Adversaries

1. **Same-LAN attacker** (coffee shop, coworking, shared office Wi-Fi). Reads plaintext HTTP/WS off the wire, port-scans, and can answer a probe first.
2. **Malicious browser extension or XSS in our own app.** Reads `localStorage`. The reference stores a 30-day, owner-capable bearer token there in cleartext in the browser build (`refrences/t3code/apps/web/src/clientPersistenceStorage.ts:13`). That is its weakest link and we have no keychain in the CEF shell to do better.
3. **Another process running as the same user on the host.** Already has everything. Out of scope — with one exception:
4. **The agent we ourselves spawned.** This one is specific to us and absent from the reference's thinking. Our provider adapters run arbitrary tool calls as the user. If credential minting is reachable from the filesystem or an unauthenticated CLI, a tool call installs a persistent backdoor. The reference's `t3 auth session issue --role owner` (`refrences/t3code/apps/server/src/cli.ts:885-918`) mints a 30-day owner token with no credential check whatsoever — coherent for a local dev tool, unacceptable in a product that spawns agents as itself.
5. **A rogue host answering the address.** Nothing in the reference authenticates the _server_ to the client: `environmentId` is a self-asserted UUID (`ServerEnvironment.ts:38-67`), there is no TOFU pin and no fingerprint. Over plaintext, a machine that wins the race gets handed the pairing code the user typed.

### 4.3 Today's baseline, stated honestly

- One mode: an exact origin allowlist (`apps/server/src/auth.ts`). There is no token mode.
- The allowlist is exact; the launcher (`scripts/runtime-network.ts` `allowedOriginsForWebPort`) hands the server both loopback spellings of the resolved web port, and `apps/web/vite.config.ts` pins that port with `strictPort`.
- Every request and WS upgrade requires an `Origin` header to exist at all (`auth.ts:102-107`).
- `assertLoopbackHost` refuses any non-loopback bind (`apps/server/src/index.ts:24,97-101`).

The loopback assertion is what makes all of the above acceptable. **It is the last line we change, not the first.**

### 4.4 What we ship

**Transport — TLS or a mesh VPN, with no plaintext escape hatch.** The reference ships `http://<lan-ip>:<port>` connection strings and pairing URLs (`refrences/t3code/apps/desktop/src/serverExposure.ts:53-79`), with "use a tailnet" as documentation. A 30-day owner token crossing shared Wi-Fi in cleartext is not a documentation problem. For v1, a non-loopback environment origin must be `https://` or a tailnet address; the client target resolver **errors with a real message** rather than silently upgrading a bare host to `https` and reporting "unreachable" (which is what `refrences/t3code/apps/web/src/environments/remote/target.ts:9-24` does). The mesh VPN's certificate is also our only answer to adversary 5.

**Sessions.** Copy the reference's token design, which is genuinely good: `base64url(JSON claims) + '.' + HMAC-SHA256`, verified with a length-checked `timingSafeEqual`, then a database row lookup for existence and `revokedAt` (`refrences/t3code/apps/server/src/auth/Layers/SessionCredentialService.ts:29-51,202-213,255-308`). No JWT means no `alg`-confusion class of bug; the DB row means revocation is instant rather than waiting out an expiry. Signing key: 32 random bytes, `flag: 'wx'`, mode 0600 in a 0700 directory, race handled by re-read (`ServerSecretStore.ts:74-124`).

**Pairing.** One-time code, 12 characters from a 32-symbol ambiguity-free alphabet (no `0/1/I/O`), ~60 bits, uniform because 256/32 divides exactly (`BootstrapCredentialService.ts:32-40,136-169`). Five-minute TTL. Single-use enforced atomically with `UPDATE … WHERE consumed_at IS NULL AND expires_at > now RETURNING` (`AuthPairingLinks.ts:125-144`) — copy that statement shape verbatim.

**Token in the URL fragment.** `/pair#token=<CODE>`, with any `token` search param explicitly deleted first (`refrences/t3code/apps/server/src/auth/Layers/ServerAuth.ts:315-324`), read from the hash and stripped with `history.replaceState` _before_ the exchange fires (`refrences/t3code/apps/web/src/environments/primary/auth.ts:64-84`). Fragments are not sent to the server, not in access logs, not in `Referer`. This is the single detail most worth copying exactly — and we refuse the reference's own `?token=` fallback (`pairingUrl.ts:13-14`), which undoes it.

**WebSocket credentials.** Browsers cannot set headers on a WS handshake, so the secret would otherwise ride the URL. Mint a 5-minute, single-purpose `kind: 'websocket'` token per connection attempt (`ServerAuth.ts:326-371`). We already parse `?token=` off the WS URL (`apps/server/src/auth.ts:150-183`) — with the _static_ shared secret, which is exactly the mistake this avoids. Keep the plumbing, change what rides it.

**Rate limiting on the pairing-consume endpoint.** The reference has none anywhere; 60 bits of entropy is doing all the work unaided. Cheap; add it.

**Keep our Origin check.** The reference has no Origin check on state-changing routes and no `allowedOrigins`/`credentials` on its CORS layer (`refrences/t3code/apps/server/src/http.ts:33-37`); CSRF defence rests entirely on `SameSite=Lax`. Ours (`auth.ts:102-115`) is stricter. Do not regress it when sessions land.

**Port-scoped cookie name** if we ever use cookies: cookies ignore port, so two local servers on `localhost` clobber each other's session. The reference solves it with `t3_session_3773` (`refrences/t3code/apps/server/src/auth/utils.ts:5-16`). Two-line fix, real trap.

**Desktop bootstrap over file descriptor 3**, not argv (world-readable via `ps`) and not env (leaks into children). The reference passes a 24-byte hex token as a one-line JSON envelope on fd 3 (`refrences/t3code/apps/desktop/src/main.ts:1383-1412`, `apps/server/src/bootstrap.ts:14-83`). Our landing site is `spawnServer()` at `apps/desktop/src/bun/index.ts:87`.

**Log hygiene, enforced.** The reference writes the complete owner pairing URL into its structured log on every boot (`refrences/t3code/apps/server/src/serverRuntimeStartup.ts:243-256`). CLAUDE.md mandates wide structured logging and we grep `logs/` constantly, so this is precisely our failure mode. Ship a test that fails if a credential-shaped field name reaches an evlog event. Log the pairing _id_, never the code.

**Every outstanding credential is enumerable and revocable from the UI.** The reference's `listPairingLinks()` filters out owner-bootstrap subjects (`ServerAuth.ts:234-248`), creating a credential class the Connections panel cannot show or revoke. Ours shows all of them.

**Owner cannot revoke its own session** (`ServerAuth.ts:280-313`) — small, correct, copy it. You should not be able to lock yourself out of the machine you are sitting at.

### 4.5 What we refuse to ship

1. **Plaintext HTTP off loopback.** Refusal, not a warning banner.
2. **A "client" role that reads as reduced privilege while holding full terminal/filesystem/git access.** The reference's `owner`/`client` split gates six `/api/auth/*` routes and two orchestration HTTP routes; `ws.ts` contains no role read at all, and the WS RPC group _is_ the entire capability surface. A paired phone with role `client` has RCE on the host. Either we gate capabilities at the RPC boundary (terminal spawn, fs write, git push, provider dispatch each check a capability set) or we ship exactly one trust level and say so in the pairing dialog. **Copying the role names without the checks is the worst of the three options.**
3. **A long-lived bearer token in `localStorage`.** Our CEF shell has no `safeStorage` equivalent (the reference's Electron path is `refrences/t3code/apps/desktop/src/clientPersistence.ts:144-200`; its _browser_ path is cleartext at `clientPersistenceStorage.ts:13`). Until there is a keychain route through the desktop shell, remote sessions are hours-long and re-paired, or remote is desktop-only.
4. **An unauthenticated endpoint that leaks the machine's friendly hostname, OS, or arch.** See §2.2.
5. **An unauthenticated CLI credential-minting oracle.** If we add a CLI mint, it requires a human confirmation on a TTY. See adversary 4.
6. **`unsafe-no-auth` as a named contract variant** (`refrences/t3code/packages/contracts/src/auth.ts:25-33`). It is dead in their server and live in their client's type union. A named unsafe mode invites someone to implement it.
7. **A 30-day session with no refresh and no recovery path.** In the reference, an expired or revoked remote session leaves the client holding a stale token, `/api/auth/session` answers 200 with `authenticated: false`, the subsequent ws-token 401 dies into `Effect.orDie`, and the only fix is Remove + Add (`service.ts:838-860`, `rpc/protocol.ts:110-121`). Whatever we ship needs an explicit re-pair flow triggered by `requires-auth` — which is also why §3.4's park-forever bug must be fixed first.

### 4.6 Stated as unsolved

**Server authentication.** Nothing in this design proves to the client that the machine answering an address is the machine it paired with, beyond the transport's own certificate. That is acceptable _only_ because §4.4 makes TLS or a mesh VPN mandatory rather than recommended. If anyone proposes relaxing that, the missing half of the pairing model becomes live again.

---

## 5. UI

### 5.1 The environment belongs in the URL

Once the router lands, the environment is the **outermost** segment, above workspace root and above `uiMode`:

```
/e/:environmentId/workbench/...
/e/:environmentId/chat/:threadId
```

Reason: the environment decides which server answers, so it must be resolvable before any loader runs. The reference gets this for free from `/$environmentId/$threadId` (`refrences/t3code/apps/web/src/threadRoutes.ts:15-38`) and it is the right shape.

**But we diverge on who owns the selection.** The reference deliberately has no global environment switch — `setActiveEnvironmentId` is set only from the primary server's welcome (`refrences/t3code/apps/web/src/store.ts:1897-1906`, callers at `routes/__root.tsx:229-233,341-344`). That works when the environment is a property of the thread you clicked. Our editor, terminal, and LSP are one-machine-at-a-time, so we need a real selection.

Resolution: **the store is the selection; the URL segment mirrors it in both directions.** That is why §6 puts the store first. Before the router exists, selection lives in `platform.environments.v1.activeEnvironmentId`; when the router lands, the router work is a small adapter that reads the segment into the store on navigate and pushes a segment on switch. Editor tabs stay in the store — they are a set, not a location; the URL names the environment plus the active document.

### 5.2 Switching

**Where:** the titlebar (`apps/web/src/components/app-titlebar.tsx`) as a chip showing the environment label plus a status dot, and a command-palette group (`apps/web/src/components/command-palette/content.tsx`, using the existing group factories). The reference puts its picker in the chat branch toolbar as "Run on" (`BranchToolbarEnvironmentSelector.tsx:55-88`) — correct for them, because it is a per-thread composer affordance scoped to the logical project's members. Ours is a workspace-level switch and belongs in the workspace chrome.

**What a switch does,** in order: tear down the orchestration socket (the new `close()` from §3.2), swap the QueryClient, swap the storage namespace, restore that environment's `rootFolder`, editor tabs, and chat selection from its own namespace. It is closer to "open another window onto another machine" than to applying a filter, and the UI should feel like that — a full repaint, not a fade.

**One rule copied from the reference in spirit:** a running turn does not migrate. Their `envLocked` freezes a thread's environment as soon as it has any message or a live session (`refrences/t3code/apps/web/src/components/ChatView.tsx:1516-1520,1530-1542`), which eliminates the hardest problem in the whole design. Ours: switching away from an environment with a live turn does not cancel it; switching back rejoins through the existing resume path.

**Labels.** Three sources with a deliberate order: server descriptor label → user-set label → origin. The reference additionally denylists useless server labels like "local"/"local environment" and always sorts the local environment first (`BranchToolbar.logic.ts:18-43`). Small, and it is the difference between a picker that reads like a place and one that reads like a UUID.

### 5.3 When an environment is unreachable

Per-environment state in a store, **never a global modal** — the reference gets this right (`service.ts:986-1001`) and the app keeps working with whatever is up.

Our failure surfaces mostly exist already: the shell supervisor's `offline`/`reconnecting`/`blocked` phases (`use-chat-shell-subscription.ts:90-118`) and the shared retry ladder (`stream-reconnect.ts:6-12`). What changes is that they become per-environment, and the _workbench_ needs its own version — file, git, and LSP queries fail independently of chat and today nothing coordinates them.

What the user sees, surface by surface:

- **Titlebar chip** → `warning` dot, tooltip with the last error and the time.
- **File tree and git panel** → paint the environment's last cached slice (`workspace-cache.ts:66`), explicitly marked stale. Not blank. A blank tree reads as "your project is gone".
- **Terminal** → disconnected banner, not a spinner. A PTY on a machine you cannot reach is dead, not stale; say so.
- **Editor** → open buffers stay readable, saves are disabled with a reason. Never let a save appear to land.
- **Chat** → the existing reconnecting phase, unchanged.

**Two reference asymmetries we avoid by construction:**

- Their automatic recovery — retry on `online`/focus, the Disconnected toast, the stalled-retry watchdog — is wired **only to the primary connection** (`WebSocketConnectionSurface.tsx:106-135`); saved remotes recover only via a manual Reconnect button. That reads as a bug: the local backend heals after a laptop sleep and the paired remote does not. We ship one recovery coordinator keyed by environment from day one.
- Every one of their transports writes into a single global `wsConnectionState` (`refrences/t3code/apps/web/src/rpc/protocol.ts:50-63`), so a flapping remote drives the primary's banner and toast. With one active connection we cannot hit this, and per-environment state means we still cannot when M6 arrives.

### 5.4 Where the pairing flow lives

Today `AppWorkspace` branches on `rootFolder`: `WorkspaceView` or `EmptyWorkspace`, with
`CommandProvider` mounted above the branch — which is exactly why settings remains a dialog.
Pairing needs a full surface, so it becomes a third branch at that same level:
`pairing-required` / `environment-unreachable` → a surface, not a dialog.

Three jobs, three homes — the same split the reference gets right (`ConnectionsSettings.tsx:1288-1447` for management, the toolbar for selection):

- **Manage** (list, add, remove, revoke sessions, show outstanding pairing codes) → a page in the settings dialog.
- **Select** → titlebar chip + command palette.
- **Pair** → a full surface, reached from the manage page or from a `/pair#token=` link.

---

## 6. Milestones

Each is independently verifiable, but the sequence is strict. Nothing touches the network before M5.
These sections are design inputs, not executable handoff plans; promotion into `plans/` must refresh
paths, ownership, focused checks, cleanup instructions, and STOP conditions against live source.

### M1 — Runtime origin, one environment at a time

- `serverUrl` const → `activeEnvironmentOrigin()`, seeded from `VITE_SERVER_URL` (`apps/web/src/lib/client.ts:7-9`).
- `createEnvironmentClient(origin)` + client registry; `getClient()` returns the active one (`client.ts:13-32`).
- The five raw-URL sites become functions: `client-logging.ts:143`, `web-wallpaper.tsx:20-22`, `default-nerd-font.ts:63-66`, `attachment-image.ts:26-31`, `orchestration-rpc-client.ts:677-682`.
- `OrchestrationRpcClient.close()` added; the five bound module exports (`:652-666`) replaced by a factory; same for `thread-detail-subscriptions.ts:447-455` and `thread-earlier-pages.ts:88-93`.
- `ChatEnvironment` → `ChatTransport` (`chat-environment.ts:15-30`, `local-chat-environment.ts:17-26`, call sites in `chat-view.tsx`), freeing the word.
- Cosmetic: drop the dead origin half of `editor-language-server-plugin.ts:111`.

**Done when** a user can start a second server on a second port against a second `FS_METADATA_DB`, enter its origin in a dev-only field, and watch the entire app — file tree, editor, git, terminal, LSP, chat — switch to it and back without a page reload. Still loopback, no persistence, no auth change.

### M2 — Identity and per-environment state

- `environment` singleton row in the platform SQLite; `environmentId` added to `orchestrationWsServerConfig()` (`ws-rpc.ts:41-55`) and to `/health` (`app.ts:103-107`); minimal unauthenticated `GET /environment`.
- Client hard-fails on identity drift on every handshake.
- `platform.environments.v1` registry + ephemeral runtime store.
- `environmentScopedStorage` adapter; the eleven per-environment keys move behind it; `CACHE_KEY_PREFIX` (`workspace-cache.ts:42`) gains the environment segment.
- QueryClient per environment; `installServerRestartInvalidation` narrowed to same-environment restarts.
- No migration code. The developer clears site data once.

**Done when** a user can switch between two local environments and each one remembers its own root folder, editor tabs, git panel state, and chat selection — and switching back paints the previous environment's sidebar from cache before any socket connects.

### M3 — Environment UI and honest failure, still local

- Titlebar chip, command-palette group, settings page with status dot / add / remove.
- Per-environment connection state; one recovery coordinator keyed by environment.
- Unreachable surfaces: stale-marked tree and git, dead terminal banner, read-only editor.
- Delete the `isUnauthorizedClose` heuristic (`orchestration-rpc-client.ts:740-747`); the server sends `1008` on refusal instead.

**Done when** a user can kill one of two local servers, see that environment go to an error state with a readable reason, keep working in the other, and watch it reconnect by itself when the server comes back — with no page reload and no manual button.

### M4 — Real sessions, still loopback

- Introduce issued sessions: signed opaque token, timing-safe verify, DB row, instant revoke. There is no static token to replace — the origin allowlist is the whole guard today.
- Pairing credential table with atomic one-time consume, 5-minute TTL, 12-char alphabet.
- Short-lived WS token on `?token=`, alongside the origin check.
- Desktop bootstrap token over fd 3 into `spawnServer()` (`apps/desktop/src/bun/index.ts:87`).
- Rate limit the consume endpoint. Ship the log-hygiene test.

**Done when** a user can run the desktop app and be authenticated end to end, and can revoke a session from Settings and watch that browser tab lose access on its next request.

### M5 — Remote, over a trusted network only

- `assertLoopbackHost` (`index.ts:97-101`) relaxes behind an explicit opt-in that requires configured sessions and refuses non-TLS non-loopback origins.
- Pairing surface at `/pair#token=`, fragment-only, `replaceState` before exchange.
- Client target resolver errors on `http://` + non-loopback instead of silently upgrading.
- Session TTL in hours, not days, until a CEF keychain path exists.
- Pairing dialog states plainly that pairing grants full access to the machine.

**Done when** a user can pair a second machine on their tailnet by scanning a code, open a repo that lives on the first machine, edit and save a file, run a terminal command, and commit — then revoke that pairing from Settings and watch the second machine lose access immediately.

### M6 — Cross-environment reads (gated; do not start on speculation)

Only if someone asks twice. Requires: repository identity on the server (we have nothing like `refrences/t3code/apps/server/src/project/Layers/RepositoryIdentityResolver.ts:100-116` — our git service never reads `remote -v`; it only shells `fetch` and `push` at `git/service.ts:175-176,560`), the scoped ref pairs deferred in §2.5, per-environment projection sequencing, and the environment-baked attachment URL from §3.2.

**Done when** a user can see, in one rail, threads for the same repository running on their laptop and on their devbox.

---

## 7. What we deliberately will not copy

1. **Scoped ref pair types and `${environmentId}:${localId}` keys** (`packages/contracts/src/environment.ts:62-78`, `packages/client-runtime/src/scoped.ts:9-64`). They exist for simultaneity, not correctness. Our ids are server-minted and unique; the routing question is answered by the active environment; persistence isolation is handled by the storage namespace. Retrofitting a pair into editor tab ids (`editor-tab-model.ts:34-48`) and diff document ids (`diff-document.ts:48-50`) would touch every persisted key we have for a benefit we do not yet have.
2. **Cross-environment logical projects and repository-identity grouping** (`logicalProject.ts:85-133`, `environmentGrouping.test.ts:253-281`). That is a chat-sidebar payoff. Our sidebar is a file tree of one root on one machine.
3. **The refcounted, TTL-evicted per-(environment, thread) subscription cache** (`service.ts:101-109,267-305,419-475`). Roughly 300 lines that exist because subscriptions outlive connections when several connections coexist. One active environment means teardown on switch.
4. **`envMode` as a name for worktree-vs-checkout** (`BranchToolbarEnvModeSelector.tsx:20-25`). The reference overloads "env" across two orthogonal axes (which machine × which checkout) and it reads as a live naming bug. Our worktree picker keeps the word worktree.
5. **`unsafe-no-auth` in the contract** (`packages/contracts/src/auth.ts:25-33`). Dead in their server, live in their client's types. A named unsafe mode is an invitation.
6. **Roles without capability checks.** `owner`/`client` gates six auth routes and two HTTP routes; `ws.ts` — which carries terminal, filesystem, git, provider dispatch, and orchestration — reads no role at all. Copying the names without the checks manufactures a false sense of least privilege.
7. **Plaintext LAN pairing** and the `http://<lan-ip>:<port>` connection string (`apps/desktop/src/serverExposure.ts:53-79`, `REMOTE.md`). A 30-day owner-capable token on shared Wi-Fi in cleartext.
8. **An unauthenticated descriptor that leaks the friendly hostname, OS, and arch** (`apps/server/src/http.ts:61-70`, `ServerEnvironmentLabel.ts:66-103`). Ours returns an opaque id and a protocol version; the label is served after auth.
9. **The pairing URL in the startup log** (`serverRuntimeStartup.ts:243-256`). We grep `logs/` constantly; a live owner credential sitting there for five minutes is our exact failure mode.
10. **Bearer tokens in cleartext `localStorage`** (`clientPersistenceStorage.ts:13`). No keychain in CEF means short sessions instead, not a longer-lived plaintext secret.
11. **One global `wsConnectionState` fed by every transport** (`rpc/protocol.ts:50-63`), which lets a flapping remote drive the primary's banner and toast. Connection state is keyed by environment from the first line.
12. **Accepting `?token=` as a fallback for the pairing code** (`pairingUrl.ts:13-14`). It undoes the fragment discipline that the same codebase went to trouble to establish.
13. **Silently upgrading a bare typed host to `https://`** (`environments/remote/target.ts:9-24`). Produces "server unreachable" for what is actually a scheme mistake. We error with the real reason.
14. **A CLI that mints owner tokens with no credential check** (`apps/server/src/cli.ts:885-918`). We spawn agents as ourselves; that is a tool call away from a persistent backdoor.
15. **The environment id in a file beside the database rather than inside it** (`ServerEnvironment.ts:38-67`, `config.ts:96`). Ours lives in the database it identifies, so a wiped database is honestly a new environment.
16. **Filtering a snapshot but not the live stream.** Their `auth.access` subscription streams pairing links _including plaintext credentials_ to any authenticated session; the initial snapshot is filtered, the event path is not (`apps/server/src/ws.ts:91-103,1033-1064`). If we build a live connections panel, we filter at the publisher, not at the read model.

---

## Appendix: things we should fix regardless of whether environments ship

Found while tracing, each independently true today:

- `session-token` auth mode never worked end to end — the client sent no `Authorization` header anywhere — and was deleted; the guard is now the exact origin allowlist alone.
- The shared secret is compared with `===`, not `timingSafeEqual` (`auth.ts:134`).
- The only recorded design note for remote sessions is truncated mid-sentence at EOF (`auth.ts:185-186`). Replace it with a pointer to this document rather than guessing what it meant.
- `isUnauthorizedClose` will misread any proxy or tunnel and park chat forever (`orchestration-rpc-client.ts:740-747` + `use-chat-shell-subscription.ts:109-114`).
- `OrchestrationRpcClient` has no public disconnect (`:447-472`).
- `generation` counts server _processes_, so it cannot tell a restart from a different backend (`server-connection-store.ts:53-63` + `ws-rpc.ts:33-39`).
- The five bound module exports at `orchestration-rpc-client.ts:652-666` and the two singletons at `thread-detail-subscriptions.ts:447-455` / `thread-earlier-pages.ts:88-93` defeat the `ChatEnvironment` seam at the wiring level even though the type-level seam is real.
