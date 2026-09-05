import { describe } from 'vitest'
import { normalizeRegisterableHotkey, parseHotkey } from '@tanstack/hotkeys'

import { expect, test as it } from '@/keymap/../../test/fixtures'
import { binding } from '@/keymap/../../test/factories/key-binding'
import { buildKeymapTrie, trieStep } from '@/keymap/utils/keymap-trie'
import { chordStrokes, keysConflict } from '@/keymap/utils/chord'

import {
  activePlatformKeyBindings,
  commandKeyBindings,
  resolvedPlatformKeyBindings,
} from '@/keymap/active-bindings'
import { commandHotkeyMeta, platformCommandSpec } from '@/keymap/command-registry'
import { defaultPlatformKeyBindings } from '@/keymap/default-bindings'
import {
  editorKeyBindingFromPlatform,
  editorKeymapLayersFromPlatform,
  readonlyEditorKeymapLayers,
} from '@/keymap/editor-keymap'
import { appKeyBindingsForPane } from '@/keymap/utils/app-bindings'
import type { KeyBindingKeyboardEvent, PlatformCommandId, PlatformKeyBinding } from '@/keymap/types'

describe('activePlatformKeyBindings', () => {
  it('filters bindings by focused pane', () => {
    const bindings = [
      binding('Mod+1', { command: 'workspace.focusFileTree', pane: 'file-tree' }),
      binding('Mod+2', { command: 'workspace.focusEditor', pane: 'editor' }),
      binding('Mod+P', { command: 'workspace.openFilePicker', pane: 'any' }),
    ]

    expect(commands(activePlatformKeyBindings(bindings, 'editor'))).toEqual([
      'workspace.focusEditor',
      'workspace.openFilePicker',
    ])
  })

  it('prefers focused-pane bindings over global bindings for the same keys', () => {
    const bindings = [
      binding('Mod+P', { command: 'workspace.openFilePicker', pane: 'any' }),
      binding('Mod+P', { command: 'workspace.focusEditor', pane: 'editor' }),
    ]

    expect(commands(activePlatformKeyBindings(bindings, 'editor'))).toEqual([
      'workspace.focusEditor',
    ])
  })
})

describe('appKeyBindingsForPane', () => {
  it('excludes editor command bindings from app registrations', () => {
    const bindings = [
      binding('Mod+F', { command: 'editor.find', pane: 'editor' }),
      binding('Mod+P', { command: 'workspace.openFilePicker', pane: 'any' }),
    ]

    expect(commands(appKeyBindingsForPane(bindings, 'editor'))).toEqual([
      'workspace.openFilePicker',
    ])
  })
})

