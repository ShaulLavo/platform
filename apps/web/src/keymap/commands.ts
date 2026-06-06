import { useCallback } from 'react'

import { useFocus, type FocusArea } from '@/components/workspace/focus/providers/focus-state'
import { useTheme, type Theme } from '@/components/theme-context'
import type { RequestCloseTab } from '@/features/editor/hooks/use-dirty-tab-close'
import { useEditorCommands } from '@/features/editor/state/editor-commands'
import { activeEditorPaneTab } from '@/features/editor/state/editor-pane-state'
import {
  useEditorDocumentStoreApi,
  type EditorDocumentStoreApi,
} from '@/features/editor/state/editor-document-state'
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
import { reportError, toClientError } from '@/lib/client-error-taxonomy'
import { log } from '@/lib/client-logging'
import { setFileSnapshotQueryData } from '@/lib/file-snapshot-query-cache'
import { fetchFile } from '@/lib/file-server'
import type { WorkspacePanelTab } from '@/lib/workspace-cache'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'

import { editorCommandIdFromPlatform, isEditorPlatformCommandId } from './editor-keymap'
import type { PlatformCommandId, WorkspaceCommandId } from './types'
import type { PlatformCommandDispatch } from './use-app-keymap'

type WorkspaceCommandContext = {
  readonly activeTabId: string | null
  readonly diffViewMode: EditorDiffViewMode
  readonly documentStore: EditorDocumentStoreApi
  readonly gitPanelOpen: boolean
  readonly openPicker: () => void
  readonly queryClient: QueryClient
  readonly reopenClosedEditor: () => boolean
  readonly requestCloseTab: RequestCloseTab
  readonly requestEditorFocus: () => void
  readonly selectedFilePath: string | null
  readonly setDiffViewMode: (mode: EditorDiffViewMode) => void
  readonly setFocusArea: (area: FocusArea) => void
  readonly setGitPanelOpen: (open: boolean) => void
  readonly setSidebarVisible: (visible: boolean) => void
  readonly setTheme: (theme: Theme) => void
  readonly setWorkspacePanelTab: (tab: WorkspacePanelTab) => void
  readonly showCommandPalette: (initialSearch?: string) => void
  readonly sidebarVisible: boolean
  readonly selectPreviousEditor: () => boolean
  readonly splitTab: (tabId: string, direction: 'horizontal') => boolean
}

type WorkspaceCommandHandler = (context: WorkspaceCommandContext) => boolean | void

export function usePlatformCommandDispatch({
  requestCloseTab,
  showCommandPalette = noop,
}: {
  readonly requestCloseTab?: RequestCloseTab
  readonly showCommandPalette?: (initialSearch?: string) => void
} = {}): PlatformCommandDispatch {
  const documentStore = useEditorDocumentStoreApi()
  const queryClient = useQueryClient()
  const workspaceStore = useEditorWorkspaceStoreApi()
  const { setTheme } = useTheme()
  const requestEditorFocus = useFocus((state) => state.requestEditorFocus)
  const dispatchEditorCommand = useFocus((state) => state.dispatchEditorCommand)
  const setFocusArea = useFocus((state) => state.setFocusArea)
  const { closeTab, reopenClosedEditor, selectPreviousEditor, splitTab } = useEditorCommands()
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
        activeTabId: activeEditorPaneTab(workspace.editorPaneLayout)?.id ?? null,
        diffViewMode: workspace.diffViewMode,
        documentStore,
        gitPanelOpen: workspace.gitPanelOpen,
        openPicker: workspace.openPicker,
        queryClient,
        reopenClosedEditor,
        requestCloseTab: resolvedRequestCloseTab,
        requestEditorFocus,
        selectedFilePath: workspace.selectedFilePath,
        setDiffViewMode: workspace.setDiffViewMode,
        setFocusArea,
        setGitPanelOpen: workspace.setGitPanelOpen,
        setSidebarVisible: workspace.setSidebarVisible,
        setTheme,
        setWorkspacePanelTab: workspace.setWorkspacePanelTab,
        showCommandPalette,
        sidebarVisible: workspace.sidebarVisible,
        selectPreviousEditor,
        splitTab,
      })
    },
    [
      documentStore,
      dispatchEditorCommand,
      queryClient,
      reopenClosedEditor,
      resolvedRequestCloseTab,
      requestEditorFocus,
      setFocusArea,
      setTheme,
      showCommandPalette,
      selectPreviousEditor,
      splitTab,
      workspaceStore,
    ],
  )
}

