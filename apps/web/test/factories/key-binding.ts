import { createClientInvariantError } from '@/lib/structured-errors'

import type { PlatformKeyBinding } from '@/keymap/types'
import { chordKeys, isBindableChord, parsedChord, type PlatformName } from '@/keymap/utils/chord'

type BindingOptions = Partial<Omit<PlatformKeyBinding, 'keys' | 'chord'>> & {
  readonly platform?: PlatformName
}

export function binding(keys: string, options: BindingOptions = {}): PlatformKeyBinding {
  if (!isBindableChord(keys)) {
    throw createClientInvariantError(`Invalid test keybinding: ${keys}`)
  }
  const { platform = 'linux', ...overrides } = options
  const chord = parsedChord(keys, platform)
  return {
    chord,
    command: 'workspace.saveFile',
    keys: chordKeys(chord, platform),
    pane: 'any',
    source: 'default',
    ...overrides,
  }
}
