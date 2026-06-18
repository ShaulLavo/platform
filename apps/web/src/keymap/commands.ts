import { useCallback } from 'react'

import { useFocus, type FocusArea } from '@/components/workspace/focus/providers/focus-state'
import { useTheme, type Theme } from '@/components/theme-context'
import type { RequestCloseTab } from '@/features/editor/hooks/use-dirty-tab-close'
import { useEditorCommands } from '@/features/editor/state/editor-commands'
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
import { fetchFile } from '@/lib/file-server'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'

import { editorCommandIdFromPlatform } from './editor-keymap'
import type { PlatformCommandId, WorkspaceCommandId } from './types'
import type { PlatformCommandDispatch } from './use-app-keymap'

type WorkspaceCommandContext = {
  readonly activeFilePath: string | null
  readonly activeTabId: string | null
  readonly diffViewMode: EditorDiffViewMode
  readonly documentStore: EditorDocumentStoreApi
  readonly openPicker: () => void
  readonly openSearchEditor: (rootPath: string) => void
  readonly queryClient: QueryClient
  readonly reopenClosedEditor: () => boolean
  readonly requestCloseTab: RequestCloseTab
  readonly requestEditorFocus: () => void
  readonly rootPath: string | null
  readonly setDiffViewMode: (mode: EditorDiffViewMode) => void
  readonly setFocusArea: (area: FocusArea) => void
  readonly setTheme: (theme: Theme) => void
  readonly setWorkbenchPanels: (panels: WorkbenchPanels) => void
  readonly showCommandPalette: (initialSearch?: string) => void
  readonly selectPreviousEditor: () => boolean
  readonly workbenchPanels: WorkbenchPanels
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
  const { closeTab, openSearchEditor, reopenClosedEditor, selectPreviousEditor } =
    useEditorCommands()
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
        diffViewMode: workspace.diffViewMode,
        documentStore,
        openPicker: workspace.openPicker,
        openSearchEditor,
        queryClient,
        reopenClosedEditor,
        requestCloseTab: resolvedRequestCloseTab,
        requestEditorFocus,
        rootPath: workspace.rootFolder?.path ?? null,
        setDiffViewMode: workspace.setDiffViewMode,
        setFocusArea,
        setTheme,
        setWorkbenchPanels: workspace.setWorkbenchPanels,
        showCommandPalette,
        selectPreviousEditor,
        workbenchPanels: workspace.workbenchPanels,
      })
    },
    [
      documentStore,
      dispatchEditorCommand,
      queryClient,
      openSearchEditor,
      reopenClosedEditor,
      requestEditorFocus,
      resolvedRequestCloseTab,
      selectPreviousEditor,
      setFocusArea,
      setTheme,
      showCommandPalette,
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

const workspaceCommandHandlers: Partial<Record<WorkspaceCommandId, WorkspaceCommandHandler>> = {
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
  'workspace.toggleDiffViewMode': ({ diffViewMode, setDiffViewMode }) => {
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
