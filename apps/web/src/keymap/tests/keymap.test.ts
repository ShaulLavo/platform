import { describe, expect, it } from 'vitest'

import { commandDisabledReason } from '@/components/command-palette/command-palette-utils'

import { activePlatformKeyBindings } from '../active-bindings'
import { commandHotkeyMeta, platformCommandSpec } from '../command-registry'
import { defaultPlatformKeyBindings } from '../default-bindings'
import {
  editorKeyBindingFromPlatform,
  editorKeymapLayersFromPlatform,
  readonlyEditorKeymapLayers,
} from '../editor-keymap'
import { appKeyBindingsForPane } from '../use-app-keymap'
import type { PlatformCommandId, PlatformKeyBinding } from '../types'

describe('activePlatformKeyBindings', () => {
  it('filters bindings by focused pane', () => {
    const bindings = [
      binding('Mod+1', 'workspace.focusFileTree', 'file-tree'),
      binding('Mod+2', 'workspace.focusEditor', 'editor'),
      binding('Mod+P', 'workspace.openFilePicker', 'any'),
    ]

    expect(commands(activePlatformKeyBindings(bindings, 'editor'))).toEqual([
      'workspace.focusEditor',
      'workspace.openFilePicker',
    ])
  })

  it('prefers focused-pane bindings over global bindings for the same keys', () => {
    const bindings = [
      binding('Mod+P', 'workspace.openFilePicker', 'any'),
      binding('Mod+P', 'workspace.focusEditor', 'editor'),
    ]

    expect(commands(activePlatformKeyBindings(bindings, 'editor'))).toEqual([
      'workspace.focusEditor',
    ])
  })
})

describe('appKeyBindingsForPane', () => {
  it('excludes editor command bindings from app registrations', () => {
    const bindings = [
      binding('Mod+F', 'editor.find', 'editor'),
      binding('Mod+P', 'workspace.openFilePicker', 'any'),
    ]

    expect(commands(appKeyBindingsForPane(bindings, 'editor'))).toEqual([
      'workspace.openFilePicker',
    ])
  })
})

describe('editorKeyBindingFromPlatform', () => {
  it('strips the editor command prefix', () => {
    const mapped = editorKeyBindingFromPlatform(binding('Mod+F', 'editor.find', 'editor'))

    expect(mapped).toMatchObject({
      command: 'find',
      hotkey: 'Mod+F',
    })
  })

  it('keeps VS Code-shaped editor command ids after the platform prefix', () => {
    const mapped = editorKeyBindingFromPlatform(
      binding('Mod+/', 'editor.editor.action.commentLine', 'editor'),
    )

    expect(mapped).toMatchObject({
      command: 'editor.action.commentLine',
      hotkey: 'Mod+/',
    })
  })

  it('rejects non-editor commands', () => {
    expect(
      editorKeyBindingFromPlatform(binding('Mod+P', 'workspace.openFilePicker', 'any')),
    ).toBeNull()
  })
})

describe('editor keymap layers', () => {
  it('groups platform editor bindings into command-pack layers', () => {
    const layers = editorKeymapLayersFromPlatform(defaultPlatformKeyBindings('linux'))

    expect(layerCommands(layers, 'platform.navigation')).toContain('cursorLeft')
    expect(layerCommands(layers, 'platform.selection')).toContain('selectAll')
    expect(layerCommands(layers, 'platform.text-editing')).toContain('deleteBackward')
    expect(layerCommands(layers, 'platform.advanced-editing')).toContain(
      'editor.action.commentLine',
    )
    expect(layerCommands(layers, 'platform.multi-cursor')).toContain(
      'editor.action.insertCursorAbove',
    )
    expect(layerCommands(layers, 'platform.lsp-navigation')).toContain(
      'editor.action.goToReferences',
    )
  })

  it('keeps search result keymaps readonly-safe by command pack', () => {
    const readonlyLayers = readonlyEditorKeymapLayers(
      editorKeymapLayersFromPlatform(defaultPlatformKeyBindings('linux')),
    )
    const readonlyCommands = readonlyLayers.flatMap((layer) =>
      layer.bindings.map((binding) => binding.command),
    )

    expect(readonlyCommands).toContain('cursorLeft')
    expect(readonlyCommands).toContain('selectAll')
    expect(readonlyCommands).toContain('find')
    expect(readonlyCommands).not.toContain('deleteBackward')
    expect(readonlyCommands).not.toContain('findReplace')
    expect(readonlyCommands).not.toContain('editor.action.insertCursorAbove')
  })
})

