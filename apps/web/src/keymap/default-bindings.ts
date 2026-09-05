import { detectPlatform } from '@tanstack/hotkeys'

import { chordKeys } from '@/keymap/utils/chord'

import { commandHotkeyMeta } from '@/keymap/command-registry'
import type { CommandKeyDefault } from '@/keymap/define-command'
import { platformCommands, type CommandEntry } from '@/keymap/table'
import type { KeyChord, PlatformCommandId, PlatformKeyBinding } from '@/keymap/types'

type PlatformName = ReturnType<typeof detectPlatform>

/**
 * A hotkey the app claims from the browser without dispatching anything. It has
 * no command, so it cannot live in the command table.
 */
type ReservedHotkey = {
  readonly chord: KeyChord
  readonly pane?: PlatformKeyBinding['pane']
  readonly platforms?: readonly PlatformName[]
  readonly vscodeCommandId?: string
}

export function defaultPlatformKeyBindings(
  platform: PlatformName = detectPlatform(),
): readonly PlatformKeyBinding[] {
  return [
    ...platformCommands.flatMap((command) => commandBindings(command, platform)),
    ...reservedBrowserHotkeys.flatMap((chord) => reservedBinding(chord, platform)),
  ]
}

function commandBindings(
  command: CommandEntry,
  platform: PlatformName,
): readonly PlatformKeyBinding[] {
  if (!command.keys) return []

  return command.keys.flatMap((key) => keyBinding(key, command.id, platform))
}

function keyBinding(
  key: CommandKeyDefault,
  command: PlatformCommandId,
  platform: PlatformName,
): readonly PlatformKeyBinding[] {
  if (!matchesPlatform(key.platforms, platform)) return []

  return [
    {
      command,
      chord: key.chord,
      keys: chordKeys(key.chord, platform),
      meta: commandHotkeyMeta(command),
      pane: key.pane ?? 'any',
      preventDefault: key.preventDefault,
      source: 'default',
      stopPropagation: key.stopPropagation,
      vscodeCommandId: key.vscodeCommandId,
    },
  ]
}

function reservedBinding(
  chord: ReservedHotkey,
  platform: PlatformName,
): readonly PlatformKeyBinding[] {
  if (!matchesPlatform(chord.platforms, platform)) return []

  return [
    {
      command: null,
      chord: chord.chord,
      keys: chordKeys(chord.chord, platform),
      meta: undefined,
      pane: chord.pane ?? 'any',
      preventDefault: true,
      source: 'default',
      stopPropagation: true,
      vscodeCommandId: chord.vscodeCommandId,
    },
  ]
}

function matchesPlatform(platforms: readonly string[] | undefined, platform: PlatformName) {
  if (!platforms) return true

  return platforms.includes(platform)
}

// TODO(electron): Bind these desktop/window-level VS Code defaults once
// Platform can own shortcuts outside the browser sandbox. Until then each one is
// swallowed and dispatches nothing, which is the whole point: binding one to a
// command would hand the hotkey back to the browser it was reserved from.
const reservedBrowserHotkeys: readonly ReservedHotkey[] = [
  { chord: ['Control+Tab'], vscodeCommandId: 'workbench.action.quickOpenPreviousEditor' },
  { chord: ['Control+Q'], vscodeCommandId: 'workbench.action.quickOpenView' },
  {
    chord: ['Mod+Alt+Tab'],
    platforms: ['mac'],
    vscodeCommandId: 'workbench.action.showAllEditors',
  },
  { chord: ['Mod+Shift+T'], vscodeCommandId: 'workbench.action.reopenClosedEditor' },
  { chord: ['Mod+1'], vscodeCommandId: 'workbench.action.focusFirstEditorGroup' },
  { chord: ['Mod+2'], vscodeCommandId: 'workbench.action.focusSecondEditorGroup' },
  { chord: ['Mod+3'], vscodeCommandId: 'workbench.action.focusThirdEditorGroup' },
  { chord: ['Mod+W'], vscodeCommandId: 'workbench.action.closeActiveEditor' },
  { chord: ['F12'], pane: 'editor', vscodeCommandId: 'editor.action.revealDefinition' },
]
