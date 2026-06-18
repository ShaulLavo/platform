> [!NOTE]
> **STATUS: 🔵 TOUCH-UP ONLY (reviewed 2026-06-06).** Stable reference distilled from `references/t3code`; content current.

# T3Code Reference

This is the condensed T3Code-only implementation reference. It combines the
important stack, chat frontend, backend orchestration, caching, and source-path
notes from the previous research docs.

The main decision to copy: T3Code makes the backend the source of truth. Chat
state flows from domain events into durable projections, then into WebSocket
shell/detail streams, then into a normalized frontend Zustand store. React Query
is used for side reads, not as the chat transcript cache.

## Executive Summary

- T3Code is a local-first coding-agent app, not a generic web starter.
- The backend owns projects, threads, provider sessions, checkpoints, approvals,
  Git state, terminal state, and server settings.
- Orchestration is event-sourced: commands produce domain events; events update
  projections; projections feed snapshots and live streams.
- The frontend renders a shell/detail projection cache:
  - shell: projects, thread shells, sidebar summaries, latest session/turn state
  - detail: messages, activities, proposed plans, turn diffs for active or
    prewarmed threads
- The chat UI uses Zustand for projection/draft state, TanStack Query for
  auxiliary queries, Lexical for the composer, Legend List for timeline
  virtualization, and local Base UI/shadcn-style components.
- Effect is a T3 implementation detail. The architecture can be ported without
  Effect by replacing Effect services/queues/pubsub/cache with ordinary typed
  services, async queues, event emitters, transactions, and TTL/LRU helpers.

Sources:

- `references/t3code/package.json`
- `references/t3code/apps/web/package.json`
- `references/t3code/apps/server/package.json`
- `references/t3code/packages/contracts/package.json`
- `references/t3code/packages/shared/package.json`

## Stack Choices

Root/tooling:

| Area                    | T3Code choice                                                 |
| ----------------------- | ------------------------------------------------------------- |
| Runtime/package manager | Bun                                                           |
| Monorepo                | Bun workspaces plus Turborepo                                 |
| Language                | TypeScript, ESM                                               |
| Lint/format             | `oxlint`, `oxfmt`                                             |
| Tests                   | Vitest, Effect Vitest helpers, browser Vitest with Playwright |
| Builds                  | Vite for web, `tsdown` for server/packages                    |

Frontend:

| Area                   | Libraries                                                 |
| ---------------------- | --------------------------------------------------------- |
| App                    | React 19, React DOM, Vite                                 |
| Routing                | `@tanstack/react-router`                                  |
| Server-side reads      | `@tanstack/react-query`                                   |
| Debounce/throttle      | `@tanstack/react-pacer`                                   |
| Projection/draft state | Zustand                                                   |
| Small shared atoms     | `@effect/atom-react`                                      |
| UI primitives          | `@base-ui/react`                                          |
| UI style helpers       | Tailwind v4, `class-variance-authority`, `tailwind-merge` |
| Icons                  | `@phosphor-icons/react`                                   |
| Composer editor        | Lexical, `@lexical/react`                                 |
| Chat timeline          | `@legendapp/list`                                         |
| Markdown               | `react-markdown`, `remark-gfm`                            |
| Diff/highlight         | `@pierre/diffs`, local LRU                                |
| Terminal               | `@xterm/xterm`, `@xterm/addon-fit`                        |
| Animation              | `@formkit/auto-animate`                                   |

Backend:

| Area                   | Libraries                                                        |
| ---------------------- | ---------------------------------------------------------------- |
| Runtime architecture   | `effect` services/layers/streams/cache                           |
| Platform adapters      | `@effect/platform-node`, `@effect/platform-bun`                  |
| RPC/schema             | `effect/Schema`, `effect/unstable/rpc` through contracts         |
| Persistence            | SQLite through Effect SQL plus custom migrations                 |
| Providers              | Claude SDK, OpenCode SDK, Codex app-server package, ACP adapters |
| Terminal               | `node-pty`                                                       |
| Diffing                | `@pierre/diffs`                                                  |
| Desktop/browser launch | `open`                                                           |

