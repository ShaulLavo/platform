# Plan 058: Cut Platform commands and focus over to one typed runtime

> **Executor instructions**: Read this plan completely before editing. Then read
> `/Users/shaul/Desktop/D/platform/AGENTS.md`, `PLAN.md`, the E3 section of
> `docs/editor-parity-implementation-plan.md`, and
> `/Users/shaul/.agents/skills/never-nester/SKILL.md`. Follow the steps in order,
> run every verification gate, and stop on any condition in **STOP conditions**.
> Work in the current worktree. Do not create a branch, worktree, commit, push,
> or PR unless the operator explicitly asks.
>
> This is a greenfield cutover. Do not add an adapter that supports both the old
> and new dispatch/focus paths, an alias for an old API, persisted-state healing,
> or a timeout that pretends focus succeeded. Temporary compile breakage is
> acceptable _inside_ the atomic cutover step; its exit gate must be green.
>
> **Drift check (run first)**:
>
> ```bash
> cd /Users/shaul/Desktop/D/platform
> git diff --stat 3c1b324a..HEAD -- \
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
>   apps/web/src/features/chat-mode/providers/session-context.ts \
>   apps/web/src/features/command-palette \
>   apps/web/src/features/editor/components \
>   apps/web/src/features/editor/hooks/use-dirty-tab-close.tsx \
>   apps/web/src/features/editor/utils/file-backed-document.ts \
>   apps/web/src/features/editor/utils/text-menu.ts \
>   apps/web/src/features/git/components/panel.tsx \
>   apps/web/src/features/logs/components/panel.tsx \
>   apps/web/src/features/menus \
>   apps/web/src/features/search/components \
>   apps/web/src/features/settings/components/dialog.tsx \
>   apps/web/src/features/settings/hooks/use-settings-actions.ts \
>   apps/web/src/features/terminal/components/panel.tsx \
>   apps/web/src/features/workbench \
>   apps/web/src/features/workspace \
>   apps/web/test/render.tsx \
>   apps/web/vitest.browser.config.ts
> git status --short > /tmp/plan-058-before.txt
> git status --short -- \
>   apps/web/src apps/web/test apps/web/vitest.browser.config.ts
> ```
>
> At planning time `HEAD` was `3c1b324a`. The worktree was not clean: a separate,
> user-owned loading-state change touched
> `apps/web/src/features/workspace/components/tree-pane.tsx`, but only its imports,
> loading/error branches, and old `TreeStatus` helper—not the command queue or
> focus code at current lines 205–306. A second user-owned change replaces the
> saving icon with the shared `Spinner` in
> `features/editor/components/unsaved-changes-dialog.tsx`; preserve that import
> and rendering while adding the focus target. Other user-owned UI changes were
> also present outside this plan. Never revert, stash, overwrite, or format them.
> If an in-scope dirty edit now overlaps the symbols named below, STOP and ask
> the operator to reconcile ownership.

## Status

- **State**: Ready; execute before plans 056 and 057
- **Priority**: P1
- **Effort**: XL
- **Risk**: HIGH — app-wide keyboard suppression, dirty close, async persistence,
  floating UI, shadow-DOM tree focus, and multiple Editor mounts meet here
- **Depends on**: none; plan 055 is independent
- **Blocks**: plan 056 until its dispatch/focus sections are reconciled; plan 057
  until its target-registry and enablement phases are rebased onto this runtime;
  E3 substrate S1
- **Category**: architecture / correctness
- **Planned at**: Platform commit `3c1b324a`, 2026-08-23

## Why this matters

Platform already has one good command metadata table, but execution is split
across a synchronous callback, a mutable menu pointer, a last-writer Editor
pointer, native Editor keymaps, palette prechecks, and optimistic focus labels.
Keyboard dispatch does not enforce enablement, prevents browser behavior before
knowing whether a handler accepted the key, and logs success before detached
promises settle. Focus requests are counters with no correlation or DOM
acknowledgement, so a request can replay on the wrong Editor and a cleanup can
erase a newer dispatch pointer.

After this plan, `platformCommands` remains the sole Platform registry. A typed
`CommandBus` resolves the live context and exact target, enforces the same
preconditions for keyboard/palette/menu/programmatic calls, returns a non-
rejecting completion outcome, catches sync and async failures, and records one
wide command event. A non-React `FocusService` owns registered DOM targets,
actual focus ownership, pending transitions, and explicit results. No document,
file-sync, Editor history, or cross-resource undo implementation moves into the
bus.

## Roadmap and existing-plan relationship

The load-bearing roadmap requirements are:

- `PLAN.md:29-30` — add a typed CommandBus and replace focus counters/active
  dispatch pointers with a FocusService.
- `PLAN.md:58-63` — commands declare target, preconditions, async behavior and
  undo category; keyboard routes through real targets; the gate covers disabled
  states, focus transitions, conflicting shortcuts, async failures and dirty
  close.
- `docs/editor-parity-implementation-plan.md:27` — do not build parity work on
  React-effect wiring that the roadmap is scheduled to delete.
- `docs/editor-parity-implementation-plan.md:35` — E3 S1 is the metadata registry
  on the roadmap CommandBus. Extend the live registry; never create a second one.

Creation order is not execution order. This plan must land before 056 because
056 currently proposes renaming `activeEditorCommandDispatch` to another global
slot, `activeEditorSurface`, solely to route multi-stroke Editor commands. Do not
create that intermediate slot. After 058:

- Reconcile plan 056 before executing it. Its chord machine calls this bus and
  suppresses a completed binding from `ticket.claimed`; remove its planned
  `activeEditorSurface` changes; mark D16 (`requires` absent from keystroke
  dispatch) satisfied; preserve its trie, timer, composition, prefix, collision,
  indicator and settings-schema work.
- Reconcile plan 057 after 056. Its Phase 4 editor-surface registry is satisfied
  by this FocusService and must be deleted from that plan. Its Phase 6 takeover
  consumes this bus/target resolver and existing `proofKeyPress`; its Phase 7
  extends the same `keymap/utils/when.ts` keys for binding-specific predicates
  instead of replacing command enablement.

## Current state

### One metadata table, several execution paths

- `apps/web/src/keymap/table.ts:8-16` builds `platformCommands`, its sole `byId`
  map, and `platformCommand()`.
- `apps/web/src/keymap/command-registry.ts:4-41` derives
  `platformCommandSpecs` and hotkey metadata from that table. Preserve this
  projection and extend it with the new fields.
- `apps/web/src/keymap/default-bindings.ts:25-32` also derives defaults from the
  table. Do not hand-author a second binding or command list in the bus.
- The current table has 55 workspace rows (including nine generated session
  jumps) and 81 Editor rows. `EditorCommandId` has 123 values, so 42 Editor-local
  IDs currently have no Platform metadata.
- `apps/web/src/keymap/define-command.ts:45-73` gives every workspace handler a
  26-field `WorkspaceCommandContext`, including 17 function-valued fields.
- `apps/web/src/keymap/commands.ts:28-147` reconstructs that bag, routes
  `editor.*` through the focus pointer, invokes workspace `run`, treats `void`
  as handled, and emits a synchronous `workspace.command` log.

### Enablement is presentation-only

- `apps/web/src/keymap/command-enablement.ts:10-34` evaluates six coarse
  `requires` values from only `{ activeFilePath, hasWorkspace }`.
- Palette checks occur in
  `apps/web/src/features/command-palette/content.tsx:164-205`; menu checks occur
  in `apps/web/src/features/menus/utils/resolve.ts:139-155`.
- `apps/web/src/keymap/use-app-keymap.ts:77-88` does no command enablement,
  prevents/stops first, and discards the dispatch result. A disabled or
  targetless key is therefore swallowed.

