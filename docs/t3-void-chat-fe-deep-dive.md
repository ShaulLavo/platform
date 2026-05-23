# T3 And Void Chat FE Deep Dive

## Goal

Study how chat works in the two references:

- T3 Code: `references/t3code/apps/web`
- Void: `/Users/shaul/Desktop/editors/void/src/vs/workbench/contrib/void`

The goal is to understand the frontend architecture, message flow, UI state, and
library choices before building a Void-like side panel in Platform with a
T3-shaped backend, but without Effect.

## Executive Read

T3 and Void solve similar product problems with almost opposite frontend
architectures.

T3 is a web app where the frontend subscribes to backend-owned projections. The
chat UI is state-rich, but not provider-owning: React/Zustand renders thread
state, keeps local composer drafts, optimistically adds user messages, and sends
typed orchestration commands over WebSocket RPC. Provider execution, streaming,
approvals, checkpoints, turns, and diffs come from backend events.

Void is a VS Code fork where the frontend is a React island embedded inside a
workbench view. It has no separate backend projection layer for chat. The
renderer-side `IChatThreadService` owns persistent thread state, transient
streaming state, tool loops, tool approvals, checkpoints, and provider calls via
VS Code services. React mostly bridges service events into hooks and renders the
sidebar.

For Platform, the best direction is: use Void's sidebar workflow and compact
editor-native UX, but use T3's backend/source-of-truth shape. Do not copy Void's
provider/tool loop into React/service UI unless we intentionally want local-only
execution with weak separation.

## T3 Chat FE

### Entry Points

Primary files:

- `references/t3code/apps/web/src/routes/_chat.tsx`
- `references/t3code/apps/web/src/routes/_chat.$environmentId.$threadId.tsx`
- `references/t3code/apps/web/src/routes/_chat.draft.$draftId.tsx`
- `references/t3code/apps/web/src/components/ChatView.tsx`
- `references/t3code/apps/web/src/components/chat/ChatComposer.tsx`
- `references/t3code/apps/web/src/components/ComposerPromptEditor.tsx`
- `references/t3code/apps/web/src/components/chat/MessagesTimeline.tsx`
- `references/t3code/apps/web/src/components/ChatMarkdown.tsx`
- `references/t3code/apps/web/src/store.ts`
- `references/t3code/apps/web/src/composerDraftStore.ts`
- `references/t3code/apps/web/src/environmentApi.ts`
- `references/t3code/apps/web/src/environments/runtime/service.ts`
- `references/t3code/apps/web/src/rpc/wsRpcClient.ts`
- `references/t3code/apps/web/src/rpc/wsTransport.ts`

The thread route renders `ChatView` inside `SidebarInset`. The route also owns
right-side diff panel layout. Draft routes can render a local draft thread until
the server thread exists, then redirect to the canonical server thread route.

`ChatView.tsx` is the main owner. It is large because it combines current-thread
selection, draft promotion, send orchestration, optimistic messages, terminal
drawer wiring, model selection, runtime modes, plan follow-up, approvals, image
attachment handoff, and diff-sidebar controls.

### State Model

T3 uses Zustand for app state:

- `store.ts` is server projection state, normalized by environment.
- `composerDraftStore.ts` is local editable composer/draft state.
- `uiStateStore.ts`, `terminalStateStore.ts`, `threadSelectionStore.ts`, and
  command palette/settings stores hold UI-only state.

`store.ts` has an important split:

- The shell stream owns sidebar summaries and coarse thread shell/session/turn
  state.
- Per-thread detail streams own messages, activities, proposed plans, and turn
  diff summaries.
- Both streams can write shell/session/turn fields, but structural equality
  avoids noisy re-renders.

This is a good decision. It lets the sidebar subscribe to cheap all-thread
state, while the active chat subscribes to expensive detail state.

`composerDraftStore.ts` persists editable state into local storage through
Zustand middleware:

- prompt text
- image attachments and attempted persisted attachment data URLs
- terminal contexts
- per-provider or per-instance model selections
- active provider
- runtime mode and interaction mode
- pre-thread draft sessions keyed by `DraftId`
- real-thread composer state keyed by scoped environment/thread refs

The draft store is also responsible for draft-to-server promotion bookkeeping.

### Transport

T3's current web transport is Effect RPC over WebSocket, wrapped into frontend
promise APIs:

