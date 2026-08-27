import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  BracketsCurlyIcon,
  CardsIcon,
  ClockCounterClockwiseIcon,
  CommandIcon,
  CrosshairIcon,
  DesktopIcon,
  FileMagnifyingGlassIcon,
  FloppyDiskBackIcon,
  FloppyDiskIcon,
  FolderOpenIcon,
  GearSixIcon,
  GitDiffIcon,
  ImageIcon,
  MoonIcon,
  PaletteIcon,
  SidebarSimpleIcon,
  SquareHalfBottomIcon,
  SquaresFourIcon,
  SunIcon,
  XIcon,
} from '@phosphor-icons/react'
import type { QueryClient } from '@tanstack/react-query'

import { shareableAddress } from '@/features/address/state/storage'
import {
  jumpToSession,
  selectAdjacentSession,
  startScopedSessionDraft,
  type SessionTraversalDirection,
} from '@/features/chat-mode/state/session-commands'
import { useSessionIsolationStore } from '@/features/chat-mode/state/session-isolation-store'
import { setChatModeSessionRailOpen, showChatModeToolTab } from '@/features/chat-mode/utils/panels'
import {
  compareSavedDocumentId,
  parseCompareSavedDocumentId,
} from '@/features/editor/utils/compare-saved-document'
import {
  fileBackedDocumentPath,
  savableDocumentPath,
} from '@/features/editor/utils/file-backed-document'
import { activeSettingsBufferId } from '@/features/settings/state/active-buffer'
import {
  dirtySavableEditorDocuments,
  saveAllEditorDocuments,
  saveSelectedEditorDocument,
} from '@/features/editor/utils/save'
import type { EditorDocumentStoreApi } from '@/features/editor/state/document-state'
import type { WorkspaceMutationReporter } from '@/features/editor/state/workspace-edit-service'
import { nextEditorDiffViewMode } from '@/features/editor/utils/diff-view-mode'
import { parseDiffDocumentId } from '@/features/git/utils/diff-document'
import { parseSearchBufferDocumentId } from '@/features/search/utils/buffer-document'
import {
  activeEditorTabForWorkbenchPanels,
  openEditorPathInWorkbenchPanels,
  setWorkbenchBottomTab,
  setWorkbenchSidebarTab,
} from '@/features/workbench/utils/panels'
import { fetchFile } from '@/lib/file-server'
import { setFileSnapshotQueryData } from '@/lib/file-snapshot-query-cache'
import type {
  AsyncCommandSettlement,
  AsyncCommandStart,
  ImmediateCommandDisposition,
} from '@/keymap/state/command-bus'
import {
  focusTargetById,
  focusTargetIdsEqual,
  registeredFocusTarget,
  type FocusDestination,
  type FocusIntent,
  type FocusTargetId,
  type FocusTargetToken,
  type FocusTransitionTicket,
  type FocusTransitionOutcome,
} from '@/lib/focus/state/service'
import { matchesActiveSurface } from '@/lib/focus/utils/active-surface'
import { toggledWorkspaceUiMode } from '@/lib/ui-mode'

import {
  defineCommand,
  type WorkspaceCommandHandlerContext,
  type WorkspaceCommandRuntime,
} from './define-command'
import { SESSION_JUMP_POSITIONS, sessionJumpCommandId } from './types'

const handled = { status: 'handled' } as const
const declined = { reason: 'handler-declined', status: 'unhandled' } as const
type StartedCommand = Extract<AsyncCommandStart, { readonly status: 'started' }>

/**
 * Session traversal only means something while the chat layout is the one on screen —
 * in the workbench there is no rail to count rows in and no stage to hand them to.
 */
function runSessionCommand(context: WorkspaceCommandHandlerContext, run: () => boolean) {
  if (context.snapshot.uiMode !== 'chat') return declined

  return dispositionFor(run())
}

function sessionTraversalHandler(direction: SessionTraversalDirection) {
  return (context: WorkspaceCommandHandlerContext) =>
    runSessionCommand(context, () => selectAdjacentSession(direction))
}

function dispositionFor(accepted: boolean): ImmediateCommandDisposition {
  return accepted ? handled : declined
}

async function revertSelectedEditorDocument(
  documentStore: EditorDocumentStoreApi,
  queryClient: QueryClient,
  activeFilePath: string | null,
) {
  const path = fileBackedDocumentPath(activeFilePath)
  if (!path) return false

  const file = await fetchFile(path, new AbortController().signal)
  setFileSnapshotQueryData(queryClient, file)
  documentStore.getState().forceReplaceLiveEditorDocument(file)
  return true
}

function operationStart(operation: Promise<boolean>): StartedCommand {
  return {
    completion: operation.then((accepted) => dispositionFor(accepted)),
    status: 'started',
  }
}

function resolvedOperationStart(operation: Promise<void>): StartedCommand {
  return {
    completion: operation.then(() => handled),
    status: 'started',
  }
}

function focusStart(
  runtime: WorkspaceCommandRuntime,
  destination: FocusDestination,
  intent: FocusIntent = 'focus',
  acknowledged: ImmediateCommandDisposition = handled,
): StartedCommand {
  return transitionStart(runtime.focus.request(destination, intent), acknowledged)
}

function transitionStart(
  ticket: FocusTransitionTicket,
  acknowledged: ImmediateCommandDisposition = handled,
): StartedCommand {
  return {
    completion: ticket.completion.then((outcome) => focusSettlement(outcome, acknowledged)),
    status: 'started',
  }
}

