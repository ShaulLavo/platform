import { commandDisabledReason } from '@/keymap/command-enablement'
import { describe, expect, it } from 'vitest'

import { conflictDiffDocumentId } from '@/features/editor/utils/conflict-diff-document'
import { commandPaletteItems } from '@/features/command-palette/command-palette-utils'
import { platformCommandSpecs } from '@/keymap/command-registry'
import { defaultPlatformKeyBindings } from '@/keymap/default-bindings'
import { commandRequirement, platformCommands } from '@/keymap/table'
import type { PlatformCommandId } from '@/keymap/types'

/** Every chord the app claims from the browser without dispatching anything. */
const RESERVED_CHORDS = [
  'Control+Tab',
  'Control+Q',
  'Mod+Alt+Tab',
  'Mod+Shift+T',
  'Mod+J',
  'Mod+1',
  'Mod+2',
  'Mod+3',
  'Mod+W',
  'F12',
]
const MAC_ONLY_RESERVED_CHORD = 'Mod+Alt+Tab'

const SESSION_COMMAND_PATTERN =
  /^workspace\.(new|next|previous)Session$|^workspace\.toggleSessionRail$|^workspace\.jumpToSession\d$/

function reservedBindings(platform: 'linux' | 'mac' | 'windows') {
  return defaultPlatformKeyBindings(platform).filter((binding) => binding.command === null)
}

describe('command table', () => {
  it('names every command exactly once', () => {
    const ids = platformCommands.map((command) => command.id)

    // `platformCommand` looks up through a Map, so a duplicated id would
    // silently win and the loser's `run` would be unreachable.
    expect(new Set(ids).size).toBe(ids.length)
  })

  // The editor text menu is built entirely from ids the language-server plugin handles and the
  // table never sees, so this fallback is what gates that whole menu.
  it('gives an editor command with no table entry the same gate as a registered one', () => {
    const unregistered = 'editor.someUnregisteredCommand' as PlatformCommandId

    expect(commandRequirement(unregistered)).toBe('editor')
    expect(commandDisabledReason(unregistered, { activeFilePath: null, hasWorkspace: true })).toBe(
      'No text editor is active.',
    )
    expect(
      commandDisabledReason(unregistered, {
        activeFilePath: conflictDiffDocumentId('conflict-1'),
        hasWorkspace: true,
      }),
    ).toBeNull()
  })

  it('keeps the browser-hostile chords reserved', () => {
    const mac = reservedBindings('mac')
    expect(mac).toHaveLength(10)
    expect(mac.map((binding) => binding.hotkey)).toEqual(RESERVED_CHORDS)

    for (const binding of mac) {
      expect(binding.preventDefault).toBe(true)
      expect(binding.stopPropagation).toBe(true)
    }

    const withoutMacOnly = RESERVED_CHORDS.filter((chord) => chord !== MAC_ONLY_RESERVED_CHORD)
    expect(reservedBindings('linux').map((binding) => binding.hotkey)).toEqual(withoutMacOnly)
    expect(reservedBindings('windows').map((binding) => binding.hotkey)).toEqual(withoutMacOnly)
  })

  it('gives the session commands specs without giving them palette rows', () => {
    expect(platformCommandSpecs.map((spec) => spec.id)).toEqual(
      expect.arrayContaining([
        'workspace.findInFileTree',
        'workspace.jumpToSession1',
        'workspace.newSession',
        'workspace.revealActiveFileInTree',
      ]),
    )

    const items = commandPaletteItems(platformCommandSpecs, defaultPlatformKeyBindings('linux'))
    expect(items.map((item) => item.id)).toEqual(
      expect.arrayContaining(['workspace.findInFileTree', 'workspace.revealActiveFileInTree']),
    )
    expect(items.filter((item) => SESSION_COMMAND_PATTERN.test(item.id))).toEqual([])
  })
})
