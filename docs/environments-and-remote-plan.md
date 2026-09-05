# Environments — Strategy

> **STATUS: REVIEWED STRATEGY, REWRITTEN 2026-09-05 TO THE FEDERATED MODEL.** Supersedes the
> 2026-08-24 one-active-environment design. Root [`PLAN.md`](../PLAN.md) owns cross-project order.
> Executable slices: [`plans/077-environment-runtime-origin.md`](../plans/077-environment-runtime-origin.md)
> (transport and identity), the environment-aware rewrite of
> [`plans/068-session-domain-model.md`](../plans/068-session-domain-model.md) (domain), and
> [`plans/078-federated-environments.md`](../plans/078-federated-environments.md) (connections,
> rail, SSH launcher, UI). This document authorizes nothing by itself.

## 0. What changed since the first design, and why

The 2026-08-24 design chose **one active environment at a time** and deferred "several machines in
one sidebar" to a gated M6. The operator has now asked for exactly that sidebar: one flat list of
every project on every connected machine, the same repository on two machines grouped as one
project, and the editor able to open any of them. That is t3code's shipped model
(`references/t3code/docs/internals/remote.md`), so the simultaneity machinery the old design
deferred is now the product, not a tripwire.

Three things from the old design survive unchanged and are restated below rather than rederived:
the definition of an environment (§1), the security analysis of what a connected machine can do
(§4), and the list of reference behaviours we refuse to copy (§7).

Two things flip:

| Question                             | 2026-08-24                                   | Now                                                                                                                                                |
| ------------------------------------ | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| One or several environments at once? | One                                          | **Several connected, one workbench.** Chat federates every connected machine; files, terminal, LSP and tabs follow one machine at a time (§3).     |
| Scoped `{environmentId, id}` refs?   | Deferred; "needed for simultaneity only"     | **Mandatory.** Plan 068 makes project ids deterministic from repository identity, so the same repo on two machines has the _same_ project id (§2). |
| First remote transport?              | TLS or tailnet origin, after pairing (M4–M5) | **SSH port forward first, no pairing** (§3, §4). The mesh https origin comes second, pairing only when a client outside SSH reach exists.          |

## 1. What an environment is

**An environment is one running backend server process, reachable at one origin, owning one SQLite
database and one filesystem view of one machine.** `SERVER_INSTANCE_ID` is minted once per process
(`apps/server/src/orchestration/ws-rpc.ts:40`) and `getDefaultPlatformDatabase()` is a process-wide
handle (`apps/server/src/db/client.ts:50-57`); one process is one environment. User-facing copy says
**machine**; code says `environmentId`.

| Our noun                   | Relationship to an environment                                                                                                                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Server origin              | 1:1. Today a build-time constant (`apps/web/src/lib/client.ts:9`). Plan 077 makes it a runtime value.                                                                                                                                                  |
| Workspace root             | Many per environment; a selection within it, not part of its identity.                                                                                                                                                                                 |
| Project, worktree, session | Per environment by ownership. After Plan 068 a project id is derived from **repository identity**, so the same repository registered on two machines yields the same `ProjectId` on both servers. The browser therefore keys by `(environmentId, id)`. |
| Provider instance          | Per environment. A devbox may have no Claude login; the descriptor reports what it can run.                                                                                                                                                            |
| Terminal session, LSP      | Per environment; child processes on that machine. Dead when unreachable, not stale.                                                                                                                                                                    |
| Editor tab, diff document  | Client records keyed by absolute path. `/work/projects/platform` exists on two machines and means different bytes. Scoped by the storage namespace (§2.4), never by a path rewrite.                                                                    |
| Settings document          | **Read and written on the primary (local) environment by the client.** A remote server consumes its own settings file for server-side keys (LSP, terminal, fonts). See §3.4.                                                                           |
| `ChatEnvironment`          | A transport seam, not a machine. Renamed `ChatTransport` in Plan 077 to free the word.                                                                                                                                                                 |

## 2. Data model

### 2.1 Server identity

