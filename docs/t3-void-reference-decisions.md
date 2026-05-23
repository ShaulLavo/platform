# T3 And Void Reference Decisions

## Goal

Study `references/t3code` and `/Users/shaul/Desktop/editors/void` as reference
implementations for adding agent features to Platform.

The immediate product target is a Void-like side panel. The backend target is
T3's agent/session architecture, but implemented in Platform's stack without
Effect.

## Sources

T3 Code:

- `references/t3code/README.md`
- `references/t3code/AGENTS.md`
- `references/t3code/.docs/architecture.md`
- `references/t3code/.docs/provider-architecture.md`
- `references/t3code/.docs/workspace-layout.md`
- `references/t3code/.docs/runtime-modes.md`
- `references/t3code/package.json`
- `references/t3code/apps/web/package.json`
- `references/t3code/apps/server/package.json`
- `references/t3code/apps/server/src/ws.ts`
- `references/t3code/apps/web/src/rpc/*`
- `references/t3code/packages/contracts/src/*`
- `references/t3code/apps/server/src/provider/*`
- `references/t3code/apps/server/src/orchestration/*`
- `references/t3code/apps/server/src/persistence/*`

Void:

- `/Users/shaul/Desktop/editors/void/README.md`
- `/Users/shaul/Desktop/editors/void/VOID_CODEBASE_GUIDE.md`
- `/Users/shaul/Desktop/editors/void/package.json`
- `/Users/shaul/Desktop/editors/void/src/vs/workbench/contrib/void/*`
- `/Users/shaul/Desktop/editors/void/src/vs/workbench/contrib/void/browser/sidebarPane.ts`
- `/Users/shaul/Desktop/editors/void/src/vs/workbench/contrib/void/browser/sidebarActions.ts`
- `/Users/shaul/Desktop/editors/void/src/vs/workbench/contrib/void/browser/chatThreadService.ts`
- `/Users/shaul/Desktop/editors/void/src/vs/workbench/contrib/void/browser/editCodeService.ts`
- `/Users/shaul/Desktop/editors/void/src/vs/workbench/contrib/void/common/modelCapabilities.ts`
- `/Users/shaul/Desktop/editors/void/src/vs/workbench/contrib/void/common/voidSettingsTypes.ts`
- `/Users/shaul/Desktop/editors/void/src/vs/workbench/contrib/void/common/sendLLMMessageService.ts`
- `/Users/shaul/Desktop/editors/void/src/vs/workbench/contrib/void/electron-main/llmMessage/sendLLMMessage.impl.ts`

## T3 Code Decisions

T3 is not a `create-t3-app` reference. It is a local-first GUI for coding
agents.

Architectural choices:

- Bun monorepo with `apps/server`, `apps/web`, `apps/desktop`,
  `apps/marketing`, and shared packages.
- `apps/server` publishes the `t3` CLI, serves the web build, handles HTTP and
  WebSocket RPC, and coordinates agent sessions.
- `apps/web` is a React/Vite app that treats the backend as the source of truth
  for provider sessions, thread projections, terminal streams, Git status, and
  server settings.
- `apps/desktop` is an Electron shell that starts a scoped backend process and
  loads the shared web app.
- `packages/contracts` owns cross-boundary schemas and types. In T3 this uses
  `effect/Schema` and `effect/unstable/rpc`.
- `packages/shared` owns runtime utilities with explicit subpath exports. T3
  intentionally avoids barrel exports there.
- The current source uses Effect RPC over WebSocket at `/ws`. The older
  architecture docs still describe a simpler JSON-RPC-plus-push transport, but
  current code routes through `WsRpcGroup`, `RpcServer.toHttpEffectWebsocket`,
  and a client `WsTransport`.
- Orchestration is event-sourced. Runtime events become domain events, domain
  events update projections, and UI streams subscribe to snapshots plus live
  events.
- Async side effects are isolated behind workers/reactors: provider runtime
  ingestion, provider command reaction, checkpointing, thread deletion, and
  projection updates.
