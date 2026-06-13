import type { SearchResultId } from '@/features/search/search-result-items'
import type {
  SearchResultFileEditorPoolEntry,
  SearchResultFileEditorPoolState,
  SearchResultRenderedFileResultItem,
} from '@/features/search/search-result-editor-types'

const SEARCH_RESULT_FILE_EDITOR_POOL_RECENT_SIZE = 1

export function createSearchResultFileEditorPoolState(): SearchResultFileEditorPoolState {
  return {
    entries: [],
    items: new Map(),
    keys: [],
  }
}

export function nextSearchResultFileEditorPoolKeys(
  currentKeys: readonly SearchResultId[],
  visibleKeys: readonly SearchResultId[],
  prewarmEditorPool: boolean,
) {
  if (!prewarmEditorPool) return stableSearchResultFileEditorPoolKeys(currentKeys, visibleKeys)
  if (visibleKeys.length === 0) {
    return stableSearchResultFileEditorPoolKeys(
      currentKeys,
      currentKeys.slice(0, SEARCH_RESULT_FILE_EDITOR_POOL_RECENT_SIZE),
    )
  }

  const visibleKeySet = new Set(visibleKeys)
  const nextKeys: SearchResultId[] = []
  let retainedHiddenCount = 0
  for (const key of currentKeys) {
    if (visibleKeySet.has(key)) {
      nextKeys.push(key)
      continue
    }
    if (retainedHiddenCount >= SEARCH_RESULT_FILE_EDITOR_POOL_RECENT_SIZE) continue

    retainedHiddenCount += 1
    nextKeys.push(key)
  }
  const nextKeySet = new Set(nextKeys)
  for (const key of visibleKeys) {
    if (nextKeySet.has(key)) continue

    nextKeys.push(key)
  }

  return stableSearchResultFileEditorPoolKeys(currentKeys, nextKeys)
}

function searchResultFileEditorPoolKeysEqual(
  left: readonly SearchResultId[],
  right: readonly SearchResultId[],
) {
  if (left.length !== right.length) return false

  return left.every((key, index) => key === right[index])
}

function searchResultFileEditorPoolItemKey(item: SearchResultRenderedFileResultItem) {
  return item.row.file.id
}

export function syncSearchResultFileEditorPoolEntries(
  state: SearchResultFileEditorPoolState,
  visibleItems: readonly SearchResultRenderedFileResultItem[],
  prewarmEditorPool: boolean,
): SearchResultFileEditorPoolState {
  const visibleKeys = visibleItems.map(searchResultFileEditorPoolItemKey)
  const keys = nextSearchResultFileEditorPoolKeys(state.keys, visibleKeys, prewarmEditorPool)
  const items = syncSearchResultFileEditorPoolCache(state.items, keys, visibleItems)
  const entries = searchResultFileEditorPoolEntries(state.entries, keys, visibleItems, items)
  if (state.keys === keys && state.items === items && state.entries === entries) return state

  return { entries, items, keys }
}

function searchResultFileEditorPoolEntries(
  currentEntries: readonly SearchResultFileEditorPoolEntry[],
  poolKeys: readonly SearchResultId[],
  visibleItems: readonly SearchResultRenderedFileResultItem[],
  cachedItems: ReadonlyMap<SearchResultId, SearchResultRenderedFileResultItem>,
): readonly SearchResultFileEditorPoolEntry[] {
  const visibleByKey = searchResultFileEditorPoolVisibleItemsByKey(visibleItems)
  const currentByKey = searchResultFileEditorPoolEntriesByKey(currentEntries)
  const entries = nextSearchResultFileEditorPoolEntries(
    poolKeys,
    visibleByKey,
    cachedItems,
    currentByKey,
  )
  if (searchResultFileEditorPoolEntriesEqual(currentEntries, entries)) return currentEntries

  return entries
}

function nextSearchResultFileEditorPoolEntries(
  poolKeys: readonly SearchResultId[],
  visibleByKey: ReadonlyMap<SearchResultId, SearchResultRenderedFileResultItem>,
  cachedItems: ReadonlyMap<SearchResultId, SearchResultRenderedFileResultItem>,
  currentByKey: ReadonlyMap<SearchResultId, SearchResultFileEditorPoolEntry>,
) {
  const entries: SearchResultFileEditorPoolEntry[] = []
  for (const key of poolKeys) {
    const entry = searchResultFileEditorPoolEntry(key, visibleByKey, cachedItems, currentByKey)
    if (!entry) continue

    entries.push(entry)
  }

  return entries
}

