# Plan 068: Make session the durable cross-frontend domain

> **Executor instructions:** Read this plan completely, then read `AGENTS.md`, root `PLAN.md`,
> `docs/product-vision.md`, `docs/t3code-parity-implementation-plan.md`,
> `docs/environments-and-remote-plan.md`, and the never-nester skill. Execute the phases in order. Keep the current
> worktree; do not create a branch, worktree, commit, push, or PR unless the operator asks. Preserve
> all user-owned dirty files. Do not start another dev server.

## Status

- **State:** Ready — next environments slice in root `PLAN.md`; Plan 077 complete
- **Priority:** P0 for the agent-view initiative
- **Effort:** XL
- **Risk:** HIGH — deliberate greenfield identity, wire, and projection cutover
- **Platform baseline:** `4b25f1ab28eab2da499ac0cf0fcc633af1ea6640`
- **Prepared:** 2026-08-27
- **Dependency:** Plan 077 is complete. Its foundation includes stable environment identity,
  owned transports and query clients, retained editor runtimes, and one command bus. Re-verify the
  source owners below before editing. Plan 069 starts after this plan. Plan 078 requires this
  plan's environment-shaped web store.
- **Environment-aware since:** 2026-09-05. Repository identity is machine-independent, project and
  worktree ids repeat across machines by design, and the web projection store, rail model, and
  address grammar are shaped for many environments while this plan populates exactly one. See
  `docs/environments-and-remote-plan.md` §2.2 and §3.2.
- **Known dirty baseline:** `docs/product-vision.md` plus concurrent operator-owned work under
  `apps/web/package.json`, `apps/web/scripts/`, `apps/web/src/features/editor/`,
  `apps/web/src/features/workbench/`, `apps/web/src/features/workspace/`, `apps/web/src/lib/`, and
  `apps/web/test/factories/` were actively changing while this plan was prepared. Re-run
  `git status --short`; do not add, rewrite, delete, stash, or absorb any unrelated path.

Root `PLAN.md` is the sole execution-order authority. If this plan has not been scheduled there when
implementation is requested, stop and ask where it belongs.

## Drift-check preamble — this is the audit

Run before editing:

```sh
git rev-parse HEAD
git status --short
test ! -d apps/server/src/persistence
rg -n "ThreadId|threadIdSchema|orchestrationThreadSchema|requestWorktree" \
  packages/contracts/src apps/server/src/orchestration apps/server/src/provider \
  apps/web/src/features/chat apps/web/src/features/chat-mode
rg -n "listSessions|SDKSessionInfo|resume\?: string|sessionId\?: string" \
  node_modules/.bun/@anthropic-ai+claude-agent-sdk@*/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts
claude --version
claude --help | rg -- '--resume|--session-id'
if rg -n "serverUrl|createLocalChatEnvironment|ChatEnvironment" apps/web/src; then exit 1; fi
rg -n "environmentId|recordHandshake" packages/contracts/src/orchestration-ws.ts apps/web/src/lib/environments/state/store.ts
rg -n "queryClientFor|clientForQueryClient|originForQueryClient" apps/web/src/lib/environments/state/query-clients.ts
rg -n "activateEnvironment|commandBinding|hasUnsavedDocuments" apps/web/src/state/application-runtime.ts
rg -n "key=|runtime=" apps/web/src/components/active-environment-application.tsx
rg -n "captureRuntime|binding.capture" apps/web/src/keymap/state/command-bus.ts apps/web/src/keymap/providers/bus-provider.tsx
rg -n "remote get-url|rev-list --max-parents=0" apps/server/src/git
```

The legacy-symbol check must be empty. The environment, runtime, and command checks must find the
completed 077 owners listed below. The final Git search must return nothing before Phase 3 and
exactly one owner in `git/service.ts` after.

Reconcile every path and line below against current source. Update this plan first if an owner moved;
do not implement from stale anchors.

### Product and architecture locks

- The authority defines one conversation as a session, requires a shared GUI/CLI identity, and makes
  JSONL mirroring optional rather than load-bearing (`docs/product-vision.md:40-54`).
- The required topology is `project 1-N worktree 1-N session`, with explicit many-to-one links and no
  Orca compare view in this slice (`docs/product-vision.md:56-68`,
  `docs/product-vision.md:83-99`).
- The older plan's product shape is superseded, but its event log, projections, receipts, and recovery
  remain authoritative (`docs/product-vision.md:101-114`).
- The spine places contracts and persistence together, then requires command → event → projection and
  snapshot/replay recovery (`docs/t3code-parity-implementation-plan.md:377-459`,
  `docs/t3code-parity-implementation-plan.md:472-530`). Shell/detail transport and the normalized web
  cache extend those projections (`docs/t3code-parity-implementation-plan.md:542-603`,
  `docs/t3code-parity-implementation-plan.md:613-704`).
- Command/event names, projection tables, snapshot shapes, and provider runtime shape must not be
  parallelized before the contract settles (`docs/t3code-parity-implementation-plan.md:1955-1973`).
- Environments: several machines are connected at once and chat federates them, while the
  workbench follows one machine; the same repository on two machines is one project group; every
  browser map is keyed by `(environmentId, id)` because server-derived ids repeat across machines
  (`docs/environments-and-remote-plan.md` §2.2, §3.2, §5.1).

### Verified current source

- IDs stop at `ProjectId` and `ThreadId`; neither `WorktreeId` nor product `SessionId` exists
  (`packages/contracts/src/chat-ids.ts:10-32`).
- Project create/update commands and the projected model currently treat `workspaceRoot` as mutable
  project metadata (`packages/contracts/src/orchestration-commands.ts:45-66`,
  `packages/contracts/src/chat-model.ts:157-169`). The cutover must demote it to trusted registration
  input and make worktree paths the only operational checkout paths.
- `OrchestrationThread` is the product conversation today and owns `projectId`, branch, path,
  transcript, and a nested object named `OrchestrationSession`; that nested object is actually
  provider runtime state (`packages/contracts/src/chat-model.ts:223-253`,
  `packages/contracts/src/chat-model.ts:332-350`).
- Event aggregates are only `project | thread`; `thread.created` carries project/branch/path and the
  one-shot `requestWorktree` fact (`packages/contracts/src/orchestration-events.ts:37-38`,
  `packages/contracts/src/orchestration-events.ts:76-102`). The centralized event catalog is the
  only event list and must move atomically (`packages/contracts/src/orchestration-events.ts:285-331`).
- Shell snapshots and deltas contain only projects and threads, and replay aggregate IDs accept only
  project/thread IDs (`packages/contracts/src/orchestration-snapshots.ts:42-75`,
  `packages/contracts/src/orchestration-snapshots.ts:146-189`).
- SQLite mirrors that shape: event/receipt kinds are project/thread, `projection_threads` directly
  owns project/branch/path, and provider runtime is keyed one-to-one by `thread_id`
  (`apps/server/src/db/schema.ts:32-87`, `apps/server/src/db/schema.ts:113-165`,
  `apps/server/src/db/schema.ts:204-226`, `apps/server/src/db/schema.ts:295-318`).
- Migrations are append-only and transactional (`apps/server/src/db/migrations.ts:14-39`,
  `apps/server/src/db/migrations.ts:41-113`). The precedent for greenfield state removal explicitly
  drops data instead of maintaining migration machinery (`apps/server/src/db/migrations.ts:547-559`).
- An accepted command appends events, applies projections, and records its receipt in one database
  transaction; publication happens only after commit (`apps/server/src/orchestration/engine.ts:278-303`).
