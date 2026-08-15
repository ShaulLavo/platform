import { useCallback } from 'react'

import { useFocus, type FocusArea } from '@/components/workspace/focus/providers/focus-state'
import { useTheme, type Theme } from '@/components/theme-context'
import type { RequestCloseTab } from '@/features/editor/hooks/use-dirty-tab-close'
import { useEditorCommands } from '@/features/editor/state/editor-commands'
import { compareSavedDocumentId } from '@/features/editor/compare-saved-document'
import { shareableAddress } from '@/features/address/state/storage'
import { useOpenFileAtRef } from '@/features/git/hooks/use-open-file-at-ref'
import {
  useEditorDocumentStoreApi,
  type EditorDocumentStoreApi,
} from '@/features/editor/state/editor-document-state'
import { openEditorPathInWorkbenchPanels } from '@/features/workbench/utils/workbench-panels'
import {
  jumpToSession,
  selectAdjacentSession,
  startScopedSessionDraft,
  type SessionTraversalDirection,
} from '@/features/chat-mode/state/session-commands'
import { setChatModeSessionRailOpen, type ChatModePanels } from '@/features/chat-mode/utils/panels'
import {
  fileBackedEditorPath,
  saveAllEditorDocuments,
  saveSelectedEditorDocument,
} from '@/features/editor/editor-save'
import { useEditorWorkspaceStoreApi } from '@/features/editor/state/editor-workspace-state'
import {
  nextEditorDiffViewMode,
  type EditorDiffViewMode,
} from '@/features/editor/utils/diff-view-mode'
import { useSessionIsolationStore } from '@/features/chat-mode/state/session-isolation-store'
import {
  activeEditorPathForWorkbenchPanels,
  activeEditorTabForWorkbenchPanels,
  setWorkbenchBottomTab,
  setWorkbenchSidebarTab,
  type WorkbenchPanels,
} from '@/features/workbench/utils/workbench-panels'
import { reportError, toClientError } from '@/lib/client-error-taxonomy'
import { log } from '@/lib/client-logging'
import { setFileSnapshotQueryData } from '@/lib/file-snapshot-query-cache'
import { toggledWorkspaceUiMode, type WorkspaceUiMode } from '@/lib/ui-mode'
import { fetchFile } from '@/lib/file-server'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'

import { editorCommandIdFromPlatform } from './editor-keymap'
import { SESSION_JUMP_POSITIONS, sessionJumpCommandId } from './types'
import type { PlatformCommandId, WorkspaceCommandId } from './types'
import type { PlatformCommandDispatch } from './use-app-keymap'
import { DEFAULT_SETTING_VALUES } from '@workspace/contracts'
import { useSettings } from '@/features/settings/hooks/use-settings'
import { useSettingsActions } from '@/features/settings/hooks/use-settings-actions'

