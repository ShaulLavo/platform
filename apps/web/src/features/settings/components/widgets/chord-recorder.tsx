import { Button } from '@workspace/ui/components/button'
import { useState } from 'react'

import { isBindableHotkey, normalizedHotkey } from '@/keymap/active-bindings'

/**
 * Captures a chord by listening to the keys, rather than asking the user to
 * spell one.
 *
 * A text field makes the user know the notation — `Mod+Alt+S`, and that `Mod` is
 * Command on macOS and Control elsewhere — and typing it wrong produces a
 * binding that silently never fires. Recording the actual keystroke removes the
 * notation from the user's problem entirely.
 */
export function ChordRecorder({
  conflictCount,
  disabled,
  id,
  onChange,
  value,
}: {
  conflictCount: number
  disabled?: boolean
  id: string
  onChange: (next: string) => void
  value: string
}) {
  const [recording, setRecording] = useState(false)

  return (
    <div className='flex flex-col items-end gap-1'>
      <div className='flex items-center gap-1'>
        <Button
          aria-label={recording ? `Recording a shortcut for ${id}` : `Record a shortcut for ${id}`}
          className='w-40 justify-center font-mono text-xs'
          disabled={disabled}
          id={id}
          onBlur={() => setRecording(false)}
          onClick={() => setRecording(true)}
          onKeyDown={(event) => {
            if (!recording) return

            // Every key, including Escape and Tab: while recording, the whole
            // keyboard belongs to the recorder, or the chords a user most wants
            // to rebind are the ones they cannot capture.
            event.preventDefault()
            event.stopPropagation()
            if (event.key === 'Escape') {
              setRecording(false)

              return
            }

            const chord = chordFromEvent(event)
            if (!chord || !isBindableHotkey(chord)) return

            onChange(normalizedHotkey(chord))
            setRecording(false)
          }}
          variant={recording ? 'secondary' : 'outline'}
        >
          {recording ? 'Press a shortcut…' : value || 'Unassigned'}
        </Button>
      </div>
      {conflictCount > 0 ? (
        // Shown before the save, not discovered afterwards by a shortcut that
        // stopped working.
        <span className='text-warning text-xs'>
          {conflictCount} other {conflictCount === 1 ? 'command uses' : 'commands use'} this
        </span>
      ) : null}
    </div>
  )
}

function chordFromEvent(event: {
  altKey: boolean
  ctrlKey: boolean
  key: string
  metaKey: boolean
  shiftKey: boolean
}): string | null {
  // A modifier on its own is a chord in progress, not a chord.
  if (['Alt', 'Control', 'Meta', 'Shift'].includes(event.key)) return null

  const parts: string[] = []
  // `Mod` rather than the platform's own name: it is what the settings document
  // stores, so the same override works on a machine with a different keyboard.
  if (event.metaKey || event.ctrlKey) parts.push('Mod')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  parts.push(event.key.length === 1 ? event.key.toUpperCase() : event.key)

  return parts.join('+')
}
