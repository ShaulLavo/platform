import type { EditorCommandId } from '@singapor/core'

import type { EditorPlatformCommandId, PlatformCommandId, WorkspaceCommandId } from './types'

export type CommandSpec<Id extends PlatformCommandId = PlatformCommandId> = {
  readonly aliases?: readonly string[]
  readonly commandFamily?: 'appearance' | 'editor' | 'workspace'
  readonly commandKind?: 'editor' | 'workspace'
  readonly id: Id
  readonly title: string
  readonly category: string
  readonly description?: string
  readonly vscodeCommandIds?: readonly string[]
  readonly argsSchema?: unknown
}

const workspaceCommandSpecs = [
  workspaceCommand(
    'workspace.showQuickAccess',
    'Quick Open',
    'Search workspace files and quick actions.',
    ['workbench.action.quickOpen'],
  ),
  workspaceCommand(
    'workspace.showCommandPalette',
    'Show command palette',
    'Search and run workspace or editor commands.',
    ['workbench.action.showCommands'],
  ),
  workspaceCommand(
    'workspace.openFilePicker',
    'Open file picker',
    'Open the workspace file picker.',
    ['workbench.action.quickOpen'],
  ),
  workspaceCommand(
    'workspace.openSearchEditor',
    'Open Search Editor',
    'Open workspace search results in an editor tab.',
    ['search.action.openNewEditor'],
  ),
  workspaceCommand(
    'workspace.quickOpenPreviousEditor',
    'Quick open previous editor',
    'Switch to the previously active editor.',
    ['workbench.action.quickOpenPreviousEditor'],
  ),
  workspaceCommand('workspace.quickOpenView', 'Open view', 'Search and focus workspace views.', [
    'workbench.action.quickOpenView',
  ]),
  workspaceCommand(
    'workspace.gotoSymbol',
    'Go to symbol in editor',
    'Search symbols in the active editor.',
    ['workbench.action.gotoSymbol'],
  ),
  workspaceCommand('workspace.showAllEditors', 'Show all editors', 'Search open editor tabs.', [
    'workbench.action.showAllEditors',
  ]),
  workspaceCommand('workspace.saveFile', 'Save', 'Save the active editor.', [
    'workbench.action.files.save',
  ]),
  workspaceCommand('workspace.saveAllFiles', 'Save all', 'Save all dirty editors.', [
    'workbench.action.files.saveAll',
  ]),
  workspaceCommand('workspace.revertFile', 'Revert file', 'Reload the active editor from disk.', [
    'workbench.action.files.revert',
  ]),
  workspaceCommand(
    'workspace.reopenClosedEditor',
    'Reopen closed editor',
    'Reopen the most recently closed editor tab.',
    ['workbench.action.reopenClosedEditor'],
  ),
  workspaceCommand(
    'workspace.toggleSidebarVisibility',
    'Toggle Files pane',
    'Open, collapse, expand, or focus the Files pane.',
    ['workbench.action.toggleSidebarVisibility'],
  ),
  workspaceCommand(
    'workspace.togglePanel',
    'Toggle panel',
    'Show or hide the active workspace panel.',
    ['workbench.action.togglePanel'],
  ),
  workspaceCommand(
    'workspace.focusFirstEditorGroup',
    'Focus first editor group',
    'Focus the primary editor group.',
    ['workbench.action.focusFirstEditorGroup'],
  ),
  workspaceCommand(
    'workspace.focusSecondEditorGroup',
    'Focus second editor group',
    'Focus the current editor group in single-group mode.',
    ['workbench.action.focusSecondEditorGroup'],
  ),
  workspaceCommand(
    'workspace.focusThirdEditorGroup',
    'Focus third editor group',
    'Focus the current editor group in single-group mode.',
    ['workbench.action.focusThirdEditorGroup'],
  ),
  workspaceCommand('workspace.focusEditor', 'Focus editor', 'Move keyboard focus to the editor.'),
  workspaceCommand(
    'workspace.focusFileTree',
    'Focus file tree',
    'Move keyboard focus to the file tree.',
  ),
  workspaceCommand('workspace.focusGit', 'Focus Git', 'Move keyboard focus to the Git panel.'),
  workspaceCommand(
    'workspace.closeCurrentTab',
    'Close current tab',
    'Close the selected editor tab.',
    ['workbench.action.closeActiveEditor'],
  ),
  workspaceCommand(
    'workspace.toggleDiffViewMode',
    'Toggle diff view mode',
    'Switch the active diff viewer between split and unified modes.',
  ),
  workspaceCommand(
    'workspace.toggleUiMode',
    'Toggle Chat mode',
    'Switch between the Workbench and Chat layouts.',
  ),
  workspaceCommand(
    'workspace.showChatMode',
    'Chat mode',
    'Show sessions, chat, and tools in the chat layout.',
  ),
  workspaceCommand(
    'workspace.showWorkbenchMode',
    'Workbench mode',
    'Show the editor-centred workbench layout.',
  ),
  appearanceCommand(
    'workspace.selectColorMode',
    'Choose color mode',
    'Pick light, dark, or system color mode.',
  ),
  appearanceCommand('workspace.setDarkTheme', 'Dark color mode', 'Use dark color mode.'),
  appearanceCommand('workspace.setLightTheme', 'Light color mode', 'Use light color mode.'),
  appearanceCommand(
    'workspace.setSystemTheme',
    'System color mode',
    'Follow the system color mode.',
  ),
] satisfies readonly CommandSpec<WorkspaceCommandId>[]

