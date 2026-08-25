import { TerminalWindowIcon } from '@phosphor-icons/react'
import { CommandGroup, CommandItem } from '@workspace/ui/components/command'

import { useCommandPaletteActions } from '@/features/command-palette/hooks/use-command-palette-actions'
import { viewPaletteItems } from '@/features/command-palette/command-palette-data'
import { RowLabel } from '@/features/command-palette/row-label'

export function ViewGroups() {
  const { disabledReasonForCommand, selectPlatformCommand } = useCommandPaletteActions()

  return (
    <CommandGroup heading='Views'>
      {viewPaletteItems.map((item) => {
        const disabledReason = disabledReasonForCommand(item.command)

        return (
          <CommandItem
            disabled={Boolean(disabledReason)}
            key={item.value}
            keywords={[item.title, item.description, item.command]}
            value={item.value}
            onSelect={() => void selectPlatformCommand(item.command)}
          >
            <TerminalWindowIcon className='text-muted-foreground' />
            <RowLabel label={item.title} description={disabledReason ?? item.description} />
          </CommandItem>
        )
      })}
    </CommandGroup>
  )
}