- `WsTransport` creates and reconnects RPC sessions.
- `createWsRpcClient` exposes grouped APIs: terminal, projects, filesystem, git,
  server, and orchestration.
- `environmentApi.ts` adapts the RPC client into `EnvironmentApi`.
- `ChatView` calls `readEnvironmentApi(environmentId)`.

For chat, the key orchestration APIs are:

- `dispatchCommand`
- `subscribeShell`
- `subscribeThread`
- `getTurnDiff`
- `getFullThreadDiff`

For Platform without Effect, the same shape can be implemented with Elysia/Eden
or plain WebSocket messages: one typed command endpoint, one shell projection
stream, and one thread detail stream.

### Thread Subscription Lifecycle

`ChatView` retains the detail subscription only for server-backed routes:

```ts
return retainThreadDetailSubscription(environmentId, threadId);
```

`retainThreadDetailSubscription` keeps a ref-counted per-thread subscription.
Released subscriptions stay warm for an idle TTL, and active/running/pending
threads are sticky. This avoids churn when switching around the UI while still
capping cached subscriptions.

When a thread detail event arrives, the runtime service applies it to the store.
When a detail snapshot arrives, it syncs the full server thread detail.

### Send Flow

The main send path is in `ChatView.tsx` `onSend`.

High-level flow:

1. Read current composer state through an imperative `ChatComposerHandle`.
2. Derive sendability from prompt text, images, and terminal contexts.
3. Handle special cases first:
   - pending user-input answer
   - plan follow-up
   - standalone slash commands like `/plan` or `/default`
   - empty prompt with expired terminal contexts
4. Validate active project and worktree/base-branch requirements.
5. Start a local dispatch snapshot so the UI shows busy state before server
   acknowledgement.
6. Snapshot images and terminal contexts.
7. Append terminal context text into the outgoing prompt.
8. Format provider/model/effort information into the outgoing user prompt.
9. Read image `File`s as data URLs.
10. Add an optimistic user message to the timeline.
11. Clear composer draft content and reset cursor state.
12. For first message, update title and optionally bootstrap a server thread or
    worktree.
13. Dispatch `thread.turn.start`.
14. On failure, remove the optimistic message, restore prompt/images/context,
    and write thread error.
15. Local busy state clears when server state acknowledges the turn.

The optimistic user message is local-only and reconciled against server message
ids once events arrive.

### Composer

T3's composer is not a simple textarea.

`ChatComposer.tsx` owns the composer shell:

- provider and model picker
- provider slash commands and skills
- project file/folder mentions via `@`
- standalone slash commands
- runtime mode picker
- build/plan mode toggle
- context-window meter
- pending approval panel
- pending user-input panel
- proposed plan follow-up banner
- image paste/drop attachments
- terminal-context insertion
- send/stop/plan action controls

The actual editor is `ComposerPromptEditor.tsx`, built on Lexical:

- `LexicalComposer`
- `PlainTextPlugin`
- `ContentEditable`
- `OnChangePlugin`
- `HistoryPlugin`
- custom `DecoratorNode`s for file mentions, provider skills, and terminal
  context chips

The editor keeps two cursor coordinate systems:

- Expanded text: actual prompt text, where `@path` and `$skill` are full
  strings.
- Collapsed text: inline token chips count as one unit in the UI.

That is why `composer-logic.ts` has helpers like:

- `expandCollapsedComposerCursor`
- `collapseExpandedComposerCursor`
- `detectComposerTrigger`
- `replaceTextRange`
- `parseStandaloneComposerSlashCommand`

Key UX decisions:

- `Enter` submits, `Shift+Enter` inserts a newline.
- `Tab` and arrow keys drive command/mention menus when open.
- `Shift+Tab` toggles interaction mode.
- Selected text can be wrapped with paired characters.
- Backspace removes inline token chips cleanly.
- Paste/drop attaches images if the clipboard/drop contains files.

Libraries used directly by chat composer:

- Lexical and `@lexical/react`
- TanStack Query for project entry search
- TanStack Pacer for debounce
- Zustand draft store
- Base UI wrappers in local UI components
- Lucide icons

### Model And Provider Picker

The composer is provider-instance aware. It does not just pick a provider kind.
It derives instance entries from server provider status, then resolves:

- current active instance
- locked provider if the thread has already started
- selected model
- model options
- provider traits
- provider slash commands
- provider skills

