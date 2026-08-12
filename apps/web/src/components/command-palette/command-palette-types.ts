import type { Theme } from '@/components/theme-context'
import type { TreeEntry } from '@/lib/file-system-types'
import type { PlatformCommandDispatch } from '@/keymap/use-app-keymap'
import type { PlatformCommandId, PlatformKeyBinding } from '@/keymap/types'

export type CommandPaletteProps = {
  readonly bindings: readonly PlatformKeyBinding[]
  readonly dispatch: PlatformCommandDispatch
  readonly onOpenChange: (open: boolean) => void
  readonly onSearchChange: (search: string) => void
  readonly open: boolean
  readonly search: string
}

export type CommandPaletteSelection = {
  readonly command: PlatformCommandId
  readonly kind: 'platform'
}

export type CommandPaletteItem = {
  readonly aliases: readonly string[]
  readonly category: string
  readonly command: CommandPaletteSelection
  readonly description?: string
  readonly disabledReason?: string | null
  readonly id: string
  readonly keywords: string[]
  readonly shortcut: string | null
  readonly title: string
}

export type FilePaletteItem = {
  readonly entry: TreeEntry
  readonly pathLabel: string
}

export type ViewPaletteItem = {
  readonly command: PlatformCommandId
  readonly description: string
  readonly title: string
  readonly value: string
}

export type ColorModePaletteItem = {
  readonly command: PlatformCommandId
  readonly description: string
  readonly mode: Theme
  readonly title: string
  readonly value: string
}

export type EditorPaletteItem = {
  readonly active: boolean
  readonly name: string
  readonly path: string
  readonly pathLabel: string
}

export type QuickAccessMode =
  | 'colorMode'
  | 'colorTheme'
  | 'commands'
  | 'editors'
  | 'files'
  | 'scripts'
  | 'sessions'
  | 'symbols'
  | 'views'

export type QuickOpenFileMatch = {
  readonly birthtimeMs?: number
  readonly mtimeMs?: number
  readonly path: string
  readonly size?: number
  readonly targetType?: TreeEntry['targetType']
  readonly type: TreeEntry['type']
}
