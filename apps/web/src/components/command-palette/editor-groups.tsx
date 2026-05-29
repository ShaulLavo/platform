import { FileIcon } from '@phosphor-icons/react'
import { CommandGroup, CommandItem, CommandShortcut } from '@workspace/ui/components/command'

import type { EditorPaletteItem } from './command-palette-types'

type EditorGroupsProps = {
  readonly items: readonly EditorPaletteItem[]
  readonly onSelect: (path: string) => void
}

export function EditorGroups({ items, onSelect }: EditorGroupsProps) {
  return (
    <CommandGroup heading='Open Editors'>
      {items.map((item) => (
        <CommandItem
          key={item.path}
          keywords={[item.name, item.path, item.pathLabel]}
          value={`editor:${item.path}`}
          onSelect={() => onSelect(item.path)}
        >
          <FileIcon className='text-muted-foreground' />
          <span className='min-w-0 flex-1'>
            <span className='block truncate font-medium'>{item.name}</span>
            <span className='text-muted-foreground block truncate text-[11px]'>
              {item.pathLabel}
            </span>
          </span>
          {item.active && <CommandShortcut>active</CommandShortcut>}
        </CommandItem>
      ))}
    </CommandGroup>
  )
}