This matches T3's backend decision to split provider driver kind from provider
instance id. Platform should keep that split if users can have multiple
accounts or custom provider aliases.

### Timeline Rendering

`MessagesTimeline.tsx` uses `@legendapp/list/react` for a virtualized list with
scroll-at-end behavior:

- `initialScrollAtEnd`
- `maintainScrollAtEnd`
- `maintainVisibleContentPosition`
- a stable `renderItem`
- row context to avoid re-rendering every row on every stream chunk

Rows are derived in `MessagesTimeline.logic.ts`, not directly in JSX. Timeline
entries can be:

- user message
- assistant message
- proposed plan
- work log group
- working indicator
- completion divider

User messages render:

- text
- image attachments with expand preview
- terminal context inline chips
- copy button
- revert-to-message button when a checkpoint exists
- timestamp

Assistant messages render:

- markdown
- changed-files section
- copy button
- live timestamp/elapsed while streaming
- completion summary divider

Work log rows group activities/tool calls and keep expansion local to the row.
Changed-files rows subscribe directly to UI state so expanding a tree does not
re-render the whole timeline.

### Markdown

T3 uses:

- `react-markdown`
- `remark-gfm`
- `@pierre/diffs` highlighter through `DiffsHighlighter`
- custom LRU cache for highlighted code

`ChatMarkdown.tsx` customizes:

- code block highlighting with Shiki-backed diff highlighter
- copy code buttons
- file links that can open/copy paths
- URL rewriting for markdown file URI links
- VS Code-style file icons

The markdown renderer is more robust than Void's and better suited to a web app.

### Approvals, User Input, Plans

T3 keeps approvals and pending user input as orchestration activities. The
frontend derives open pending requests from activities in `session-logic.ts`.

The composer changes shape when there is:

- an active approval request
- an active user-input request
- an actionable proposed plan

Responding to these states dispatches backend commands:

- `thread.approval.respond`
- `thread.user-input.respond`
- plan follow-up via `thread.turn.start`
- plan implementation in a new thread via `thread.create` then `thread.turn.start`

The key decision: pending approvals are backend-owned facts, not local modal
state.

### What T3 Uses

Chat-relevant T3 frontend libraries:

| Area | Library |
| --- | --- |
| App | React 19, Vite |
| Routing | `@tanstack/react-router` |
| Server/cache queries | `@tanstack/react-query` |
| Debounce/throttle | `@tanstack/react-pacer` |
| Projection/draft state | Zustand |
| Rich prompt editor | Lexical, `@lexical/react` |
| Virtualized chat list | `@legendapp/list` |
| UI primitives | `@base-ui/react`, local wrappers |
| Icons | `lucide-react` |
| Markdown | `react-markdown`, `remark-gfm` |
| Highlight/diff | `@pierre/diffs` |
| Terminal | `@xterm/xterm`, `@xterm/addon-fit` |
| Styling | Tailwind v4, `tailwind-merge`, CVA |
| Drag/reorder elsewhere | `@dnd-kit/*` |
| Tests | Vitest, Playwright browser tests, MSW |

Effect is present in the web app mainly because contracts/RPC/schema/runtime
are Effect-based. The UI decisions do not require Effect.

## Void Chat FE

### Entry Points

Primary files:

- `/Users/shaul/Desktop/editors/void/src/vs/workbench/contrib/void/browser/sidebarPane.ts`
- `/Users/shaul/Desktop/editors/void/src/vs/workbench/contrib/void/browser/sidebarActions.ts`
- `/Users/shaul/Desktop/editors/void/src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/index.tsx`
- `/Users/shaul/Desktop/editors/void/src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/Sidebar.tsx`
- `/Users/shaul/Desktop/editors/void/src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/SidebarChat.tsx`
- `/Users/shaul/Desktop/editors/void/src/vs/workbench/contrib/void/browser/react/src/util/services.tsx`
- `/Users/shaul/Desktop/editors/void/src/vs/workbench/contrib/void/browser/react/src/util/inputs.tsx`
- `/Users/shaul/Desktop/editors/void/src/vs/workbench/contrib/void/browser/chatThreadService.ts`
- `/Users/shaul/Desktop/editors/void/src/vs/workbench/contrib/void/browser/convertToLLMMessageService.ts`
- `/Users/shaul/Desktop/editors/void/src/vs/workbench/contrib/void/common/prompt/prompts.ts`
- `/Users/shaul/Desktop/editors/void/src/vs/workbench/contrib/void/browser/react/src/markdown/ChatMarkdownRender.tsx`
- `/Users/shaul/Desktop/editors/void/src/vs/workbench/contrib/void/browser/react/src/markdown/ApplyBlockHoverButtons.tsx`

