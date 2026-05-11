# VS Code Keymap Development Status

Last updated: 2026-05-11.

This file tracks VS Code default keymap parity. Platform intentionally supports
a subset of VS Code defaults today; a shortcut remains here when the app does
not yet have the handler, binding metadata, context model, or runtime behavior
needed to enable it safely.

## Current Implementation

- The app owns the Platform keymap in `apps/web/src/keymap`.
- `PlatformKeyBinding` records the command, normalized key string, TanStack
  hotkey, pane scope, source, optional VS Code command ID, and event options.
- `defaultPlatformKeyBindings()` builds the bundled default keymap in code and
  applies platform-specific bindings through TanStack's platform detection.
- `useAppKeymap()` registers app/workspace bindings with
  `@tanstack/react-hotkeys`.
- `editorKeyBindingsFromPlatform()` maps `editor.*` Platform commands into the
  editor-core `EditorKeyBinding` shape. The editor now receives its keymap slice
  from the app with editor-core defaults disabled.
- The active binding model is still pane-scoped. `activePlatformKeyBindings()`
  filters by the current workspace focus area and lets focused-pane bindings
  override global bindings with the same key.
- `command-registry.ts` is the command metadata source for command palette rows,
  shortcut labels, and VS Code command aliases.
- Only the built-in default source exists. Built-in no-op reservations can block
  browser-hostile desktop shortcuts, but there is no user keymap file, keymap
  editor, targeted unbind, or user disabled/no-op binding support yet.

## Done

### Runtime And Wiring

- Added the shared Platform binding shape and command ID types.
- Added app-level shortcut registration through TanStack hotkeys.
- Added editor/app binding separation so editor commands are not also registered
  as app handlers.
- Added pane filtering for `global`, `editor`, `file-tree`, and `git` focus
  areas.
- Added tests for focused-pane filtering, focused-pane priority, editor/app
  separation, command metadata, VS Code aliases, and platform-specific defaults.

### Enabled VS Code-Style Defaults

- Command palette and quick access:
  - `workbench.action.showCommands` through `Mod+Shift+P` and `F1`.
  - `workbench.action.quickOpen` through `Mod+P`.
  - `workbench.action.gotoSymbol` through `Mod+Shift+O`.
- File and tab lifecycle:
  - `workbench.action.files.save` through `Mod+S`.
- Layout and focus:
  - `workbench.action.toggleSidebarVisibility` through `Mod+B`.
- Editor basics:
  - Undo, redo, select all, find, find/replace, find next/previous, find-widget
    toggles, replace one/all, select all matches, and add next occurrence.
  - Backspace/delete, tab/shift-tab indentation, arrow navigation, word
    navigation, line/document boundary navigation, and page navigation.
  - Word delete, line delete/copy/move/insert, line/block comments,
    line indentation/outdentation, insert cursor above/below, select all
    occurrences, and change all occurrences.

### Command Palette And Quick Access

- Command palette items are generated from command metadata.
- Command rows show the active shortcut when one exists.
- Command search includes Platform command IDs and VS Code command aliases.
- Quick access now supports files, `>` commands, `view ` view search, `edt `
  open editor search, and `@` document symbol search.
- Basic command disabled state exists, but it is still hard-coded in the palette.

### Implemented But Not Fully Exposed

- Workspace handlers and aliases exist for `workbench.action.files.saveAll`,
  `workbench.action.files.revert`, `workbench.action.showAllEditors`,
  `workbench.action.quickOpenPreviousEditor`,
  `workbench.action.quickOpenView`, `workbench.action.reopenClosedEditor`,
  `workbench.action.closeActiveEditor`, `workbench.action.togglePanel`,
  editor group focus commands, and `workbench.action.splitEditor`, but these
  still need final default binding decisions and broader behavior coverage.
  `splitEditor` is still effectively a single-editor-group focus operation.