describe('resolvedPlatformKeyBindings', () => {
  it('replaces every default a command had with the one hotkey the user chose', () => {
    const resolved = resolvedPlatformKeyBindings(
      defaultPlatformKeyBindings('linux'),
      { 'workspace.showCommandPalette': 'Mod+Alt+K' },
      'linux',
    )

    expect(keysFor(resolved, 'workspace.showCommandPalette')).toEqual(['Mod+Alt+K'])
    expect(resolved).toContainEqual(
      expect.objectContaining({
        command: 'workspace.showCommandPalette',
        keys: 'Mod+Alt+K',
        source: 'user',
      }),
    )
  })

  it('keeps the pane and event handling the default was written with', () => {
    const resolved = resolvedPlatformKeyBindings(
      defaultPlatformKeyBindings('linux'),
      { 'workspace.gotoSymbol': 'Mod+Alt+Y' },
      'linux',
    )

    expect(resolved).toContainEqual(
      expect.objectContaining({
        command: 'workspace.gotoSymbol',
        pane: 'any',
        preventDefault: true,
        vscodeCommandId: 'workbench.action.gotoSymbol',
      }),
    )
  })

  it('keeps a keyless editor command scoped to the editor when rebound', () => {
    const resolved = resolvedPlatformKeyBindings(
      defaultPlatformKeyBindings('linux'),
      { 'editor.editor.action.peekDefinition': 'F1' },
      'linux',
    )

    expect(resolved).toContainEqual(
      expect.objectContaining({
        command: 'editor.editor.action.peekDefinition',
        keys: 'F1',
        pane: 'editor',
      }),
    )
    expect(commands(activePlatformKeyBindings(resolved, 'global'))).toContain(
      'workspace.showCommandPalette',
    )
    expect(commands(activePlatformKeyBindings(resolved, 'editor'))).toContain(
      'editor.editor.action.peekDefinition',
    )
  })

  it('leaves a command unbound when the override is an explicit null', () => {
    const resolved = resolvedPlatformKeyBindings(
      defaultPlatformKeyBindings('linux'),
      { 'workspace.saveFile': null },
      'linux',
    )

    expect(keysFor(resolved, 'workspace.saveFile')).toEqual([])
  })

  it('applies an override for a command only the default table names', () => {
    // The session commands ship a binding without a command-palette spec, so a
    // registry lookup alone would silently drop their overrides.
    const resolved = resolvedPlatformKeyBindings(
      defaultPlatformKeyBindings('linux'),
      { 'workspace.newSession': 'Mod+Alt+Q' },
      'linux',
    )

    expect(keysFor(resolved, 'workspace.newSession')).toEqual(['Mod+Alt+Q'])
  })

  it('ignores an override for a command this build does not have', () => {
    const resolved = resolvedPlatformKeyBindings(
      defaultPlatformKeyBindings('linux'),
      { 'workspace.notACommand': 'Mod+Alt+K' },
      'linux',
    )

    expect(resolved).toEqual(defaultPlatformKeyBindings('linux'))
  })

  it('leaves the default in place when the override is not a hotkey', () => {
    const resolved = resolvedPlatformKeyBindings(
      defaultPlatformKeyBindings('linux'),
      { 'workspace.saveFile': 'Mod+Nonsense' },
      'linux',
    )

    expect(keysFor(resolved, 'workspace.saveFile')).toEqual(['Mod+S'])
  })

  it('drops the binding whose key an override took instead of keeping a dead one', () => {
    const resolved = resolvedPlatformKeyBindings(
      defaultPlatformKeyBindings('linux'),
      { 'workspace.saveFile': 'Mod+B' },
      'linux',
    )

    expect(keysFor(resolved, 'workspace.toggleSidebarVisibility')).toEqual([])
    expect(keysFor(resolved, 'workspace.saveFile')).toEqual(['Mod+B'])
  })

  it('keeps a binding an override only collides with in another pane', () => {
    // Mod+F is Find inside the editor and the editor keeps its own keymap, so a
    // global override of the same chord takes nothing away from it.
    const resolved = resolvedPlatformKeyBindings(
      defaultPlatformKeyBindings('linux'),
      { 'workspace.togglePanel': 'Mod+F' },
      'linux',
    )

    expect(keysFor(resolved, 'editor.find')).toEqual(['Mod+F'])
    expect(keysFor(resolved, 'workspace.togglePanel')).toEqual(['Mod+F'])
  })

  it('keeps only the later of two overrides that name the same key', () => {
    const resolved = resolvedPlatformKeyBindings(
      defaultPlatformKeyBindings('linux'),
      { 'workspace.saveFile': 'Mod+Alt+J', 'workspace.togglePanel': 'Mod+Alt+J' },
      'linux',
    )

    expect(keysFor(resolved, 'workspace.saveFile')).toEqual([])
    expect(keysFor(resolved, 'workspace.togglePanel')).toEqual(['Mod+Alt+J'])
  })

  it('leaves the command with its other default when only one key is taken', () => {
    const resolved = resolvedPlatformKeyBindings(
      defaultPlatformKeyBindings('linux'),
      { 'workspace.togglePanel': 'F1' },
      'linux',
    )

    expect(keysFor(resolved, 'workspace.showCommandPalette')).toEqual(['Mod+Shift+P'])
  })
})

