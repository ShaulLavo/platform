import { Input } from '@workspace/ui/components/input'
import { useEffect, useRef, useState } from 'react'

/**
 * A text field with the same focus contract as the number one: commit on blur or
 * Enter, ignore incoming values while focused, Escape cancels.
 *
 * Per-keystroke writes would be worse here than for numbers — a font stack is
 * long, so typing one would write dozens of intermediate values, most of them
 * naming fonts that do not exist.
 */
export function StringWidget({
  disabled,
  id,
  onCommit,
  value,
}: {
  disabled?: boolean
  id: string
  onCommit: (next: string) => void
  value: string
}) {
  const [draft, setDraft] = useState(value)
  const focused = useRef(false)
  const cancelled = useRef(false)

  useEffect(() => {
    if (focused.current) return

    setDraft(value)
  }, [value])

  const commit = () => {
    const next = draft.trim()
    if (next === '' || next === value) {
      setDraft(value)

      return
    }

    onCommit(next)
  }

  return (
    <Input
      className='w-64'
      disabled={disabled}
      id={id}
      onBlur={() => {
        focused.current = false
        if (cancelled.current) {
          cancelled.current = false
          setDraft(value)

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
      type='text'
      value={draft}
    />
  )
}
