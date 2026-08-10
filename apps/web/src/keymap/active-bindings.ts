import {
  detectPlatform,
  normalizeKeyName,
  normalizeRegisterableHotkey,
  parseHotkey,
  PUNCTUATION_CODE_MAP,
  validateHotkey,
  type ParsedHotkey,
  type RawHotkey,
} from '@tanstack/react-hotkeys'
import type { KeybindingOverrides } from '@workspace/contracts'

import type { FocusArea } from '@/components/workspace/focus/providers/focus-state'

import { commandHotkeyMeta, platformCommandSpecs } from './command-registry'
import type {
  CommandKeyBinding,
  KeyBindingKeyboardEvent,
  ParsedPlatformKeyBinding,
  PlatformCommandId,
  PlatformKeyBinding,
} from './types'

type PlatformName = ReturnType<typeof detectPlatform>

type SelectedBinding = {
  readonly binding: PlatformKeyBinding
  readonly priority: number
}

const LETTER_CODE_PATTERN = /^Key([A-Z])$/
const DIGIT_CODE_PATTERN = /^Digit([0-9])$/
const LATIN_KEY_PATTERN = /^[A-Z0-9]$/

/**
 * A user override replaces its command's defaults outright: the settings
 * document stores one hotkey per command, so a command with two defaults loses
 * both. An override naming a command this build does not have, or a hotkey no
 * keyboard can produce, is left out — it would drop a working default and
 * dispatch nothing in its place.
 */
export function resolvedPlatformKeyBindings(
  defaults: readonly PlatformKeyBinding[],
  overrides: KeybindingOverrides,
  platform: PlatformName = detectPlatform(),
): readonly PlatformKeyBinding[] {
  const entries = appliedOverrides(overrides, defaults)
  if (entries.length === 0) return defaults

  const overridden = new Set(entries.map(([command]) => command))
  const kept = defaults.filter((binding) => !binding.command || !overridden.has(binding.command))
  const bound = entries.flatMap(([command, keys]) =>
    userKeyBinding(defaults, command, keys, platform),
  )

  return [...kept, ...bound]
}

export function activePlatformKeyBindings(
  bindings: readonly PlatformKeyBinding[],
  focusedPane: FocusArea,
): readonly PlatformKeyBinding[] {
  const selected = new Map<string, SelectedBinding>()

  for (const binding of bindings) {
    selectActiveBinding(selected, binding, focusedPane)
  }

  return Array.from(selected.values(), ({ binding }) => binding)
}

export function parsedPlatformKeyBindings(
  bindings: readonly PlatformKeyBinding[],
  platform: PlatformName = detectPlatform(),
): readonly ParsedPlatformKeyBinding[] {
  return bindings.map((binding) => {
    const hotkey = parseHotkey(binding.keys, platform)

    return { binding, firesWhileTyping: hotkeyFiresWhileTyping(hotkey), hotkey }
  })
}

export function platformKeyBindingForKeyboardEvent(
  bindings: readonly ParsedPlatformKeyBinding[],
  event: KeyBindingKeyboardEvent,
): ParsedPlatformKeyBinding | null {
  const printed = normalizeKeyName(event.key)
  const printedMatch = keyBindingForKey(bindings, event, printed)
  if (printedMatch) return printedMatch
  // A layout that prints Latin already speaks the language the bindings are
  // written in, so its keys are final: falling through to `event.code` there
  // would let the Mod+W binding answer for AZERTY's Mod+Z.
  if (LATIN_KEY_PATTERN.test(printed)) return null

  const physical = physicalKeyName(event.code)
  if (!physical) return null

  return keyBindingForKey(bindings, event, physical)
}

/**
 * One row per command the key table can reach, with the override folded in, so
 * the settings editor can show what is in force next to what it replaced.
 */
export function commandKeyBindings(
  defaults: readonly PlatformKeyBinding[],
  overrides: KeybindingOverrides,
): readonly CommandKeyBinding[] {
  const applied = new Map(appliedOverrides(overrides, defaults))
  const defaultKeys = defaultKeysByCommand(defaults)

  for (const command of applied.keys()) {
    if (defaultKeys.has(command)) continue

    defaultKeys.set(command, [])
  }

  return Array.from(defaultKeys, ([command, keys]) => commandKeyBinding(command, keys, applied))
}

/**
 * `validateHotkey` only warns about a key it does not recognise, but a binding
 * whose key no keyboard produces can never fire, so a warning is as fatal as an
 * error here.
 */
export function isBindableHotkey(keys: string): boolean {
  const result = validateHotkey(keys)

  return result.valid && result.warnings.length === 0
}

/**
 * Canonical spelling for a hotkey the user typed, so the settings document
 * never holds 'mod+s' and 'Mod+S' as two different overrides.
 */
export function normalizedHotkey(keys: string, platform: PlatformName = detectPlatform()): string {
  return normalizeRegisterableHotkey(rawHotkey(keys, platform), platform)
}

function selectActiveBinding(
  selected: Map<string, SelectedBinding>,
  binding: PlatformKeyBinding,
  focusedPane: FocusArea,
) {
  if (!bindingMatchesFocusedPane(binding, focusedPane)) return

  const priority = bindingPriority(binding, focusedPane)
  const current = selected.get(binding.keys)
  if (current && current.priority > priority) return

  selected.set(binding.keys, { binding, priority })
}