UI component decision:

- T3Code builds local shadcn-style components in `apps/web/src/components/ui`.
- Those wrappers use Base UI primitives, Tailwind, CVA, `tailwind-merge`, and
  Lucide icons.
- It does not rely on a large external component kit for chat. For Platform, we
  should use our existing shadcn/Base UI components and copy T3 behavior, data
  flow, and component boundaries.

Sources:

- `references/t3code/apps/web/src/components/ui/button.tsx`
- `references/t3code/apps/web/src/components/ui/dialog.tsx`
- `references/t3code/apps/web/src/components/ui/menu.tsx`
- `references/t3code/apps/web/src/components/ui/popover.tsx`
- `references/t3code/apps/web/src/components/ui/select.tsx`
- `references/t3code/apps/web/src/components/ui/sidebar.tsx`
- `references/t3code/apps/web/src/components/ui/tooltip.tsx`

## Backend Architecture

T3Code backend responsibilities:

- serve HTTP and WebSocket RPC
- own auth/session/bootstrap credentials
- own provider instance settings and live provider registry
- own orchestration command dispatch
- persist event store, command receipts, projections, provider runtime sessions,
  auth sessions, pairing links, pending approvals, proposed plans, checkpoints,
  and attachments
- publish shell/detail streams to the web app
- manage terminal PTYs
- manage Git/checkpoint workflows
- record observability/metrics/traces

The core orchestration loop:

1. UI sends a typed command.
2. Orchestration engine serializes command handling through a queue.
3. Command receipt repository dedupes already-accepted commands.
4. Decider reads the hot in-memory read model.
5. Decider emits one or more domain events.
6. Server appends events to SQLite event store.
7. Server applies the in-memory projector.
8. Server applies durable projection tables.
9. Server upserts command receipt.
10. Server publishes committed events to live subscribers.

Why this matters:

- The UI does not invent durable chat state.
- Reconnect/replay is possible because event store and projections are durable.
- Command side effects are isolated in reactors and provider runtime services.
- Projections make snapshots cheap enough for sidebar and thread switching.

Sources:

- `references/t3code/apps/server/src/server.ts`
- `references/t3code/apps/server/src/http.ts`
- `references/t3code/apps/server/src/ws.ts`
- `references/t3code/apps/server/src/orchestration/Layers/OrchestrationEngine.ts`
- `references/t3code/apps/server/src/orchestration/decider.ts`
- `references/t3code/apps/server/src/orchestration/projector.ts`
- `references/t3code/apps/server/src/persistence/Layers/OrchestrationEventStore.ts`
- `references/t3code/apps/server/src/persistence/Layers/OrchestrationCommandReceipts.ts`

## Event Store And Projections

The event store is truth. Projection tables are rebuildable caches over that
truth.

Important tables:

- `orchestration_events`
- `orchestration_command_receipts`
- `projection_projects`
- `projection_threads`
- `projection_thread_messages`
- `projection_thread_activities`
- `projection_thread_sessions`
- `projection_thread_proposed_plans`
- `projection_turns`
- `projection_pending_approvals`
- `projection_state`
- `provider_session_runtime`

Important projection decisions:

- Each projector tracks `lastAppliedSequence` in `projection_state`.
- Snapshot sequence is derived from projection state, so clients can reject stale
  snapshots/events.
- Thread shell summary fields are cached on `projection_threads`.
- Thread projector runs after message/activity/session/turn/approval projectors
  because shell summaries depend on those tables.
- Revert deletes/prunes projected messages, activities, plans, turns, and
  attachment materialization beyond the chosen point.

Thread shell summary fields:

- `latest_user_message_at`
- `pending_approval_count`
- `pending_user_input_count`
- `has_actionable_proposed_plan`

Sources:

