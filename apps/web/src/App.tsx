import { EmptyWorkspace } from "@/components/empty-workspace"
import { useEditorCommands } from "@/components/editor/state/editor-commands"
import { useEditorWorkspaceState } from "@/components/editor/state/editor-workspace-state"
import { EditorStateProvider } from "@/components/editor/editor-state-provider"
import {
  FilePickerDialog,
  type PickedFsEntry,
} from "@/components/file-picker-dialog"
import { WorkspaceFocusProvider } from "@/components/workspace/workspace-focus-provider"
import { useWorkspaceFocus } from "@/components/workspace/workspace-focus-state"
import { useOpenTabCache } from "@/hooks/use-open-tab-cache"
import { WorkspaceView } from "@/components/workspace/workspace-view"
import { useSelectedFile } from "@/hooks/use-selected-file"
import { useWorkspaceEvents } from "@/hooks/use-workspace-events"
import { useWorkspaceTree } from "@/hooks/use-workspace-tree"
import { writeWorkspaceCache } from "@/lib/workspace-cache"
import { useEffect } from "react"

export function App() {
  return (
    <EditorStateProvider>
      <WorkspaceFocusProvider>
        <AppContent />
      </WorkspaceFocusProvider>
    </EditorStateProvider>
  )
}

function AppContent() {
  const setFocusArea = useWorkspaceFocus((state) => state.setFocusArea)
  const pickerOpen = useEditorWorkspaceState((state) => state.pickerOpen)
  const rootFolder = useEditorWorkspaceState((state) => state.rootFolder)
  const selectedFilePath = useEditorWorkspaceState(
    (state) => state.selectedFilePath
  )
  const diffViewMode = useEditorWorkspaceState((state) => state.diffViewMode)
  const openFilePaths = useEditorWorkspaceState(
    (state) => state.openFilePaths
  )
  const workspacePanelTab = useEditorWorkspaceState(
    (state) => state.workspacePanelTab
  )
  const openPicker = useEditorWorkspaceState((state) => state.openPicker)
  const setPickerOpen = useEditorWorkspaceState((state) => state.setPickerOpen)
  const { pickRootFolder } = useEditorCommands()
  const { loadTreeDirectory, resetTreeLoad, treeState } =
    useWorkspaceTree(rootFolder)
  const { fileState, resetFileLoad } = useSelectedFile(selectedFilePath)
  useOpenTabCache()
  useWorkspaceEvents(rootFolder)

  useEffect(() => {
    writeWorkspaceCache({
      openFilePaths,
      diffViewMode,
      rootFolder,
      selectedFilePath,
      workspacePanelTab,
    })
  }, [
    diffViewMode,
    openFilePaths,
    rootFolder,
    selectedFilePath,
    workspacePanelTab,
  ])

  function handlePick(entry: PickedFsEntry) {
    resetFileLoad()
    resetTreeLoad()
    pickRootFolder(entry)
  }

  return (
    <main
      className="h-svh overflow-hidden bg-background text-foreground"
      onFocusCapture={() => setFocusArea("global")}
      onPointerDownCapture={() => setFocusArea("global")}
    >
      <div className="flex h-full min-h-0 flex-col">
        {rootFolder ? (
          <WorkspaceView
            fileState={fileState}
            rootFolder={rootFolder}
            treeState={treeState}
            onLoadDirectory={loadTreeDirectory}
          />
        ) : (
          <EmptyWorkspace onChooseFolder={openPicker} />
        )}
      </div>

      {pickerOpen && (
        <FilePickerDialog
          mode="folder"
          onOpenChange={setPickerOpen}
          onPick={handlePick}
          open={pickerOpen}
          value={rootFolder}
        />
      )}
    </main>
  )
}
