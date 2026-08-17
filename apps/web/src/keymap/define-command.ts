import type { EditorCommandId } from '@singapor/core'
import type { Icon } from '@phosphor-icons/react'
import type { RegisterableHotkey } from '@tanstack/react-hotkeys'
import type { QueryClient } from '@tanstack/react-query'

import type { Theme } from '@/components/theme-context'
import type { FocusArea } from '@/components/workspace/focus/providers/focus-state'
import type { ChatModePanels } from '@/features/chat-mode/utils/panels'
import type { RequestCloseTab } from '@/features/editor/hooks/use-dirty-tab-close'
import type { EditorDocumentStoreApi } from '@/features/editor/state/editor-document-state'
import type { EditorDiffViewMode } from '@/features/editor/utils/diff-view-mode'
import type { WorkbenchPanels } from '@/features/workbench/utils/workbench-panels'
import type { WorkspaceUiMode } from '@/lib/ui-mode'

type CommandPlatformName = 'linux' | 'mac' | 'windows'

/**
 * What has to be true before a command can run. `commandDisabledReason` is a
 * lookup on this and nothing else, so the gate lives on the command instead of
 * in a set of ids kept somewhere else.
 */
export type CommandRequirement = 'file' | 'nothing' | 'workspace'

/** One default key for a command. `vscodeCommandId` is per key, not per command. */
export type CommandKeyDefault = {
  readonly hotkey: RegisterableHotkey
  readonly pane?: FocusArea | 'any'
  readonly platforms?: readonly CommandPlatformName[]
  readonly preventDefault?: boolean
  readonly stopPropagation?: boolean
  readonly vscodeCommandId?: string
}

export type WorkspaceCommandContext = {
  readonly activeFilePath: string | null
  readonly activeTabId: string | null
  readonly chatModePanels: ChatModePanels
  readonly diffViewMode: EditorDiffViewMode
  readonly documentStore: EditorDocumentStoreApi
  readonly openPicker: () => void
  readonly openFileAtRef: (path: string, ref: string) => Promise<boolean>
  readonly openSearchEditor: (rootPath: string) => void
  readonly queryClient: QueryClient
  readonly reopenClosedEditor: () => boolean
  readonly requestCloseTab: RequestCloseTab
  readonly requestEditorFocus: () => void
  readonly rootPath: string | null
  readonly setChatModePanels: (panels: ChatModePanels) => void
  readonly setDiffViewMode: (mode: EditorDiffViewMode) => void
  readonly setFocusArea: (area: FocusArea) => void
  readonly setTheme: (theme: Theme) => void
  readonly setUiMode: (mode: WorkspaceUiMode) => void
  readonly setWallpaperEnabled: (enabled: boolean) => void
  readonly setWorkbenchPanels: (panels: WorkbenchPanels) => void
  readonly showCommandPalette: (initialSearch?: string) => void
  readonly showSettings: () => void
  readonly selectPreviousEditor: () => boolean
  readonly uiMode: WorkspaceUiMode
  readonly wallpaperEnabled: boolean
  readonly workbenchPanels: WorkbenchPanels
}

type CommandBase<Id extends string> = {
  readonly id: Id
  readonly title: string
  readonly description?: string
  readonly category: string
  /** Never set today; read by the palette's keyword builder. Kept as a hook. */
  readonly aliases?: readonly string[]
  readonly vscodeCommandIds?: readonly string[]
  readonly icon?: Icon
  readonly keys?: readonly CommandKeyDefault[]
  readonly requires: CommandRequirement
  /** Running it only switches palette mode, so the palette stays open. */
  readonly keepsPaletteOpen?: boolean
  /** Not offered in the `>` command list. */
  readonly hiddenInPalette?: boolean
}

export type WorkspaceCommand<Id extends string = string> = CommandBase<Id> & {
  readonly kind: 'workspace'
  readonly run: (context: WorkspaceCommandContext) => boolean | void
}

export type EditorCommand<Id extends string = string> = CommandBase<Id> & {
  readonly kind: 'editor'
}

export type PlatformCommand = EditorCommand | WorkspaceCommand

export function defineCommand<const Id extends `workspace.${string}`>(
  command: Omit<WorkspaceCommand<Id>, 'kind'>,
): WorkspaceCommand<Id> {
  return { ...command, kind: 'workspace' }
}

/**
 * Takes the bare `EditorCommandId` and prefixes it, so an editor command can
 * only be declared for something `@singapor/core` actually implements. Every
 * editor command needs a file-backed surface, and every one of its keys belongs
 * to the editor pane, so neither is worth restating 80 times.
 */
export function defineEditorCommand<const Id extends EditorCommandId>(
  command: Omit<EditorCommand<`editor.${Id}`>, 'category' | 'id' | 'kind' | 'requires'> & {
    readonly id: Id
  },
): EditorCommand<`editor.${Id}`> {
  return {
    ...command,
    category: 'Editor',
    id: `editor.${command.id}`,
    keys: command.keys?.map((key) => ({ pane: 'editor', ...key })),
    kind: 'editor',
    requires: 'file',
  }
}
