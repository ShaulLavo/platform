import { CommandGroup } from '@workspace/ui/components/command'

import { CommandPaletteRow } from './command-palette-row'
import type { CommandPaletteItem } from './command-palette-types'
import { commandPaletteItemDisabledReason } from './command-palette-utils'

type CommandGroupsProps = {
  readonly activeFilePath: string | null
  readonly groups: readonly (readonly [string, readonly CommandPaletteItem[]])[]
  readonly hasWorkspace: boolean
  readonly onSelect: (item: CommandPaletteItem) => void
}

export function CommandGroups({
  activeFilePath,
  groups,
  hasWorkspace,
  onSelect,
}: CommandGroupsProps) {
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
              onSelect={onSelect}
            />
          ))}
        </CommandGroup>
      ))}
    </>
  )
}
