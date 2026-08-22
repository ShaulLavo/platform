import { useState, type ReactNode } from 'react'

import { TreeCommandsContext } from '@/features/workspace/providers/tree-commands-context'
import { createTreeCommandStore } from '@/features/workspace/state/tree-command-store'

export function TreeCommandsProvider({ children }: { readonly children: ReactNode }) {
  const [store] = useState(createTreeCommandStore)

  return <TreeCommandsContext value={store}>{children}</TreeCommandsContext>
}
