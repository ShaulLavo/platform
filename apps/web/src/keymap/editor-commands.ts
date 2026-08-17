import {
  ArrowArcLeftIcon,
  ArrowArcRightIcon,
  ArrowLineDownIcon,
  ArrowLineUpIcon,
  ArrowSquareOutIcon,
  ArrowsOutLineVerticalIcon,
  ChatTextIcon,
  CopySimpleIcon,
  CursorClickIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  SelectionIcon,
  SwapIcon,
  TextIndentIcon,
  TextOutdentIcon,
  TrashIcon,
} from '@phosphor-icons/react'

import { defineEditorCommand } from './define-command'

export const editorCommands = [
  defineEditorCommand({
    icon: ArrowArcLeftIcon,
    id: 'undo',
    keys: [{ hotkey: 'Mod+Z', vscodeCommandId: 'undo' }],
    title: 'Undo',
    vscodeCommandIds: ['undo'],
  }),
  defineEditorCommand({
    icon: ArrowArcRightIcon,
    id: 'redo',
    keys: [
      { hotkey: 'Mod+Shift+Z', vscodeCommandId: 'redo' },
      { hotkey: 'Control+Y', platforms: ['windows', 'linux'], vscodeCommandId: 'redo' },
    ],
    title: 'Redo',
    vscodeCommandIds: ['redo'],
  }),
  defineEditorCommand({
    icon: MagnifyingGlassIcon,
    id: 'find',
    keys: [{ hotkey: 'Mod+F', vscodeCommandId: 'actions.find' }],
    title: 'Find',
    vscodeCommandIds: ['actions.find'],
  }),
  defineEditorCommand({
    icon: SwapIcon,
    id: 'findReplace',
    keys: [
      {
        hotkey: 'Mod+H',
        platforms: ['windows', 'linux'],
        vscodeCommandId: 'editor.action.startFindReplaceAction',
      },
      {
        hotkey: 'Mod+Alt+F',
        platforms: ['mac'],
        vscodeCommandId: 'editor.action.startFindReplaceAction',
      },
    ],
    title: 'Find and replace',
    vscodeCommandIds: ['editor.action.startFindReplaceAction'],
  }),
  defineEditorCommand({
    icon: MagnifyingGlassIcon,
    id: 'findNext',
    keys: [
      { hotkey: 'F3', vscodeCommandId: 'editor.action.nextMatchFindAction' },
      { hotkey: 'Mod+G', platforms: ['mac'], vscodeCommandId: 'editor.action.nextMatchFindAction' },
    ],
    title: 'Find next',
    vscodeCommandIds: ['editor.action.nextMatchFindAction'],
  }),
  defineEditorCommand({
    icon: MagnifyingGlassIcon,
    id: 'findPrevious',
    keys: [
      { hotkey: 'Shift+F3', vscodeCommandId: 'editor.action.previousMatchFindAction' },
      {
        hotkey: 'Mod+Shift+G',
        platforms: ['mac'],
        vscodeCommandId: 'editor.action.previousMatchFindAction',
      },
    ],
    title: 'Find previous',
    vscodeCommandIds: ['editor.action.previousMatchFindAction'],
  }),
  defineEditorCommand({
    icon: ArrowSquareOutIcon,
    id: 'goToDefinition',
    title: 'Go to definition',
    vscodeCommandIds: ['editor.action.revealDefinition'],
  }),
  defineEditorCommand({
    icon: LinkIcon,
    id: 'editor.action.goToReferences',
    keys: [
      {
        hotkey: 'Shift+F12',
        preventDefault: true,
        vscodeCommandId: 'editor.action.goToReferences',
      },
    ],
    title: 'Find references',
    vscodeCommandIds: ['editor.action.goToReferences'],
  }),
  defineEditorCommand({
    id: 'closeFind',
    keys: [
      { hotkey: 'Escape', vscodeCommandId: 'closeFindWidget' },
      { hotkey: 'Shift+Escape', vscodeCommandId: 'closeFindWidget' },
    ],
    title: 'Close find',
    vscodeCommandIds: ['closeFindWidget'],
  }),
  defineEditorCommand({
    id: 'toggleFindCaseSensitive',
    keys: [
      {
        hotkey: 'Alt+C',
        platforms: ['windows', 'linux'],
        vscodeCommandId: 'toggleFindCaseSensitive',
      },
      { hotkey: 'Mod+Alt+C', platforms: ['mac'], vscodeCommandId: 'toggleFindCaseSensitive' },
    ],
    title: 'Toggle case sensitive find',
    vscodeCommandIds: ['toggleFindCaseSensitive'],
  }),
  defineEditorCommand({
    id: 'toggleFindWholeWord',
    keys: [
      { hotkey: 'Alt+W', platforms: ['windows', 'linux'], vscodeCommandId: 'toggleFindWholeWord' },
      { hotkey: 'Mod+Alt+W', platforms: ['mac'], vscodeCommandId: 'toggleFindWholeWord' },
    ],
    title: 'Toggle whole word find',
    vscodeCommandIds: ['toggleFindWholeWord'],
  }),
  defineEditorCommand({
    id: 'toggleFindRegex',
    keys: [
      { hotkey: 'Alt+R', platforms: ['windows', 'linux'], vscodeCommandId: 'toggleFindRegex' },
      { hotkey: 'Mod+Alt+R', platforms: ['mac'], vscodeCommandId: 'toggleFindRegex' },
    ],
    title: 'Toggle regex find',
    vscodeCommandIds: ['toggleFindRegex'],
  }),
  defineEditorCommand({
    id: 'toggleFindInSelection',
    keys: [
      {
        hotkey: 'Alt+L',
        platforms: ['windows', 'linux'],
        vscodeCommandId: 'toggleFindInSelection',
      },
      { hotkey: 'Mod+Alt+L', platforms: ['mac'], vscodeCommandId: 'toggleFindInSelection' },
    ],
    title: 'Toggle find in selection',
    vscodeCommandIds: ['toggleFindInSelection'],
  }),
  defineEditorCommand({
    id: 'togglePreserveCase',
    keys: [
      { hotkey: 'Alt+P', platforms: ['windows', 'linux'], vscodeCommandId: 'togglePreserveCase' },
      { hotkey: 'Mod+Alt+P', platforms: ['mac'], vscodeCommandId: 'togglePreserveCase' },
    ],
    title: 'Toggle preserve case',
    vscodeCommandIds: ['togglePreserveCase'],
  }),
  defineEditorCommand({
    icon: SwapIcon,
    id: 'replaceOne',
    keys: [{ hotkey: 'Mod+Shift+1', vscodeCommandId: 'editor.action.replaceOne' }],
    title: 'Replace',
    vscodeCommandIds: ['editor.action.replaceOne'],
  }),
  defineEditorCommand({
    icon: SwapIcon,
    id: 'replaceAll',
    keys: [{ hotkey: 'Mod+Alt+Enter', vscodeCommandId: 'editor.action.replaceAll' }],
    title: 'Replace all',
    vscodeCommandIds: ['editor.action.replaceAll'],
  }),
  defineEditorCommand({
    icon: SelectionIcon,
    id: 'selectAllMatches',
    keys: [{ hotkey: 'Alt+Enter', vscodeCommandId: 'editor.action.selectAllMatches' }],
    title: 'Select all matches',
    vscodeCommandIds: ['editor.action.selectAllMatches'],
  }),
  defineEditorCommand({
    icon: SelectionIcon,
    id: 'selectAll',
    keys: [{ hotkey: 'Mod+A', vscodeCommandId: 'editor.action.selectAll' }],
    title: 'Select all',
    vscodeCommandIds: ['editor.action.selectAll'],
  }),
  defineEditorCommand({
    icon: CursorClickIcon,
    id: 'addNextOccurrence',
    keys: [{ hotkey: 'Mod+D', vscodeCommandId: 'editor.action.addSelectionToNextFindMatch' }],
    title: 'Add next occurrence',
    vscodeCommandIds: ['editor.action.addSelectionToNextFindMatch'],
  }),
  defineEditorCommand({
    icon: CursorClickIcon,
    id: 'clearSecondarySelections',
    title: 'Clear secondary selections',
    vscodeCommandIds: ['removeSecondaryCursors'],
  }),
  defineEditorCommand({
    id: 'deleteWordLeft',
    keys: [
      { hotkey: 'Alt+Backspace', platforms: ['mac'], vscodeCommandId: 'deleteWordLeft' },
      {
        hotkey: 'Mod+Backspace',
        platforms: ['windows', 'linux'],
        vscodeCommandId: 'deleteWordLeft',
      },
    ],
    title: 'Delete word left',
    vscodeCommandIds: ['deleteWordLeft'],
  }),
  defineEditorCommand({
    id: 'deleteWordRight',
    keys: [
      { hotkey: 'Alt+Delete', platforms: ['mac'], vscodeCommandId: 'deleteWordRight' },
      { hotkey: 'Mod+Delete', platforms: ['windows', 'linux'], vscodeCommandId: 'deleteWordRight' },
    ],
    title: 'Delete word right',
    vscodeCommandIds: ['deleteWordRight'],
  }),
  defineEditorCommand({
    icon: TrashIcon,
    id: 'editor.action.deleteLines',
    keys: [{ hotkey: 'Mod+Shift+K', vscodeCommandId: 'editor.action.deleteLines' }],
    title: 'Delete line',
    vscodeCommandIds: ['editor.action.deleteLines'],
  }),
  defineEditorCommand({
    icon: CopySimpleIcon,
    id: 'editor.action.copyLinesUpAction',
    keys: [
      {
        hotkey: 'Alt+Shift+ArrowUp',
        platforms: ['mac', 'windows'],
        vscodeCommandId: 'editor.action.copyLinesUpAction',
      },
      {
        hotkey: 'Mod+Alt+Shift+ArrowUp',
        platforms: ['linux'],
        vscodeCommandId: 'editor.action.copyLinesUpAction',
      },
    ],
    title: 'Copy line up',
    vscodeCommandIds: ['editor.action.copyLinesUpAction'],
  }),
  defineEditorCommand({
    icon: CopySimpleIcon,
    id: 'editor.action.copyLinesDownAction',
    keys: [
      {
        hotkey: 'Alt+Shift+ArrowDown',
        platforms: ['mac', 'windows'],
        vscodeCommandId: 'editor.action.copyLinesDownAction',
      },
      {
        hotkey: 'Mod+Alt+Shift+ArrowDown',
        platforms: ['linux'],
        vscodeCommandId: 'editor.action.copyLinesDownAction',
      },
    ],
    title: 'Copy line down',
    vscodeCommandIds: ['editor.action.copyLinesDownAction'],
  }),
  defineEditorCommand({
    icon: ArrowsOutLineVerticalIcon,
    id: 'editor.action.moveLinesUpAction',
    keys: [{ hotkey: 'Alt+ArrowUp', vscodeCommandId: 'editor.action.moveLinesUpAction' }],
    title: 'Move line up',
    vscodeCommandIds: ['editor.action.moveLinesUpAction'],
  }),
  defineEditorCommand({
    icon: ArrowsOutLineVerticalIcon,
    id: 'editor.action.moveLinesDownAction',
    keys: [{ hotkey: 'Alt+ArrowDown', vscodeCommandId: 'editor.action.moveLinesDownAction' }],
    title: 'Move line down',
    vscodeCommandIds: ['editor.action.moveLinesDownAction'],
  }),
  defineEditorCommand({
    icon: ArrowLineUpIcon,
    id: 'editor.action.insertLineBefore',
    keys: [{ hotkey: 'Mod+Shift+Enter', vscodeCommandId: 'editor.action.insertLineBefore' }],
    title: 'Insert line above',
    vscodeCommandIds: ['editor.action.insertLineBefore'],
  }),
  defineEditorCommand({
    icon: ArrowLineDownIcon,
    id: 'editor.action.insertLineAfter',
    keys: [{ hotkey: 'Mod+Enter', vscodeCommandId: 'editor.action.insertLineAfter' }],
    title: 'Insert line below',
    vscodeCommandIds: ['editor.action.insertLineAfter'],
  }),
  defineEditorCommand({
    icon: ChatTextIcon,
    id: 'editor.action.commentLine',
    keys: [{ hotkey: 'Mod+/', vscodeCommandId: 'editor.action.commentLine' }],
    title: 'Toggle line comment',
    vscodeCommandIds: ['editor.action.commentLine'],
  }),
  defineEditorCommand({
    icon: ChatTextIcon,
    id: 'editor.action.blockComment',
    keys: [
      {
        hotkey: 'Alt+Shift+A',
        platforms: ['mac', 'windows'],
        vscodeCommandId: 'editor.action.blockComment',
      },
      {
        hotkey: 'Mod+Shift+A',
        platforms: ['linux'],
        vscodeCommandId: 'editor.action.blockComment',
      },
    ],
    title: 'Toggle block comment',
    vscodeCommandIds: ['editor.action.blockComment'],
  }),
  defineEditorCommand({
    icon: TextIndentIcon,
    id: 'editor.action.indentLines',
    keys: [{ hotkey: 'Mod+]', vscodeCommandId: 'editor.action.indentLines' }],
    title: 'Indent line',
    vscodeCommandIds: ['editor.action.indentLines'],
  }),
  defineEditorCommand({
    icon: TextOutdentIcon,
    id: 'editor.action.outdentLines',
    keys: [{ hotkey: 'Mod+[', vscodeCommandId: 'editor.action.outdentLines' }],
    title: 'Outdent line',
    vscodeCommandIds: ['editor.action.outdentLines'],
  }),
  defineEditorCommand({
    icon: CursorClickIcon,
    id: 'editor.action.insertCursorAbove',
    keys: [
      {
        hotkey: 'Mod+Alt+ArrowUp',
        platforms: ['mac', 'windows'],
        vscodeCommandId: 'editor.action.insertCursorAbove',
      },
      {
        hotkey: 'Alt+Shift+ArrowUp',
        platforms: ['linux'],
        vscodeCommandId: 'editor.action.insertCursorAbove',
      },
      {
        hotkey: 'Mod+Shift+ArrowUp',
        platforms: ['linux'],
        vscodeCommandId: 'editor.action.insertCursorAbove',
      },
    ],
    title: 'Add cursor above',
    vscodeCommandIds: ['editor.action.insertCursorAbove'],
  }),
  defineEditorCommand({
    icon: CursorClickIcon,
    id: 'editor.action.insertCursorBelow',
    keys: [
      {
        hotkey: 'Mod+Alt+ArrowDown',
        platforms: ['mac', 'windows'],
        vscodeCommandId: 'editor.action.insertCursorBelow',
      },
      {
        hotkey: 'Alt+Shift+ArrowDown',
        platforms: ['linux'],
        vscodeCommandId: 'editor.action.insertCursorBelow',
      },
      {
        hotkey: 'Mod+Shift+ArrowDown',
        platforms: ['linux'],
        vscodeCommandId: 'editor.action.insertCursorBelow',
      },
    ],
    title: 'Add cursor below',
    vscodeCommandIds: ['editor.action.insertCursorBelow'],
  }),
  defineEditorCommand({
    icon: SelectionIcon,
    id: 'editor.action.selectHighlights',
    keys: [{ hotkey: 'Mod+Shift+L', vscodeCommandId: 'editor.action.selectHighlights' }],
    title: 'Select all occurrences',
    vscodeCommandIds: ['editor.action.selectHighlights'],
  }),
  defineEditorCommand({
    icon: SwapIcon,
    id: 'editor.action.changeAll',
    keys: [{ hotkey: 'Mod+F2', vscodeCommandId: 'editor.action.changeAll' }],
    title: 'Change all occurrences',
    vscodeCommandIds: ['editor.action.changeAll'],
  }),
  // VS Code binds this to Mod+Shift+\, which the hotkey layer refuses: Shift with punctuation is
  // layout-dependent (see PunctuationKey). Mod+\ is unclaimed and keeps the backslash mnemonic.
  defineEditorCommand({
    id: 'editor.action.jumpToBracket',
    keys: [{ hotkey: 'Mod+\\', vscodeCommandId: 'editor.action.jumpToBracket' }],
    title: 'Go to bracket',
    vscodeCommandIds: ['editor.action.jumpToBracket'],
  }),
  // VS Code's subword motion, which it ships on Ctrl+Alt+Arrow on macOS.
  defineEditorCommand({
    id: 'cursorWordPartLeft',
    keys: [
      {
        hotkey: 'Control+Alt+ArrowLeft',
        platforms: ['mac'],
        vscodeCommandId: 'cursorWordPartLeft',
      },
    ],
    title: 'Cursor word part left',
    vscodeCommandIds: ['cursorWordPartLeft'],
  }),
  defineEditorCommand({
    id: 'cursorWordPartRight',
    keys: [
      {
        hotkey: 'Control+Alt+ArrowRight',
        platforms: ['mac'],
        vscodeCommandId: 'cursorWordPartRight',
      },
    ],
    title: 'Cursor word part right',
    vscodeCommandIds: ['cursorWordPartRight'],
  }),
  defineEditorCommand({
    id: 'editor.action.trimTrailingWhitespace',
    title: 'Trim trailing whitespace',
    vscodeCommandIds: ['editor.action.trimTrailingWhitespace'],
  }),
  defineEditorCommand({
    id: 'editor.action.sortLinesAscending',
    title: 'Sort lines ascending',
    vscodeCommandIds: ['editor.action.sortLinesAscending'],
  }),
  defineEditorCommand({
    id: 'editor.action.sortLinesDescending',
    title: 'Sort lines descending',
    vscodeCommandIds: ['editor.action.sortLinesDescending'],
  }),
  defineEditorCommand({
    id: 'editor.action.joinLines',
    keys: [{ hotkey: 'Control+J', platforms: ['mac'], vscodeCommandId: 'editor.action.joinLines' }],
    title: 'Join lines',
    vscodeCommandIds: ['editor.action.joinLines'],
  }),
  // Duplicate Selection stays palette-only, as in VS Code: Alt+Shift+Down is Copy Line Down, and
  // taking that key would replace a line command with a selection one.
  defineEditorCommand({
    id: 'editor.action.duplicateSelection',
    title: 'Duplicate selection',
    vscodeCommandIds: ['editor.action.duplicateSelection'],
  }),
  defineEditorCommand({
    id: 'editor.action.transformToUppercase',
    title: 'Transform to uppercase',
    vscodeCommandIds: ['editor.action.transformToUppercase'],
  }),
  defineEditorCommand({
    id: 'editor.action.transformToLowercase',
    title: 'Transform to lowercase',
    vscodeCommandIds: ['editor.action.transformToLowercase'],
  }),
  defineEditorCommand({
    id: 'editor.action.transformToTitlecase',
    title: 'Transform to title case',
    vscodeCommandIds: ['editor.action.transformToTitlecase'],
  }),
  defineEditorCommand({
    id: 'editor.action.rename',
    keys: [{ hotkey: 'F2', vscodeCommandId: 'editor.action.rename' }],
    title: 'Rename symbol',
    vscodeCommandIds: ['editor.action.rename'],
  }),
  // VS Code writes this Shift+Alt+F; the hotkey layer canonicalises modifiers as Alt+Shift.
  defineEditorCommand({
    id: 'editor.action.formatDocument',
    keys: [{ hotkey: 'Alt+Shift+F', vscodeCommandId: 'editor.action.formatDocument' }],
    title: 'Format document',
    vscodeCommandIds: ['editor.action.formatDocument'],
  }),
  defineEditorCommand({
    id: 'editor.action.toggleWordWrap',
    keys: [{ hotkey: 'Alt+Z', vscodeCommandId: 'editor.action.toggleWordWrap' }],
    title: 'Toggle word wrap',
    vscodeCommandIds: ['editor.action.toggleWordWrap'],
  }),
  defineEditorCommand({
    id: 'editor.action.moveSelectionToNextFindMatch',
    title: 'Move last selection to next find match',
    vscodeCommandIds: ['editor.action.moveSelectionToNextFindMatch'],
  }),
  defineEditorCommand({
    id: 'deleteBackward',
    keys: [
      { hotkey: 'Backspace' },
      { hotkey: 'Shift+Backspace' },
      { hotkey: 'Control+H', platforms: ['mac'] },
    ],
    title: 'Delete backward',
  }),
  defineEditorCommand({
    id: 'deleteForward',
    keys: [{ hotkey: 'Delete' }, { hotkey: 'Control+D', platforms: ['mac'] }],
    title: 'Delete forward',
  }),
  // TODO: Tab should not insert spaces at the cursor position; it should indent
  // at the beginning of the line. Make this behavior configurable — may want to
  // wait for the settings feature before wiring it up.
  defineEditorCommand({
    icon: TextIndentIcon,
    id: 'indentSelection',
    keys: [{ hotkey: 'Tab', vscodeCommandId: 'tab' }],
    title: 'Indent selection',
    vscodeCommandIds: ['tab'],
  }),
  defineEditorCommand({
    icon: TextOutdentIcon,
    id: 'outdentSelection',
    keys: [{ hotkey: 'Shift+Tab', vscodeCommandId: 'outdent' }],
    title: 'Outdent selection',
    vscodeCommandIds: ['outdent'],
  }),
  defineEditorCommand({
    id: 'cursorLeft',
    keys: [
      { hotkey: 'ArrowLeft', vscodeCommandId: 'cursorLeft' },
      { hotkey: 'Control+B', platforms: ['mac'], vscodeCommandId: 'cursorLeft' },
    ],
    title: 'Move cursor left',
    vscodeCommandIds: ['cursorLeft'],
  }),
  defineEditorCommand({
    id: 'cursorRight',
    keys: [
      { hotkey: 'ArrowRight', vscodeCommandId: 'cursorRight' },
      { hotkey: 'Control+F', platforms: ['mac'], vscodeCommandId: 'cursorRight' },
    ],
    title: 'Move cursor right',
    vscodeCommandIds: ['cursorRight'],
  }),
  defineEditorCommand({
    id: 'cursorUp',
    keys: [
      { hotkey: 'ArrowUp', vscodeCommandId: 'cursorUp' },
      { hotkey: 'Control+P', platforms: ['mac'], vscodeCommandId: 'cursorUp' },
    ],
    title: 'Move cursor up',
    vscodeCommandIds: ['cursorUp'],
  }),
  defineEditorCommand({
    id: 'cursorDown',
    keys: [
      { hotkey: 'ArrowDown', vscodeCommandId: 'cursorDown' },
      { hotkey: 'Control+N', platforms: ['mac'], vscodeCommandId: 'cursorDown' },
    ],
    title: 'Move cursor down',
    vscodeCommandIds: ['cursorDown'],
  }),
  defineEditorCommand({
    id: 'selectLeft',
    keys: [{ hotkey: 'Shift+ArrowLeft', vscodeCommandId: 'cursorLeftSelect' }],
    title: 'Select left',
    vscodeCommandIds: ['cursorLeftSelect'],
  }),
  defineEditorCommand({
    id: 'selectRight',
    keys: [{ hotkey: 'Shift+ArrowRight', vscodeCommandId: 'cursorRightSelect' }],
    title: 'Select right',
    vscodeCommandIds: ['cursorRightSelect'],
  }),
  defineEditorCommand({
    id: 'selectUp',
    keys: [{ hotkey: 'Shift+ArrowUp', vscodeCommandId: 'cursorUpSelect' }],
    title: 'Select up',
    vscodeCommandIds: ['cursorUpSelect'],
  }),
  defineEditorCommand({
    id: 'selectDown',
    keys: [{ hotkey: 'Shift+ArrowDown', vscodeCommandId: 'cursorDownSelect' }],
    title: 'Select down',
    vscodeCommandIds: ['cursorDownSelect'],
  }),
  defineEditorCommand({
    id: 'cursorWordLeft',
    keys: [
      { hotkey: 'Alt+ArrowLeft', platforms: ['mac'], vscodeCommandId: 'cursorWordLeft' },
      {
        hotkey: 'Control+ArrowLeft',
        platforms: ['windows', 'linux'],
        vscodeCommandId: 'cursorWordLeft',
      },
    ],
    title: 'Move cursor word left',
    vscodeCommandIds: ['cursorWordLeft'],
  }),
  defineEditorCommand({
    id: 'cursorWordRight',
    keys: [
      { hotkey: 'Alt+ArrowRight', platforms: ['mac'], vscodeCommandId: 'cursorWordEndRight' },
      {
        hotkey: 'Control+ArrowRight',
        platforms: ['windows', 'linux'],
        vscodeCommandId: 'cursorWordEndRight',
      },
    ],
    title: 'Move cursor word right',
    vscodeCommandIds: ['cursorWordRight', 'cursorWordEndRight'],
  }),
  defineEditorCommand({
    id: 'selectWordLeft',
    keys: [
      {
        hotkey: 'Alt+Shift+ArrowLeft',
        platforms: ['mac'],
        vscodeCommandId: 'cursorWordLeftSelect',
      },
      {
        hotkey: 'Control+Shift+ArrowLeft',
        platforms: ['windows', 'linux'],
        vscodeCommandId: 'cursorWordLeftSelect',
      },
    ],
    title: 'Select word left',
    vscodeCommandIds: ['cursorWordLeftSelect'],
  }),
  defineEditorCommand({
    id: 'selectWordRight',
    keys: [
      {
        hotkey: 'Alt+Shift+ArrowRight',
        platforms: ['mac'],
        vscodeCommandId: 'cursorWordEndRightSelect',
      },
      {
        hotkey: 'Control+Shift+ArrowRight',
        platforms: ['windows', 'linux'],
        vscodeCommandId: 'cursorWordEndRightSelect',
      },
    ],
    title: 'Select word right',
    vscodeCommandIds: ['cursorWordRightSelect', 'cursorWordEndRightSelect'],
  }),
  defineEditorCommand({
    id: 'cursorLineStart',
    keys: [
      { hotkey: 'Home', vscodeCommandId: 'cursorHome' },
      { hotkey: 'Mod+ArrowLeft', platforms: ['mac'], vscodeCommandId: 'cursorHome' },
      { hotkey: 'Control+A', platforms: ['mac'], vscodeCommandId: 'cursorLineStart' },
    ],
    title: 'Move cursor to line start',
    vscodeCommandIds: ['cursorHome', 'cursorLineStart'],
  }),
  defineEditorCommand({
    id: 'cursorLineEnd',
    keys: [
      { hotkey: 'End', vscodeCommandId: 'cursorEnd' },
      { hotkey: 'Mod+ArrowRight', platforms: ['mac'], vscodeCommandId: 'cursorEnd' },
      { hotkey: 'Control+E', platforms: ['mac'], vscodeCommandId: 'cursorLineEnd' },
    ],
    title: 'Move cursor to line end',
    vscodeCommandIds: ['cursorEnd', 'cursorLineEnd'],
  }),
  defineEditorCommand({
    id: 'selectLineStart',
    keys: [
      { hotkey: 'Shift+Home', vscodeCommandId: 'cursorHomeSelect' },
      { hotkey: 'Mod+Shift+ArrowLeft', platforms: ['mac'], vscodeCommandId: 'cursorHomeSelect' },
      { hotkey: 'Control+Shift+A', platforms: ['mac'], vscodeCommandId: 'cursorLineStartSelect' },
    ],
    title: 'Select to line start',
    vscodeCommandIds: ['cursorHomeSelect', 'cursorLineStartSelect'],
  }),
  defineEditorCommand({
    id: 'selectLineEnd',
    keys: [
      { hotkey: 'Shift+End', vscodeCommandId: 'cursorEndSelect' },
      { hotkey: 'Mod+Shift+ArrowRight', platforms: ['mac'], vscodeCommandId: 'cursorEndSelect' },
      { hotkey: 'Control+Shift+E', platforms: ['mac'], vscodeCommandId: 'cursorLineEndSelect' },
    ],
    title: 'Select to line end',
    vscodeCommandIds: ['cursorEndSelect', 'cursorLineEndSelect'],
  }),
  defineEditorCommand({
    id: 'cursorPageUp',
    keys: [{ hotkey: 'PageUp', vscodeCommandId: 'cursorPageUp' }],
    title: 'Move cursor page up',
    vscodeCommandIds: ['cursorPageUp'],
  }),
  defineEditorCommand({
    id: 'cursorPageDown',
    keys: [{ hotkey: 'PageDown', vscodeCommandId: 'cursorPageDown' }],
    title: 'Move cursor page down',
    vscodeCommandIds: ['cursorPageDown'],
  }),
  defineEditorCommand({
    id: 'selectPageUp',
    keys: [{ hotkey: 'Shift+PageUp', vscodeCommandId: 'cursorPageUpSelect' }],
    title: 'Select page up',
    vscodeCommandIds: ['cursorPageUpSelect'],
  }),
  defineEditorCommand({
    id: 'selectPageDown',
    keys: [{ hotkey: 'Shift+PageDown', vscodeCommandId: 'cursorPageDownSelect' }],
    title: 'Select page down',
    vscodeCommandIds: ['cursorPageDownSelect'],
  }),
  defineEditorCommand({
    id: 'cursorDocumentStart',
    keys: [
      { hotkey: 'Mod+ArrowUp', platforms: ['mac'], vscodeCommandId: 'cursorTop' },
      { hotkey: 'Control+Home', platforms: ['windows', 'linux'], vscodeCommandId: 'cursorTop' },
    ],
    title: 'Move cursor to document start',
    vscodeCommandIds: ['cursorTop'],
  }),
  defineEditorCommand({
    id: 'cursorDocumentEnd',
    keys: [
      { hotkey: 'Mod+ArrowDown', platforms: ['mac'], vscodeCommandId: 'cursorBottom' },
      { hotkey: 'Control+End', platforms: ['windows', 'linux'], vscodeCommandId: 'cursorBottom' },
    ],
    title: 'Move cursor to document end',
    vscodeCommandIds: ['cursorBottom'],
  }),
  defineEditorCommand({
    id: 'selectDocumentStart',
    keys: [
      { hotkey: 'Mod+Shift+ArrowUp', platforms: ['mac'], vscodeCommandId: 'cursorTopSelect' },
      {
        hotkey: 'Control+Shift+Home',
        platforms: ['windows', 'linux'],
        vscodeCommandId: 'cursorTopSelect',
      },
    ],
    title: 'Select to document start',
    vscodeCommandIds: ['cursorTopSelect'],
  }),
  defineEditorCommand({
    id: 'selectDocumentEnd',
    keys: [
      { hotkey: 'Mod+Shift+ArrowDown', platforms: ['mac'], vscodeCommandId: 'cursorBottomSelect' },
      {
        hotkey: 'Control+Shift+End',
        platforms: ['windows', 'linux'],
        vscodeCommandId: 'cursorBottomSelect',
      },
    ],
    title: 'Select to document end',
    vscodeCommandIds: ['cursorBottomSelect'],
  }),
]