- Runtime milestones are made explicit with receipts and stream events instead
  of UI polling.
- Provider configuration splits driver kind from provider instance id. Driver
  kind is an open slug; provider instance id is the routing key. Unknown drivers
  should survive parsing and be marked unavailable at runtime.
- Runtime modes are first-class: full access maps to permissive sandbox and no
  approvals; supervised maps to workspace sandbox plus in-app approvals.
- The server has persistent SQLite-backed state for event store, projections,
  provider session runtime, auth sessions, pending approvals, checkpoints, and
  proposed plans.
- T3's Git/checkpointing model is part of the agent workflow, not a separate
  utility: turns capture checkpoints, diffs are queryable, and Git workflows can
  be driven from the agent UI.
- Auth exists even for a local app: bootstrap credentials, session credentials,
  pairing links, WebSocket tokens, and client session metadata.
- Observability is designed in: local trace files, OTLP endpoints, RPC timing,
  and server metrics.

## T3 Stack And Libraries

Root/tooling:

| Area | Choices |
| --- | --- |
| Package manager | Bun `1.3.11` |
| Monorepo | Bun workspaces plus Turborepo |
| Language | TypeScript, ESM |
| Lint/format | `oxlint`, `oxfmt` |
| Tests | Vitest, Effect Vitest helpers, browser Vitest with Playwright |
| Build | Vite for web, `tsdown` for packages/server/desktop |

`apps/web`:

| Area | Libraries |
| --- | --- |
| App/runtime | React 19, React DOM, Vite 8 |
| Routing/data | `@tanstack/react-router`, `@tanstack/react-query`, `@tanstack/react-pacer` |
| State | Zustand, `@effect/atom-react` |
| UI primitives | `@base-ui/react`, `class-variance-authority`, `tailwind-merge`, Tailwind v4 |
| Icons | `lucide-react` |
| Editor/input | Lexical, `@lexical/react` |
| Markdown | `react-markdown`, `remark-gfm` |
| Terminal | `@xterm/xterm`, `@xterm/addon-fit` |
| Lists/interaction | `@legendapp/list`, `@dnd-kit/*`, `@formkit/auto-animate` |
| Diffing | `@pierre/diffs` |
| Tests/mocks | Playwright, MSW, Vitest browser React |

`apps/server`:

| Area | Libraries |
| --- | --- |
| Effect runtime | `effect`, `@effect/platform-node`, `@effect/platform-bun` |
| RPC/schema | `effect/Schema`, `effect/unstable/rpc` through contracts |
| Persistence | `@effect/sql-sqlite-bun`, custom SQLite migrations |
| Agent/provider SDKs | `@anthropic-ai/claude-agent-sdk`, `@opencode-ai/sdk`, internal Codex app-server RPC package |
| Terminal | `node-pty` |
| Diffing | `@pierre/diffs` |
| Desktop/browser launch | `open` |
| Build/test | `tsdown`, Vitest, `@effect/vitest` |

Other packages/apps:

- `apps/desktop`: Electron, `electron-updater`, Effect.
- `apps/marketing`: Astro.
- `packages/contracts`: Effect schemas and branded types.
- `packages/client-runtime`: small typed runtime helpers.
- `packages/effect-acp`: Agent Client Protocol helpers.
- `packages/effect-codex-app-server`: Codex app-server RPC wrapper.

## Void Decisions

Void is a VS Code fork, not an extension. Most Void-specific code is under
`src/vs/workbench/contrib/void`.

Architectural choices:

- Integrate with VS Code by registering singleton services and workbench
  contributions.
- Keep process boundaries explicit: `browser/` runs in the renderer,
  `electron-main/` runs in the main process, and `common/` is shared.
- The sidebar is a native VS Code view container mounted in the Auxiliary Bar.
  `sidebarPane.ts` registers `workbench.view.void`, creates a `ViewPane`, and
  mounts React into the pane body.