- `references/t3code/apps/server/src/persistence/Migrations/001_OrchestrationEvents.ts`
- `references/t3code/apps/server/src/persistence/Migrations/002_OrchestrationCommandReceipts.ts`
- `references/t3code/apps/server/src/persistence/Migrations/004_ProviderSessionRuntime.ts`
- `references/t3code/apps/server/src/persistence/Migrations/005_Projections.ts`
- `references/t3code/apps/server/src/persistence/Migrations/013_ProjectionThreadProposedPlans.ts`
- `references/t3code/apps/server/src/persistence/Migrations/019_ProjectionSnapshotLookupIndexes.ts`
- `references/t3code/apps/server/src/persistence/Migrations/023_ProjectionThreadShellSummary.ts`
- `references/t3code/apps/server/src/orchestration/Layers/ProjectionPipeline.ts`
- `references/t3code/apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.ts`

## Shell And Detail Streams

T3Code uses two stream shapes.

Shell stream:

- sends `getShellSnapshot()` first
- then sends project/thread shell upserts or removals
- powers sidebar and global navigation
- does not carry full message histories

Thread detail stream:

- sends `getThreadDetailById(threadId)` first
- then sends only thread-detail events for that thread
- powers active chat timeline, activities, proposed plans, and turn diffs

Detail event types include:

- `thread.message-sent`
- `thread.proposed-plan-upserted`
- `thread.activity-appended`
- `thread.turn-diff-completed`
- `thread.reverted`
- `thread.session-set`

Copy this split. It is the most important boundary for a fast side panel: the
sidebar stays cheap, and active/prewarmed threads get full detail.

Sources:

- `references/t3code/apps/server/src/ws.ts`
- `references/t3code/apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.ts`
- `references/t3code/apps/web/src/environments/runtime/service.ts`
- `references/t3code/apps/web/src/store.ts`

## Provider And Runtime Model

T3Code splits provider concepts:

- driver kind: implementation family, such as Codex, Claude, Cursor, OpenCode,
  ACP
- provider instance ID: configured routing identity, useful for multiple
  accounts/aliases
- model selection: selected model/options for a turn or composer
- provider session runtime: durable binding from thread to provider runtime

Runtime modes are first-class:

- full access: permissive runtime, no approval flow
- supervised/workspace style modes: sandbox plus approvals

Provider services:

- keep live provider instances in a registry
- hydrate cached provider status from disk for fast UI startup
- reconcile provider settings into live instances
- persist provider session runtime state
- ingest provider runtime events and convert them into orchestration commands
- react to orchestration commands by starting/stopping/responding to provider
  sessions

Provider runtime ingestion has transient bounded caches for streaming:

- assistant message IDs by turn
- buffered assistant text by message ID
- assistant segment state by turn
- buffered proposed plan text by plan ID

Important defaults:

- assistant/message/proposed-plan ingestion buffers use 120 minute TTLs
- max buffered assistant text before forced flush: `24_000` chars
- provider turn-start dedupe cache: `10_000` keys, `30 minutes`

Sources:

- `references/t3code/apps/server/src/provider/ProviderDriver.ts`
- `references/t3code/apps/server/src/provider/builtInDrivers.ts`
- `references/t3code/apps/server/src/provider/providerStatusCache.ts`
- `references/t3code/apps/server/src/provider/Layers/ProviderRegistry.ts`
- `references/t3code/apps/server/src/provider/Layers/ProviderInstanceRegistryLive.ts`
- `references/t3code/apps/server/src/provider/Layers/ProviderService.ts`
- `references/t3code/apps/server/src/provider/Layers/ProviderSessionDirectory.ts`
- `references/t3code/apps/server/src/persistence/Layers/ProviderSessionRuntime.ts`
- `references/t3code/apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts`
- `references/t3code/apps/server/src/orchestration/Layers/ProviderCommandReactor.ts`

## Chat Frontend Shape

Primary route/component flow:

- chat layout route renders shared chat shell/sidebar
- server thread route renders `ChatView`
- draft route renders local draft state until server thread exists
- `ChatView` owns current thread orchestration and connects composer, timeline,
  model/runtime state, pending approvals, terminal contexts, plan follow-ups,
  diff panels, optimistic user messages, and send failure recovery