- Receipt ownership currently falls through from `project.*` to `threadId`, so adding a worktree
  aggregate without changing the resolver is incorrect (`apps/server/src/orchestration/command-receipts.ts:108-126`).
- Projection cursor advancement is correctly atomic with the row write
  (`apps/server/src/orchestration/projection-pipeline.ts:89-100`), but startup catch-up calls a replay
  method capped at 1,000 events only once (`apps/server/src/orchestration/event-store.ts:95-137`,
  `apps/server/src/orchestration/projection-pipeline.ts:51-62`). This is a verified recovery bug and a
  prerequisite fix, not optional cleanup.
- The shell stream only knows project/thread aggregates and falls back to full snapshots because the
  engine omits the available database point-reader (`apps/server/src/orchestration/streams.ts:399-449`,
  `apps/server/src/orchestration/engine.ts:77-87`).
- Provider intent handling is live-only: the reactor subscribes after projection catch-up, consumes
  only newly published events, and deduplicates turn starts with an in-memory TTL cache
  (`apps/server/src/orchestration/engine.ts:77-90`,
  `apps/server/src/orchestration/provider-command-reactor.ts:101-123`). A crash can therefore strand
  a committed, unadopted turn even when the projection itself recovers.
- Claude already distinguishes its raw SDK session UUID from the namespaced runtime ID: the raw value
  is passed as SDK `sessionId`/`resume`, while the runtime ID is `claude:<uuid>`
  (`apps/server/src/provider/adapters/utils/claude-query-options.ts:87-124`,
  `apps/server/src/provider/adapters/claude.ts:540-572`,
  `apps/server/src/provider/adapters/claude.ts:626-637`). The adapter currently permits an init frame
  to replace that raw ID (`apps/server/src/provider/adapters/claude.ts:1195-1223`).
- The pinned Claude SDK is `0.3.226` (`apps/server/package.json:31-33`). Its installed declarations
  expose `listSessions({ dir, includeWorktrees, includeProgrammatic })`, return a raw UUID plus cwd,
  branch, title, and timestamps, and accept the same raw string through `Options.resume`
  (`node_modules/.bun/@anthropic-ai+claude-agent-sdk@0.3.226+467288d7b80af72f/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:935-996`,
  `node_modules/.bun/@anthropic-ai+claude-agent-sdk@0.3.226+467288d7b80af72f/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:1815-1841`,
  `node_modules/.bun/@anthropic-ai+claude-agent-sdk@0.3.226+467288d7b80af72f/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:4513-4548`).
- Existing adapter/service methods named `listSessions` list only active in-memory/runtime bindings,
  not durable Claude sessions (`apps/server/src/provider/adapters/claude.ts:296-305`,
  `apps/server/src/provider/provider-service.ts:470-472`).
- Terminal PTYs are in-memory shells keyed by a root and an unrelated tab/session string; there is no
  orchestration identity or discovery path (`packages/contracts/src/terminal.ts:8-17`,
  `apps/server/src/terminal/service.ts:67-83`, `apps/server/src/terminal/service.ts:128-152`).
- Session deletion is another live-only reactor and currently removes its thread-owned checkout
  after tombstoning the conversation (`apps/server/src/orchestration/thread-deletion-reactor.ts:100-133`,
  `apps/server/src/orchestration/thread-deletion-reactor.ts:149-199`). That removal is unsafe as soon
  as more than one session can share a worktree and must be neutralized in this plan, not deferred.
- The sidebar derives `waiting | working | failed | idle` in the browser
  (`apps/web/src/features/chat/utils/thread-status.ts:3-33`) and groups rows by project rather than
  the authority's three state sections (`apps/web/src/features/chat-mode/utils/session-rail-model.ts:145-211`,
  `apps/web/src/features/chat-mode/utils/session-rail-model.ts:266-288`).
- URLs encode a `thread-` ID and re-derive project ownership from the current workspace, which cannot
  identify a cross-project root session by itself (`apps/web/src/features/address/utils/session-token.ts:4-22`,
  `apps/web/src/features/address/utils/session-token.ts:35-69`,
  `apps/web/src/features/address/hooks/use-restore.ts:357-383`).

- The Git service never reads remotes or the root commit; it only shells `fetch` and `push`
  (`apps/server/src/git/service.ts:174-176`) and infers GitHub support from a branch
  (`apps/server/src/git/service.ts:597`). Repository identity has no owner yet.
- `apps/web/src/lib/environments/state/store.ts` owns `useEnvironmentsStore`, with `activeOrigin`,
  origin-keyed entries, learned `environmentId`, and handshake identity checks. Resolve the active
  identity from `entries[activeOrigin].environmentId`; an unverified endpoint has no domain identity.
- `apps/web/src/lib/environments/state/query-clients.ts` owns `queryClientFor(origin)` and immutable
  HTTP ownership through `clientForQueryClient` and `originForQueryClient`. Query execution uses its
  context's client. Queues and save services retain that owner across awaits.
- `apps/web/src/state/application-runtime.ts` retains one editor runtime and query client per origin.
  `activateEnvironment(origin)` suspends the previous runtime and activates the retained target.
  `apps/web/src/components/active-environment-application.tsx` keys query consumers by origin and
  supplies `EditorStateProvider` with the retained runtime. A switch preserves unsaved documents.
- `apps/web/src/features/chat/providers/transport-provider.tsx` creates the active origin's
  `ChatTransport` through `transport/create-chat-transport.ts`. Plan 077 closes that connection on
  switch; Plan 078 extends its lifetime for simultaneous chat connections.
- `apps/web/src/keymap/providers/bus-provider.tsx` owns one outer command bus. It receives
  `application.commandBinding`; `keymap/state/runtime-binding.ts` exposes `capture`, `bind`, and
  `clear`. The bus captures the runtime once per invocation. This plan preserves those lifetimes
  while populating one environment's domain slice.

If these claims no longer hold, revise the phases and verification paths before implementation. Do
not trust the implementation-status prose in either strategy document.

## Outcome

After this plan:

1. The durable domain is exactly `Project → Worktree → Session`; every project has exactly one
   protected current worktree, every worktree belongs to one project, and every session has a non-null
   `worktreeId`.
2. The current conversation aggregate is called session everywhere. Provider liveness is called
   runtime state. No `ThreadId`, `thread.*` command/event, thread projection table, or compatibility
   alias remains.
3. A `SessionId` is a raw UUID. For Claude it is the exact Claude Code session UUID: the GUI passes it
   to SDK `sessionId`/`resume`, discovery imports it unchanged, and terminal resume arguments use it
   unchanged. `claude:<uuid>` remains, if needed, only as an adapter-runtime handle.
4. Claude sessions born in a terminal are discovered with the official SDK metadata API and enter
   the same command/event/receipt/projection stream as GUI sessions. No projection is written
   directly and no JSONL content is parsed.
5. Shell snapshots and deltas contain projects, worktrees, and sessions. The web cache normalizes all
   three and can rebuild after replay/reconnect.
6. The sidebar uses one projected `needs-input | working | settled` vocabulary, with a projected
   reason and failure decoration, and renders those sections across projects.
7. One asynchronous orchestration readiness barrier drains the full event backlog, recovers stale
   runtimes/deletion work, and reconciles durable provider-start claims before command ingress or a
   shell snapshot can claim work is still running. Discovery starts after readiness and arrives as
   ordinary deltas rather than blocking first paint.
8. Repository identity is machine-independent. The same repository registered on two servers yields
   the same `ProjectId` on both, so the federated rail groups them without a client-side logical
   project layer. A second independent clone on one machine is another worktree of that project.
