import { CaretDownIcon } from '@phosphor-icons/react'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@workspace/ui/components/dropdown-menu'
import { useEffect, useRef, useState } from 'react'

import { useNerdFonts } from '../../hooks/use-nerd-fonts'
import { FontPreview } from './font-preview'

/**
 * Pick a Nerd Font from a previewed list, or type any family name.
 *
 * Both, because both are real cases. The server can fetch, subset and cache any
 * of the ~70 Nerd Fonts on demand, so picking one means the user actually gets
 * it rather than hoping it is installed — but a font already on the machine
 * should not be unreachable just because it is not in that catalogue. The stack
 * this produces tries the Nerd Font family first and the bare family second, so
 * one value serves both without the widget having to know which it is.
 */
export function FontWidget({
  disabled,
  id,
  onChange,
  value,
}: {
  disabled?: boolean
  id: string
  onChange: (next: string) => void
  value: string
}) {
  const fonts = useNerdFonts()
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

    onChange(next)
  }

  return (
    <div className='flex items-center gap-1'>
      <Input
        aria-label='Font family'
        className='w-52'
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

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label='Browse Nerd Fonts'
              disabled={disabled}
              size='icon-sm'
              variant='ghost'
            >
              <CaretDownIcon />
            </Button>
          }
        />
        <DropdownMenuContent align='end' className='max-h-96 w-72 overflow-y-auto'>
          {fonts.data?.map((font) => (
            <DropdownMenuItem key={font} onClick={() => onChange(font)}>
              <FontPreview fontId={font} />
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
