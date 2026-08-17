import {
  detectPlatform,
  normalizeRegisterableHotkey,
  type RegisterableHotkey,
} from '@tanstack/react-hotkeys'

import { commandHotkeyMeta } from './command-registry'
import type { CommandKeyDefault } from './define-command'
import { platformCommands, type CommandEntry } from './table'
import type { PlatformCommandId, PlatformKeyBinding } from './types'

type PlatformName = ReturnType<typeof detectPlatform>

/**
 * A chord the app claims from the browser without dispatching anything. It has
 * no command, so it cannot live in the command table.
 */
type ReservedChord = {
  readonly hotkey: RegisterableHotkey
  readonly pane?: PlatformKeyBinding['pane']
  readonly platforms?: readonly PlatformName[]
  readonly vscodeCommandId?: string
}

export function defaultPlatformKeyBindings(
  platform: PlatformName = detectPlatform(),
): readonly PlatformKeyBinding[] {
  return [
    ...platformCommands.flatMap((command) => commandBindings(command, platform)),
    ...reservedBrowserChords.flatMap((chord) => reservedBinding(chord, platform)),
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
      hotkey: key.hotkey,
      keys: normalizeRegisterableHotkey(key.hotkey, platform),
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
  chord: ReservedChord,
  platform: PlatformName,
): readonly PlatformKeyBinding[] {
  if (!matchesPlatform(chord.platforms, platform)) return []

  return [
    {
      command: null,
      hotkey: chord.hotkey,
      keys: normalizeRegisterableHotkey(chord.hotkey, platform),
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
// command would hand the chord back to the browser it was reserved from.
const reservedBrowserChords: readonly ReservedChord[] = [
  { hotkey: 'Control+Tab', vscodeCommandId: 'workbench.action.quickOpenPreviousEditor' },
  { hotkey: 'Control+Q', vscodeCommandId: 'workbench.action.quickOpenView' },
  { hotkey: 'Mod+Alt+Tab', platforms: ['mac'], vscodeCommandId: 'workbench.action.showAllEditors' },
  { hotkey: 'Mod+Shift+T', vscodeCommandId: 'workbench.action.reopenClosedEditor' },
  { hotkey: 'Mod+J', vscodeCommandId: 'workbench.action.togglePanel' },
  { hotkey: 'Mod+1', vscodeCommandId: 'workbench.action.focusFirstEditorGroup' },
  { hotkey: 'Mod+2', vscodeCommandId: 'workbench.action.focusSecondEditorGroup' },
  { hotkey: 'Mod+3', vscodeCommandId: 'workbench.action.focusThirdEditorGroup' },
  { hotkey: 'Mod+W', vscodeCommandId: 'workbench.action.closeActiveEditor' },
  { hotkey: 'F12', pane: 'editor', vscodeCommandId: 'editor.action.revealDefinition' },
]