`sidebarPane.ts` registers a native workbench view container in the Auxiliary
Bar and mounts React into a `ViewPane` body.

`mountFnGenerator.tsx` registers service access, creates a React root, renders
`Sidebar`, and disposes services/root when the pane unmounts.

`Sidebar.tsx` only applies scoped Void styling and renders `SidebarChat` inside
an error boundary.

### React-Service Bridge

Void's React does not use Zustand, Query, or Router. It bridges VS Code
singleton services into React:

- `_registerServices(accessor)` grabs service instances.
- Module-level variables cache latest service state.
- Service event listeners update those variables.
- Hooks subscribe React components to listener sets.

Important hooks:

- `useAccessor`
- `useChatThreadsState`
- `useChatThreadsStreamState`
- `useFullChatThreadsStreamState`
- `useSettingsState`
- `useActiveURI`
- `useCommandBarState`
- `useIsDark`
- `useMCPServiceState`

This works inside VS Code because services are already the application model.
It would be a poor fit as-is for Platform if our backend owns chat state.

### Chat Thread Service

`chatThreadService.ts` is Void's chat source of truth.

Persistent state:

- `allThreads`
- `currentThreadId`
- each thread's messages
- per-thread staging selections
- focused edited message index
- code-span link cache
- current checkpoint index
- file snapshots for checkpoints

Transient stream state:

- undefined or idle
- LLM streaming with display content, reasoning, and partial tool call
- tool running with tool info and interrupt promise
- awaiting user approval
- error

The service persists threads to VS Code application storage under
`THREAD_STORAGE_KEY`. Stream state is explicitly not persisted.

### Sidebar Chat Component

`SidebarChat.tsx` is a large monolithic renderer. It owns:

- textarea refs and imperative textarea helpers
- current thread lookup
- current stream state lookup
- staging selection chips
- message list rendering
- streaming assistant message rendering
- generated tool preview rendering
- stop/send controls
- landing page suggestions
- previous-thread list
- mode/model/reasoning controls
- approval buttons for tool requests
- edit-message UI
- checkpoint UI
- tool result UI
- accept/reject UI for edits

The component calls service methods:

- `addUserMessageAndStreamResponse`
- `editUserMessageAndStreamResponse`
- `abortRunning`
- `approveLatestToolRequest`
- `rejectLatestToolRequest`
- `setCurrentThreadState`
- `setCurrentMessageState`
- `setCurrentlyFocusedMessageIdx`

### Composer

Void's composer is intentionally simpler than T3's:

- native `<textarea>`
- auto-height up to 500px
- `Enter` submits
- `Shift+Enter` inserts newline
- `Escape` aborts while running
- `@` opens a mention menu
- backspace at start removes staged selection chips
- model dropdown, chat mode dropdown, and reasoning controls live in the footer

`VoidInputBox2` implements the textarea and mention menu.

The mention menu uses `@floating-ui/react` and a simple option tree:

- first level: files or folders
- search uses `toolsService.callTool.search_pathnames_only`
- selected file/folder becomes a `StagingSelectionItem`
- the inserted textual mention is just the abbreviated name; the real context is
  stored in staging selections, not inline rich text

Void uses staging chips outside the textarea rather than inline rich editor
tokens. That is a simpler product choice and probably the right first version
for Platform's side panel.

### Selection Context

Void context objects are:

- File selection
- Code selection with line range
- Folder selection

`Cmd/Ctrl+L` is registered in `sidebarActions.ts`:

1. Read active editor and model.
2. If there is a non-empty selection, round it to whole lines.
3. Open the Void sidebar.
4. Add `CodeSelection` for selected lines, or `File` for current file.
5. Focus current chat.

`chat_userMessageContent` turns staged selections into the LLM-facing user
message:

- code selection: full file path plus selected lines in a fenced code block
- file: full path plus file contents
- folder: directory tree plus sampled child file contents

The message stored for display and the message sent to the LLM are different:

- `displayContent`: user's raw instructions
- `content`: instructions plus `SELECTIONS` payload

