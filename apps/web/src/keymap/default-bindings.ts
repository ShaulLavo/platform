import {
  detectPlatform,
  normalizeRegisterableHotkey,
  type RegisterableHotkey,
} from '@tanstack/react-hotkeys'

import { defaultWindowManagementHotkeyPresets } from '@/features/tiling-surface-manager/engine/layout-command-presets'
import type {
  WindowManagementCommandId,
  WindowManagementHotkeyPreset,
  WorkspaceLayout,
} from '@/features/tiling-surface-manager/engine/layout-types'

import { commandHotkeyMeta } from './command-registry'
import type {
  EditorPlatformCommandId,
  PlatformCommandId,
  PlatformKeyBinding,
  WorkspaceCommandId,
} from './types'
import { workspaceCommandIdForWindowManagementCommand } from './window-management-command-ids'

type PlatformName = ReturnType<typeof detectPlatform>

type DefaultBindingSpec = {
  readonly command: PlatformCommandId | null
  readonly hotkey: RegisterableHotkey
  readonly pane?: PlatformKeyBinding['pane']
  readonly platforms?: readonly PlatformName[]
  readonly preventDefault?: boolean
  readonly stopPropagation?: boolean
  readonly vscodeCommandId?: string
}

type EditorBindingOptions = Omit<
  DefaultBindingSpec,
  'command' | 'hotkey' | 'pane' | 'vscodeCommandId'
>

export function defaultPlatformKeyBindings(
  platform: PlatformName = detectPlatform(),
): readonly PlatformKeyBinding[] {
  return defaultBindingSpecs.flatMap((spec) => bindingForPlatform(spec, platform))
}

export function platformKeyBindingsForWorkspaceLayout(
  bindings: readonly PlatformKeyBinding[],
  layout: Pick<WorkspaceLayout, 'activeHotkeyPresetId' | 'hotkeyPresetsById'>,
  platform: PlatformName = detectPlatform(),
): readonly PlatformKeyBinding[] {
  const preset = activeHotkeyPresetForWorkspaceLayout(layout)
  if (!preset) return bindings

  const presetBindings = platformKeyBindingsForHotkeyPreset(preset, platform)
  if (presetBindings.length === 0) return bindings

  const presetCommands = new Set(presetBindings.map((binding) => binding.command))
  return [...bindings.filter((binding) => !presetCommands.has(binding.command)), ...presetBindings]
}

function bindingForPlatform(
  spec: DefaultBindingSpec,
  platform: PlatformName,
): readonly PlatformKeyBinding[] {
  if (!specMatchesPlatform(spec, platform)) return []

  return [
    {
      command: spec.command,
      hotkey: spec.hotkey,
      keys: normalizeRegisterableHotkey(spec.hotkey, platform),
      meta: spec.command ? commandHotkeyMeta(spec.command) : undefined,
      pane: spec.pane ?? 'any',
      preventDefault: spec.preventDefault,
      source: 'default',
      stopPropagation: spec.stopPropagation,
      vscodeCommandId: spec.vscodeCommandId,
    },
  ]
}

function activeHotkeyPresetForWorkspaceLayout(
  layout: Pick<WorkspaceLayout, 'activeHotkeyPresetId' | 'hotkeyPresetsById'>,
) {
  const activePresetId = layout.activeHotkeyPresetId
  if (!activePresetId) return null

  return (
    layout.hotkeyPresetsById[activePresetId] ??
    defaultWindowManagementHotkeyPresets().find((preset) => preset.id === activePresetId) ??
    null
  )
}

function platformKeyBindingsForHotkeyPreset(
  preset: WindowManagementHotkeyPreset,
  platform: PlatformName,
) {
  return Object.entries(preset.bindings).flatMap(([commandId, hotkey]) =>
    platformKeyBindingForPresetBinding(commandId, hotkey, platform),
  )
}

function platformKeyBindingForPresetBinding(
  commandId: string,
  hotkey: string,
  platform: PlatformName,
): readonly PlatformKeyBinding[] {
  const command = workspaceCommandIdForWindowManagementCommand(
    commandId as WindowManagementCommandId,
  )
  if (!command) return []

  return [
    {
      command,
      hotkey: hotkey as RegisterableHotkey,
      keys: normalizeRegisterableHotkey(hotkey as RegisterableHotkey, platform),
      meta: commandHotkeyMeta(command),
      pane: 'any',
      preventDefault: true,
      source: 'default',
      stopPropagation: true,
    },
  ]
}

