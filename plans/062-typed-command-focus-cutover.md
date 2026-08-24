# Plan 062: Cut Platform commands and focus over to one typed runtime

> **Executor instructions**: Read this plan completely before editing. Then read
> `/Users/shaul/Desktop/D/platform/AGENTS.md`, `PLAN.md`, the E3 section of
> `docs/editor-parity-implementation-plan.md`, and
> `/Users/shaul/.agents/skills/never-nester/SKILL.md`. Follow the steps in order,
> run every verification gate, and stop on any condition in **STOP conditions**.
> Work in the current worktree. Do not create a branch, worktree, commit, push,
> or PR unless the operator explicitly asks.
>
> This is a greenfield, migration-free cutover. Do not add an adapter that keeps
> the old and new dispatch/focus paths alive together, a deprecated export, a
> nullable/no-op provider, a persisted-state migration, or a timeout that calls
> focus successful without a matching DOM acknowledgement. Temporary compile
> breakage is acceptable only inside the atomic cutover step; that step must end
> with its structural grep and typecheck green.
>
> **Hard dependency**: plan 059 must be implemented and verified first. This
> plan consumes its single semantic settings-intent path, projected settings
> state, consolidated appearance provider, in-memory color-mode preview, and
> `mutationId`/`settled` result. It must not recreate `setSettingAsync`, call
> `mutateAsync` through a second path, restore command dispatch on palette
> highlight, or duplicate settings error reporting.
>
> **Drift check (run first after plan 059 lands)**:
>
> ```bash
> cd /Users/shaul/Desktop/D/platform
> git diff --stat bcd4a5b0 -- \
>   apps/web/src/App.tsx \
>   apps/web/src/app-keymap-controller.tsx \
>   apps/web/src/components/app-command-surface.tsx \
>   apps/web/src/components/app-runtime-content.tsx \
>   apps/web/src/components/app-workspace.tsx \
>   apps/web/src/components/command-palette.tsx \
>   apps/web/src/keymap \
>   apps/web/src/lib/focus \
>   apps/web/src/features/chat/components/chat-input.tsx \
>   apps/web/src/features/chat/hooks/use-attach-to-composer.ts \
>   apps/web/src/features/command-palette \
>   apps/web/src/features/editor/components \
>   apps/web/src/features/editor/hooks/use-dirty-tab-close.tsx \
>   apps/web/src/features/editor/utils/file-backed-document.ts \
>   apps/web/src/features/editor/utils/text-menu.ts \
>   apps/web/src/features/git/components/panel.tsx \
>   apps/web/src/features/logs/components/panel.tsx \
>   apps/web/src/features/menus \
>   apps/web/src/features/search/components \
>   apps/web/src/features/settings \
>   apps/web/src/features/terminal/components/panel.tsx \
>   apps/web/src/features/workbench \
>   apps/web/src/features/workspace \
>   apps/web/test/render.tsx \
>   apps/web/vitest.browser.config.ts \
>   packages/ui/src/components/command.tsx
> git status --short > /tmp/plan-062-before.txt
> git status --short -- \
>   apps/web/src apps/web/test apps/web/vitest.browser.config.ts \
>   packages/ui/src/components/command.tsx
> ```
>
> At planning time `HEAD` was `bcd4a5b0` and the Platform worktree was clean.
> Drift produced by a completed plan 059 is expected. Read its landed API and
> verify the semantic preconditions in Step 0. If any other in-scope dirty edit
> overlaps a symbol named below, STOP and ask the operator to reconcile
> ownership. Never revert, stash, overwrite, or format unrelated work.

## Status

- **State**: Blocked on plan 059; executable immediately after its semantic
  preflight passes
- **Priority**: P1
- **Effort**: XL
- **Risk**: HIGH — trusted-key suppression, multiple Editor mounts, shadow-DOM
  tree focus, floating UI, dirty close, and async persistence meet here
- **Depends on**: plan 059 complete and reconciled
- **Supersedes**: plan 058 in full; never execute 058 after this plan exists
- **Blocks**: plan 056 until it is rebased onto this bus; plan 057 until it is
  rebased onto this bus and FocusService; plan 061 should execute after both 060
  and 062 so its activation transaction has one typed caller boundary
- **Category**: architecture / correctness
- **Planned at**: Platform commit `bcd4a5b0`, 2026-08-24

## Outcome

After this plan:

1. `platformCommands` and `platformCommand()` remain the sole Platform command
   registry and lookup. Specs, default bindings, menus, palette rows, settings
   rows, inspection, and execution all derive from those same objects.
2. Every registered command declares a typed execution target, closed-union
   preconditions, sync/async behavior, and one undo category.
3. A non-React `CommandBus` performs one live inspection, resolves the exact
   target, dispatches typed work, returns a synchronous claim plus a
   non-rejecting completion, and records one settled wide event.
4. A non-React `FocusService` owns actual focus, registered targets, pending
   transitions, and acknowledged/rejected/superseded results. Requests never
   mutate ownership before a matching `focusin`.
5. Keyboard, palette, menus, and programmatic Platform calls share enablement
   and failure semantics. The native Editor keystroke path remains Editor-owned
   until plan 057's explicit takeover.
6. Async file/settings/focus work settles through the dispatch ticket. No
   command-local detached catch logs success before failure, and settings
   failures remain owned and reported once by plan 059's intent runtime.
7. Dirty close distinguishes immediate close, deferred dialog ownership, busy,
   and missing targets. Deferred means the exact dialog acknowledged focus, not
   that the user has already chosen Save or Discard.
8. Undo categories are enforceable metadata only. Editor `DocumentSession`
   keeps text history; this plan creates no Platform undo stack.

## Roadmap and execution order

The load-bearing requirements are:

- `PLAN.md:29-30` — add the typed CommandBus and replace focus counters and
  active-dispatch pointers with FocusService.
- `PLAN.md:58-63` — migrate editor/workspace command definitions; resolve
  editor/tree/search/terminal/palette/global targets; classify undo; prove
  disabled, focus, conflict, async-failure, and dirty-close behavior.
- `docs/editor-parity-implementation-plan.md:27` — do not build E3 parity on
  React-effect wiring scheduled for deletion.
- `docs/editor-parity-implementation-plan.md:35,115-133` — preserve the S1
  metadata registry and land CommandBus/FocusService before later E3 work.

Use this migration-free order:

1. Execute and verify plan 059.
2. Execute this plan as one command/focus cutover.
3. Reconcile and execute plan 056. Its chord machine dispatches this bus and
   suppresses a completed binding from `ticket.claimed`; it must not introduce
   `activeEditorSurface` or another target registry.
4. Reconcile and execute plan 057. It extends this `when` evaluator and target
   registry, removes the remaining native Editor keymap path in its takeover,
   and does not replace the bus.

Plan 060 is independent but may drift shared Editor component files. Plan 061
must follow both 060 and 062: its claim/ensure-before-selection transaction
stays in the Editor domain action used by local UI and the bus, while the bus
remains the typed Platform caller. Do not create a bus-only activation
implementation or copy that transaction into `workspace-commands.ts`. Root
`PLAN.md` remains authoritative before scheduling 060/061.

## Audited current state

### Registry and dispatch

- `apps/web/src/keymap/table.ts:8-17` builds the one live table and `byId` map.
- `apps/web/src/keymap/command-registry.ts:4-41` and
  `default-bindings.ts:25-63` project metadata and default keys from it.
- The current table has 136 rows: 55 Workspace and 81 registered Editor
  commands. Editor defines 123 IDs, so 42 currently lack Platform metadata.
- `keymap/types.ts:29-31` makes `PlatformCommandId` wider than the registry by
  admitting all 123 Editor IDs.
- `keymap/table.ts:58-71` supplies a metadata-less `editor.*` fallback through
  `commandRequirement()`.
- `keymap/define-command.ts:45-73` has a 27-field
  `WorkspaceCommandContext`: 10 data fields and 17 forwarded functions.
- `keymap/commands.ts:28-147` reconstructs that bag per call, invokes a global
  Editor pointer or a workspace handler, treats `void` as handled, and emits a
  synchronous `workspace.command` log.

### Enablement and key suppression

- `keymap/command-enablement.ts:10-34` evaluates six coarse `requires` values
  using only `{ activeFilePath, hasWorkspace }`.
