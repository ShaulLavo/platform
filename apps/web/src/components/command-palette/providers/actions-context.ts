import { createContext } from 'react'

import type { CommandPaletteItem } from '@/components/command-palette/command-palette-types'
import type { FlatDocumentSymbol } from '@/lib/document-symbols'
import type { PlatformCommandId } from '@/keymap/types'

export type CommandPaletteActions = {
  readonly previewPlatformCommand: (command: PlatformCommandId) => void
  readonly selectCommand: (item: CommandPaletteItem) => void
  readonly selectFile: (path: string) => void
  readonly selectPlatformCommand: (command: PlatformCommandId) => void
  readonly selectSymbol: (symbol: FlatDocumentSymbol) => void
}

export const CommandPaletteActionsContext = createContext<CommandPaletteActions | null>(null)
