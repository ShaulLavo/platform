# Plan 078: Federated environments — machines, SSH launch, one rail across machines

> **Executor instructions:** Read this plan completely, then read `AGENTS.md`, root `PLAN.md`,
> `docs/environments-and-remote-plan.md`, and the never-nester skill. Execute only after Plans 077
> and 068 are complete and deleted from `plans/`; reconcile every owner named below from source. Keep
> the current worktree; do not create a branch, worktree, commit, push, or PR unless the operator
> asks. Preserve user-owned changes. Reuse the running dev server. Every verification that needs a
> second machine uses a second loopback server or the `localhost` SSH target; nothing in this plan
> binds off loopback on either end.

## Status

- **State:** Blocked on Plans 077 and 068 and root scheduling
- **Priority:** P1 after Plan 068
- **Effort:** XL
- **Risk:** HIGH — the desktop shell spawns `ssh` and remote processes; the rail, persistence, and
  workbench root switch all change owners at once; a wrong storage scope reads as data loss.
- **Platform baseline:** `1325b003` (re-baseline after 068 lands)
- **Prepared:** 2026-09-05
- **Dependency:** Plan 077 (runtime origin, environment identity, per-environment transport and
  query client, environments store) and Plan 068 (environment-shaped projection store, scoped refs,
  rail rows with `environmentId`, address environment segment, machine-independent repository
  identity).
- **Known dirty baseline:** re-run `git status --short`; preserve every unrelated path.

Root `PLAN.md` is the sole execution-order authority.

## Drift-check preamble — this is the audit

Run before editing:

```sh
git rev-parse HEAD
git status --short
test ! -f plans/077-environment-runtime-origin.md && test ! -f plans/068-session-domain-model.md
rg -n "activeServerOrigin|environmentClientFor|createEnvironmentClient" apps/web/src/lib/client.ts
rg -n "slices|dropEnvironment" apps/web/src/features/chat/state/chat-projection-store.ts
rg -n "scopedProjectKey|ScopedSessionRef" packages/contracts/src/chat-ids.ts
rg -n "machineLabel|projectGroupKey" apps/web/src/features/chat-mode/utils/session-rail-model.ts
rg -n "@<environmentId>|environment" apps/web/src/features/address/utils/grammar.ts
rg -n "devSwitchOrigin" apps/web/src
rg -n "pickEntry" apps/desktop/src/shared/rpc.ts apps/desktop/src/bun/index.ts
rg -n "'environments\." packages/contracts/src/settings/keys.ts
rg -n "WORKSPACE_CACHE_STORAGE_PREFIX|CHAT_PROJECTION_CACHE_STORAGE_KEY" apps/web/src -l
```

Expected: the first six lines find their owners (077 and 068 landed), `devSwitchOrigin` exists (this
plan deletes it), the desktop RPC has exactly `pickEntry`, no `environments.*` setting exists, and
the two storage prefixes are owned by `apps/web/src/lib/workspace-cache-storage.ts` and
`apps/web/src/features/chat/state/chat-projection-cache.ts`.

### Verified current source (pre-077 anchors; re-verify after 068)

- Per-environment localStorage owners: `apps/web/src/lib/workspace-cache-storage.ts:5-24` (prefix and
  key builder used by `apps/web/src/features/workspace/state/cache.ts:51-80,285-350`),
  `apps/web/src/features/chat/state/chat-projection-cache.ts:25,55-90`,
  `apps/web/src/features/chat/utils/draft-storage.ts`,
  `apps/web/src/features/chat/utils/changed-files-expansion-storage.ts`,
  `apps/web/src/features/chat/utils/thread-diff-scope-storage.ts`,
  `apps/web/src/features/chat/state/prompt-stash-store.ts`,
  `apps/web/src/features/chat-mode/utils/session-read-storage.ts`,
  `apps/web/src/features/chat-mode/utils/rail-collapse-storage.ts`. Global chrome owners that stay
  unscoped: `apps/web/src/features/editor/state/color-theme-store.ts`,
  `apps/web/src/features/command-palette/state/recent-commands-store.ts`,
  `apps/web/src/features/address/state/storage.ts:13`, `uiMode`/`workbenchLayout`/`chatModePanels`
  entries in `workspace/state/cache.ts:293-301`.