9. The web projection store holds one slice per environment keyed by `environmentId`, the rail model
   reads every slice and keys rows by scoped refs, and the address grammar carries an optional
   environment segment. All three are exercised with one environment here and with many in Plan 078.

## Locked design

### Vocabulary and identity

- `Session` is the user-facing conversation aggregate formerly called thread.
- `SessionRuntimeState` is the provider-process status formerly called `OrchestrationSession`.
- `ProjectId`, `WorktreeId`, and `SessionId` are branded RFC 4122 UUIDs. The latter two replace
  path-derived/thread-prefixed identity, and `SessionId` replaces `ThreadId` everywhere. No domain ID
  accepts separators, dot segments, `thread-`, or provider prefixes. Do not add
  `type ThreadId = SessionId`, deprecated exports, old event decoders, redirect routes, or dual table
  reads.
- A GUI bootstrap client-mints one `SessionId`; the server validates and adopts it. Discovery adopts
  Claude's raw UUID. The Claude adapter must pass that exact UUID as SDK `Options.sessionId`; resume
  passes it as `Options.resume`. A CLI argv builder returns `['claude', '--resume', sessionId]` with
  no prefix, shell interpolation, or string parsing.
- `Session.modelSelection.providerInstanceId` is the one canonical provider-instance owner. Do not
  duplicate it as a second session column. Changing models inside that instance follows adapter
  capability; changing provider/account creates another session. A structured 409 refusal prevents
  one durable transcript from silently becoming two harness conversations.
- Claude init reporting a different session UUID is an identity violation. Stop that runtime and
  raise a catalogued error; never mutate the aggregate ID and never create an alias row.
- Claude `/clear` changes its provider conversation/thread marker, not the resumable session UUID;
  keep the provider marker in runtime metadata only (`apps/server/src/provider/adapters/claude.ts:846-853`).

Lock these exported names and meanings before editing consumers:

| Name                         | Meaning                                                                   | Claude value               |
| ---------------------------- | ------------------------------------------------------------------------- | -------------------------- |
| `SessionId`                  | Durable product aggregate and cross-frontend resume identity              | raw UUID                   |
| `ProviderBindingHandle`      | Stable namespaced handle for one provider binding across runtime restarts | `claude:<uuid>`            |
| `ProviderConversationMarker` | Optional mutable upstream conversation marker                             | init/`/clear` marker       |
| `ProviderResumeCursor`       | Adapter-opaque cursor only when resume is not the product ID              | unused for Claude identity |

Rename the current overloaded `providerSessionId`/`providerThreadId` fields to these meanings in the
phase that owns their consumers. A separate runtime epoch/generation identifies one spawned process.
Never pass a binding handle or conversation marker to Claude resume.

### Domain records

Define one canonical contract for each record:

```ts
type RepositoryIdentity =
  | { source: 'git-remote'; remoteName: 'origin'; canonical: string; host: string; path: string }
  | { source: 'root-commit'; canonical: string }
  | { source: 'path'; canonical: string }

type Project = {
  id: ProjectId
  repositoryKey: string
  repositoryKind: 'git' | 'directory'
  repositoryIdentity: RepositoryIdentity
  // title/order/model/scripts/lifecycle fields; no workspace path
}

type Worktree = {
  id: WorktreeId
  projectId: ProjectId
  registrationGeneration: number
  canonicalPath: string
  path: string
  branch: string | null
  kind: 'current' | 'linked'
  ownership: 'protected' | 'external' | 'platform'
  createdAt: string
  updatedAt: string
  retiredAt: string | null
}

type Session = {
  id: SessionId
  worktreeId: WorktreeId
  modelSelection: ModelSelection
  origin: 'platform' | 'discovered'
  attentionState: 'needs-input' | 'working' | 'settled'
  attentionReason: 'approval' | 'user-input' | 'interruption' | 'failure' | 'plan' | 'active' | null
  acknowledgedFailureThroughSequence: number | null
  hasError: boolean
  runtime: SessionRuntimeState | null
  // title/model/turn/transcript/lifecycle fields formerly on OrchestrationThread
}
```

- `current` means the checkout through which the project was registered, not necessarily Git's main
  worktree. It is protected from Platform cleanup. Enforce exactly one live `current` worktree per
  project and derive it through a shared selector; do not add a circular `Project.defaultWorktreeId`
  foreign key.
- `external` is a Git worktree discovered outside Platform ownership, or an independent clone of
  the same repository registered as an additional checkout. It may host sessions but is never
  automatically removed. `platform` is reserved for Plan 069 creation/cleanup.
- Git's main checkout is a Worktree record with the same query, file, and session ownership as
  other checkouts. Keep main-checkout removal protection separate from that uniform representation.
  A logical project groups checkouts without sharing their index, working changes, commit drafts,
  or unsaved buffers.
- `Project.repositoryKey` is an opaque SHA-256 digest of **machine-independent repository
  identity**, resolved in this order at the trusted boundary: the `origin` remote URL normalized to
  `host/path` (trimmed, trailing slashes and `.git` stripped, lowercased; `ssh://`, `https?://`,
  `git://`, and scp-style `user@host:path` all collapse to the same key, as
  `references/t3code/packages/shared/src/git.ts:114-147`); else the root commit hash
  (`git rev-list --max-parents=0 HEAD`, first line); else the canonical path for an explicitly
  supported non-Git directory. The raw host path never enters a Git project's key. The key is unique
  among live projects **on one server** and deliberately identical across servers for the same
  repository; the browser never treats a bare `ProjectId` as unique (see Environments below).
- Identity is captured at registration and stored as `repositoryIdentity`. A later remote rename or
  a remote added to a root-commit project does not re-key a live project; re-registration after
  deletion resolves identity afresh and may therefore revive a different deterministic id.
- Registering another checkout whose identity resolves to the same key adds a worktree to that
  project instead of a second project, including an independent clone with its own common
  directory. Two projects with different remotes are different projects even when one is a fork.
- `Project.repositoryKind` is the projected capability discriminator. The browser never guesses Git
  support from a null branch or reverses the opaque repository key.
- Resolve `repositoryKey` and `canonicalPath` at the trusted server filesystem/Git boundary before
  the pure decider. A client may submit a workspace root as registration input but it is not stored
  on the Project projection/snapshot and never becomes session cwd.
- Check in distinct UUIDv5 namespaces and fixed-vector tests. Derive `ProjectId` from `repositoryKey`;
  derive registered/current `WorktreeId` from `repositoryKey + NUL + canonicalPath`. A public project
  create/register intent carries the workspace input but no authoritative domain IDs. The trusted
  server preparation boundary canonicalizes it, enriches the internal command with both IDs, and an
  accepted receipt returns a typed `{ projectId, worktreeId, disposition }` result. Repeating one
  command returns the same result; registering another checkout of an existing repository returns
  that ProjectId and a new deterministic WorktreeId. Platform-created worktrees use client-minted
  UUIDv4 IDs in Plan 069. Aggregate IDs and deterministic command IDs remain distinct.
- `Worktree.canonicalPath` is boundary-normalized with realpath/case handling appropriate to the host
  and is globally unique where `retiredAt IS NULL`. `retiredAt` is a logical registration tombstone:
  project deletion retires rows but never claims the physical checkout was removed. Verified
  re-registration may revive the same deterministic project/worktree IDs through normal events.
  `registrationGeneration` starts at zero and advances only on revival; it does not change on branch
  or metadata refresh.
  Resolve an SDK cwd by boundary-safe containment plus
  repository identity, choosing one longest matching worktree; zero or multiple matches are not guessed.
