import { CommandItem, CommandShortcut } from '@workspace/ui/components/command'
import { cn } from '@workspace/ui/lib/utils'

import { CommandCategoryIcon } from './command-category-icon'
import type { CommandPaletteItem } from './command-palette-types'
import { commandKeywords } from './command-palette-utils'
import type { PlatformCommandId } from '@/keymap'

type CommandPaletteRowProps = {
  readonly disabledReason: string | null
  readonly item: CommandPaletteItem
  readonly onSelect: (command: PlatformCommandId) => void
}

export function CommandPaletteRow({ disabledReason, item, onSelect }: CommandPaletteRowProps) {
  const disabled = Boolean(disabledReason)

  return (
    <CommandItem
      disabled={disabled}
      keywords={commandKeywords(item.spec)}
      value={item.spec.id}
      onSelect={() => onSelect(item.spec.id)}
    >
      <CommandCategoryIcon category={item.spec.category} />
      <span className='min-w-0 flex-1'>
        <span className='block truncate font-medium'>{item.spec.title}</span>
        <span
          className={cn(
            'text-muted-foreground block truncate text-[11px]',
            disabled && 'text-muted-foreground/70',
          )}
        >
          {disabledReason ?? item.spec.description ?? item.spec.id}
        </span>
      </span>
      {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
    </CommandItem>
  )
}
