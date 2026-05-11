import { useCallback } from "react"

import {
  useWorkspaceFocus,
  type WorkspaceFocusArea,
} from "@/components/workspace/workspace-focus-state"
import type { RequestCloseTab } from "@/features/editor/hooks/use-dirty-tab-close"
import { useEditorCommands } from "@/features/editor/state/editor-commands"
import {
  useEditorDocumentStoreApi,
  type EditorDocumentStoreApi,
} from "@/features/editor/state/editor-document-state"
import {
  fileBackedEditorPath,
  saveAllEditorDocuments,
  saveSelectedEditorDocument,
} from "@/features/editor/editor-save"
import { useEditorWorkspaceState } from "@/features/editor/state/editor-workspace-state"
import {
  nextEditorDiffViewMode,
  type EditorDiffViewMode,
} from "@/features/editor/utils/diff-view-mode"
import { reportError, toClientError } from "@/lib/client-error-taxonomy"
import { fetchFile } from "@/lib/file-server"
import { fileSystemKeys } from "@/lib/query-keys"
import type { WorkspacePanelTab } from "@/lib/workspace-cache"
import { useQueryClient, type QueryClient } from "@tanstack/react-query"

import {
  editorCommandIdFromPlatform,
  isEditorPlatformCommandId,
} from "./editor-keymap"
import type { PlatformCommandId, WorkspaceCommandId } from "./types"
import type { PlatformCommandDispatch } from "./use-app-keymap"

type WorkspaceCommandContext = {
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
  readonly setFocusArea: (area: WorkspaceFocusArea) => void
  readonly setGitPanelOpen: (open: boolean) => void
  readonly setSidebarVisible: (visible: boolean) => void
  readonly setWorkspacePanelTab: (tab: WorkspacePanelTab) => void
  readonly showCommandPalette: (initialSearch?: string) => void
  readonly sidebarVisible: boolean
  readonly selectPreviousEditor: () => boolean
}

type WorkspaceCommandHandler = (
  context: WorkspaceCommandContext
) => boolean | void

export function usePlatformCommandDispatch({
  requestCloseTab,
  showCommandPalette = noop,
}: {
  readonly requestCloseTab?: RequestCloseTab
  readonly showCommandPalette?: (initialSearch?: string) => void
} = {}): PlatformCommandDispatch {
  const documentStore = useEditorDocumentStoreApi()
  const queryClient = useQueryClient()
  const diffViewMode = useEditorWorkspaceState((state) => state.diffViewMode)
  const gitPanelOpen = useEditorWorkspaceState((state) => state.gitPanelOpen)
  const openPicker = useEditorWorkspaceState((state) => state.openPicker)
  const selectedFilePath = useEditorWorkspaceState(
    (state) => state.selectedFilePath
  )
  const sidebarVisible = useEditorWorkspaceState(
    (state) => state.sidebarVisible
  )
  const setDiffViewMode = useEditorWorkspaceState(
    (state) => state.setDiffViewMode
  )
  const setGitPanelOpen = useEditorWorkspaceState(
    (state) => state.setGitPanelOpen
  )
  const setSidebarVisible = useEditorWorkspaceState(
    (state) => state.setSidebarVisible
  )
  const setWorkspacePanelTab = useEditorWorkspaceState(
    (state) => state.setWorkspacePanelTab
  )
  const requestEditorFocus = useWorkspaceFocus(
    (state) => state.requestEditorFocus
  )
  const dispatchEditorCommand = useWorkspaceFocus(
    (state) => state.dispatchEditorCommand
  )
  const setFocusArea = useWorkspaceFocus((state) => state.setFocusArea)
  const { closeTab, reopenClosedEditor, selectPreviousEditor } =
    useEditorCommands()
  const fallbackRequestCloseTab = useCallback<RequestCloseTab>(
    (path) => {
      closeTab(path)
      return true
    },
    [closeTab]
  )
  const resolvedRequestCloseTab = requestCloseTab ?? fallbackRequestCloseTab

  return useCallback(
    (command: PlatformCommandId, event?: KeyboardEvent) => {
      const editorCommand = editorCommandIdFromPlatform(command)
      if (editorCommand) return dispatchEditorCommand(editorCommand, { event })
      const workspaceCommand = workspaceCommandIdFromPlatform(command)
      if (!workspaceCommand) return false

      return dispatchWorkspaceCommand(workspaceCommand, {
        diffViewMode,
        documentStore,
        gitPanelOpen,
        openPicker,
        queryClient,
        reopenClosedEditor,
        requestCloseTab: resolvedRequestCloseTab,
        requestEditorFocus,
        selectedFilePath,
        setDiffViewMode,
        setFocusArea,
        setGitPanelOpen,
        setSidebarVisible,
        setWorkspacePanelTab,
        showCommandPalette,
        sidebarVisible,
        selectPreviousEditor,
      })
    },
    [
      diffViewMode,
      documentStore,
      dispatchEditorCommand,
      gitPanelOpen,
      openPicker,
      queryClient,
      reopenClosedEditor,
      resolvedRequestCloseTab,
      requestEditorFocus,
      selectedFilePath,
      setDiffViewMode,
      setFocusArea,
      setGitPanelOpen,
      setSidebarVisible,
      setWorkspacePanelTab,
      showCommandPalette,
      sidebarVisible,
      selectPreviousEditor,
    ]
  )
}

