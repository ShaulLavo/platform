import { CommandPaletteContent } from '@/features/command-palette/content'
import type { CommandPaletteProps } from '@/features/command-palette/command-palette-types'

export function CommandPalette(props: CommandPaletteProps) {
  if (!props.open) return null

  return <CommandPaletteContent {...props} />
}
