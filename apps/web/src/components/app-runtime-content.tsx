import { useCallback, useMemo, type FocusEvent, type PointerEvent } from 'react'

import { AppTitlebar } from '@/components/app-titlebar'
import { AppWorkspace } from '@/components/app-workspace'
import { useFocus } from '@/features/workspace/providers/focus-state'
import { useDirtyTabCloseRequest } from '@/features/editor/hooks/use-dirty-tab-close'
import { EditorTabActionsProvider } from '@/features/editor/providers/tab-actions-provider'
import { MenuCommandProvider } from '@/features/menus/providers/command-provider'
import { useRestoreRecentWorkspaceRoot } from '@/features/workspace/hooks/use-restore-recent-root'
import { useUnsavedWorkGuard } from '@/features/workspace/hooks/use-unsaved-work-guard'
import { useAddressProjection } from '@/features/address/hooks/use-projection'
import { useAddressRestore } from '@/features/address/hooks/use-restore'
import { useWorkspaceCachePersistence } from '@/features/workspace/hooks/use-cache-persistence'
import { DEFAULT_SETTING_VALUES } from '@workspace/contracts'

import { useSettings } from '@/features/settings/hooks/use-settings'
import { resolvedPlatformKeyBindings } from '@/keymap/active-bindings'
import { defaultPlatformKeyBindings } from '@/keymap/default-bindings'
import { editorKeymapLayersFromPlatform } from '@/keymap/editor-keymap'
import { useAutoSave } from '@/features/editor/hooks/use-auto-save'

export function AppRuntimeContent() {
  const setFocusArea = useFocus((state) => state.setFocusArea)
  const { dirtyTabCloseDialog, requestCloseTab, requestCloseTabs } = useDirtyTabCloseRequest()
  const defaultKeymapBindings = useMemo(() => defaultPlatformKeyBindings(), [])
  // Overrides resolved *before* the editor layers are built. Building them from
  // the raw defaults is what made every `editor.*` command unrebindable: the
  // settings panel wrote the override, the app keymap honoured it, and the
  // editor kept its own keymap from the defaults — so the row hid itself rather
  // than appear to work and do nothing.
  const keybindingOverrides =
    useSettings().data?.values['keybindings.overrides'] ??
    DEFAULT_SETTING_VALUES['keybindings.overrides']
  const editorKeymapLayers = useMemo(
    () =>
      editorKeymapLayersFromPlatform(
        resolvedPlatformKeyBindings(defaultKeymapBindings, keybindingOverrides),
      ),
    [defaultKeymapBindings, keybindingOverrides],
  )

  // Subscribe before recovery so a recovered root recreates its erased cache entry.
  useWorkspaceCachePersistence()
  // Restore before projecting, so the applier's writes are what the first projection
  // sees rather than racing it.
  useAddressRestore()
  useAddressProjection()
  // Mounted beside the cache persistence: both need the document store, and both
  // are app-lifetime concerns rather than anything a pane owns.
  useAutoSave()
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
