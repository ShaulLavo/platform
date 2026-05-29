import type { Theme } from '@/components/theme-context'
import type { FlatDocumentSymbol } from '@/lib/document-symbols'
import type { PlatformCommandId } from '@/keymap'

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
  readonly commandGroups: readonly (readonly [string, readonly CommandPaletteItem[]])[]
  readonly currentTheme: Theme
  readonly editorItems: readonly EditorPaletteItem[]
  readonly fileItems: readonly FilePaletteItem[]
  readonly fileQuery: string
  readonly fileSearchError: boolean
  readonly hasWorkspace: boolean
  readonly mode: QuickAccessMode
  readonly selectedFilePath: string | null
  readonly symbolItems: readonly FlatDocumentSymbol[]
  readonly symbolsPending: boolean
  readonly onCommandSelect: (command: PlatformCommandId) => void
  readonly onFileSelect: (path: string) => void
  readonly onSymbolSelect: (symbol: FlatDocumentSymbol) => void
}

export function CommandPaletteGroupsFactory({
  commandGroups,
  currentTheme,
  editorItems,
  fileItems,
  fileQuery,
  fileSearchError,
  hasWorkspace,
  mode,
  selectedFilePath,
  symbolItems,
  symbolsPending,
  onCommandSelect,
  onFileSelect,
  onSymbolSelect,
}: CommandPaletteGroupsFactoryProps) {
  if (mode === 'commands') {
    return (
      <CommandGroups
        groups={commandGroups}
        hasWorkspace={hasWorkspace}
        selectedFilePath={selectedFilePath}
        onSelect={onCommandSelect}
      />
    )
  }

  if (mode === 'views') {
    return <ViewGroups hasWorkspace={hasWorkspace} onSelect={onCommandSelect} />
  }

  if (mode === 'colorMode') {
    return <ColorModeGroups currentTheme={currentTheme} onSelect={onCommandSelect} />
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
