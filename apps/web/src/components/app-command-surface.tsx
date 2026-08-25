import { AppKeymapController } from '@/app-keymap-controller'
import { CommandPalette } from '@/components/command-palette'
import { useEditorTabActions } from '@/features/editor/hooks/use-editor-tab-actions'
import { useMenuCommand } from '@/features/menus/providers/command-context'
import { SettingsDialog } from '@/features/settings/components/dialog'
import { useSettingValue } from '@/features/settings/hooks/use-setting-value'
import { useSettingsStream } from '@/features/settings/hooks/use-settings-stream'
import { resolvedPlatformKeyBindings } from '@/keymap/active-bindings'
import { usePlatformCommandDispatch } from '@/keymap/commands'
import type { PlatformKeyBinding } from '@/keymap/types'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useEditorCommands } from '@/features/editor/state/commands'
import { useEditorWorkspaceState } from '@/features/editor/state/workspace-state'

type AppCommandSurfaceProps = {
  /** The default key table. Overrides are folded in here, once, for everyone. */
  bindings: readonly PlatformKeyBinding[]
}

export function AppCommandSurface({ bindings }: AppCommandSurfaceProps) {
  const { requestCloseTab } = useEditorTabActions()
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [commandPaletteSearch, setCommandPaletteSearch] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const showCommandPalette = useCallback((initialSearch = '') => {
    setCommandPaletteSearch(initialSearch)
    setCommandPaletteOpen(true)
  }, [])
  // With a folder open, settings are an editor tab — the same surface in both
  // workbench and chat mode, since both render `CodePanel`. With no folder there
  // is no tab strip at all, so the dialog is the folderless shell: it is the one
  // path that still has a way out, and first-run provider setup happens there.
  const { openSettingsEditor } = useEditorCommands()
  const hasRootFolder = useEditorWorkspaceState((state) => state.rootFolder !== null)
  const showSettings = useCallback(() => {
    if (!hasRootFolder) {
      setSettingsOpen(true)

      return
    }

    openSettingsEditor()
  }, [hasRootFolder, openSettingsEditor])
  const dispatchKeymapCommand = usePlatformCommandDispatch({
    requestCloseTab,
    showCommandPalette,
    showSettings,
  })
  const setBindings = useMenuCommand((state) => state.setBindings)
  const setCommandDispatch = useMenuCommand((state) => state.setCommandDispatch)
  // This is the app's only reader of the keybinding overrides: the keymap, the
  // palette and the menus all take the table from here, so a hint can never
  // name a key the keymap does not run. The overrides arrive on the same query
  // the settings panel writes through, so a save lands without a reload.
  // One subscription for the whole app: every settings consumer reads the same
  // query, so the stream only has to land in the cache once.
  useSettingsStream()
  const overrides = useSettingValue('keybindings.overrides')
  // Stable identity: the menu store and the keymap effect both diff by reference.
  const keyBindings = useMemo(
    () => resolvedPlatformKeyBindings(bindings, overrides),
    [bindings, overrides],
  )

  // Menus render above this component, so they read the dispatch and key table
  // from the store rather than receiving them as props.
  useEffect(() => {
    setCommandDispatch(dispatchKeymapCommand)

    return () => setCommandDispatch(null)
  }, [dispatchKeymapCommand, setCommandDispatch])

  useEffect(() => {
    setBindings(keyBindings)
  }, [keyBindings, setBindings])

  return (
    <>
      <AppKeymapController bindings={keyBindings} dispatch={dispatchKeymapCommand} />
      <CommandPalette
        bindings={keyBindings}
        dispatch={dispatchKeymapCommand}
        onOpenChange={setCommandPaletteOpen}
        onSearchChange={setCommandPaletteSearch}
        open={commandPaletteOpen}
        search={commandPaletteSearch}
      />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  )
}
