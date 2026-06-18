import { CommandItem, CommandShortcut } from '@workspace/ui/components/command'
import { cn } from '@workspace/ui/lib/utils'

import { CommandPaletteIcon } from './command-palette-icon'
import type { CommandPaletteItem } from './command-palette-types'

type CommandPaletteRowProps = {
  readonly disabledReason: string | null
  readonly item: CommandPaletteItem
  readonly onSelect: (item: CommandPaletteItem) => void
}

export function CommandPaletteRow({ disabledReason, item, onSelect }: CommandPaletteRowProps) {
  const disabled = Boolean(disabledReason)

  return (
    <CommandItem
      disabled={disabled}
      keywords={item.keywords}
      value={item.id}
      onSelect={() => onSelect(item)}
    >
      <CommandPaletteIcon category={item.category} command={item.command.command} />
      <span className='min-w-0 flex-1'>
        <span className='block truncate font-medium'>{item.title}</span>
        <span
          className={cn(
            'text-muted-foreground block truncate text-[11px]',
            disabled && 'text-muted-foreground/70',
          )}
        >
          {disabledReason ?? item.description ?? item.id}
        </span>
      </span>
      {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
    </CommandItem>
  )
}