describe('trie keyboard matching', () => {
  it('matches a chord typed on the layout the bindings were written for', () => {
    expect(matchedCommand(linuxAppKeymap(), keyEvent('b', 'KeyB', { ctrlKey: true }))).toBe(
      'workspace.toggleSidebarVisibility',
    )
  })

  it('matches the physical key when the layout prints a non-Latin letter', () => {
    // Russian and Hebrew layouts report 'и' and 'ד' for the keys engraved B and
    // S, so the printed character can never be what the binding names.
    expect(matchedCommand(linuxAppKeymap(), keyEvent('и', 'KeyB', { ctrlKey: true }))).toBe(
      'workspace.toggleSidebarVisibility',
    )
    expect(matchedCommand(linuxAppKeymap(), keyEvent('ד', 'KeyS', { ctrlKey: true }))).toBe(
      'workspace.saveFile',
    )
  })

  it('matches the physical digit when the number row prints punctuation', () => {
    expect(
      matchedCommand(linuxAppKeymap(), keyEvent('&', 'Digit1', { altKey: true, ctrlKey: true })),
    ).toBe('workspace.jumpToSession1')
  })

  it('lets a Latin layout keep its printed letter instead of its physical key', () => {
    // AZERTY prints 'z' on the key US layouts call W. Reading the code anyway
    // would hand Mod+Z to whatever Mod+W is reserved for.
    expect(matchedCommand(linuxAppKeymap(), keyEvent('z', 'KeyW', { ctrlKey: true }))).toBeNull()
  })

  it('dispatches the override instead of the default once a command is rebound', () => {
    const keymap = linuxAppKeymap({ 'workspace.saveFile': 'Mod+Alt+S' })

    expect(matchedCommand(keymap, keyEvent('s', 'KeyS', { ctrlKey: true }))).toBeNull()
    expect(matchedCommand(keymap, keyEvent('s', 'KeyS', { altKey: true, ctrlKey: true }))).toBe(
      'workspace.saveFile',
    )
  })

  it('keeps bare-key bindings out of text fields and Mod chords in them', () => {
    const keymap = linuxAppKeymap()

    expect(matchFor(keymap, keyEvent('F1', 'F1'))?.firesWhileTyping).toBe(false)
    expect(matchFor(keymap, keyEvent('s', 'KeyS', { ctrlKey: true }))?.firesWhileTyping).toBe(true)
  })
})

describe('commandKeyBindings', () => {
  it('reports the default binding until the user overrides it', () => {
    expect(commandKeyBindings(defaultPlatformKeyBindings('linux'), {}, 'linux')).toContainEqual({
      command: 'workspace.saveFile',
      defaultKeys: ['Mod+S'],
      effectiveKeys: ['Mod+S'],
      keys: 'Mod+S',
      shadowedBy: null,
      source: 'default',
    })
  })

  it('shows the override in force beside the defaults it replaced', () => {
    const rows = commandKeyBindings(
      defaultPlatformKeyBindings('linux'),
      { 'workspace.showCommandPalette': 'Mod+Alt+K' },
      'linux',
    )

    expect(rows).toContainEqual({
      command: 'workspace.showCommandPalette',
      defaultKeys: ['Mod+Shift+P', 'F1'],
      effectiveKeys: ['Mod+Alt+K'],
      keys: 'Mod+Alt+K',
      shadowedBy: null,
      source: 'user',
    })
  })

  it('lists a command that only the user has bound', () => {
    const rows = commandKeyBindings(
      defaultPlatformKeyBindings('linux'),
      { 'workspace.focusEditor': 'Mod+Alt+E' },
      'linux',
    )

    expect(rows).toContainEqual({
      command: 'workspace.focusEditor',
      defaultKeys: [],
      effectiveKeys: ['Mod+Alt+E'],
      keys: 'Mod+Alt+E',
      shadowedBy: null,
      source: 'user',
    })
  })

  it('reports an unbind as no keys at all', () => {
    const rows = commandKeyBindings(
      defaultPlatformKeyBindings('linux'),
      { 'workspace.saveFile': null },
      'linux',
    )

    expect(rows).toContainEqual({
      command: 'workspace.saveFile',
      defaultKeys: ['Mod+S'],
      effectiveKeys: [],
      keys: null,
      shadowedBy: null,
      source: 'user',
    })
  })

  it('names the command that took the key instead of calling a dead binding live', () => {
    const rows = commandKeyBindings(
      defaultPlatformKeyBindings('linux'),
      { 'workspace.saveFile': 'Mod+B' },
      'linux',
    )

    expect(rows).toContainEqual({
      command: 'workspace.toggleSidebarVisibility',
      defaultKeys: ['Mod+B'],
      effectiveKeys: [],
      keys: 'Mod+B',
      shadowedBy: 'workspace.saveFile',
      source: 'default',
    })
  })

  it('marks the losing override when two of them name the same key', () => {
    const rows = commandKeyBindings(
      defaultPlatformKeyBindings('linux'),
      { 'workspace.saveFile': 'Mod+Alt+J', 'workspace.togglePanel': 'Mod+Alt+J' },
      'linux',
    )

    expect(rows).toContainEqual({
      command: 'workspace.saveFile',
      defaultKeys: ['Mod+S'],
      effectiveKeys: [],
      keys: 'Mod+Alt+J',
      shadowedBy: 'workspace.togglePanel',
      source: 'user',
    })
  })

  it('leaves a command alone when only one of its two defaults is taken', () => {
    const rows = commandKeyBindings(
      defaultPlatformKeyBindings('linux'),
      { 'workspace.togglePanel': 'F1' },
      'linux',
    )

    expect(rows).toContainEqual({
      command: 'workspace.showCommandPalette',
      defaultKeys: ['Mod+Shift+P', 'F1'],
      effectiveKeys: ['Mod+Shift+P'],
      keys: 'Mod+Shift+P',
      shadowedBy: null,
      source: 'default',
    })
  })
})

