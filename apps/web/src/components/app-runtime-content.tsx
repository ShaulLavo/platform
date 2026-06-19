import { useCallback, useMemo, type FocusEvent, type MouseEvent, type PointerEvent } from 'react'

import { AppWorkspace } from '@/components/app-workspace'
import { useFocus } from '@/components/workspace/focus/providers/focus-state'
import { useDirtyTabCloseRequest } from '@/features/editor/hooks/use-dirty-tab-close'
import { useWorkspaceCachePersistence } from '@/hooks/use-workspace-cache-persistence'
import { defaultPlatformKeyBindings } from '@/keymap/default-bindings'
import { editorKeymapLayersFromPlatform } from '@/keymap/editor-keymap'
import { isDesktop } from '@/lib/platform/bridge'
import {
  NATIVE_WINDOW_DRAG_CLASS,
  markNativeWindowNoDragForCurrentEvent,
} from '@/lib/platform/window-drag'

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
      className={`${NATIVE_WINDOW_DRAG_CLASS} bg-background text-foreground flex h-svh flex-col overflow-hidden`}
      onFocusCapture={handleGlobalFocusCapture}
      onMouseDown={handleNativeWindowDragMouseDown}
      onPointerDownCapture={handleGlobalPointerDownCapture}
    >
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

function handleNativeWindowDragMouseDown(event: MouseEvent<HTMLElement>) {
  if (!isDesktop()) return

  markNativeWindowNoDragForCurrentEvent(event.target)
}

function eventTargetsCurrentElement(event: {
  currentTarget: EventTarget
  target: EventTarget | null
}) {
  return event.currentTarget === event.target
}
