import { useState } from 'react'

import {
  createSearchResultFileEditorPoolState,
  syncSearchResultFileEditorPoolEntries,
} from '@/features/search/state/result-editor-pool'
import type { SearchResultRenderedFileResultItem } from '@/features/search/utils/result-editor-types'

export function useSearchResultFileEditorPoolEntries(
  visibleItems: readonly SearchResultRenderedFileResultItem[],
  prewarmEditorPool: boolean,
) {
  const [poolState, setPoolState] = useState(createSearchResultFileEditorPoolState)

  const nextPoolState = syncSearchResultFileEditorPoolEntries(
    poolState,
    visibleItems,
    prewarmEditorPool,
  )
  if (nextPoolState !== poolState) {
    setPoolState(nextPoolState)
  }

  return nextPoolState.entries
}