- Project deletion without force rejects live sessions. Forced deletion emits each `session.deleted`,
  every live `worktree.retired`, and `project.deleted` in one accepted event batch; it never removes a
  checkout. Re-registration cannot revive those deterministic IDs until deleted sessions have
  provider-stop state `completed | no-binding` and no live adapter. Plan 069 adds the stricter guard
  that Platform-owned worktrees must first be removed or released. Once safe, the prepared public
  registration emits explicit `project.revived` and `worktree.revived` events rather than a second
  create/register event; a still-active project receiving another checkout emits only
  `worktree.registered`.
- Branch and path live only on `Worktree`. Do not copy them back onto `Session`. Add one server-side
  session → worktree → project resolver and one equivalent web selector; provider cwd, terminal cwd,
  checkpoints, diffs, file tools, Git tools, and address restoration use those owners.
- Shell records may denormalize display labels, but canonical commands/events and persisted foreign
  keys still follow the explicit chain. A denormalized field must be derived and covered by a
  projection-coherence test.

### Sidebar state

`SessionAttentionState` has this precedence:

1. `needs-input` for an open approval, open user-input request, actionable proposed plan not already
   being implemented, a recovery interruption, or a runtime/turn failure newer than its durable
   acknowledgement.
2. `working` for a running latest turn or runtime status `starting | running | waiting`.
3. `settled` otherwise.

Within `needs-input`, reason priority is `approval → user-input → interruption → failure → plan`;
`working` uses `active`, and `settled` uses `null`. `hasError` is true only for an unacknowledged
failure/interruption, so settling removes destructive rail decoration while the failed turn remains
visible in detail history. Existing `session.settle` is the durable acknowledgement for a finished
failure/interruption and advances `acknowledgedFailureThroughSequence` to the latest applicable event;
a later failure automatically outranks it. `settle`, `snooze`, and
`archive` reject while a request is open, a turn is queued/claimed/adopted, or runtime is active.
New actionable activity clears those overlays in the same event batch. Pinning never changes
attention. Derive state/reason in the server projection, publish both in shell state, and make the
rail surface `needs-input` even if stale cached overlay fields disagree. Delete the browser-only
competing reducer and test the complete overlay/attention precedence table.

### Environments

- The server knows nothing about other machines. Every table, command, event, and receipt here is
  per server exactly as written; `environmentId` never enters a domain record or a command.
- The browser keys everything by environment. Add to `packages/contracts/src/chat-ids.ts`:
  `ScopedProjectRef { environmentId, projectId }`, `ScopedWorktreeRef { environmentId, worktreeId }`,
  `ScopedSessionRef { environmentId, sessionId }`, with `scopedProjectKey(ref)` and friends returning
  `${environmentId}:${id}`. A session's `SessionId` stays the raw UUID everywhere the server or a
  provider sees it. The reference uses the confirmed descriptor or handshake identity, never the
  HTTP origin. Two servers with the same checkout path can have different environment identities;
  two endpoints backed by the same identity database represent the same environment.
- Checkout identity in the browser is `(environmentId, worktreeId)`, including the main checkout.
  Git queries and mutations resolve that checkout's path on its owning server. Preserve this owner
  across async work. Checkout files and unsaved buffers also retain this reference, so a project
  group or a matching path on another machine cannot redirect a save. Keep the scoping of persisted
  data in Plan 078 as specified below.
- `ChatProjectionState` becomes `{ slices: Record<EnvironmentId, ChatProjectionSlice> }` where a
  slice is today's normalized state (projects, worktrees, sessions, sequence guards, bootstrap flag)
  for one server. Writers take the `environmentId` of the transport that produced the item; a slice
  is created on first snapshot and removed by an explicit `dropEnvironment(environmentId)` action.
  Selectors for the active environment resolve `entries[activeOrigin].environmentId` from
  `lib/environments/state/store.ts`. Rail selectors fold every slice. Reject an unresolved identity
  before domain selection or command dispatch.
- The rail model takes `environments: readonly { id, label, isPrimary }[]` plus per-environment
  inputs and emits rows carrying `environmentId`, a `machineLabel` that is non-null only when more
  than one environment is present or the row's environment is not primary, and a `projectGroupKey`
  equal to the bare `ProjectId` so the same repository on two machines lands in one group with its
  worktrees labelled by machine. Plan 078 adds the machine filter and connection chrome; this plan
  ships the model with one environment and a unit test with two.
- Selecting a session resolves `ScopedWorktreeRef` to a confirmed environment and checkout path.
  Route environment activation through `ApplicationRuntime.activateEnvironment(origin)`, then open
  the root through the target runtime's `useOpenWorkspaceRoot` owner before publishing selection.
  A hook captured before activation still belongs to its original runtime. This plan wires the
  scoped selection parameter; with one populated environment no machine switch is needed.
- Preserve the retained editor runtime and its file/settings save owners during the domain rename.
  Remount active query consumers under `ActiveEnvironmentApplication`; do not replace live document
  stores with persisted snapshots. Keep the single outer command bus and its per-invocation runtime
  capture. Session commands use the captured scoped reference through completion.
- The address grammar (`apps/web/src/features/address/utils/grammar.ts:86-129`) gains an optional
  leading `@<environmentId>` segment before the `~workspace` segment, omitted for the primary
  environment. `parseAddress` rejects an unknown environment as a rejected token, never a fallback
  to primary; `formatAddress` emits it only for a non-primary environment.
- Persistence stays unscoped in this plan (one environment is populated). Plan 078 wraps the chat
  projection cache and the other per-environment keys in `environmentScopedStorage`; do not add a
  partial scheme here, and keep the cache schema bump in Phase 5 so the later scoping needs no
  second bump.

### Discovery and recovery

- Add an optional provider SPI for durable session discovery. Rename current active-runtime
  `listSessions` methods so the two concepts cannot be confused.
- Claude discovery uses the pinned SDK's `listSessions` metadata API with `includeWorktrees: true`
  and `includeProgrammatic: false`, paging with `limit`/`offset` until a short page. That is the SDK's
  documented terminal-`/resume` parity mode. It does not call `getSessionMessages`, tail JSONL,
  parse terminal bytes, or inspect undocumented record shapes.
- Run the SDK enumeration in an isolated Bun child carrying the provider instance's existing
  `CLAUDE_CONFIG_DIR`. Do not mutate process-global environment variables; multiple Claude instances
  are supported by `apps/server/src/provider/drivers/claude.ts:8-46`.
- Resolve each returned `cwd` to exactly one known project/worktree. A Git-confirmed external linked
  checkout enters through an idempotent server-only `worktree.register` command first. Ambiguous,
  missing, or cross-project cwd matches are skipped with one wide warning event; never guess.
- A newly seen Claude UUID enters through a deterministic server-only `session.discover` command,
  whose accepted domain event is ordinary `session.created` with `origin: 'discovered'`; do not add a
  parallel `session.discovered` event. It then flows through normal projections, receipt, shell delta,
  and web cache. Repeated scans and restarts converge on the same `SessionId`; metadata refresh is a
  separate idempotent command.
- `session.discover` uses a stable bounded hash of provider instance plus raw UUID. An absent
  worktree's `worktree.register` ID hashes repository identity plus canonical path. An active match
  is a read-side no-op; a retired deterministic row uses a distinct `worktree.revive` command whose ID
  includes the retirement event sequence and whose event advances `registrationGeneration`. This
  prevents a permanent registration receipt from swallowing a later revival. Metadata-refresh
  command IDs add a normalized metadata fingerprint, so changed title/branch/timestamp is not
  suppressed by the first receipt and paths do not leak through receipt/log IDs. Tests cover active
  scan dedupe, retire→re-register, duplicate pages, changed metadata, and more than one SDK page.