- React is bundled separately because VS Code browser code cannot freely import
  `node_modules`. Void uses `scope-tailwind` and `tsup` to build scoped React
  islands into `browser/react/out`.
- The side panel is command-driven. `Cmd/Ctrl+L` opens chat and adds the active
  selection or file. `Cmd/Ctrl+Shift+L` opens a new chat. View-title actions
  expose history and settings. `Cmd/Ctrl+K` drives quick edit.
- UI state is service-backed. React reads VS Code services through an accessor
  bridge and subscribes to service events.
- LLM calls run in the main process. Browser code calls `ILLMMessageService`,
  which sends IPC to `LLMMessageChannel`, which calls provider implementations
  in `electron-main/llmMessage`.
- Void sends messages directly to providers instead of routing through a hosted
  backend, which supports local providers and avoids retaining user data.
- Provider/model settings are centralized in `voidSettingsService` and
  `modelCapabilities`.
- Model selection is per feature: Chat, Quick Edit, Autocomplete, Apply, and
  SCM can each pick different models.
- Chat modes are explicit: `normal`, `gather`, and `agent`. `normal` has no
  tools, `gather` has read-only tools, and `agent` has edit/terminal/MCP tools.
- Built-in tools include file reads, directory listing/tree, pathname search,
  content search, lint reads, file rewrite, search/replace edit, create/delete,
  one-shot terminal commands, and persistent terminal commands.
- Tool approvals are grouped by risk: edits, terminal, and MCP tools.
- Thread state is persistent, while stream state is transient. The thread
  service stores messages, staging selections, checkpoints, current focus, tool
  loop state, retry behavior, and interrupt handling.
- Context is staged into the composer as file, folder, or code-selection chips.
- Apply is split into Fast Apply and Slow Apply. Fast Apply asks the model for
  search/replace blocks. Slow Apply rewrites the target range/file.
- Edits are applied to VS Code text models, not directly to disk first. This
  keeps editor state, undo, dirty state, and review UI aligned.
- Diff review is based on `DiffArea` and `DiffZone` tracking. Streaming edits
  create zones that can later be accepted or rejected.
- Checkpoints are inserted before user messages and tool edits so the user can
  jump between states and visualize modifications.
- MCP support is integrated in the main process. MCP server tools are discovered
  and prefixed to avoid name collisions.

## Void Stack And Libraries

Root dependencies include the normal VS Code stack plus Void-specific AI and UI
packages:

| Area | Libraries |
| --- | --- |
| Shell/editor | Electron, VS Code workbench, Monaco/text model services |
| React islands | React, React DOM, Tailwind, `scope-tailwind`, `tsup` |
| UI helpers | `@floating-ui/react`, `lucide-react`, `react-tooltip`, `marked` |
| Provider SDKs | `@anthropic-ai/sdk`, `openai`, `ollama`, `@mistralai/mistralai`, `@google/genai`, `google-auth-library`, `groq-sdk` |
| MCP | `@modelcontextprotocol/sdk` |
| Terminal | `node-pty`, `@xterm/*` |
| Search/native/editor infra | `@vscode/ripgrep`, `@vscode/sqlite3`, `@vscode/spdlog`, `@vscode/tree-sitter-wasm`, `vscode-oniguruma`, `vscode-textmate`, `@parcel/watcher` |
| Build/test | Gulp, Webpack, ts-loader, ts-node, TypeScript, Mocha, Playwright |

Provider names in Void's settings model:

- Anthropic
- OpenAI
- DeepSeek
- Ollama
- vLLM
- OpenRouter
- OpenAI-Compatible
- Gemini
- Groq
- xAI
- Mistral
- LM Studio
- LiteLLM
- Google Vertex AI
- Microsoft Azure OpenAI
- AWS Bedrock through an OpenAI-compatible proxy

Model capability metadata tracks:

- context window
- reserved output token space
- system-message strategy
- tool-call format
- FIM support
- reasoning controls and reasoning output parsing
- cost metadata
- downloadable/local-model hints
- provider-specific payload additions

