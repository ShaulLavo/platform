import { createContext, use } from 'react'
import { useStore } from 'zustand'

import type { MenuCommandStore, MenuCommandStoreApi } from '@/features/menus/state/command-store'
import { clientErrors } from '@/lib/structured-errors'

const MenuCommandContext = createContext<MenuCommandStoreApi | null>(null)
export { MenuCommandContext }

export function useMenuCommand<T>(selector: (state: MenuCommandStore) => T): T {
  const store = use(MenuCommandContext)
  if (!store) {
    throw clientErrors.CONTEXT_MISSING({
      message: 'useMenuCommand must be used within MenuCommandProvider',
    })
  }

  return useStore(store, selector)
}