### Focus state is intention, not ground truth

- `apps/web/src/features/workspace/providers/focus-state.ts:18-30` combines
  `activeArea`, `activeEditorCommandDispatch`, and `editorFocusRequestId`.
- `requestEditorFocus` at current lines 68–72 claims `editor` and increments
  before DOM focus. `Editor` reads every nonzero value at
  `features/editor/components/editor.tsx:191-196`, never acknowledges it, and
  publishes/clears a singleton dispatch at lines 198–204.
- Search-result Editors publish the same singleton at
  `features/search/components/result-file-editor.tsx:148-153`; their parent can
  clear another surface's pointer at
  `result-editor-surface.tsx:148-152`. Diff panes mount real Editors but publish
  nothing.
- `features/workspace/state/tree-command-store.ts` adds a second app-level
  counter (`nextRequestId`) for `focus`, `open-search`, and `reveal-active`.
  `tree-pane.tsx:288-293` acknowledges immediately even when the underlying
  focus attempt returned false.
- Sidebar/bottom-panel clicks and workspace commands call `setFocusArea` before
  or without actual focus. `problems` exists in `FocusArea` but has no real
  writer; the command palette has no focus area at all.

### Async results and dirty close are flattened

- `workspace-commands.ts:81-93` detaches save/revert promises; current detached
  sites are save (`:307-327`), save-all (`:331-340`), open-at-HEAD (`:362-372`),
  revert (`:377-386`), and clipboard (`:569-587`). Their local catch calls
  `reportCommandError`, after dispatch already logged handled.
- `features/settings/hooks/use-settings-actions.ts:38-74` uses
  `mutation.mutate`, so `toggleDiffViewMode`, `toggleWallpaper`, and the three
  color-mode setters cannot expose their settlement to dispatch.
- `features/editor/hooks/use-dirty-tab-close.tsx:18-91` returns one boolean for
  “closed”, “dirty dialog opened”, “another close is pending”, and “no target”.
  `workspace-commands.ts:74-79` ignores it and always reports handled when a tab
  id exists.
- Palette records recency and closes immediately for every result except literal
  `false` (`command-palette/content.tsx:176-205`).

## Required design

### 1. The existing table remains authoritative

Do not create `commandDefinitions`, a second ID map, or a handler registry keyed
separately from `platformCommands`. Production `CommandBus` receives
`platformCommand` as its lookup function. Tests may inject a tiny lookup fixture;
that is a boundary, not another production registry.

Extend each resolved table entry with these fields:

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

type CommandUndoCategory = 'file-operation' | 'text-edit' | 'view-only' | 'workspace-operation'

type CommandExecution = 'async' | 'sync'
```

`target` replaces the current `kind` discriminant; do not carry both fields.
It names the execution receiver: `workspace` resolves the one injected Platform
runtime, while `editor` resolves one identity-safe registered Editor from the
invocation/origin/current/active-tab chain below. A command's requested focus
destination is a separate typed FocusService selector returned/used by its
handler; it is never an untyped callback or last-mounted pointer.

`requires` is deleted, not translated at runtime. `when` is an ANDed closed
union with no parser, `or`, or user-authored expression. Two rows can represent
an OR later. The bus and every presentation surface call the same evaluator in
`keymap/utils/when.ts`.

Assign workspace `when` values exactly; do not preserve handler-only checks as
optimistic enablement:

- `[]`: `workspace.showCommandPalette`, `workspace.showSettings`,
  `workspace.openFilePicker`, `workspace.selectColorMode`,
  `workspace.selectColorTheme`, `workspace.setDarkTheme`,
  `workspace.setLightTheme`, `workspace.setSystemTheme`, and
  `workspace.toggleWallpaper`.
- `['workspaceOpen', 'chatMode']`: `workspace.newSession`,
  `workspace.nextSession`, `workspace.previousSession`,
  `workspace.toggleSessionRail`, and all nine generated
  `workspace.jumpToSession1` … `workspace.jumpToSession9` rows.
- `['tabOpen']`: `workspace.quickOpenPreviousEditor`,
  `workspace.closeCurrentTab`, `workspace.focusFirstEditorGroup`,
  `workspace.focusSecondEditorGroup`, `workspace.focusThirdEditorGroup`, and
  `workspace.focusEditor`. A missing previous/group-specific destination is
  still an honest handler-declined or target-unavailable outcome.
- `['saveableTab']`: `workspace.saveFile`.
- `['fileBackedTab']`: `workspace.gotoSymbol`,
  `workspace.compareWithSaved`, `workspace.openFileAtHead`,
  `workspace.revertFile`, and `workspace.revealActiveFileInTree`.
- `['workspaceOpen']`: every remaining workspace row—exactly
  `workspace.showQuickAccess`, `workspace.openSearchEditor`,
  `workspace.quickOpenView`, `workspace.showAllEditors`,
  `workspace.saveAllFiles`, `workspace.reopenClosedEditor`,
  `workspace.toggleSidebarVisibility`, `workspace.togglePanel`,
  `workspace.focusFileTree`, `workspace.findInFileTree`,
  `workspace.focusGit`, `workspace.copyAddress`, `workspace.navigateBack`,
  `workspace.navigateForward`, `workspace.revealChat`,
  `workspace.revealTerminal`, `workspace.newIsolatedSession`,
  `workspace.toggleDiffViewMode`, `workspace.toggleUiMode`,
  `workspace.showChatMode`, and `workspace.showWorkbenchMode`.

All Editor rows use the helper-derived `editorTarget`; only the explicit
`text-edit` rows below add `editorWritable`. No command handler may weaken these
metadata gates with a compatibility fallback.

Workspace `run` must return an explicit disposition; no implicit `void`:

```ts
type SyncCommandDisposition = 'deferred' | 'handled' | 'unhandled'
type AsyncCommandDisposition = Promise<SyncCommandDisposition>
```

Make `execution` discriminate the handler type. Editor entries have no Platform
handler; `defineEditorCommand` stamps `target: 'editor'` and
`execution: 'sync'` because the current Editor contract is synchronous boolean.
Every Editor row must explicitly state its undo category. The helper derives
`when: ['editorTarget', 'editorWritable']` for `text-edit` and
`when: ['editorTarget']` for `view-only`.

Add hidden metadata rows for the four Editor IDs already used by the Platform
text menu but absent from the table, preserving their current menu-only
visibility:

- `editor.action.goToImplementation`
- `editor.action.goToTypeDefinition`
- `editor.action.peekDefinition`
- `editor.action.revealDefinitionAside`

Then narrow the bus/menu/keybinding-facing `PlatformCommandId` to registered
rows and delete `commandRequirement()`'s metadata-less fallback. Keep a
separate `EditorPlatformCommandId = editor.${EditorCommandId}` type only at the
Editor adapter boundary. A new Platform menu/key/palette exposure must now add a
metadata row in the same pass.

### 2. Dispatch is two-phase and never rejects its caller

Implement this semantic shape in `keymap/state/command-bus.ts`; names may vary
only if the same invariants remain obvious:

```ts
type CommandSource =
  | { kind: 'keybinding' }
  | { kind: 'menu'; surface: MenuSurfaceId }
  | { kind: 'palette'; preview: boolean }
  | { kind: 'programmatic'; caller: string }

type CommandDispatchTicket = {
  readonly claimed: boolean
  readonly completion: Promise<CommandOutcome>
}

type CommandOutcome =
  | { status: 'handled' }
  | { status: 'deferred'; reason: 'dirty-close' }
  | { status: 'disabled'; reason: string }
  | { status: 'unhandled'; reason: 'handler-declined' | 'target-unavailable' }
  | { status: 'failed'; error: ClientError }