## What To Carry Into Platform

Use Void for the side-panel product shape, not for its VS Code integration
machinery.

Use T3 for backend boundaries, persistence, and agent orchestration, but not for
Effect.

Recommended Platform direction:

- Keep Platform's current Bun, Elysia, Eden, Valibot, React, Zustand, TanStack
  Query, and shared UI package stack.
- Add agent contracts to `packages/contracts` with Valibot schemas instead of
  Effect schemas.
- Use Elysia HTTP for unary calls and Elysia WebSocket routes for streams.
  Keep protocol messages explicit and versioned.
- Preserve T3's service boundaries: provider registry, provider sessions,
  orchestration engine, event store, projection queries, checkpointing, terminal
  manager, Git integration, and settings/auth.
- Replace Effect workers with small explicit async queues, `AbortController`,
  `EventTarget` or typed event emitters, and deterministic `drain()` helpers in
  tests.
- Use Drizzle/SQLite for the persistent event store and projections, since
  Platform already has Drizzle on the server.
- Adopt T3's provider instance split early: `driverKind` for implementation,
  `providerInstanceId` for routing.
- Start with Codex/T3-style external agent runtime orchestration. Defer Void's
  broad direct-LLM provider matrix until the side panel and session model are
  stable.
- Make runtime modes explicit from the first backend slice: full-access and
  supervised should be data, not UI-only toggles.
- Treat approvals as part of the domain model, not modal-only UI state.
- Use Void's composer ergonomics: staged file/folder/selection chips, current
  file insertion, focused thread input, interrupt, mode switch, model picker,
  and message/tool timeline.
- Defer Void's Fast Apply until after basic agent sessions, checkpoints, and
  diff review exist. Fast Apply depends on reliable file snapshots and review
  state.
- Do not port Void's `scope-tailwind`/`tsup` React island build. Platform is
  already a normal React app, so side-panel UI should be ordinary React
  components under the existing app and UI package rules.
- Do not port VS Code singleton/contribution architecture. Platform should use
  feature modules, hooks, and explicit app services.

## Suggested Feature Order

1. Side panel shell: right-side resizable panel, activity entry, commands,
   empty state, thread list affordance, and settings affordance.
2. Composer: text input, send/stop, mode switch, model display, staged context
   chips for file/folder/selection.
3. Backend skeleton: provider instance settings, thread create/list, send turn,
   stream events, interrupt, and terminal-safe cancellation.
4. Projection model: persisted threads, turns, messages, activities, tool
   requests, approvals, and session status.
5. Codex/T3 runtime integration: start/resume session, send turn, ingest
   runtime events, normalize into Platform events.
6. Checkpoints and diffs: turn-start/turn-end checkpoints, changed-file list,
   full-thread diff, per-turn diff.
7. Tool approvals: edit/terminal approval cards, approve/reject/always-allow,
   supervised mode wiring.
8. Void-like Apply and Quick Edit: search/replace apply, diff zones, accept and
   reject changes, then `Cmd/Ctrl+K`.
9. Broader provider/model settings: direct LLM providers, local providers, MCP,
   FIM/autocomplete, and feature-specific model selection.

## Open Decisions

- Transport: use Eden for unary server APIs plus custom WebSocket streams, or
  define one unified WebSocket RPC protocol for agent traffic.
- Persistence: one append-only orchestration event table plus projection tables,
  or simpler thread/message tables for the first slice with an event-store
  migration later.
- Provider scope: Codex-only first, or Codex plus Claude/OpenCode adapters from
  the first backend version.
- Model settings: T3-style provider instances first, Void-style direct provider
  model matrix later, or a combined settings surface from day one.
- Side panel placement: dedicated right panel like Void's Auxiliary Bar, or
  integrate into Platform's existing workspace activity/view system.
- Approval defaults: full-access by default like T3, or supervised by default
  for local editor safety.
