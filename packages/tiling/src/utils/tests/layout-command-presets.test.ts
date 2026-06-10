import { describe, expect, it } from 'vitest'

import { builtInWindowManagementCommands } from '@workspace/tiling/utils/layout-command-catalog'
import {
  defaultHotkeyPresetsById,
  defaultWindowManagementHotkeyPresets,
} from '@workspace/tiling/utils/layout-command-presets'

describe('default window management hotkey presets', () => {
  it('uses unique preset ids and stable by-id lookup keys', () => {
    const presets = defaultWindowManagementHotkeyPresets()
    const presetIds = presets.map((preset) => preset.id)

    expect(duplicates(presetIds)).toEqual([])
    expect(Object.keys(defaultHotkeyPresetsById()).toSorted()).toEqual([...presetIds].toSorted())
  })

  it('binds only known built-in command ids', () => {
    const knownCommandIds = new Set<string>(
      builtInWindowManagementCommands().map((command) => command.id),
    )
    const unknownBindings = defaultWindowManagementHotkeyPresets().flatMap((preset) =>
      Object.keys(preset.bindings)
        .filter((commandId) => !knownCommandIds.has(commandId))
        .map((commandId) => `${preset.id}:${commandId}`),
    )

    expect(unknownBindings).toEqual([])
  })

  it('does not duplicate hotkeys inside a preset', () => {
    const duplicateBindings = defaultWindowManagementHotkeyPresets().flatMap((preset) =>
      duplicates(Object.values(preset.bindings)).map((hotkey) => `${preset.id}:${hotkey}`),
    )

    expect(duplicateBindings).toEqual([])
  })
})

function duplicates(values: readonly string[]) {
  const seen = new Set<string>()
  const duplicateValues = new Set<string>()

  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value)
      continue
    }

    duplicateValues.add(value)
  }

  return Array.from(duplicateValues).toSorted()
}