- The SDK metadata exposes no frontend provenance. Persist `origin: 'discovered'`, never claim a row
  was terminal-born as a fact, and do not persist `chat | terminal` as a second identity. The scan
  still includes terminal-born sessions; a future handoff records its actual attached driver/surface
  without changing `SessionId`.
- SDK `gitBranch` is session-source metadata only. Canonical `Worktree.branch` changes exclusively
  through live Git-backed worktree metadata refresh, so historical sessions cannot flap a shared
  chip. Rediscovering an existing `SessionId` under a different canonical worktree is a structured
  reparent conflict plus one wide warning; `worktreeId` is immutable.
- Scan after the readiness barrier resolves, after project/worktree registration, and on one bounded
  service-owned cadence. The cadence is an internal constant, not a user-facing setting. Initial
  discoveries arrive through shell deltas and do not delay the first shell snapshot. Log one wide
  event per scan with duration/count/skip reasons, not one log line per session.
- A discovered external session is `settled` unless Platform owns a live runtime signal. File mtime
  is not liveness. This plan lists the session but does not tail its transcript.
- Add a durable provider-start state per turn: `queued → claimed → adopted → settled`, with
  `interrupted` as recovery. The provider reactor dispatches the claim command and commits its
  receipt before any SDK side effect; its in-memory TTL remains an optimization only.
- On process start, a queued/unclaimed turn may be scheduled through that same claim path. A claimed
  or adopted turn from a dead runtime is ambiguous and becomes an interruption requiring attention;
  never resend its prompt automatically without a provider idempotency token. Runtime-recovery
  command IDs include the observed transition sequence/runtime epoch so two later crashes are not
  deduplicated as one recovery.
- Provider directory/binding tables own only adapter handles, resume cursors, and launch metadata.
  Lifecycle truth flows through runtime commands/events into the session projection. Recovery never
  lets a binding row override projection state; add a coherence test over both stores.

### Receipt and readiness ownership

Receipt ownership is exhaustive and follows the initiating command, even when its atomic event batch
touches more than one aggregate:

| Command family | Receipt aggregate | Compound event example                           |
| -------------- | ----------------- | ------------------------------------------------ |
| `project.*`    | `projectId`       | project plus protected current-worktree creation |
| `worktree.*`   | `worktreeId`      | registration plus dependent metadata refresh     |
| `session.*`    | `sessionId`       | session/message/turn bootstrap                   |

Project registration has the exact accepted payload
`{ projectId, worktreeId, disposition }`, where `disposition` is
`created-project | registered-worktree | existing-worktree | revived-project`. Persist this typed
payload in receipt `result_json` alongside `resultSequence`; rejected and result-less commands store
`null`. A duplicate `commandId` must parse and return the identical full payload after engine/process
restart, not reconstruct it from the current projection.

Every ingress whose public intent needs trusted preparation first computes a privacy-safe fingerprint
of the original wire intent and checks `commandId` receipts before filesystem/Git work. An existing
receipt with the same command type/fingerprint returns immediately even if the path later moved;
reuse of that ID with a different intent is a structured collision. Only a receipt miss enters
preparation and then the engine. A command-ID single-flight lane surrounds lookup→preparation→engine
so concurrent duplicates cannot fail preparation after their twin already committed; the receipt,
not that in-memory lane, remains crash/restart correctness. Project registration is the first consumer;
Plan 069 reuses the same boundary before resolving a base HEAD. Every accepted receipt stores the
transaction's current event-store head as non-null `resultSequence` (zero for an empty log), including
`existing-worktree` registrations that correctly emit no event. Rejected receipts alone use a null
sequence.

Do not infer ownership from a fallback prefix. Internal retry/recovery IDs include the source event
sequence or operation/runtime generation; stable entity identity alone is not a retry identity.

Introduce one named asynchronous orchestration bootstrap/readiness coordinator. Database migration,
full paged projection catch-up, read-model load, stale runtime/provider-claim recovery, and durable
session-deletion side-effect recovery complete behind one promise. Command ingress, HTTP snapshots,
WS snapshots/subscriptions, and reactor scheduling all await it. Discovery starts after it resolves.
Plan 069 inserts worktree reconciliation into this coordinator; it must not create a second startup
sequence. External cleanup calls inside recovery use the adapter's bounded operation timeout; timeout
or refusal projects a structured retryable failure and lets readiness resolve truthfully instead of
hanging the first shell forever.

## Scope

### In scope

- Contract and source vocabulary cutover from thread to session.
- Explicit Project/Worktree/Session records and IDs.
- Deliberate greenfield reset of obsolete orchestration state.
- Event, receipt, projection, replay, snapshot, stream, route, and web-cache cutover.
- Full projection catch-up pagination, one readiness barrier, durable provider-start claims, and
  stale-runtime/deletion startup recovery.
- Claude raw session identity and official metadata discovery.
- Terminal-born rows in the cross-project sidebar.
- Three sidebar state sections and error decoration.
- Session/worktree-aware address and effective-cwd resolution.
- Machine-independent repository identity with fixed normalization vectors.
- Environment-shaped web projection store, scoped refs, rail rows with `environmentId`, and the
  optional address environment segment, populated with one environment.

### Out of scope

- Worktree creation choice, chips, or cleanup; Plan 069 owns them.
- Orca/race/compare projections, result scoring, sibling-agent UI, or compare routes.
- A Git overview showing the main and other checkouts together, including remote worktrees. This
  is unscheduled; section or tab layout and optional machine grouping remain undecided.
- Live JSONL transcript mirroring.
- Automatic handoff or simultaneous GUI/PTY driving. A later terminal-surface plan must stop one
  driver before starting the other; this plan only makes the shared raw identity available.
- Cross-harness unified history.
- Remote session sync.
- Connecting more than one environment at once, the Machines setting and page, the SSH launcher,
  scoped persistence, machine filter and chips chrome, and offline surfaces (Plan 078).
- A user setting for discovery cadence, preferred face, or default worktree. If product scope later
  requires one, it must be registered and consumed in the same change through
  `packages/contracts/src/settings/keys.ts`; do not add localStorage or an env knob.

## Git and state policy

- Work in the existing worktree and preserve unrelated changes.
- Before the destructive schema phase, surface the exact local orchestration database path to the
  operator. This plan intentionally discards greenfield chat/event state once; settings and secrets
  are not part of that reset.
- Append one migration; never edit or renumber migrations 1–10 (10 is Plan 077's
  `environment_identity`, which this reset must not drop).
- Do not migrate old thread rows/events into session rows. Do not leave compatibility views or
  aliases. Fresh and upgraded developer databases must converge on the same final schema.
- Production errors use `defineErrorCatalog`/`createStructuredError` and evlog wide events. Do not
  throw `new Error` from new production code.
- Session deletion keeps provider-stop and attachment reclamation, but removes every physical
  worktree-removal call. Persist provider stop separately as
  `requested | completed | no-binding | failed` and blob cleanup as its own retryable outcome.
  `failed` provider stop is not safe/terminal ownership release; recover/retry it at startup so Plan
  069 can require `completed | no-binding` plus no live adapter before filesystem cleanup.

## Phase 1 — Lock the vocabulary and contract cutover

### Work

1. Tighten `ProjectId` and add branded UUID `WorktreeId` and `SessionId` schemas in
   `packages/contracts/src/chat-ids.ts`.
2. Replace the product conversation's `ThreadId`/`OrchestrationThread*` contracts with
   `SessionId`/`OrchestrationSession*`. Rename the current nested provider object to
   `SessionRuntimeState` before reusing `Session`.
