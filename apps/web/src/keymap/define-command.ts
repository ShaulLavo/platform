import { editorCommandMutates } from '@singapor/core/keymap'
import type { EditorKeymapContext } from '@singapor/core/keymap'
import type { EditorSaveService } from '@/features/editor/state/save-service'
import type { EditorCommandId } from '@singapor/core'
import type { Icon } from '@phosphor-icons/react'
import type { KeyChord } from '@/keymap/types'
import type { QueryClient } from '@tanstack/react-query'

import type { EditorCommands } from '@/features/editor/state/commands'
import type { EditorWorkspaceStoreApi } from '@/features/editor/state/workspace-state'
import type { Theme } from '@/features/settings/providers/theme-context'
import type { SettingsSubmission } from '@/features/settings/state/intent-store'
import type { ChatModePanels } from '@/features/chat-mode/utils/panels'
import type { RequestCloseTab } from '@/features/editor/hooks/use-dirty-tab-close'
import type { EditorDocumentStoreApi } from '@/features/editor/state/document-state'
import type { EditorDiffViewMode } from '@/features/editor/utils/diff-view-mode'
import type { WorkspaceEditService } from '@/features/editor/state/workspace-edit-service'
import type { WorkbenchPanels } from '@/features/workbench/utils/panels'
import type {
  AsyncCommandStart,
  CommandHandlerContext,
  CommandInvocation,
  ImmediateCommandDisposition,
} from '@/keymap/state/command-bus'
import type { FocusService, FocusTargetToken, ResolvedFocusTarget } from '@/lib/focus/state/service'
import type { WorkspaceUiMode } from '@/lib/ui-mode'

type CommandPlatformName = 'linux' | 'mac' | 'windows'

export type CommandTargetKind = 'editor' | 'workspace'

export type CommandWhen =
  | 'chatMode'
  | 'editorTarget'
  | 'editorWritable'
  | 'fileBackedTab'
  | 'saveableTab'
  | 'tabOpen'
  | 'workspaceOpen'
  | 'workspaceEditRedoable'
  | 'workspaceEditUndoable'
  | 'workspaceMutable'

export type CommandExecution = 'async' | 'sync'

export type CommandUndoCategory =
  | 'file-operation'
  | 'text-edit'
  | 'view-only'
  | 'workspace-operation'

/** One default key for a command. */
export type CommandKeyDefault = {
  readonly chord: KeyChord
  readonly pane?: import('@/lib/focus/state/service').FocusArea | 'any'
  readonly platforms?: readonly CommandPlatformName[]
  readonly preventDefault?: boolean
  readonly stopPropagation?: boolean
  /** VS Code command represented by this specific default binding, used for keymap import/export. */
  readonly vscodeCommandId?: string
}

export type WorkspaceCommandSnapshot = {
  readonly activeDocumentSavable: boolean
  readonly activeFilePath: string | null
  readonly activeTabId: string | null
  readonly chatMode: boolean
  readonly chatModePanels: ChatModePanels
  readonly diffViewMode: EditorDiffViewMode
  readonly rootPath: string | null
  readonly uiMode: WorkspaceUiMode
  readonly wallpaperEnabled: boolean
  readonly workbenchPanels: WorkbenchPanels
  readonly workspaceOpen: boolean
  readonly workspaceEditRedoable: boolean
  readonly workspaceEditUndoable: boolean
  readonly workspaceMutable: boolean
}

