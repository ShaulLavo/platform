import { CommandGroup } from '@workspace/ui/components/command'

import type { EditorPaletteItem } from './command-palette-types'
import { EditorPaletteRow } from './editor-palette-row'

type EditorGroupsProps = {
  readonly items: readonly EditorPaletteItem[]
  readonly onSelect: (path: string) => void
}

export function EditorGroups({ items, onSelect }: EditorGroupsProps) {
  return (
    <CommandGroup heading='Open Editors'>
      {items.map((item) => (
        <EditorPaletteRow item={item} key={item.path} onSelect={onSelect} />
      ))}
    </CommandGroup>
  )
}
