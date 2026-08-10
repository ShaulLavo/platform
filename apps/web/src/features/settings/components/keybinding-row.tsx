import { useState } from 'react'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'

import {
  isBindableHotkey,
  normalizedHotkey,
  type CommandKeyBindingRow,
} from '@/keymap/active-bindings'
import { platformCommandSpec } from '@/keymap/command-registry'

import { useSettingsActions } from '../hooks/use-settings-actions'

export function KeybindingRow({ binding }: { binding: CommandKeyBindingRow }) {
  const { isSaving, resetKeybinding, setKeybinding } = useSettingsActions()
  const [rejected, setRejected] = useState(false)
  // Commands the palette does not carry a spec for fall back to their id, and
  // repeating it underneath would just print the same string twice.
  const spec = platformCommandSpec(binding.command)
  const title = spec?.title ?? binding.command
  const current = binding.keys ?? ''

  function commit(value: string) {
    const typed = value.trim()
    if (typed !== '' && !isBindableHotkey(typed)) {
      setRejected(true)
      return
    }

    setRejected(false)
    // An emptied field is an explicit unbind; Reset is the way back to default.
    // Storing the canonical spelling keeps 'mod+s' and 'Mod+S' one entry.
    const keys = typed === '' ? null : normalizedHotkey(typed)
    if (keys === binding.keys) return

    setKeybinding(binding.command, keys)
  }

  return (
    <div className='border-border flex items-center gap-3 border-b px-3 py-2 last:border-b-0'>
      <div className='flex min-w-0 flex-1 flex-col'>
        <span className='text-foreground truncate text-sm'>{title}</span>
        {spec ? (
          <span className='text-muted-foreground truncate text-xs'>{binding.command}</span>
        ) : null}
      </div>
      {rejected ? <span className='text-destructive text-xs'>Not a shortcut</span> : null}
      {binding.shadowedBy ? (
        // The keys are still shown next to this: together they read as "this
        // shortcut exists on paper and another command answers it".
        <span className='text-warning text-xs whitespace-nowrap'>
          Shadowed by {platformCommandSpec(binding.shadowedBy)?.title ?? binding.shadowedBy}
        </span>
      ) : null}
      {binding.source === 'user' ? <Badge variant='secondary'>Custom</Badge> : null}
      <Input
        // Remounts on a saved value so the field follows the server instead of
        // holding whatever was typed before the round trip.
        key={current}
        aria-invalid={rejected}
        aria-label={`Shortcut for ${title}`}
        className='w-36 font-mono'
        defaultValue={current}
        disabled={isSaving}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return

          event.currentTarget.blur()
        }}
        placeholder='Unbound'
      />
      {binding.source === 'user' ? (
        <Button
          disabled={isSaving}
          onClick={() => resetKeybinding(binding.command)}
          size='sm'
          variant='ghost'
        >
          Reset
        </Button>
      ) : null}
    </div>
  )
}
