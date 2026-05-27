import { AppKeymapController } from '@/components/app-keymap-controller'
import { CommandPalette } from '@/components/command-palette'
import type { RequestCloseTab } from '@/features/editor/hooks/use-dirty-tab-close'
import { usePlatformCommandDispatch, type PlatformKeyBinding } from '@/keymap'
import type { TreeModel } from '@/lib/tree-model'
import type { LoadState } from '@/lib/load-state'
import { useCallback, useState } from 'react'

type AppCommandSurfaceProps = {
  bindings: readonly PlatformKeyBinding[]
  requestCloseTab: RequestCloseTab
  treeState: LoadState<TreeModel>
}

export function AppCommandSurface({
  bindings,
  requestCloseTab,
  treeState,
}: AppCommandSurfaceProps) {
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
        treeState={treeState}
      />
    </>
  )
}