function searchResultFileEditorPoolEntry(
  key: SearchResultId,
  visibleByKey: ReadonlyMap<SearchResultId, SearchResultRenderedFileResultItem>,
  cachedItems: ReadonlyMap<SearchResultId, SearchResultRenderedFileResultItem>,
  currentByKey: ReadonlyMap<SearchResultId, SearchResultFileEditorPoolEntry>,
) {
  const visibleItem = visibleByKey.get(key)
  const item = canonicalSearchResultFileEditorPoolItem(visibleItem, cachedItems.get(key))
  if (!item) return null

  const visible = visibleItem !== undefined
  const current = currentByKey.get(key)
  if (current?.item === item && current.visible === visible) return current

  return { item, key, visible }
}

function searchResultFileEditorPoolEntriesByKey(
  entries: readonly SearchResultFileEditorPoolEntry[],
) {
  const byKey = new Map<SearchResultId, SearchResultFileEditorPoolEntry>()
  for (const entry of entries) {
    byKey.set(entry.key, entry)
  }

  return byKey
}

function searchResultFileEditorPoolEntriesEqual(
  left: readonly SearchResultFileEditorPoolEntry[],
  right: readonly SearchResultFileEditorPoolEntry[],
) {
  if (left.length !== right.length) return false

  return left.every((entry, index) => entry === right[index])
}

function searchResultFileEditorPoolVisibleItemsByKey(
  visibleItems: readonly SearchResultRenderedFileResultItem[],
) {
  const visibleByKey = new Map<SearchResultId, SearchResultRenderedFileResultItem>()
  for (const item of visibleItems) {
    visibleByKey.set(searchResultFileEditorPoolItemKey(item), item)
  }

  return visibleByKey
}

function syncSearchResultFileEditorPoolCache(
  current: ReadonlyMap<SearchResultId, SearchResultRenderedFileResultItem>,
  poolKeys: readonly SearchResultId[],
  visibleItems: readonly SearchResultRenderedFileResultItem[],
) {
  const poolKeySet = new Set(poolKeys)
  let next: ReadonlyMap<SearchResultId, SearchResultRenderedFileResultItem> | null = null
  for (const item of visibleItems) {
    next = syncSearchResultFileEditorPoolCacheItem(next ?? current, item)
  }
  for (const key of current.keys()) {
    if (poolKeySet.has(key)) continue

    const mutableNext = next instanceof Map ? next : new Map(next ?? current)
    mutableNext.delete(key)
    next = mutableNext
  }

  return next ?? current
}

function syncSearchResultFileEditorPoolCacheItem(
  current: ReadonlyMap<SearchResultId, SearchResultRenderedFileResultItem>,
  item: SearchResultRenderedFileResultItem,
) {
  const key = searchResultFileEditorPoolItemKey(item)
  const cachedItem = current.get(key)
  const nextItem = stableSearchResultFileEditorPoolItem(item, cachedItem)
  if (cachedItem === nextItem) return current

  const next = new Map(current)
  next.set(key, nextItem)
  return next
}

function stableSearchResultFileEditorPoolKeys(
  currentKeys: readonly SearchResultId[],
  nextKeys: readonly SearchResultId[],
) {
  if (searchResultFileEditorPoolKeysEqual(currentKeys, nextKeys)) return currentKeys

  return nextKeys
}

function canonicalSearchResultFileEditorPoolItem(
  visibleItem: SearchResultRenderedFileResultItem | undefined,
  cachedItem: SearchResultRenderedFileResultItem | undefined,
) {
  if (!visibleItem) return cachedItem ?? null

  return stableSearchResultFileEditorPoolItem(visibleItem, cachedItem)
}

function stableSearchResultFileEditorPoolItem(
  item: SearchResultRenderedFileResultItem,
  cachedItem: SearchResultRenderedFileResultItem | undefined,
) {
  if (cachedItem && searchResultFileEditorPoolItemsEqual(cachedItem, item)) return cachedItem

  return item
}

function searchResultFileEditorPoolItemsEqual(
  left: SearchResultRenderedFileResultItem,
  right: SearchResultRenderedFileResultItem,
) {
  return (
    left.renderKey === right.renderKey &&
    left.row === right.row &&
    left.virtualItem === right.virtualItem
  )
}
