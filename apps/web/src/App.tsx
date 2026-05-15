import { EmptyWorkspace } from "@/components/empty-workspace"
import { CommandPalette } from "@/components/command-palette"
import { useDirtyTabCloseRequest } from "@/features/editor/hooks/use-dirty-tab-close"
import { useEditorCommands } from "@/features/editor/state/editor-commands"
import { useEditorWorkspaceState } from "@/features/editor/state/editor-workspace-state"
import { EditorStateProvider } from "@/features/editor/editor-state-provider"
import {
  cachedSearchBufferState,
  useSearchBufferState,
} from "@/features/search/search-buffer-state"
import { FilePickerDialog } from "@/components/file-picker-dialog"
import { WorkspaceFocusProvider } from "@/components/workspace/workspace-focus-provider"
import { useWorkspaceFocus } from "@/components/workspace/workspace-focus-state"
import { useOpenTabCache } from "@/hooks/use-open-tab-cache"
import { WorkspaceView } from "@/components/workspace/workspace-view"
import { useSelectedFile } from "@/hooks/use-selected-file"
import { useWorkspaceEvents } from "@/hooks/use-workspace-events"
import { useWorkspaceTree } from "@/hooks/use-workspace-tree"
import {
  defaultPlatformKeyBindings,
  editorKeymapLayersFromPlatform,
  useAppKeymap,
  usePlatformCommandDispatch,
} from "@/keymap"
import type { PickedFsEntry } from "@/lib/file-system-types"
import { writeWorkspaceCache } from "@/lib/workspace-cache"
import { HotkeysProvider } from "@tanstack/react-hotkeys"
import { useCallback, useEffect, useMemo, useState } from "react"

export function App() {
  return (
    <EditorStateProvider>
      <WorkspaceFocusProvider>
        <HotkeysProvider>
          <AppContent />
        </HotkeysProvider>
      </WorkspaceFocusProvider>
    </EditorStateProvider>
  )
}

function AppContent() {
  const activeArea = useWorkspaceFocus((state) => state.activeArea)
  const setFocusArea = useWorkspaceFocus((state) => state.setFocusArea)
  const pickerOpen = useEditorWorkspaceState((state) => state.pickerOpen)
  const rootFolder = useEditorWorkspaceState((state) => state.rootFolder)
  const selectedFilePath = useEditorWorkspaceState(
    (state) => state.selectedFilePath
  )
  const diffViewMode = useEditorWorkspaceState((state) => state.diffViewMode)
  const editorHistory = useEditorWorkspaceState((state) => state.editorHistory)
  const gitPanelOpen = useEditorWorkspaceState((state) => state.gitPanelOpen)
  const openFilePaths = useEditorWorkspaceState((state) => state.openFilePaths)
  const recentlyClosedEditorPaths = useEditorWorkspaceState(
    (state) => state.recentlyClosedEditorPaths
  )
  const sidebarVisible = useEditorWorkspaceState(
    (state) => state.sidebarVisible
  )
  const workspacePanelTab = useEditorWorkspaceState(
    (state) => state.workspacePanelTab
  )
  const activeSearchBuffer = useSearchBufferState((state) => state.active)
  const openPicker = useEditorWorkspaceState((state) => state.openPicker)
  const setPickerOpen = useEditorWorkspaceState((state) => state.setPickerOpen)
  const { pickRootFolder } = useEditorCommands()
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [commandPaletteSearch, setCommandPaletteSearch] = useState("")
  const { loadTreeDirectory, resetTreeLoad, treeState } = useWorkspaceTree(
    rootFolder,
    selectedFilePath
  )
  const { fileState, resetFileLoad } = useSelectedFile(selectedFilePath)
  const { dirtyTabCloseDialog, requestCloseTab, requestCloseTabs } =
    useDirtyTabCloseRequest()
  const keymapBindings = useMemo(() => defaultPlatformKeyBindings(), [])
  const searchBuffer = useMemo(
    () => cachedSearchBufferState(activeSearchBuffer),
    [activeSearchBuffer]
  )
  const editorKeymapLayers = useMemo(
    () => editorKeymapLayersFromPlatform(keymapBindings),
    [keymapBindings]
  )
  const showCommandPalette = useCallback((initialSearch = "") => {
    setCommandPaletteSearch(initialSearch)
    setCommandPaletteOpen(true)
  }, [])
  const dispatchKeymapCommand = usePlatformCommandDispatch({
    requestCloseTab,
    showCommandPalette,
  })
  useAppKeymap({
    bindings: keymapBindings,
    dispatch: dispatchKeymapCommand,
    focusedPane: activeArea,
  })
  useOpenTabCache()
  useWorkspaceEvents(rootFolder)

  useEffect(() => {
    writeWorkspaceCache({
      openFilePaths,
      diffViewMode,
      editorHistory,
      gitPanelOpen,
      recentlyClosedEditorPaths,
      rootFolder,
      searchBuffer,
      selectedFilePath,
      sidebarVisible,
      workspacePanelTab,
    })
  }, [
    diffViewMode,
    editorHistory,
    gitPanelOpen,
    openFilePaths,
    recentlyClosedEditorPaths,
    rootFolder,
    searchBuffer,
    selectedFilePath,
    sidebarVisible,
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
            editorKeymapLayers={editorKeymapLayers}
            fileState={fileState}
            rootFolder={rootFolder}
            treeState={treeState}
            onLoadDirectory={loadTreeDirectory}
            onRequestCloseTab={requestCloseTab}
            onRequestCloseTabs={requestCloseTabs}
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
      <CommandPalette
        bindings={keymapBindings}
        dispatch={dispatchKeymapCommand}
        onOpenChange={setCommandPaletteOpen}
        onSearchChange={setCommandPaletteSearch}
        open={commandPaletteOpen}
        search={commandPaletteSearch}
        treeState={treeState}
      />
      {dirtyTabCloseDialog}
    </main>
  )
}
