export type SearchResultVirtualListItemInput = {
  readonly key: string
  readonly size: number
}

export type SearchResultVirtualListItem = SearchResultVirtualListItemInput & {
  readonly index: number
  readonly start: number
}

export type SearchResultVirtualListMetrics = {
  readonly items: readonly SearchResultVirtualListItem[]
  readonly totalSize: number
}

export type SearchResultVirtualListViewport = {
  readonly height: number
  readonly top: number
}

export type SearchResultVirtualListOverscan = {
  readonly fallbackCount?: number
  readonly overscan: number
}

export type SearchResultVirtualListScrollOptions = {
  readonly itemOffset?: number
  readonly totalPadding?: number
}

export function createSearchResultVirtualListMetrics(
  inputs: readonly SearchResultVirtualListItemInput[]
): SearchResultVirtualListMetrics {
  const items: SearchResultVirtualListItem[] = []
  let totalSize = 0

  for (let index = 0; index < inputs.length; index += 1) {
    const input = inputs[index]
    if (!input) continue

    items.push({
      index,
      key: input.key,
      size: input.size,
      start: totalSize,
    })
    totalSize += input.size
  }

  return { items, totalSize }
}

export function visibleSearchResultVirtualListItems(
  metrics: SearchResultVirtualListMetrics,
  viewport: SearchResultVirtualListViewport,
  options: SearchResultVirtualListOverscan
) {
  const visible: SearchResultVirtualListItem[] = []
  const top = clampedViewportTop(metrics, viewport)
  const height = Math.max(0, viewport.height)
  const start = Math.max(0, top - options.overscan)
  const end = top + height + options.overscan
  const firstIndex = firstSearchResultVirtualListItemIndex(metrics.items, start)

  for (let index = firstIndex; index < metrics.items.length; index += 1) {
    const item = metrics.items[index]
    if (!item) continue
    if (item.start > end) break

    visible.push(item)
  }

  if (visible.length > 0) return visible

  return metrics.items.slice(0, options.fallbackCount ?? 0)
}

export function scrollTopForSearchResultVirtualListItem(
  metrics: SearchResultVirtualListMetrics,
  index: number,
  viewport: SearchResultVirtualListViewport,
  options: SearchResultVirtualListScrollOptions = {}
) {
  const item = metrics.items[index]
  if (!item) return null

  const height = Math.max(0, viewport.height)
  const itemBottom = item.start + item.size + (options.itemOffset ?? 0)
  const viewportBottom = viewport.top + height

  if (item.start < viewport.top) {
    return clampSearchResultVirtualListScrollTop(
      item.start,
      metrics.totalSize + (options.totalPadding ?? 0),
      height
    )
  }
  if (itemBottom > viewportBottom) {
    return clampSearchResultVirtualListScrollTop(
      itemBottom - height,
      metrics.totalSize + (options.totalPadding ?? 0),
      height
    )
  }

  return viewport.top
}

export function clampSearchResultVirtualListScrollTop(
  top: number,
  totalSize: number,
  viewportHeight: number
) {
  const maxTop = Math.max(0, totalSize - Math.max(0, viewportHeight))

  return Math.min(maxTop, Math.max(0, top))
}

function clampedViewportTop(
  metrics: SearchResultVirtualListMetrics,
  viewport: SearchResultVirtualListViewport
) {
  return clampSearchResultVirtualListScrollTop(
    viewport.top,
    metrics.totalSize,
    viewport.height
  )
}

function firstSearchResultVirtualListItemIndex(
  items: readonly SearchResultVirtualListItem[],
  offset: number
) {
  let low = 0
  let high = items.length

  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    const item = items[middle]
    if (!item) break

    if (item.start + item.size < offset) {
      low = middle + 1
      continue
    }

    high = middle
  }

  return low
}