- Browser-hostile desktop/window shortcuts are kept as built-in no-op
  reservations with TODOs for the future Electron shell. These include
  `cmd+option+tab`, `ctrl+tab`, `ctrl+q`, `cmd/ctrl+shift+t`, `cmd/ctrl+j`,
  `cmd/ctrl+1` through `cmd/ctrl+3`, `cmd/ctrl+w`, and `F12`.
- Editor-core handlers and Platform command metadata exist for
  `editor.action.moveSelectionToNextFindMatch`, but its VS Code default is the
  chord `cmd/ctrl+k cmd/ctrl+d`, so the default binding should wait for
  multi-chord runtime support.

## Remaining Work

### Import Pipeline

- Add a repeatable export command that runs VS Code's built-in exporter from
  `references/vscode`:

  ```sh
  ./scripts/code.sh --export-default-keybindings /tmp/platform-vscode-keybindings
  ```

- Normalize the generated `doc.keybindings.osx.json`,
  `doc.keybindings.win.json`, and `doc.keybindings.linux.json` into a checked-in
  manifest.
- Generate a report with total VS Code defaults, mapped bindings, unsupported
  commands, unmapped commands, and conflicts.
- Add an integrity test that fails when an enabled binding points to a command
  without a real handler. This should catch cases like a default binding whose
  command ID is registered but whose behavior still returns `false`.

### Runtime Parity

- Add first-class multi-chord support for app and editor bindings, including
  VS Code-style chords such as `cmd+k cmd+s`.
- Add context-aware binding conditions instead of the current pane-only scope.
  Initial contexts should cover editor text focus, find widget focus, replace
  input focus, file tree focus, git panel focus, dialogs, and command palette.
- Add explicit conflict reporting that shows active binding, shadowed binding,
  source, platform, and context.
- Add user keymap loading, targeted unbinds, disabled/no-op bindings, and source
  precedence.
- Decide whether TanStack remains only the DOM registration layer or whether a
  shared resolver should own more of dispatch once chords and contexts exist.

### Editor Keymap Parity

- Add the default binding for `editor.action.moveSelectionToNextFindMatch` after
  multi-chord support lands.
- Wire LSP/navigation commands before enabling their VS Code defaults:
  - `editor.action.goToDefinition`
  - `editor.action.goToReferences`
  - `editor.action.peekDefinition`
  - `editor.action.revealDefinitionAside`
  - `editor.action.goToImplementation`
  - `editor.action.goToTypeDefinition`
  - `editor.action.marker.next`
  - `editor.action.marker.prev`
- Revisit the current `F12`/`goToDefinition` binding. It is present in the
  default binding list as a no-op reservation, but the LSP-backed handler still
  needs to be connected to the active editor command dispatch path and the
  browser-hostile shortcut should only dispatch in a desktop shell.
- Add folding commands and behavior:
  - `editor.toggleFold`
  - `editor.fold`
  - `editor.unfold`
  - `editor.foldAll`
  - `editor.unfoldAll`

### Workspace Keymap Parity

- Add explicit VS Code aliases and default-binding decisions for view commands:
  - `workbench.view.explorer`
  - `workbench.view.scm`
- Add workspace features and handlers before binding:
  - `workbench.action.findInFiles`
  - `workbench.action.terminal.toggleTerminal`
- Revisit commands whose VS Code defaults are chords after multi-chord support
  lands, especially save-all, show-all-editors, and other `cmd+k ...` defaults.
  Also avoid browser-hostile desktop defaults such as macOS `cmd+option+tab`
  unless a browser-safe alternative is chosen.

### UI And Debugging

- Add a keybindings inspector with command ID, VS Code alias, active key,
  platform, scope/context, source, and conflict status.
- Add a searchable keybindings table backed by command metadata.
- Extend command palette availability so disabled state is derived from command
  context metadata instead of hard-coded command checks.
- Add visible unsupported-command reporting so imported VS Code defaults do not
  silently disappear.