- `workspace/state/cache.ts:617-625` sweeps `localStorage` by prefix; the scoped adapter must keep
  that sweep inside the current environment's namespace.
- The workspace root switch is `useOpenWorkspaceRoot` (`apps/web/src/features/workspace/hooks/use-open-root.ts`):
  it activates `useActiveProjectStore`, stats the path through `getClient()`, and calls the editor's
  `switchRootFolder`. It has no environment parameter before 068 and a no-op one after.
- "Add project" is the editor's folder picker (`session-provider.tsx:57` → `openPicker` →
  `apps/web/src/components/file-picker-dialog.tsx:95`, fetching through `getClient()` and
  `filePickerKeys` in `apps/web/src/lib/query-keys.ts:14`).
- The rail scope menu is `apps/web/src/features/chat-mode/components/session-scope-menu.tsx`; the
  titlebar project menu is `apps/web/src/components/workspace-project-menu.tsx:26`; palette groups
  are built by factories under `apps/web/src/features/command-palette/*-groups.tsx`.
- The desktop shell exposes one RPC request (`pickEntry`) from the web view to the Bun process
  (`apps/desktop/src/shared/rpc.ts`, `apps/desktop/src/bun/index.ts:132`) and spawns the local server
  with `FS_HOST`, `PORT`, `SERVER_ALLOWED_ORIGINS` (`index.ts:96-108`). `isDesktop()` gates
  desktop-only chrome in the web app.
- The server honours `SERVER_ALLOWED_ORIGINS` (`apps/server/src/index.ts:23,113`) and refuses
  non-loopback binds (`:27,130`). A forwarded port is loopback on both ends, so neither changes.
- Settings widgets are a closed union (`packages/contracts/src/settings/registry.ts:35-53`) with
  custom sections for `providers` and `models`; `docs/settings-reference.md` is regenerated with
  `bun run settings:reference`.
- The chat shell supervisor's phases and retry ladder live in
  `apps/web/src/features/chat/hooks/use-chat-shell-subscription.ts` and
  `apps/web/src/features/chat/utils/stream-reconnect.ts`; after 077 they are per transport.
- The wallpaper query (`apps/web/src/features/workbench/utils/wallpaper-query.ts`) reads the active
  origin's `/wallpaper`; the attachment image URL (`apps/web/src/features/chat/utils/attachment-image.ts`)
  carries the 077 tripwire comment for this plan.
- t3code's SSH launcher (`references/t3code/packages/ssh/src/tunnel.ts:711-940`,
  `references/t3code/apps/desktop/src/ssh/DesktopSshEnvironment.ts`) is the shape we port: probe,
  pick a remote port, launch or reuse, forward, wait for readiness, record. We drop its install
  step, its Node version-manager probing, its pairing token, and its askpass prompts.

## Outcome

After this plan:

1. A user lists machines in Settings → Machines: an SSH target plus the repo checkout path, or a
   direct `https://`/loopback origin. The local machine is implicit.
2. Connecting an SSH machine from the desktop app starts or reuses the platform server on that
   machine, forwards its loopback port to a local loopback port, and records its `environmentId`.
   Disconnecting closes the forward and stops a server the launcher started.
3. Every connected machine has a live chat connection. The rail is one flat list across machines:
   the same repository on two machines is one group with machine-labelled worktrees, session rows
   carry a machine chip when it matters, and a machine filter sits beside the project scope.
4. "Add project" asks which machine and opens that machine's picker.
5. Opening a project or session on another machine switches the workbench to it: query client,
   storage namespace, root, tabs, chat selection. Files, terminal, LSP, git and search then answer
   for that machine.
6. Per-environment browser state is namespaced; two machines with the same repo path never share a
   tab list, a tree cache, or a draft.
7. An unreachable machine is visible per machine, never a global modal; its workbench surfaces are
   honestly stale or dead; every machine recovers automatically.

