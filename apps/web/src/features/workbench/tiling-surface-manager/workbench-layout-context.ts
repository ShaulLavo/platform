import { createContext } from 'react'

import type { WorkspaceLayoutStoreApi } from './surface-state'

export const WorkbenchLayoutStateContext = createContext<WorkspaceLayoutStoreApi | null>(null)
