import { commandDisabledReason } from '@/keymap/command-enablement'
import { describe, expect, it } from 'vitest'

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
    expect(platformCommands).toHaveLength(133)
  })

  it('still requires a file-backed surface for an editor command with no table entry', () => {
    const unregistered = 'editor.someUnregisteredCommand' as PlatformCommandId

    expect(commandRequirement(unregistered)).toBe('file')
    expect(commandDisabledReason(unregistered, { activeFilePath: null, hasWorkspace: true })).toBe(
      'No file-backed surface is active.',
    )
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
    expect(platformCommandSpecs).toHaveLength(133)
    expect(platformCommandSpecs.map((spec) => spec.id)).toEqual(
      expect.arrayContaining(['workspace.newSession', 'workspace.jumpToSession1']),
    )

    const items = commandPaletteItems(platformCommandSpecs, defaultPlatformKeyBindings('linux'))
    expect(items).toHaveLength(116)
    expect(items.filter((item) => SESSION_COMMAND_PATTERN.test(item.id))).toEqual([])
  })
})