State model:

- `store.ts`: normalized server projection cache by environment
- `composerDraftStore.ts`: local editable draft/composer state
- `uiStateStore.ts`: UI-only layout affordances
- `terminalStateStore.ts`: persisted resumable terminal state plus in-memory
  buffers
- `threadSelectionStore.ts`: selection affordances
- React Query: side reads only

Chat send flow:

1. Read current composer handle state.
2. Resolve prompt/images/terminal contexts/provider/model/runtime mode.
3. Handle pending user input, plan follow-up, slash commands, and empty cases.
4. Validate project/worktree requirements.
5. Snapshot local optimistic dispatch state.
6. Read images as data URLs.
7. Add optimistic user message.
8. Clear draft/composer state.
9. Create or promote thread if needed.
10. Dispatch `thread.turn.start`.
11. On failure, remove optimistic message and restore draft content.

Sources:

- `references/t3code/apps/web/src/routes/_chat.tsx`
- `references/t3code/apps/web/src/routes/_chat.$environmentId.$threadId.tsx`
- `references/t3code/apps/web/src/routes/_chat.draft.$draftId.tsx`
- `references/t3code/apps/web/src/components/ChatView.tsx`
- `references/t3code/apps/web/src/components/ChatView.logic.ts`
- `references/t3code/apps/web/src/environmentApi.ts`
- `references/t3code/apps/web/src/environments/runtime/service.ts`
- `references/t3code/apps/web/src/rpc/wsRpcClient.ts`
- `references/t3code/apps/web/src/rpc/wsTransport.ts`

## Composer

T3Code's composer is rich, but the important product choices can be copied in
smaller pieces.

Capabilities:

- provider/model picker
- provider slash commands and skills
- project file/folder mentions
- standalone slash commands
- runtime mode picker
- plan/build mode toggle
- context-window meter
- pending approval panel
- pending user-input panel
- proposed-plan follow-up banner
- image paste/drop attachments
- terminal context insertion
- send/stop/plan controls

Implementation:

- composer shell is React
- editor is Lexical plain text
- inline chips use custom DecoratorNodes
- composer logic maintains expanded text and collapsed chip cursor positions
- local draft state persists outside the projection store

Sources:

- `references/t3code/apps/web/src/components/chat/ChatComposer.tsx`
- `references/t3code/apps/web/src/components/ComposerPromptEditor.tsx`
- `references/t3code/apps/web/src/components/chat/ComposerCommandMenu.tsx`
- `references/t3code/apps/web/src/components/chat/ComposerPendingApprovalPanel.tsx`
- `references/t3code/apps/web/src/components/chat/ComposerPendingUserInputPanel.tsx`
- `references/t3code/apps/web/src/components/chat/ComposerPlanFollowUpBanner.tsx`
- `references/t3code/apps/web/src/components/chat/ComposerPrimaryActions.tsx`
- `references/t3code/apps/web/src/components/chat/ProviderModelPicker.tsx`
- `references/t3code/apps/web/src/components/composerInlineChip.ts`
- `references/t3code/apps/web/src/composerDraftStore.ts`

## Timeline And Markdown

Timeline:

- virtualized with `@legendapp/list`
- derives rows outside JSX in logic files
- keeps row-level expansion local where possible
- supports user messages, assistant messages, proposed plans, work logs,
  changed files, working indicators, and completion dividers
- uses stable item rendering and scroll-at-end behavior for streaming chat

Markdown:

- uses `react-markdown` plus `remark-gfm`
- customizes code blocks, copy buttons, file links, URL handling, and file icons
- uses `@pierre/diffs` highlighter
- caches highlighted code with a local LRU
- does not cache streaming code blocks

Sources:

