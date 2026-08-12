import type { Theme } from '@/components/theme-context'
import { CommandIcon } from '@phosphor-icons/react'
import { CommandGroup, CommandItem, CommandShortcut } from '@workspace/ui/components/command'

import { useCommandPaletteActions } from '@/components/command-palette/hooks/use-command-palette-actions'
import { colorModePaletteItems } from './command-palette-data'
import { RowLabel } from './row-label'
import type { PlatformCommandId } from '@/keymap/types'

type ColorModeGroupsProps = {
  readonly currentTheme: Theme
}

export function ColorModeGroups({ currentTheme }: ColorModeGroupsProps) {
  const { previewPlatformCommand, selectPlatformCommand } = useCommandPaletteActions()

  function previewColorMode(command: PlatformCommandId, mode: Theme) {
    if (mode === currentTheme) return

    previewPlatformCommand(command)
  }

  return (
    <CommandGroup heading='Color Mode'>
      {colorModePaletteItems.map((item) => (
        <CommandItem
          key={item.value}
          keywords={[item.title, item.description, item.command]}
          value={item.value}
          onPointerEnter={() => previewColorMode(item.command, item.mode)}
          onSelect={() => selectPlatformCommand(item.command)}
        >
          <CommandIcon className='text-muted-foreground' />
          <RowLabel label={item.title} description={item.description} />
          {item.mode === currentTheme && <CommandShortcut>active</CommandShortcut>}
        </CommandItem>
      ))}
    </CommandGroup>
  )
}
