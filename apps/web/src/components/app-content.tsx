import { AppWorkspace } from '@/components/app-workspace'
import { useWorkspaceFocus } from '@/components/workspace/workspace-focus-state'
import { useDirtyTabCloseRequest } from '@/features/editor/hooks/use-dirty-tab-close'
import { useWorkspaceCachePersistence } from '@/hooks/use-workspace-cache-persistence'
import { defaultPlatformKeyBindings, editorKeymapLayersFromPlatform } from '@/keymap'
import { useCallback, useMemo, type FocusEvent, type PointerEvent } from 'react'

export function AppContent() {
  const setFocusArea = useWorkspaceFocus((state) => state.setFocusArea)
  const { dirtyTabCloseDialog, requestCloseTab, requestCloseTabs } = useDirtyTabCloseRequest()
  const keymapBindings = useMemo(() => defaultPlatformKeyBindings(), [])
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
      className='bg-background text-foreground h-svh overflow-hidden'
      onFocusCapture={handleGlobalFocusCapture}
      onPointerDownCapture={handleGlobalPointerDownCapture}
    >
      <AppWorkspace
        editorKeymapLayers={editorKeymapLayers}
        keymapBindings={keymapBindings}
        onRequestCloseTab={requestCloseTab}
        onRequestCloseTabs={requestCloseTabs}
      />
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
