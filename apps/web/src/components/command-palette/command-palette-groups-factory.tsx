import type { Theme } from '@/components/theme-context'
import type { FlatDocumentSymbol } from '@/lib/document-symbols'
import { GotoLineGroups } from './goto-line-groups'

import { ColorModeGroups } from './color-mode-groups'
import { ColorThemeGroups } from './color-theme-groups'
import { CommandGroups } from './command-groups'
import type {
  CommandPaletteItem,
  EditorPaletteItem,
  FilePaletteItem,
  QuickAccessMode,
} from './command-palette-types'
import { EditorGroups } from './editor-groups'
import { QuickOpenGroups } from './quick-open-groups'
import { ScriptGroups } from './script-groups'
import { SessionGroups } from './session-groups'
import { SymbolGroups } from './symbol-groups'
import { ViewGroups } from './view-groups'
import type { ProjectScriptSuggestion } from '@/features/chat-mode/utils/project-scripts'
import type {
  SessionRailItem,
  SessionRailProject,
} from '@/features/chat-mode/utils/session-rail-model'

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
  readonly scriptItems: readonly ProjectScriptSuggestion[]
  readonly sessionItems: readonly SessionRailItem[]
  readonly sessionProjects: readonly SessionRailProject[]
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
  scriptItems,
  sessionItems,
  sessionProjects,
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

  if (mode === 'colorTheme') {
    return <ColorThemeGroups />
  }

  if (mode === 'editors') {
    return <EditorGroups items={editorItems} />
  }

  if (mode === 'scripts') {
    return <ScriptGroups scripts={scriptItems} />
  }

  if (mode === 'sessions') {
    return <SessionGroups projects={sessionProjects} sessions={sessionItems} />
  }

  if (mode === 'symbols') {
    return <SymbolGroups isPending={symbolsPending} items={symbolItems} />
  }

  if (mode === 'gotoLine') {
    return <GotoLineGroups query={fileQuery} />
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