- `references/t3code/apps/web/src/components/chat/MessagesTimeline.tsx`
- `references/t3code/apps/web/src/components/chat/MessagesTimeline.logic.ts`
- `references/t3code/apps/web/src/components/chat/ChangedFilesTree.tsx`
- `references/t3code/apps/web/src/components/chat/MessageCopyButton.tsx`
- `references/t3code/apps/web/src/components/ChatMarkdown.tsx`
- `references/t3code/apps/web/src/components/DiffWorkerPoolProvider.tsx`
- `references/t3code/apps/web/src/lib/lruCache.ts`

## Frontend Caching

Projection store:

- normalized Zustand store
- scoped by environment
- separate shell and detail writers
- caps large per-thread arrays
- preserves detail state when shell snapshots still include a thread
- removes scoped state when threads disappear

Important state slices:

- `projectById`
- `threadShellById`
- `threadIdsByProjectId`
- `threadSessionById`
- `threadTurnStateById`
- `messageByThreadId`
- `messageIdsByThreadId`
- `activityByThreadId`
- `activityIdsByThreadId`
- `proposedPlanByThreadId`
- `turnDiffSummaryByThreadId`
- `sidebarThreadSummaryById`

Thread detail subscription cache:

- ref-counted retain/release API
- max cached detail subscriptions: `32`
- idle eviction: `15 minutes`
- protects running/pending/actionable threads from eviction
- sidebar prewarms first `10` visible thread details

React Query:

- project search entries: 15s stale time
- checkpoint diff: infinite stale time by immutable range
- Git branch search: 15s stale time, 60s refetch interval
- PR resolve: 30s stale time
- filesystem browse and app updates use query-specific caches
- provider/project query invalidation is throttled by 100ms

Local persistence:

- composer drafts: versioned, debounced 300ms, flush on unload
- UI state: debounced 500ms
- terminal state: persisted resumable state, in-memory event buffer cap 200
- settings: client snapshot plus server config atoms/events

Sources:

- `references/t3code/apps/web/src/store.ts`
- `references/t3code/apps/web/src/storeSelectors.ts`
- `references/t3code/apps/web/src/environments/runtime/service.ts`
- `references/t3code/apps/web/src/components/Sidebar.logic.ts`
- `references/t3code/apps/web/src/components/Sidebar.tsx`
- `references/t3code/apps/web/src/lib/projectReactQuery.ts`
- `references/t3code/apps/web/src/lib/providerReactQuery.ts`
- `references/t3code/apps/web/src/lib/gitReactQuery.ts`
- `references/t3code/apps/web/src/components/CommandPalette.tsx`
- `references/t3code/apps/web/src/lib/storage.ts`
- `references/t3code/apps/web/src/composerDraftStore.ts`
- `references/t3code/apps/web/src/uiStateStore.ts`
- `references/t3code/apps/web/src/terminalStateStore.ts`
- `references/t3code/apps/web/src/hooks/useSettings.ts`
- `references/t3code/apps/web/src/rpc/serverState.ts`

## Backend Caching

T3Code uses bounded caches for specific IO/runtime problems, not as a substitute
for event truth.

Important backend caches:

| Area                      | Cache behavior                                               |
| ------------------------- | ------------------------------------------------------------ |
| SQLite statements         | capacity 200, TTL 10 minutes                                 |
| Provider status           | per-provider-instance JSON files under cache dir             |
| Provider instances        | live instance map, reconciled from settings                  |
| Claude capability probe   | keyed by binary plus resolved HOME, TTL 5 minutes            |
| Provider stream ingestion | bounded per-turn/message/plan buffers                        |
| Provider command reactor  | recent turn-start dedupe, 30 minute TTL                      |
| Git status                | local/remote status caches, 1 second TTL, no failure caching |
| Git upstream fetch        | throttle by git common dir and remote, 15 second interval    |
| Git status broadcaster    | local/remote fingerprints avoid duplicate publishes          |
| Workspace entries         | workspace index TTL 15s, max 4 workspaces, max 25k entries   |
| Repository identity       | capacity 512, positive/negative TTL 1 minute                 |
| Keybindings               | resolved config cache, capacity 1, watcher debounce 100ms    |

