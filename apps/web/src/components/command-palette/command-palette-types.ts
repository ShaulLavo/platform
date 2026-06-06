import type { Theme } from '@/components/theme-context'
import type { TreeEntry } from '@/lib/file-system-types'
import type {
  CommandSpec,
  PlatformCommandDispatch,
  PlatformCommandId,
  PlatformKeyBinding,
} from '@/keymap'

export type CommandPaletteProps = {
  readonly bindings: readonly PlatformKeyBinding[]
  readonly dispatch: PlatformCommandDispatch
  readonly onOpenChange: (open: boolean) => void
  readonly onSearchChange: (search: string) => void
  readonly open: boolean
  readonly search: string
}

export type CommandPaletteItem = {
  readonly spec: CommandSpec
  readonly shortcut: string | null
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

export type QuickAccessMode = 'colorMode' | 'commands' | 'editors' | 'files' | 'symbols' | 'views'

export type QuickOpenFileMatch = {
  readonly birthtimeMs?: number
  readonly mtimeMs?: number
  readonly path: string
  readonly size?: number
  readonly targetType?: TreeEntry['targetType']
  readonly type: TreeEntry['type']
}
