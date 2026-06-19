import { createContext } from 'react'

import type { RequestCloseTab } from '@/features/editor/hooks/use-dirty-tab-close'

export type EditorTabActions = {
  readonly requestCloseTab: RequestCloseTab
  readonly reorderTab: (tabId: string, targetIndex: number) => boolean
  readonly selectTab: (tabId: string) => void
}

export const EditorTabActionsContext = createContext<EditorTabActions | null>(null)