- Palette and menu duplicate that check in
  `features/command-palette/content.tsx:164-205` and
  `features/menus/utils/resolve.ts:139-155`.
- `keymap/use-app-keymap.ts:72-89` prevents/stops a matched browser event before
  dispatch and discards the handler result. Disabled or targetless commands are
  therefore swallowed.
- Platform currently excludes Editor bindings from the document listener and
  passes them as native Editor layers. This plan preserves that staged boundary;
  plan 057 owns the single-dispatcher takeover.

### Focus and active pointers

- `features/workspace/providers/focus-state.ts:7-81` conflates optimistic
  `activeArea`, `editorFocusRequestId`, and `activeEditorCommandDispatch`.
- `requestEditorFocus` claims Editor before DOM focus; the Editor consumes every
  nonzero request without acknowledging it at
  `features/editor/components/editor.tsx:194-199`.
- Main Editor pointer publication/identity-free cleanup is at `editor.tsx:201-207`.
  Search-result publication is at
  `features/search/components/result-file-editor.tsx:148-153`; its parent can
  clear a different Editor at `result-editor-surface.tsx:148-152`.
- `features/workspace/state/tree-command-store.ts:1-42` adds app-level
  `nextRequestId`, snapshot, request, and acknowledgement state. The pane calls
  a focus attempt that can fail, then acknowledges regardless at
  `tree-pane.tsx:218-245,291-296`.
- Sidebar, bottom-panel, Git, logs, terminal, tree, and workspace commands write
  focus area optimistically. `problems` has no writer; palette and dialogs have
  no explicit ownership.
- There is no global active-tree or active-terminal dispatch pointer. Do not
  invent one. Terminal's `activationFrameRef`, `terminalRef`, `sendInputRef`,
  and command inbox are instance-local behavior and remain.

### Palette, menus, async work, and close

- `AppCommandSurface` owns palette/settings booleans, forwards dispatch to the
  keymap/palette, and publishes dispatch/bindings into a mutable menu store.
- `components/command-palette.tsx:4-7` unmounts palette content while closed, so
  `content.tsx` cannot observe `open=false`; its preview cleanup currently has
  no unmount cleanup and can leave a color-theme preview applied.
- Base UI currently performs implicit final-focus restoration. If left enabled,
  it races explicit FocusService restoration.
- Detached workspace promises live in `workspace-commands.ts:81-112`, with
  save/save-all/open-HEAD/revert/clipboard callers at current lines 307-340,
  362-388, and 569-587.
- Before plan 059, settings commands hide settlement behind
  `use-settings-actions.ts`. After plan 059 there must be one semantic intent
  result; this plan consumes it rather than adding a mutation path.
- `use-dirty-tab-close.tsx:54-93` flattens busy, missing, deferred, and closed
  into a boolean. `workspace.closeCurrentTab` ignores that boolean and
  `keymap/commands.ts` carries a direct-close fallback.

## Required contracts

### 1. Extend the existing registry; do not replace it

Do not create `commandDefinitions`, a second command ID map, or a production
handler registry keyed separately from `platformCommands`. Production
`CommandBus` receives `platformCommand` as its lookup. Unit tests may inject a
small lookup boundary.

Replace `kind` and `requires` with these fields on every resolved row:

```ts
type CommandTargetKind = 'editor' | 'workspace'

type CommandWhen =
  | 'chatMode'
  | 'editorTarget'
  | 'editorWritable'
  | 'fileBackedTab'
  | 'saveableTab'
  | 'tabOpen'
  | 'workspaceOpen'

type CommandExecution = 'async' | 'sync'

type CommandUndoCategory = 'file-operation' | 'text-edit' | 'view-only' | 'workspace-operation'
```

- `target` names the execution receiver. Focus destination is a separate typed
  FocusService selector; never overload `target` with an optimistic area.
- `when` is an ANDed closed union. It has no expression parser, `or`, arbitrary
  string, or user-authored value. A future OR is represented by separate rows.
- `execution` discriminates handler return types. Workspace handlers return an
  explicit disposition; implicit `void` is invalid.
- `undoCategory` is required on every row and enforced by typecheck plus table
  tests.
- Preserve every existing descriptive/exposure field and its projection:
  `id`, `title`, `description`, `category`, `aliases`, `vscodeCommandIds`,
  `icon`, `keys`, `keepsPaletteOpen`, and `hiddenInPalette`.

Assign Workspace `when` values exactly:

- `[]`: `workspace.showCommandPalette`, `workspace.showSettings`,
  `workspace.openFilePicker`, `workspace.selectColorMode`,
  `workspace.selectColorTheme`, `workspace.setDarkTheme`,
  `workspace.setLightTheme`, `workspace.setSystemTheme`, and
  `workspace.toggleWallpaper`.
- `['workspaceOpen', 'chatMode']`: `workspace.newSession`,
  `workspace.nextSession`, `workspace.previousSession`,
  `workspace.toggleSessionRail`, and `workspace.jumpToSession1` through
  `workspace.jumpToSession9`.
- `['tabOpen']`: `workspace.quickOpenPreviousEditor`,
  `workspace.closeCurrentTab`, `workspace.focusFirstEditorGroup`,
  `workspace.focusSecondEditorGroup`, `workspace.focusThirdEditorGroup`, and
  `workspace.focusEditor`.
- `['saveableTab']`: `workspace.saveFile`.
- `['fileBackedTab']`: `workspace.gotoSymbol`,
  `workspace.compareWithSaved`, `workspace.openFileAtHead`,
  `workspace.revertFile`, and `workspace.revealActiveFileInTree`.
- `['workspaceOpen']`: the remaining 21 rows:
  `workspace.showQuickAccess`, `workspace.openSearchEditor`,
  `workspace.quickOpenView`, `workspace.showAllEditors`,
  `workspace.saveAllFiles`, `workspace.reopenClosedEditor`,
  `workspace.toggleSidebarVisibility`, `workspace.togglePanel`,
  `workspace.focusFileTree`, `workspace.findInFileTree`,
  `workspace.focusGit`, `workspace.copyAddress`,
  `workspace.navigateBack`, `workspace.navigateForward`,
  `workspace.revealChat`, `workspace.revealTerminal`,
  `workspace.newIsolatedSession`, `workspace.toggleDiffViewMode`,
  `workspace.toggleUiMode`, `workspace.showChatMode`, and
  `workspace.showWorkbenchMode`.

All Editor rows use `editorTarget`; `text-edit` rows also require
`editorWritable`. `defineEditorCommand` stamps target/execution/when, while the
row supplies its undo category.

Add hidden, keyless, sync, view-only metadata rows for the four Editor IDs
already exposed by Platform's text menu:

- `editor.action.goToImplementation`
- `editor.action.goToTypeDefinition`
- `editor.action.peekDefinition`
- `editor.action.revealDefinitionAside`

Their Platform IDs are prefixed once as `editor.editor.action.*`. The final table
has 140 rows: 55 Workspace plus 85 Editor. Derive the registered Editor ID union
from `typeof editorCommands`; do not hand-maintain another ID list. Retain the
wider `editor.${EditorCommandId}` type only at the Editor adapter boundary.
Delete the metadata-less fallback. Every Platform menu/palette/key/settings
exposure now requires a registry row in the same pass.

### 2. CommandBus inspection and dispatch are typed and non-rejecting

Implement the semantic shape below in `keymap/state/command-bus.ts`. Exact names
may differ only when the same invariants remain obvious:

```ts
type CommandSource =
  | { kind: 'keybinding' }
  | { kind: 'menu'; surface: MenuSurfaceId }
  | { kind: 'palette' }
  | { kind: 'programmatic'; caller: string }

type CommandFailure =
  { owner: 'command-bus'; error: ClientError } | { owner: 'domain'; operationId: string }

type ImmediateCommandDisposition =
  | { status: 'handled' }
  | { status: 'deferred'; reason: 'dirty-close' }
  | { status: 'unhandled'; reason: 'handler-declined' }

type AsyncCommandSettlement =
  | ImmediateCommandDisposition
  | { status: 'cancelled'; reason: 'domain-discarded' }
  | { status: 'failed'; failure: CommandFailure }

type AsyncCommandStart =
  | ImmediateCommandDisposition
  | {
      status: 'started'
      completion: Promise<AsyncCommandSettlement>
    }

type CommandOutcome =
  | AsyncCommandSettlement
  | { status: 'disabled'; reason: string }
  | { status: 'unhandled'; reason: 'target-unavailable' }

type CommandDispatchTicket = {
  readonly claimed: boolean
  readonly completion: Promise<CommandOutcome>
}
```