Not in this plan: direct `https://` origins beyond accepting the URL (the mesh proxy spike is
scheduled separately), pairing or sessions, remote server install, password or askpass prompts,
web (non-desktop) SSH, cross-machine worktree creation (Plan 069 stays single-machine).

## Locked design

### Machines setting

- Register `environments.machines` in `packages/contracts/src/settings/keys.ts`:

  ```ts
  schema: v.record(machineNameSchema, v.variant('kind', [
    v.object({ kind: v.literal('ssh'), target: sshTargetSchema, repoPath: absolutePathSchema,
               remotePort: v.optional(portSchema), label: v.optional(labelSchema) }),
    v.object({ kind: v.literal('origin'), url: originSchema, label: v.optional(labelSchema) }),
  ]))
  default: {}
  scope: 'machine'      // an SSH target is executed by this machine's launcher; never 'window'
  widget: 'machines'    // new custom section, like 'providers'
  merge: 'record'
  category: 'Machines'
  ```

  `originSchema` accepts `https://` anything or `http://` loopback only; the registry refuses the
  rest with the real reason ("plain http off loopback is refused; use an SSH machine or https").
  `machineNameSchema` is the record key: short, lowercase, `[a-z0-9-]`, used in labels and logs.

- The setting is consumed by the environments store (Plan 077) in the same change: it derives one
  `EnvironmentEntry` per machine. Never a second list anywhere. Delete the dev-only
  `environment.devSwitchOrigin` command and dialog.
- Settings reads stay on the primary environment: `useSettingValue` and `readSettingsMirror` are
  bound to `environmentClientFor(primaryOrigin)`, not `getClient()`. Audit every consumer of the
  settings API for this; a server-consumed key (`lsp.*`, `terminal.*`, fonts) is read by each
  server from its own file already and needs no change.

### Environment entries and connection lifecycle

- `EnvironmentEntry` grows `kind: 'primary' | 'ssh' | 'origin'`, `name`, `label`, and for SSH the
  runtime `localPort`. Connection state per environment is
  `idle | launching | connecting | live | reconnecting | offline | blocked | identity-drift`, with
  `lastError`, `lastErrorAt`, `connectedAt`, and the `/health` descriptor once known.
- A machine connects on explicit user action (Machines page, palette, rail header) and stays
  connected until disconnected or the app closes. On launch, machines that were connected when the
  app last closed reconnect automatically; that list is ephemeral state persisted under the global
  chrome namespace as `platform.environments.connected.v1` (names only, no secrets; this is the one
  new localStorage key and it holds nothing a setting should).
- One recovery coordinator (`features/environments/state/recovery-coordinator.ts`) listens to
  `online`, window focus, and each transport's retry ladder, and retries every non-primary
  environment exactly as the primary. No per-environment "Reconnect" button is the only path.
- SSH machines are desktop-only. In a plain browser the Machines page shows SSH entries as
  "desktop only" and offers connect only for `origin` entries.

### SSH launcher (desktop shell)

- New `apps/desktop/src/bun/ssh/` owning `launcher.ts` (orchestration), `remote-scripts.ts` (pure
  string builders with placeholders, tested), and `forward.ts` (the `ssh -N -L` child and its
  lifecycle). Desktop RPC gains `connectMachine(name)`, `disconnectMachine(name)`, and a
  `machineState` message the Bun process pushes on every transition; the web view never spawns
  anything.
