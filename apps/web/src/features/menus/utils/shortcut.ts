import type { PlatformCommandId, PlatformKeyBinding } from '@/keymap/types'

/**
 * Renders a binding as the glyph string shown in menus and the command
 * palette. Both surfaces read the same key table, so a shortcut hint cannot
 * drift from the key that actually runs the command.
 */
export function commandShortcut(
  command: PlatformCommandId,
  bindings: readonly PlatformKeyBinding[],
) {
  const binding = bindings.find((candidate) => candidate.command === command)
  if (!binding) return null
  if (typeof binding.hotkey === 'string') return formatHotkey(binding.hotkey)

  return formatHotkey(binding.keys)
}

export function formatHotkey(hotkey: string) {
  const isMac = isMacPlatform()
  const separator = isMac ? '' : '+'

  return hotkey
    .split('+')
    .map((token) => hotkeyTokenLabel(token, isMac))
    .join(separator)
}

export function hotkeyTokenLabel(token: string, isMac: boolean) {
  const normalized = token.toLowerCase()
  if (normalized === 'mod') return isMac ? '⌘' : 'Ctrl'
  if (normalized === 'meta') return isMac ? '⌘' : 'Meta'
  if (normalized === 'cmd') return isMac ? '⌘' : 'Cmd'
  if (normalized === 'ctrl') return isMac ? '⌃' : 'Ctrl'
  if (normalized === 'shift') return isMac ? '⇧' : 'Shift'
  if (normalized === 'alt') return isMac ? '⌥' : 'Alt'
  if (normalized === 'enter') return '↵'
  if (normalized === 'escape') return 'Esc'
  if (normalized.length === 1) return normalized.toUpperCase()

  return token
}

function isMacPlatform() {
  if (typeof navigator === 'undefined') return false

  return /Mac|iPhone|iPad|iPod/.test(navigator.platform)
}