This distinction is worth copying.

### Message Flow

Void send flow:

1. `SidebarChat` reads textarea value.
2. It calls `chatThreadsService.addUserMessageAndStreamResponse`.
3. The service aborts any existing run in the same thread.
4. If this is the first message, it inserts a checkpoint first.
5. It converts staged selections into the LLM-facing user content.
6. It appends a user message to persistent thread state.
7. It clears the current checkpoint marker.
8. It starts `_runChatAgent`.
9. React updates from service state events.

The agent loop:

1. Capture model selection and options from settings.
2. Convert Void chat messages into provider-specific LLM messages through
   `IConvertToLLMMessageService`.
3. Call `ILLMMessageService.sendLLMMessage`.
4. On streaming text, update transient stream state.
5. On final message, append assistant message to persistent history.
6. If the assistant emitted a tool call, run or request approval for the tool.
7. Append tool result to persistent history.
8. Repeat the loop so the LLM can observe the tool result.
9. End with a checkpoint unless waiting for user approval.

Void does local retries around provider errors. If retries are exhausted, it
persists the partial assistant message and stores stream error state.

### Tool Calls And Approvals

Void's tool system is frontend/service-owned:

- tool calls are parsed from model output or provider tool format
- params are validated in `IToolsService`
- edit tools create checkpoints before edits
- risky tools can require approval
- approval is represented as a `tool_request` message at the end of the thread
- accept/reject buttons call service methods
- approved requests restart the agent loop with `callThisToolFirst`

Built-in tool categories:

- reads/search/list/lint
- rewrite/edit file
- create/delete file or folder
- run terminal command
- persistent terminal open/run/kill
- MCP tools

Approval categories:

- edits
- terminal
- MCP tools

In Platform, this should mostly move to the backend. The UI should render pending
tool approvals and dispatch approval decisions, like T3.

### Checkpoints

Void stores checkpoint messages in the same thread message list. It inserts
checkpoints:

- before every user message
- before every LLM edit tool call
- after aborts/errors/completed runs as needed

Checkpoint messages contain file snapshots and user modifications. The UI can
jump to a checkpoint, restore file snapshots through editor services, and show
later messages as checkpoint ghosts.

T3's checkpoint model is cleaner for a backend-owned system because diffs and
turn checkpoints are queryable server-side. Void's UX around jump/revert is
still useful as a product reference.

### Markdown And Apply

Void uses `marked`, not `react-markdown`.

`ChatMarkdownRender.tsx`:

- tokenizes markdown with `marked.lexer`
- manually renders tokens into React
- supports code blocks
- detects a full file path on the first line of a code block
- wraps code blocks in `BlockCodeApplyWrapper` when apply is enabled
- links inline code spans to known workspace locations
- opens file/range on code-span click
- has lightweight/unfinished LaTeX handling

Apply uses `ApplyBlockHoverButtons.tsx` and editor services:

- copy buttons
- jump to file
- apply/reject buttons
- apply stream status
- edit-tool accept/reject buttons
- integration with command bar stream state

The approach is very VS Code-native. For Platform, use the concept of apply
blocks and file links, but prefer T3's markdown library stack unless we need
complete token-level control.

### What Void Uses

Chat-relevant Void frontend libraries:

| Area | Library/system |
| --- | --- |
| Shell | VS Code workbench `ViewPane`, Auxiliary Bar |
| React island | React 19, React DOM |
| State | VS Code singleton services plus custom React hook bridge |
| Input | native textarea |
| Menus/positioning | `@floating-ui/react` |
| Icons | `lucide-react` plus some hand-written SVG |
| Markdown | `marked` |
| Tooltips | `react-tooltip` |
| Styling | Tailwind compiled/scoped with `scope-tailwind`; VS Code CSS variables |
| Editor widgets | Monaco/VS Code text model, code editor, diff editor widgets |
| Provider calls | `ILLMMessageService` to main-process provider implementations |
| Providers | Anthropic, OpenAI, Ollama, Mistral, Google GenAI, Groq, vLLM/DeepSeek-style routes |
| MCP | `@modelcontextprotocol/sdk` |

Notably absent:

- no TanStack Query
- no TanStack Router
- no Zustand
- no Lexical
- no React Markdown
- no virtualized chat list

## Direct Comparison