- Steps, each logged as fields on one wide `desktop.ssh.connect` event with `machine`, `target`,
  `step`, `durationMs`, `outcome`:
  1. **Probe** `ssh -o BatchMode=yes -o ConnectTimeout=10 <target> sh -c 'command -v bun && test -d
<repoPath>/apps/server'`. A password prompt is a refusal with fix "add your key to the agent or
     configure the host in ~/.ssh/config"; no askpass in this plan.
  2. **Reuse or launch.** `curl`-free readiness on the remote: run a small Bun script from
     `remote-scripts.ts` that reads `<repoPath>/.platform-ssh-launch/<clientId>.json` (remote pid,
     port, environmentId), checks `/health` on remote loopback, and prints it; else picks a free
     loopback port, writes the record, and starts
     `nohup bun --env-file=.env apps/server/src/index.ts` with `FS_HOST=127.0.0.1`, `PORT`,
     `SERVER_ALLOWED_ORIGINS=<the client's web origin>`, `FS_METADATA_DB` left default, stdout and
     stderr appended to `<repoPath>/logs/ssh-launch.log`. The remote record is keyed by the
     connecting client's instance so two laptops get two records.
  3. **Forward** `ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:<local>:127.0.0.1:<remote>
<target>`; the local port is picked from an ephemeral range and verified free with
     `isPortAvailable` (`scripts/runtime-network.ts:32`).
  4. **Readiness** waits on `http://127.0.0.1:<local>/health` with a bounded timeout and records the
     descriptor. The web view's environments store then registers the origin and connects chat.
  5. **Identity**: the `environmentId` from `/health` is compared against the entry's recorded id
     when present; drift is surfaced, not healed.
- Disconnect kills the forward child; if the launcher started the remote server (record says
  `managed`), it stops it through `ssh <target> kill <pid>` and removes the record; an `external`
  server is left running. App exit disconnects every machine the same way.
- Mesh hosts need nothing special: `Host *.mesh.shaulavo.dev` in `~/.ssh/config` with port 2222 and
  the identity file makes `pc.mesh.shaulavo.dev` a plain target. The launcher runs `ssh` from
  `PATH` and never reads or writes SSH configuration.

### Scoped persistence

- `apps/web/src/lib/environment-scoped-storage.ts`: `environmentScopedStorage(environmentId)`
  returning `{ getItem, setItem, removeItem, keys(prefix) }` over `localStorage` with the prefix
  `env:${environmentId}|`. Every per-environment owner listed in Verified current source takes a
  `ScopedStorage` argument instead of touching `localStorage`; `workspace-cache-storage.ts`'s key
  builder gains the environment segment so the workspace slices, search buffers, root folder,
  workspace index, and session selection move in one edit; the sweep in `workspace/state/cache.ts`
  iterates `keys(prefix)` of the current namespace only.
- The active workbench environment's namespace is the one in use; switching swaps it before the
  workbench reads anything (see Switching).
- Chat projection cache: one entry per environment under its namespace; cold boot paints every
  machine that was connected at close from its own cache, marked stale until its socket is live.
- No migration. Bump the workspace cache version and the chat projection cache version once; the
  developer clears site data once. Ship no healing code.

### Rail across machines

- The rail model from 068 already emits `environmentId`, `machineLabel`, and `projectGroupKey`.
  This plan adds: `machineFilter: EnvironmentId | null` (in `session-scope-menu.tsx`, beside the
  project scope, listing connected machines with their phase dot), a machine chip on session rows
  and on worktree labels inside a project group rendered from `machineLabel`, and a connection row
  per non-live machine at the top of the rail (phase, last error, retry-now) styled with
  `warning`/`destructive` tokens. Loading is `OrbitLoader` beside the machine label; an offline
  machine's cached rows stay visible and are marked stale, never hidden.
- "Add project" (`stage-empty-state.tsx`, `session-rail.tsx`, `workspace-project-menu.tsx`): with
  one environment it behaves as today; with several it first shows a machine picker (a small menu
  from `@workspace/ui`), then opens `FilePickerDialog` bound to that machine's client. The dialog
  takes a `client` prop and its query keys include the origin so two machines' pickers never share
  a cached listing. Registration dispatches through that machine's `ChatTransport`.
- Palette: `use-command-palette-sessions.ts` folds every slice; rows show the machine chip through
  the existing `scope-chip.tsx` pattern.

### Switching the workbench

- `useOpenWorkspaceRoot(workspaceRoot, { environmentId })`: when `environmentId` differs from the
  active workbench environment, in this order and synchronously before the async stat:
  `environmentsStore.activateWorkbench(environmentId)` (which calls `setActiveServerOrigin`),
  swap the `QueryClientProvider` client (077), swap the scoped storage namespace and re-seed the
  editor workspace store from it (root folder, tabs, layout slices), reset the tree load, then
  proceed with the existing open path against the new `getClient()`. Chat connections are untouched.