```

Required behavior:

1. `inspect(id, invocation)` looks up the live table row, captures current app
   state once, resolves the target, and evaluates `when`. It returns a typed
   ready/disabled result and reason without running the handler. No compatible
   target at inspection time is disabled; `target-unavailable` is reserved for
   a target that disappears/refuses between a ready inspection and invocation.
2. `dispatch(id, invocation)` repeats inspection at invocation time, executes
   only a ready command, catches synchronous throws and promise rejections, and
   always resolves `completion`; consumers must never need a detached `.catch`.
3. `claimed` is false for disabled, targetless, or synchronously declined work;
   true for handled/deferred work and for an accepted promise. An async race may
   settle `unhandled` later, but the key was legitimately claimed when work
   began.
4. Editor boolean `true/false` adapts to handled/unhandled. Do not infer or await
   Editor plugin work that its current contract does not expose.
5. Each dispatch creates one `createWideEventScope` event with
   `action: 'command.dispatch'`, `area: 'command'`, command id, source, resolved
   target kind/id, execution, undo category, disabled reason if any, final
   outcome, and duration. Remove the old synchronous workspace log. The bus
   calls `reportError(toClientError(error))` once for failed Platform-owned work.

`WorkspaceCommandContext` is deleted. Replace it with a provider-local runtime
object built once per bus identity and grouped by domain capability, not 17
callbacks rebuilt per invocation:

- current `EditorDocumentStoreApi` plus `QueryClient` for the existing save and
  revert functions;
- current `EditorWorkspaceStoreApi` for a one-time per-invocation snapshot;
- the existing `useEditorCommands()` domain actions;
- `FocusService`;
- the existing `useOpenFileAtRef()` function;
- the real dirty-close request from `EditorTabActionsProvider` (no fallback);
- palette/settings/theme shell actions owned by `CommandProvider`;
- the promise-returning settings action described below.

This is dependency injection, not new state ownership. Handlers continue to call
the existing domain services and helpers.

### 3. FocusService owns targets, transitions, and acknowledgements

Implement `lib/focus/state/service.ts` as a non-React external service with a
stable immutable snapshot and `subscribe`. It belongs in `lib/focus` because
Editor, chat, search, Git, logs, terminal, workbench, workspace and keymap all
consume it; it must import none of those features. Zustand is not the owner. The
snapshot contains:

- `currentOwner`: the registered target that contains the most recent actual
  `focusin`, or `global`/null when no registered target contains it;
- `requestedTransition`: at most one pending transition record (not a public
  rerender counter);
- `transitionResult`: the latest `acknowledged`, `rejected`, or `superseded`
  result;
- the last acknowledged compatible command target, retained while a palette or
  menu temporarily owns DOM focus.

Target registrations are identity-safe tokens. Unregistering token A must never
remove replacement token B. Each target provides its element, focus area,
capabilities, and an intent handler. Current target kinds are:

- normal/Settings Editor: `area: 'editor'`, Editor dispatch capability,
  `writable: true`, active tab id;
- search-result file Editor: nested Editor target, `writable: false`;
- diff pane: Editor target, `writable: false`, tab id and side;
- each `workspace/components/search-pane.tsx` root: `area: 'search'`, covering
  its query controls and compact results tree; a nested search-result Editor
  still wins by composed-path depth;
- file tree: `area: 'file-tree'`, intents `focus`, `open-search`,
  `reveal-active`;
- Git, logs, terminal and problems panel roots;
- chat composer: `area: 'global'`, distinct `chat-composer` capability keyed by
  workspace/project whose intent focuses the real Lexical editor and waits for
  its `focusin`;
- command palette: new `area: 'command-palette'`;
- unsaved-changes dialog: global overlay target keyed to its pending close;
- folderless Settings dialog and the app shell: `area: 'global'`.

The transition contract is explicit and non-rejecting:

```ts
type FocusTransitionOutcome =
  | { status: 'acknowledged'; targetId: FocusTargetId }
  | { status: 'rejected'; reason: 'destination-invalid' | 'refused' | 'unregistered' }
  | { status: 'superseded'; by: FocusRequestToken }

type FocusTransitionTicket = {
  readonly token: FocusRequestToken
  readonly completion: Promise<FocusTransitionOutcome>
}
```

`FocusRequestToken` is opaque per request, not a public render counter. A target
acknowledges only the pending token it attempted; a stray `focusin` may update
actual ownership but cannot complete a different transition.

The provider installs one document-level capture `focusin` listener. Resolve the
deepest registered element from `event.composedPath()` so a nested read-only
search Editor beats its search-results parent and shadow-DOM tree focus is
observable. Registration also checks whether its element already contains the
active element, covering mount-after-focus.

Target resolution order is deterministic:

1. deepest compatible target in the invocation event's composed path;
2. explicit origin captured when a palette/menu opened;
3. current compatible owner;
4. exact active-tab/area selector supplied by the command runtime;
5. last acknowledged compatible target.

If multiple targets remain without an exact selector, return unavailable. Never
choose mount order, last writer, or an identity-free global dispatch slot.

`requestFocus(request)` returns a non-rejecting completion. If no matching
target is mounted yet, retain the transition and attempt it when the target
registers. Set `currentOwner` only after a matching `focusin` acknowledgement.
Resolve an old request as superseded when a newer one replaces it; reject a
matched target that refuses the intent or unmounts after attempting it. Do not
use a timeout as correctness proof.

Sidebar and bottom-panel tab clicks first update layout, then request the exact
files/Git/logs/search/terminal/problems target. They never write ownership
directly. If the destination refuses focus, the clicked tab button remains the
actual owner and the transition rejects. Terminal cursor appearance follows
real focus/blur while the service independently observes the same DOM events.

Use the existing tree controller to perform tree-local focus/search/reveal. Its
actual DOM `focusin` acknowledges the Platform transition. Preserve the tree
package's private `#focusRequestId`, `#pendingFocusRequestId`,
`#searchFocusRequestId`, `processedFocusRequestIdRef`, and `#scrollRequestId`:
they synchronize internal shadow-DOM rows/search/scroll and are not the app-level
owner/dispatch protocol. Also preserve unrelated Git generation and chat RPC
`nextRequestId` counters.

### 4. Overlay origins and focus restoration are explicit

- `CommandProvider` sits above the titlebar and workspace, owns resolved
  bindings plus palette/settings open state, creates the bus, and provides it
  directly through `keymap/providers/command-context.ts`. It renders the app
  keymap, palette and folderless settings dialog. Delete `AppCommandSurface`.
- Opening the command palette captures the current FocusService origin before
  changing state. Capture only on the closed→open edge; mode/search changes
  inside an open palette must not replace the origin with the palette itself.
  Its `Command` root registers `command-palette` and the Base UI autofocus
  `focusin` acknowledges the transition.
- Palette command rows use `bus.inspect`; selection dispatches with the captured
  origin and awaits `completion`. Record MRU and close only for `handled` or
  `deferred`; keep the palette open for disabled, unhandled or failed outcomes.
  `keepsPaletteOpen` still wins. Do not record preview dispatches.
- On palette close, request the handled command's explicit destination when it
  has one; otherwise restore the still-live captured origin. Direct quick-input
  actions must also choose a destination explicitly instead of relying on Base
  UI's implicit trigger restoration: file/line/symbol → the selected Editor
  target, script → terminal, and session/draft → `chat-composer` after its mode
  and project are selected. A cross-project session action awaits the existing
  `openWorkspaceRoot` result before requesting a composer keyed to that project;
  it must not let the old project's composer acknowledge the transition.
