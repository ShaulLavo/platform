import { createContext } from 'react'

import type { WorkspaceLayoutStoreApi } from '@/features/tiling-surface-manager/engine/surface-state'

export const LayoutStateContext = createContext<WorkspaceLayoutStoreApi | null>(null)