- Terminal and LSP sockets already follow `getClient()`; on switch the terminal pane shows the new
  machine's sessions and the previous machine's PTYs are neither killed nor shown. The LSP plugin
  reconnects for open documents through the existing root-change path.
- Editor tabs, diff documents, and search buffers are restored from the target namespace. Nothing
  keyed by path is rewritten; the namespace is the whole answer.
- The titlebar project menu shows the active machine's label and phase dot; palette commands
  `environment.switch` (pick a connected machine, switch to its last root), `environment.connect`,
  `environment.disconnect`, `environment.openMachines`. All go through the typed command bus.

### Honest failure per machine

- Tree and git panels: paint the environment's cached slice with a stale marker (existing
  `EmptyState`/`LoadingState` are not used for this; a thin `warning` banner in the pane header).
- Terminal: a "machine unreachable" banner replaces the surface; no spinner.
- Editor: buffers stay readable; save is refused with a structured error whose `fix` names the
  machine; the tab shows the read-only affordance.
- Chat: the per-transport reconnecting phase from 077, surfaced per machine in the rail.
- Wallpaper: a remote workbench environment falls back to the bundled wallpaper; the remote
  machine's desktop image is never fetched.
- Attachment images: `attachment-image.ts` takes the owning session's environment origin (from the
  slice), closing the 077 tripwire.

### Logging

- Every client wide event carries `environmentId` (077) and now `machine` (name) when known.
- The client log drain stays on the primary environment's server: it is the `logs/` a developer
  greps on the machine they sit at. Remote servers log to their own `logs/`.
- Desktop SSH steps are one wide event per connect/disconnect, enriched per step; remote launcher
  stdout is appended to the remote log file, never streamed into ours.

## Scope

### In scope

- `environments.machines` setting, Machines settings section, reference regeneration.
- Desktop SSH launcher, forward, reuse, stop, RPC surface, connected-machines persistence.
- N chat connections, recovery coordinator, per-machine phases.
- Scoped persistence adapter and the move of every per-environment key.
- Rail machine chips, machine filter, connection rows, add-project-on-machine, palette rows.
- Workbench switch with environment, titlebar chip, palette commands.
- Offline surfaces, wallpaper fallback, attachment origin.
- Tests for each of the above; two-server and `localhost` SSH gates.

### Out of scope

- Any non-loopback bind on either machine; TLS; pairing; sessions; revocation.
- Installing Bun or the repository on a remote machine; password prompts; SSH agent management.
- The mesh https proxy spike (WebSocket through the proxy, path prefix). Accepting an `https://`
  origin entry is in scope; proving it works through mesh is a separate scheduled check.
- Cross-machine worktree creation or comparison; Plan 069 remains single-machine.
- A user setting for reconnect cadence or retry limits.

## Git and state policy

- Work in the existing worktree; preserve unrelated changes.
- Bump both cache versions once; no migration, no healing.
- Production errors through each feature's `structured-errors.ts`; `desktop` gains
  `apps/desktop/src/bun/structured-errors.ts` entries for probe, launch, forward, readiness, stop.
- No new localStorage key other than `platform.environments.connected.v1`; no env var; no constant
  a user would need to recompile to change.

## Phase 1 — Machines setting, store, and Machines page

### Work

1. Register `environments.machines`; add `'machines'` to `SettingWidget`; build the custom section
   under `apps/web/src/features/settings/components/machines-section.tsx` and `machine-row.tsx`
   (one component per file): name, kind, target or URL, repo path, label, phase dot, last error,
   connect/disconnect/remove, and the root-shell statement copied from the strategy doc §4.
2. Derive `EnvironmentEntry` records from the setting in the environments store; delete
   `environment.devSwitchOrigin` and `dev-origin-dialog.tsx`.
3. Bind settings reads to the primary origin; audit consumers.
4. `bun run settings:reference`.

### Verify

```sh
cd packages/contracts && bun run test -- src/settings/tests/keys.test.ts && bun run typecheck && cd ../..
cd apps/web
bun --bun vitest run --project node --project dom \
  src/features/environments/tests/environments-store.test.ts \
  src/features/settings/components/tests/machines-section.test.tsx
bun run typecheck
if rg -n "devSwitchOrigin|dev-origin-dialog" src; then exit 1; fi
```