function dispatchWorkspaceCommand(
  command: WorkspaceCommandId,
  context: WorkspaceCommandContext
) {
  const handler = workspaceCommandHandlers[command]
  return handler(context) ?? true
}

const workspaceCommandHandlers: Record<
  WorkspaceCommandId,
  WorkspaceCommandHandler
> = {
  "workspace.closeCurrentTab": ({ requestCloseTab, selectedFilePath }) =>
    closeSelectedTab(selectedFilePath, requestCloseTab),
  "workspace.focusEditor": ({ requestEditorFocus }) => {
    requestEditorFocus()
    return true
  },
  "workspace.focusFirstEditorGroup": ({ requestEditorFocus }) => {
    requestEditorFocus()
    return true
  },
  "workspace.focusSecondEditorGroup": ({ requestEditorFocus }) => {
    requestEditorFocus()
    return true
  },
  "workspace.focusThirdEditorGroup": ({ requestEditorFocus }) => {
    requestEditorFocus()
    return true
  },
  "workspace.focusFileTree": ({
    setFocusArea,
    setSidebarVisible,
    setWorkspacePanelTab,
  }) => {
    setSidebarVisible(true)
    setWorkspacePanelTab("files")
    setFocusArea("file-tree")
    return true
  },
  "workspace.focusGit": ({
    setFocusArea,
    setSidebarVisible,
    setWorkspacePanelTab,
  }) => {
    setSidebarVisible(true)
    setWorkspacePanelTab("git")
    setFocusArea("git")
    return true
  },
  "workspace.gotoSymbol": ({ selectedFilePath, showCommandPalette }) => {
    if (!fileBackedEditorPath(selectedFilePath)) return false

    showCommandPalette("@")
    return true
  },
  "workspace.openFilePicker": ({ openPicker }) => {
    openPicker()
    return true
  },
  "workspace.quickOpenPreviousEditor": ({
    requestEditorFocus,
    selectPreviousEditor,
  }) => {
    const selected = selectPreviousEditor()
    if (!selected) return false

    requestEditorFocus()
    return true
  },
  "workspace.quickOpenView": ({ showCommandPalette }) => {
    showCommandPalette("view ")
    return true
  },
  "workspace.reopenClosedEditor": ({ reopenClosedEditor }) =>
    reopenClosedEditor(),
  "workspace.revertFile": ({ documentStore, queryClient, selectedFilePath }) =>
    runFileLifecycle(selectedFilePath, () =>
      revertSelectedEditorDocument(documentStore, queryClient, selectedFilePath)
    ),
  "workspace.saveAllFiles": ({ documentStore, queryClient }) => {
    void saveAllEditorDocuments(documentStore, queryClient).catch(
      reportCommandError
    )
    return true
  },
  "workspace.saveFile": ({ documentStore, queryClient, selectedFilePath }) =>
    runFileLifecycle(selectedFilePath, () =>
      saveSelectedEditorDocument(documentStore, queryClient, selectedFilePath)
    ),
  "workspace.showAllEditors": ({ showCommandPalette }) => {
    showCommandPalette("edt ")
    return true
  },
  "workspace.showCommandPalette": ({ showCommandPalette }) => {
    showCommandPalette(">")
    return true
  },
  "workspace.showQuickAccess": ({ showCommandPalette }) => {
    showCommandPalette("")
    return true
  },
  "workspace.splitEditor": ({ requestEditorFocus }) => {
    requestEditorFocus()
    return true
  },
  "workspace.toggleDiffViewMode": ({ diffViewMode, setDiffViewMode }) => {
    setDiffViewMode(nextEditorDiffViewMode(diffViewMode))
    return true
  },
  "workspace.togglePanel": ({
    gitPanelOpen,
    setFocusArea,
    setGitPanelOpen,
    setSidebarVisible,
    setWorkspacePanelTab,
  }) => {
    setSidebarVisible(true)
    setWorkspacePanelTab("git")
    setGitPanelOpen(!gitPanelOpen)
    setFocusArea("git")
    return true
  },
  "workspace.toggleSidebarVisibility": ({
    setSidebarVisible,
    sidebarVisible,
  }) => {
    setSidebarVisible(!sidebarVisible)
    return true
  },
}

function closeSelectedTab(
  selectedFilePath: string | null,
  requestCloseTab: RequestCloseTab
) {
  if (!selectedFilePath) return false

  requestCloseTab(selectedFilePath)
  return true
}

function runFileLifecycle(
  selectedFilePath: string | null,
  operation: () => Promise<boolean>
) {
  if (!fileBackedEditorPath(selectedFilePath)) return false

  void operation().catch(reportCommandError)
  return true
}

async function revertSelectedEditorDocument(
  documentStore: EditorDocumentStoreApi,
  queryClient: QueryClient,
  selectedFilePath: string | null
) {
  const path = fileBackedEditorPath(selectedFilePath)
  if (!path) return false

  const file = await fetchFile(path, new AbortController().signal)
  queryClient.setQueryData(fileSystemKeys.file(path), file)
  documentStore.getState().forceReplaceCachedEditorDocument(file, path)
  return true
}

function reportCommandError(error: unknown) {
  reportError(toClientError(error))
}

function workspaceCommandIdFromPlatform(
  command: PlatformCommandId
): WorkspaceCommandId | null {
  if (isEditorPlatformCommandId(command)) return null

  return command
}

function noop() {}