function specMatchesPlatform(spec: DefaultBindingSpec, platform: PlatformName) {
  if (!spec.platforms) return true

  return spec.platforms.includes(platform)
}

function workspaceBinding(
  hotkey: RegisterableHotkey,
  command: WorkspaceCommandId,
  options: Omit<DefaultBindingSpec, 'command' | 'hotkey'> = {},
): DefaultBindingSpec {
  return { command, hotkey, pane: 'any', ...options }
}

function editorBinding(
  hotkey: RegisterableHotkey,
  command: EditorPlatformCommandId,
  options?: EditorBindingOptions,
): DefaultBindingSpec
function editorBinding(
  hotkey: RegisterableHotkey,
  command: EditorPlatformCommandId,
  vscodeCommandId: string,
  options?: EditorBindingOptions,
): DefaultBindingSpec
function editorBinding(
  hotkey: RegisterableHotkey,
  command: EditorPlatformCommandId,
  vscodeCommandIdOrOptions: string | EditorBindingOptions = {},
  options: EditorBindingOptions = {},
): DefaultBindingSpec {
  if (typeof vscodeCommandIdOrOptions === 'string') {
    return {
      command,
      hotkey,
      pane: 'editor',
      vscodeCommandId: vscodeCommandIdOrOptions,
      ...options,
    }
  }

  return { command, hotkey, pane: 'editor', ...vscodeCommandIdOrOptions }
}

function noOpBinding(
  hotkey: RegisterableHotkey,
  options: Omit<DefaultBindingSpec, 'command' | 'hotkey'>,
): DefaultBindingSpec {
  return {
    command: null,
    hotkey,
    pane: 'any',
    preventDefault: true,
    stopPropagation: true,
    ...options,
  }
}