describe('command registry', () => {
  it('exposes workspace command metadata for hotkey registrations', () => {
    expect(commandHotkeyMeta('workspace.openFilePicker')).toEqual({
      description: 'Open the workspace file picker.',
      name: 'Open file picker',
    })
  })

  it('exposes command palette and quick access commands', () => {
    expect(platformCommandSpec('workspace.showCommandPalette')).toMatchObject({
      category: 'Workspace',
      title: 'Show command palette',
    })
    expect(platformCommandSpec('workspace.showQuickAccess')).toMatchObject({
      category: 'Workspace',
      title: 'Quick Open',
    })
  })

  it('exposes editor command metadata', () => {
    expect(platformCommandSpec('editor.find')).toMatchObject({
      category: 'Editor',
      title: 'Find',
      vscodeCommandIds: ['actions.find'],
    })
    expect(platformCommandSpec('editor.toggleFindInSelection')).toMatchObject({
      category: 'Editor',
      title: 'Toggle find in selection',
      vscodeCommandIds: ['toggleFindInSelection'],
    })
  })

  it('exposes appearance commands for the command palette', () => {
    expect(platformCommandSpec('workspace.selectColorMode')).toMatchObject({
      category: 'Appearance',
      description: 'Pick light, dark, or system color mode.',
      title: 'Choose color mode',
    })
    expect(platformCommandSpec('workspace.setLightTheme')).toMatchObject({
      category: 'Appearance',
      description: 'Use light color mode.',
      title: 'Light color mode',
    })
    expect(platformCommandSpec('workspace.setDarkTheme')).toMatchObject({
      category: 'Appearance',
      description: 'Use dark color mode.',
      title: 'Dark color mode',
    })
    expect(platformCommandSpec('workspace.setSystemTheme')).toMatchObject({
      category: 'Appearance',
      description: 'Follow the system color mode.',
      title: 'System color mode',
    })
    expect(platformCommandSpec('workspace.toggleWallpaper')).toMatchObject({
      category: 'Appearance',
      description: 'Show or hide the background image or video.',
      title: 'Toggle wallpaper',
    })
  })

  it('exposes requested VS Code workspace command aliases', () => {
    for (const [command, vscodeCommandId] of requestedWorkspaceAliases) {
      expect(platformCommandSpec(command)).toMatchObject({
        category: 'Workspace',
        vscodeCommandIds: [vscodeCommandId],
      })
    }
  })

  it('exposes requested VS Code editor command aliases', () => {
    for (const [command, vscodeCommandId] of requestedEditorAliases) {
      expect(platformCommandSpec(command)).toMatchObject({
        category: 'Editor',
        vscodeCommandIds: [vscodeCommandId],
      })
    }
  })

  it('does not expose retired editor command aliases', () => {
    const commandAliases = editorCommandsWithRetiredAliases.flatMap(
      (command) => platformCommandSpec(command)?.vscodeCommandIds ?? [],
    )
    const bindingCommandIds = defaultBindingPlatforms.flatMap((platform) =>
      defaultPlatformKeyBindings(platform).flatMap((binding) =>
        binding.vscodeCommandId ? [binding.vscodeCommandId] : [],
      ),
    )

    for (const alias of retiredEditorCommandAliases) {
      expect(commandAliases).not.toContain(alias)
      expect(bindingCommandIds).not.toContain(alias)
    }
  })
})

