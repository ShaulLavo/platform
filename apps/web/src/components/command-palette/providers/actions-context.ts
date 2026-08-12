import { createContext } from 'react'
import type { ProjectId } from '@workspace/contracts'

import type { CommandPaletteItem } from '@/components/command-palette/command-palette-types'
import type { SessionRailItem } from '@/features/chat-mode/utils/session-rail-model'
import type { FlatDocumentSymbol } from '@/lib/document-symbols'
import type { PlatformCommandId } from '@/keymap/types'

export type CommandPaletteActions = {
  readonly previewPlatformCommand: (command: PlatformCommandId) => void
  readonly previewColorTheme: (themeId: string) => void
  readonly selectColorTheme: (themeId: string) => void
  readonly selectCommand: (item: CommandPaletteItem) => void
  readonly selectFile: (path: string) => void
  readonly selectPlatformCommand: (command: PlatformCommandId) => void
  /** Reveals chat mode, activates the owning project, and puts the session on the stage. */
  readonly selectSession: (session: SessionRailItem) => void
  readonly selectSymbol: (symbol: FlatDocumentSymbol) => void
  readonly startSessionDraft: (projectId: ProjectId) => void
}

export const CommandPaletteActionsContext = createContext<CommandPaletteActions | null>(null)
