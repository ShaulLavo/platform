import { CommandPaletteContent } from '@/components/command-palette/content'
import type { CommandPaletteProps } from '@/components/command-palette/command-palette-types'

export function CommandPalette(props: CommandPaletteProps) {
  if (!props.open) return null

  return <CommandPaletteContent {...props} />
}
