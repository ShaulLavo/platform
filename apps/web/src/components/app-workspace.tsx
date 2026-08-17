import { AppCommandSurface } from '@/components/app-command-surface'
import { EmptyWorkspace } from '@/components/empty-workspace'
import { usePickEntry } from '@/components/use-pick-entry'
import { WorkspaceView } from '@/components/workspace/shell/components/workspace-view'
import { useEditorCommands } from '@/features/editor/state/commands'
import { useEditorWorkspaceState } from '@/features/editor/state/workspace-state'
import { useValidateRootFolder } from '@/hooks/use-validate-root-folder'
import { useWorkspaceEvents } from '@/hooks/use-workspace-events'
import { useResetWorkspaceTreeLoad } from '@/hooks/use-workspace-tree'
import { log } from '@/lib/client-logging'
import { activateWorkspaceRoot } from '@/state/active-project-store'
import type { PickedFsEntry } from '@/lib/file-system-types'
import type { PlatformKeyBinding } from '@/keymap/types'
import type { EditorKeymapLayer } from '@singapor/core'
import { useCallback } from 'react'

type AppWorkspaceProps = {
  editorKeymapLayers: readonly EditorKeymapLayer[]
  keymapBindings: readonly PlatformKeyBinding[]
}

export function AppWorkspace({ editorKeymapLayers, keymapBindings }: AppWorkspaceProps) {
  const pickerOpen = useEditorWorkspaceState((state) => state.pickerOpen)
  const rootFolder = useEditorWorkspaceState((state) => state.rootFolder)
  const openPicker = useEditorWorkspaceState((state) => state.openPicker)
  const setPickerOpen = useEditorWorkspaceState((state) => state.setPickerOpen)
  const { switchRootFolder } = useEditorCommands()
  const resetTreeLoad = useResetWorkspaceTreeLoad()

  useValidateRootFolder()
  useWorkspaceEvents(rootFolder)

  const handlePick = useCallback(
    (entry: PickedFsEntry) => {
      resetTreeLoad()
      activateWorkspaceRoot(entry.path)
      switchRootFolder(entry)
      log.info({
        action: 'workspace.root_selected',
        area: 'workspace',
        entryType: entry.type,
        path: entry.path,
      })
    },
    [resetTreeLoad, switchRootFolder],
  )
  const picker = usePickEntry({
    mode: 'folder',
    onOpenChange: setPickerOpen,
    onPick: handlePick,
    open: pickerOpen,
    value: rootFolder,
  })

  return (
    <>
      <AppCommandSurface bindings={keymapBindings} />
      <div className='flex h-full min-h-0 flex-col'>
        {rootFolder ? (
          <WorkspaceView editorKeymapLayers={editorKeymapLayers} rootFolder={rootFolder} />
        ) : (
          <EmptyWorkspace onChooseFolder={openPicker} />
        )}
      </div>
      {picker}
    </>
  )
}