3. Add canonical repository/worktree, discovered-origin, attention reason/error, provider-start,
   deletion-side-effect, readiness, and typed project-registration receipt-result contracts. Make
   `worktreeId` and `modelSelection` required; do not duplicate
   `modelSelection.providerInstanceId`. Add `RepositoryIdentity` and the browser-only
   `ScopedProjectRef`/`ScopedWorktreeRef`/`ScopedSessionRef` types with their key helpers to
   `chat-ids.ts`; no server command or event schema references a scoped ref.
4. Replace every `thread.*` command/event with `session.*`; add the minimal server-only
   `project.revive`, `worktree.register`, `worktree.revive`, `session.discover`, discovery metadata
   update, and runtime-recovery commands. Extend the aggregate kind to
   `project | worktree | session`.
5. Make public project creation carry only registration input. Server preparation derives the
   fixed-vector IDs and establishes a deterministic protected current worktree in the same accepted
   command batch. Remove `workspaceRoot` from project metadata updates; changing checkout ownership
   is worktree registration/retirement. A session bootstrap names an existing `worktreeId`; it never
   sends a path.
6. Update package entry exports and package-local tests. Record every server/web consumer found by
   the drift search for its owning later phase; do not add temporary aliases to make those consumers
   compile early.
7. Bump the orchestration WS protocol version because snapshot, command, event, and delta shapes are
   intentionally incompatible.
8. Delete obsolete tests that assert thread-prefixed IDs or path-on-session behavior; replace them
   with session/worktree contract tests. Do not keep old behavior behind dual schemas.

Keep nesting depth at three or less. Event/command routing should be exhaustive switches or typed
catalog maps, not another prefix fallback that assumes every non-project command has `sessionId`.
This contract phase is independently green inside `packages/contracts`; the application-wide rename
finishes in Phases 2–5. Do not commit, deploy, or run an app-wide typecheck between those lockstep
subphases.

### Verify

```sh
cd packages/contracts
bun run test -- src/tests/orchestration.test.ts src/tests/session-detail-snapshot.test.ts
bun run typecheck
cd ../..
if rg -n "ThreadId|threadIdSchema|OrchestrationThread|thread\." packages/contracts/src; then
  exit 1
fi
```

Expected: focused contract tests and typecheck pass; the final `rg` returns no product-domain
matches inside the contract package. Project-registration receipts expose canonical IDs without
putting authoritative project/worktree IDs on the public intent. Later phases own the deliberately
broken application consumers.

## Phase 2 — Reset persistence into the explicit topology

### Work

1. Append migration 11 (Plan 077 owns 10), named for the session-domain reset. In one migration
   transaction, drop the obsolete orchestration event/receipt/projection/provider-runtime tables and
   recreate the final schema. Do not copy developer thread data. Leave `environment_identity`,
   `fs_metadata`, and every non-orchestration table untouched.
2. Replace project `workspace_root` with `repository_key` and `repository_identity_json`; add
   `projection_worktrees`; replace every
   `projection_thread_*` table with its `projection_session_*` counterpart; key sessions by
   non-null `worktree_id`; store `registration_generation` and the logical `retired_at` tombstone;
   store `repository_kind`, and key provider binding/runtime metadata by `session_id`.
3. Add indexes for globally unique live repository keys/canonical worktree paths, exactly one
   live `kind = 'current'` worktree per project, sessions by worktree/deleted/created, session
   identity, and existing detail lookup paths under their new names. Worktree uniqueness is partial
   on `retired_at IS NULL`; there is no project→default-worktree FK.
4. Store `attention_state`, `attention_reason`, `has_error`, provider-start state/generation, and
   `acknowledged_failure_through_sequence`, provider-stop state, and separate blob-cleanup state on
   the appropriate session/turn projections. Branch/path exist only on worktree rows; provider
   binding rows store no competing lifecycle status.
5. Preserve a nullable receipt `result_json` in the reset schema and make its parser validate the
   command-specific accepted result. Store the wire-intent fingerprint and enforce non-null accepted
   versus null rejected `result_sequence`; do not collapse project registration back to sequence-only.
6. Update Drizzle row types and every SQL query. No old table, view, nullable fallback, or dual read
   remains.
7. Add migration tests for both a fresh database and a version-9 fixture containing old thread data.
   The latter must end with empty final orchestration state and unchanged non-orchestration tables.

### Verify

```sh
cd apps/server
bun --bun vitest run src/db/tests/migrations.test.ts
cd ../..
if rg -n "projectionThreads|projectionThread|projection_threads|thread_id" apps/server/src/db; then
  exit 1
fi
```

Expected: migrations are atomic and converge; the final `rg` returns no obsolete orchestration
schema owner in `db/`; the migration test runs `PRAGMA foreign_key_check` after project/current-
worktree insertion on both fresh and upgraded databases. Server consumers are updated and typechecked
in Phase 3; do not commit or deploy this intermediate schema subphase.

## Phase 3 — Extend events, projections, receipts, streams, and recovery

### Work

1. Update every server consumer and rename source files so the preparation boundary derives IDs, the
   decider/read model/projector create the project event before its protected current-worktree event,
   register worktrees idempotently by repository/canonical path, and require a live worktree for
   session creation. Preserve the typed creation receipt result. This phase owns the mechanical
   provider interface cutover from product `threadId` to already-required `sessionId` so server
   typecheck is green; Claude-specific use of that ID remains Phase 4.
   Add fixed UUIDv5 vectors plus symlink/case canonicalization, duplicate-registration receipt, and
   hash-collision refusal tests at this trusted boundary. Repository identity is resolved here too:
   add two read-only Git service methods beside `runFetch` (`apps/server/src/git/service.ts:174`),
   `remoteUrl(root, 'origin')` and `rootCommit(root)`, and a pure `normalizeGitRemoteUrl` in
   `apps/server/src/git/utils/remote-url.ts` with fixed vectors for `ssh://`, `https://`, `git://`,
   scp-style, trailing `.git`, trailing slash, and mixed case all collapsing to one key, plus a
   no-remote repository resolving to its root commit and a plain directory to its canonical path.
2. Replace the receipt prefix fallback with the locked exhaustive aggregate table. Preserve
   accepted/rejected receipt semantics, typed result JSON, and the atomic command transaction; test
   compound batches, accepted no-event head sequence, pre-preparation duplicate lookup after the
   registration path disappears, mismatched-intent ID reuse, duplicate project registration after
   engine reconstruction, and two distinct recovery generations for one session.
3. Make `catchUp()` drain replay pages until a short page reaches the current head. Keep cursor
   advancement atomic with each projection write. Add a regression with more than 1,000 unapplied
   events and assert the first snapshot is complete.
4. Add worktree/session point readers and shell stream items. Pass the database to
   `OrchestrationStreams`; do not multiply the existing full-snapshot fallback per delta.
5. Emit shell snapshots as normalized `projects`, `worktrees`, and `sessions`; rename detail and
   search endpoints/frames to session vocabulary. Preserve sequence guards, max-gap snapshot
   fallback, bounded detail pages, and post-commit publication.
6. Add the shared attention reducer and call it after every event that can change pending requests,
   plan actionability, latest turn, runtime, acknowledgement/settle/archive/snooze, or error state.
   Test the full reason/overlay precedence matrix and projection/read-model coherence.
7. Add durable provider-start claim/adoption state. Commit the claim receipt before SDK work; on
   startup schedule only queued/unclaimed turns and interrupt ambiguous claimed/adopted turns.
