import { EmptyWorkspace } from "@/components/empty-workspace"
import { useEditorState } from "@/components/editor/editor-state"
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
  const pickerOpen = useEditorState((state) => state.pickerOpen)
  const rootFolder = useEditorState((state) => state.rootFolder)
  const selectedFilePath = useEditorState((state) => state.selectedFilePath)
  const openFilePaths = useEditorState((state) => state.openFilePaths)
  const workspacePanelTab = useEditorState((state) => state.workspacePanelTab)
  const openPicker = useEditorState((state) => state.openPicker)
  const pickRootFolder = useEditorState((state) => state.pickRootFolder)
  const setPickerOpen = useEditorState((state) => state.setPickerOpen)
  const { loadTreeDirectory, resetTreeLoad, treeState } =
    useWorkspaceTree(rootFolder)
  const { fileState, resetFileLoad } = useSelectedFile(selectedFilePath)
  useOpenTabCache()
  useWorkspaceEvents(rootFolder)

  useEffect(() => {
    writeWorkspaceCache({
      openFilePaths,
      rootFolder,
      selectedFilePath,
      workspacePanelTab,
    })
  }, [openFilePaths, rootFolder, selectedFilePath, workspacePanelTab])

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
