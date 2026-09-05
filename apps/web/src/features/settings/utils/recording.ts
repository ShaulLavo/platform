import { CHORD_DISPLAY_SEPARATOR } from '@workspace/client-core/commands/chord'
import { formatChord } from '@/keymap/utils/format-keys'

export function recorderLabel(strokes: readonly string[] | null, value: string): string {
  if (strokes === null) return value ? formatChord(value) : 'Unassigned'
  if (strokes.length === 0) return 'Press a shortcut…'

  return `${formatChord(strokes.join(' '))}${CHORD_DISPLAY_SEPARATOR}…`
}