function focusIdStart(
  runtime: WorkspaceCommandRuntime,
  id: FocusTargetId,
  intent: FocusIntent = 'focus',
  acknowledged: ImmediateCommandDisposition = handled,
) {
  return focusStart(runtime, focusTargetById(id), intent, acknowledged)
}

function focusIdInLayoutStart(
  runtime: WorkspaceCommandRuntime,
  id: FocusTargetId,
  layout: 'chat' | 'workbench',
  intent: FocusIntent = 'focus',
  acknowledged: ImmediateCommandDisposition = handled,
) {
  return focusStart(
    runtime,
    {
      isValid: () => runtime.workspace.getState().uiMode === layout,
      kind: 'match',
      matches: (target) => target.layout === layout && focusTargetIdsEqual(target.id, id),
    },
    intent,
    acknowledged,
  )
}

function focusSettlement(
  outcome: FocusTransitionOutcome,
  acknowledged: ImmediateCommandDisposition,
): AsyncCommandSettlement {
  if (outcome.status === 'acknowledged') return acknowledged
  if (outcome.status === 'superseded') {
    return { reason: 'domain-discarded', status: 'cancelled' }
  }

  return declined
}

function settingStart(
  submission: ReturnType<WorkspaceCommandRuntime['settings']['setTheme']>,
): AsyncCommandStart {
  if (submission.kind === 'noop') return handled

  return {
    completion: submission.settled.then((settlement) => {
      if (settlement === 'acknowledged') return handled
      if (settlement === 'discarded') {
        return { reason: 'domain-discarded', status: 'cancelled' } as const
      }

      return {
        failure: { operationId: submission.mutationId, owner: 'domain' },
        status: 'failed',
      } as const
    }),
    status: 'started',
  }
}

function focusActiveSurface(runtime: WorkspaceCommandRuntime): StartedCommand {
  let workspace = runtime.workspace.getState()
  if (workspace.uiMode === 'chat') {
    workspace.setChatModePanels(showChatModeToolTab(workspace.chatModePanels, 'editor'))
    workspace = runtime.workspace.getState()
  }
  const activeTab = activeEditorTabForWorkbenchPanels(workspace.workbenchPanels)
  if (!activeTab) {
    return focusStart(runtime, { isValid: () => false, kind: 'match', matches: () => false })
  }
  const layout = workspace.uiMode

  const activeDiffPath =
    parseCompareSavedDocumentId(activeTab.path) ?? parseDiffDocumentId(activeTab.path)?.path ?? null
  const activeSearchRoot = parseSearchBufferDocumentId(activeTab.path)?.rootPath ?? null
  const identity = {
    diffPath: activeDiffPath,
    layout,
    searchRoot: activeSearchRoot,
    tabId: activeTab.id,
  } as const

  return focusStart(runtime, {
    isValid: () => {
      const current = activeEditorTabForWorkbenchPanels(
        runtime.workspace.getState().workbenchPanels,
      )
      return (
        runtime.workspace.getState().uiMode === layout &&
        current?.id === activeTab.id &&
        current.path === activeTab.path
      )
    },
    kind: 'match',
    matches: (target) => matchesActiveSurface(target, identity),
  })
}

function focusAppShell(runtime: WorkspaceCommandRuntime): StartedCommand {
  return focusIdStart(runtime, { kind: 'app-shell' })
}

function focusActiveSurfaceOrShell(runtime: WorkspaceCommandRuntime): StartedCommand {
  if (activeEditorTabForWorkbenchPanels(runtime.workspace.getState().workbenchPanels)) {
    return focusActiveSurface(runtime)
  }

  return focusAppShell(runtime)
}

function focusWorkbench(runtime: WorkspaceCommandRuntime): StartedCommand {
  const last = runtime.focus.getSnapshot().lastCommandTarget
  if (
    last?.layout === 'workbench' &&
    workbenchFocusArea(last.area) &&
    runtime.focus.isRegistered(last.token)
  ) {
    return focusStart(runtime, registeredFocusTarget(last.token))
  }

  return focusActiveSurfaceOrShell(runtime)
}

function workbenchFocusArea(area: string) {
  return !['chat', 'command-palette', 'dialog', 'global', 'settings'].includes(area)
}

function chatFocusStart(
  runtime: WorkspaceCommandRuntime,
  rootPath: string | null,
  layout: 'chat' | 'workbench',
) {
  if (!rootPath) return declined

  return focusIdInLayoutStart(runtime, { key: rootPath, kind: 'chat-composer' }, layout)
}

/**
 * The nine jump slots are one shape, so they are written once. They are hidden
 * from the palette for the same reason as their four named siblings: they are
 * keyboard navigation for the visible chat rail, not general palette actions.
 */
function sessionJumpCommands() {
  return SESSION_JUMP_POSITIONS.map((position) =>
    defineCommand({
      category: 'Workspace',
      description: `Put session ${position} in the rail on the stage.`,
      hiddenInPalette: true,
      id: sessionJumpCommandId(position),
      keys: [{ hotkey: `Mod+Alt+${position}`, preventDefault: true }],
      execution: 'sync',
      target: 'workspace',
      undoCategory: 'view-only',
      when: ['workspaceOpen', 'chatMode'],
      run: (context) => runSessionCommand(context, () => jumpToSession(position)),
      title: `Go to session ${position}`,
    }),
  )
}

