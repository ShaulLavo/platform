import type { FlatDocumentSymbol } from '@/lib/document-symbols'
import { TextTIcon } from '@phosphor-icons/react'
import { CommandGroup, CommandItem, CommandShortcut } from '@workspace/ui/components/command'

import { symbolDescription, symbolKindLabel } from './command-palette-utils'

type SymbolGroupsProps = {
  readonly isPending: boolean
  readonly items: readonly FlatDocumentSymbol[]
  readonly onSelect: (symbol: FlatDocumentSymbol) => void
}

export function SymbolGroups({ isPending, items, onSelect }: SymbolGroupsProps) {
  if (isPending) {
    return (
      <CommandGroup heading='Symbols'>
        <CommandItem disabled value='symbols:loading'>
          <TextTIcon className='text-muted-foreground' />
          <span className='text-muted-foreground text-sm'>Loading symbols</span>
        </CommandItem>
      </CommandGroup>
    )
  }

  return (
    <CommandGroup heading='Symbols'>
      {items.map((item, index) => (
        <CommandItem
          key={`${item.name}:${item.selectionRange.start.line}:${index}`}
          keywords={[item.name, item.containerName ?? '', symbolKindLabel(item.kind)]}
          value={`symbol:${item.name}:${index}`}
          onSelect={() => onSelect(item)}
        >
          <TextTIcon className='text-muted-foreground' />
          <span className='min-w-0 flex-1'>
            <span className='block truncate font-medium'>{item.name}</span>
            <span className='text-muted-foreground block truncate text-[11px]'>
              {symbolDescription(item)}
            </span>
          </span>
          <CommandShortcut>{item.selectionRange.start.line + 1}</CommandShortcut>
        </CommandItem>
      ))}
    </CommandGroup>
  )
}
