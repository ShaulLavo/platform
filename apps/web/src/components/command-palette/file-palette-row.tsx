import { FileIcon } from '@phosphor-icons/react'
import { CommandItem } from '@workspace/ui/components/command'

import type { FilePaletteItem } from './command-palette-types'
import { fileItemValue } from './command-palette-utils'

type FilePaletteRowProps = {
  readonly item: FilePaletteItem
  readonly onSelect: (path: string) => void
}

export function FilePaletteRow({ item, onSelect }: FilePaletteRowProps) {
  return (
    <CommandItem
      keywords={[item.entry.name, item.entry.path, item.pathLabel]}
      value={fileItemValue(item)}
      onSelect={() => onSelect(item.entry.path)}
    >
      <FileIcon className='text-muted-foreground' />
      <span className='min-w-0 flex-1'>
        <span className='block truncate font-medium'>{item.entry.name}</span>
        <span className='text-muted-foreground block truncate text-[11px]'>{item.pathLabel}</span>
      </span>
    </CommandItem>
  )
}
