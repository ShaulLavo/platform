import { useMemo } from 'react'

import { EmptyWorkspace } from '@/components/empty-workspace'
import { usePickEntry } from '@/components/use-pick-entry'
import { WorkspaceView } from '@/features/workspace/components/view'
import { useEditorWorkspaceState } from '@/features/editor/state/workspace-state'
import { useOpenWorkspaceRoot } from '@/features/workspace/hooks/use-open-root'
import { useValidateRootFolder } from '@/features/workspace/hooks/use-validate-root-folder'
import { useWorkspaceEvents } from '@/features/workspace/hooks/use-events'
import { log } from '@/lib/client-logging'
import type { PickedFsEntry } from '@/lib/file-system-types'
import { editorKeymapLayersFromPlatform } from '@/keymap/editor-keymap'
import { useCommand } from '@/keymap/hooks/use-command'

export function AppWorkspace() {
  const { bindings } = useCommand()
  // The editor and document listener must consume the same resolved binding table.
  const editorKeymapLayers = useMemo(() => editorKeymapLayersFromPlatform(bindings), [bindings])
  const pickerOpen = useEditorWorkspaceState((state) => state.pickerOpen)
  const rootFolder = useEditorWorkspaceState((state) => state.rootFolder)
  const openPicker = useEditorWorkspaceState((state) => state.openPicker)
  const setPickerOpen = useEditorWorkspaceState((state) => state.setPickerOpen)
  const openWorkspaceRoot = useOpenWorkspaceRoot()

  useValidateRootFolder()
  useWorkspaceEvents(rootFolder)

  const handlePick = (entry: PickedFsEntry) => {
    void openPickedWorkspaceRoot(entry, openWorkspaceRoot)
  }
  const picker = usePickEntry({
    mode: 'folder',
    onOpenChange: setPickerOpen,
    onPick: handlePick,
    open: pickerOpen,
    value: rootFolder,
  })

  return (
    <>
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

async function openPickedWorkspaceRoot(
  entry: PickedFsEntry,
  openWorkspaceRoot: ReturnType<typeof useOpenWorkspaceRoot>,
) {
  const result = await openWorkspaceRoot(entry.path)
  if (result !== 'opened' && result !== 'already-open') return

  log.info({
    action: 'workspace.root_selected',
    area: 'workspace',
    entryType: entry.type,
    path: entry.path,
  })
}