- `MenuSurface` captures an origin from `anchor.contextElement` or the active
  trigger when it opens. `useResolvedMenu` uses that same origin for inspection
  and dispatch. Menu command failure may close the transient menu, but its
  completion is caught/reported by the bus and can never become an unhandled
  rejection.
- Replace titlebar's `runCommand` radio callback with a command-backed radio
  model resolved by the menu runtime. Local menu actions such as copying the
  displayed workspace path remain local actions.

### 5. Async settings and dirty close expose honest results

In `use-settings-actions.ts`, keep one React Query mutation and cache-success
path. Remove hook-level `onError`; existing UI `mutate` calls pass
`notifySaveError` as their per-call error callback. Add `setSettingAsync` using
the same mutation's `mutateAsync` without that callback so the CommandBus owns
its rejection and reports it once. Do not call `saveSettings` through a second
path.

Convert these detached or mutation-backed workspace operations to awaited
handlers and delete `runFileLifecycle`, `runSaveLifecycle`,
`reportCommandError`, and all local `.catch(reportCommandError)` calls:

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

Focus-changing commands also use async execution because completion includes a
real focus acknowledgement. This set is exact:

- palette/dialog openers: `workspace.showQuickAccess`,
  `workspace.showCommandPalette`, `workspace.quickOpenView`,
  `workspace.gotoSymbol`, `workspace.showAllEditors`,
  `workspace.selectColorMode`, `workspace.selectColorTheme`, and
  `workspace.showSettings`;
- editor-group transitions: `workspace.openSearchEditor`,
  `workspace.quickOpenPreviousEditor`, `workspace.compareWithSaved`,
  `workspace.openFileAtHead`, `workspace.reopenClosedEditor`,
  `workspace.closeCurrentTab`, `workspace.focusFirstEditorGroup`,
  `workspace.focusSecondEditorGroup`, `workspace.focusThirdEditorGroup`,
  `workspace.focusEditor`;
- panel transitions: `workspace.toggleSidebarVisibility`,
  `workspace.togglePanel`, `workspace.focusFileTree`,
  `workspace.findInFileTree`, `workspace.revealActiveFileInTree`,
  `workspace.focusGit`, `workspace.revealTerminal`;
- layout/chat transitions: `workspace.revealChat`,
  `workspace.newIsolatedSession`, `workspace.toggleUiMode`,
  `workspace.showChatMode`, and `workspace.showWorkbenchMode`. Chat-bound
  transitions acknowledge `chat-composer`; workbench-bound transitions
  acknowledge the exact still-live last workbench target or active Editor,
  otherwise the app shell.

The union of the operation and focus lists above is the exact set of
`execution: 'async'` workspace rows; duplicate `workspace.openFileAtHead` is one
row. Every other workspace row and every Editor row is `execution: 'sync'`.

Change dirty-close's boolean to a discriminated result that distinguishes
`closed`, `deferred`, and rejected (`busy`/`not-found`). UI callers may ignore
the richer value. `workspace.closeCurrentTab` returns deferred only when the
unsaved-changes flow accepted ownership and opened its dialog; it must not use
the current direct `closeTab` fallback. The deferred result carries the pending
close identity; the handler requests that exact unsaved-dialog target and waits
for its real autofocus `focusin`. The deferred command is complete when the
dialog owns the decision, not when the user eventually saves/discards.

Keep the existing tab UI path local: `tab-actions-context.ts`,
`tab-actions-provider.tsx`, `use-editor-tab-actions.ts`,
`editor-tab-button.tsx`, `use-editor-tab-menu.ts`, and `editor-tab-menu.ts` may
ignore the richer return exactly as they ignore the boolean today. Only the bus
interprets close outcomes; do not turn buttons or tab menus into a second
command-dispatch path. Update their existing focused tests only where the return
type fixture must become explicit.

### 6. Undo categories are metadata boundaries, not a new undo service

Assign every row exactly one of the four categories. The compiler/test must fail
if a row is missing one.

Registered Editor `text-edit` rows are exactly:

- `editor.undo`, `editor.redo`, `editor.replaceOne`, `editor.replaceAll`;
- `editor.deleteBackward`, `editor.deleteForward`, `editor.deleteWordLeft`,
  `editor.deleteWordRight`, `editor.indentSelection`, `editor.outdentSelection`;
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
  `editor.editor.action.rename`,
  `editor.editor.action.formatDocument`.

Every other registered Editor row, including the four hidden navigation rows
added above and `editor.editor.action.moveSelectionToNextFindMatch`, is
`view-only`. The latter changes selection state, not document text.
`text-edit` is disabled on a read-only target; `view-only` may run there.

Workspace categories:

- `file-operation`: `workspace.saveFile`, `workspace.saveAllFiles`,
  `workspace.revertFile`.
- `workspace-operation`: `workspace.copyAddress`,
  `workspace.newIsolatedSession`, `workspace.newSession`,
  `workspace.toggleDiffViewMode`, `workspace.toggleWallpaper`,
  `workspace.setDarkTheme`, `workspace.setLightTheme`,
  `workspace.setSystemTheme`.
- `view-only`: every other workspace row, including open-at-HEAD (it reads and
  opens a view), tab/layout/focus/navigation/palette/session-selection commands.

There is no Platform undo stack in this plan. Editor `DocumentSession` remains
the only text-history owner. File/workspace categories are declarations for
future explicit transactions; they are not made undoable here.

## Exact legacy deletion ledger

Delete these names and paths in the atomic cutover; do not leave deprecated
exports or wrappers.

### App-level focus counters and pointers

- From `features/workspace/providers/focus-state.ts` (then delete the file):
  optimistic `activeArea`, `editorFocusRequestId`, `consumeEditorFocusRequest`,
  `requestEditorFocus`, `activeEditorCommandDispatch`,
  `EditorCommandDispatch`, `dispatchEditorCommand`,
  `setActiveEditorCommandDispatch`, `setFocusArea`, dead `clearFocusArea`, and
  the old Zustand `FocusStore`/`createFocusStore`/`FocusContext` selector
  contract. Move and extend only the `FocusArea` type; do not preserve the old
  state shape. Delete sibling `focus-provider.tsx`; `App.tsx` mounts the new
  feature-neutral `lib/focus/providers/provider.tsx` directly.
- From `features/editor/components/editor.tsx`: the counter-focus effect and
  pointer publication/cleanup effects.
- From `components/app-runtime-content.tsx`: `setFocusArea`,
  `handleGlobalFocusCapture`, `handleGlobalPointerDownCapture`, and
  `eventTargetsCurrentElement`; replace them with one registered shell root.
- From `features/search/components/result-file-editor.tsx` and
  `result-editor-surface.tsx`: pointer publication, identity-free cleanup, and
  optimistic area writes.
- From Git/logs/tree/terminal panel roots and sidebar/bottom-panel selectors:
  every `setFocusArea` call and pointer-down ownership write, plus dead
  `focusAreaForSidebarTab`. Target registration and acknowledged transition
  requests replace them; preserve terminal cursor styling on real focus/blur.
- Delete the app tree request protocol entirely:
  `features/workspace/state/tree-command-store.ts`,
  `providers/tree-commands-context.ts`, `providers/tree-commands-provider.tsx`,
  and `hooks/use-tree-command-request.ts`. Exact deleted protocol names are
  `TreeCommandKind`, `TreeCommandRequest`, `TreeCommandStore`,
  `createTreeCommandStore`, its `nextRequestId` counter, and its
  request/snapshot/acknowledge API. Also delete `TreeCommandsProvider` in
  `App.tsx` and request/ack consumption in `tree-pane.tsx`.
- Because 058 executes first, `activeEditorSurface` must never be introduced by
  plan 056.