Required behavior:

1. `inspect(id, invocation)` looks up the live table row, captures runtime state
   once, resolves the exact target, and evaluates `when`. It returns typed
   ready/disabled data without running the handler.
2. `dispatch(id, invocation)` repeats inspection at invocation time, executes
   only ready work, catches sync throws and started-completion rejections, and
   always resolves `completion`.
3. `claimed` is false for disabled, targetless, or synchronously declined work;
   true for immediate handled/deferred work and `{ status: 'started' }`. A
   started operation may settle failed/cancelled/unhandled later without
   retroactively giving the trusted key back to the browser.
4. Editor boolean `true/false` adapts to handled/unhandled. Do not infer or await
   plugin work hidden behind Editor's synchronous contract.
5. `inspect` and `dispatch` use the same target resolver and `when` evaluator.
   Palette/menu presentation cannot carry a second enablement implementation.
6. Each dispatch owns one `createWideEventScope` event with action
   `command.dispatch`, area `command`, command ID, source, resolved target kind
   and non-sensitive identity, execution, undo category, disabled reason, final
   outcome, and duration. Never log settings values, clipboard text, session
   content, or command arguments.
7. Convert thrown/rejected Platform work with `toClientError`, call
   `reportError` once, and end the same event. For plan 059 settings-intent
   failures, return `owner: 'domain'` with `mutationId`; the settings runtime
   already owns canonical logging, Retry/Discard, and user feedback, so the bus
   must not report it again.

An `execution: 'sync'` Workspace handler returns
`ImmediateCommandDisposition`. An `execution: 'async'` handler is still called
synchronously and returns `AsyncCommandStart`: it may decline immediately, or
return `{ status: 'started', completion }`. The bus derives `claimed` from that
start result and wraps `completion` into a non-rejecting ticket. Do not type an
async-row handler as a bare promise, because the keymap must know synchronously
whether the trusted key was claimed.

Build one provider-local runtime grouped by domain capability:

- Editor document/workspace store APIs and QueryClient;
- the existing `useEditorCommands()` domain object;
- FocusService;
- existing `useOpenFileAtRef()` and workspace-root opener;
- the real dirty-close action from `EditorTabActionsProvider`;
- shell actions for palette and folderless settings;
- plan 059's existing semantic settings and appearance actions.

Capture mutable workspace/document/UI values once per inspection. Do not rebuild
17 callbacks per invocation, prop-drill individual command actions, or move
their domain ownership into the bus.

### 3. FocusService owns target identity and acknowledgement

Implement `apps/web/src/lib/focus/state/service.ts` as a non-React external
service with immutable snapshots and `subscribe`. It qualifies for `lib/`
because keymap plus Editor, workspace, workbench, search, chat, Git, logs,
terminal, settings, and menus consume it. `lib/focus` imports no feature module.

The snapshot contains:

- `currentOwner`: the deepest registered target containing the most recent
  actual `focusin`, or global/null when none does;
- at most one requested transition record;
- the latest acknowledged/rejected/superseded transition result;
- the last acknowledged compatible command target retained while an overlay
  temporarily owns DOM focus.

Registration returns an identity-safe token. Unregistering token A can never
remove replacement token B. Each registration provides its element, typed ID,
area, capabilities, and intent handler. Register these exact target classes:

- active normal and Settings Editors: Editor dispatch, writable, tab identity;
- search-result Editors: nested Editor dispatch, read-only;
- each diff pane: Editor dispatch, read-only, document/side identity;
- every SearchPane root: `search`, with a stable query-input focus intent; the
  nested search Editor wins by composed-path depth;
- file tree by root: `file-tree`, with `focus`, `open-search`, and
  `reveal-active` intents;
- Git, logs, terminal, and problems panel roots;
- chat composer keyed by workspace/project, whose intent calls the real Lexical
  editor focus API;
- command palette;
- workspace Settings page keyed by tab, with its real search input/root as the
  form-view target and a nested Editor target winning in JSON view;
- unsaved-changes dialog keyed by the pending close identity;
- folderless Settings dialog;
- app shell as the global fallback.

Git/logs/problems roots must be programmatically focusable (`tabIndex={-1}`) or
use a named stable focusable child. Search focuses its real query input. Tree
focus enters its real shadow-DOM row/search input. Terminal uses its real
terminal focus method. A layout change alone is never acknowledgement.

Use a non-rejecting transition ticket:

```ts
type FocusTransitionOutcome =
  | { status: 'acknowledged'; targetId: FocusTargetId }
  | {
      status: 'rejected'
      reason: 'destination-invalid' | 'refused' | 'unregistered'
    }
  | { status: 'superseded'; by: FocusRequestToken }

type FocusTransitionTicket = {
  readonly token: FocusRequestToken
  readonly completion: Promise<FocusTransitionOutcome>
}
```

`FocusRequestToken` is opaque per request, not a render counter. The provider
installs one document capture `focusin` listener and resolves the deepest
registered element from `event.composedPath()`. Registration checks whether its
element already contains the active element, covering mount-after-focus.

Resolve command targets in this deterministic order:

1. deepest compatible target in the invocation event's composed path;
2. explicit origin captured when a menu/palette/dialog opened;
3. current compatible acknowledged owner;
4. exact active-tab/area selector supplied by the runtime snapshot;
5. last acknowledged compatible target.

If multiple compatible targets remain without an exact selector, return
unavailable. Never choose mount order, last writer, or a global dispatch slot.

If a requested destination is not mounted yet, retain the transition and attempt
it when a matching target registers. Set ownership only after matching
`focusin`. A newer request supersedes the old one. Refusal or unregister after
an attempt rejects it. A stray focus event may update actual ownership but
cannot acknowledge a different token. Do not use correctness timeouts.

Preserve tree-package-private synchronization counters:

- `FileTreeController.#focusRequestId`
- `FileTreeController.#pendingFocusRequestId`
- `FileTreeController.#searchFocusRequestId`
- `FileTreeController.#scrollRequestId`
- `useFileTreeFocusSync.processedFocusRequestIdRef`

They coordinate shadow-DOM internals and are not the app protocol being
deleted. Also preserve unrelated Git generation and chat RPC request IDs.

### 4. Overlay origins and restoration are explicit

`CommandProvider` sits under the real `EditorTabActionsProvider` and above both
titlebar and workspace. It owns the resolved binding table, bus, palette state,
folderless Settings state, and app keymap. `AppCommandSurface` disappears.

- Capture palette origin only on the closed-to-open edge. Changing its search
  or mode while already open cannot replace the origin with the palette.
- Register the palette popup and wait for its actual autofocus `focusin`.
- Palette command rows use `inspect`; selection awaits `completion`. Record MRU
  and close only on handled/deferred, subject to `keepsPaletteOpen`. Disabled,
  unhandled, cancelled, and failed results keep the palette open and do not
  record MRU.
- Plan 059 color-mode hover calls only `previewTheme`; selection dispatches one
  real theme command. Editor color-theme hover remains in-memory. Closing by
  selection, Escape, outside click, or unmount clears hover preview, but never a
  plan 059 commit-handoff latch.
- Direct palette actions choose an explicit destination: file/line/symbol to
  the selected Editor, script to terminal, and session/draft to the composer
  keyed to the selected project. A cross-project session first awaits the
  existing workspace-root opener; the old project's composer cannot
  acknowledge it.
- `MenuSurface` captures origin from `MenuAnchor.contextElement`, the trigger,
  or current acknowledged owner before opening. Menu resolution and dispatch
  use the same origin. Local actions remain local.
- Replace titlebar `runCommand` radio callbacks with command-backed radio
  options resolved by the menu runtime.
- Disable Base UI implicit final focus on palette, every menu, folderless
  Settings, and dirty-close dialogs. Expose the needed popup prop through
  `packages/ui/src/components/command.tsx`; `DialogContent` and context-menu
  popup props already provide the lower-level seam. FocusService alone restores
  a still-live origin or honors a command's acknowledged destination.
- Delete terminal's direct context-menu `.focus()` restoration. Preserve its
  real focus/blur cursor styling and local operational refs.

### 5. Async settlement uses existing owners

Convert these current operation-backed commands to handlers that synchronously
return a started result whose completion awaits the existing operation:

- `workspace.saveFile`
- `workspace.saveAllFiles`
- `workspace.openFileAtHead`
- `workspace.revertFile`
- `workspace.copyAddress`
- `workspace.toggleDiffViewMode`
- `workspace.toggleWallpaper`
- `workspace.setDarkTheme`
- `workspace.setLightTheme`
- `workspace.setSystemTheme`

These focus-changing commands are also async because completion includes a real
focus acknowledgement:

- `workspace.showQuickAccess`, `workspace.showCommandPalette`,
  `workspace.quickOpenView`, `workspace.gotoSymbol`,
  `workspace.showAllEditors`, `workspace.selectColorMode`,
  `workspace.selectColorTheme`, `workspace.showSettings`;
- `workspace.openSearchEditor`, `workspace.quickOpenPreviousEditor`,
  `workspace.compareWithSaved`, `workspace.openFileAtHead`,
  `workspace.reopenClosedEditor`, `workspace.closeCurrentTab`,
  `workspace.focusFirstEditorGroup`, `workspace.focusSecondEditorGroup`,
  `workspace.focusThirdEditorGroup`, `workspace.focusEditor`;
- `workspace.toggleSidebarVisibility`, `workspace.togglePanel`,
  `workspace.focusFileTree`, `workspace.findInFileTree`,
  `workspace.revealActiveFileInTree`, `workspace.focusGit`,
  `workspace.revealTerminal`;
- `workspace.revealChat`, `workspace.newIsolatedSession`,
  `workspace.toggleUiMode`, `workspace.showChatMode`, and
  `workspace.showWorkbenchMode`.

The union is exactly 39 Workspace rows because `openFileAtHead` appears in both
lists. The other 16 Workspace rows and all Editor rows are sync under the live
Editor contract.

Focus destinations for those handlers are exact:

- palette/search-mode openers -> command-palette popup;
- `showSettings` -> keyed workspace Settings page when a root exists, otherwise
  the folderless Settings dialog;
- `openSearchEditor` -> the matching workspace SearchPane/query input;
- previous/reopen/group/focus and file/ref opens -> the newly active tab's
  registered surface; a split diff with no invocation origin chooses its `new`
  pane deterministically, never mount order;
- clean close -> the selected successor surface or app shell when no tab
  remains; dirty close -> its exact unsaved dialog;
- files/tree commands -> matching root tree target; Git -> Git root; terminal
  commands -> terminal target;
- chat/reveal/chat-mode transitions -> composer keyed to the selected project;
- workbench-mode transitions -> the last live acknowledged workbench target,
  then exact active tab surface, then app shell.

If an exact destination is not valid, return target-unavailable; do not mark a
layout mutation itself as focus success.

For plan 059 settings/appearance actions:

- `{ kind: 'noop' }` returns immediate handled without transport.
- `{ kind: 'submitted', mutationId, settled }` returns started immediately;
  its completion awaits the existing settlement.
- acknowledged maps to handled; discarded maps to cancelled; failed maps to a
  domain-owned failed outcome carrying `mutationId` and is not reported twice.
- If non-theme semantic setting methods still return `void`, widen only their
  return plumbing to expose the already-created intent's ID/settlement. Do not
  add a second mutation, call the raw API, or add a bus-specific settings store.

Delete `runFileLifecycle`, `runSaveLifecycle`, `reportCommandError`, and their
local detached catches. Reuse existing save, document, FileSync, SettingsSync,
clipboard, and file-at-ref operations unchanged.

### 6. Dirty close has a real typed disposition

Replace the boolean close result with:

```ts
type CloseRequestResult =
  | { status: 'closed'; tabIds: readonly string[] }
  | {
      status: 'deferred'
      dialogTarget: UnsavedDialogTarget
      tabIds: readonly string[]
    }
  | { status: 'rejected'; reason: 'busy' | 'not-found' }
```

The pending-dialog target is an opaque object identity, not a public counter.
Local tab buttons and tab menus may continue to ignore the richer result.
The `execution: 'async'` handler calls the close action synchronously before it
returns `AsyncCommandStart`, so it can derive the trusted-key claim correctly.
`workspace.closeCurrentTab` interprets the close result:

- closed -> return started; completion waits for successor/app-shell focus and
  settles handled;
- deferred -> return started; open/register the exact dialog and have
  completion wait for its autofocus acknowledgement before settling deferred;
- busy/not-found -> synchronously unhandled and unclaimed.

Deferred completion ends when the dialog owns the decision. It does not wait
for eventual Save, Discard, or Cancel. Delete the direct `closeTab` fallback.

### 7. Undo categories describe ownership; they do not implement undo

The 31 registered Editor `text-edit` rows are exactly:

- `editor.undo`, `editor.redo`, `editor.replaceOne`, `editor.replaceAll`;
- `editor.deleteBackward`, `editor.deleteForward`, `editor.deleteWordLeft`,
  `editor.deleteWordRight`, `editor.indentSelection`,
  `editor.outdentSelection`;
- `editor.editor.action.deleteLines`,
  `editor.editor.action.copyLinesUpAction`,
  `editor.editor.action.copyLinesDownAction`,
  `editor.editor.action.moveLinesUpAction`,
  `editor.editor.action.moveLinesDownAction`,
  `editor.editor.action.insertLineBefore`,
  `editor.editor.action.insertLineAfter`,
  `editor.editor.action.commentLine`,
  `editor.editor.action.blockComment`,
  `editor.editor.action.indentLines`,
  `editor.editor.action.outdentLines`,
  `editor.editor.action.trimTrailingWhitespace`,
  `editor.editor.action.sortLinesAscending`,
  `editor.editor.action.sortLinesDescending`,
  `editor.editor.action.joinLines`,
  `editor.editor.action.duplicateSelection`,
  `editor.editor.action.transformToUppercase`,
  `editor.editor.action.transformToLowercase`,
  `editor.editor.action.transformToTitlecase`,
  `editor.editor.action.rename`, and
  `editor.editor.action.formatDocument`.

Every other registered Editor row, including the four new hidden navigation
rows and `editor.editor.action.moveSelectionToNextFindMatch`, is `view-only`.
Text edit is disabled on read-only targets; view-only commands may run there.

Workspace categories:

- `file-operation`: `workspace.saveFile`, `workspace.saveAllFiles`,
  `workspace.revertFile`.
- `workspace-operation`: `workspace.copyAddress`,
  `workspace.newIsolatedSession`, `workspace.newSession`,
  `workspace.toggleDiffViewMode`, `workspace.toggleWallpaper`,
  `workspace.setDarkTheme`, `workspace.setLightTheme`, and
  `workspace.setSystemTheme`.
- `view-only`: every other Workspace row, including open-at-HEAD,
  tab/layout/focus/navigation/palette/session-selection commands.

There is no Platform undo stack, file-operation undo, or cross-resource undo in
this plan. `DocumentSession` remains the only text-history owner.

## Exact legacy deletion ledger

Delete these names and paths during the atomic cutover. Do not leave wrappers,
aliases, or deprecated exports.

### Counters and focus pointers

- Delete `features/workspace/providers/focus-state.ts` and
  `focus-provider.tsx`, including `FocusStoreState`, `FocusStoreActions`,
  `FocusStore`, `FocusStoreApi`, old `FocusContext`, `createFocusStore`,
  `useFocus`, `activeArea`, `editorFocusRequestId`,
  `consumeEditorFocusRequest`, `requestEditorFocus`,
  `activeEditorCommandDispatch`, `EditorCommandDispatch`,
  `dispatchEditorCommand`, `setActiveEditorCommandDispatch`, `setFocusArea`,
  and dead `clearFocusArea`. Move/extend only the area type into the new service
  contract.
- Delete the counter-focus effect and pointer publication/cleanup effects from
  `features/editor/components/editor.tsx`.
- Delete pointer publication/cleanup and optimistic area writes from
  `features/search/components/result-file-editor.tsx` and
  `result-editor-surface.tsx`.
- Delete `setFocusArea` writers and pointer-down ownership writes from app
  shell, sidebar, bottom panel, Git, logs, terminal, and tree. Delete
  `focusAreaForSidebarTab`.