const defaultBindingSpecs = [
  workspaceBinding('Mod+Shift+P', 'workspace.showCommandPalette', {
    preventDefault: true,
    stopPropagation: true,
    vscodeCommandId: 'workbench.action.showCommands',
  }),
  workspaceBinding('F1', 'workspace.showCommandPalette', {
    preventDefault: true,
    stopPropagation: true,
    vscodeCommandId: 'workbench.action.showCommands',
  }),
  workspaceBinding('Mod+P', 'workspace.showQuickAccess', {
    preventDefault: true,
    stopPropagation: true,
    vscodeCommandId: 'workbench.action.quickOpen',
  }),
  // TODO(electron): Bind these desktop/window-level VS Code defaults once
  // Platform can own shortcuts outside the browser sandbox.
  noOpBinding('Control+Tab', {
    vscodeCommandId: 'workbench.action.quickOpenPreviousEditor',
  }),
  noOpBinding('Control+Q', {
    vscodeCommandId: 'workbench.action.quickOpenView',
  }),
  workspaceBinding('Mod+Shift+O', 'workspace.gotoSymbol', {
    preventDefault: true,
    vscodeCommandId: 'workbench.action.gotoSymbol',
  }),
  noOpBinding('Mod+Alt+Tab', {
    platforms: ['mac'],
    vscodeCommandId: 'workbench.action.showAllEditors',
  }),
  workspaceBinding('Mod+S', 'workspace.saveFile', {
    preventDefault: true,
    vscodeCommandId: 'workbench.action.files.save',
  }),
  noOpBinding('Mod+Shift+T', {
    vscodeCommandId: 'workbench.action.reopenClosedEditor',
  }),
  workspaceBinding('Mod+B', 'workspace.toggleSidebarVisibility', {
    preventDefault: true,
    vscodeCommandId: 'workbench.action.toggleSidebarVisibility',
  }),
  noOpBinding('Mod+J', {
    vscodeCommandId: 'workbench.action.togglePanel',
  }),
  noOpBinding('Mod+1', {
    vscodeCommandId: 'workbench.action.focusFirstEditorGroup',
  }),
  noOpBinding('Mod+2', {
    vscodeCommandId: 'workbench.action.focusSecondEditorGroup',
  }),
  noOpBinding('Mod+3', {
    vscodeCommandId: 'workbench.action.focusThirdEditorGroup',
  }),
  noOpBinding('Mod+W', {
    vscodeCommandId: 'workbench.action.closeActiveEditor',
  }),
  workspaceBinding('Mod+Shift+D', 'workspace.toggleDiffViewMode'),
  workspaceBinding('Alt+Shift+W', 'workspace.window.closeActiveSurface', {
    preventDefault: true,
    stopPropagation: true,
  }),
  workspaceBinding('Alt+Shift+H', 'workspace.window.backgroundActiveSurface', {
    preventDefault: true,
    stopPropagation: true,
  }),
  workspaceBinding('Alt+Shift+M', 'workspace.window.maximizeActiveWindow', {
    preventDefault: true,
    stopPropagation: true,
  }),
  workspaceBinding('Alt+Shift+R', 'workspace.window.restoreActiveWindow', {
    preventDefault: true,
    stopPropagation: true,
  }),
  workspaceBinding('Alt+Shift+C', 'workspace.window.collapseActiveWindow', {
    preventDefault: true,
    stopPropagation: true,
  }),
  workspaceBinding('Alt+Shift+E', 'workspace.window.expandActiveWindow', {
    preventDefault: true,
    stopPropagation: true,
  }),
  workspaceBinding('Alt+Shift+A', 'workspace.window.splitActiveWindowLeft', {
    preventDefault: true,
    stopPropagation: true,
  }),
  workspaceBinding('Alt+Shift+D', 'workspace.window.splitActiveWindowRight', {
    preventDefault: true,
    stopPropagation: true,
  }),
  workspaceBinding('Alt+Shift+K', 'workspace.window.splitActiveWindowTop', {
    preventDefault: true,
    stopPropagation: true,
  }),
  workspaceBinding('Alt+Shift+J', 'workspace.window.splitActiveWindowBottom', {
    preventDefault: true,
    stopPropagation: true,
  }),
  workspaceBinding('Alt+Shift+ArrowLeft', 'workspace.window.moveActiveWindowLeft', {
    preventDefault: true,
    stopPropagation: true,
  }),
  workspaceBinding('Alt+Shift+ArrowRight', 'workspace.window.moveActiveWindowRight', {
    preventDefault: true,
    stopPropagation: true,
  }),
  workspaceBinding('Alt+Shift+ArrowUp', 'workspace.window.moveActiveWindowTop', {
    preventDefault: true,
    stopPropagation: true,
  }),
  workspaceBinding('Alt+Shift+ArrowDown', 'workspace.window.moveActiveWindowBottom', {
    preventDefault: true,
    stopPropagation: true,
  }),

  editorBinding('Mod+Z', 'editor.undo', 'undo'),
  editorBinding('Mod+Shift+Z', 'editor.redo', 'redo'),
  editorBinding('Control+Y', 'editor.redo', 'redo', {
    platforms: ['windows', 'linux'],
  }),
  editorBinding('Mod+A', 'editor.selectAll', 'editor.action.selectAll'),

  editorBinding('Mod+F', 'editor.find', 'actions.find'),
  editorBinding('Mod+H', 'editor.findReplace', 'editor.action.startFindReplaceAction', {
    platforms: ['windows', 'linux'],
  }),
  editorBinding('Mod+Alt+F', 'editor.findReplace', 'editor.action.startFindReplaceAction', {
    platforms: ['mac'],
  }),
  editorBinding('F3', 'editor.findNext', 'editor.action.nextMatchFindAction'),
  editorBinding('Mod+G', 'editor.findNext', 'editor.action.nextMatchFindAction', {
    platforms: ['mac'],
  }),
  editorBinding('Shift+F3', 'editor.findPrevious', 'editor.action.previousMatchFindAction'),
  editorBinding('Mod+Shift+G', 'editor.findPrevious', 'editor.action.previousMatchFindAction', {
    platforms: ['mac'],
  }),
  editorBinding('Escape', 'editor.closeFind', 'closeFindWidget'),
  editorBinding('Shift+Escape', 'editor.closeFind', 'closeFindWidget'),
  editorBinding('Alt+C', 'editor.toggleFindCaseSensitive', 'toggleFindCaseSensitive', {
    platforms: ['windows', 'linux'],
  }),
  editorBinding('Mod+Alt+C', 'editor.toggleFindCaseSensitive', 'toggleFindCaseSensitive', {
    platforms: ['mac'],
  }),
  editorBinding('Alt+W', 'editor.toggleFindWholeWord', 'toggleFindWholeWord', {
    platforms: ['windows', 'linux'],
  }),
  editorBinding('Mod+Alt+W', 'editor.toggleFindWholeWord', 'toggleFindWholeWord', {
    platforms: ['mac'],
  }),
  editorBinding('Alt+R', 'editor.toggleFindRegex', 'toggleFindRegex', {
    platforms: ['windows', 'linux'],
  }),
  editorBinding('Mod+Alt+R', 'editor.toggleFindRegex', 'toggleFindRegex', {
    platforms: ['mac'],
  }),
  editorBinding('Alt+L', 'editor.toggleFindInSelection', 'toggleFindInSelection', {
    platforms: ['windows', 'linux'],
  }),
  editorBinding('Mod+Alt+L', 'editor.toggleFindInSelection', 'toggleFindInSelection', {
    platforms: ['mac'],
  }),
  editorBinding('Alt+P', 'editor.togglePreserveCase', 'togglePreserveCase', {
    platforms: ['windows', 'linux'],
  }),
  editorBinding('Mod+Alt+P', 'editor.togglePreserveCase', 'togglePreserveCase', {
    platforms: ['mac'],
  }),
  editorBinding('Mod+Shift+1', 'editor.replaceOne', 'editor.action.replaceOne'),
  editorBinding('Mod+Alt+Enter', 'editor.replaceAll', 'editor.action.replaceAll'),
  editorBinding('Alt+Enter', 'editor.selectAllMatches', 'editor.action.selectAllMatches'),
  editorBinding('Mod+D', 'editor.addNextOccurrence', 'editor.action.addSelectionToNextFindMatch'),

  editorBinding('Alt+Backspace', 'editor.deleteWordLeft', 'deleteWordLeft', {
    platforms: ['mac'],
  }),
  editorBinding('Mod+Backspace', 'editor.deleteWordLeft', 'deleteWordLeft', {
    platforms: ['windows', 'linux'],
  }),
  editorBinding('Alt+Delete', 'editor.deleteWordRight', 'deleteWordRight', {
    platforms: ['mac'],
  }),
  editorBinding('Mod+Delete', 'editor.deleteWordRight', 'deleteWordRight', {
    platforms: ['windows', 'linux'],
  }),
  editorBinding('Mod+Shift+K', 'editor.editor.action.deleteLines', 'editor.action.deleteLines'),
  editorBinding(
    'Alt+Shift+ArrowUp',
    'editor.editor.action.copyLinesUpAction',
    'editor.action.copyLinesUpAction',
    { platforms: ['mac', 'windows'] },
  ),
  editorBinding(
    'Alt+Shift+ArrowDown',
    'editor.editor.action.copyLinesDownAction',
    'editor.action.copyLinesDownAction',
    { platforms: ['mac', 'windows'] },
  ),
  editorBinding(
    'Mod+Alt+Shift+ArrowUp',
    'editor.editor.action.copyLinesUpAction',
    'editor.action.copyLinesUpAction',
    { platforms: ['linux'] },
  ),
  editorBinding(
    'Mod+Alt+Shift+ArrowDown',
    'editor.editor.action.copyLinesDownAction',
    'editor.action.copyLinesDownAction',
    { platforms: ['linux'] },
  ),
  editorBinding(
    'Alt+ArrowUp',
    'editor.editor.action.moveLinesUpAction',
    'editor.action.moveLinesUpAction',
  ),
  editorBinding(
    'Alt+ArrowDown',
    'editor.editor.action.moveLinesDownAction',
    'editor.action.moveLinesDownAction',
  ),
  editorBinding(
    'Mod+Shift+Enter',
    'editor.editor.action.insertLineBefore',
    'editor.action.insertLineBefore',
  ),
  editorBinding(
    'Mod+Enter',
    'editor.editor.action.insertLineAfter',
    'editor.action.insertLineAfter',
  ),
  editorBinding('Mod+/', 'editor.editor.action.commentLine', 'editor.action.commentLine'),
  editorBinding('Alt+Shift+A', 'editor.editor.action.blockComment', 'editor.action.blockComment', {
    platforms: ['mac', 'windows'],
  }),
  editorBinding('Mod+Shift+A', 'editor.editor.action.blockComment', 'editor.action.blockComment', {
    platforms: ['linux'],
  }),
  editorBinding('Mod+]', 'editor.editor.action.indentLines', 'editor.action.indentLines'),
  editorBinding('Mod+[', 'editor.editor.action.outdentLines', 'editor.action.outdentLines'),
  editorBinding(
    'Mod+Alt+ArrowUp',
    'editor.editor.action.insertCursorAbove',
    'editor.action.insertCursorAbove',
    { platforms: ['mac', 'windows'] },
  ),
  editorBinding(
    'Mod+Alt+ArrowDown',
    'editor.editor.action.insertCursorBelow',
    'editor.action.insertCursorBelow',
    { platforms: ['mac', 'windows'] },
  ),
  editorBinding(
    'Alt+Shift+ArrowUp',
    'editor.editor.action.insertCursorAbove',
    'editor.action.insertCursorAbove',
    { platforms: ['linux'] },
  ),
  editorBinding(
    'Alt+Shift+ArrowDown',
    'editor.editor.action.insertCursorBelow',
    'editor.action.insertCursorBelow',
    { platforms: ['linux'] },
  ),
  editorBinding(
    'Mod+Shift+ArrowUp',
    'editor.editor.action.insertCursorAbove',
    'editor.action.insertCursorAbove',
    { platforms: ['linux'] },
  ),
  editorBinding(
    'Mod+Shift+ArrowDown',
    'editor.editor.action.insertCursorBelow',
    'editor.action.insertCursorBelow',
    { platforms: ['linux'] },
  ),
  editorBinding(
    'Mod+Shift+L',
    'editor.editor.action.selectHighlights',
    'editor.action.selectHighlights',
  ),
  editorBinding('Mod+F2', 'editor.editor.action.changeAll', 'editor.action.changeAll'),

  editorBinding('Backspace', 'editor.deleteBackward'),
  editorBinding('Shift+Backspace', 'editor.deleteBackward'),
  editorBinding('Control+H', 'editor.deleteBackward', {
    platforms: ['mac'],
  }),
  editorBinding('Delete', 'editor.deleteForward'),
  editorBinding('Control+D', 'editor.deleteForward', {
    platforms: ['mac'],
  }),
  editorBinding('Tab', 'editor.indentSelection', 'tab'),
  editorBinding('Shift+Tab', 'editor.outdentSelection', 'outdent'),

  editorBinding('ArrowLeft', 'editor.cursorLeft', 'cursorLeft'),
  editorBinding('Control+B', 'editor.cursorLeft', 'cursorLeft', {
    platforms: ['mac'],
  }),
  editorBinding('ArrowRight', 'editor.cursorRight', 'cursorRight'),
  editorBinding('Control+F', 'editor.cursorRight', 'cursorRight', {
    platforms: ['mac'],
  }),
  editorBinding('ArrowUp', 'editor.cursorUp', 'cursorUp'),
  editorBinding('Control+P', 'editor.cursorUp', 'cursorUp', {
    platforms: ['mac'],
  }),
  editorBinding('ArrowDown', 'editor.cursorDown', 'cursorDown'),
  editorBinding('Control+N', 'editor.cursorDown', 'cursorDown', {
    platforms: ['mac'],
  }),
  editorBinding('Shift+ArrowLeft', 'editor.selectLeft', 'cursorLeftSelect'),
  editorBinding('Shift+ArrowRight', 'editor.selectRight', 'cursorRightSelect'),
  editorBinding('Shift+ArrowUp', 'editor.selectUp', 'cursorUpSelect'),
  editorBinding('Shift+ArrowDown', 'editor.selectDown', 'cursorDownSelect'),
  editorBinding('PageUp', 'editor.cursorPageUp', 'cursorPageUp'),
  editorBinding('PageDown', 'editor.cursorPageDown', 'cursorPageDown'),
  editorBinding('Shift+PageUp', 'editor.selectPageUp', 'cursorPageUpSelect'),
  editorBinding('Shift+PageDown', 'editor.selectPageDown', 'cursorPageDownSelect'),

  editorBinding('Alt+ArrowLeft', 'editor.cursorWordLeft', 'cursorWordLeft', {
    platforms: ['mac'],
  }),
  editorBinding('Control+ArrowLeft', 'editor.cursorWordLeft', 'cursorWordLeft', {
    platforms: ['windows', 'linux'],
  }),
  editorBinding('Alt+ArrowRight', 'editor.cursorWordRight', 'cursorWordEndRight', {
    platforms: ['mac'],
  }),
  editorBinding('Control+ArrowRight', 'editor.cursorWordRight', 'cursorWordEndRight', {
    platforms: ['windows', 'linux'],
  }),
  editorBinding('Alt+Shift+ArrowLeft', 'editor.selectWordLeft', 'cursorWordLeftSelect', {
    platforms: ['mac'],
  }),
  editorBinding('Control+Shift+ArrowLeft', 'editor.selectWordLeft', 'cursorWordLeftSelect', {
    platforms: ['windows', 'linux'],
  }),
  editorBinding('Alt+Shift+ArrowRight', 'editor.selectWordRight', 'cursorWordEndRightSelect', {
    platforms: ['mac'],
  }),
  editorBinding('Control+Shift+ArrowRight', 'editor.selectWordRight', 'cursorWordEndRightSelect', {
    platforms: ['windows', 'linux'],
  }),

  editorBinding('Home', 'editor.cursorLineStart', 'cursorHome'),
  editorBinding('End', 'editor.cursorLineEnd', 'cursorEnd'),
  editorBinding('Shift+Home', 'editor.selectLineStart', 'cursorHomeSelect'),
  editorBinding('Shift+End', 'editor.selectLineEnd', 'cursorEndSelect'),
  editorBinding('Mod+ArrowLeft', 'editor.cursorLineStart', 'cursorHome', {
    platforms: ['mac'],
  }),
  editorBinding('Mod+ArrowRight', 'editor.cursorLineEnd', 'cursorEnd', {
    platforms: ['mac'],
  }),
  editorBinding('Mod+Shift+ArrowLeft', 'editor.selectLineStart', 'cursorHomeSelect', {
    platforms: ['mac'],
  }),
  editorBinding('Mod+Shift+ArrowRight', 'editor.selectLineEnd', 'cursorEndSelect', {
    platforms: ['mac'],
  }),
  editorBinding('Control+A', 'editor.cursorLineStart', 'cursorLineStart', {
    platforms: ['mac'],
  }),
  editorBinding('Control+E', 'editor.cursorLineEnd', 'cursorLineEnd', {
    platforms: ['mac'],
  }),
  editorBinding('Control+Shift+A', 'editor.selectLineStart', 'cursorLineStartSelect', {
    platforms: ['mac'],
  }),
  editorBinding('Control+Shift+E', 'editor.selectLineEnd', 'cursorLineEndSelect', {
    platforms: ['mac'],
  }),

  editorBinding('Mod+ArrowUp', 'editor.cursorDocumentStart', 'cursorTop', {
    platforms: ['mac'],
  }),
  editorBinding('Mod+ArrowDown', 'editor.cursorDocumentEnd', 'cursorBottom', {
    platforms: ['mac'],
  }),
  editorBinding('Control+Home', 'editor.cursorDocumentStart', 'cursorTop', {
    platforms: ['windows', 'linux'],
  }),
  editorBinding('Control+End', 'editor.cursorDocumentEnd', 'cursorBottom', {
    platforms: ['windows', 'linux'],
  }),
  editorBinding('Mod+Shift+ArrowUp', 'editor.selectDocumentStart', 'cursorTopSelect', {
    platforms: ['mac'],
  }),
  editorBinding('Mod+Shift+ArrowDown', 'editor.selectDocumentEnd', 'cursorBottomSelect', {
    platforms: ['mac'],
  }),
  editorBinding('Control+Shift+Home', 'editor.selectDocumentStart', 'cursorTopSelect', {
    platforms: ['windows', 'linux'],
  }),
  editorBinding('Control+Shift+End', 'editor.selectDocumentEnd', 'cursorBottomSelect', {
    platforms: ['windows', 'linux'],
  }),
  noOpBinding('F12', {
    pane: 'editor',
    vscodeCommandId: 'editor.action.revealDefinition',
  }),
  editorBinding(
    'Shift+F12',
    'editor.editor.action.goToReferences',
    'editor.action.goToReferences',
    { preventDefault: true },
  ),
] satisfies readonly DefaultBindingSpec[]