type WorkspaceCommandContext = {
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

type WorkspaceCommandHandler = (context: WorkspaceCommandContext) => boolean | void

export function usePlatformCommandDispatch({
  requestCloseTab,
  showCommandPalette = noop,
  showSettings = noop,
}: {
  readonly requestCloseTab?: RequestCloseTab
  readonly showCommandPalette?: (initialSearch?: string) => void
  readonly showSettings?: () => void
} = {}): PlatformCommandDispatch {
  const documentStore = useEditorDocumentStoreApi()
  const queryClient = useQueryClient()
  const workspaceStore = useEditorWorkspaceStoreApi()
  const { setTheme } = useTheme()
  const settings = useSettings()
  const { setSetting } = useSettingsActions()
  const diffViewMode =
    settings.data?.values['editor.diff.viewMode'] ?? DEFAULT_SETTING_VALUES['editor.diff.viewMode']
  const setDiffViewMode = (mode: EditorDiffViewMode) => setSetting('editor.diff.viewMode', mode)
  const wallpaperEnabled =
    settings.data?.values['workbench.wallpaper.enabled'] ??
    DEFAULT_SETTING_VALUES['workbench.wallpaper.enabled']
  const setWallpaperEnabled = (enabled: boolean) =>
    setSetting('workbench.wallpaper.enabled', enabled)
  const requestEditorFocus = useFocus((state) => state.requestEditorFocus)
  const dispatchEditorCommand = useFocus((state) => state.dispatchEditorCommand)
  const setFocusArea = useFocus((state) => state.setFocusArea)
  const { closeTab, openSearchEditor, reopenClosedEditor, selectPreviousEditor } =
    useEditorCommands()
  const openFileAtRef = useOpenFileAtRef()
  const fallbackRequestCloseTab = useCallback<RequestCloseTab>(
    (tabId) => {
      closeTab(tabId)
      return true
    },
    [closeTab],
  )
  const resolvedRequestCloseTab = requestCloseTab ?? fallbackRequestCloseTab

  return useCallback(
    (command: PlatformCommandId, event?: KeyboardEvent) => {
      const editorCommand = editorCommandIdFromPlatform(command)
      if (editorCommand) return dispatchEditorCommand(editorCommand, { event })
      const workspaceCommand = workspaceCommandIdFromPlatform(command)
      if (!workspaceCommand) return false

      const workspace = workspaceStore.getState()
      return dispatchWorkspaceCommand(workspaceCommand, {
        activeFilePath: activeEditorPathForWorkbenchPanels(workspace.workbenchPanels),
        activeTabId: activeEditorTabForWorkbenchPanels(workspace.workbenchPanels)?.id ?? null,
        chatModePanels: workspace.chatModePanels,
        diffViewMode,
        documentStore,
        openPicker: workspace.openPicker,
        openFileAtRef,
        openSearchEditor,
        queryClient,
        reopenClosedEditor,
        requestCloseTab: resolvedRequestCloseTab,
        requestEditorFocus,
        rootPath: workspace.rootFolder?.path ?? null,
        setChatModePanels: workspace.setChatModePanels,
        setDiffViewMode,
        setFocusArea,
        setTheme,
        setUiMode: workspace.setUiMode,
        setWallpaperEnabled,
        setWorkbenchPanels: workspace.setWorkbenchPanels,
        showCommandPalette,
        showSettings,
        selectPreviousEditor,
        uiMode: workspace.uiMode,
        wallpaperEnabled,
        workbenchPanels: workspace.workbenchPanels,
      })
    },
    [
      documentStore,
      dispatchEditorCommand,
      queryClient,
      openFileAtRef,
      openSearchEditor,
      reopenClosedEditor,
      requestEditorFocus,
      resolvedRequestCloseTab,
      selectPreviousEditor,
      setFocusArea,
      setTheme,
      showCommandPalette,
      showSettings,
      workspaceStore,
    ],
  )
}

function dispatchWorkspaceCommand(command: WorkspaceCommandId, context: WorkspaceCommandContext) {
  const handler = workspaceCommandHandlers[command]
  if (!handler) return false

  const handled = handler(context) ?? true

  log.info({
    action: 'workspace.command',
    area: 'command',
    command,
    handled,
  })
  return handled
}

/**
 * Session traversal only means something while the chat layout is the one on screen —
 * in the workbench there is no rail to count rows in and no stage to hand them to.
 */
function runSessionCommand(context: WorkspaceCommandContext, run: () => boolean) {
  if (context.uiMode !== 'chat') return false

  return run()
}

function sessionTraversalHandler(direction: SessionTraversalDirection): WorkspaceCommandHandler {
  return (context) => runSessionCommand(context, () => selectAdjacentSession(direction))
}

function sessionJumpHandlers(): Partial<Record<WorkspaceCommandId, WorkspaceCommandHandler>> {
  return Object.fromEntries(
    SESSION_JUMP_POSITIONS.map((position) => [
      sessionJumpCommandId(position),
      (context: WorkspaceCommandContext) =>
        runSessionCommand(context, () => jumpToSession(position)),
    ]),
  )
}

const workspaceCommandHandlers: Partial<Record<WorkspaceCommandId, WorkspaceCommandHandler>> = {
  ...sessionJumpHandlers(),
  'workspace.newSession': (context) => runSessionCommand(context, startScopedSessionDraft),
  'workspace.nextSession': sessionTraversalHandler('next'),
  'workspace.previousSession': sessionTraversalHandler('previous'),
  'workspace.toggleSessionRail': (context) =>
    runSessionCommand(context, () => {
      context.setChatModePanels(
        setChatModeSessionRailOpen(context.chatModePanels, !context.chatModePanels.sessionRailOpen),
      )

      return true
    }),
  'workspace.closeCurrentTab': ({ activeTabId, requestCloseTab }) =>
    closeSelectedTab(activeTabId, requestCloseTab),
  'workspace.focusEditor': ({ requestEditorFocus }) => {
    requestEditorFocus()
    return true
  },
  'workspace.focusFirstEditorGroup': ({ requestEditorFocus }) => {
    requestEditorFocus()
    return true
  },
  'workspace.focusSecondEditorGroup': ({ requestEditorFocus }) => {
    requestEditorFocus()
    return true
  },
  'workspace.focusThirdEditorGroup': ({ requestEditorFocus }) => {
    requestEditorFocus()
    return true
  },
  'workspace.focusFileTree': ({ setFocusArea, setWorkbenchPanels, workbenchPanels }) => {
    setWorkbenchPanels(setWorkbenchSidebarTab(workbenchPanels, 'files'))
    setFocusArea('file-tree')
    return true
  },
  'workspace.focusGit': ({ setFocusArea, setWorkbenchPanels, workbenchPanels }) => {
    setWorkbenchPanels(setWorkbenchSidebarTab(workbenchPanels, 'git'))
    setFocusArea('git')
    return true
  },
  'workspace.copyAddress': () => {
    if (!navigator.clipboard?.writeText) return false

    // The address bar already holds the full address — thread, tool pane, filters and
    // all. Rebuilding a workbench-only subset here copied a strictly weaker link than
    // the one on screen, which defeats the point of the command.
    //
    // Through `shareableAddress`, not the raw location: a copied link needs an origin
    // to be openable at all, and it must not carry the dev params, which belong to the
    // session someone typed them into rather than to everyone they send the link to.
    void navigator.clipboard.writeText(shareableAddress()).catch(reportCommandError)
    return true
  },
  // History is the browser's, so back and forward are one call each. The popstate
  // listener in the address layer is what turns the move into applied state.
  'workspace.navigateBack': () => {
    history.back()
    return true
  },
  'workspace.navigateForward': () => {
    history.forward()
    return true
  },
  // Chat mode already puts the composer on the stage, so only the workbench has
  // anything to reveal — and there it is a sidebar tab, not a focus target: the
  // caller (terminal capture today) is handing over context, not the keyboard.
  'workspace.revealChat': ({ setWorkbenchPanels, uiMode, workbenchPanels }) => {
    if (uiMode === 'chat') return true

    setWorkbenchPanels(setWorkbenchSidebarTab(workbenchPanels, 'chat'))
    return true
  },
  // Unlike the chat reveal, this one has somewhere to go from either mode: the
  // terminal lives in the workbench, so a caller in chat mode has to be taken
  // there or its command runs somewhere the user cannot see.
  'workspace.revealTerminal': ({
    setFocusArea,
    setUiMode,
    setWorkbenchPanels,
    workbenchPanels,
  }) => {
    setUiMode('workbench')
    setWorkbenchPanels(setWorkbenchBottomTab(workbenchPanels, 'terminal'))
    setFocusArea('terminal')
    return true
  },
  // Arms the next send rather than creating anything now: the worktree is
  // prepared when the message is actually sent, so an armed draft the user
  // abandons leaves no checkout behind to clean up.
  'workspace.newIsolatedSession': ({ setUiMode }) => {
    useSessionIsolationStore.getState().setIsolateNextSession(true)
    setUiMode('chat')
    return true
  },
  'workspace.gotoSymbol': ({ activeFilePath, showCommandPalette }) => {
    if (!fileBackedEditorPath(activeFilePath)) return false

    showCommandPalette('@')
    return true
  },
  'workspace.openFilePicker': ({ openPicker }) => {
    openPicker()
    return true
  },
  'workspace.openSearchEditor': ({ openSearchEditor, requestEditorFocus, rootPath }) => {
    if (!rootPath) return false

    openSearchEditor(rootPath)
    requestEditorFocus()
    return true
  },
  'workspace.quickOpenPreviousEditor': ({ requestEditorFocus, selectPreviousEditor }) => {
    const selected = selectPreviousEditor()
    if (!selected) return false

    requestEditorFocus()
    return true
  },
  'workspace.compareWithSaved': ({
    activeFilePath,
    requestEditorFocus,
    setWorkbenchPanels,
    workbenchPanels,
  }) => {
    const path = fileBackedEditorPath(activeFilePath)
    if (!path) return false

    setWorkbenchPanels(
      openEditorPathInWorkbenchPanels(workbenchPanels, compareSavedDocumentId(path)),
    )
    requestEditorFocus()
    return true
  },
  'workspace.openFileAtHead': ({ activeFilePath, openFileAtRef }) => {
    const path = fileBackedEditorPath(activeFilePath)
    if (!path) return false

    void openFileAtRef(path, 'HEAD').catch(reportCommandError)
    return true
  },
  'workspace.quickOpenView': ({ showCommandPalette }) => {
    showCommandPalette('view ')
    return true
  },
  'workspace.reopenClosedEditor': ({ reopenClosedEditor }) => reopenClosedEditor(),
  'workspace.revertFile': ({ activeFilePath, documentStore, queryClient }) =>
    runFileLifecycle(activeFilePath, () =>
      revertSelectedEditorDocument(documentStore, queryClient, activeFilePath),
    ),
  'workspace.saveAllFiles': ({ documentStore, queryClient }) => {
    void saveAllEditorDocuments(documentStore, queryClient).catch(reportCommandError)
    return true
  },
  'workspace.saveFile': ({ activeFilePath, documentStore, queryClient }) =>
    runFileLifecycle(activeFilePath, () =>
      saveSelectedEditorDocument(documentStore, queryClient, activeFilePath),
    ),
  'workspace.showAllEditors': ({ showCommandPalette }) => {
    showCommandPalette('edt ')
    return true
  },
  'workspace.showCommandPalette': ({ showCommandPalette }) => {
    showCommandPalette('>')
    return true
  },
  'workspace.showQuickAccess': ({ showCommandPalette }) => {
    showCommandPalette('')
    return true
  },
  // Settings are machine-wide, so this is the one workspace command that stays
  // available with no folder open — it is where a provider gets configured in
  // the first place.
  'workspace.showSettings': ({ showSettings }) => {
    showSettings()
    return true
  },
  'workspace.selectColorMode': ({ showCommandPalette }) => {
    showCommandPalette('color ')
    return true
  },
  'workspace.selectColorTheme': ({ showCommandPalette }) => {
    showCommandPalette('theme ')
    return true
  },
  'workspace.setDarkTheme': ({ setTheme }) => {
    setTheme('dark')
    return true
  },
  'workspace.setLightTheme': ({ setTheme }) => {
    setTheme('light')
    return true
  },
  'workspace.setSystemTheme': ({ setTheme }) => {
    setTheme('system')
    return true
  },
  'workspace.toggleDiffViewMode': ({ diffViewMode, setDiffViewMode }) => {
    // Through the settings write path: the command and the settings page are two
    // front doors onto one value.
    setDiffViewMode(nextEditorDiffViewMode(diffViewMode))
    return true
  },
  'workspace.togglePanel': ({ setFocusArea, setWorkbenchPanels, workbenchPanels }) => {
    setWorkbenchPanels(setWorkbenchBottomTab(workbenchPanels, 'terminal'))
    setFocusArea('terminal')
    return true
  },
  'workspace.toggleSidebarVisibility': ({ setFocusArea, setWorkbenchPanels, workbenchPanels }) => {
    setWorkbenchPanels(setWorkbenchSidebarTab(workbenchPanels, 'files'))
    setFocusArea('file-tree')
    return true
  },
  'workspace.toggleUiMode': ({ setUiMode, uiMode }) => {
    setUiMode(toggledWorkspaceUiMode(uiMode))
    return true
  },
  'workspace.toggleWallpaper': ({ setWallpaperEnabled, wallpaperEnabled }) => {
    // Through the settings write path, not a store setter. The command and the
    // settings page are two front doors onto one value; if they wrote to
    // different places they would disagree the first time either was used.
    setWallpaperEnabled(!wallpaperEnabled)
    return true
  },
  'workspace.showChatMode': ({ setUiMode }) => {
    setUiMode('chat')
    return true
  },
  'workspace.showWorkbenchMode': ({ setUiMode }) => {
    setUiMode('workbench')
    return true
  },
}

function closeSelectedTab(activeTabId: string | null, requestCloseTab: RequestCloseTab) {
  if (!activeTabId) return false

  requestCloseTab(activeTabId)
  return true
}

function runFileLifecycle(activeFilePath: string | null, operation: () => Promise<boolean>) {
  if (!fileBackedEditorPath(activeFilePath)) return false

  void operation().catch(reportCommandError)
  return true
}

async function revertSelectedEditorDocument(
  documentStore: EditorDocumentStoreApi,
  queryClient: QueryClient,
  activeFilePath: string | null,
) {
  const path = fileBackedEditorPath(activeFilePath)
  if (!path) return false

  const file = await fetchFile(path, new AbortController().signal)
  setFileSnapshotQueryData(queryClient, file)
  documentStore.getState().forceReplaceLiveEditorDocument(file, path)
  return true
}

function reportCommandError(error: unknown) {
  reportError(toClientError(error))
}

function workspaceCommandIdFromPlatform(command: PlatformCommandId): WorkspaceCommandId | null {
  if (command.startsWith('editor.')) return null

  return command as WorkspaceCommandId
}

function noop() {}
