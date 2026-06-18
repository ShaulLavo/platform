import { CommandItem, CommandShortcut } from '@workspace/ui/components/command'

import { fileIconStyle } from '@/lib/file-icon-style'
import { iconForEntry } from '@/lib/file-icons'

import type { EditorPaletteItem } from './command-palette-types'

type EditorPaletteRowProps = {
  readonly item: EditorPaletteItem
  readonly onSelect: (path: string) => void
}

export function EditorPaletteRow({ item, onSelect }: EditorPaletteRowProps) {
  const icon = iconForEntry({ name: item.name, type: 'file' })

  return (
    <CommandItem
      keywords={[item.name, item.path, item.pathLabel]}
      value={`editor:${item.path}`}
      onSelect={() => onSelect(item.path)}
    >
      <span aria-hidden='true' className='size-4' style={fileIconStyle(icon)} />
      <span className='max-w-[55%] shrink-0 truncate font-medium'>{item.name}</span>
      <span className='text-muted-foreground min-w-0 flex-1 truncate text-[11px]'>
        {item.pathLabel}
      </span>
      {item.active && <CommandShortcut>active</CommandShortcut>}
    </CommandItem>
  )
}