export const workspaceCommands = [
  defineCommand({
    category: 'Workspace',
    description: 'Undo the latest atomic multi-file workspace edit.',
    icon: ArrowCounterClockwiseIcon,
    id: 'workspace.undoWorkspaceEdit',
    execution: 'async',
    target: 'workspace',
    undoCategory: 'workspace-operation',
    when: ['workspaceOpen', 'workspaceEditUndoable'],
    run: ({ runtime }) => operationStart(runtime.workspaceEdits.undo()),
    title: 'Undo workspace edit',
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Redo the latest atomic multi-file workspace edit.',
    icon: ArrowClockwiseIcon,
    id: 'workspace.redoWorkspaceEdit',
    execution: 'async',
    target: 'workspace',
    undoCategory: 'workspace-operation',
    when: ['workspaceOpen', 'workspaceEditRedoable'],
    run: ({ runtime }) => operationStart(runtime.workspaceEdits.redo()),
    title: 'Redo workspace edit',
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Search workspace files and quick actions.',
    icon: FileMagnifyingGlassIcon,
    id: 'workspace.showQuickAccess',
    keepsPaletteOpen: true,
    keys: [
      {
        hotkey: 'Mod+P',
        preventDefault: true,
        stopPropagation: true,
        vscodeCommandId: 'workbench.action.quickOpen',
      },
    ],
    execution: 'async',
    target: 'workspace',
    undoCategory: 'view-only',
    when: ['workspaceOpen'],
    run: ({ invocation, runtime }) =>
      transitionStart(
        runtime.shell.showCommandPalette('', invocation.origin as FocusTargetToken | null),
      ),
    title: 'Quick Open',
    vscodeCommandIds: ['workbench.action.quickOpen'],
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Search and run workspace or editor commands.',
    hiddenInPalette: true,
    icon: CommandIcon,
    id: 'workspace.showCommandPalette',
    keepsPaletteOpen: true,
    keys: [
      {
        hotkey: 'Mod+Shift+P',
        preventDefault: true,
        stopPropagation: true,
        vscodeCommandId: 'workbench.action.showCommands',
      },
      {
        hotkey: 'F1',
        preventDefault: true,
        stopPropagation: true,
        vscodeCommandId: 'workbench.action.showCommands',
      },
    ],
    execution: 'async',
    target: 'workspace',
    undoCategory: 'view-only',
    when: [],
    run: ({ invocation, runtime }) =>
      transitionStart(
        runtime.shell.showCommandPalette('>', invocation.origin as FocusTargetToken | null),
      ),
    title: 'Show command palette',
    vscodeCommandIds: ['workbench.action.showCommands'],
  }),
  // Settings are machine-wide, so this is the one workspace command that stays
  // available with no folder open — it is where a provider gets configured in
  // the first place.
  defineCommand({
    category: 'Workspace',
    description: 'Open providers, models, and keybindings.',
    icon: GearSixIcon,
    id: 'workspace.showSettings',
    keys: [
      {
        hotkey: 'Mod+,',
        preventDefault: true,
        stopPropagation: true,
        vscodeCommandId: 'workbench.action.openSettings',
      },
    ],
    execution: 'async',
    target: 'workspace',
    undoCategory: 'view-only',
    when: [],
    run: ({ invocation, runtime }) =>
      transitionStart(runtime.shell.showSettings(invocation.origin as FocusTargetToken | null)),
    title: 'Settings',
    vscodeCommandIds: ['workbench.action.openSettings'],
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Open the workspace file picker.',
    icon: FolderOpenIcon,
    id: 'workspace.openFilePicker',
    execution: 'sync',
    target: 'workspace',
    undoCategory: 'view-only',
    when: [],
    run: ({ runtime }) => {
      runtime.shell.openPicker()
      return handled
    },
    title: 'Open file picker',
    vscodeCommandIds: ['workbench.action.quickOpen'],
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Open workspace search results in an editor tab.',
    icon: FileMagnifyingGlassIcon,
    id: 'workspace.openSearchEditor',
    execution: 'async',
    target: 'workspace',
    undoCategory: 'view-only',
    when: ['workspaceOpen'],
    run: ({ runtime, snapshot }) => {
      if (!snapshot.rootPath) return declined

      runtime.editor.openSearchEditor(snapshot.rootPath)
      return focusActiveSurface(runtime)
    },
    title: 'Open Search Editor',
    vscodeCommandIds: ['search.action.openNewEditor'],
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Switch to the previously active editor.',
    icon: ClockCounterClockwiseIcon,
    id: 'workspace.quickOpenPreviousEditor',
    execution: 'async',
    target: 'workspace',
    undoCategory: 'view-only',
    when: ['tabOpen'],
    run: ({ runtime }) => {
      if (!runtime.editor.selectPreviousEditor()) return declined

      return focusActiveSurface(runtime)
    },
    title: 'Quick open previous editor',
    vscodeCommandIds: ['workbench.action.quickOpenPreviousEditor'],
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Search and focus workspace views.',
    icon: SquaresFourIcon,
    id: 'workspace.quickOpenView',
    keepsPaletteOpen: true,
    execution: 'async',
    target: 'workspace',
    undoCategory: 'view-only',
    when: ['workspaceOpen'],
    run: ({ invocation, runtime }) =>
      transitionStart(
        runtime.shell.showCommandPalette('view ', invocation.origin as FocusTargetToken | null),
      ),
    title: 'Open view',
    vscodeCommandIds: ['workbench.action.quickOpenView'],
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Search symbols in the active editor.',
    icon: BracketsCurlyIcon,
    id: 'workspace.gotoSymbol',
    keepsPaletteOpen: true,
    keys: [
      {
        hotkey: 'Mod+Shift+O',
        preventDefault: true,
        vscodeCommandId: 'workbench.action.gotoSymbol',
      },
    ],
    execution: 'async',
    target: 'workspace',
    undoCategory: 'view-only',
    when: ['fileBackedTab'],
    run: ({ invocation, runtime, snapshot }) => {
      if (!fileBackedDocumentPath(snapshot.activeFilePath)) return declined

      return transitionStart(
        runtime.shell.showCommandPalette('@', invocation.origin as FocusTargetToken | null),
      )
    },
    title: 'Go to symbol in editor',
    vscodeCommandIds: ['workbench.action.gotoSymbol'],
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Search open editor tabs.',
    icon: CardsIcon,
    id: 'workspace.showAllEditors',
    keepsPaletteOpen: true,
    execution: 'async',
    target: 'workspace',
    undoCategory: 'view-only',
    when: ['workspaceOpen'],
    run: ({ invocation, runtime }) =>
      transitionStart(
        runtime.shell.showCommandPalette('edt ', invocation.origin as FocusTargetToken | null),
      ),
    title: 'Show all editors',
    vscodeCommandIds: ['workbench.action.showAllEditors'],
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Save the active editor.',
    icon: FloppyDiskIcon,
    id: 'workspace.saveFile',
    keys: [
      { hotkey: 'Mod+S', preventDefault: true, vscodeCommandId: 'workbench.action.files.save' },
    ],
    // Not `file`: the raw settings.json buffer has no path on disk and is saved
    // through the settings route, which is a save the user expects Mod+S to do.
    execution: 'async',
    target: 'workspace',
    undoCategory: 'file-operation',
    when: ['saveableTab', 'workspaceMutable'],
    run: ({ runtime, snapshot }) => {
      // The settings tab is one document with two views, and only the JSON view
      // has a buffer. Resolving here rather than in `save.ts` keeps the fact
      // that the settings page has modes inside the feature that owns them.
      const path = activeSettingsBufferId(snapshot.activeFilePath) ?? snapshot.activeFilePath
      if (!path || !savableDocumentPath(path)) return declined
      const save = () =>
        saveSelectedEditorDocument(runtime.documents.store, runtime.documents.queryClient, path)
      const dirty = dirtySavableEditorDocuments(runtime.documents.store.getState()).some(
        (document) => document.id === path,
      )

      return operationStart(
        dirty ? runtime.workspaceEdits.runWorkspaceMutation([path], save) : save(),
      )
    },
    title: 'Save',
    vscodeCommandIds: ['workbench.action.files.save'],
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Save all dirty editors.',
    icon: FloppyDiskBackIcon,
    id: 'workspace.saveAllFiles',
    execution: 'async',
    target: 'workspace',
    undoCategory: 'file-operation',
    when: ['workspaceOpen', 'workspaceMutable'],
    run: ({ runtime }) => {
      const affectedPaths = dirtySavableEditorDocuments(runtime.documents.store.getState()).map(
        (document) => document.id,
      )
      const save = (reportAffectedPaths?: WorkspaceMutationReporter) =>
        saveAllEditorDocuments(runtime.documents.store, runtime.documents.queryClient, (path) =>
          reportAffectedPaths?.([path]),
        )
      const operation =
        affectedPaths.length > 0
          ? runtime.workspaceEdits.runWorkspaceMutation(affectedPaths, save)
          : save()
      return resolvedOperationStart(operation)
    },
    title: 'Save all',
    vscodeCommandIds: ['workbench.action.files.saveAll'],
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Diff the active editor against the file on disk.',
    id: 'workspace.compareWithSaved',
    execution: 'async',
    target: 'workspace',
    undoCategory: 'view-only',
    when: ['fileBackedTab'],
    run: ({ runtime, snapshot }) => {
      const path = fileBackedDocumentPath(snapshot.activeFilePath)
      if (!path) return declined

      runtime.workspace
        .getState()
        .setWorkbenchPanels(
          openEditorPathInWorkbenchPanels(snapshot.workbenchPanels, compareSavedDocumentId(path)),
        )
      return focusActiveSurface(runtime)
    },
    title: 'Compare with saved',
    vscodeCommandIds: ['workbench.files.action.compareWithSaved'],
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Open the committed version of the active file, read-only.',
    id: 'workspace.openFileAtHead',
    execution: 'async',
    target: 'workspace',
    undoCategory: 'view-only',
    when: ['fileBackedTab'],
    run: ({ runtime, snapshot }) => {
      const path = fileBackedDocumentPath(snapshot.activeFilePath)
      if (!path) return declined

      return {
        completion: runtime.files.openFileAtRef(path, 'HEAD').then(async (opened) => {
          if (!opened) return declined

          return focusActiveSurface(runtime).completion
        }),
        status: 'started',
      }
    },
    title: 'Open file at HEAD',
    vscodeCommandIds: ['git.openFile'],
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Reload the active editor from disk.',
    icon: ArrowCounterClockwiseIcon,
    id: 'workspace.revertFile',
    execution: 'async',
    target: 'workspace',
    undoCategory: 'file-operation',
    when: ['fileBackedTab'],
    run: ({ runtime, snapshot }) => {
      if (!fileBackedDocumentPath(snapshot.activeFilePath)) return declined

      return operationStart(
        revertSelectedEditorDocument(
          runtime.documents.store,
          runtime.documents.queryClient,
          snapshot.activeFilePath,
        ),
      )
    },
    title: 'Revert file',
    vscodeCommandIds: ['workbench.action.files.revert'],
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Reopen the most recently closed editor tab.',
    icon: ArrowClockwiseIcon,
    id: 'workspace.reopenClosedEditor',
    execution: 'async',
    target: 'workspace',
    undoCategory: 'view-only',
    when: ['workspaceOpen'],
    run: ({ runtime }) => {
      if (!runtime.editor.reopenClosedEditor()) return declined

      return focusActiveSurface(runtime)
    },
    title: 'Reopen closed editor',
    vscodeCommandIds: ['workbench.action.reopenClosedEditor'],
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Open, collapse, expand, or focus the Files pane.',
    icon: SidebarSimpleIcon,
    id: 'workspace.toggleSidebarVisibility',
    keys: [
      {
        hotkey: 'Mod+B',
        preventDefault: true,
        vscodeCommandId: 'workbench.action.toggleSidebarVisibility',
      },
    ],
    execution: 'async',
    target: 'workspace',
    undoCategory: 'view-only',
    when: ['workspaceOpen'],
    run: ({ runtime, snapshot }) => {
      if (!snapshot.rootPath) return declined

      const workspace = runtime.workspace.getState()
      workspace.setUiMode('workbench')
      workspace.setWorkbenchPanels(setWorkbenchSidebarTab(snapshot.workbenchPanels, 'files'))
      return focusIdInLayoutStart(
        runtime,
        { kind: 'file-tree', rootPath: snapshot.rootPath },
        'workbench',
      )
    },
    title: 'Toggle Files pane',
    vscodeCommandIds: ['workbench.action.toggleSidebarVisibility'],
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Show or hide the active workspace panel.',
    icon: SquareHalfBottomIcon,
    id: 'workspace.togglePanel',
    execution: 'async',
    target: 'workspace',
    undoCategory: 'view-only',
    when: ['workspaceOpen'],
    run: ({ runtime, snapshot }) => {
      if (!snapshot.rootPath) return declined

      const workspace = runtime.workspace.getState()
      workspace.setUiMode('workbench')
      workspace.setWorkbenchPanels(setWorkbenchBottomTab(snapshot.workbenchPanels, 'terminal'))
      return focusStart(runtime, {
        isValid: () => runtime.workspace.getState().uiMode === 'workbench',
        kind: 'match',
        matches: (target) =>
          target.id.kind === 'terminal' &&
          target.id.rootPath === snapshot.rootPath &&
          target.layout === 'workbench',
      })
    },
    title: 'Toggle panel',
    vscodeCommandIds: ['workbench.action.togglePanel'],
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Focus the primary editor group.',
    icon: CrosshairIcon,
    id: 'workspace.focusFirstEditorGroup',
    execution: 'async',
    target: 'workspace',
    undoCategory: 'view-only',
    when: ['tabOpen'],
    run: ({ runtime }) => focusActiveSurface(runtime),
    title: 'Focus first editor group',
    vscodeCommandIds: ['workbench.action.focusFirstEditorGroup'],
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Focus the current editor group in single-group mode.',
    icon: CrosshairIcon,
    id: 'workspace.focusSecondEditorGroup',
    execution: 'async',
    target: 'workspace',
    undoCategory: 'view-only',
    when: ['tabOpen'],
    run: ({ runtime }) => focusActiveSurface(runtime),
    title: 'Focus second editor group',
    vscodeCommandIds: ['workbench.action.focusSecondEditorGroup'],
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Focus the current editor group in single-group mode.',
    icon: CrosshairIcon,
    id: 'workspace.focusThirdEditorGroup',
    execution: 'async',
    target: 'workspace',
    undoCategory: 'view-only',
    when: ['tabOpen'],
    run: ({ runtime }) => focusActiveSurface(runtime),
    title: 'Focus third editor group',
    vscodeCommandIds: ['workbench.action.focusThirdEditorGroup'],
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Move keyboard focus to the editor.',
    icon: CrosshairIcon,
    id: 'workspace.focusEditor',
    execution: 'async',
    target: 'workspace',
    undoCategory: 'view-only',
    when: ['tabOpen'],
    run: ({ runtime }) => focusActiveSurface(runtime),
    title: 'Focus editor',
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Move keyboard focus to the file tree.',
    icon: CrosshairIcon,
    id: 'workspace.focusFileTree',
    keys: [{ hotkey: 'Mod+Shift+E', preventDefault: true }],
    execution: 'async',
    target: 'workspace',
    undoCategory: 'view-only',
    when: ['workspaceOpen'],
    run: ({ runtime, snapshot }) => {
      if (!snapshot.rootPath) return declined

      const workspace = runtime.workspace.getState()
      workspace.setUiMode('workbench')
      workspace.setWorkbenchPanels(setWorkbenchSidebarTab(snapshot.workbenchPanels, 'files'))
      return focusIdInLayoutStart(
        runtime,
        { kind: 'file-tree', rootPath: snapshot.rootPath },
        'workbench',
      )
    },
    title: 'Focus file tree',
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Filter the loaded files in the file tree.',
    icon: FileMagnifyingGlassIcon,
    id: 'workspace.findInFileTree',
    keys: [{ hotkey: 'Mod+F', pane: 'file-tree', preventDefault: true }],
    execution: 'async',
    target: 'workspace',
    undoCategory: 'view-only',
    when: ['workspaceOpen'],
    run: ({ runtime, snapshot }) => {
      if (!snapshot.rootPath) return declined

      const workspace = runtime.workspace.getState()
      workspace.setUiMode('workbench')
      workspace.setWorkbenchPanels(setWorkbenchSidebarTab(snapshot.workbenchPanels, 'files'))
      return focusIdInLayoutStart(
        runtime,
        { kind: 'file-tree', rootPath: snapshot.rootPath },
        'workbench',
        'open-search',
      )
    },
    title: 'Filter files in tree',
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Focus and reveal the active editor file in the file tree.',
    icon: CrosshairIcon,
    id: 'workspace.revealActiveFileInTree',
    execution: 'async',
    target: 'workspace',
    undoCategory: 'view-only',
    when: ['fileBackedTab'],
    run: ({ runtime, snapshot }) => {
      if (!fileBackedDocumentPath(snapshot.activeFilePath)) return declined
      if (!snapshot.rootPath) return declined

      const workspace = runtime.workspace.getState()
      workspace.setUiMode('workbench')
      workspace.setWorkbenchPanels(setWorkbenchSidebarTab(snapshot.workbenchPanels, 'files'))
      return focusIdInLayoutStart(
        runtime,
        { kind: 'file-tree', rootPath: snapshot.rootPath },
        'workbench',
        'reveal-active',
      )
    },
    title: 'Reveal active file in tree',
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Move keyboard focus to the Git panel.',
    icon: CrosshairIcon,
    id: 'workspace.focusGit',
    execution: 'async',
    target: 'workspace',
    undoCategory: 'view-only',
    when: ['workspaceOpen'],
    run: ({ runtime, snapshot }) => {
      if (!snapshot.rootPath) return declined

      const workspace = runtime.workspace.getState()
      workspace.setUiMode('workbench')
      workspace.setWorkbenchPanels(setWorkbenchSidebarTab(snapshot.workbenchPanels, 'git'))
      return focusIdInLayoutStart(
        runtime,
        { kind: 'git', rootPath: snapshot.rootPath },
        'workbench',
      )
    },
    title: 'Focus Git',
  }),
  defineCommand({
    category: 'Workspace',
    description:
      'Copy a link to exactly where you are — no absolute paths, no dev-only parameters.',
    id: 'workspace.copyAddress',
    execution: 'async',
    target: 'workspace',
    undoCategory: 'workspace-operation',
    when: ['workspaceOpen'],
    run: () => {
      if (!navigator.clipboard?.writeText) return declined

      // The address bar already holds the full address — thread, tool pane, filters and
      // all. Rebuilding a workbench-only subset here copied a strictly weaker link than
      // the one on screen, which defeats the point of the command.
      //
      // Through `shareableAddress`, not the raw location: a copied link needs an origin
      // to be openable at all, and it must not carry the dev params, which belong to the
      // session someone typed them into rather than to everyone they send the link to.
      return resolvedOperationStart(navigator.clipboard.writeText(shareableAddress()))
    },
    title: 'Copy address',
  }),
  // History is the browser's, so back and forward are one call each. The popstate
  // listener in the address layer is what turns the move into applied state.
  //
  // Mod+[ and Mod+] are app bindings too, not only the editor's outdent/indent
  // pair. Outside the editor these keys used to reach the browser untouched,
  // which was harmless only while there was no history to walk; now that there
  // is, the app has to own them or a back press in the file tree leaves the
  // workspace entirely.
  defineCommand({
    category: 'Workspace',
    description: 'Go back to the previous document.',
    id: 'workspace.navigateBack',
    keys: [{ hotkey: 'Mod+[' }],
    execution: 'sync',
    target: 'workspace',
    undoCategory: 'view-only',
    when: ['workspaceOpen'],
    run: () => {
      history.back()
      return handled
    },
    title: 'Back',
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Go forward again.',
    id: 'workspace.navigateForward',
    keys: [{ hotkey: 'Mod+]' }],
    execution: 'sync',
    target: 'workspace',
    undoCategory: 'view-only',
    when: ['workspaceOpen'],
    run: () => {
      history.forward()
      return handled
    },
    title: 'Forward',
  }),
  // Chat mode already puts the composer on the stage, so only the workbench has
  // anything to reveal — and there it is a sidebar tab, not a focus target: the
  // caller (terminal capture today) is handing over context, not the keyboard.
  defineCommand({
    category: 'Workspace',
    description: 'Bring the chat composer on screen.',
    id: 'workspace.revealChat',
    execution: 'async',
    target: 'workspace',
    undoCategory: 'view-only',
    when: ['workspaceOpen'],
    run: ({ runtime, snapshot }) => {
      if (snapshot.uiMode !== 'chat') {
        runtime.workspace
          .getState()
          .setWorkbenchPanels(setWorkbenchSidebarTab(snapshot.workbenchPanels, 'chat'))
      }

      return chatFocusStart(runtime, snapshot.rootPath, snapshot.uiMode)
    },
    title: 'Show chat',
  }),
  // Unlike the chat reveal, this one has somewhere to go from either mode: the
  // terminal lives in the workbench, so a caller in chat mode has to be taken
  // there or its command runs somewhere the user cannot see.
  defineCommand({
    category: 'Workspace',
    description: 'Bring the workbench terminal on screen.',
    id: 'workspace.revealTerminal',
    execution: 'async',
    target: 'workspace',
    undoCategory: 'view-only',
    when: ['workspaceOpen'],
    run: ({ runtime, snapshot }) => {
      if (!snapshot.rootPath) return declined

      const workspace = runtime.workspace.getState()
      workspace.setUiMode('workbench')
      workspace.setWorkbenchPanels(setWorkbenchBottomTab(snapshot.workbenchPanels, 'terminal'))
      return focusStart(runtime, {
        isValid: () => runtime.workspace.getState().uiMode === 'workbench',
        kind: 'match',
        matches: (target) =>
          target.id.kind === 'terminal' &&
          target.id.rootPath === snapshot.rootPath &&
          target.layout === 'workbench',
      })
    },
    title: 'Show terminal',
  }),
  // Arms the next send rather than creating anything now: the worktree is
  // prepared when the message is actually sent, so an armed draft the user
  // abandons leaves no checkout behind to clean up.
  defineCommand({
    category: 'Workspace',
    description: 'Run the next session on its own branch in a separate checkout.',
    id: 'workspace.newIsolatedSession',
    execution: 'async',
    target: 'workspace',
    undoCategory: 'workspace-operation',
    when: ['workspaceOpen'],
    run: ({ runtime, snapshot }) => {
      useSessionIsolationStore.getState().setIsolateNextSession(true)
      runtime.workspace.getState().setUiMode('chat')
      return chatFocusStart(runtime, snapshot.rootPath, 'chat')
    },
    title: 'New session in its own worktree',
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Close the selected editor tab.',
    icon: XIcon,
    id: 'workspace.closeCurrentTab',
    // A tab, not a file: this runs on `activeTabId` and never looks at a path,
    // and a diff, a settings page and a search buffer all close exactly like a
    // file does.
    execution: 'async',
    target: 'workspace',
    undoCategory: 'view-only',
    when: ['tabOpen'],
    run: ({ runtime, snapshot }) => {
      if (!snapshot.activeTabId) return declined

      const result = runtime.tabs.requestCloseTab(snapshot.activeTabId)
      if (result.status === 'rejected') return declined
      if (result.status === 'deferred') {
        return focusIdStart(
          runtime,
          { dialogTarget: result.dialogTarget, kind: 'unsaved-dialog' },
          'focus',
          { reason: 'dirty-close', status: 'deferred' },
        )
      }

      return focusActiveSurfaceOrShell(runtime)
    },
    title: 'Close current tab',
    vscodeCommandIds: ['workbench.action.closeActiveEditor'],
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Switch the active diff viewer between split and unified modes.',
    icon: GitDiffIcon,
    id: 'workspace.toggleDiffViewMode',
    keys: [{ hotkey: 'Mod+Shift+D' }],
    execution: 'async',
    target: 'workspace',
    undoCategory: 'workspace-operation',
    when: ['workspaceOpen'],
    run: ({ runtime, snapshot }) => {
      // Through the settings write path: the command and the settings page are two
      // front doors onto one value.
      return settingStart(
        runtime.settings.setDiffViewMode(
          nextEditorDiffViewMode(snapshot.diffViewMode),
          'workspace.toggleDiffViewMode',
        ),
      )
    },
    title: 'Toggle diff view mode',
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Switch between the Workbench and Chat layouts.',
    id: 'workspace.toggleUiMode',
    keys: [{ hotkey: 'Mod+Shift+M', preventDefault: true }],
    execution: 'async',
    target: 'workspace',
    undoCategory: 'view-only',
    when: ['workspaceOpen'],
    run: ({ runtime, snapshot }) => {
      const nextMode = toggledWorkspaceUiMode(snapshot.uiMode)
      runtime.workspace.getState().setUiMode(nextMode)
      if (nextMode === 'chat') return chatFocusStart(runtime, snapshot.rootPath, 'chat')

      return focusWorkbench(runtime)
    },
    title: 'Toggle Chat mode',
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Show sessions, chat, and tools in the chat layout.',
    id: 'workspace.showChatMode',
    execution: 'async',
    target: 'workspace',
    undoCategory: 'view-only',
    when: ['workspaceOpen'],
    run: ({ runtime, snapshot }) => {
      runtime.workspace.getState().setUiMode('chat')
      return chatFocusStart(runtime, snapshot.rootPath, 'chat')
    },
    title: 'Chat mode',
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Show the editor-centred workbench layout.',
    id: 'workspace.showWorkbenchMode',
    execution: 'async',
    target: 'workspace',
    undoCategory: 'view-only',
    when: ['workspaceOpen'],
    run: ({ runtime }) => {
      runtime.workspace.getState().setUiMode('workbench')
      return focusWorkbench(runtime)
    },
    title: 'Workbench mode',
  }),
  defineCommand({
    category: 'Appearance',
    description: 'Pick light, dark, or system color mode.',
    icon: PaletteIcon,
    id: 'workspace.selectColorMode',
    keepsPaletteOpen: true,
    execution: 'async',
    target: 'workspace',
    undoCategory: 'view-only',
    when: [],
    run: ({ invocation, runtime }) =>
      transitionStart(
        runtime.shell.showCommandPalette('color ', invocation.origin as FocusTargetToken | null),
      ),
    title: 'Choose color mode',
  }),
  defineCommand({
    category: 'Appearance',
    description: 'Pick the editor color theme from the bundled VSCode themes.',
    icon: PaletteIcon,
    id: 'workspace.selectColorTheme',
    keepsPaletteOpen: true,
    execution: 'async',
    target: 'workspace',
    undoCategory: 'view-only',
    when: [],
    run: ({ invocation, runtime }) =>
      transitionStart(
        runtime.shell.showCommandPalette('theme ', invocation.origin as FocusTargetToken | null),
      ),
    title: 'Choose color theme',
  }),
  defineCommand({
    category: 'Appearance',
    description: 'Use dark color mode.',
    hiddenInPalette: true,
    icon: MoonIcon,
    id: 'workspace.setDarkTheme',
    execution: 'async',
    target: 'workspace',
    undoCategory: 'workspace-operation',
    when: [],
    run: ({ runtime }) => settingStart(runtime.settings.setTheme('dark', 'workspace.setDarkTheme')),
    title: 'Dark color mode',
  }),
  defineCommand({
    category: 'Appearance',
    description: 'Use light color mode.',
    hiddenInPalette: true,
    icon: SunIcon,
    id: 'workspace.setLightTheme',
    execution: 'async',
    target: 'workspace',
    undoCategory: 'workspace-operation',
    when: [],
    run: ({ runtime }) =>
      settingStart(runtime.settings.setTheme('light', 'workspace.setLightTheme')),
    title: 'Light color mode',
  }),
  defineCommand({
    category: 'Appearance',
    description: 'Follow the system color mode.',
    hiddenInPalette: true,
    icon: DesktopIcon,
    id: 'workspace.setSystemTheme',
    execution: 'async',
    target: 'workspace',
    undoCategory: 'workspace-operation',
    when: [],
    run: ({ runtime }) =>
      settingStart(runtime.settings.setTheme('system', 'workspace.setSystemTheme')),
    title: 'System color mode',
  }),
  defineCommand({
    category: 'Appearance',
    description: 'Show or hide the background image or video.',
    icon: ImageIcon,
    id: 'workspace.toggleWallpaper',
    execution: 'async',
    target: 'workspace',
    undoCategory: 'workspace-operation',
    when: [],
    run: ({ runtime, snapshot }) => {
      // Through the settings write path, not a store setter. The command and the
      // settings page are two front doors onto one value; if they wrote to
      // different places they would disagree the first time either was used.
      return settingStart(
        runtime.settings.setWallpaperEnabled(
          !snapshot.wallpaperEnabled,
          'workspace.toggleWallpaper',
        ),
      )
    },
    title: 'Toggle wallpaper',
  }),
  // Chat sessions all sit under Mod+Alt: the plain Mod digits are reserved for the
  // editor groups VS Code puts there, and Mod+B already toggles the Files pane.
  defineCommand({
    category: 'Workspace',
    description: 'Start a new chat session in the active project.',
    hiddenInPalette: true,
    id: 'workspace.newSession',
    keys: [{ hotkey: 'Mod+Alt+N', preventDefault: true }],
    execution: 'sync',
    target: 'workspace',
    undoCategory: 'workspace-operation',
    when: ['workspaceOpen', 'chatMode'],
    run: (context) => runSessionCommand(context, startScopedSessionDraft),
    title: 'New session',
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Move to the next session in the rail.',
    hiddenInPalette: true,
    id: 'workspace.nextSession',
    keys: [{ hotkey: 'Mod+Alt+]', preventDefault: true }],
    execution: 'sync',
    target: 'workspace',
    undoCategory: 'view-only',
    when: ['workspaceOpen', 'chatMode'],
    run: sessionTraversalHandler('next'),
    title: 'Next session',
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Move to the previous session in the rail.',
    hiddenInPalette: true,
    id: 'workspace.previousSession',
    keys: [{ hotkey: 'Mod+Alt+[', preventDefault: true }],
    execution: 'sync',
    target: 'workspace',
    undoCategory: 'view-only',
    when: ['workspaceOpen', 'chatMode'],
    run: sessionTraversalHandler('previous'),
    title: 'Previous session',
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Show or hide the list of sessions.',
    hiddenInPalette: true,
    id: 'workspace.toggleSessionRail',
    keys: [{ hotkey: 'Mod+Alt+B', preventDefault: true }],
    execution: 'sync',
    target: 'workspace',
    undoCategory: 'view-only',
    when: ['workspaceOpen', 'chatMode'],
    run: (context) =>
      runSessionCommand(context, () => {
        context.runtime.workspace
          .getState()
          .setChatModePanels(
            setChatModeSessionRailOpen(
              context.snapshot.chatModePanels,
              !context.snapshot.chatModePanels.sessionRailOpen,
            ),
          )

        return true
      }),
    title: 'Toggle session rail',
  }),
  ...sessionJumpCommands(),
]

export type WorkspaceCommandId = (typeof workspaceCommands)[number]['id']
