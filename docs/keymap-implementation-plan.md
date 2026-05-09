# Keymap Implementation Plan

## Goal

Build a first-class keymap system for Platform that mostly follows Zed's model:
actions are dispatched through the focused UI context, bindings are grouped by
context, key sequences are supported, and user keymaps override defaults without
special cases.

VS Code has a few ideas we should borrow: explicit source/weight metadata,
schema-backed JSON editing, strong debug output, and a searchable keybindings UI
that shows source, context, and conflicts.

## Current Platform State

Platform has a narrow editor-only keymap today:

- `packages/editor-core/src/editor/keymap.ts` registers `@tanstack/hotkeys`
  handlers directly on the editor scroll element.
- `packages/editor-core/src/editor/commands.ts` defines a closed
  `EditorCommandId` union for editor-local commands.
- `packages/editor-core/src/editor/Editor.ts` dispatches those commands through
  `Editor.dispatchCommand`.
- `apps/web/src/features/editor/state/editor-commands.ts` exposes workspace
  actions as React/Zustand closures, not as command registry entries.
- `apps/web/src/components/workspace/workspace-focus-state.ts` tracks coarse
  focus areas: `editor`, `file-tree`, `global`, or `null`.

That is enough for single-stroke editor shortcuts. It is not enough for:

- global workspace shortcuts
- context-specific shortcuts across panels, dialogs, editor, git, and tree
- multi-stroke sequences like `cmd-k cmd-s`
- user keymap files
- disabling or unbinding defaults
- showing all commands and conflicts in a keymap editor
- command palette integration

## Reference Summary

### Zed Model

Zed's keymap runtime is split cleanly:

- `crates/gpui/src/keymap.rs` stores ordered `KeyBinding` entries and resolves
  input against a context stack.
- `crates/gpui/src/key_dispatch.rs` builds a dispatch tree from rendered UI
  nodes, then dispatches matching actions from the focused node outward.
- `crates/gpui/src/keymap/context.rs` parses and evaluates context predicates.
- `crates/settings/src/keymap_file.rs` loads JSON keymap sections, builds
  actions, supports partial failure, `null` no-op bindings, and targeted
  `unbind` entries.
- `crates/keymap_editor/src/keymap_editor.rs` shows all mapped and unmapped
  actions, sources, contexts, and conflict warnings.

Important Zed behavior to copy:

- Bindings are action-based, not callback-based.
- A keymap file is an array of sections:

  ```json
  [
    {
      "context": "Editor && mode == full",
      "bindings": {
        "cmd-f": "editor.find",
        "cmd-k cmd-s": "workspace.openKeymap",
        "cmd-r": null
      },
      "unbind": {
        "cmd-b": "workspace.toggleSidebar"
      }
    }
  ]
  ```

- Contexts form a stack from root to focused node, for example
  `Workspace > Pane > Editor`.
- Context predicates support identifiers, key-value checks, `&&`, `||`, `!`,
  grouping, equality, inequality, and ancestor matching with `>`.
- Conflict precedence is based on context depth first, then insertion order.
  User bindings win because they are loaded after built-ins.
- Bindings with no context act like deepest-context bindings.
- `null` means "do nothing for this key in this context".
- `unbind` removes a specific default action for a specific key/context.
- Multi-key sequences are resolved with pending input, a timeout, and replay of
  typed keys when the sequence does not complete.
- Zed reloads default, base, modal, and user keymaps whenever settings,
  keyboard layout, or keymap file contents change.
- The key context view is a first-class debugging tool.

### VS Code Model

VS Code's keybinding implementation is more registry-driven:

- `src/vs/platform/keybinding/common/keybindingsRegistry.ts` collects built-in
  and extension keybindings using weights.
- `src/vs/platform/keybinding/common/keybindingResolver.ts` builds a map by
  first chord and resolves `NoMatchingKb`, `MoreChordsNeeded`, or `KbFound`.
