import { useState, type ReactNode } from 'react'

import { MenuCommandContext } from '@/features/menus/providers/command-context'
import { createMenuCommandStore } from '@/features/menus/state/command-store'

export function MenuCommandProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createMenuCommandStore)

  return <MenuCommandContext value={store}>{children}</MenuCommandContext>
}