Preserve `features/workspace/utils/tree-commands.ts` and
`features/workspace/tests/tree-commands.test.ts`.
`treeCommandFocusCandidate` remains the tree target's local candidate-selection
helper; it is not the deleted app queue/counter.

### Active command pointers and dispatch props

- Delete `features/menus/state/command-store.ts`,
  `features/menus/providers/command-context.ts`, and
  `features/menus/providers/command-provider.tsx`, including `dispatch`,
  `bindings`, `runCommand`, `setBindings`, `setCommandDispatch`,
  `MenuCommandStore`, `MenuCommandStoreApi`, and the publication/cleanup
  effects in `components/app-command-surface.tsx`.
- Delete `PlatformCommandDispatch` from `keymap/use-app-keymap.ts`.
- Delete the `dispatch` prop from `app-keymap-controller.tsx`,
  `features/command-palette/command-palette-types.ts`,
  `components/command-palette.tsx`, and `components/app-command-surface.tsx`.
- Delete `keymap/commands.ts` and `components/app-command-surface.tsx` after the
  provider cutover.

### Forwarded callback bags

- Delete `WorkspaceCommandContext` and all 17 function fields from
  `keymap/define-command.ts`: `openPicker`, `openFileAtRef`,
  `openSearchEditor`, `reopenClosedEditor`, `requestCloseTab`,
  `requestEditorFocus`, `requestFileTreeCommand`, `setChatModePanels`,
  `setDiffViewMode`, `setFocusArea`, `setTheme`, `setUiMode`,
  `setWallpaperEnabled`, `setWorkbenchPanels`, `showCommandPalette`,
  `showSettings`, and `selectPreviousEditor`.
- Delete `usePlatformCommandDispatch` options `requestCloseTab?`,
  `showCommandPalette = noop`, `showSettings = noop`, its
  `fallbackRequestCloseTab`, `resolvedRequestCloseTab`, and `noop`.
- Delete `EditorFrame.onActivate`; target registration plus real `focusin`
  replaces the forwarded focus callback.
- Delete titlebar `TitlebarMenuContext.runCommand`, `commandRadio(...,
runCommand)`, and `runChoice`; use command-backed radio rows.

Do **not** delete or absorb `DiffPane.onFocus` /
`useDiffPanes.handleFocus`: that callback collapses selection in the opposite
diff pane and is Editor-local split synchronization, not app focus ownership.
Keep it (rename to `onPaneFocus` only if doing so makes the distinction clearer).
Do not touch `EditorSurfaceActionsContext`; it owns tab/document surface actions,
not command dispatch.

Also preserve `features/chat-mode/state/session-commands.ts`'s
`openProjectRoot`/`setSessionProjectOpener` lifecycle and its publisher in
`features/chat-mode/providers/session-provider.tsx`. It is a chat-domain project
opener needed while that optional provider is mounted, not an active command
dispatcher. Keep its tests; do not fold it into FocusService or CommandBus.

## Editor ownership and future lockstep boundary

This plan changes `/Users/shaul/Desktop/D/Editor` by zero lines.

- `/Users/shaul/Desktop/D/Editor/packages/editor/src/editor/commands.ts:10-131`
  owns all `EditorCommandId` values and the current `{ event? }` context.
- Editor core/router/plugins own navigation, selection, find/replace, text
  editing, multi-cursor, folding, inline suggestions, LSP actions, and
  undo/redo. `/packages/react/src/index.ts:78-94,649-672` exposes
  `focus(): void` and synchronous `dispatchCommand(...): boolean`.
- Platform owns only metadata, exposure through Platform key/menu/palette
  surfaces, target selection, enablement, and adaptation of the boolean result.
  Platform's `text-edit` label does not move history out of `DocumentSession`.

After adding the four current menu rows, these 38 Editor IDs remain Editor-local
and absent from Platform metadata until a later plan exposes them:

`cursorColumnSelectDown`, `cursorColumnSelectLeft`,
`cursorColumnSelectPageDown`, `cursorColumnSelectPageUp`,
`cursorColumnSelectRight`, `cursorColumnSelectUp`, `cursorRedo`, `cursorUndo`,
`cursorWordPartLeftSelect`, `cursorWordPartRightSelect`, `deleteWordPartLeft`,
`deleteWordPartRight`, `editor.action.autoFix`, `editor.action.goToDefinition`,
`editor.action.inlineSuggest.acceptNextWord`,
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

Plan 057 will add metadata in the same pass for the subset its Editor keymap pack
exposes. A future cross-repository lockstep change is required only when one of
these boundaries changes:

- an Editor ID used by Platform is added, renamed, or removed;
- Platform must pass arguments beyond the optional `KeyboardEvent`;
- Editor dispatch becomes async, cancellable, or returns structured
  failure/deferred/undo data;
- enablement needs Editor-internal facts such as find-widget visibility,
  inline-suggestion visibility, or tab-focus mode (plan 057 Phase 8);
- focus needs a correlated Editor API result instead of Platform DOM `focusin`;
- a cross-document/resource edit or undo transaction crosses the Editor and
  Platform boundary.

In particular, async format/rename/plugin failures that Editor currently detaches
remain Editor-owned and unobservable here. Do not fake success tracking in
Platform; that improvement needs the structured async contract above.

## Scope

Only Platform files are in scope. Paths marked **DELETE** must have no replacement
compatibility export.

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

### App/runtime and keymap files

- `apps/web/src/App.tsx`
- `apps/web/src/app-keymap-controller.tsx`
- `apps/web/src/components/app-runtime-content.tsx`
- `apps/web/src/components/app-workspace.tsx`
- `apps/web/src/components/command-palette.tsx`
- `apps/web/src/features/chat-mode/providers/session-context.ts`
- `apps/web/src/keymap/active-bindings.ts`
- `apps/web/src/keymap/command-registry.ts`
- `apps/web/src/keymap/define-command.ts`
- `apps/web/src/keymap/editor-commands.ts`
- `apps/web/src/keymap/editor-keymap.ts`
- `apps/web/src/keymap/table.ts`
- `apps/web/src/keymap/types.ts`
- `apps/web/src/keymap/use-app-keymap.ts`
- `apps/web/src/keymap/workspace-commands.ts`
- `apps/web/src/features/settings/hooks/use-settings-actions.ts`

### Focus targets and close behavior

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
- `apps/web/src/features/terminal/components/panel.tsx`
- `apps/web/src/features/workbench/components/bottom-panel.tsx`
- `apps/web/src/features/workbench/components/diagnostics-panel.tsx`
- `apps/web/src/features/workbench/components/sidebar-panel.tsx`
- `apps/web/src/features/workspace/components/search-controls.tsx`
- `apps/web/src/features/workspace/components/search-pane.tsx`
- `apps/web/src/features/workspace/components/tree-pane.tsx`

### Palette and menus

- `apps/web/src/features/chat/components/chat-input.tsx`
- `apps/web/src/features/chat/hooks/use-attach-to-composer.ts`
- `apps/web/src/features/command-palette/command-groups.tsx`
- `apps/web/src/features/command-palette/command-palette-data.ts`
- `apps/web/src/features/command-palette/command-palette-groups-factory.tsx`
- `apps/web/src/features/command-palette/command-palette-types.ts`
- `apps/web/src/features/command-palette/command-palette-utils.ts`
- `apps/web/src/features/command-palette/content.tsx`
- `apps/web/src/features/command-palette/view-groups.tsx`
- `apps/web/src/features/menus/components/item-row.tsx`
- `apps/web/src/features/menus/components/surface.tsx`
- `apps/web/src/features/menus/hooks/use-context-menu.ts`
- `apps/web/src/features/menus/hooks/use-resolved-menu.ts`
- `apps/web/src/features/menus/utils/model.ts`
- `apps/web/src/features/menus/utils/resolve.ts`
- `apps/web/src/features/workbench/hooks/use-titlebar-menu.ts`
- `apps/web/src/features/workbench/utils/titlebar-menu.ts`

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