- `src/vs/platform/keybinding/common/abstractKeybindingService.ts` owns chord
  mode, status messaging, single-modifier chords, and command execution.
- `src/vs/workbench/services/keybinding/browser/keybindingService.ts` watches
  user keybindings, extension contributions, keyboard layout changes, and JSON
  schema updates.
- `src/vs/workbench/services/keybinding/common/keybindingIO.ts` and
  `keybindingEditing.ts` parse/write the user JSON file.
- `src/vs/platform/contextkey/common/contextkey.ts` has a rich flat context-key
  expression language.

VS Code ideas worth borrowing:

- Store source metadata: default, user, built-in extension, external extension.
- Keep default bindings and user overrides as separate layers.
- Use command metadata and argument schemas to power JSON completion.
- Provide debug dumps that show keyboard layout, raw mapping, resolved
  keybindings, and why a binding matched or did not match.
- Expose a keybindings table with columns for command, keybinding, when,
  source, and conflicts.
- Support extension-style contribution in the future, even if we do not build
  extensions now.

VS Code ideas to avoid for the initial architecture:

- Do not use a flat context-key service as the primary model. Zed's context
  stack is a better fit for an editor shell where panels and nested views
  naturally own scoped behavior.
- Do not make negative command ids like `-editor.action.copy` the main removal
  syntax. Zed's explicit `unbind` object is clearer.
- Do not start with VS Code's full keyboard layout mapper. We need a simple,
  testable browser implementation first, then improve layout handling.

## Target Architecture

### Near-Term Direction

The practical first implementation should be pane-scoped rather than a full
Zed-style dispatch tree.

Use the focused pane state we already keep as the app-level context:

```ts
type FocusPane = "editor" | "file-tree" | "git" | "global" | null
```

The app owns the top-level keymap and registers app/workspace shortcuts through
`@tanstack/react-hotkeys` or the current TanStack hotkeys equivalent. The editor
accepts the editor slice as a prop and remains responsible for text-editing
commands because it owns selection, document session, find state, and native
input fallback.

Near-term ownership:

- App keymap: global shell commands, file tree commands, git commands, pane
  focus commands, tab commands.
- Editor keymap prop: editor-local commands like cursor movement, selection,
  delete, indent, undo/redo, find, go-to-definition.
- Shared binding shape: both app and editor consume the same normalized binding
  records, even if they use different registration adapters internally.

The app should compute active binding slices from the same source data:

```ts
type PlatformKeyBinding = {
  readonly keys: string
  readonly command: string | null
  readonly args?: unknown
  readonly pane?: FocusPane | "any"
  readonly context?: string
  readonly source?: KeyBindingSource
  readonly preventDefault?: boolean
  readonly stopPropagation?: boolean
}
```

Example flow:

1. Load default app keymap records.
2. Filter app-level records by `focusedPane`.
3. Register the active app records with TanStack hotkeys.
4. Derive editor records and pass them into `<Editor keymap={...} />`.
5. Let the editor register only the editor records on its own DOM target.

Important rule: one binding should have one owner for a given focus state. If
`cmd-f` is active while the editor is focused, either the app routes it to
`editor.find`, or the editor handles it directly. Do not register the same
focused shortcut in both layers.

Recommended first-cut precedence:

1. Modal/dialog/input overrides.
2. Focused pane app keymap.
3. Editor-local keymap when the editor pane is focused.
4. Workspace/global app keymap.
5. Browser/native fallback.

This gives us the pane behavior we need now while keeping the path open to a
Zed-style context predicate later. `pane: "editor"` can become
`context: "Editor"` without changing command ids or the keymap file shape.

### TanStack Hotkeys Guidance

Implementation should follow the local TanStack hotkeys skill:

- Skill file:
  `/Users/shaul/.codex/skills/tanstack-hotkeys/SKILL.md`
- Reference file when exact hook signatures are needed:
  `/Users/shaul/.codex/skills/tanstack-hotkeys/references/react-hotkeys.md`

