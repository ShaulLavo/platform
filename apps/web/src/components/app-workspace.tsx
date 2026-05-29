import { AppCommandSurface } from '@/components/app-command-surface'
import { EmptyWorkspace } from '@/components/empty-workspace'
import { FilePickerDialog } from '@/components/file-picker-dialog'
import { OpenTabLiveDocumentController } from '@/components/open-tab-live-document-controller'
import { WorkspaceView } from '@/components/workspace/workspace-view'
import type { RequestCloseTab, RequestCloseTabs } from '@/features/editor/hooks/use-dirty-tab-close'
import { useEditorCommands } from '@/features/editor/state/editor-commands'
import { useEditorWorkspaceState } from '@/features/editor/state/editor-workspace-state'
import { useWorkspaceEvents } from '@/hooks/use-workspace-events'
import { useWorkspaceTree } from '@/hooks/use-workspace-tree'
import { log } from '@/lib/client-logging'
import type { PickedFsEntry } from '@/lib/file-system-types'
import type { PlatformKeyBinding } from '@/keymap'
import type { EditorKeymapLayer } from '@editor/core'
import { useCallback } from 'react'

type AppWorkspaceProps = {
  editorKeymapLayers: readonly EditorKeymapLayer[]
  keymapBindings: readonly PlatformKeyBinding[]
  onRequestCloseTab: RequestCloseTab
  onRequestCloseTabs: RequestCloseTabs
}

export function AppWorkspace({
  editorKeymapLayers,
  keymapBindings,
  onRequestCloseTab,
  onRequestCloseTabs,
}: AppWorkspaceProps) {
  const pickerOpen = useEditorWorkspaceState((state) => state.pickerOpen)
  const rootFolder = useEditorWorkspaceState((state) => state.rootFolder)
  const openPicker = useEditorWorkspaceState((state) => state.openPicker)
  const setPickerOpen = useEditorWorkspaceState((state) => state.setPickerOpen)
  const { pickRootFolder } = useEditorCommands()
  const { loadTreeDirectory, prefetchTreeDirectory, resetTreeLoad, treeState } =
    useWorkspaceTree(rootFolder)

  useWorkspaceEvents(rootFolder)

  const handlePick = useCallback(
    (entry: PickedFsEntry) => {
      resetTreeLoad()
      pickRootFolder(entry)
      log.info({
        action: 'workspace.root_selected',
        area: 'workspace',
        entryType: entry.type,
        path: entry.path,
      })
    },
    [pickRootFolder, resetTreeLoad],
  )

  return (
    <>
      <OpenTabLiveDocumentController />
      <AppCommandSurface
        bindings={keymapBindings}
        requestCloseTab={onRequestCloseTab}
        treeState={treeState}
      />
      <div className='flex h-full min-h-0 flex-col'>
        {rootFolder ? (
          <WorkspaceView
            editorKeymapLayers={editorKeymapLayers}
            rootFolder={rootFolder}
            treeState={treeState}
            onLoadDirectory={loadTreeDirectory}
            onPrefetchDirectory={prefetchTreeDirectory}
            onRequestCloseTab={onRequestCloseTab}
            onRequestCloseTabs={onRequestCloseTabs}
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
    </>
  )
}