describe('editorKeyBindingFromPlatform', () => {
  it('strips the editor command prefix', () => {
    const mapped = editorKeyBindingFromPlatform(
      binding('Mod+F', { command: 'editor.find', pane: 'editor' }),
    )

    expect(mapped).toMatchObject({
      command: 'find',
    })
    expect(mapped && normalizeRegisterableHotkey(mapped.hotkey, 'linux')).toBe('Mod+F')
  })

  it('keeps VS Code-shaped editor command ids after the platform prefix', () => {
    const mapped = editorKeyBindingFromPlatform(
      binding('Mod+/', { command: 'editor.editor.action.commentLine', pane: 'editor' }),
    )

    expect(mapped).toMatchObject({
      command: 'editor.action.commentLine',
    })
    expect(mapped && normalizeRegisterableHotkey(mapped.hotkey, 'linux')).toBe('Mod+/')
  })

  it('rejects non-editor commands', () => {
    expect(
      editorKeyBindingFromPlatform(
        binding('Mod+P', { command: 'workspace.openFilePicker', pane: 'any' }),
      ),
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
    expect(platformCommandSpec('workspace.selectColorTheme')).toMatchObject({
      category: 'Appearance',
      description: 'Pick the editor color theme from the bundled VSCode themes.',
      title: 'Choose color theme',
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
      expect(conflictingBindingSlots(defaultPlatformKeyBindings(platform))).toEqual([])
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
        chord: ['Control+Tab'],
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

    expect(keysFor(bindings, 'workspace.focusFileTree')).not.toContain('Mod+1')
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

  it('binds file-tree focus globally and file filtering only inside the tree', () => {
    const bindings = defaultPlatformKeyBindings('linux')

    expect(keysFor(bindings, 'workspace.focusFileTree')).toEqual(['Mod+Shift+E'])
    expect(keysFor(bindings, 'workspace.findInFileTree')).toEqual(['Mod+F'])
    expect(commands(appKeyBindingsForPane(bindings, 'file-tree'))).toContain(
      'workspace.findInFileTree',
    )
    expect(commands(appKeyBindingsForPane(bindings, 'editor'))).not.toContain(
      'workspace.findInFileTree',
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

function commands(bindings: readonly PlatformKeyBinding[]) {
  return bindings.map((keyBinding) => keyBinding.command)
}

function keysFor(bindings: readonly PlatformKeyBinding[], command: PlatformCommandId) {
  return bindings.filter((binding) => binding.command === command).map((binding) => binding.keys)
}

function linuxAppKeymap(overrides: Record<string, string | null> = {}) {
  const resolved = resolvedPlatformKeyBindings(
    defaultPlatformKeyBindings('linux'),
    overrides,
    'linux',
  )

  return buildKeymapTrie(appKeyBindingsForPane(resolved, 'global'), 'linux')
}

function keyEvent(
  key: string,
  code: string,
  modifiers: Partial<Omit<KeyBindingKeyboardEvent, 'code' | 'key'>> = {},
): KeyBindingKeyboardEvent {
  return {
    altKey: false,
    code,
    ctrlKey: false,
    key,
    metaKey: false,
    shiftKey: false,
    ...modifiers,
  }
}

function matchFor(bindings: ReturnType<typeof linuxAppKeymap>, event: KeyBindingKeyboardEvent) {
  const step = trieStep(bindings.root, event)
  return step.kind === 'run' ? step.binding : null
}

function matchedCommand(
  bindings: ReturnType<typeof linuxAppKeymap>,
  event: KeyBindingKeyboardEvent,
) {
  return matchFor(bindings, event)?.binding.command ?? null
}

function conflictingBindingSlots(bindings: readonly PlatformKeyBinding[]) {
  return bindings.flatMap((binding, index) =>
    bindings
      .slice(index + 1)
      .filter(
        (candidate) =>
          (candidate.pane ?? 'any') === (binding.pane ?? 'any') &&
          keysConflict(candidate.keys, binding.keys),
      )
      .map((candidate) => `${binding.keys}: ${binding.command}, ${candidate.command}`),
  )
}

function layerCommands(layers: ReturnType<typeof editorKeymapLayersFromPlatform>, id: string) {
  return layers.find((layer) => layer.id === id)?.bindings.map((binding) => binding.command) ?? []
}

it('resolves a two-stroke override without collapsing to its last stroke', () => {
  const resolved = resolvedPlatformKeyBindings(
    defaultPlatformKeyBindings('linux'),
    { 'workspace.showSettings': 'Mod+K Mod+B' },
    'linux',
  )
  const settings = resolved.find((candidate) => candidate.command === 'workspace.showSettings')
  expect(settings?.keys).toBe('Mod+K Mod+B')
  expect(settings?.chord).toHaveLength(2)
})

it.each([
  ['Mod+K Mod+S', 'Mod+K'],
  ['Mod+K', 'Mod+K Mod+S'],
])('reports default %s shadowed by user %s', (defaultKeys, overrideKeys) => {
  const defaults = [binding(defaultKeys, { command: 'workspace.showSettings' }), binding('Mod+S')]
  const overrides = { 'workspace.saveFile': overrideKeys }
  const resolved = resolvedPlatformKeyBindings(defaults, overrides, 'linux')
  expect(commands(resolved)).toEqual(['workspace.saveFile'])
  expect(commandKeyBindings(defaults, overrides, 'linux')).toContainEqual(
    expect.objectContaining({
      command: 'workspace.showSettings',
      shadowedBy: 'workspace.saveFile',
    }),
  )
})

it('reports a duplicate chord override as shadowed by the later override', () => {
  const rows = commandKeyBindings(
    defaultPlatformKeyBindings('linux'),
    {
      'workspace.saveFile': 'Mod+K Mod+V',
      'workspace.togglePanel': 'Mod+K Mod+V',
    },
    'linux',
  )
  expect(rows).toContainEqual(
    expect.objectContaining({ command: 'workspace.saveFile', shadowedBy: 'workspace.togglePanel' }),
  )
})

it('keeps sibling chord overrides in the same pane', () => {
  const resolved = resolvedPlatformKeyBindings(
    defaultPlatformKeyBindings('linux'),
    {
      'workspace.saveFile': 'Mod+K Mod+V',
      'workspace.togglePanel': 'Mod+K Mod+B',
    },
    'linux',
  )
  expect(keysFor(resolved, 'workspace.saveFile')).toEqual(['Mod+K Mod+V'])
  expect(keysFor(resolved, 'workspace.togglePanel')).toEqual(['Mod+K Mod+B'])
})

it('keeps a sibling chord when its conflicting prefix override is shadowed', () => {
  const defaults = defaultPlatformKeyBindings('linux')
  const overrides = {
    'workspace.saveFile': 'Mod+K Mod+V',
    'workspace.toggleSidebarVisibility': 'Mod+K',
    'workspace.togglePanel': 'Mod+K Mod+B',
  }
  const resolved = resolvedPlatformKeyBindings(defaults, overrides, 'linux')

  expect(keysFor(resolved, 'workspace.saveFile')).toEqual(['Mod+K Mod+V'])
  expect(keysFor(resolved, 'workspace.toggleSidebarVisibility')).toEqual([])
  expect(keysFor(resolved, 'workspace.togglePanel')).toEqual(['Mod+K Mod+B'])
  expect(commandKeyBindings(defaults, overrides, 'linux')).toContainEqual(
    expect.objectContaining({ command: 'workspace.saveFile', shadowedBy: null }),
  )
})

it('keeps a default chord when its conflicting prefix override is shadowed', () => {
  const defaults = defaultPlatformKeyBindings('linux')
  const overrides = {
    'workspace.toggleSidebarVisibility': 'Mod+K',
    'workspace.togglePanel': 'Mod+K Mod+B',
  }
  const resolved = resolvedPlatformKeyBindings(defaults, overrides, 'linux')

  expect(keysFor(resolved, 'workspace.showSettings')).toEqual(['Mod+,', 'Mod+K Mod+S'])
  expect(keysFor(resolved, 'workspace.toggleSidebarVisibility')).toEqual([])
  expect(keysFor(resolved, 'workspace.togglePanel')).toEqual(['Mod+K Mod+B'])
})

it.each(defaultBindingPlatforms)(
  'default chord prefixes on %s carry Ctrl or Meta and are globally unused as complete keys',
  (platform) => {
    const defaults = defaultPlatformKeyBindings(platform)
    const chords = defaults.filter((candidate) => candidate.chord.length > 1)
    expect(chords).toHaveLength(1)
    for (const candidate of chords) {
      const first = chordStrokes(candidate.keys)[0]
      const parsed = parseHotkey(first, platform)
      expect(parsed.ctrl || parsed.meta).toBe(true)
      expect(defaults.some((binding) => binding.keys === first)).toBe(false)
    }
  },
)

it('keeps editor chords in Platform and excludes them from Editor layers', () => {
  const chord = binding('Mod+K Mod+D', { command: 'editor.undo', pane: 'editor' })
  expect(editorKeyBindingFromPlatform(chord)).toBeNull()
  expect(commands(appKeyBindingsForPane([chord], 'editor'))).toEqual(['editor.undo'])
  expect(editorKeymapLayersFromPlatform([chord])).toEqual([])
})

it.each(defaultBindingPlatforms)(
  'never passes a chord string into an Editor hotkey on %s',
  (platform) => {
    const layers = editorKeymapLayersFromPlatform(defaultPlatformKeyBindings(platform))
    for (const layer of layers) {
      for (const candidate of layer.bindings) {
        expect(normalizeRegisterableHotkey(candidate.hotkey, platform)).not.toContain(' ')
      }
    }
  },
)

it.each(defaultBindingPlatforms)(
  'preserves editor arbitration before app filtering on %s',
  (platform) => {
    const defaults = defaultPlatformKeyBindings(platform).filter(
      (candidate) => candidate.chord.length === 1,
    )
    const active = appKeyBindingsForPane(defaults, 'editor')
    expect(active).toHaveLength(platform === 'mac' ? 33 : 32)
    expect(active.map((candidate) => candidate.keys)).not.toContain('Mod+[')
    expect(active.map((candidate) => candidate.keys)).not.toContain('Mod+]')
  },
)

it('retains the first settings shortcut while offering the new chord as a second default', () => {
  expect(keysFor(defaultPlatformKeyBindings('linux'), 'workspace.showSettings')).toEqual([
    'Mod+,',
    'Mod+K Mod+S',
  ])
})
