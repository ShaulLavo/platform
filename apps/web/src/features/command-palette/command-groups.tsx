import { CommandGroup } from '@workspace/ui/components/command'

import { CommandPaletteRow } from '@/features/command-palette/command-palette-row'
import type { CommandPaletteItem } from '@/features/command-palette/command-palette-types'
import { useCommandPaletteActions } from '@/features/command-palette/hooks/use-command-palette-actions'

type CommandGroupsProps = {
  readonly groups: readonly (readonly [string, readonly CommandPaletteItem[]])[]
}

export function CommandGroups({ groups }: CommandGroupsProps) {
  const { disabledReasonForCommand } = useCommandPaletteActions()

  return (
    <>
      {groups.map(([category, groupItems]) => (
        <CommandGroup key={category} heading={category}>
          {groupItems.map((item) => (
            <CommandPaletteRow
              disabledReason={disabledReasonForCommand(item.command.command)}
              item={item}
              key={item.id}
            />
          ))}
        </CommandGroup>
      ))}
    </>
  )
}
