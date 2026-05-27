import { useMemo, useRef, type RefObject } from 'react'

import type { SearchResultId } from '@/features/search/search-result-items'
import { nextSearchResultFileEditorPoolKeys } from '@/features/search/search-result-editor-pool'
import type {
  SearchResultFileEditorPoolEntry,
  SearchResultFileEditorPoolState,
  SearchResultRenderedFileResultItem,
} from '@/features/search/search-result-editor-types'

export function useSearchResultFileEditorPoolEntries(
  visibleItems: readonly SearchResultRenderedFileResultItem[],
  prewarmEditorPool: boolean,
) {
  const poolStateRef = useRef<SearchResultFileEditorPoolState>({
    items: new Map(),
    keys: [],
  })
  const visibleKeys = useMemo(
    () => visibleItems.map(searchResultFileEditorPoolItemKey),
    [visibleItems],
  )

  return useMemo(
    () =>
      syncedSearchResultFileEditorPoolEntries(
        poolStateRef,
        visibleItems,
        visibleKeys,
        prewarmEditorPool,
      ),
    [prewarmEditorPool, visibleItems, visibleKeys],
  )
}

function syncedSearchResultFileEditorPoolEntries(
  poolStateRef: RefObject<SearchResultFileEditorPoolState>,
  visibleItems: readonly SearchResultRenderedFileResultItem[],
  visibleKeys: readonly SearchResultId[],
  prewarmEditorPool: boolean,
) {
  const poolState = poolStateRef.current
  const poolKeys = nextSearchResultFileEditorPoolKeys(
    poolState.keys,
    visibleKeys,
    prewarmEditorPool,
  )
  const items = new Map(poolState.items)
  syncSearchResultFileEditorPoolCache(items, poolKeys, visibleItems)
  poolStateRef.current = { items, keys: poolKeys }

  return searchResultFileEditorPoolEntries(poolKeys, visibleItems, items)
}

function searchResultFileEditorPoolEntries(
  poolKeys: readonly SearchResultId[],
  visibleItems: readonly SearchResultRenderedFileResultItem[],
  cachedItems: ReadonlyMap<SearchResultId, SearchResultRenderedFileResultItem>,
): SearchResultFileEditorPoolEntry[] {
  const visibleByKey = new Map<SearchResultId, SearchResultRenderedFileResultItem>()
  for (const item of visibleItems) {
    visibleByKey.set(searchResultFileEditorPoolItemKey(item), item)
  }

  const entries: SearchResultFileEditorPoolEntry[] = []
  for (const key of poolKeys) {
    const visibleItem = visibleByKey.get(key)
    const item = visibleItem ?? cachedItems.get(key)
    if (!item) continue

    entries.push({
      item,
      key,
      visible: visibleItem !== undefined,
    })
  }

  return entries
}

function searchResultFileEditorPoolItemKey(item: SearchResultRenderedFileResultItem) {
  return item.row.file.id
}

function syncSearchResultFileEditorPoolCache(
  cache: Map<SearchResultId, SearchResultRenderedFileResultItem>,
  poolKeys: readonly SearchResultId[],
  visibleItems: readonly SearchResultRenderedFileResultItem[],
) {
  let changed = false
  for (const item of visibleItems) {
    const key = searchResultFileEditorPoolItemKey(item)
    if (cache.get(key) === item) continue

    changed = true
    cache.set(key, item)
  }

  const poolKeySet = new Set(poolKeys)
  for (const key of cache.keys()) {
    if (poolKeySet.has(key)) continue

    changed = true
    cache.delete(key)
  }

  return changed
}