Expected: an `http://10.0.0.5:3001` origin entry is refused with the stated reason; an
`https://pc.mesh.example/platform` entry and an `http://127.0.0.1:3002` entry are accepted; the
store derives one entry per machine and the primary is not listed.

## Phase 2 — Desktop SSH launcher

### Work

1. `apps/desktop/src/bun/ssh/remote-scripts.ts`: pure builders for the probe command, the
   reuse-or-launch Bun script, and the stop script, with placeholder substitution tests; the launch
   script writes the record file atomically and prints one JSON line.
2. `apps/desktop/src/bun/ssh/forward.ts`: spawn, readiness, kill, exit observation.
3. `apps/desktop/src/bun/ssh/launcher.ts`: the five steps, wide-event logging, managed/external
   distinction, app-exit cleanup.
4. Extend `apps/desktop/src/shared/rpc.ts` and the `defineRPC` block in `apps/desktop/src/bun/index.ts`;
   the preload exposes `connectMachine`/`disconnectMachine` and the `machineState` message on
   `PlatformBridge`.
5. Web: the environments store calls the bridge for SSH entries and registers
   `http://127.0.0.1:<localPort>` as the entry's origin on success.

### Verify

```sh
cd apps/desktop && bun test src/bun/ssh/tests/remote-scripts.test.ts src/bun/ssh/tests/launcher.test.ts && bun run typecheck && cd ../..
```

