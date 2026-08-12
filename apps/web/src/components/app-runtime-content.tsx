import { useCallback, useMemo, type FocusEvent, type PointerEvent } from 'react'

import { AppTitlebar } from '@/components/app-titlebar'
import { AppWorkspace } from '@/components/app-workspace'
import { useFocus } from '@/components/workspace/focus/providers/focus-state'
import { useDirtyTabCloseRequest } from '@/features/editor/hooks/use-dirty-tab-close'
import { EditorTabActionsProvider } from '@/features/editor/providers/editor-tab-actions-provider'
import { MenuCommandProvider } from '@/features/menus/providers/command-provider'
import { useRestoreRecentWorkspaceRoot } from '@/hooks/use-restore-recent-workspace-root'
import { useUnsavedWorkGuard } from '@/hooks/use-unsaved-work-guard'
import { useWorkspaceCachePersistence } from '@/hooks/use-workspace-cache-persistence'
import { defaultPlatformKeyBindings } from '@/keymap/default-bindings'
import { editorKeymapLayersFromPlatform } from '@/keymap/editor-keymap'

export function AppRuntimeContent() {
  const setFocusArea = useFocus((state) => state.setFocusArea)
  const { dirtyTabCloseDialog, requestCloseTab, requestCloseTabs } = useDirtyTabCloseRequest()
  const defaultKeymapBindings = useMemo(() => defaultPlatformKeyBindings(), [])
  const editorKeymapLayers = useMemo(
    () => editorKeymapLayersFromPlatform(defaultKeymapBindings),
    [defaultKeymapBindings],
  )

  // Subscribe before recovery so a recovered root recreates its erased cache entry.
  useWorkspaceCachePersistence()
  useRestoreRecentWorkspaceRoot()
  useUnsavedWorkGuard()

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
    // The menu command store sits above the title bar so title-bar menus can
    // reach the dispatch that `AppCommandSurface` publishes from inside <main>.
    <MenuCommandProvider>
      <div
        className='bg-background text-foreground flex h-svh flex-col overflow-hidden'
        onFocusCapture={handleGlobalFocusCapture}
        onPointerDownCapture={handleGlobalPointerDownCapture}
      >
        <AppTitlebar />
        <main className='min-h-0 flex-1'>
          <EditorTabActionsProvider
            requestCloseTab={requestCloseTab}
            requestCloseTabs={requestCloseTabs}
          >
            <AppWorkspace
              editorKeymapLayers={editorKeymapLayers}
              keymapBindings={defaultKeymapBindings}
            />
          </EditorTabActionsProvider>
        </main>
        {dirtyTabCloseDialog}
      </div>
    </MenuCommandProvider>
  )
}

function eventTargetsCurrentElement(event: {
  currentTarget: EventTarget
  target: EventTarget | null
}) {
  return event.currentTarget === event.target
}
