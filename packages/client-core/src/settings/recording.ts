import { isModifierKey, normalizeKeyName } from '@tanstack/hotkeys'

type RecordingKeyEvent = {
  readonly key: string
  readonly altKey: boolean
  readonly ctrlKey: boolean
  readonly metaKey: boolean
  readonly shiftKey: boolean
}

export function recordingControl(event: RecordingKeyEvent) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null
  if (event.key === 'Escape') return 'cancel'
  if (event.key === 'Backspace') return 'remove'
  if (event.key === 'Enter') return 'commit'
  return null
}

export function recordedStroke(event: RecordingKeyEvent): string | null {
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