- `apps/web/test/render.tsx`
- `apps/web/test/factories/command-runtime.tsx` **NEW**
- `apps/web/vitest.browser.config.ts`
- `apps/web/src/components/tests/app-titlebar.test.tsx`
- `apps/web/src/components/tests/workspace-project-menu.test.tsx`
- `apps/web/src/keymap/tests/command-bus.test.ts` **NEW**
- `apps/web/src/keymap/tests/when.test.ts` **NEW**
- `apps/web/src/keymap/tests/command-focus.browser.tsx` **NEW**
- `apps/web/src/keymap/tests/command-dispatch.test.tsx`
- `apps/web/src/keymap/tests/command-enablement.test.ts` **DELETE**
- `apps/web/src/keymap/tests/command-table.test.ts`
- `apps/web/src/keymap/tests/keymap.test.ts`
- `apps/web/src/keymap/tests/session-commands.test.ts`
- `apps/web/src/keymap/tests/use-app-keymap.test.tsx`
- `apps/web/src/features/command-palette/tests/command-list-order.test.tsx`
- `apps/web/src/features/command-palette/tests/command-palette-utils.test.ts`
- `apps/web/src/features/command-palette/tests/command-execution.test.tsx` **NEW**
- `apps/web/src/features/editor/hooks/tests/use-dirty-tab-close.test.tsx` **NEW**
- `apps/web/src/features/editor/utils/tests/file-backed-document.test.ts`
- `apps/web/src/features/editor/utils/tests/text-menu.test.ts`
- `apps/web/src/features/git/tests/panel-states.test.tsx`
- `apps/web/src/features/menus/utils/tests/resolve.test.ts`
- `apps/web/src/features/menus/utils/tests/shortcut.test.ts`
- `apps/web/src/features/workbench/components/tests/editor-tab-bar.test.tsx`
- `apps/web/src/features/workbench/utils/tests/editor-tab-menu.test.ts`
- `apps/web/src/features/workbench/utils/tests/titlebar-menu.test.ts`
- `apps/web/src/features/workspace/components/tree-pane.browser.tsx`
- `apps/web/src/lib/focus/tests/service.test.ts` **NEW**
- `apps/web/src/features/workspace/tests/tree-toolbar.test.tsx`
- `apps/web/src/features/workspace/tests/tree-commands.test.ts`
- `apps/web/src/features/workspace/tests/focus-state.test.ts` **DELETE**
- `apps/web/src/features/workspace/tests/tree-command-store.test.ts` **DELETE**

If typecheck proves another production file must change, STOP and add it to this
plan with a concrete reason before touching it. Do not solve type errors by
spreading a compatibility alias through unrelated features.

### Explicitly out of scope

- `/Users/shaul/Desktop/D/Editor/**`.
- `apps/web/src/features/editor/state/workspace-document-service.ts`,
  `file-sync-service.ts`, document-state ownership, SettingsSyncService, and
  `features/editor/utils/save.ts`. Reuse them unchanged.
- `packages/tree/**` private focus/search/scroll counters and implementation.
- A Platform undo stack, file-operation undo, WorkspaceEdit/S5, or any
  cross-resource transaction implementation.
- Multi-step chord parsing/trie/timers/settings (plan 056).
- Editor default-pack import, native keymap disablement, single-dispatcher
  takeover, and orphan key exposure (plan 057).
- Quick-input provider registry/S10, new palette modes, or visual redesign.
- New settings registry keys, localStorage keys, schema migrations, compatibility
  readers, aliases, or healing code.
- Starting another dev server.

## Commands you will need

Run from `/Users/shaul/Desktop/D/platform/apps/web` unless shown otherwise.

| Purpose          | Command                                                                                                                      | Expected success                   |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Focused node/dom | `bun --bun vitest run --project node --project dom <files...>`                                                               | exit 0; all selected tests pass    |
| Browser          | `bun run test:browser -- src/keymap/tests/command-focus.browser.tsx src/features/workspace/components/tree-pane.browser.tsx` | exit 0 in Chromium                 |
| Web typecheck    | `bun run typecheck`                                                                                                          | exit 0, no errors                  |
| Web lint         | `bun run lint`                                                                                                               | exit 0, no new diagnostics         |
| Web format       | `bun run format:check`                                                                                                       | exit 0, no new formatting failures |
| Web suite        | `bun run test`                                                                                                               | no baseline-passing test regresses |
| Diff hygiene     | `git diff --check` from repo root                                                                                            | no whitespace errors               |

Do not use bare root `bun run verify` as a completion gate. Capture per-workspace
baseline deltas; unrelated baseline failures are recorded, not fixed here.

## Steps

### Step 0: Capture the worktree and focused baseline

Save the starting state and do not alter user-owned changes:

```bash
cd /Users/shaul/Desktop/D/platform
git status --short > /tmp/plan-058-before.txt
cd apps/web
bun run typecheck > /tmp/plan-058-typecheck-before.log 2>&1; echo $? > /tmp/plan-058-typecheck-before.exit
bun --bun vitest run --project node --project dom \
  src/keymap \
  src/components/tests/app-titlebar.test.tsx \
  src/components/tests/workspace-project-menu.test.tsx \
  src/features/menus/utils/tests/resolve.test.ts \
  src/features/menus/utils/tests/shortcut.test.ts \
  src/features/command-palette/tests \
  src/features/editor/utils/tests/file-backed-document.test.ts \
  src/features/editor/utils/tests/text-menu.test.ts \
  src/features/git/tests/panel-states.test.tsx \
  src/features/workbench/components/tests/editor-tab-bar.test.tsx \
  src/features/workbench/utils/tests/editor-tab-menu.test.ts \
  src/features/workbench/utils/tests/titlebar-menu.test.ts \
  src/features/workspace/tests/focus-state.test.ts \
  src/features/workspace/tests/tree-command-store.test.ts \
  src/features/workspace/tests/tree-commands.test.ts \
  src/features/workspace/tests/tree-toolbar.test.tsx \
  > /tmp/plan-058-tests-before.log 2>&1; echo $? > /tmp/plan-058-tests-before.exit
bun run test:browser -- src/features/workspace/components/tree-pane.browser.tsx \
  > /tmp/plan-058-browser-before.log 2>&1; echo $? > /tmp/plan-058-browser-before.exit
```

Record exact failures in the implementation handoff. Do not gate on absolute
test counts.

**Verify**: all commands ran; `/tmp/plan-058-*-before.*` exist. Any failure is
either an identified baseline failure or a STOP.

### Step 1: Build and prove the two non-React services in isolation

Create the focus service and command bus plus their unit tests. Use injected
lookup/runtime/error-reporting/clock boundaries in tests; do not mock Platform
modules. Keep nesting at three levels or less with guard clauses and extracted
transition helpers.

Focus tests must prove:

- request before registration remains pending, then registration + matching
  `focusin` resolves acknowledged;
- current owner does not change on request alone;
- wrong/stale acknowledgement is ignored;
- a newer transition resolves the old one as superseded;
- refusal and unregister-after-attempt resolve rejected;
- token A cleanup cannot remove replacement token B;
- composed-path/deepest-target resolution selects nested readonly Editor over
  search parent;
- exact origin/current/active-tab/last-ack order is deterministic and ambiguity
  is unavailable.

Bus tests must prove:

- disabled preflight does not call target/handler and returns `claimed: false`;
- a missing target is disabled, while unregistering the resolved target at the
  invocation boundary is unhandled with `target-unavailable`;