const editorCommandSpecs = [
  editorCommand('undo', 'Undo', ['undo']),
  editorCommand('redo', 'Redo', ['redo']),
  editorCommand('find', 'Find', ['actions.find']),
  editorCommand('findReplace', 'Find and replace', ['editor.action.startFindReplaceAction']),
  editorCommand('findNext', 'Find next', ['editor.action.nextMatchFindAction']),
  editorCommand('findPrevious', 'Find previous', ['editor.action.previousMatchFindAction']),
  editorCommand('goToDefinition', 'Go to definition', ['editor.action.revealDefinition']),
  editorCommand('editor.action.goToReferences', 'Find references', [
    'editor.action.goToReferences',
  ]),
  editorCommand('closeFind', 'Close find', ['closeFindWidget']),
  editorCommand('toggleFindCaseSensitive', 'Toggle case sensitive find', [
    'toggleFindCaseSensitive',
  ]),
  editorCommand('toggleFindWholeWord', 'Toggle whole word find', ['toggleFindWholeWord']),
  editorCommand('toggleFindRegex', 'Toggle regex find', ['toggleFindRegex']),
  editorCommand('toggleFindInSelection', 'Toggle find in selection', ['toggleFindInSelection']),
  editorCommand('togglePreserveCase', 'Toggle preserve case', ['togglePreserveCase']),
  editorCommand('replaceOne', 'Replace', ['editor.action.replaceOne']),
  editorCommand('replaceAll', 'Replace all', ['editor.action.replaceAll']),
  editorCommand('selectAllMatches', 'Select all matches', ['editor.action.selectAllMatches']),
  editorCommand('selectAll', 'Select all', ['editor.action.selectAll']),
  editorCommand('addNextOccurrence', 'Add next occurrence', [
    'editor.action.addSelectionToNextFindMatch',
  ]),
  editorCommand('clearSecondarySelections', 'Clear secondary selections', [
    'removeSecondaryCursors',
  ]),
  editorCommand('deleteWordLeft', 'Delete word left', ['deleteWordLeft']),
  editorCommand('deleteWordRight', 'Delete word right', ['deleteWordRight']),
  editorCommand('editor.action.deleteLines', 'Delete line', ['editor.action.deleteLines']),
  editorCommand('editor.action.copyLinesUpAction', 'Copy line up', [
    'editor.action.copyLinesUpAction',
  ]),
  editorCommand('editor.action.copyLinesDownAction', 'Copy line down', [
    'editor.action.copyLinesDownAction',
  ]),
  editorCommand('editor.action.moveLinesUpAction', 'Move line up', [
    'editor.action.moveLinesUpAction',
  ]),
  editorCommand('editor.action.moveLinesDownAction', 'Move line down', [
    'editor.action.moveLinesDownAction',
  ]),
  editorCommand('editor.action.insertLineBefore', 'Insert line above', [
    'editor.action.insertLineBefore',
  ]),
  editorCommand('editor.action.insertLineAfter', 'Insert line below', [
    'editor.action.insertLineAfter',
  ]),
  editorCommand('editor.action.commentLine', 'Toggle line comment', ['editor.action.commentLine']),
  editorCommand('editor.action.blockComment', 'Toggle block comment', [
    'editor.action.blockComment',
  ]),
  editorCommand('editor.action.indentLines', 'Indent line', ['editor.action.indentLines']),
  editorCommand('editor.action.outdentLines', 'Outdent line', ['editor.action.outdentLines']),
  editorCommand('editor.action.insertCursorAbove', 'Add cursor above', [
    'editor.action.insertCursorAbove',
  ]),
  editorCommand('editor.action.insertCursorBelow', 'Add cursor below', [
    'editor.action.insertCursorBelow',
  ]),
  editorCommand('editor.action.selectHighlights', 'Select all occurrences', [
    'editor.action.selectHighlights',
  ]),
  editorCommand('editor.action.changeAll', 'Change all occurrences', ['editor.action.changeAll']),
  editorCommand(
    'editor.action.moveSelectionToNextFindMatch',
    'Move last selection to next find match',
    ['editor.action.moveSelectionToNextFindMatch'],
  ),
  editorCommand('deleteBackward', 'Delete backward'),
  editorCommand('deleteForward', 'Delete forward'),
  editorCommand('indentSelection', 'Indent selection', ['tab']),
  editorCommand('outdentSelection', 'Outdent selection', ['outdent']),
  editorCommand('cursorLeft', 'Move cursor left', ['cursorLeft']),
  editorCommand('cursorRight', 'Move cursor right', ['cursorRight']),
  editorCommand('cursorUp', 'Move cursor up', ['cursorUp']),
  editorCommand('cursorDown', 'Move cursor down', ['cursorDown']),
  editorCommand('selectLeft', 'Select left', ['cursorLeftSelect']),
  editorCommand('selectRight', 'Select right', ['cursorRightSelect']),
  editorCommand('selectUp', 'Select up', ['cursorUpSelect']),
  editorCommand('selectDown', 'Select down', ['cursorDownSelect']),
  editorCommand('cursorWordLeft', 'Move cursor word left', ['cursorWordLeft']),
  editorCommand('cursorWordRight', 'Move cursor word right', [
    'cursorWordRight',
    'cursorWordEndRight',
  ]),
  editorCommand('selectWordLeft', 'Select word left', ['cursorWordLeftSelect']),
  editorCommand('selectWordRight', 'Select word right', [
    'cursorWordRightSelect',
    'cursorWordEndRightSelect',
  ]),
  editorCommand('cursorLineStart', 'Move cursor to line start', ['cursorHome', 'cursorLineStart']),
  editorCommand('cursorLineEnd', 'Move cursor to line end', ['cursorEnd', 'cursorLineEnd']),
  editorCommand('selectLineStart', 'Select to line start', [
    'cursorHomeSelect',
    'cursorLineStartSelect',
  ]),
  editorCommand('selectLineEnd', 'Select to line end', ['cursorEndSelect', 'cursorLineEndSelect']),
  editorCommand('cursorPageUp', 'Move cursor page up', ['cursorPageUp']),
  editorCommand('cursorPageDown', 'Move cursor page down', ['cursorPageDown']),
  editorCommand('selectPageUp', 'Select page up', ['cursorPageUpSelect']),
  editorCommand('selectPageDown', 'Select page down', ['cursorPageDownSelect']),
  editorCommand('cursorDocumentStart', 'Move cursor to document start', ['cursorTop']),
  editorCommand('cursorDocumentEnd', 'Move cursor to document end', ['cursorBottom']),
  editorCommand('selectDocumentStart', 'Select to document start', ['cursorTopSelect']),
  editorCommand('selectDocumentEnd', 'Select to document end', ['cursorBottomSelect']),
] satisfies readonly CommandSpec<EditorPlatformCommandId>[]