The consistent rule: every cache has a TTL, capacity, explicit invalidation
path, version boundary, or some combination of those.

Sources:

- `references/t3code/apps/server/src/persistence/NodeSqliteClient.ts`
- `references/t3code/apps/server/src/provider/providerStatusCache.ts`
- `references/t3code/apps/server/src/provider/Layers/ProviderRegistry.ts`
- `references/t3code/apps/server/src/provider/Layers/ProviderInstanceRegistryLive.ts`
- `references/t3code/apps/server/src/provider/Drivers/ClaudeDriver.ts`
- `references/t3code/apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts`
- `references/t3code/apps/server/src/orchestration/Layers/ProviderCommandReactor.ts`
- `references/t3code/apps/server/src/git/Layers/GitManager.ts`
- `references/t3code/apps/server/src/git/Layers/GitCore.ts`
- `references/t3code/apps/server/src/git/Layers/GitStatusBroadcaster.ts`
- `references/t3code/apps/server/src/workspace/Layers/WorkspaceEntries.ts`
- `references/t3code/apps/server/src/workspace/Layers/WorkspaceFileSystem.ts`
- `references/t3code/apps/server/src/project/Layers/RepositoryIdentityResolver.ts`
- `references/t3code/apps/server/src/keybindings.ts`

## Checkpoints, Git, And Workspace

T3Code treats Git/checkpoints as part of the agent workflow.

Checkpoints:

- stored as hidden Git refs
- turn checkpoints are projected into thread state
- diffs are queryable by turn range
- checkpoint diff output is capped at 10MB
- frontend caches checkpoint diffs with infinite stale time because the range is
  immutable enough

Git:

- local and remote status are cached separately
- broadcaster streams local/remote status parts
- remote polling exists only while subscribers exist
- Git mutations invalidate status
- upstream fetches are throttled to avoid repeated network work

Workspace:

- workspace search uses a short-lived index
- prefers Git file listing, falls back to filesystem BFS
- ignores heavy dirs like `.git`, `node_modules`, `.next`, `.turbo`, `dist`,
  `build`, `out`, `.cache`
- direct directory browse does not use the workspace index cache

Sources:

- `references/t3code/apps/server/src/checkpointing/Layers/CheckpointStore.ts`
- `references/t3code/apps/server/src/checkpointing/Layers/CheckpointDiffQuery.ts`
- `references/t3code/apps/server/src/checkpointing/Utils.ts`
- `references/t3code/apps/server/src/orchestration/Layers/CheckpointReactor.ts`
- `references/t3code/apps/server/src/git/Layers/GitManager.ts`
- `references/t3code/apps/server/src/git/Layers/GitStatusBroadcaster.ts`
- `references/t3code/apps/server/src/git/Layers/GitCore.ts`
- `references/t3code/apps/server/src/workspace/Layers/WorkspaceEntries.ts`
- `references/t3code/apps/web/src/lib/providerReactQuery.ts`
- `references/t3code/apps/web/src/lib/gitReactQuery.ts`

## Constants To Lift First

| Area                                   | T3Code value                                |
| -------------------------------------- | ------------------------------------------- |
| thread detail idle eviction            | 15 minutes                                  |
| max cached thread detail subscriptions | 32                                          |
| sidebar thread detail prewarm          | 10 visible threads                          |
| max thread messages                    | 2,000                                       |
| max checkpoints                        | 500                                         |
| max proposed plans                     | 200                                         |
| max activities                         | 500                                         |
| project search stale time              | 15 seconds                                  |
| Git branch search stale time           | 15 seconds                                  |
| Git branch search refetch interval     | 60 seconds                                  |
| checkpoint diff stale time             | Infinity in React Query                     |
| composer persistence debounce          | 300ms                                       |
| UI persistence debounce                | 500ms                                       |
| terminal event buffer                  | 200                                         |
| markdown highlight cache               | 500 entries, 50MB                           |
| diff AST LRU                           | 240                                         |
| workspace index cache                  | 15s, 4 workspaces, 25k entries              |
| Git status cache                       | 1s, capacity 2,048                          |
| Git upstream refresh throttle          | 15s, 5s failure cooldown                    |
| repository identity cache              | 512 entries, 1 minute positive/negative TTL |
| SQLite statement cache                 | 200 entries, 10 minute TTL                  |
| provider turn-start dedupe             | 10,000 keys, 30 minute TTL                  |
| assistant stream buffer flush cap      | 24,000 chars                                |