Guidance to carry into implementation:

- Inspect the installed package version, exports, and local usage before coding.
- Prefer React hooks from `@tanstack/react-hotkeys` over imperative manager
  usage for app-level shortcuts.
- Use `Mod` for portable Command/Ctrl bindings unless a shortcut is explicitly
  platform-specific.
- Choose the narrowest hook:
  - `useHotkey` for one chord.
  - `useHotkeys` for several chords or dynamic chord lists.
  - `useHotkeySequence` for one multi-step sequence.
  - `useHotkeySequences` for dynamic sequence lists.
  - `useHotkeyRecorder` or `useHotkeySequenceRecorder` for user customization
    UI.
  - `useHeldKeys`, `useHeldKeyCodes`, or `useKeyHold` for live key-state UI.
- Rely on TanStack's default input behavior where possible: command-style
  shortcuts such as Mod/Ctrl/Meta and Escape can still fire in inputs, while
  single-key and Shift/Alt-only shortcuts are ignored in text-entry contexts by
  default.
- Use `HotkeysProvider` defaults for app-wide policy, then override per binding
  only when a command needs different `preventDefault`, `stopPropagation`,
  sequence timeout, or input behavior.
- Attach metadata to registrations for command palettes, shortcut help, and
  debugging.
- Store normalized hotkey strings for user customization and display them with
  TanStack's formatting utilities.
- If the local installed package types disagree with the skill reference, trust
  the installed package and document the mismatch in the implementation notes.

### Packages

Longer term, add a shared keymap runtime package:

- `packages/keymap`

It should be framework-agnostic TypeScript. Do not block the MVP on extracting
this package. Start with a small `apps/web/src/keymap` module and the editor
`keymap` prop, then extract once the parser/resolver is stable.

Core exports:

- `CommandRegistry`
- `Keymap`
- `KeyBinding`
- `KeymapResolver`
- `KeyContext`
- `KeyContextPredicate`
- `parseKeySequence`
- `formatKeySequence`
- `KeymapController`
- `KeymapDebugSnapshot`

### Commands

Commands need to become registered actions.

Command metadata:

```ts
type CommandSpec<Args = unknown> = {
  readonly id: string
  readonly title: string
  readonly category?: string
  readonly argsSchema?: unknown
}
```

Handlers are registered separately from metadata:

```ts
type CommandHandler<Args = unknown> = (
  args: Args,
  context: CommandDispatchContext
) => boolean | void | Promise<boolean | void>
```

Dispatch should bubble like Zed:

1. Capture/global handlers get a chance first if needed later.
2. Focused context node handlers run first.
3. Ancestors run outward until one handles the action.
4. Global command handlers run last.

This keeps editor-local commands local, while still allowing global workspace
commands like `workspace.openFilePicker`.

### Context Stack

The long-term design should use Zed-style UI context providers.

Each focusable region declares a context node:

```tsx
<KeyContextProvider
  name="Editor"
  values={{ mode: "full", language: "typescript", dirty: true }}
  commands={editorCommandHandlers}
>
  <EditorFrame />
</KeyContextProvider>
```

Example focused stack:

```text
Workspace os=macos
  WorkspacePanel tab=files
    FileTree
```

or:

```text
Workspace os=macos
  Editor mode=full language=typescript dirty=false
```

MVP context predicates should support:

- identifiers: `Editor`
- equality: `mode == full`
- inequality: `mode != full`
- not: `!Terminal`
- and/or: `Editor && dirty == true`
- grouping: `Editor && (vim_mode == normal || vim_mode == visual)`
- ancestor match: `Workspace > Editor`

Skip regex, `in`, numeric comparison, and VS Code constants until needed.

For the MVP, treat `focusedPane` as a simplified context stack:

```text
Workspace > Editor
Workspace > FileTree
Workspace > GitPanel
Workspace > Global
```

