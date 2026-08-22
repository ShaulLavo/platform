import { createContext } from 'react'

import type { TreeCommandStore } from '@/features/workspace/state/tree-command-store'

export const TreeCommandsContext = createContext<TreeCommandStore | null>(null)
