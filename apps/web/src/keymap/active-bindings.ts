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

import type { FocusArea } from '@/lib/focus/state/service'

import { commandHotkeyMeta } from './command-registry'
import { platformCommand, platformCommands } from './table'
import type {
  CommandKeyBinding,
  KeyBindingKeyboardEvent,
  KeyBindingSource,
  ParsedPlatformKeyBinding,
  PlatformCommandId,
  PlatformKeyBinding,
} from './types'

type PlatformName = ReturnType<typeof detectPlatform>

type SelectedBinding = {
  readonly binding: PlatformKeyBinding
  readonly priority: number
}

type KeyBindingResolution = {
  readonly bindings: readonly PlatformKeyBinding[]
  /** Command whose binding was dropped → the command that took the key. */
  readonly shadowedBy: ReadonlyMap<PlatformCommandId, PlatformCommandId>
}

/** A settings row: the effective binding plus the command that took its key. */
export type CommandKeyBindingRow = CommandKeyBinding & {
  /** Set only when the command has no binding left because another one won the key. */
  readonly shadowedBy: PlatformCommandId | null
}

const LETTER_CODE_PATTERN = /^Key([A-Z])$/
const DIGIT_CODE_PATTERN = /^Digit([0-9])$/
const LATIN_LETTER_PATTERN = /^[A-Z]$/
const NO_SHADOWED_COMMANDS: ReadonlyMap<PlatformCommandId, PlatformCommandId> = new Map()

/**
 * A user override replaces its command's defaults outright: the settings
 * document stores one hotkey per command, so a command with two defaults loses
 * both. An override naming a command this build does not have, or a hotkey no
 * keyboard can produce, is left out — it would drop a working default and
 * dispatch nothing in its place. Bindings the override shadows are dropped; see
 * `liveKeyBindings`.
 */
export function resolvedPlatformKeyBindings(
  defaults: readonly PlatformKeyBinding[],
  overrides: KeybindingOverrides,
  platform: PlatformName = detectPlatform(),
): readonly PlatformKeyBinding[] {
  return keyBindingResolution(defaults, overrides, platform).bindings
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
  // A layout that prints a Latin letter already speaks the language the
  // bindings are written in, so its letters are final: falling through to
  // `event.code` there would let the Mod+W binding answer for AZERTY's Mod+Z.
  // Digits are not guarded, matching the library: a key that prints '1' can
  // only reach the fallback when no binding wanted '1' anyway.
  if (LATIN_LETTER_PATTERN.test(printed)) return null

  const physical = physicalKeyName(event.code)
  if (!physical) return null

  return keyBindingForKey(bindings, event, physical)
}

/**
 * One row per command the key table can reach, read back out of the resolved
 * table rather than off the override document, so the settings editor lists
 * what is in force instead of what was asked for: a command whose key another
 * command's override took reports the key it lost and names the winner.
 */