Do not build the full predicate parser until pane-scoped shortcuts are working.

### Key Binding Model

```ts
type KeyBindingSource = "default" | "base" | "extension" | "user"

type KeyBinding = {
  readonly keys: KeySequence
  readonly command: string | null
  readonly args?: unknown
  readonly context?: KeyContextPredicate
  readonly source: KeyBindingSource
  readonly order: number
}
```

`command: null` is Zed's no-action binding. It consumes the key in matching
contexts and prevents fallback to lower-precedence bindings.

Use a separate targeted unbind representation while loading files:

```ts
type KeyUnbind = {
  readonly keys: KeySequence
  readonly command: string
  readonly args?: unknown
  readonly context?: KeyContextPredicate
  readonly source: KeyBindingSource
  readonly order: number
}
```

At resolution time, unbind entries suppress matching default/base bindings for
that command, key sequence, and compatible context.

### Keymap File Format

Use a Zed-compatible section format for user-facing files:

```json
[
  {
    "context": "Editor && mode == full",
    "bindings": {
      "cmd-f": "editor.find",
      "cmd-h": ["editor.find", { "replace": true }],
      "cmd-r": null
    },
    "unbind": {
      "cmd-b": "workspace.toggleSidebar"
    }
  }
]
```

Supported action values:

- string command id
- `[commandId, args]`
- `null`

Use JSONC parsing so users can comment their file.

Persisting the file should be server-owned eventually, because the server owns
host filesystem side effects. A good staged path:

1. MVP: built-in keymaps bundled in `apps/web`, optional user override from
   local storage for fast iteration.
2. Proper: add server APIs for app config `keymap.json` read/write and expose
   DTOs through `packages/contracts`.
3. Later: workspace-level keymap overrides if needed.

### Key Sequence Syntax

Follow Zed spelling where possible:

- `cmd-`, `ctrl-`, `alt-`, `shift-`, `fn-`
- `win-` and `super-` aliases
- `secondary-` alias: `cmd` on macOS, `ctrl` elsewhere
- sequences separated by spaces: `cmd-k cmd-s`
- printable keys by character: `a`, `?`, `/`
- named keys: `tab`, `escape`, `enter`, `left`, `right`, `up`, `down`,
  `home`, `end`, `pageup`, `pagedown`, `f1`

For browser events, normalize aliases to a canonical dispatch string:

```text
cmd-shift-p
ctrl-k ctrl-s
secondary-p
```

Use `KeyboardEvent.key` for MVP. Add `KeyboardEvent.code` or a layout mapper
only when non-QWERTY support becomes a real requirement.

### Resolver Rules

Resolution input:

- current key sequence
- focused context stack
- ordered bindings
- ordered unbind entries

Resolution output:

```ts
type KeymapResolution =
  | { kind: "none" }
  | { kind: "pending"; hasExactMatch: boolean }
  | { kind: "command"; binding: KeyBinding }
  | { kind: "noop"; binding: KeyBinding }
```

Long-term resolver precedence:

1. A binding must match the current key sequence exactly or as a prefix.
2. A binding must match the focused context stack.
3. Deeper context matches beat shallower context matches.
4. Bindings with no context count as deepest-context matches.
5. Later bindings beat earlier bindings at the same context depth.
6. User files load last, so user bindings override defaults.
7. `null` bindings consume input and stop fallback.
8. `unbind` suppresses only the targeted command/key/context combination.

Pending sequence behavior should match Zed:

- If the current key sequence is a prefix of an active longer binding, store it
  as pending and prevent the browser default.
- If an exact binding also exists, mark `hasExactMatch`.
- If the user finishes the sequence before timeout, dispatch the longer binding.
- If the timeout fires and an exact binding existed, dispatch the exact binding.
- If the next key does not complete any sequence, replay the pending text input
  where possible, then resolve the new key from scratch.
- Clear pending state when focus changes.