describe('defaultPlatformKeyBindings', () => {
  it('uses VS Code command aliases for supported defaults', () => {
    expect(defaultPlatformKeyBindings('linux')).toContainEqual(
      expect.objectContaining({
        command: 'workspace.showCommandPalette',
        keys: 'Mod+Shift+P',
        vscodeCommandId: 'workbench.action.showCommands',
      }),
    )
    expect(defaultPlatformKeyBindings('linux')).toContainEqual(
      expect.objectContaining({
        command: 'workspace.showQuickAccess',
        keys: 'Mod+P',
        vscodeCommandId: 'workbench.action.quickOpen',
      }),
    )
  })

  it('keeps default bindings unique within each pane', () => {
    for (const platform of defaultBindingPlatforms) {
      expect(duplicateBindingSlots(defaultPlatformKeyBindings(platform))).toEqual([])
    }
  })

  it('reserves browser-hostile desktop defaults as no-ops', () => {
    expect(defaultPlatformKeyBindings('mac')).toContainEqual(
      expect.objectContaining({
        command: null,
        keys: 'Mod+Alt+Tab',
        preventDefault: true,
        stopPropagation: true,
        vscodeCommandId: 'workbench.action.showAllEditors',
      }),
    )
    expect(defaultPlatformKeyBindings('linux')).toContainEqual(
      expect.objectContaining({
        command: null,
        hotkey: 'Control+Tab',
        keys: 'Mod+Tab',
        vscodeCommandId: 'workbench.action.quickOpenPreviousEditor',
      }),
    )
    expect(defaultPlatformKeyBindings('linux')).toContainEqual(
      expect.objectContaining({
        command: null,
        keys: 'Mod+W',
        vscodeCommandId: 'workbench.action.closeActiveEditor',
      }),
    )
    expect(defaultPlatformKeyBindings('linux')).toContainEqual(
      expect.objectContaining({
        command: null,
        keys: 'F12',
        pane: 'editor',
        vscodeCommandId: 'editor.action.revealDefinition',
      }),
    )
    expect(defaultPlatformKeyBindings('linux')).toContainEqual(
      expect.objectContaining({
        command: 'editor.editor.action.goToReferences',
        keys: 'Shift+F12',
        pane: 'editor',
        vscodeCommandId: 'editor.action.goToReferences',
      }),
    )
  })

  it('uses VS Code platform-specific replace shortcuts', () => {
    expect(defaultPlatformKeyBindings('mac')).toContainEqual(
      expect.objectContaining({
        command: 'editor.findReplace',
        keys: 'Mod+Alt+F',
      }),
    )
    expect(defaultPlatformKeyBindings('linux')).toContainEqual(
      expect.objectContaining({
        command: 'editor.findReplace',
        keys: 'Mod+H',
      }),
    )
  })

  it('does not bind browser tab switching keys to pane focus commands', () => {
    const bindings = defaultPlatformKeyBindings('linux')

    expect(commands(appKeyBindingsForPane(bindings, 'global'))).not.toContain(
      'workspace.focusFileTree',
    )
    expect(commands(appKeyBindingsForPane(bindings, 'editor'))).not.toContain(
      'workspace.focusFirstEditorGroup',
    )
    expect(bindings).toContainEqual(
      expect.objectContaining({
        command: null,
        keys: 'Mod+1',
        vscodeCommandId: 'workbench.action.focusFirstEditorGroup',
      }),
    )
  })

  it('uses VS Code default bindings for implemented edit actions', () => {
    const bindings = defaultPlatformKeyBindings('mac')

    expect(bindings).toContainEqual(
      expect.objectContaining({
        command: 'editor.deleteWordLeft',
        keys: 'Alt+Backspace',
        vscodeCommandId: 'deleteWordLeft',
      }),
    )
    expect(bindings).toContainEqual(
      expect.objectContaining({
        command: 'editor.editor.action.commentLine',
        keys: 'Mod+/',
        vscodeCommandId: 'editor.action.commentLine',
      }),
    )
    expect(bindings).toContainEqual(
      expect.objectContaining({
        command: 'editor.editor.action.selectHighlights',
        keys: 'Mod+Shift+L',
        vscodeCommandId: 'editor.action.selectHighlights',
      }),
    )
  })

  it('uses VS Code platform-specific edit bindings', () => {
    expect(defaultPlatformKeyBindings('linux')).toContainEqual(
      expect.objectContaining({
        command: 'editor.editor.action.copyLinesUpAction',
        keys: 'Mod+Alt+Shift+ArrowUp',
      }),
    )
    expect(defaultPlatformKeyBindings('windows')).toContainEqual(
      expect.objectContaining({
        command: 'editor.editor.action.copyLinesUpAction',
        keys: 'Alt+Shift+ArrowUp',
      }),
    )
    expect(defaultPlatformKeyBindings('linux')).toContainEqual(
      expect.objectContaining({
        command: 'editor.editor.action.insertCursorAbove',
        keys: 'Mod+Shift+ArrowUp',
      }),
    )
  })
})

describe('command palette command availability', () => {
  it('uses file-backed editor state for editor-sensitive commands', () => {
    expect(
      commandDisabledReason('workspace.saveFile', {
        activeFilePath: null,
        hasWorkspace: true,
      }),
    ).toBe('No file-backed surface is active.')
    expect(
      commandDisabledReason('workspace.saveFile', {
        activeFilePath: '/repo/src/app.ts',
        hasWorkspace: true,
      }),
    ).toBeNull()
    expect(
      commandDisabledReason('workspace.focusEditor', {
        activeFilePath: null,
        hasWorkspace: false,
      }),
    ).toBe('No workspace open.')
  })
})