## What Platform Should Copy

Build order:

1. Event store and command receipts.
2. Projection tables with `projection_state`.
3. Thread shell summary columns.
4. Shell snapshot/stream.
5. Thread detail snapshot/stream.
6. Normalized frontend projection store.
7. Ref-counted thread detail subscription cache.
8. Composer draft persistence.
9. Provider instance/session runtime model.
10. Checkpoints and diff query.
11. Git/workspace/provider status service caches.

Non-negotiable shape:

- backend is source of truth
- chat transcript is not React Query state
- sidebar receives shell state, not full detail
- active/prewarmed threads receive detail state
- pending approvals/user input are backend-owned facts
- provider instance ID is distinct from provider driver kind
- all large caches have bounds

## What Platform Should Not Copy Blindly

Do not copy Effect as a requirement.

| T3Code primitive               | Platform equivalent                                   |
| ------------------------------ | ----------------------------------------------------- |
| `Effect.Cache`                 | local TTL/LRU helper                                  |
| `Ref`                          | private service state plus mutex when needed          |
| `Queue`                        | async queue or serialized command runner              |
| `PubSub`                       | typed emitter/observable                              |
| `Stream`                       | async iterator, observable, or WebSocket subscription |
| `Semaphore`                    | mutex or concurrency limiter                          |
| `Scope`                        | explicit dispose lifecycle                            |
| Effect transaction composition | explicit SQLite transaction wrapper                   |

Do not copy these patterns:

- a giant `ChatView.tsx` as-is
- a giant `ChatComposer.tsx` as-is
- full chat transcript in React Query
- full thread detail in every sidebar row
- unbounded message/activity/subscription caches
- failure caching for transient IO paths
- provider/tool orchestration in frontend-only state

## Source Map

Stack and packages:

- `references/t3code/package.json`
- `references/t3code/apps/web/package.json`
- `references/t3code/apps/server/package.json`
- `references/t3code/packages/contracts/package.json`
- `references/t3code/packages/shared/package.json`

Frontend chat:

- `references/t3code/apps/web/src/routes/_chat.tsx`
- `references/t3code/apps/web/src/routes/_chat.$environmentId.$threadId.tsx`
- `references/t3code/apps/web/src/routes/_chat.draft.$draftId.tsx`
- `references/t3code/apps/web/src/components/ChatView.tsx`
- `references/t3code/apps/web/src/components/ChatView.logic.ts`
- `references/t3code/apps/web/src/components/chat/ChatComposer.tsx`
- `references/t3code/apps/web/src/components/ComposerPromptEditor.tsx`
- `references/t3code/apps/web/src/components/chat/MessagesTimeline.tsx`
- `references/t3code/apps/web/src/components/chat/MessagesTimeline.logic.ts`
- `references/t3code/apps/web/src/components/ChatMarkdown.tsx`

Frontend state and transport:

- `references/t3code/apps/web/src/store.ts`
- `references/t3code/apps/web/src/storeSelectors.ts`
- `references/t3code/apps/web/src/composerDraftStore.ts`
- `references/t3code/apps/web/src/uiStateStore.ts`
- `references/t3code/apps/web/src/terminalStateStore.ts`
- `references/t3code/apps/web/src/environmentApi.ts`
- `references/t3code/apps/web/src/environments/runtime/service.ts`
- `references/t3code/apps/web/src/rpc/wsRpcClient.ts`
- `references/t3code/apps/web/src/rpc/wsTransport.ts`
- `references/t3code/apps/web/src/rpc/serverState.ts`

