import { createContext } from 'react'
import type { WorkspaceSearchMatch } from '@workspace/contracts'

import type { WorkspaceSearchFileGroup } from '@/features/search/state/buffer-state'
import type { SearchResultId } from '@/features/search/utils/result-items'
import type { SearchResultOpenTarget } from '@/features/search/utils/result-view-model'

export type SearchResultActions = {
  readonly openMatch: (match: WorkspaceSearchMatch) => void
  readonly openTarget: (target: SearchResultOpenTarget) => void
  readonly replaceGroup: (group: WorkspaceSearchFileGroup) => void
  readonly replaceMatch: (match: WorkspaceSearchMatch) => void
  readonly replacePath: (path: string) => void
  readonly selectResult: (id: SearchResultId | null) => void
  readonly selectResultWithoutReveal: (id: SearchResultId | null) => void
  readonly toggleGroup: (path: string) => void
}

export const SearchResultActionsContext = createContext<SearchResultActions | null>(null)