const requestedWorkspaceAliases = [
  ['workspace.openSearchEditor', 'search.action.openNewEditor'],
  ['workspace.quickOpenPreviousEditor', 'workbench.action.quickOpenPreviousEditor'],
  ['workspace.quickOpenView', 'workbench.action.quickOpenView'],
  ['workspace.gotoSymbol', 'workbench.action.gotoSymbol'],
  ['workspace.showAllEditors', 'workbench.action.showAllEditors'],
  ['workspace.saveFile', 'workbench.action.files.save'],
  ['workspace.saveAllFiles', 'workbench.action.files.saveAll'],
  ['workspace.revertFile', 'workbench.action.files.revert'],
  ['workspace.reopenClosedEditor', 'workbench.action.reopenClosedEditor'],
  ['workspace.toggleSidebarVisibility', 'workbench.action.toggleSidebarVisibility'],
  ['workspace.togglePanel', 'workbench.action.togglePanel'],
  ['workspace.focusFirstEditorGroup', 'workbench.action.focusFirstEditorGroup'],
  ['workspace.focusSecondEditorGroup', 'workbench.action.focusSecondEditorGroup'],
  ['workspace.focusThirdEditorGroup', 'workbench.action.focusThirdEditorGroup'],
] as const satisfies readonly (readonly [PlatformCommandId, string])[]

const requestedEditorAliases = [
  ['editor.editor.action.goToReferences', 'editor.action.goToReferences'],
  ['editor.deleteWordLeft', 'deleteWordLeft'],
  ['editor.deleteWordRight', 'deleteWordRight'],
  ['editor.editor.action.deleteLines', 'editor.action.deleteLines'],
  ['editor.editor.action.copyLinesUpAction', 'editor.action.copyLinesUpAction'],
  ['editor.editor.action.copyLinesDownAction', 'editor.action.copyLinesDownAction'],
  ['editor.editor.action.moveLinesUpAction', 'editor.action.moveLinesUpAction'],
  ['editor.editor.action.moveLinesDownAction', 'editor.action.moveLinesDownAction'],
  ['editor.editor.action.insertLineBefore', 'editor.action.insertLineBefore'],
  ['editor.editor.action.insertLineAfter', 'editor.action.insertLineAfter'],
  ['editor.editor.action.commentLine', 'editor.action.commentLine'],
  ['editor.editor.action.blockComment', 'editor.action.blockComment'],
  ['editor.editor.action.indentLines', 'editor.action.indentLines'],
  ['editor.editor.action.outdentLines', 'editor.action.outdentLines'],
  ['editor.editor.action.insertCursorAbove', 'editor.action.insertCursorAbove'],
  ['editor.editor.action.insertCursorBelow', 'editor.action.insertCursorBelow'],
  ['editor.editor.action.selectHighlights', 'editor.action.selectHighlights'],
  ['editor.editor.action.changeAll', 'editor.action.changeAll'],
  [
    'editor.editor.action.moveSelectionToNextFindMatch',
    'editor.action.moveSelectionToNextFindMatch',
  ],
] as const satisfies readonly (readonly [PlatformCommandId, string])[]

const retiredEditorCommandAliases = ['toggleSearchScope', 'deleteLeft', 'deleteRight'] as const

const editorCommandsWithRetiredAliases = [
  'editor.toggleFindInSelection',
  'editor.deleteBackward',
  'editor.deleteForward',
] as const satisfies readonly PlatformCommandId[]

const defaultBindingPlatforms = ['mac', 'windows', 'linux'] as const

function binding(
  keys: string,
  command: PlatformCommandId,
  pane: PlatformKeyBinding['pane'],
): PlatformKeyBinding {
  return {
    command,
    hotkey: keys as PlatformKeyBinding['hotkey'],
    keys,
    pane,
    source: 'default',
  }
}

function commands(bindings: readonly PlatformKeyBinding[]) {
  return bindings.map((keyBinding) => keyBinding.command)
}

function duplicateBindingSlots(bindings: readonly PlatformKeyBinding[]) {
  const commandsBySlot = new Map<string, string[]>()

  for (const binding of bindings) {
    const slot = `${binding.pane ?? 'any'}:${binding.keys}`
    const existing = commandsBySlot.get(slot) ?? []
    commandsBySlot.set(slot, existing.concat(binding.command ?? 'noop'))
  }

  const duplicates: string[] = []
  for (const [slot, commandsForSlot] of commandsBySlot) {
    if (commandsForSlot.length <= 1) continue

    duplicates.push(`${slot}: ${commandsForSlot.join(', ')}`)
  }

  return duplicates
}

function layerCommands(layers: ReturnType<typeof editorKeymapLayersFromPlatform>, id: string) {
  return layers.find((layer) => layer.id === id)?.bindings.map((binding) => binding.command) ?? []
}