export type WorkspaceCommandRuntime = {
  readonly documents: {
    readonly save: EditorSaveService
    readonly queryClient: QueryClient
    readonly store: EditorDocumentStoreApi
  }
  readonly editor: EditorCommands
  readonly files: {
    readonly openFileAtRef: (path: string, ref: string) => Promise<boolean>
  }
  readonly focus: FocusService
  readonly settings: {
    readonly readSnapshot: () => {
      readonly diffViewMode: EditorDiffViewMode
      readonly wallpaperEnabled: boolean
    }
    readonly setDiffViewMode: (mode: EditorDiffViewMode, initiator?: string) => SettingsSubmission
    readonly setTheme: (theme: Theme, initiator?: string) => SettingsSubmission
    readonly setWallpaperEnabled: (enabled: boolean, initiator?: string) => SettingsSubmission
  }
  readonly shell: {
    readonly openPicker: () => void
    readonly openWorkspaceRoot: (
      rootPath: string,
    ) => Promise<'already-open' | 'failed' | 'opened' | 'superseded'>
    readonly showEnvironmentDialog: () => void
    readonly showCommandPalette: (
      initialSearch?: string,
      origin?: FocusTargetToken | null,
    ) => import('@/lib/focus/state/service').FocusTransitionTicket
    readonly showSettings: (
      origin?: FocusTargetToken | null,
    ) => import('@/lib/focus/state/service').FocusTransitionTicket
  }
  readonly tabs: {
    readonly requestCloseTab: RequestCloseTab
  }
  readonly workspace: EditorWorkspaceStoreApi
  readonly workspaceEdits: Pick<
    WorkspaceEditService,
    'canMutateWorkspace' | 'getSnapshot' | 'redo' | 'runWorkspaceMutation' | 'undo'
  >
}

export type PlatformCommandTarget =
  | {
      readonly keymapContext: EditorKeymapContext | null
      readonly inputElement: HTMLElement | null
      readonly focusTarget: ResolvedFocusTarget
      readonly kind: 'editor'
      readonly logIdentity: string
      readonly token: FocusTargetToken
      readonly writable: boolean
    }
  | {
      readonly kind: 'workspace'
      readonly logIdentity: 'workspace'
    }

export type WorkspaceCommandHandlerContext = CommandHandlerContext<
  WorkspaceCommandRuntime,
  WorkspaceCommandSnapshot,
  PlatformCommandTarget,
  CommandInvocation
>

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
  readonly execution: CommandExecution
  readonly target: CommandTargetKind
  readonly undoCategory: CommandUndoCategory
  readonly when: readonly CommandWhen[]
  /** Running it only switches palette mode, so the palette stays open. */
  readonly keepsPaletteOpen?: boolean
  /** Not offered in the `>` command list. */
  readonly hiddenInPalette?: boolean
}

export type WorkspaceCommand<
  Id extends string = string,
  Execution extends CommandExecution = CommandExecution,
> = Omit<CommandBase<Id>, 'execution'> & {
  readonly execution: Execution
  readonly run: (
    context: WorkspaceCommandHandlerContext,
  ) => Execution extends 'sync' ? ImmediateCommandDisposition : AsyncCommandStart
}

export type EditorCommand<Id extends string = string> = CommandBase<Id> & {
  readonly execution: 'sync'
  readonly target: 'editor'
}

export type PlatformCommand = EditorCommand | WorkspaceCommand

export function defineCommand<
  const Id extends `workspace.${string}` | `environment.${string}`,
  const Execution extends CommandExecution,
>(command: WorkspaceCommand<Id, Execution>): WorkspaceCommand<Id, Execution> {
  return command
}

/**
 * Takes the bare `EditorCommandId` and prefixes it, so an editor command can
 * only be declared for something `@singapor/core` actually implements. Every
 * editor command needs a registered Editor target to act on. Every one of its
 * keys belongs to the editor pane. Target, execution, and the writable gate are
 * derived here so they cannot drift across Editor rows.
 */
export function defineEditorCommand<const Id extends EditorCommandId>(
  command: Omit<
    EditorCommand<`editor.${Id}`>,
    'category' | 'execution' | 'id' | 'target' | 'when'
  > & {
    readonly id: Id
  },
): EditorCommand<`editor.${Id}`> {
  const when: CommandWhen[] = ['editorTarget']
  if (editorCommandMutates(command.id)) when.push('editorWritable')

  return {
    ...command,
    category: 'Editor',
    execution: 'sync',
    id: `editor.${command.id}`,
    keys: command.keys?.map((key) => ({ pane: 'editor', ...key })),
    target: 'editor',
    when,
  }
}
