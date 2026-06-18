import { useCallback, useMemo, type FocusEvent, type PointerEvent } from 'react'

import { AppWorkspace } from '@/components/app-workspace'
import { WindowTitleBar } from '@/components/workspace/shell/components/window-title-bar'
import { useFocus } from '@/components/workspace/focus/providers/focus-state'
import { useDirtyTabCloseRequest } from '@/features/editor/hooks/use-dirty-tab-close'
import { useWorkspaceCachePersistence } from '@/hooks/use-workspace-cache-persistence'
import { defaultPlatformKeyBindings } from '@/keymap/default-bindings'
import { editorKeymapLayersFromPlatform } from '@/keymap/editor-keymap'

export function AppRuntimeContent() {
  const setFocusArea = useFocus((state) => state.setFocusArea)
  const { dirtyTabCloseDialog, requestCloseTab } = useDirtyTabCloseRequest()
  const defaultKeymapBindings = useMemo(() => defaultPlatformKeyBindings(), [])
  const editorKeymapLayers = useMemo(
    () => editorKeymapLayersFromPlatform(defaultKeymapBindings),
    [defaultKeymapBindings],
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
          keymapBindings={defaultKeymapBindings}
          onRequestCloseTab={requestCloseTab}
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
