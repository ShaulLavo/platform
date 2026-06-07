import { AppWorkspace } from '@/components/app-workspace'
import { WindowTitleBar } from '@/components/workspace/shell/components/window-title-bar'
import { useFocus } from '@/components/workspace/focus/providers/focus-state'
import { useDirtyTabCloseRequest } from '@/features/editor/hooks/use-dirty-tab-close'
import { useEditorWorkspaceState } from '@/features/editor/state/editor-workspace-state'
import { useWorkspaceCachePersistence } from '@/hooks/use-workspace-cache-persistence'
import {
  defaultPlatformKeyBindings,
  editorKeymapLayersFromPlatform,
  platformKeyBindingsForWorkspaceLayout,
} from '@/keymap'
import { useCallback, useMemo, type FocusEvent, type PointerEvent } from 'react'

export function AppContent() {
  const setFocusArea = useFocus((state) => state.setFocusArea)
  const { dirtyTabCloseDialog, requestCloseTab, requestCloseTabs } = useDirtyTabCloseRequest()
  const activeHotkeyPresetId = useEditorWorkspaceState(
    (state) => state.workspaceLayout.activeHotkeyPresetId,
  )
  const hotkeyPresetsById = useEditorWorkspaceState(
    (state) => state.workspaceLayout.hotkeyPresetsById,
  )
  const defaultKeymapBindings = useMemo(() => defaultPlatformKeyBindings(), [])
  const keymapBindings = useMemo(
    () =>
      platformKeyBindingsForWorkspaceLayout(defaultKeymapBindings, {
        activeHotkeyPresetId,
        hotkeyPresetsById,
      }),
    [activeHotkeyPresetId, defaultKeymapBindings, hotkeyPresetsById],
  )
  const editorKeymapLayers = useMemo(
    () => editorKeymapLayersFromPlatform(keymapBindings),
    [keymapBindings],
  )

  useWorkspaceCachePersistence()

  const handleGlobalFocusCapture = useCallback(
    (event: FocusEvent<HTMLElement>) => {
      if (!eventTargetsCurrentElement(event)) return

      setFocusArea('global')
    },
    [setFocusArea],
  )
  const handleGlobalPointerDownCapture = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!eventTargetsCurrentElement(event)) return

      setFocusArea('global')
    },
    [setFocusArea],
  )

  return (
    <main
      className='bg-background text-foreground flex h-svh flex-col overflow-hidden'
      onFocusCapture={handleGlobalFocusCapture}
      onPointerDownCapture={handleGlobalPointerDownCapture}
    >
      <WindowTitleBar />
      <div className='min-h-0 flex-1'>
        <AppWorkspace
          editorKeymapLayers={editorKeymapLayers}
          keymapBindings={keymapBindings}
          onRequestCloseTab={requestCloseTab}
          onRequestCloseTabs={requestCloseTabs}
        />
      </div>
      {dirtyTabCloseDialog}
    </main>
  )
}

function eventTargetsCurrentElement(event: {
  currentTarget: EventTarget
  target: EventTarget | null
}) {
  return event.currentTarget === event.target
}
