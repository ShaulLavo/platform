# VS Code Keymap Development Backlog

This file tracks VS Code default keymap work that cannot be completed by
binding existing Platform commands alone.

Current status: the app keymap contains a supported subset of VS Code defaults,
not a complete copied default keymap. A shortcut belongs here when VS Code has a
default binding but Platform does not yet have the command, context expression,
or runtime behavior needed to bind it safely.

## Import Pipeline

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
  without a handler.

## Keymap Runtime

- Add first-class multi-chord support for app and editor bindings, including
  VS Code-style chords such as `cmd+k cmd+s`.
- Add context-aware binding conditions instead of the current pane-only scope.
  Initial contexts should cover editor text focus, find widget focus, replace
  input focus, file tree focus, git panel focus, dialogs, and command palette.
- Add explicit conflict reporting that shows active binding, shadowed binding,
  source, platform, and context.
- Add user keymap loading, targeted unbinds, and disabled/no-op bindings.

## Editor Commands

- Word and line editing:
  - `deleteWordLeft`
  - `deleteWordRight`
  - `editor.action.deleteLines`
  - `editor.action.copyLinesUpAction`
  - `editor.action.copyLinesDownAction`
  - `editor.action.moveLinesUpAction` (`Option+Up` on macOS,
    `Alt+Up` on Windows/Linux)
  - `editor.action.moveLinesDownAction` (`Option+Down` on macOS,
    `Alt+Down` on Windows/Linux)
  - `editor.action.insertLineBefore`
  - `editor.action.insertLineAfter`
- Comments and indentation:
  - `editor.action.commentLine`
  - `editor.action.blockComment`
  - `editor.action.indentLines`
  - `editor.action.outdentLines`
- Multi-cursor:
  - `editor.action.insertCursorAbove`
  - `editor.action.insertCursorBelow`
  - `editor.action.selectHighlights`
  - `editor.action.changeAll`
  - `editor.action.moveSelectionToNextFindMatch`
- Folding:
  - `editor.toggleFold`
  - `editor.fold`
  - `editor.unfold`
  - `editor.foldAll`
  - `editor.unfoldAll`
- Navigation:
  - `editor.action.goToReferences`
  - `editor.action.peekDefinition`
  - `editor.action.revealDefinitionAside`
  - `editor.action.goToImplementation`
  - `editor.action.goToTypeDefinition`
  - `editor.action.marker.next`
  - `editor.action.marker.prev`

## Workspace Commands

- File and command navigation:
  - `workbench.action.quickOpenPreviousEditor`
  - `workbench.action.quickOpenView`
  - `workbench.action.gotoSymbol`
  - `workbench.action.showAllEditors`
- File lifecycle:
  - `workbench.action.files.save`
  - `workbench.action.files.saveAll`
  - `workbench.action.files.revert`
  - `workbench.action.reopenClosedEditor`
- Layout and focus:
  - `workbench.action.toggleSidebarVisibility`
  - `workbench.action.togglePanel`
  - `workbench.action.focusFirstEditorGroup`
  - `workbench.action.focusSecondEditorGroup`
  - `workbench.action.focusThirdEditorGroup`
  - `workbench.action.splitEditor`
- Views:
  - `workbench.view.explorer`
  - `workbench.view.scm`
  - `workbench.action.findInFiles`
  - `workbench.action.terminal.toggleTerminal`

## UI And Debugging

- Add a keybindings inspector with command ID, VS Code alias, active key,
  platform, scope, source, and conflict status.
- Add a searchable keybindings table backed by command metadata.
- Extend command palette availability so disabled state is derived from command
  context metadata instead of hard-coded command checks.
- Add visible unsupported-command reporting so imported VS Code defaults do not
  silently disappear.