Use Zed's 1 second timeout initially. VS Code's 5 second chord mode is good for
explicit command chords, but it is too long for editor text input.

MVP resolver behavior can be simpler:

- Match only single-stroke bindings unless TanStack gives us multi-stroke
  support without fighting text input.
- Enable app bindings when `binding.pane === focusedPane`,
  `binding.pane === "any"`, or the binding has no pane.
- Enable editor bindings only when the focused pane is `editor`.
- Prefer focused-pane bindings over global bindings when both match the same
  key.
- Treat `command: null` as a disabled shortcut only after user keymap support is
  added.

### Text Input and IME

The keymap must not break ordinary typing.

Rules:

- If a key produces printable text and no binding matches, let native input run.
- If a printable key starts a pending sequence, prevent native input until the
  sequence resolves or times out.
- During IME composition, do not dispatch text-producing keybindings unless the
  binding uses non-text modifiers.
- Keep the editor's existing fallback text path in
  `packages/editor-core/src/editor/Editor.ts`, but route command-style keydown
  handling through the shared keymap controller.

Borrow VS Code's `mightProducePrintableCharacter` idea later for better layout
and numpad behavior.

## Build Plan

### Phase 1: Shared Binding Shape and Editor Prop

Create the first shared binding shape and make the editor consume app-provided
bindings:

- define `PlatformKeyBinding` in `apps/web/src/keymap` or a small shared module
- add a mapper from `PlatformKeyBinding` to the editor's current
  `EditorKeyBinding`
- keep `packages/editor-core/src/editor/keymap.ts` as the editor adapter for
  now
- make `apps/web/src/features/editor/components/editor.tsx` pass an editor
  keymap slice into `useEditor`
- ensure editor defaults can be supplied by the app instead of being hard-coded
  only inside editor-core

This gives the app ownership of what bindings the editor uses without rewriting
editor command handling.

### Phase 2: Pane-Scoped App Keymap

Add app-level keymap registration with TanStack hotkeys:

- read `activeArea` from `workspace-focus-state`
- define default bindings for `global`, `file-tree`, `git`, and `editor`
- filter active app bindings by focused pane
- register active app bindings with `@tanstack/react-hotkeys` or the current
  TanStack hotkeys package
- prefer `useHotkeys` for dynamic focused-pane binding lists, and reserve
  `useHotkeySequence` or `useHotkeySequences` for explicit multi-step shortcuts
- keep app-level handlers out of the editor DOM target unless they are intended
  to override editor-local behavior
- wrap the app in `HotkeysProvider` if we need consistent app-wide defaults for
  `preventDefault`, `stopPropagation`, sequence timeout, or input behavior
- use registration metadata so command palette and keymap debug views can show
  shortcut names, descriptions, and sources
- add tests for focused-pane filtering and duplicate ownership rules

This is the MVP version of Zed's context-sensitive keymap.

### Phase 3: Command Registry

Add command registration in `apps/web`:

- register workspace commands currently exposed by `useEditorCommands`
- register git panel commands as they become shortcut-addressable
- register editor commands as `editor.*` ids that delegate to
  `Editor.dispatchCommand`
- expose metadata for command palette and keymap editor

Keep `Editor.dispatchCommand` intact. Add an adapter rather than rewriting the
editor command implementation immediately.

### Phase 4: Runtime Extraction

Extract the keymap runtime once the pane-scoped MVP is stable:

- move parser/formatter/shared types into `packages/keymap`
- add context parser and evaluator
- add ordered keymap loader
- add resolver with precedence, pending, no-op, and unbind behavior
- add unit tests for parser, context matching, precedence, unbind, and
  sequences

This is the point where we can decide whether TanStack remains only the DOM
registration layer or whether the shared resolver takes over more of dispatch.

### Phase 5: Default Keymap

Create default keymap assets:

- `apps/web/src/keymap/default-macos.json`
- `apps/web/src/keymap/default-linux.json`
- `apps/web/src/keymap/default-windows.json`

