import { useMemo, useRef } from 'react'

import {
  createSearchResultFileEditorPoolState,
  syncSearchResultFileEditorPoolEntries,
} from '@/features/search/search-result-editor-pool'
import type {
  SearchResultFileEditorPoolState,
  SearchResultRenderedFileResultItem,
} from '@/features/search/search-result-editor-types'

export function useSearchResultFileEditorPoolEntries(
  visibleItems: readonly SearchResultRenderedFileResultItem[],
  prewarmEditorPool: boolean,
) {
  const poolStateRef = useRef<SearchResultFileEditorPoolState>(
    createSearchResultFileEditorPoolState(),
  )

  return useMemo(() => {
    poolStateRef.current = syncSearchResultFileEditorPoolEntries(
      poolStateRef.current,
      visibleItems,
      prewarmEditorPool,
    )

    return poolStateRef.current.entries
  }, [prewarmEditorPool, visibleItems])
}