export const platformCommandSpecs = [
  ...workspaceCommandSpecs,
  ...editorCommandSpecs,
] satisfies readonly CommandSpec[]

export function platformCommandSpec(command: PlatformCommandId): CommandSpec | null {
  return platformCommandSpecById.get(command) ?? null
}

export function commandHotkeyMeta(command: PlatformCommandId) {
  const spec = platformCommandSpec(command)
  if (!spec) return undefined
  if (!spec.description) return { name: spec.title }

  return {
    description: spec.description,
    name: spec.title,
  }
}

const platformCommandSpecById = new Map(platformCommandSpecs.map((spec) => [spec.id, spec]))

function workspaceCommand(
  id: WorkspaceCommandId,
  title: string,
  description: string,
  vscodeCommandIds: readonly string[] = [],
): CommandSpec<WorkspaceCommandId> {
  return {
    category: 'Workspace',
    commandFamily: 'workspace',
    commandKind: 'workspace',
    description,
    id,
    title,
    vscodeCommandIds,
  }
}

function appearanceCommand(
  id: WorkspaceCommandId,
  title: string,
  description: string,
): CommandSpec<WorkspaceCommandId> {
  return {
    category: 'Appearance',
    commandFamily: 'appearance',
    commandKind: 'workspace',
    description,
    id,
    title,
  }
}

function editorCommand(
  id: EditorCommandId,
  title: string,
  vscodeCommandIds: readonly string[] = [],
): CommandSpec<EditorPlatformCommandId> {
  return {
    category: 'Editor',
    commandFamily: 'editor',
    commandKind: 'editor',
    id: `editor.${id}`,
    title,
    vscodeCommandIds,
  }
}
