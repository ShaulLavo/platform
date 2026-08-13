import { Input } from '@workspace/ui/components/input'
import { useEffect, useRef, useState } from 'react'

/**
 * A number field that is authoritative while it has focus.
 *
 * Two rules, and both exist because settings are live:
 *
 * 1. Commit on blur and on Enter, never per keystroke. Typing `120` would
 *    otherwise write `1`, then `12`, then `120` — three saves, two of them
 *    values the user never meant, and the intermediate ones may not even satisfy
 *    the setting's schema.
 * 2. Ignore incoming values while focused. The snapshot that comes back from
 *    the user's *own* save arrives mid-typing and would reset the field under
 *    the cursor. This is the single most common way a live settings page feels
 *    haunted.
 */
export function NumberWidget({
  disabled,
  id,
  onCommit,
  value,
}: {
  disabled?: boolean
  id: string
  onCommit: (next: number) => void
  value: number
}) {
  const [draft, setDraft] = useState(String(value))
  const focused = useRef(false)
  // Escape blurs the field, and blur commits — so cancelling has to say so out
  // of band. State would not do: it is not flushed by the time `onBlur` runs.
  const cancelled = useRef(false)

  useEffect(() => {
    if (focused.current) return

    setDraft(String(value))
  }, [value])

  const commit = () => {
    const next = Number(draft)
    if (!Number.isFinite(next) || next === value) {
      // Snap back rather than leave a value the server rejected on screen.
      setDraft(String(value))

      return
    }

    onCommit(next)
  }

  return (
    <Input
      className='w-28 tabular-nums'
      disabled={disabled}
      id={id}
      inputMode='numeric'
      onBlur={() => {
        focused.current = false
        if (cancelled.current) {
          cancelled.current = false
          setDraft(String(value))

          return
        }

        commit()
      }}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onFocus={() => {
        focused.current = true
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          cancelled.current = true
          event.currentTarget.blur()

          return
        }
        if (event.key !== 'Enter') return

        commit()
      }}
      type='number'
      value={draft}
    />
  )
}