function bindingMatchesFocusedPane(binding: PlatformKeyBinding, focusedPane: FocusArea) {
  if (!binding.pane) return true
  if (binding.pane === 'any') return true

  return binding.pane === focusedPane
}

function bindingPriority(binding: PlatformKeyBinding, focusedPane: FocusArea) {
  if (focusedPane && binding.pane === focusedPane) return 2
  if (!binding.pane || binding.pane === 'any') return 1

  return 0
}

function appliedOverrides(
  overrides: KeybindingOverrides,
  defaults: readonly PlatformKeyBinding[],
): readonly (readonly [PlatformCommandId, string | null])[] {
  const known = knownCommands(defaults)
  const entries: (readonly [PlatformCommandId, string | null])[] = []

  for (const [command, keys] of Object.entries(overrides)) {
    if (!isPlatformCommandId(command, known)) continue
    if (keys !== null && !isBindableHotkey(keys)) continue

    entries.push([command, keys])
  }

  return entries
}

/**
 * The registry and the default table each know commands the other does not —
 * the session commands ship a binding without a palette entry — so a command is
 * real if either one names it.
 */
function knownCommands(defaults: readonly PlatformKeyBinding[]): ReadonlySet<string> {
  const known = new Set<string>(platformCommandSpecs.map((spec) => spec.id))

  for (const binding of defaults) {
    if (!binding.command) continue

    known.add(binding.command)
  }

  return known
}

function isPlatformCommandId(
  command: string,
  known: ReadonlySet<string>,
): command is PlatformCommandId {
  return known.has(command)
}

function userKeyBinding(
  defaults: readonly PlatformKeyBinding[],
  command: PlatformCommandId,
  keys: string | null,
  platform: PlatformName,
): readonly PlatformKeyBinding[] {
  if (keys === null) return []

  const hotkey = rawHotkey(keys, platform)
  // The default carries the pane and event handling the command was designed
  // for; only the keys are the user's to change.
  const template = defaults.find((binding) => binding.command === command)

  return [
    {
      command,
      hotkey,
      keys: normalizeRegisterableHotkey(hotkey, platform),
      meta: commandHotkeyMeta(command),
      pane: template?.pane ?? 'any',
      preventDefault: template?.preventDefault,
      source: 'user',
      stopPropagation: template?.stopPropagation,
      vscodeCommandId: template?.vscodeCommandId,
    },
  ]
}

function rawHotkey(keys: string, platform: PlatformName): RawHotkey {
  const parsed = parseHotkey(keys, platform)

  return {
    alt: parsed.alt,
    ctrl: parsed.ctrl,
    key: parsed.key,
    meta: parsed.meta,
    shift: parsed.shift,
  }
}

function commandKeyBinding(
  command: PlatformCommandId,
  defaultKeys: readonly string[],
  applied: ReadonlyMap<PlatformCommandId, string | null>,
): CommandKeyBinding {
  if (!applied.has(command)) {
    return { command, defaultKeys, keys: firstKeys(defaultKeys), source: 'default' }
  }

  return { command, defaultKeys, keys: applied.get(command) ?? null, source: 'user' }
}

function firstKeys(defaultKeys: readonly string[]): string | null {
  if (defaultKeys.length === 0) return null

  return defaultKeys[0]
}

function defaultKeysByCommand(bindings: readonly PlatformKeyBinding[]) {
  const byCommand = new Map<PlatformCommandId, string[]>()

  for (const binding of bindings) {
    if (!binding.command) continue

    const keys = byCommand.get(binding.command) ?? []
    keys.push(binding.keys)
    byCommand.set(binding.command, keys)
  }

  return byCommand
}

function hotkeyFiresWhileTyping(hotkey: ParsedHotkey) {
  return hotkey.ctrl || hotkey.meta || hotkey.key === 'Escape'
}

function keyBindingForKey(
  bindings: readonly ParsedPlatformKeyBinding[],
  event: KeyBindingKeyboardEvent,
  key: string,
): ParsedPlatformKeyBinding | null {
  for (const candidate of bindings) {
    if (candidate.hotkey.key !== key) continue
    if (!modifiersMatch(candidate.hotkey, event)) continue

    return candidate
  }

  return null
}

function modifiersMatch(hotkey: ParsedHotkey, event: KeyBindingKeyboardEvent) {
  if (hotkey.alt !== event.altKey) return false
  if (hotkey.ctrl !== event.ctrlKey) return false
  if (hotkey.meta !== event.metaKey) return false

  return hotkey.shift === event.shiftKey
}

/**
 * `event.code` names the physical key whatever the layout prints on it. Without
 * this a Cyrillic or Hebrew layout reports 'я' or 'ז' for the key labelled Z,
 * and every Mod+Z-shaped binding silently stops working.
 */
function physicalKeyName(code: string | undefined): string | null {
  if (!code) return null

  const letter = LETTER_CODE_PATTERN.exec(code)?.[1]
  if (letter) return letter

  const digit = DIGIT_CODE_PATTERN.exec(code)?.[1]
  if (digit) return digit

  return PUNCTUATION_CODE_MAP[code] ?? null
}
