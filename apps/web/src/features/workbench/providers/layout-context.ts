import { createContext } from 'react'

import type { WorkspaceLayoutStoreApi } from '@/features/tiling-surface-manager/utils/surface-state'

export const LayoutStateContext = createContext<WorkspaceLayoutStoreApi | null>(null)
