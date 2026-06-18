import type { Theme } from '@/components/theme-context'
import type { PlatformCommandId } from '@/keymap/types'
import { CommandIcon } from '@phosphor-icons/react'
import { CommandGroup, CommandItem, CommandShortcut } from '@workspace/ui/components/command'

import { colorModePaletteItems } from './command-palette-data'

type ColorModeGroupsProps = {
  readonly currentTheme: Theme
  readonly onPreview: (command: PlatformCommandId) => void
  readonly onSelect: (command: PlatformCommandId) => void
}

export function ColorModeGroups({ currentTheme, onPreview, onSelect }: ColorModeGroupsProps) {
  function previewColorMode(command: PlatformCommandId, mode: Theme) {
    if (mode === currentTheme) return

    onPreview(command)
  }

  return (
    <CommandGroup heading='Color Mode'>
      {colorModePaletteItems.map((item) => (
        <CommandItem
          key={item.value}
          keywords={[item.title, item.description, item.command]}
          value={item.value}
          onPointerEnter={() => previewColorMode(item.command, item.mode)}
          onSelect={() => onSelect(item.command)}
        >
          <CommandIcon className='text-muted-foreground' />
          <span className='min-w-0 flex-1'>
            <span className='block truncate font-medium'>{item.title}</span>
            <span className='text-muted-foreground block truncate text-[11px]'>
              {item.description}
            </span>
          </span>
          {item.mode === currentTheme && <CommandShortcut>active</CommandShortcut>}
        </CommandItem>
      ))}
    </CommandGroup>
  )
}
