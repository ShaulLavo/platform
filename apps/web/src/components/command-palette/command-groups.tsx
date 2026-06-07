import { CommandGroup } from '@workspace/ui/components/command'

import type { WorkspaceLayout } from '@/features/tiling-surface-manager/engine/layout-types'
import type { PlatformCommandId } from '@/keymap'

import { CommandPaletteRow } from './command-palette-row'
import type { CommandPaletteItem } from './command-palette-types'
import { commandDisabledReason } from './command-palette-utils'

type CommandGroupsProps = {
  readonly activeFilePath: string | null
  readonly groups: readonly (readonly [string, readonly CommandPaletteItem[]])[]
  readonly hasWorkspace: boolean
  readonly workspaceLayout: WorkspaceLayout
  readonly onSelect: (command: PlatformCommandId) => void
}

export function CommandGroups({
  activeFilePath,
  groups,
  hasWorkspace,
  workspaceLayout,
  onSelect,
}: CommandGroupsProps) {
  return (
    <>
      {groups.map(([category, groupItems]) => (
        <CommandGroup key={category} heading={category}>
          {groupItems.map((item) => (
            <CommandPaletteRow
              disabledReason={commandDisabledReason(item.spec.id, {
                activeFilePath,
                hasWorkspace,
                workspaceLayout,
              })}
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