Start with the existing editor defaults from
`packages/editor-core/src/editor/keymap.ts`, then add shell actions:

- open file picker
- focus editor
- focus file tree
- focus git panel
- close current tab
- switch tabs
- toggle diff mode
- common git panel actions where implemented

Load order:

1. platform default keymap
2. optional base keymap later
3. extension contributions later
4. user keymap

### Phase 6: User Keymap File

Add a keymap settings service:

- parse JSONC
- allow partial load: valid bindings still apply when unrelated entries fail
- surface errors in UI with section/key/action detail
- preserve formatting when the keymap editor modifies one binding
- validate command ids and arg schemas

Server-owned persistence should follow this shape:

- `GET /keymap` returns current user keymap text and diagnostics.
- `PUT /keymap` writes updated text.
- contracts live in `packages/contracts`.

### Phase 7: Keymap Editor and Debugging

Build a keymap editor view with:

- command name
- key sequence
- context
- source
- conflict status
- record keybinding input
- add, replace, remove, reset
- source filters: user, default, extension
- conflict filter
- search by command, key, source, and context

Also add a developer key context view:

- current focused context stack
- current pending key sequence
- matching bindings
- reason a candidate did not match
- normalized keyboard event information

This is where VS Code's debug and source visibility ideas are most valuable.

## Files Likely To Change

New:

- `apps/web/src/keymap/index.ts`
- `apps/web/src/keymap/default-bindings.ts`
- `apps/web/src/keymap/use-app-keymap.ts`
- `apps/web/src/keymap/editor-keymap.ts`
- `packages/keymap/package.json`
- `packages/keymap/src/index.ts`
- `packages/keymap/src/keySequence.ts`
- `packages/keymap/src/context.ts`
- `packages/keymap/src/keymap.ts`
- `packages/keymap/src/resolver.ts`
- `packages/keymap/src/json.ts`
- `packages/keymap/test/*.test.ts`
- `apps/web/src/keymap/*.json`
- `apps/web/src/keymap/keymap-provider.tsx`
- `apps/web/src/keymap/key-context-provider.tsx`
- `apps/web/src/keymap/commands.ts`

Modify:

- `package.json` workspaces if needed
- `apps/web/package.json` if `@tanstack/react-hotkeys` is not already installed
- `apps/web/src/App.tsx` to install the provider
- `apps/web/src/features/editor/components/editor.tsx` to register editor
  command handlers and contexts
- `apps/web/src/components/workspace/tree-pane.tsx` for file tree context and
  commands
- `apps/web/src/features/git/panel.tsx` for git context and commands
- `packages/editor-core/src/editor/keymap.ts` to become an adapter or be
  retired once shared keymap dispatch owns editor shortcuts
- `packages/editor-core/src/editor/commands.ts` if command ids are namespaced

## MVP Cut

The smallest useful implementation:

- shared `PlatformKeyBinding` shape
- app-managed TanStack hotkeys filtered by `activeArea`
- editor receives its keymap slice from the app
- focused pane scopes for `editor`, `file-tree`, `git`, and `global`
- command handlers for existing editor commands and a handful of workspace
  commands
- default keymap records bundled in app code
- no user-facing keymap editor yet
- no server persistence yet
- no full Zed context predicate parser yet

MVP should still include tests for:

- single key dispatch
- focused-pane filtering
- focused-pane binding beats global binding
- editor bindings are passed into editor but not duplicated as app handlers
- editor text input not being swallowed when no binding matches

## Later Work

- shared parser and resolver
- multi-key pending and timeout
- context depth precedence
- insertion order override
- `null` no-op bindings
- targeted unbind
- user keymap file and schema
- keymap editor UI
- command palette
- extension contribution surface
- base keymap presets
- keyboard layout mapper and scan-code support
- keymap migrations when commands are renamed
- import helper for Zed-style keymaps
