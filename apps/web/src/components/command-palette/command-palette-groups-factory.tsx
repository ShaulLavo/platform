import type { Theme } from '@/components/theme-context'
import type { FlatDocumentSymbol } from '@/lib/document-symbols'

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
}: CommandPaletteGroupsFactoryProps) {
  if (mode === 'commands') {
    return (
      <CommandGroups
        groups={commandGroups}
        activeFilePath={activeFilePath}
        hasWorkspace={hasWorkspace}
      />
    )
  }

  if (mode === 'views') {
    return <ViewGroups hasWorkspace={hasWorkspace} />
  }

  if (mode === 'colorMode') {
    return <ColorModeGroups currentTheme={currentTheme} />
  }

  if (mode === 'editors') {
    return <EditorGroups items={editorItems} />
  }

  if (mode === 'symbols') {
    return <SymbolGroups isPending={symbolsPending} items={symbolItems} />
  }

  return (
    <QuickOpenGroups
      files={fileItems}
      hasWorkspace={hasWorkspace}
      query={fileQuery}
      searchError={fileSearchError}
    />
  )
}