- Delete the app tree protocol files:
  `features/workspace/state/tree-command-store.ts`,
  `hooks/use-tree-command-request.ts`,
  `providers/tree-commands-context.ts`, and
  `providers/tree-commands-provider.tsx`. Exact names removed are
  `TreeCommandKind`, `TreeCommandRequest`, `TreeCommandStore`,
  `createTreeCommandStore`, app `nextRequestId`, snapshot, request, and
  acknowledge. Remove `TreeCommandsProvider` from `App.tsx` and the request/ack
  consumer from `tree-pane.tsx`.
- Never introduce plan 056's stale `activeEditorSurface` or an
  `editor-surface-registry` parallel to FocusService.

Preserve `features/workspace/utils/tree-commands.ts` and its test. Preserve all
tree-package-private counters listed above. There are no app-level tree or
terminal dispatch pointers to delete.

### Active command pointers and dispatch props

- Delete `features/menus/state/command-store.ts`,
  `providers/command-context.ts`, and `providers/command-provider.tsx`, including
  `dispatch`, `bindings`, `runCommand`, `setBindings`, `setCommandDispatch`,
  `MenuCommandStore`, and `MenuCommandStoreApi`.
- Delete dispatch/bindings publication and cleanup effects from
  `components/app-command-surface.tsx`, then delete that component.
- Delete `PlatformCommandDispatch` from `keymap/use-app-keymap.ts`.
- Delete forwarded `dispatch` props from `app-keymap-controller.tsx`,
  `components/command-palette.tsx`, and
  `features/command-palette/command-palette-types.ts`.
- Delete `keymap/commands.ts`, including `usePlatformCommandDispatch`, its
  `requestCloseTab?`, `showCommandPalette`, and `showSettings` options,
  `fallbackRequestCloseTab`, `resolvedRequestCloseTab`, and `noop`.
- Delete the synchronous `workspace.command` log.
- Delete chat's use of the menu command store in
  `features/chat/hooks/use-attach-to-composer.ts`; use the typed bus with a
  programmatic source.

### Forwarded callback bags

Delete `WorkspaceCommandContext` in full. Its exact 17 function-valued fields
are:

`openPicker`, `openFileAtRef`, `openSearchEditor`, `reopenClosedEditor`,
`requestCloseTab`, `requestEditorFocus`, `requestFileTreeCommand`,
`setChatModePanels`, `setDiffViewMode`, `setFocusArea`, `setTheme`, `setUiMode`,
`setWallpaperEnabled`, `setWorkbenchPanels`, `showCommandPalette`,
`showSettings`, and `selectPreviousEditor`.

The other 10 fields disappear with the bag and are captured through grouped
runtime APIs and one inspection snapshot: `activeFilePath`, `activeTabId`,
`chatModePanels`, `diffViewMode`, `documentStore`, `queryClient`, `rootPath`,
`uiMode`, `wallpaperEnabled`, and `workbenchPanels`.

Also delete:

- `EditorFrame.onActivate`; registration plus real `focusin` replaces it.
- shell `handleGlobalFocusCapture`, `handleGlobalPointerDownCapture`, and
  `eventTargetsCurrentElement`.
- titlebar `TitlebarMenuContext.runCommand`, callback-taking `commandRadio`, and
  `runChoice`.
- terminal's direct post-menu `terminalRef.current?.focus()` restoration.
- dead palette `previewPlatformCommand` action if plan 059 has not already
  removed it; preview APIs must be in-memory appearance/theme actions, not
  command execution.
- `editorBackedDocumentPath` and its pointer-based commentary from
  `features/editor/utils/file-backed-document.ts`; file-backed and saveable path
  helpers remain, while Editor availability comes from target capability.

Do not delete `DiffPane.onFocus` / `useDiffPanes.handleFocus`: it synchronizes
selection between diff panes and remains Editor-local. Keep
`EditorSurfaceActionsContext`, terminal local refs/inbox, local tab actions, and
chat's `openProjectRoot`/`setSessionProjectOpener` lifecycle.

## Editor ownership and future lockstep boundary

This plan changes `/Users/shaul/Desktop/D/Editor` by zero lines.

Editor owns all 123 IDs and `{ event?: KeyboardEvent }` in
`/Users/shaul/Desktop/D/Editor/packages/editor/src/editor/commands.ts`. Its
router and React facade expose synchronous boolean `dispatchCommand` and
`focus(): void`. Core/router/plugins remain the owner of navigation, selection,
find/replace, text editing, multi-cursor, folding, inline suggestions, LSP
actions, and undo/redo. Platform owns only metadata/exposure, target selection,
enablement, invocation source, and boolean adaptation.

After adding the four hidden rows, these 38 IDs remain Editor-local and absent
from Platform metadata:

`cursorColumnSelectDown`, `cursorColumnSelectLeft`,
`cursorColumnSelectPageDown`, `cursorColumnSelectPageUp`,
`cursorColumnSelectRight`, `cursorColumnSelectUp`, `cursorRedo`, `cursorUndo`,
`cursorWordPartLeftSelect`, `cursorWordPartRightSelect`, `deleteWordPartLeft`,
`deleteWordPartRight`, `editor.action.autoFix`,
`editor.action.goToDefinition`, `editor.action.inlineSuggest.acceptNextWord`,
`editor.action.inlineSuggest.commit`, `editor.action.marker.next`,
`editor.action.marker.prev`, `editor.action.reindentlines`,
`editor.action.reindentselectedlines`, `editor.action.smartSelect.expand`,
`editor.action.smartSelect.shrink`, `editor.action.toggleTabFocusMode`,
`editor.createFoldingRangeFromSelection`, `editor.fold`, `editor.foldAll`,
`editor.foldLevel1`, `editor.foldLevel2`, `editor.foldLevel3`,
`editor.foldLevel4`, `editor.foldLevel5`, `editor.foldLevel6`,
`editor.foldLevel7`, `editor.foldRecursively`,
`editor.removeManualFoldingRanges`, `editor.unfold`, `editor.unfoldAll`, and
`editor.unfoldRecursively`.

A future Editor/Platform lockstep contract change is required only when:

- a Platform-exposed Editor ID is added, renamed, or removed;
- Platform must pass arguments beyond the optional KeyboardEvent;
- Editor dispatch becomes async/cancellable or returns structured failure,
  deferred, or undo data;
- enablement needs Editor-private facts such as find-widget state,
  inline-suggestion visibility, or tab-focus mode;
- focus needs a correlated Editor API result beyond Platform DOM `focusin`;
- a cross-document/resource edit or undo transaction crosses repositories.

Format/rename/LSP plugin work currently detached behind synchronous `true`
remains Editor-owned and unobservable here. Do not fake its settlement.

## Exact Platform file scope

Only the files below may change. If typecheck proves another production file is
needed, STOP, record the concrete reason, and amend/review the scope before
touching it.

### New production files

- `apps/web/src/keymap/state/command-bus.ts`
- `apps/web/src/keymap/utils/when.ts`
- `apps/web/src/keymap/providers/command-context.ts`
- `apps/web/src/keymap/providers/command-provider.tsx`
- `apps/web/src/keymap/hooks/use-command.ts`
- `apps/web/src/lib/focus/state/service.ts`
- `apps/web/src/lib/focus/providers/context.ts`
- `apps/web/src/lib/focus/providers/provider.tsx`
- `apps/web/src/lib/focus/hooks/use-service.ts`
- `apps/web/src/lib/focus/hooks/use-snapshot.ts`
- `apps/web/src/lib/focus/hooks/use-target.ts`

### App and keymap files

- `apps/web/src/App.tsx`
- `apps/web/src/app-keymap-controller.tsx`
- `apps/web/src/components/app-runtime-content.tsx`
- `apps/web/src/components/app-workspace.tsx`
- `apps/web/src/components/command-palette.tsx`
- `apps/web/src/keymap/active-bindings.ts`
- `apps/web/src/keymap/command-registry.ts`
- `apps/web/src/keymap/define-command.ts`
- `apps/web/src/keymap/editor-commands.ts`
- `apps/web/src/keymap/editor-keymap.ts`
- `apps/web/src/keymap/table.ts`
- `apps/web/src/keymap/types.ts`
- `apps/web/src/keymap/use-app-keymap.ts`
- `apps/web/src/keymap/workspace-commands.ts`
- `apps/web/src/features/chat-mode/providers/session-context.ts` (stale
  `AppCommandSurface` comment only)