export function commandKeyBindings(
  defaults: readonly PlatformKeyBinding[],
  overrides: KeybindingOverrides,
  platform: PlatformName = detectPlatform(),
): readonly CommandKeyBindingRow[] {
  const { bindings, shadowedBy } = keyBindingResolution(defaults, overrides, platform)
  const applied = new Map(appliedOverrides(overrides))
  const live = liveBindingsByCommand(bindings)
  const defaultKeys = defaultKeysByCommand(defaults)

  for (const command of applied.keys()) {
    if (defaultKeys.has(command)) continue

    defaultKeys.set(command, [])
  }

  return Array.from(defaultKeys, ([command, keys]) =>
    commandKeyBindingRow({
      applied,
      command,
      defaultKeys: keys,
      live: live.get(command) ?? null,
      shadowedBy: shadowedBy.get(command) ?? null,
    }),
  )
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

function keyBindingResolution(
  defaults: readonly PlatformKeyBinding[],
  overrides: KeybindingOverrides,
  platform: PlatformName,
): KeyBindingResolution {
  const entries = appliedOverrides(overrides)
  if (entries.length === 0) return { bindings: defaults, shadowedBy: NO_SHADOWED_COMMANDS }

  const overridden = new Set(entries.map(([command]) => command))
  const kept = defaults.filter((binding) => !binding.command || !overridden.has(binding.command))
  const bound = entries.flatMap(([command, keys]) =>
    userKeyBinding(defaults, command, keys, platform),
  )

  return liveKeyBindings(kept, bound)
}

/**
 * Collision policy: a user binding takes the key it names, and every binding it
 * would have to beat is dropped rather than kept. Two bindings only collide
 * inside one pane — a global Mod+F and an editor-pane Mod+F are separate slots
 * that `activePlatformKeyBindings` arbitrates per keystroke — so a pane is the
 * scope in which a key can be claimed. Dropping is what keeps the table honest:
 * the matcher reaches exactly one binding per pane and key, so a kept loser
 * would have the palette, the menus and the settings editor all advertise a
 * shortcut that provably does nothing. Two overrides naming one key are the
 * same story, and the later one in the settings document wins, which is the
 * order the matcher would have resolved them in anyway.
 */
function liveKeyBindings(
  kept: readonly PlatformKeyBinding[],
  bound: readonly PlatformKeyBinding[],
): KeyBindingResolution {
  const shadowedBy = new Map<PlatformCommandId, PlatformCommandId>()
  const bindings: PlatformKeyBinding[] = []

  for (const binding of kept) {
    const winner = bindingClaimingKey(bound, binding)
    if (!winner) {
      bindings.push(binding)
      continue
    }

    recordShadowedCommand(shadowedBy, binding, winner)
  }

  for (const [index, binding] of bound.entries()) {
    const winner = bindingClaimingKey(bound.slice(index + 1), binding)
    if (!winner) {
      bindings.push(binding)
      continue
    }

    recordShadowedCommand(shadowedBy, binding, winner)
  }

  return { bindings, shadowedBy }
}

function bindingClaimingKey(
  candidates: readonly PlatformKeyBinding[],
  binding: PlatformKeyBinding,
): PlatformKeyBinding | null {
  return candidates.find((candidate) => collidesWith(candidate, binding)) ?? null
}

function collidesWith(candidate: PlatformKeyBinding, binding: PlatformKeyBinding) {
  if (candidate.keys !== binding.keys) return false

  return (candidate.pane ?? 'any') === (binding.pane ?? 'any')
}

function recordShadowedCommand(
  shadowedBy: Map<PlatformCommandId, PlatformCommandId>,
  shadowed: PlatformKeyBinding,
  winner: PlatformKeyBinding,
) {
  // A no-op binding has no settings row to report, and nothing is lost: the
  // winner reserves the key from the browser the same way the no-op did.
  if (!shadowed.command) return
  if (!winner.command) return

  shadowedBy.set(shadowed.command, winner.command)
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
): readonly (readonly [PlatformCommandId, string | null])[] {
  const known = knownCommands()
  const entries: (readonly [PlatformCommandId, string | null])[] = []

  for (const [command, keys] of Object.entries(overrides)) {
    if (!isPlatformCommandId(command, known)) continue
    if (keys !== null && !isBindableHotkey(keys)) continue

    entries.push([command, keys])
  }

  return entries
}

/** The table is the only place a command exists, so it is the only list to check. */
function knownCommands(): ReadonlySet<string> {
  return new Set(platformCommands.map((command) => command.id))
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
      pane: template?.pane ?? commandDefaultPane(command),
      preventDefault: template?.preventDefault,
      source: 'user',
      stopPropagation: template?.stopPropagation,
      vscodeCommandId: template?.vscodeCommandId,
    },
  ]
}

function commandDefaultPane(command: PlatformCommandId): PlatformKeyBinding['pane'] {
  return platformCommand(command)?.target === 'editor' ? 'editor' : 'any'
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

function commandKeyBindingRow({
  applied,
  command,
  defaultKeys,
  live,
  shadowedBy,
}: {
  readonly applied: ReadonlyMap<PlatformCommandId, string | null>
  readonly command: PlatformCommandId
  readonly defaultKeys: readonly string[]
  readonly live: PlatformKeyBinding | null
  readonly shadowedBy: PlatformCommandId | null
}): CommandKeyBindingRow {
  if (live) {
    return { command, defaultKeys, keys: live.keys, shadowedBy: null, source: live.source }
  }

  const source: KeyBindingSource = applied.has(command) ? 'user' : 'default'
  // The dead key still shows: it is what the row is configured with, and it is
  // the only way to see which shortcut the winner took.
  if (shadowedBy) {
    return {
      command,
      defaultKeys,
      keys: applied.get(command) ?? firstKeys(defaultKeys),
      shadowedBy,
      source,
    }
  }

  return { command, defaultKeys, keys: null, shadowedBy: null, source }
}

function liveBindingsByCommand(bindings: readonly PlatformKeyBinding[]) {
  const byCommand = new Map<PlatformCommandId, PlatformKeyBinding>()

  for (const binding of bindings) {
    if (!binding.command) continue
    if (byCommand.has(binding.command)) continue

    byCommand.set(binding.command, binding)
  }

  return byCommand
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
