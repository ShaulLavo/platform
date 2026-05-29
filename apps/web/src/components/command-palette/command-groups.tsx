import { CommandGroup } from '@workspace/ui/components/command'

import { CommandPaletteRow } from './command-palette-row'
import type { CommandPaletteItem } from './command-palette-types'
import { isCommandDisabled } from './command-palette-utils'
import type { PlatformCommandId } from '@/keymap'

type CommandGroupsProps = {
  readonly groups: readonly (readonly [string, readonly CommandPaletteItem[]])[]
  readonly hasWorkspace: boolean
  readonly selectedFilePath: string | null
  readonly onSelect: (command: PlatformCommandId) => void
}

export function CommandGroups({
  groups,
  hasWorkspace,
  selectedFilePath,
  onSelect,
}: CommandGroupsProps) {
  return (
    <>
      {groups.map(([category, groupItems]) => (
        <CommandGroup key={category} heading={category}>
          {groupItems.map((item) => (
            <CommandPaletteRow
              disabled={isCommandDisabled(item.spec.id, hasWorkspace, selectedFilePath)}
              item={item}
              key={item.spec.id}
              onSelect={onSelect}
            />
          ))}
        </CommandGroup>
      ))}
    </>
  )
}
