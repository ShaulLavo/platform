import type { Theme } from '@/components/theme-context'
import type { FlatDocumentSymbol } from '@/lib/document-symbols'
import type { PlatformCommandId } from '@/keymap/types'

import { ColorModeGroups } from './color-mode-groups'
import { CommandGroups } from './command-groups'
import type {
  CommandPaletteItem,
  EditorPaletteItem,
  FilePaletteItem,
  QuickAccessMode,
} from './command-palette-types'
import { EditorGroups } from './editor-groups'
import { QuickOpenGroups } from './quick-open-groups'
import { SymbolGroups } from './symbol-groups'
import { ViewGroups } from './view-groups'

type CommandPaletteGroupsFactoryProps = {
  readonly activeFilePath: string | null
  readonly commandGroups: readonly (readonly [string, readonly CommandPaletteItem[]])[]
  readonly currentTheme: Theme
  readonly editorItems: readonly EditorPaletteItem[]
  readonly fileItems: readonly FilePaletteItem[]
  readonly fileQuery: string
  readonly fileSearchError: boolean
  readonly hasWorkspace: boolean
  readonly mode: QuickAccessMode
  readonly symbolItems: readonly FlatDocumentSymbol[]
  readonly symbolsPending: boolean
  readonly onCommandSelect: (item: CommandPaletteItem) => void
  readonly onFileSelect: (path: string) => void
  readonly onPlatformCommandSelect: (command: PlatformCommandId) => void
  readonly onSymbolSelect: (symbol: FlatDocumentSymbol) => void
}

export function CommandPaletteGroupsFactory({
  activeFilePath,
  commandGroups,
  currentTheme,
  editorItems,
  fileItems,
  fileQuery,
  fileSearchError,
  hasWorkspace,
  mode,
  symbolItems,
  symbolsPending,
  onCommandSelect,
  onFileSelect,
  onPlatformCommandSelect,
  onSymbolSelect,
}: CommandPaletteGroupsFactoryProps) {
  if (mode === 'commands') {
    return (
      <CommandGroups
        groups={commandGroups}
        activeFilePath={activeFilePath}
        hasWorkspace={hasWorkspace}
        onSelect={onCommandSelect}
      />
    )
  }

  if (mode === 'views') {
    return <ViewGroups hasWorkspace={hasWorkspace} onSelect={onPlatformCommandSelect} />
  }

  if (mode === 'colorMode') {
    return <ColorModeGroups currentTheme={currentTheme} onSelect={onPlatformCommandSelect} />
  }

  if (mode === 'editors') {
    return <EditorGroups items={editorItems} onSelect={onFileSelect} />
  }

  if (mode === 'symbols') {
    return <SymbolGroups isPending={symbolsPending} items={symbolItems} onSelect={onSymbolSelect} />
  }

  return (
    <QuickOpenGroups
      files={fileItems}
      hasWorkspace={hasWorkspace}
      query={fileQuery}
      searchError={fileSearchError}
      onFileSelect={onFileSelect}
    />
  )
}