- `apps/web/src/features/settings/hooks/use-settings-actions.ts` (only if plan
  059's semantic methods need existing settlement return plumbing)

### Focus targets and close behavior

- `apps/web/src/features/chat/components/chat-input.tsx`
- `apps/web/src/features/chat/hooks/use-attach-to-composer.ts`
- `apps/web/src/features/editor/components/editor.tsx`
- `apps/web/src/features/editor/components/frame.tsx`
- `apps/web/src/features/editor/components/diff-pane.tsx`
- `apps/web/src/features/editor/components/unsaved-changes-dialog.tsx`
- `apps/web/src/features/editor/hooks/use-dirty-tab-close.tsx`
- `apps/web/src/features/editor/utils/file-backed-document.ts`
- `apps/web/src/features/editor/utils/text-menu.ts`
- `apps/web/src/features/git/components/panel.tsx`
- `apps/web/src/features/logs/components/panel.tsx`
- `apps/web/src/features/search/components/history-input.tsx`
- `apps/web/src/features/search/components/result-editor-surface.tsx`
- `apps/web/src/features/search/components/result-file-editor.tsx`
- `apps/web/src/features/settings/components/dialog.tsx`
- `apps/web/src/features/settings/components/page.tsx`
- `apps/web/src/features/terminal/components/panel.tsx`
- `apps/web/src/features/workbench/components/bottom-panel.tsx`
- `apps/web/src/features/workbench/components/diagnostics-panel.tsx`
- `apps/web/src/features/workbench/components/sidebar-panel.tsx`
- `apps/web/src/features/workspace/components/search-pane.tsx`
- `apps/web/src/features/workspace/components/tree-pane.tsx`

### Palette, menus, and overlay primitive

- `apps/web/src/features/command-palette/command-groups.tsx`
- `apps/web/src/features/command-palette/command-palette-data.ts`
- `apps/web/src/features/command-palette/command-palette-groups-factory.tsx`
- `apps/web/src/features/command-palette/command-palette-row.tsx`
- `apps/web/src/features/command-palette/command-palette-types.ts`
- `apps/web/src/features/command-palette/command-palette-utils.ts`
- `apps/web/src/features/command-palette/content.tsx`
- `apps/web/src/features/command-palette/providers/actions-context.ts`
- `apps/web/src/features/command-palette/view-groups.tsx`
- `apps/web/src/features/menus/components/item-row.tsx`
- `apps/web/src/features/menus/components/surface.tsx`
- `apps/web/src/features/menus/hooks/use-context-menu.ts`
- `apps/web/src/features/menus/hooks/use-resolved-menu.ts`
- `apps/web/src/features/menus/utils/model.ts`
- `apps/web/src/features/menus/utils/resolve.ts`
- `apps/web/src/features/workbench/hooks/use-titlebar-menu.ts`
- `apps/web/src/features/workbench/utils/titlebar-menu.ts`
- `packages/ui/src/components/command.tsx`

### Deleted production files

- `apps/web/src/components/app-command-surface.tsx` **DELETE**
- `apps/web/src/keymap/command-enablement.ts` **DELETE**
- `apps/web/src/keymap/commands.ts` **DELETE**
- `apps/web/src/features/menus/providers/command-context.ts` **DELETE**
- `apps/web/src/features/menus/providers/command-provider.tsx` **DELETE**
- `apps/web/src/features/menus/state/command-store.ts` **DELETE**
- `apps/web/src/features/workspace/hooks/use-tree-command-request.ts` **DELETE**
- `apps/web/src/features/workspace/providers/focus-provider.tsx` **DELETE**
- `apps/web/src/features/workspace/providers/focus-state.ts` **DELETE**
- `apps/web/src/features/workspace/providers/tree-commands-context.ts` **DELETE**
- `apps/web/src/features/workspace/providers/tree-commands-provider.tsx` **DELETE**
- `apps/web/src/features/workspace/state/tree-command-store.ts` **DELETE**

### Focused tests and shared test wiring

New:

- `apps/web/test/factories/command-runtime.tsx`
- `apps/web/src/keymap/tests/command-bus.test.ts`
- `apps/web/src/keymap/tests/when.test.ts`
- `apps/web/src/keymap/tests/command-focus.browser.tsx`
- `apps/web/src/lib/focus/tests/service.test.tsx`
- `apps/web/src/features/command-palette/tests/command-execution.test.tsx`
- `apps/web/src/features/editor/hooks/tests/use-dirty-tab-close.test.tsx`

Update:

- `apps/web/test/render.tsx`
- `apps/web/vitest.browser.config.ts`
- `apps/web/src/components/tests/app-titlebar.test.tsx`
- `apps/web/src/components/tests/workspace-project-menu.test.tsx`
- `apps/web/src/keymap/tests/command-dispatch.test.tsx`
- `apps/web/src/keymap/tests/command-table.test.ts`
- `apps/web/src/keymap/tests/keymap.test.ts`
- `apps/web/src/keymap/tests/session-commands.test.ts`
- `apps/web/src/keymap/tests/use-app-keymap.test.tsx`
- `apps/web/src/features/command-palette/tests/color-mode-groups.test.tsx`
- `apps/web/src/features/command-palette/tests/color-theme-groups.test.tsx`
- `apps/web/src/features/command-palette/tests/command-list-order.test.tsx`
- `apps/web/src/features/command-palette/tests/command-palette-utils.test.ts`
- `apps/web/src/features/command-palette/tests/script-groups.test.tsx`
- `apps/web/src/features/command-palette/tests/session-groups.test.tsx`
- `apps/web/src/features/editor/utils/tests/file-backed-document.test.ts`
- `apps/web/src/features/editor/utils/tests/text-menu.test.ts`
- `apps/web/src/features/git/tests/panel-states.test.tsx`
- `apps/web/src/features/menus/utils/tests/resolve.test.ts`
- `apps/web/src/features/menus/utils/tests/shortcut.test.ts`
- `apps/web/src/features/workbench/components/tests/editor-tab-bar.test.tsx`
- `apps/web/src/features/workbench/utils/tests/editor-tab-menu.test.ts`
- `apps/web/src/features/workbench/utils/tests/titlebar-menu.test.ts`
- `apps/web/src/features/workspace/components/tree-pane.browser.tsx`
- `apps/web/src/features/workspace/tests/tree-commands.test.ts`
- `apps/web/src/features/workspace/tests/tree-toolbar.test.tsx`
- `apps/web/src/features/settings/tests/page.test.tsx`

Delete obsolete characterization tests with their owners:

- `apps/web/src/keymap/tests/command-enablement.test.ts` **DELETE**
- `apps/web/src/features/workspace/tests/focus-state.test.ts` **DELETE**
- `apps/web/src/features/workspace/tests/tree-command-store.test.ts` **DELETE**

### Explicitly out of scope

- `/Users/shaul/Desktop/D/Editor/**`.
- `apps/web/src/features/editor/state/workspace-document-service.ts`,
  `file-sync-service.ts`, document-state ownership,
  `features/editor/utils/save.ts`, and SettingsSyncService. Reuse them unchanged.
- `apps/web/src/features/editor/state/commands.ts` transaction ownership. The bus
  injects those domain actions; plan 061 may later improve their activation
  ordering without duplicating them in the bus.
- `packages/tree/**` private focus/search/scroll counters and implementation.
- A Platform undo stack, file-operation undo, WorkspaceEdit/S5, or any
  cross-resource transaction.
- Multi-step chord parsing/timers/settings (plan 056).
- Native Editor keymap disablement, full default-pack import, and orphan-key
  exposure (plan 057).
- Quick-input provider/S10, new palette modes, or visual redesign.
- New settings keys, localStorage keys, migrations, compatibility readers,
  aliases, or healing code.
- Starting another dev server.

## Verification commands

Run from `/Users/shaul/Desktop/D/platform/apps/web` unless shown otherwise.

Focused node tests:

```bash
bun --bun vitest run --project node \
  src/keymap/tests/command-bus.test.ts \
  src/keymap/tests/when.test.ts \
  src/keymap/tests/command-table.test.ts \
  src/keymap/tests/keymap.test.ts \
  src/keymap/tests/session-commands.test.ts \
  src/features/command-palette/tests/command-palette-utils.test.ts \
  src/features/editor/utils/tests/file-backed-document.test.ts \
  src/features/editor/utils/tests/text-menu.test.ts \
  src/features/menus/utils/tests/resolve.test.ts \
  src/features/menus/utils/tests/shortcut.test.ts \
  src/features/workbench/utils/tests/editor-tab-menu.test.ts \
  src/features/workbench/utils/tests/titlebar-menu.test.ts \
  src/features/workspace/tests/tree-commands.test.ts
```

Focused DOM tests:

```bash
bun --bun vitest run --project dom \
  src/keymap/tests/command-dispatch.test.tsx \
  src/keymap/tests/use-app-keymap.test.tsx \
  src/features/command-palette/tests/color-mode-groups.test.tsx \
  src/features/command-palette/tests/color-theme-groups.test.tsx \
  src/features/command-palette/tests/command-list-order.test.tsx \
  src/features/command-palette/tests/command-execution.test.tsx \
  src/features/editor/hooks/tests/use-dirty-tab-close.test.tsx \
  src/features/git/tests/panel-states.test.tsx \
  src/features/settings/tests/page.test.tsx \
  src/features/workspace/tests/tree-toolbar.test.tsx \
  src/lib/focus/tests/service.test.tsx
```

Plan 059 regression gate (these files are created by that dependency and are
verification-only in this plan):

```bash
bun --bun vitest run --project dom \
  src/features/settings/tests/settings-actions.test.tsx \
  src/features/settings/tests/settings-projection.test.tsx \
  src/features/command-palette/tests/color-mode-preview.test.tsx \
  src/features/settings/tests/appearance-preview.test.tsx \
  src/features/settings/tests/appearance-optimistic.test.tsx
```

They must still prove zero writes on preview, one semantic commit,
preview-to-pending handoff, and exactly-once failure ownership.

Real browser:

```bash
bun run test:browser -- \
  src/keymap/tests/command-focus.browser.tsx \
  src/features/workspace/components/tree-pane.browser.tsx
```

Final web gates:

```bash
bun run typecheck
bun run lint
bun run format:check
bun run test
cd /Users/shaul/Desktop/D/platform
git diff --check
```

Do not use a bare root `bun run verify` as the completion gate. Compare failure
identity with the recorded baseline rather than absolute test counts.

## Execution steps

### Step 0: Verify plan 059 and capture the baseline

Before changing code, inspect the landed plan 059 implementation and prove:

- color-mode preview is in-memory and performs no dispatch/write;
- theme commit returns no-op or submitted `{ mutationId, settled }` semantics;
- normal settings actions enqueue through one semantic intent mutation path;
- projected and confirmed settings remain separate;
- a settings failure already has one canonical owner/reporter.

If those facts are absent or cannot be exposed without a second mutation path,
STOP. Do not implement the old plan 058 `setSettingAsync` design.

Capture baseline outputs:

```bash
cd /Users/shaul/Desktop/D/platform
git status --short > /tmp/plan-062-before.txt
cd apps/web
bun run typecheck > /tmp/plan-062-typecheck-before.log 2>&1
bun --bun vitest run --project node --project dom \
  src/keymap \
  src/features/command-palette/tests \
  src/features/editor/utils/tests/file-backed-document.test.ts \
  src/features/editor/utils/tests/text-menu.test.ts \
  src/features/menus/utils/tests/resolve.test.ts \
  src/features/workbench/utils/tests/titlebar-menu.test.ts \
  src/features/workspace/tests/focus-state.test.ts \
  src/features/workspace/tests/tree-command-store.test.ts \
  src/features/workspace/tests/tree-commands.test.ts \
  src/features/workspace/tests/tree-toolbar.test.tsx \
  > /tmp/plan-062-tests-before.log 2>&1
bun run test:browser -- src/features/workspace/components/tree-pane.browser.tsx \
  > /tmp/plan-062-browser-before.log 2>&1
```

Record exact nonzero exits/failures separately if the shell stops before later
commands. Any unexplained baseline failure is a STOP; do not expand scope to fix
it.

### Step 1: Build and prove the two non-React services in isolation

Create FocusService and CommandBus with injected clock, lookup, runtime, and
error-reporting boundaries. Do not mock Platform feature modules. Keep nesting
at three levels or less through guard clauses and named helpers.

FocusService tests must prove:

- request before registration stays pending, then matching registration plus
  `focusin` acknowledges it;
- request alone does not change current owner;
- wrong/stale acknowledgement is ignored;
- a newer request supersedes the prior request;
- refusal and unregister-after-attempt reject;
- token A cleanup cannot unregister replacement token B;
- deepest composed-path target beats a parent target;
- origin/current/exact-active/last-ack resolution is deterministic;
- ambiguous targets are unavailable;
- no timeout produces success.

CommandBus tests must prove:

- disabled inspection does not call the handler and is unclaimed;
- missing target is disabled, while a target lost after inspection is
  target-unavailable;
- Editor false/true adapt to unhandled/handled;
- an async-row handler can decline synchronously and remain unclaimed;
- a started result is claimed synchronously and its completion waits;
- sync throw and rejected started completion resolve failed, report once, and
  never create an unhandled rejection;
- a domain-owned plan 059 failure is not reported again;
- exactly one wide event ends with source, target, execution, undo, outcome, and
  duration;
- dirty-close deferred is distinct from handled.

Gate:

```bash
cd /Users/shaul/Desktop/D/platform/apps/web
bun --bun vitest run --project node src/keymap/tests/command-bus.test.ts
bun --bun vitest run --project dom src/lib/focus/tests/service.test.tsx
```

### Step 2: Perform the atomic registry/runtime/focus cutover

Complete every item before typechecking; do not add compatibility adapters to
make an intermediate state compile.

1. Add target/when/execution/undo metadata to every existing row, add the four
   hidden Editor rows, narrow Platform IDs from the table arrays, and delete
   `requires`, `commandRequirement`, `workspaceOptionalCommandIds`, and the old
   enablement module.
2. Implement `keymap/utils/when.ts` over one captured runtime snapshot plus the
   resolved target. Convert the old matrix to `when.test.ts` and add chat-mode,
   read-only, missing-target, and target/path disagreement cases.
3. Add the FocusService React provider/hooks and register every target class
   listed above. Use real `focusin`; preserve diff-local selection sync and
   terminal cursor styling.
4. Replace the app tree request queue with FocusService tree intents. A request
   may precede tree mount; a failed tree intent rejects and is never
   acknowledged. Delete the four app tree protocol files/provider.
5. Move `EditorTabActionsProvider` above the app command runtime, mount the new
   `CommandProvider` above titlebar/workspace, and let it own one resolved
   binding table, palette, folderless Settings dialog, and keymap. Keep passing
   resolved Editor layers to Editor until plan 057: `AppWorkspace` reads the
   provider's one resolved table and derives the native Editor layers from it,
   rather than resolving overrides a second time. Remove `AppCommandSurface`
   and the `keymapBindings` prop from `AppWorkspace`.
6. Convert workspace handlers to explicit dispositions and grouped runtime
   access. For async rows, synchronously return started completions that await
   the exact file/settings/focus operations above. Delete local catches, the
   old synchronous log, and the direct-close fallback.
7. Replace menu mutable publication with direct command context. Capture origin,
   inspect through the bus, use command-backed titlebar radio options, disable
   implicit final focus, and restore through FocusService.
8. Remove palette dispatch/binding props and local enablement. Inspect every
   command/view row through the bus using the captured palette origin. Await
   completion for MRU/close. Give every direct quick action its exact focus
   destination. Preserve plan 059 preview/commit semantics and add unmount
   cleanup.
9. Change `useAppKeymap` to dispatch before suppression. Reserved null bindings
   still suppress immediately; a command uses its binding's prevent/stop policy
   only when `ticket.claimed`. Preserve the current Editor-binding filter for
   plan 057.
10. Widen dirty-close results, register the exact unsaved dialog target, and
    update local fixtures without routing tab buttons/menus through the bus.
11. Update shared test rendering with real CommandBus/FocusService providers and
    injectable domain boundaries. Do not reintroduce a no-op command provider.
12. Delete every file/symbol in the ledger and update stale comments.

Structural gate before typecheck:

```bash
cd /Users/shaul/Desktop/D/platform
rg -n "activeArea|activeEditorCommandDispatch|activeEditorSurface|editorFocusRequestId|consumeEditorFocusRequest|requestEditorFocus|setActiveEditorCommandDispatch|dispatchEditorCommand|setFocusArea|clearFocusArea|createFocusStore" apps/web/src apps/web/test
rg -n "requestFileTreeCommand|TreeCommandKind|TreeCommandRequest|TreeCommandStore|TreeCommandsProvider|TreeCommandsContext|createTreeCommandStore|useTreeCommandRequest" apps/web/src apps/web/test
rg -n "AppCommandSurface|MenuCommandProvider|MenuCommandStore|PlatformCommandDispatch|usePlatformCommandDispatch|WorkspaceCommandContext|setCommandDispatch|useMenuCommand" apps/web/src apps/web/test
rg -n "command-enablement|commandRequirement|commandDisabledReason|isCommandDisabled|workspaceOptionalCommandIds" apps/web/src apps/web/test
rg -n "requires:" apps/web/src/keymap
rg -n "@/features/" apps/web/src/lib/focus
cd apps/web
bun run typecheck
```

Expected: every legacy grep is silent, `lib/focus` has no feature imports, and
typecheck exits 0. Separately confirm the five package-tree counters still exist.

### Step 3: Prove metadata, enablement, async behavior, and close

Required focused assertions:

- table IDs are unique; there are exactly 140; every row has all four new
  metadata fields; specs/defaults still derive from the same rows;
- every Platform menu ID is registered; the four added rows are hidden; the 38
  Editor-local IDs remain absent;
- keyboard, palette, and menu inspection return the same reason for the same
  snapshot/origin/target;
- read-only target blocks text edits but permits navigation/find/selection;
- key conflicts and user overrides retain current precedence;
- disabled or sync-unhandled commands do not prevent/stop; claimed commands and
  reserved null bindings do;
- all 39 async commands settle through tickets; bus-owned rejection reports
  once, while plan 059 failure remains domain-owned once;
- palette waits, records/closes only on handled/deferred, and clears both kinds
  of hover preview on every dismissal path;
- close returns closed/deferred/busy/not-found; the dirty case waits for the
  exact dialog autofocus and never calls direct close;
- menu command/radio rows use captured origin and shared availability;
- direct file/script/session palette actions acknowledge Editor/terminal/keyed
  composer respectively.

Run the focused node and DOM commands from **Verification commands**. Then rerun
plan 059's focused settings/appearance gates.

### Step 4: Prove real focus and trusted-key behavior

Add a `proofKeyPress` browser command in `vitest.browser.config.ts` using
Playwright `context.page.keyboard.press`. Type its augmentation in the browser
test. Do not synthesize `KeyboardEvent` for acceptance behavior.

The browser tests must prove:

- a tree command dispatched before tree mount stays pending until actual
  shadow-DOM focus acknowledges it;
- failed tree reveal rejects without changing owner;
- palette autofocus owns `command-palette` and palette close restores the
  captured origin unless a command acknowledged another destination;
- Base UI does not perform a competing final-focus restoration;
- two simultaneous Editor targets route by event path/origin and unmounting one
  cannot clear the other;
- eventless menu/palette dispatch uses captured acknowledged Editor, never most
  recently mounted Editor;
- text edit is disabled on search/diff read-only target and cannot fall through
  to a background writable Editor;
- editor, Git, terminal, search, problems, settings, and dirty-close ownership
  changes only after matching `focusin`;
- existing tree row selection still opens/reveals a tab without stealing focus;
- a disabled/unhandled trusted shortcut remains available to the browser, while
  a claimed shortcut and reserved null chord are suppressed.

Run the browser command from **Verification commands**. Reuse the running dev
server; never start another.

### Step 5: Final gates and handoff

Run all final commands from **Verification commands** and compare failure
identity with Step 0. Compare `git status --short` to
`/tmp/plan-062-before.txt`; only the reviewed scope belongs to this plan.

Do not execute plans 056, 057, 060, or 061 here. Reconcile their status notes:

- 056 consumes `ticket.claimed` and adds no active Editor pointer;
- 057 extends this target/when runtime and owns native keymap takeover;
- 061 follows 060 and 062 and preserves its activation transaction in the
  shared Editor domain action.

Then apply the repository plan cleanup policy: remove completed plan 062 and
its inventory row only after implementation and every completion check are
verified. Plan 058 remains historical/superseded until repository maintainers
remove it under that policy; it is never executable.

## Done criteria

- [ ] `platformCommands`/`platformCommand()` is still the only production
      command definition/lookup.
- [ ] The table has 140 unique rows; every row declares target, closed-union
      `when`, execution, and undo category.
- [ ] The four text-menu gaps are hidden registered rows; all other current
      Platform surfaces reject metadata-less IDs; the 38 named IDs stay
      Editor-local.
- [ ] Every Platform keymap/palette/menu/programmatic call uses the same bus
      inspection/dispatch contract. The remaining native Editor key path is
      explicitly reserved for plan 057.
- [ ] Key suppression follows synchronous `ticket.claimed`; reserved null
      bindings retain existing browser protection.
- [ ] Every async-row Platform handler returns a synchronous start result, and
      each started operation settles through non-rejecting completion with
      failure reported exactly once under its real owner.
- [ ] Plan 059 preview remains write-free and its mutation path remains singular.
- [ ] Dirty close distinguishes closed/deferred/busy/not-found and deferred
      waits for exact dialog focus ownership.
- [ ] Focus ownership comes only from actual `focusin`; requests resolve
      acknowledged/rejected/superseded without a correctness timeout.
- [ ] Editor/search/diff/tree/Git/logs/terminal/problems/chat/palette/settings/
      dirty-dialog/shell targets are identity-safe and deterministic.
- [ ] Base UI implicit final-focus restoration cannot race FocusService.
- [ ] Every legacy counter, forwarded callback, and active pointer in the ledger
      is deleted; the five private tree counters and local domain actions remain.
- [ ] No document, file-sync, SettingsSync, Editor history, or cross-resource
      undo service was recreated, wrapped, moved, or paralleled.
- [ ] Focused node/DOM/browser tests and web typecheck/lint/format/full-suite
      baseline-delta gates pass.
- [ ] No pre-existing user work was reverted or overwritten.
- [ ] Plans 056/057/061 are left with explicit reconciliation instructions, not
      silently executed against stale architecture.

## STOP conditions

STOP and report rather than improvise when:

- plan 059 is not complete, color-mode preview still dispatches/writes, or the
  semantic settings action cannot expose its existing settlement without a
  second mutation path;
- plan 056/057 has already introduced `activeEditorSurface`, another target
  registry, conflicting `when` semantics, chords, or native takeover without
  reconciliation;
- an in-scope uncommitted user edit overlaps the symbols this plan changes;
- the authoritative table/spec/default-binding relationship has drifted;
- implementation appears to need a second command table/handler map, dual old
  and new providers, a nullable/no-op fallback, compatibility alias, state
  migration, or focus-success timeout;
- a target cannot produce observable DOM `focusin`, reject a failed intent, or
  remain identity-safe independent of mount order;
- Base UI focus restoration cannot be disabled through the explicitly scoped
  primitive/popup seams;
- an Editor action needs arguments beyond `{ event? }`, async/cancellation/
  structured failure/undo settlement, or Editor-private enablement facts;
- implementation requires editing `/Users/shaul/Desktop/D/Editor/**`;
- command work starts duplicating/moving `WorkspaceDocumentService`,
  `FileSyncService`, SettingsSyncService, document-state ownership, save logic,
  or `DocumentSession` history;
- a package-tree private counter must be removed to make Platform focus work;
- dirty-close widening reaches an unlisted Platform-owned call site;
- a production file outside **Exact Platform file scope** must change;
- a focused baseline-passing test regresses after one reasonable correction, or
  a verification gate fails twice;
- verification would require a second dev server or synthetic browser input for
  trusted-key/focus acceptance.

## Maintenance notes

- Reviewer priority: target-resolution order, identity-safe unregister,
  claimed-before-suppression, overlay origin/final-focus ownership, dirty-close
  deferred semantics, and exactly-once async failure reporting.
- Adding a command without target/when/execution/undo must fail typecheck or the
  table test.
- `undoCategory` describes ownership; only text-edit maps to Editor
  `DocumentSession` history today.
- When plan 056 lands, chord state remains keymap-local and dispatch remains
  bus-owned. When plan 057 lands, it can disable native Editor maps without
  replacing target/focus ownership.
- If E3 later adds contributed commands or quick-input providers, deliberately
  extend the authoritative typed registry. Never revive mutable active-dispatch
  publication.
