import { CommandGroup } from '@workspace/ui/components/command'

import { CommandPaletteRow } from '@/features/command-palette/command-palette-row'
import type { CommandPaletteItem } from '@/features/command-palette/command-palette-types'
import { commandPaletteItemDisabledReason } from '@/features/command-palette/command-palette-utils'

type CommandGroupsProps = {
  readonly activeFilePath: string | null
  readonly groups: readonly (readonly [string, readonly CommandPaletteItem[]])[]
  readonly hasWorkspace: boolean
}

export function CommandGroups({ activeFilePath, groups, hasWorkspace }: CommandGroupsProps) {
  return (
    <>
      {groups.map(([category, groupItems]) => (
        <CommandGroup key={category} heading={category}>
          {groupItems.map((item) => (
            <CommandPaletteRow
              disabledReason={commandPaletteItemDisabledReason(item, {
                activeFilePath,
                hasWorkspace,
              })}
              item={item}
              key={item.id}
            />
          ))}
        </CommandGroup>
      ))}
    </>
  )
}