function dispatchWorkspaceCommand(command: WorkspaceCommandId, context: WorkspaceCommandContext) {
  const handler = workspaceCommandHandlers[command]
  const handled = handler(context) ?? true

  log.info({
    action: 'workspace.command',
    area: 'command',
    command,
    handled,
  })
  return handled
}

const workspaceCommandHandlers: Record<WorkspaceCommandId, WorkspaceCommandHandler> = {
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
  'workspace.focusFileTree': ({ setFocusArea, setSidebarVisible, setWorkspacePanelTab }) => {
    setSidebarVisible(true)
    setWorkspacePanelTab('files')
    setFocusArea('file-tree')
    return true
  },
  'workspace.focusGit': ({ setFocusArea, setSidebarVisible, setWorkspacePanelTab }) => {
    setSidebarVisible(true)
    setWorkspacePanelTab('git')
    setFocusArea('git')
    return true
  },
  'workspace.gotoSymbol': ({ selectedFilePath, showCommandPalette }) => {
    if (!fileBackedEditorPath(selectedFilePath)) return false

    showCommandPalette('@')
    return true
  },
  'workspace.openFilePicker': ({ openPicker }) => {
    openPicker()
    return true
  },
  'workspace.quickOpenPreviousEditor': ({ requestEditorFocus, selectPreviousEditor }) => {
    const selected = selectPreviousEditor()
    if (!selected) return false

    requestEditorFocus()
    return true
  },
  'workspace.quickOpenView': ({ showCommandPalette }) => {
    showCommandPalette('view ')
    return true
  },
  'workspace.reopenClosedEditor': ({ reopenClosedEditor }) => reopenClosedEditor(),
  'workspace.revertFile': ({ documentStore, queryClient, selectedFilePath }) =>
    runFileLifecycle(selectedFilePath, () =>
      revertSelectedEditorDocument(documentStore, queryClient, selectedFilePath),
    ),
  'workspace.saveAllFiles': ({ documentStore, queryClient }) => {
    void saveAllEditorDocuments(documentStore, queryClient).catch(reportCommandError)
    return true
  },
  'workspace.saveFile': ({ documentStore, queryClient, selectedFilePath }) =>
    runFileLifecycle(selectedFilePath, () =>
      saveSelectedEditorDocument(documentStore, queryClient, selectedFilePath),
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
  'workspace.selectColorMode': ({ showCommandPalette }) => {
    showCommandPalette('color ')
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
  'workspace.splitEditor': ({ activeTabId, requestEditorFocus, splitTab }) => {
    if (!activeTabId) return false
    if (!splitTab(activeTabId, 'horizontal')) return false

    requestEditorFocus()
    return true
  },
  'workspace.toggleDiffViewMode': ({ diffViewMode, setDiffViewMode }) => {
    setDiffViewMode(nextEditorDiffViewMode(diffViewMode))
    return true
  },
  'workspace.togglePanel': ({
    gitPanelOpen,
    setFocusArea,
    setGitPanelOpen,
    setSidebarVisible,
    setWorkspacePanelTab,
  }) => {
    setSidebarVisible(true)
    setWorkspacePanelTab('git')
    setGitPanelOpen(!gitPanelOpen)
    setFocusArea('git')
    return true
  },
  'workspace.toggleSidebarVisibility': ({ setSidebarVisible, sidebarVisible }) => {
    setSidebarVisible(!sidebarVisible)
    return true
  },
}

function closeSelectedTab(activeTabId: string | null, requestCloseTab: RequestCloseTab) {
  if (!activeTabId) return false

  requestCloseTab(activeTabId)
  return true
}

function runFileLifecycle(selectedFilePath: string | null, operation: () => Promise<boolean>) {
  if (!fileBackedEditorPath(selectedFilePath)) return false

  void operation().catch(reportCommandError)
  return true
}

async function revertSelectedEditorDocument(
  documentStore: EditorDocumentStoreApi,
  queryClient: QueryClient,
  selectedFilePath: string | null,
) {
  const path = fileBackedEditorPath(selectedFilePath)
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
  if (isEditorPlatformCommandId(command)) return null

  return command
}

function noop() {}
