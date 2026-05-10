import { useCallback } from "react"

import {
  useWorkspaceFocus,
  type WorkspaceFocusArea,
} from "@/components/workspace/workspace-focus-state"
import { useEditorCommands } from "@/features/editor/state/editor-commands"
import { useEditorWorkspaceState } from "@/features/editor/state/editor-workspace-state"
import {
  nextEditorDiffViewMode,
  type EditorDiffViewMode,
} from "@/features/editor/utils/diff-view-mode"
import type { WorkspacePanelTab } from "@/lib/workspace-cache"

import { isEditorPlatformCommandId } from "./editor-keymap"
import type { PlatformCommandId, WorkspaceCommandId } from "./types"
import type { PlatformCommandDispatch } from "./use-app-keymap"

type WorkspaceCommandContext = {
  readonly closeTab: (path: string) => void
  readonly diffViewMode: EditorDiffViewMode
  readonly openPicker: () => void
  readonly requestEditorFocus: () => void
  readonly selectedFilePath: string | null
  readonly setDiffViewMode: (mode: EditorDiffViewMode) => void
  readonly setFocusArea: (area: WorkspaceFocusArea) => void
  readonly setWorkspacePanelTab: (tab: WorkspacePanelTab) => void
}

type WorkspaceCommandHandler = (
  context: WorkspaceCommandContext
) => boolean | void

export function usePlatformCommandDispatch(): PlatformCommandDispatch {
  const diffViewMode = useEditorWorkspaceState((state) => state.diffViewMode)
  const openPicker = useEditorWorkspaceState((state) => state.openPicker)
  const selectedFilePath = useEditorWorkspaceState(
    (state) => state.selectedFilePath
  )
  const setDiffViewMode = useEditorWorkspaceState(
    (state) => state.setDiffViewMode
  )
  const setWorkspacePanelTab = useEditorWorkspaceState(
    (state) => state.setWorkspacePanelTab
  )
  const requestEditorFocus = useWorkspaceFocus(
    (state) => state.requestEditorFocus
  )
  const setFocusArea = useWorkspaceFocus((state) => state.setFocusArea)
  const { closeTab } = useEditorCommands()

  return useCallback(
    (command: PlatformCommandId) => {
      if (isEditorPlatformCommandId(command)) return false

      return dispatchWorkspaceCommand(command, {
        closeTab,
        diffViewMode,
        openPicker,
        requestEditorFocus,
        selectedFilePath,
        setDiffViewMode,
        setFocusArea,
        setWorkspacePanelTab,
      })
    },
    [
      closeTab,
      diffViewMode,
      openPicker,
      requestEditorFocus,
      selectedFilePath,
      setDiffViewMode,
      setFocusArea,
      setWorkspacePanelTab,
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
  "workspace.closeCurrentTab": ({ closeTab, selectedFilePath }) =>
    closeSelectedTab(selectedFilePath, closeTab),
  "workspace.focusEditor": ({ requestEditorFocus }) => {
    requestEditorFocus()
    return true
  },
  "workspace.focusFileTree": ({ setFocusArea, setWorkspacePanelTab }) => {
    setWorkspacePanelTab("files")
    setFocusArea("file-tree")
    return true
  },
  "workspace.focusGit": ({ setFocusArea, setWorkspacePanelTab }) => {
    setWorkspacePanelTab("git")
    setFocusArea("git")
    return true
  },
  "workspace.openFilePicker": ({ openPicker }) => {
    openPicker()
    return true
  },
  "workspace.toggleDiffViewMode": ({ diffViewMode, setDiffViewMode }) => {
    setDiffViewMode(nextEditorDiffViewMode(diffViewMode))
    return true
  },
}

function closeSelectedTab(
  selectedFilePath: string | null,
  closeTab: (path: string) => void
) {
  if (!selectedFilePath) return false

  closeTab(selectedFilePath)
  return true
}
