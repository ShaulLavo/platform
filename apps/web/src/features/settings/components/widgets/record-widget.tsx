import { PlusIcon, TrashIcon } from '@phosphor-icons/react'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { useState } from 'react'

import { ChordRecorder } from './chord-recorder'

type RecordValue = Readonly<Record<string, string | null>>

/**
 * A key/value editor for record-valued settings.
 *
 * Removing a row deletes the key rather than writing `null`, because for
 * `keybindings.overrides` those are different documents: an absent key keeps the
 * command's default binding, a `null` one unbinds it entirely. Writing `null` on
 * remove would silently turn "stop overriding this" into "this command now has
 * no shortcut".
 */
export function RecordWidget({
  disabled,
  id,
  onChange,
  recorder,
  value,
}: {
  disabled?: boolean
  id: string
  onChange: (next: RecordValue) => void
  /** Values are keyboard chords, so capture them instead of asking for notation. */
  recorder?: boolean
  value: RecordValue
}) {
  const [draftKey, setDraftKey] = useState('')
  const entries = Object.entries(value)

  const addEntry = () => {
    const key = draftKey.trim()
    if (key === '' || Object.hasOwn(value, key)) return

    // `null`, not `''`: the schema's values are a non-empty string or null, so
    // an empty seed is refused by the server and the row never appears — which
    // takes the recorder that would fill it down with it. `null` is the legal
    // "bound to nothing yet" and leaves a row to record into.
    onChange({ ...value, [key]: null })
    setDraftKey('')
  }

  return (
    <div className='flex w-80 flex-col gap-1'>
      {entries.map(([entryKey, entryValue]) => (
        <div className='flex items-center gap-1' key={entryKey}>
          <code className='text-muted-foreground min-w-0 flex-1 truncate text-xs'>{entryKey}</code>
          {recorder ? (
            <ChordRecorder
              conflictCount={conflictsFor(value, entryKey, entryValue)}
              disabled={disabled}
              id={`${id}.${entryKey}`}
              onChange={(next) => onChange({ ...value, [entryKey]: next })}
              value={entryValue ?? ''}
            />
          ) : (
            <Input
              aria-label={`Value for ${entryKey}`}
              className='w-32'
              disabled={disabled}
              // `null` is an explicit unbind and has no text of its own; showing
              // an empty field for it would make it indistinguishable from a
              // cleared value the user is mid-way through typing.
              onChange={(event) => onChange({ ...value, [entryKey]: event.currentTarget.value })}
              placeholder={entryValue === null ? 'unbound' : ''}
              value={entryValue ?? ''}
            />
          )}
          <Button
            aria-label={`Remove ${entryKey}`}
            disabled={disabled}
            onClick={() => onChange(withoutKey(value, entryKey))}
            size='icon-sm'
            variant='ghost'
          >
            <TrashIcon />
          </Button>
        </div>
      ))}

      <div className='flex items-center gap-1'>
        <Input
          aria-label={`Add an entry to ${id}`}
          className='min-w-0 flex-1'
          disabled={disabled}
          onChange={(event) => setDraftKey(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            addEntry()
          }}
          placeholder='Add a key'
          value={draftKey}
        />
        <Button
          aria-label={`Add to ${id}`}
          disabled={disabled || draftKey.trim() === ''}
          onClick={addEntry}
          size='icon-sm'
          variant='ghost'
        >
          <PlusIcon />
        </Button>
      </div>
    </div>
  )
}

function withoutKey(value: RecordValue, key: string): RecordValue {
  return Object.fromEntries(Object.entries(value).filter(([entryKey]) => entryKey !== key))
}

/**
 * How many *other* entries already bind this chord.
 *
 * Counted across the record rather than against the full keymap: this widget
 * only knows the overrides, and a collision between two things the user set
 * themselves is the one they can actually act on here.
 */
function conflictsFor(value: RecordValue, key: string, chord: string | null): number {
  if (!chord) return 0

  return Object.entries(value).filter(
    ([other, otherChord]) => other !== key && otherChord === chord,
  ).length
}