| Concern | T3 | Void | Platform recommendation |
| --- | --- | --- | --- |
| Source of truth | Backend projections and events | Renderer service state | T3 style |
| Chat shell | Full web route | VS Code side panel | Void side panel UX |
| Composer | Lexical rich plain-text editor | Native textarea plus external chips | Start Void-simple, leave path to Lexical |
| Mentions | Inline chips inside editor | Staging chips outside textarea | Start with external chips |
| Message persistence | Backend event store/projections | VS Code application storage | Backend DB |
| Streaming | Backend events into store | Provider callbacks into service stream state | Backend event stream |
| Tool loop | Backend orchestration | Renderer service loop | Backend orchestration |
| Approvals | Backend pending activities | `tool_request` messages | Backend pending activities |
| Timeline | Virtualized LegendList | Plain scroll container | T3 for long threads |
| Markdown | `react-markdown` plus custom code/file links | `marked` manual token renderer | T3 base plus selected Void apply ideas |
| Checkpoints | Turn diff summaries/checkpoints from backend | Checkpoint messages with file snapshots | T3 backend model, Void UX inspiration |
| Provider selection | Provider instance/model/options from server status | Feature-specific settings service | Provider instance model, maybe feature defaults |
| Side panel lifecycle | Web route layout | Native view container | Platform-native side panel |

## Decisions To Carry Into Platform

Use T3's backend/frontend contract:

- typed commands
- shell projection stream
- thread detail stream
- normalized thread store
- local draft composer store
- optimistic user messages
- backend-owned turns, approvals, tools, checkpoints, and diffs

Use Void's side panel product shape:

- compact chat in side panel
- `Cmd/Ctrl+L` adds current file or selected lines to staged context
- staging chips above the textarea
- simple textarea first
- mode/model/reasoning controls in footer
- previous threads/history in landing state
- apply/code-block affordances
- file/code-span links that open editor locations

Do not copy:

- Void's monolithic `SidebarChat.tsx` shape
- Void's provider/tool loop in the UI layer
- Void's storage-as-chat-database approach
- T3's huge `ChatView.tsx` and `ChatComposer.tsx` file sizes
- T3's Effect RPC implementation

## Suggested Platform Shape

Frontend modules:

- `side-panel/chat-panel.tsx`: side panel shell and layout
- `chat-thread-view.tsx`: current thread renderer
- `chat-message-list.tsx`: virtualized or simple list, depending first-slice scope
- `chat-message-row.tsx`: row switch
- `chat-composer.tsx`: composer shell
- `chat-context-chip-list.tsx`: staged context chips
- `chat-context-picker.tsx`: `@` menu and search
- `chat-model-controls.tsx`: provider/model/reasoning/mode controls
- `chat-markdown.tsx`: markdown renderer
- `chat-approval-card.tsx`: pending tool approval UI
- `use-chat-thread.ts`: subscribe to thread detail
- `use-chat-shell.ts`: subscribe to sidebar/thread summaries
- `use-chat-composer-draft.ts`: local draft store hook

Backend API shape:

- `chat.command.dispatch`
- `chat.shell.subscribe`
- `chat.thread.subscribe`
- `chat.thread.create`
- `chat.turn.start`
- `chat.turn.interrupt`
- `chat.approval.respond`
- `chat.userInput.respond`
- `chat.diff.getTurn`
- `chat.diff.getFullThread`

First implementation slice:

1. Side panel shell with current-thread view.
2. Local composer draft store.
3. Textarea composer with staged file/selection chips.
4. Send user message to backend command.
5. Subscribe to backend thread stream.
6. Render user/assistant messages and streaming assistant text.
7. Add stop/interrupt.
8. Add pending approval card.
9. Add markdown code blocks with copy.
10. Add file/code links and apply affordances.

The first slice should not start with Lexical unless inline chips become a hard
requirement. Void proves external chips are enough for an initial side panel.

## Open Decisions

- Should Platform have one chat mode toggle like Void (`normal/gather/agent`) or
  T3's provider interaction mode (`default/plan`) plus runtime mode?
- Should model selection be global-per-feature like Void, per-thread like T3, or
  both with per-thread override?
- How much of T3's plan/proposed-plan UI should ship before the first side-panel
  chat?
- Should long threads use virtualization immediately, or can the first panel use
  a simple scroll container until message counts demand it?
- Should file/folder mention search be backend-powered from day one, or start
  with current file/current selection command only?
