import { EmptyWorkspace } from '@/components/empty-workspace'
import { CommandPalette } from '@/components/command-palette'
import { useDirtyTabCloseRequest } from '@/features/editor/hooks/use-dirty-tab-close'
import { useEditorCommands } from '@/features/editor/state/editor-commands'
import { useEditorWorkspaceState } from '@/features/editor/state/editor-workspace-state'
import { EditorStateProvider } from '@/features/editor/editor-state-provider'
import { FilePickerDialog } from '@/components/file-picker-dialog'
import { WorkspaceFocusProvider } from '@/components/workspace/workspace-focus-provider'
import { useWorkspaceFocus } from '@/components/workspace/workspace-focus-state'
import { useOpenTabCache } from '@/hooks/use-open-tab-cache'
import { useWorkspaceCachePersistence } from '@/hooks/use-workspace-cache-persistence'
import { WorkspaceView } from '@/components/workspace/workspace-view'
import { useWorkspaceEvents } from '@/hooks/use-workspace-events'
import { useWorkspaceTree } from '@/hooks/use-workspace-tree'
import {
  defaultPlatformKeyBindings,
  editorKeymapLayersFromPlatform,
  useAppKeymap,
  usePlatformCommandDispatch,
} from '@/keymap'
import type { PickedFsEntry } from '@/lib/file-system-types'
import { logClientEvent } from '@/lib/client-logging'
import { HotkeysProvider } from '@tanstack/react-hotkeys'
import { useCallback, useMemo, useState } from 'react'

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
  const selectedFilePath = useEditorWorkspaceState((state) => state.selectedFilePath)
  const openPicker = useEditorWorkspaceState((state) => state.openPicker)
  const setPickerOpen = useEditorWorkspaceState((state) => state.setPickerOpen)
  const { pickRootFolder } = useEditorCommands()
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [commandPaletteSearch, setCommandPaletteSearch] = useState('')
  const { loadTreeDirectory, prefetchTreeDirectory, resetTreeLoad, treeState } = useWorkspaceTree(
    rootFolder,
    selectedFilePath,
  )
  const { dirtyTabCloseDialog, requestCloseTab, requestCloseTabs } = useDirtyTabCloseRequest()
  const keymapBindings = useMemo(() => defaultPlatformKeyBindings(), [])
  const editorKeymapLayers = useMemo(
    () => editorKeymapLayersFromPlatform(keymapBindings),
    [keymapBindings],
  )
  const showCommandPalette = useCallback((initialSearch = '') => {
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
  useWorkspaceCachePersistence()
  useWorkspaceEvents(rootFolder)

  function handlePick(entry: PickedFsEntry) {
    resetTreeLoad()
    pickRootFolder(entry)
    logClientEvent({
      action: 'workspace.root_selected',
      area: 'workspace',
      entryType: entry.type,
      path: entry.path,
    })
  }

  return (
    <main
      className='bg-background text-foreground h-svh overflow-hidden'
      onFocusCapture={() => setFocusArea('global')}
      onPointerDownCapture={() => setFocusArea('global')}
    >
      <div className='flex h-full min-h-0 flex-col'>
        {rootFolder ? (
          <WorkspaceView
            editorKeymapLayers={editorKeymapLayers}
            rootFolder={rootFolder}
            treeState={treeState}
            onLoadDirectory={loadTreeDirectory}
            onPrefetchDirectory={prefetchTreeDirectory}
            onRequestCloseTab={requestCloseTab}
            onRequestCloseTabs={requestCloseTabs}
          />
        ) : (
          <EmptyWorkspace onChooseFolder={openPicker} />
        )}
      </div>

      {pickerOpen && (
        <FilePickerDialog
          mode='folder'
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