8. Replace the synchronous constructor exposure with the named readiness coordinator. Make command
   routes, HTTP/WS snapshots, subscriptions, and reactor scheduling await it; test that none can
   observe a partial catch-up or stale working state.
9. Remove checkout deletion from session/project deletion. Project deletion retires worktree rows in
   its session-delete cascade and re-registration is fenced until provider ownership is released.
   Persist/recover provider-stop and blob-cleanup independently; bound external stop attempts, retry
   failed stops, treat `no-binding` explicitly, and prove deleting either of two sessions on one
   worktree leaves the checkout.
10. Use structured error catalogs for missing worktree, provider mutation, ID collision, ambiguous
    cwd, claim/recovery refusal, and deletion cleanup. Enrich existing wide operation events instead
    of emitting narrow lines.

### Verify

```sh
cd apps/server
bun --bun vitest run \
  src/orchestration/tests/engine.test.ts \
  src/orchestration/tests/projection-cache-coherence.test.ts \
  src/orchestration/tests/streams.test.ts \
  src/orchestration/tests/session-domain.test.ts \
  src/orchestration/tests/repository-identity.test.ts \
  src/orchestration/tests/session-attention-state.test.ts \
  src/orchestration/tests/provider-start-recovery.test.ts \
  src/orchestration/tests/session-deletion-recovery.test.ts \
  src/orchestration/tests/startup-recovery.test.ts
bun run typecheck
```

Expected: a >1,000-event cold start reaches the head, duplicate commands return the same receipt,
worktree/session deltas reconnect without holes, only unclaimed turns are rescheduled, ambiguous
turns become visible interruptions, deletion side effects converge, and every ingress/read waits for
readiness.

## Phase 4 — Make Claude identity and terminal discovery first-class

### Work

1. Wire the already-present provider-input `sessionId` into behavior. GUI bootstrap passes the
   client-minted/server-validated value. Keep binding handles, runtime epochs, provider conversation
   markers, and resume cursors distinct and private to runtime metadata.
2. Change the Claude adapter so a fresh session uses the supplied UUID, resume uses that same UUID,
   and its init confirmation refuses mismatch with an evlog error. Remove adapter-side fresh UUID
   minting.
3. Add a pure, argv-based Claude terminal resume helper and tests proving the exact raw UUID appears
   in both SDK option shapes and `['claude', '--resume', uuid]`. Never assemble a shell command
   string.
4. Rename active-runtime inspection methods, then add the provider discovery SPI and a Claude
   implementation backed by paged official SDK `listSessions` metadata with
   `includeProgrammatic: false` in an isolated, instance-scoped child. Inject the runner in tests;
   do not spawn the real CLI there.
5. Add the discovery reconciler. It resolves canonical cwd/repository identity through real
   project/worktree state and dispatches the locked deterministic `worktree.register`,
   `session.discover`, and metadata-fingerprint commands. One raw UUID produces one session across
   repeated/multi-page scans, GUI creation, restart, and metadata refresh.
6. Reject a discovered UUID already bound to another provider instance instead of merging account
   silos. Skip unknown/ambiguous cwd with structured reason fields.
7. Persist only the provable `origin: 'discovered'`. Treat discovery as metadata import only; do not
   invent terminal provenance, import message content, or infer `working` from mtime.

### Verify

```sh
cd apps/server
bun --bun vitest run \
  src/provider/adapters/tests/claude-query-options.test.ts \
  src/provider/adapters/tests/claude.test.ts \
  src/provider/tests/provider-session-directory.test.ts \
  src/provider/tests/session-discovery.test.ts \
  src/orchestration/tests/session-discovery-recovery.test.ts
bun run typecheck
```

Expected: one fixture UUID is used unchanged by SDK create, SDK resume, CLI argv, discovery, event
aggregate, projection, and restart. A prefixed `claude:<uuid>` never reaches any resume input.

## Phase 5 — Rebuild the web projection and sidebar on the new domain

### Work

1. Normalize projects, worktrees, and sessions in the Zustand projection store as one slice per
   `environmentId` (Locked design → Environments). Writers take the producing transport's
   `environmentId`; resolve the active identity through `lib/environments/state/store.ts`. Join
   ownership in selectors; never copy worktree path/branch into session state. Project registration
   consumes its accepted receipt result before selecting the canonical project/current worktree; it
   does not mint or infer those IDs in the browser. Add `ScopedProjectRef`/`ScopedWorktreeRef`/
   `ScopedSessionRef` and their key helpers to the contracts package; every browser map that spans
   environments uses them, and a test proves two slices holding the same `ProjectId` do not collide.
2. Bump the cache schema and discard the old browser cache. Do not migrate `thread-*` keys.
3. Rename transport, synchronization, optimistic, detail-subscription, search, selection, unread,
   diff, and command state to session vocabulary. Preserve bounded caches and independent shell/detail
   sequence guards. Keep `state/application-runtime.ts` as the retained editor owner and preserve
   `clientForQueryClient` ownership in every renamed query and save path. Keep one outer command
   bus with `commandBinding.capture`, including commands awaiting a target environment.
4. Replace URL `thread-` parsing with the raw UUID `SessionId`. Resolve project/worktree from the
   session projection, so cross-project agent-root links do not depend on a global current project.
   Add the optional leading `@<environmentId>` address segment: absent means primary, unknown is a
   rejected token, and `formatAddress` emits it only for a non-primary environment. The restore path
   resolves the session inside that environment's slice, never by scanning every slice for a UUID.
5. Replace browser-derived status with projected `attentionState`/`attentionReason`/`hasError`.
   Build three minimal rail sections in order: Needs input, Working, Settled. Retain project
   labels/qualifiers inside sections without restoring dashboard-style per-row statistics. Test that
   settle/archive/snooze cannot hide open or newly raised attention. The rail model folds every
   environment slice: rows carry `environmentId`, `machineLabel` (null with one primary environment),
   and `projectGroupKey` equal to the bare `ProjectId`; a unit test with two fixture environments
   holding the same `ProjectId` proves one project group with two machine-labelled worktrees and no
   duplicated rows. Selecting another environment resolves its scoped checkout, activates its
   application runtime, and invokes the target root-open owner before selection publication.
6. Render discovered sessions in the list with the same selection identity as Platform-created
   sessions and a truthful external/terminal-resumable affordance, not an invented birth claim. The
   row may expose the verified terminal-resume capability, but this plan must not auto-start a second
   driver or tail JSONL.
7. Audit every cwd consumer. Provider calls, checkpoint/diff queries, chat tool pane, terminal,
   files, Git, and workbench navigation resolve the selected session's worktree through one selector.
   Terminal-open contracts carry `worktreeId`, never a browser-supplied path; the server resolves cwd
   and retains that WorktreeId on the persistent PTY record so later lifecycle safety can query it.
8. Follow component/kind rules: one component per file, pure reducers in `utils/`, stateful stores in
   `state/`, providers in `providers/`, exact `@/` imports, no feature barrels. Use `@workspace/ui`,
   theme tokens, prescribed loading/empty primitives, and `tabular-nums` for changing counts/times.
9. Add `packages/contracts/src/tests/session-vocabulary.test.ts`. It scans all owned contract,
   orchestration, provider, chat/chat-mode, and address source and compares remaining `ThreadId`,
   `OrchestrationThread`, and `thread.*` symbols with a checked-in exact path+symbol allowlist for
   upstream generated/wire vocabulary. Excluding an entire handwritten adapter is forbidden; any
   new or removed allowlist match fails the test.

### Verify

