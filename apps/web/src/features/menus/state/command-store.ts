import { createStore, type StoreApi } from 'zustand/vanilla'

import type { PlatformCommandId, PlatformKeyBinding } from '@/keymap/types'
import type { PlatformCommandDispatch } from '@/keymap/use-app-keymap'

type MenuCommandStoreState = {
  bindings: readonly PlatformKeyBinding[]
  dispatch: PlatformCommandDispatch | null
}

type MenuCommandStoreActions = {
  runCommand: (command: PlatformCommandId) => boolean
  setBindings: (bindings: readonly PlatformKeyBinding[]) => void
  setCommandDispatch: (dispatch: PlatformCommandDispatch | null) => void
}

export type MenuCommandStore = MenuCommandStoreActions & MenuCommandStoreState

export type MenuCommandStoreApi = StoreApi<MenuCommandStore>

/**
 * Publishes the platform command dispatch and the key table to every menu in
 * the app. `AppCommandSurface` owns both and writes them here; the store
 * exists so surfaces rendered above it — the title bar in particular — can
 * still reach them without the values being drilled down the tree.
 */
export function createMenuCommandStore() {
  return createStore<MenuCommandStore>()((set, get) => ({
    bindings: [],
    dispatch: null,
    runCommand: (command) => get().dispatch?.(command) ?? false,
    // Both setters no-op on an unchanged value: they are called from effects
    // that re-run whenever the publishing component renders, and a fresh state
    // object would wake every menu subscriber for nothing.
    setBindings: (bindings) => set((state) => (state.bindings === bindings ? state : { bindings })),
    setCommandDispatch: (dispatch) =>
      set((state) => (state.dispatch === dispatch ? state : { dispatch })),
  }))
}