- sync Editor false is unhandled/unclaimed and true is handled/claimed;
- async work is claimed synchronously, completion waits, and success is handled;
- a sync throw and rejected promise each resolve one failed outcome, call the
  injected reporter once, and produce no unhandled rejection;
- exactly one wide event ends with source, target, execution, undo, duration and
  outcome;
- dirty-close deferred is accepted but distinct from handled.

```bash
cd /Users/shaul/Desktop/D/platform/apps/web
bun --bun vitest run --project node \
  src/keymap/tests/command-bus.test.ts \
  src/lib/focus/tests/service.test.ts
```

**Verify**: exit 0; all listed cases pass. Neither service imports React
components, and `lib/focus` imports no feature module; domain capabilities enter
through registrations/injected boundaries rather than hidden stores.

### Step 2: Perform the atomic registry/runtime/focus cutover

This is one migration-free milestone. Do not run a partial typecheck and then
add old-API adapters to make it pass. Complete every item, delete the old path,
then run the gate.

1. Extend `define-command.ts`, every `workspaceCommands`/`editorCommands` row,
   `table.ts`, `command-registry.ts`, and `types.ts` with target, `when`,
   discriminated execution, explicit disposition and undo metadata. Use the
   exact classifications above. Add the four hidden menu rows. Delete
   `requires`, `commandRequirement`, `workspaceOptionalCommandIds`, and
   `command-enablement.ts`.
2. Implement `keymap/utils/when.ts` from a one-time runtime snapshot. Include
   real Editor target/writability, workspace/tab/file/saveable state and chat
   mode. Update the old enablement matrix into `when.test.ts`; do not use
   active-path heuristics as a substitute for target existence.
3. Split FocusService React wiring by kind: context module under `providers/`,
   provider component, selector hook, and target-registration hook. Replace all
   optimistic area writers with target registration/real `focusin`. Register
   normal Editor, nested readonly search Editor, each diff pane, every enclosing
   `SearchPane` root, tree, Git/logs/terminal/problems, palette/settings/dirty-
   close overlays, keyed chat composer, and global shell.
   Preserve diff-local focus synchronization and terminal cursor appearance.
4. Replace tree app requests with FocusService intents. The panel command first
   changes layout; the pending transition survives until the matching tree
   target registers. The tree adapter returns false for an impossible reveal;
   completion waits for actual focus inside the target. Delete the four app
   tree request files and provider mount.
5. Build `CommandProvider` above titlebar/workspace under the real
   `EditorTabActionsProvider`. It owns the resolved binding table, bus, palette,
   settings dialog and shell actions. `AppKeymapController`, palette and menus
   read it directly. Remove `AppCommandSurface` from `AppWorkspace` and delete
   that component.
6. Convert every workspace handler to explicit dispositions and the provider-
   local runtime. Await the exact file/settings/focus operations listed above.
   Delete detached catches and the direct-close fallback. Preserve calls into
   existing document/FileSync/SettingsSync code.
7. Replace the menu store/provider with direct command context. Capture menu
   origin, use bus inspection for disabled state, add command-backed titlebar
   radio rows, and remove the mutable dispatch publication.
8. Remove palette dispatch/bindings props. Use bus inspection for every command
   and view row; await selection outcome before MRU/close. Give direct palette
   actions explicit FocusService destinations. Register the command root as
   `command-palette`.
9. Change `useAppKeymap` to call the bus. Reserved null bindings still suppress
   immediately. For commands, dispatch first and apply each binding's
   prevent/stop policy only when `ticket.claimed` is true. Keep the current
   single-stroke Editor/native filter; plan 057 owns its eventual removal.
10. Update shared test rendering with a reusable factory that provides the real
    CommandBus/FocusService and injectable domain boundaries. Do not reintroduce
    a nullable no-op dispatch provider.
11. Delete every file and symbol in the legacy ledger, and update stale comments
    in `chat-mode/providers/session-context.ts`, `file-backed-document.ts`, its
    test, and `text-menu.ts`.

Run structural checks before typecheck:

```bash
cd /Users/shaul/Desktop/D/platform
rg -n "activeArea|activeEditorCommandDispatch|activeEditorSurface|editorFocusRequestId|consumeEditorFocusRequest|requestEditorFocus|setActiveEditorCommandDispatch|dispatchEditorCommand|setFocusArea|clearFocusArea|createFocusStore" apps/web/src apps/web/test
rg -n "requestFileTreeCommand|TreeCommandKind|TreeCommandRequest|TreeCommandStore|TreeCommandsProvider|TreeCommandsContext|createTreeCommandStore|useTreeCommandRequest" apps/web/src apps/web/test
rg -n "AppCommandSurface|MenuCommandProvider|MenuCommandContext|MenuCommandStore|createMenuCommandStore|PlatformCommandDispatch|usePlatformCommandDispatch|WorkspaceCommandContext|setCommandDispatch|useMenuCommand|runCommand" apps/web/src/features/menus apps/web/src/features/workbench apps/web/src/components apps/web/src/keymap apps/web/test
rg -n "command-enablement|commandRequirement|commandDisabledReason|isCommandDisabled|workspaceOptionalCommandIds" apps/web/src apps/web/test
rg -n "requires:" apps/web/src/keymap
rg -n "@/features/" apps/web/src/lib/focus
cd apps/web && bun run typecheck
```

**Verify**: every `rg` returns no matches; typecheck exits 0. Do not broaden the
search to unrelated package-private tree counters or unrelated request IDs.

### Step 3: Prove metadata, enablement, async behavior, and dirty close

Update/add focused tests using `apps/web/test/fixtures.ts` and the real bus.
Required assertions:

- table IDs are unique; every row has target/when/execution/undo metadata;
  `platformCommandSpecs` projects it from the same object; all Platform menu
  command IDs are registered; the four new navigation rows stay hidden;
- the 38 listed Editor-local IDs do not gain Platform rows accidentally;
- the old requirement matrix maps to new reasons, plus `chatMode`, readonly
  Editor and missing-target cases;
- keyboard, palette and menu inspection return the same reason for the same
  snapshot/target;
- save/save-all/open-HEAD/revert/clipboard and all five setting-mutation command
  promises settle through the ticket; rejection reports once and does not log
  handled first;
- close tab reports handled, deferred, busy and not-found correctly; the dirty
  case mounts the real unsaved dialog, waits for its autofocus `focusin`,
  records that exact overlay as acknowledged owner, and never invokes direct
  `closeTab`;
- palette remains open and MRU unchanged on disabled/unhandled/failed, waits for
  a controlled promise, then records/closes only on handled/deferred;
- direct palette file/script/session actions request Editor/terminal/composer
  destinations respectively; a cross-project session cannot be acknowledged by
  the old project's composer;
- menu command/radio rows use the captured origin and shared availability;
- a disabled or synchronously unhandled key does not call preventDefault or
  stopPropagation; a claimed command and reserved null binding do.