`launcher.test.ts` injects a fake `ssh` spawner (a script that answers the probe, prints a fixed
record, and holds a forward open) and asserts step order, the managed/external decision, the
forwarded origin, and that disconnect stops only a managed server. Then, by hand: add a machine
with target `localhost` (this machine's own sshd, key in the agent) and `repoPath` set to this
checkout, connect from the desktop app, and confirm a second server process starts on a loopback
port, `/health` answers through the forward with an `environmentId` different from the dev
server's, and disconnect stops it. Record pids and ports in the plan closeout.

## Phase 3 — Many connections and scoped persistence

### Work

1. `ChatModeSessionProvider` becomes an `EnvironmentTransportsProvider` in
   `features/environments/providers/` that holds one `ChatTransport` per connected environment and
   runs one shell subscription each; `useChatModeSession().transport` becomes
   `transportFor(environmentId)` and the active workbench environment's transport is the default.
2. Recovery coordinator; per-machine phases feed the rail connection rows and the Machines page.
3. `environment-scoped-storage.ts`; move every per-environment key; bump both cache versions; cold
   boot paints each previously connected machine from its own cache.
4. `platform.environments.connected.v1` under global chrome.

### Verify

```sh
cd apps/web
bun --bun vitest run --project node --project dom \
  src/features/environments/tests/transports-provider.test.tsx \
  src/features/environments/tests/recovery-coordinator.test.ts \
  src/lib/tests/environment-scoped-storage.test.ts \
  src/features/workspace/state/tests/cache.test.ts \
  src/features/chat/state/tests/chat-projection-cache.test.ts
bun run typecheck
```

Expected: two in-process servers produce two live slices; killing one server moves only that
machine to `reconnecting` and the other keeps dispatching; a root folder saved under machine A's
namespace is invisible under B's; the sweep never touches another namespace.

## Phase 4 — Rail, add project, switch, chrome

### Work

1. Machine filter in `session-scope-menu.tsx`; machine chips on session rows and worktree labels;
   connection rows at the rail top; palette rows with chips.
2. Add-project machine picker; `FilePickerDialog` takes `client`; picker query keys include origin.
3. `useOpenWorkspaceRoot` environment switch; titlebar machine label and dot; palette commands
   `environment.switch|connect|disconnect|openMachines` in `keymap/table.ts` with enablement in
   `keymap/`.
4. Offline surfaces: tree and git stale banner, terminal unreachable banner, editor read-only save
   refusal, wallpaper fallback, attachment origin.
5. `attachment-image.ts` tripwire closed; remove the 077 comment.

### Verify

```sh
cd apps/web
bun --bun vitest run --project node --project dom \
  src/features/chat-mode/utils/tests/session-rail-model.test.ts \
  src/features/chat-mode/components/tests/session-rail.test.tsx \
  src/features/chat-mode/components/tests/session-scope-menu.test.tsx \
  src/features/workspace/hooks/tests/use-open-root.test.tsx \
  src/components/tests/file-picker-dialog.test.tsx \
  src/features/command-palette/tests/session-groups.test.tsx
bun run typecheck && bun run lint
```

Expected: with two machines holding the same fixture repository the rail shows one project group
with two machine-labelled worktrees; the filter hides the other machine's sessions; picking a
session on machine B switches the workbench origin, storage namespace, and query client before the
selection is published; the picker for B lists B's temp root, not A's.

## Phase 5 — Two-machine vertical gate

### Work

Create `apps/web/src/features/environments/tests/federated.integration.test.tsx` on
`apps/web/test/fixtures.ts` with two `makeTestServer()` instances whose roots each contain a clone of
one fixture repository with the same `origin` remote:

1. Connect both; assert one rail group, two worktrees, two machine labels.
2. Add a project on B through the machine picker; assert it lands in B's slice only.
3. Create a session on B, switch the workbench to B by selecting it, write a file through the
   editor path, and assert the write hit B's temp root and A's is untouched.
4. Kill A's app; assert A's rows are stale-marked and still visible, B keeps working, and A recovers
   when a new app is mounted on the same database with the same `environmentId`.
5. Forge A's handshake with B's id after reconnect; assert `identity-drift` on A and no slice change.
6. Reload the store from the two namespaces cold; assert both machines paint from cache before any
   socket and are marked stale until live.
7. Inspect the diff for raw palette colours, hand-rolled loaders, `new Error`, a second machines
   list, and any `localStorage` access outside the adapter or the global chrome owners.

Then, by hand, against the running dev server plus the `localhost` SSH machine from Phase 2: open
this repository on both, confirm one group with two worktrees, run a terminal command on each,
switch between them without reload, disconnect the SSH machine and confirm its rows go stale and its
terminal shows the unreachable banner.

### Verify

```sh
cd apps/web
bun --bun vitest run --project node --project dom src/features/environments/tests/federated.integration.test.tsx
bun run typecheck && bun run lint && bun run format:check
cd ../desktop && bun run typecheck && cd ..
cd .. && bun run settings:reference && git diff --check && git status --short
```

## Done when

- Machines are a setting with a page; SSH machines connect from the desktop app through a
  loopback-to-loopback forward with no server change; disconnect is clean.
- Every connected machine has a live chat connection and its own recovery; the rail is one flat
  list with repository grouping across machines, chips, and a filter.
- Add project targets a machine; the workbench switches machines with namespace, query client, root,
  tabs and selection; files, terminal, LSP, git and search answer for the active machine.
- Per-environment browser state is namespaced; global chrome is not.
- Unreachable machines are visible per machine and recover automatically; no global modal.
- The dev-only origin switch is gone; both cache versions were bumped exactly once; no healing code.
- All phase checks pass; the two-machine gate passes; baseline-delta review shows only intended
  changes.

## STOP conditions

Stop and ask the operator if:

- Root `PLAN.md` has not scheduled this plan, or 077/068 are still in `plans/`.
- The SSH probe on the operator's target requires a password or host-key confirmation the launcher
  cannot satisfy non-interactively.
- The remote checkout cannot start the server without an install step.
- Electrobun's RPC cannot push `machineState` messages from Bun to the web view.
- Swapping the storage namespace during a root switch would drop unsaved editor edits; report the
  path before adding any buffering.
- A setting is proposed that is not registered and consumed in the same change, or any value that
  reaches execution is proposed at `window` scope.
- Any step would bind a server off loopback, or send anything credential-shaped to a log.

## Maintenance

If owners move after 068 lands, update the drift preamble and phase paths first. When complete,
delete this plan, update `docs/environments-and-remote-plan.md` §6, and replace live backlinks with
source and tests; git history is the archive.