```sh
cd apps/web
bun --bun vitest run --project node --project dom \
  src/features/chat/state/tests/chat-projection-cache.test.ts \
  src/features/chat/state/tests/chat-projection-writers.test.ts \
  src/features/chat/state/tests/chat-projection-selectors.test.ts \
  src/features/chat-mode/utils/tests/session-rail-model.test.ts \
  src/features/address/tests/session-token.test.ts \
  src/features/chat/transport/tests/orchestration-rpc-client.test.ts
bun run typecheck
```

Expected: cold snapshot, live delta, replay, terminal discovery, and cache reload all produce the same
three-section rail; a session always resolves one worktree and project.

## Phase 6 — Final vertical recovery gate

### Work

Create `apps/web/src/features/chat/tests/session-domain-recovery.integration.test.tsx` using
`apps/web/test/fixtures.ts`; exercise the real in-process server and real filesystem/Git boundaries
with a deterministic mock provider plus injected Claude discovery metadata:

1. Create a project and its protected current worktree through the registration receipt; assert the
   returned IDs/disposition match the fixed derivation vectors, reconstruct the engine, and prove the
   duplicate command returns the byte-equivalent typed result/sequence without another event even
   after the original path is unavailable. Register the already-active checkout with a distinct
   command and prove its accepted no-event receipt retains the current head across another restart.
2. Create a GUI Claude session with a known UUID and run a turn.
3. Inject a Claude metadata row representing a session created through an external terminal in
   another real Git worktree; assert the persisted origin says only `discovered`.
4. Verify both sessions appear under the correct projected worktrees and state sections.
5. Crash once before provider-start claim and once after claim/before adoption. Rebuild on the same
   SQLite file with more than 1,000 unapplied events; assert only the unclaimed turn is scheduled and
   the ambiguous claim becomes an interruption.
6. Reconnect from an old shell sequence and assert receipt/event/projection/cache convergence,
   including a second stale-runtime epoch with a distinct recovery receipt.
7. Delete one of two sessions sharing a worktree and prove the checkout remains while provider/blob
   cleanup recovery completes.
8. Delete the project after session side effects settle, prove its physical current checkout remains,
   then re-register it and receive the same canonical IDs. A variant with a live adapter must refuse
   revival.
   8a. Boot a second `makeTestServer()`, clone the same fixture repository (same `origin` remote) into
   its root, register it there, and assert the two servers return the same `ProjectId`, different
   `WorktreeId`s only when the canonical paths differ, different `environmentId`s, and that the web
   store holds both under scoped keys with one rail project group and two machine labels.
9. Inspect the diff for old vocabulary, copied paths, direct projection writes, unsafe resume string
   construction, raw palette colors, manual loaders, new settings, and `new Error` in production.

### Verify

```sh
cd packages/contracts
bun run test -- \
  src/tests/orchestration.test.ts \
  src/tests/session-detail-snapshot.test.ts \
  src/tests/session-vocabulary.test.ts
bun run typecheck
bun run lint
bun run format:check
cd ../../apps/server
bun --bun vitest run \
  src/db/tests/migrations.test.ts \
  src/orchestration/tests/session-domain.test.ts \
  src/orchestration/tests/provider-start-recovery.test.ts \
  src/orchestration/tests/session-deletion-recovery.test.ts \
  src/orchestration/tests/startup-recovery.test.ts \
  src/orchestration/tests/session-discovery-recovery.test.ts \
  src/provider/adapters/tests/claude.test.ts
bun run typecheck
bun run lint
bun run format:check
cd ../web
bun --bun vitest run --project node --project dom \
  src/features/chat/tests/session-domain-recovery.integration.test.tsx \
  src/features/chat/state/tests/chat-projection-writers.test.ts \
  src/features/chat/state/tests/chat-projection-selectors.test.ts \
  src/features/chat-mode/utils/tests/session-rail-model.test.ts \
  src/features/chat/transport/tests/orchestration-rpc-client.test.ts
bun run typecheck
bun run lint
bun run format:check
cd ../..
git diff --check
git status --short
```

The vocabulary test makes every upstream exception explicit and fails on product-domain drift. No
root-wide suite and no second dev server are part of this gate.

## Done when

- The source and wire vocabulary has one product session concept and one provider runtime concept.
- Every session has one non-null worktree; every worktree has one project; the protected current
  checkout is explicit.
- No obsolete thread contract/table/route/cache alias remains.
- The checked-in vocabulary allowlist contains only exact upstream generated/wire symbols and rejects
  every handwritten product-domain regression, including address code.
- Claude uses the same raw UUID for GUI create, SDK resume, CLI resume argv, discovery, and durable
  session identity.
- Discovered metadata—including terminal-born Claude sessions—enters through commands/events/receipts
  and appears in the sidebar without claiming provenance the SDK does not expose.
- Needs input, working, and settled are server-projected, restart-safe, and visibly grouped.
- Cold catch-up drains beyond 1,000 events; stale runtime state cannot survive a restart as working;
  provider-start claims prevent blind duplicate prompt delivery.
- Shell/detail replay and cache recovery remain sequence-correct and bounded.
- Project registration returns canonical IDs through the durable receipt; project deletion retires
  worktrees without physical removal and cannot revive them while an old provider still owns one.
- Active worktree registration deduplicates, while retire→re-register emits a new generation rather
  than being swallowed by the first registration receipt.
- No JSONL parsing, compare view, new setting, second state store, or direct projection mutation was
  introduced.
- The same repository on two in-process servers yields one `ProjectId`, two `environmentId`s, one
  rail project group, and no cross-slice collision; an address with `@<environmentId>` restores
  inside that slice and an unknown environment is a rejected token.
- All phase verification commands pass and baseline-delta review shows only intended changes.

## STOP conditions

Stop and ask the operator if any of these occurs:

- Root `PLAN.md` has not scheduled this plan.
- The user-owned `docs/product-vision.md` changed unexpectedly during execution.
- The pinned Claude SDK no longer exposes `listSessions`, exact `sessionId`, and `resume`, or the local
  CLI no longer advertises `--resume`/`--session-id`.
- Claude cannot honor the caller-supplied UUID exactly.
- A provider instance's durable sessions cannot be enumerated without global env mutation or
  undocumented JSONL parsing.
- A discovered cwd maps to multiple projects/worktrees or cannot be verified through the Git/workspace
  boundary.
- Canonical repository identity or global active-worktree path uniqueness cannot be enforced without
  merging two distinct operator projects.
- Repository identity cannot be derived machine-independently for a Git project (no `origin` and no
  reachable root commit), or the normalizer cannot make the listed remote spellings collapse.
- Any proposed web store, rail model, selector, or address token assumes a single implicit
  environment, or keys a cross-environment map by a bare `ProjectId`/`WorktreeId`.
- The completed Plan 077 owners fail the drift preamble: legacy transport symbols return, or
  identity, query ownership, retained runtimes, or captured command dispatch no longer match.
- Any proposed design keeps nullable `worktreeId`, keeps branch/path on session, aliases ThreadId,
  writes projections directly, or adds a parallel session database.
- Startup recovery still processes only one replay page, exposes ingress/shell state before the
  readiness barrier, or would automatically resend a claimed/ambiguous prompt.
- A setting is proposed without an entry and consumer in
  `packages/contracts/src/settings/keys.ts`; this plan currently requires no setting.
- Implementation would drive the same Claude session concurrently from SDK and terminal.
- The schema reset would touch settings, secrets, files, Git worktrees, or any state outside the named
  orchestration tables.

## Maintenance

If contract names, provider SDK capabilities, table names, or projection owners move before execution,
update the drift preamble, target paths, focused commands, and STOP conditions first. When this plan
is complete, delete it and replace live backlinks with source/tests; Git history is the archive.