```bash
cd /Users/shaul/Desktop/D/platform/apps/web
bun --bun vitest run --project node --project dom \
  src/keymap/tests/command-bus.test.ts \
  src/keymap/tests/when.test.ts \
  src/keymap/tests/command-table.test.ts \
  src/keymap/tests/command-dispatch.test.tsx \
  src/keymap/tests/keymap.test.ts \
  src/keymap/tests/session-commands.test.ts \
  src/keymap/tests/use-app-keymap.test.tsx \
  src/features/command-palette/tests/command-list-order.test.tsx \
  src/features/command-palette/tests/command-palette-utils.test.ts \
  src/features/command-palette/tests/command-execution.test.tsx \
  src/features/editor/hooks/tests/use-dirty-tab-close.test.tsx \
  src/features/editor/utils/tests/text-menu.test.ts \
  src/features/git/tests/panel-states.test.tsx \
  src/features/menus/utils/tests/resolve.test.ts \
  src/features/menus/utils/tests/shortcut.test.ts \
  src/components/tests/app-titlebar.test.tsx \
  src/components/tests/workspace-project-menu.test.tsx \
  src/features/workbench/components/tests/editor-tab-bar.test.tsx \
  src/features/workbench/utils/tests/editor-tab-menu.test.ts \
  src/features/workbench/utils/tests/titlebar-menu.test.ts \
  src/lib/focus/tests/service.test.ts \
  src/features/workspace/tests/tree-commands.test.ts \
  src/features/workspace/tests/tree-toolbar.test.tsx
```

**Verify**: exit 0; no baseline-passing focused test regresses.

### Step 4: Prove real DOM focus and trusted-key behavior

Add `proofKeyPress` to `vitest.browser.config.ts`, implemented with
`context.page.keyboard.press`. Declare its typed `BrowserCommands` augmentation
in the new browser test. Do not synthesize untrusted `KeyboardEvent`s for the
acceptance cases.

The browser test must mount real Platform components and prove:

- a command can reveal a not-yet-mounted file tree; its ticket stays pending
  until actual tree/shadow-DOM focus acknowledges it;
- a failed tree reveal is rejected and does not claim current focus;
- opening the palette changes the acknowledged area to `command-palette`, so
  file-tree-only `Mod+F` is not eligible in its input;
- two simultaneous Editor targets route an event to the containing element, and
  unmounting one cannot clear the other;
- palette/menu eventless dispatch uses the captured last acknowledged Editor,
  not the most recently mounted Editor;
- text-edit is disabled on search-result/diff readonly targets while find,
  selection or navigation remains available; no background Editor receives it;
- `focusEditor`, `focusGit`, `revealTerminal`, workspace search, and problems
  change current owner only after matching focus enters their registered root;
- palette close restores the captured origin unless the selected command
  acknowledged a different destination;
- selecting a tree row still reveals/selects a tab without stealing focus (keep
  the existing `tree-pane.browser.tsx` invariant).

```bash
cd /Users/shaul/Desktop/D/platform/apps/web
bun run test:browser -- \
  src/keymap/tests/command-focus.browser.tsx \
  src/features/workspace/components/tree-pane.browser.tsx
```

**Verify**: exit 0 in Chromium. Do not start a dev server; the browser project
uses its existing file-server fixture, and manual smoke uses the already-running
app.

### Step 5: Final gates and plan reconciliation handoff

```bash
cd /Users/shaul/Desktop/D/platform/apps/web
bun run typecheck
bun run lint
bun run format:check
bun run test
cd /Users/shaul/Desktop/D/platform
git diff --check
git status --short
```

Compare results with Step 0 by failure identity, not count. Review the final
status against `/tmp/plan-058-before.txt`; only the in-scope delta belongs to
this plan. Preserve all user-owned changes.

Do not execute 056 or 057 here. Update their status notes before dispatch using
the reconciliation instructions above, then update the 058 row in
`plans/README.md` according to repository cleanup policy.

## Done criteria

- [ ] `platformCommands`/`platformCommand()` remains the only Platform command
      definition lookup; metadata, specs, default bindings, palette and menus derive
      from it.
- [ ] Every registered row declares target, closed-union `when`, discriminated
      execution and one of the four undo categories.
- [ ] No production Platform command ID lacks metadata; the four current text-
      menu gaps are hidden registered rows; the 38 Editor-local IDs remain local.
- [ ] Keyboard, palette, menu and programmatic dispatch all enforce the same
      bus inspection and return typed, non-rejecting outcomes.
- [ ] Every `execution: 'async'` Platform handler is awaited, logged after
      settlement and reported once; no detached command `.catch` remains.
- [ ] Dirty close distinguishes immediate, deferred and rejected outcomes; no
      direct-close fallback bypasses the guard.
- [ ] Focus ownership comes only from actual `focusin`; pending transitions have
      acknowledged/rejected/superseded results and no correctness timeout.
- [ ] `lib/focus` has no `@/features/*` imports; feature targets register their
      capabilities from the outside.
- [ ] Main, Settings, search-result and diff Editor targets are identity-safe;
      readonly targets block text edit and never route behind themselves.
- [ ] App tree queue/counters and all active dispatch pointers/forwarded dispatch
      props in the deletion ledger are gone; package-private tree counters remain.
- [ ] No WorkspaceDocumentService, FileSyncService, SettingsSyncService, Editor
      history, or cross-resource undo implementation was recreated or moved.
- [ ] Focused node/dom/browser tests and web typecheck/lint/format/full-suite
      baseline-delta gates pass.
- [ ] No user-owned pre-existing worktree change was reverted or overwritten.
- [ ] Plans 056/057 are left blocked for explicit reconciliation, not silently
      executed against stale instructions.

## STOP conditions

Stop and report; do not improvise if any occurs:

- Plan 056 or 057 has already landed any `activeEditorSurface`,
  `editor-surface-registry`, command `when`, native takeover, or chord-dispatch
  change. Reconcile the architecture first; never add a second service/registry.
- An in-scope uncommitted user edit overlaps the command/focus symbols this plan
  changes. Preserve it and ask the operator who owns the merge.
- `platformCommands` or `platformCommandSpecs` is no longer the authoritative
  metadata/default-binding source described above.
- Correct implementation appears to require a second command table, handler map
  keyed separately from the table, nullable/no-op dispatch fallback, dual
  old/new provider, legacy alias, state migration, or timeout-based focus
  success.
- A focus target cannot produce a real DOM `focusin` acknowledgement, cannot
  reject a failed intent, or cannot be identified independently of mount order.
- A required Editor action needs arguments beyond `{ event? }`, async settlement,
  cancellation, structured failure, enablement facts only Editor knows, or an
  undo token. That requires the documented lockstep Editor contract; do not cast
  around it or edit the sibling repo inside this plan.
- Workspace command work starts duplicating or relocating document text, dirty,
  save, conflict, FileSync, SettingsSync, or DocumentSession history ownership.
- A package-tree internal counter must be removed to make Platform focus work.
  The Platform adapter/ack boundary is wrong; do not rewrite the tree package.
- A new setting/localStorage key or compatibility reader seems necessary. This
  cutover has no persisted runtime state.
- The dirty-close dialog cannot distinguish deferred ownership from rejection
  without widening more Platform-owned close call sites than listed. Add exact
  evidence and revise scope before proceeding.
- A step's verification fails twice after one reasonable correction, or a
  baseline-passing test regresses.
- Verification would require starting a second dev server or using synthetic
  browser keyboard events for the real-focus acceptance cases.
- Any production file outside **Scope** must change. Add it with a reason and get
  review before editing.

## Maintenance notes

- Reviewer priority: target-resolution ordering, identity-safe unregister,
  palette/menu origin capture, key suppression after `claimed`, dirty-close
  deferred semantics, and exactly-once async failure reporting.
- Command metadata is an enforceable contract. Adding a command row without
  target/when/execution/undo must fail typecheck or the table test.
- `undoCategory` describes ownership; it does not promise undo. Only
  `text-edit` maps to Editor `DocumentSession` history today.
- When plan 056 lands, chord state remains keymap-local and dispatch remains bus-
  owned. When plan 057 lands, Editor's native keymap can be disabled without
  changing target/focus ownership again.
- If E3 later adds provider-contributed commands or quick-input providers, extend
  the authoritative table/typed lookup deliberately; do not revive mutable
  active dispatch publication.
