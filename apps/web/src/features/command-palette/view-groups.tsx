import { TerminalWindowIcon } from '@phosphor-icons/react'
import { CommandGroup, CommandItem } from '@workspace/ui/components/command'

import { useCommandPaletteActions } from '@/features/command-palette/hooks/use-command-palette-actions'
import {
  viewPaletteItems,
  workspaceOptionalCommands,
} from '@/features/command-palette/command-palette-data'
import { RowLabel } from '@/features/command-palette/row-label'

type ViewGroupsProps = {
  readonly hasWorkspace: boolean
}

export function ViewGroups({ hasWorkspace }: ViewGroupsProps) {
  const { selectPlatformCommand } = useCommandPaletteActions()

  return (
    <CommandGroup heading='Views'>
      {viewPaletteItems.map((item) => (
        <CommandItem
          // Off the same set the `>` list and the menus read, so a command that
          // works with no folder open cannot be enabled in one place and greyed
          // out in the other.
          disabled={!hasWorkspace && !workspaceOptionalCommands.has(item.command)}
          key={item.value}
          keywords={[item.title, item.description, item.command]}
          value={item.value}
          onSelect={() => selectPlatformCommand(item.command)}
        >
          <TerminalWindowIcon className='text-muted-foreground' />
          <RowLabel label={item.title} description={item.description} />
        </CommandItem>
      ))}
    </CommandGroup>
  )
}
