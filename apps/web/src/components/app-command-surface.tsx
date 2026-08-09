import { AppKeymapController } from '@/app-keymap-controller'
import { CommandPalette } from '@/components/command-palette'
import { useEditorTabActions } from '@/features/editor/hooks/use-editor-tab-actions'
import { useMenuCommand } from '@/features/menus/providers/command-context'
import { usePlatformCommandDispatch } from '@/keymap/commands'
import type { PlatformKeyBinding } from '@/keymap/types'
import { useCallback, useEffect, useState } from 'react'

type AppCommandSurfaceProps = {
  bindings: readonly PlatformKeyBinding[]
}

export function AppCommandSurface({ bindings }: AppCommandSurfaceProps) {
  const { requestCloseTab } = useEditorTabActions()
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [commandPaletteSearch, setCommandPaletteSearch] = useState('')
  const showCommandPalette = useCallback((initialSearch = '') => {
    setCommandPaletteSearch(initialSearch)
    setCommandPaletteOpen(true)
  }, [])
  const dispatchKeymapCommand = usePlatformCommandDispatch({
    requestCloseTab,
    showCommandPalette,
  })
  const setBindings = useMenuCommand((state) => state.setBindings)
  const setCommandDispatch = useMenuCommand((state) => state.setCommandDispatch)

  // Menus render above this component, so they read the dispatch and key table
  // from the store rather than receiving them as props.
  useEffect(() => {
    setCommandDispatch(dispatchKeymapCommand)

    return () => setCommandDispatch(null)
  }, [dispatchKeymapCommand, setCommandDispatch])

  useEffect(() => {
    setBindings(bindings)
  }, [bindings, setBindings])

  return (
    <>
      <AppKeymapController bindings={bindings} dispatch={dispatchKeymapCommand} />
      <CommandPalette
        bindings={bindings}
        dispatch={dispatchKeymapCommand}
        onOpenChange={setCommandPaletteOpen}
        onSearchChange={setCommandPaletteSearch}
        open={commandPaletteOpen}
        search={commandPaletteSearch}
      />
    </>
  )
}
