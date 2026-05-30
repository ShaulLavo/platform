import type { SearchResultId } from '@/features/search/search-result-items'
import type { SearchResultVirtualRow } from '@/features/search/search-result-view-model'
import type { SearchResultVirtualListMetrics } from '@/features/search/search-result-virtual-list'

export type SearchResultEditorVirtualizer = {
  readonly items: SearchResultVirtualListMetrics['items']
  readonly totalSize: number
  readonly scrollToIndex: SearchResultEditorScrollToIndex
  readonly scrollToOffset: (offset: number) => void
}

export type SearchResultRenderedVirtualItem = {
  readonly renderKey: string
  readonly row: SearchResultVirtualRow
  readonly virtualItem: SearchResultVirtualListMetrics['items'][number]
}

export type SearchResultRenderedFileResultItem = SearchResultRenderedVirtualItem & {
  readonly row: Extract<SearchResultVirtualRow, { type: 'file-results' }>
}

export type SearchResultFileEditorPoolEntry = {
  readonly item: SearchResultRenderedFileResultItem
  readonly key: SearchResultId
  readonly visible: boolean
}

export type SearchResultFileEditorPoolState = {
  readonly entries: readonly SearchResultFileEditorPoolEntry[]
  readonly items: ReadonlyMap<SearchResultId, SearchResultRenderedFileResultItem>
  readonly keys: readonly SearchResultId[]
}

export type SearchResultVirtualOverscanLevel = 0 | 1 | 2

export type SearchResultVirtualScrollSample = {
  readonly time: number
  readonly top: number
}

export type SearchResultEditorScrollToIndex = (
  index: number,
  target?: SearchResultVirtualRowScrollTarget | null,
) => void

export type SearchResultVirtualRowScrollTarget = {
  readonly offset: number
  readonly size: number
}
