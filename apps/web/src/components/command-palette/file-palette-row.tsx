import { CommandItem } from '@workspace/ui/components/command'

import { fileIconStyle } from '@/lib/file-icon-style'
import { iconForEntry } from '@/lib/file-icons'

import type { FilePaletteItem } from './command-palette-types'
import { fileItemValue } from './command-palette-utils'

type FilePaletteRowProps = {
  readonly item: FilePaletteItem
  readonly onSelect: (path: string) => void
}

export function FilePaletteRow({ item, onSelect }: FilePaletteRowProps) {
  const icon = iconForEntry({ name: item.entry.name, type: item.entry.type })

  return (
    <CommandItem
      keywords={[item.entry.name, item.entry.path, item.pathLabel]}
      value={fileItemValue(item)}
      onSelect={() => onSelect(item.entry.path)}
    >
      <span aria-hidden='true' className='size-4' style={fileIconStyle(icon)} />
      <span className='max-w-[55%] shrink-0 truncate font-medium'>{item.entry.name}</span>
      <span className='text-muted-foreground min-w-0 flex-1 truncate text-[11px]'>
        {item.pathLabel}
      </span>
    </CommandItem>
  )
}