Frontend query/cache helpers:

- `references/t3code/apps/web/src/lib/projectReactQuery.ts`
- `references/t3code/apps/web/src/lib/providerReactQuery.ts`
- `references/t3code/apps/web/src/lib/gitReactQuery.ts`
- `references/t3code/apps/web/src/lib/storage.ts`
- `references/t3code/apps/web/src/lib/lruCache.ts`
- `references/t3code/apps/web/src/timestampFormat.ts`

Backend orchestration:

- `references/t3code/apps/server/src/orchestration/Layers/OrchestrationEngine.ts`
- `references/t3code/apps/server/src/orchestration/decider.ts`
- `references/t3code/apps/server/src/orchestration/projector.ts`
- `references/t3code/apps/server/src/orchestration/Layers/ProjectionPipeline.ts`
- `references/t3code/apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.ts`
- `references/t3code/apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts`
- `references/t3code/apps/server/src/orchestration/Layers/ProviderCommandReactor.ts`
- `references/t3code/apps/server/src/orchestration/Layers/CheckpointReactor.ts`
- `references/t3code/apps/server/src/orchestration/Layers/ThreadDeletionReactor.ts`

Backend persistence:

- `references/t3code/apps/server/src/persistence/NodeSqliteClient.ts`
- `references/t3code/apps/server/src/persistence/Layers/OrchestrationEventStore.ts`
- `references/t3code/apps/server/src/persistence/Layers/OrchestrationCommandReceipts.ts`
- `references/t3code/apps/server/src/persistence/Layers/ProjectionProjects.ts`
- `references/t3code/apps/server/src/persistence/Layers/ProjectionThreads.ts`
- `references/t3code/apps/server/src/persistence/Layers/ProjectionThreadMessages.ts`
- `references/t3code/apps/server/src/persistence/Layers/ProjectionThreadActivities.ts`
- `references/t3code/apps/server/src/persistence/Layers/ProjectionThreadSessions.ts`
- `references/t3code/apps/server/src/persistence/Layers/ProjectionThreadProposedPlans.ts`
- `references/t3code/apps/server/src/persistence/Layers/ProjectionTurns.ts`
- `references/t3code/apps/server/src/persistence/Layers/ProjectionPendingApprovals.ts`
- `references/t3code/apps/server/src/persistence/Layers/ProjectionState.ts`
- `references/t3code/apps/server/src/persistence/Layers/ProviderSessionRuntime.ts`

Backend providers/Git/workspace:

- `references/t3code/apps/server/src/provider/providerStatusCache.ts`
- `references/t3code/apps/server/src/provider/Layers/ProviderRegistry.ts`
- `references/t3code/apps/server/src/provider/Layers/ProviderInstanceRegistryLive.ts`
- `references/t3code/apps/server/src/provider/Layers/ProviderService.ts`
- `references/t3code/apps/server/src/provider/Layers/ProviderSessionDirectory.ts`
- `references/t3code/apps/server/src/git/Layers/GitManager.ts`
- `references/t3code/apps/server/src/git/Layers/GitStatusBroadcaster.ts`
- `references/t3code/apps/server/src/git/Layers/GitCore.ts`
- `references/t3code/apps/server/src/workspace/Layers/WorkspaceEntries.ts`
- `references/t3code/apps/server/src/workspace/Layers/WorkspaceFileSystem.ts`
- `references/t3code/apps/server/src/project/Layers/RepositoryIdentityResolver.ts`

Backend RPC/server/auth:

- `references/t3code/apps/server/src/server.ts`
- `references/t3code/apps/server/src/http.ts`
- `references/t3code/apps/server/src/ws.ts`
- `references/t3code/apps/server/src/auth/Layers/ServerAuth.ts`
- `references/t3code/apps/server/src/auth/Layers/SessionCredentialService.ts`
- `references/t3code/apps/server/src/auth/Layers/BootstrapCredentialService.ts`
- `references/t3code/apps/server/src/auth/Layers/AuthControlPlane.ts`