A singleton `environment_identity(id TEXT PRIMARY KEY, created_at TEXT NOT NULL)` row in the platform
SQLite, minted on first boot. It lives _inside_ the database it identifies, so a wiped database is
honestly a new environment. It joins the WS handshake (`orchestrationWsServerConfig`) next to
`serverInstanceId`, and the client refuses a handshake whose `environmentId` differs from the one it
recorded for that origin (identity drift). `/health` becomes the authenticated descriptor:

```ts
{ ok, environmentId, label, protocolVersion, serverVersion, platform: { os, arch }, ...fs.info() }
```

No unauthenticated descriptor exists. The SSH model does not need one and the old design's reason
for it (idempotent pairing) is deferred with pairing.

### 2.2 Repository identity and the same repo on two machines

Plan 068 derives `Project.repositoryKey` from **machine-independent repository identity**, in this
order: the normalized `origin` remote URL (host plus path, `.git` stripped, lowercased, as
`references/t3code/packages/shared/src/git.ts:114`), else the root commit hash, else the canonical
path for non-Git directories. `ProjectId` is UUIDv5 of that key. Consequences, all intended:

- The same repository cloned on the laptop and the devbox is **one project** in the rail with two
  worktrees on two machines. That is t3code's `repository` grouping mode, achieved without a
  client-side logical-project layer.
- A second independent clone on one machine registers as another worktree of the same project.
- Identity is captured at registration; a later remote rename does not re-key a live project.
- Because ids repeat across machines, every browser-side map is keyed by
  `scopedProjectKey(environmentId, projectId)` and `scopedWorktreeKey(...)`. Session ids are UUIDv4
  and globally unique, but they are still stored under their environment so the transport that
  owns them is never guessed.

### 2.3 Client registry

Machines are user configuration that reaches execution (an SSH target is executed by the launcher),
so they are a **settings registry entry**, not a localStorage key:

```ts
'environments.machines': record<name, { kind: 'ssh', target, repoPath, port? } | { kind: 'origin', url }>
```

`machine` scope, custom `machines` widget, edited on a Settings → Machines page. The local
environment is implicit and never listed. Ephemeral state (connection phase, descriptor, last
error, environmentId once learned, forwarded local port) lives in a Zustand store rebuilt on launch.

### 2.4 Scoping persisted state — the namespace, not the key

Per-environment localStorage keys (`workspace-cache-storage.ts:6`, `chat-projection-cache.ts:25`,
chat drafts, session reads, changed-files expansion, thread diff scope, prompt stash, rail
collapse) move behind one `environmentScopedStorage(environmentId)` adapter that prefixes
`env:${environmentId}|`. Global chrome (theme, palette, ui mode, workbench layout, address cache)
stays unscoped. No migration: the developer clears site data once.

## 3. Transport and connection model

### 3.1 The hard constraint

`treaty<App>(origin)` captures the origin in a closure; the Eden client cannot be re-pointed, only
replaced. `import.meta.env.VITE_SERVER_URL` is inlined by Vite. Plan 077 replaces the constant with
`createEnvironmentClient(origin)` plus a registry, and `getClient()` returns the **active workbench
environment's** client. The 64 `getClient()` call sites do not change.

### 3.2 Several connections, one workbench

- **Chat is federated.** One `ChatTransport` per connected environment, each with its own
  `OrchestrationRpcClient`, detail-subscription cache, earlier-page loader, shell supervisor and
  reconnect ladder. The projection store holds one slice per environment. The rail reads all slices.
- **The workbench is single-homed.** File tree, terminal, LSP, git, search and editor tabs are one
  machine at a time: whichever environment owns the active workspace root. Opening a project or
  selecting a session on another machine switches the workbench: swap the QueryClient (one per
  environment, so nothing from machine A can answer a query about machine B), swap the storage
  namespace, restore that environment's root, tabs and selection. A full repaint, not a fade.
- **A running turn never migrates.** Switching the workbench away from a machine does not touch its
  chat connection; the turn keeps streaming into its slice.

