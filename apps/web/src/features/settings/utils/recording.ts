import { isModifierKey, normalizeKeyName } from '@tanstack/hotkeys'

import type { KeyBindingKeyboardEvent } from '@/keymap/types'
import { CHORD_DISPLAY_SEPARATOR } from '@/keymap/utils/chord'
import { formatChord } from '@/keymap/utils/format-keys'

export function recordingControl(event: KeyBindingKeyboardEvent) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null
  if (event.key === 'Escape') return 'cancel'
  if (event.key === 'Backspace') return 'remove'
  if (event.key === 'Enter') return 'commit'

  return null
}

export function recordedStroke(event: KeyBindingKeyboardEvent): string | null {
  const key = normalizeKeyName(event.key)
  if (isModifierKey(key)) return null

  const parts: string[] = []
  // Keep recordings portable between Command and Control keyboards.
  if (event.metaKey || event.ctrlKey) parts.push('Mod')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  parts.push(key)

  return parts.join('+')
}

export function recorderLabel(strokes: readonly string[] | null, value: string): string {
  if (strokes === null) return value ? formatChord(value) : 'Unassigned'
  if (strokes.length === 0) return 'Press a shortcut…'

  return `${formatChord(strokes.join(' '))}${CHORD_DISPLAY_SEPARATOR}…`
}