### 3.3 How a client reaches a machine

Both transports reduce to an origin; platform never learns which one produced it.

1. **SSH port forward (first).** The desktop shell owns it, like t3code's `DesktopSshEnvironment`:
   probe the target with `ssh -o BatchMode=yes`, start or reuse `bun apps/server/src/index.ts` in
   the configured repo checkout bound to remote loopback with `SERVER_ALLOWED_ORIGINS` set to the
   client's own page origin, forward the remote port to a local port with `ssh -N -L`, wait on
   `/health`, record the `environmentId`. Both ends stay loopback, the server's loopback assertion
   and origin allowlist are untouched, and the SSH key is the credential. `mesh`'s key-only SSH door
   on port 2222 is just an SSH target; a stock `~/.ssh/config` `Host` entry makes it one line.
2. **Direct origin (second).** `{ kind: 'origin', url }` for an `https://` origin such as the one
   `mesh serve pc 3001 --at /platform` publishes on the tailnet with a real certificate. Needs the
   remote server started with the client's origin allowed, and two things to verify in a spike
   before it is scheduled: WebSocket upgrades through mesh's reverse proxy and path-prefix tolerance
   (mesh strips the prefix and sends `X-Forwarded-Prefix`; the server has no base-path support).
   A plain `http://` non-loopback origin is refused with a real message, never upgraded silently.

There is no install step. The remote machine has the repository and Bun already; the launcher only
starts or reuses the server. A version skew surfaces as the existing WS protocol-version refusal.

### 3.4 Settings across machines

The client's `useSettingValue`/`readSettingsMirror` always read the primary environment's settings
document. Server-consumed keys (`lsp.*`, `terminal.*`, fonts) are read by each server from its own
file, which is already how they work. `window`/`resource` scoped values inside a remote workspace
folder are read by the remote server for its own consumption only. A Settings page therefore always
edits the local document; a remote server's own file is edited on that machine.

## 4. Auth and trust model

**Connecting a machine is equivalent to handing it a root shell as your user**, in both directions:
the client can spawn PTYs, read and write every file, push with the host's git credentials, and
spend the host's provider auth. The Machines page says so in those words.

- **SSH forward:** trust is the SSH key plus, for mesh hosts, tailnet membership and the mesh
  identity key. Traffic never leaves loopback on either machine. Nothing platform could add on top
  makes this safer, so **pairing codes, issued sessions and revocation are deferred** until a client
  that cannot SSH (a phone on the public edge) exists. Only the origin allowlist and the loopback
  bind guard the server, exactly as today.
- **Direct origin:** TLS or tailnet only. Plaintext HTTP off loopback is refused, not warned about.
  The remote server's allowlist must name the client page origin; a mismatch is a CORS refusal with
  a readable reason in the Machines page.
- **Log hygiene:** SSH targets and forwarded ports are fine to log; nothing credential-shaped ever
  exists to leak. If pairing lands later, ship the log-hygiene test with it.
- **Stated as unsolved:** nothing proves to the client that the process answering a forwarded port
  is the one it launched, beyond SSH host-key verification and the recorded `environmentId`. Accept.

The old design's session/pairing analysis (signed opaque tokens, atomic one-time consume, fragment
URLs, fd-3 desktop bootstrap, 1008 close on refusal) remains the reference for that later plan and
is recorded in git history at `docs/environments-and-remote-plan.md@1325b003`.

## 5. UI

### 5.1 The rail

One flat list, every machine, grouped by project id (repository identity). Inside a project group:
sessions ordered as today; a **machine chip** on a session row whenever more than one machine is
connected or the row's environment is not the primary; a **machine filter** in the existing scope
menu next to project scope. No per-machine sections. Discovered sessions from a remote machine
appear exactly like local ones.

### 5.2 Adding a project

"Add project" asks **which machine** when more than one is connected, then opens that machine's
file picker (the existing `FilePickerDialog`, parametrized by client). Registration goes to that
machine's transport. A project that is already registered on another machine with the same
repository identity joins the same group.

### 5.3 The workbench

The titlebar project menu shows the active machine with a status dot; the command palette gains
`environment.switch`, `environment.connect`, `environment.openMachines`. Switching is described in
§3.2. The address gains an optional `@<environmentId>` segment before the workspace segment,
omitted for the local environment, so a chat or editor link names the machine it belongs to.

### 5.4 Honest failure, per machine

Per-environment state, never a global modal. Rail header and Machines page show each machine's
phase; the workbench surfaces show, when its machine is unreachable: a stale-marked tree and git
panel painted from cache, a dead-terminal banner (not a spinner), a read-only editor with saves
refused with a reason, and chat's existing reconnecting phase. One recovery coordinator keyed by
environment retries every machine on `online` and focus; a paired remote must heal exactly like the
local server does.

### 5.5 Settings → Machines

List, add (SSH target plus repo path, or origin URL), connect, disconnect, remove, relabel, status,
last error, and the root-shell statement.

## 6. Execution order

1. **Plan 077 — runtime origin and identity.** Server identity row, `environmentId` in handshake
   and `/health`, identity-drift refusal, `createEnvironmentClient`, one QueryClient per
   environment, per-environment `ChatTransport` factory with a real `close()`, deletion of the
   bound module singletons, `ChatEnvironment` → `ChatTransport`, `1008` close on auth refusal and
   deletion of the silent-clean-close heuristic, a dev-only origin switch. Loopback only.
2. **Plan 068 — session domain, environment-aware.** Repository identity from remote/root commit,
   deterministic ids that repeat across machines, projection store and rail model shaped for N
   environments and populated with one, environment segment in the address grammar.
3. **Plan 078 — federated environments.** Machines setting and page, SSH launcher in the desktop
   shell, N chat connections, scoped persistence, flat cross-machine rail with chips and filter,
   add-project-on-machine, workbench switch, honest offline surfaces, titlebar and palette.
4. **Later, only on demand:** the direct-origin spike through mesh, then pairing and sessions for a
   client that cannot SSH.

## 7. What we deliberately will not copy from the reference

1. `owner`/`client` roles without capability checks at the RPC boundary. One trust level, stated.
2. `unsafe-no-auth` as a named contract variant.
3. Plaintext LAN pairing and `http://<lan-ip>:<port>` connection strings.
4. An unauthenticated descriptor leaking hostname, OS and arch.
5. The pairing URL in the startup log.
6. Bearer tokens in cleartext `localStorage`.
7. One global `wsConnectionState` fed by every transport; ours is keyed by environment from day one.
8. Automatic recovery wired only to the primary connection; ours retries every environment.
9. `envMode` as a name for worktree-vs-checkout; our worktree picker keeps the word worktree.
10. Installing the server over SSH through a package manager; our launcher assumes the checkout.
11. Silently upgrading a bare typed host to `https://`; we error with the real reason.
12. A client-side logical-project layer for grouping; our server-derived project id already groups.

## Appendix — independently true today, fixed by Plan 077

- `serverUrl` is inlined at build time and captured by nine modules
  (`client.ts`, `client-logging.ts:164`, `wallpaper-query.ts:7`, `default-nerd-font.ts:120-126`,
  `attachment-image.ts:30`, `language-server-plugin.ts:296`, `orchestration-rpc-client.ts:688`,
  two browser tests).
- `OrchestrationRpcClient` has no public disconnect (`orchestration-rpc-client.ts:470`).
- Five bound module exports and two singletons pin the transport at import time
  (`orchestration-rpc-client.ts:662-676`, `thread-detail-subscriptions.ts:443-448`,
  `thread-earlier-pages.ts:88-92`), defeating the `ChatEnvironment` seam.
- `isUnauthorizedClose` (`orchestration-rpc-client.ts:773-776`) treats any clean close with no
  frame as an auth refusal and parks chat forever; the server closes with no code (`ws-rpc.ts:94`).
- `generation` counts server processes and cannot tell a restart from a different backend
  (`server-connection-store.ts:52-63`).
