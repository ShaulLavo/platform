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
  readonly targetOffset?: number
  readonly targetSize?: number
  readonly totalPadding?: number
}

export function createSearchResultVirtualListMetrics(
  inputs: readonly SearchResultVirtualListItemInput[],
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
  options: SearchResultVirtualListOverscan,
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

export function searchResultVirtualListItemsEqual(
  left: readonly SearchResultVirtualListItem[],
  right: readonly SearchResultVirtualListItem[],
) {
  if (left.length !== right.length) return false

  return left.every((item, index) => searchResultVirtualListItemEqual(item, right[index]))
}

export function scrollTopForSearchResultVirtualListItem(
  metrics: SearchResultVirtualListMetrics,
  index: number,
  viewport: SearchResultVirtualListViewport,
  options: SearchResultVirtualListScrollOptions = {},
) {
  const item = metrics.items[index]
  if (!item) return null

  const height = Math.max(0, viewport.height)
  const target = searchResultVirtualListItemTarget(item, options)
  const viewportBottom = viewport.top + height

  if (target.start < viewport.top) {
    return clampSearchResultVirtualListScrollTop(
      target.start,
      metrics.totalSize + (options.totalPadding ?? 0),
      height,
    )
  }
  if (target.end > viewportBottom) {
    return clampSearchResultVirtualListScrollTop(
      target.end - height,
      metrics.totalSize + (options.totalPadding ?? 0),
      height,
    )
  }

  return viewport.top
}

function searchResultVirtualListItemEqual(
  left: SearchResultVirtualListItem,
  right: SearchResultVirtualListItem | undefined,
) {
  if (!right) return false

  return (
    left.index === right.index &&
    left.key === right.key &&
    left.size === right.size &&
    left.start === right.start
  )
}

function searchResultVirtualListItemTarget(
  item: SearchResultVirtualListItem,
  options: SearchResultVirtualListScrollOptions,
) {
  if (options.targetOffset === undefined) {
    return {
      end: item.start + item.size + (options.itemOffset ?? 0),
      start: item.start,
    }
  }

  const targetSize = options.targetSize ?? item.size
  const targetStart = item.start + options.targetOffset

  return {
    end: targetStart + targetSize + (options.itemOffset ?? 0),
    start: targetStart,
  }
}

export function clampSearchResultVirtualListScrollTop(
  top: number,
  totalSize: number,
  viewportHeight: number,
) {
  const maxTop = Math.max(0, totalSize - Math.max(0, viewportHeight))

  return Math.min(maxTop, Math.max(0, top))
}

function clampedViewportTop(
  metrics: SearchResultVirtualListMetrics,
  viewport: SearchResultVirtualListViewport,
) {
  return clampSearchResultVirtualListScrollTop(viewport.top, metrics.totalSize, viewport.height)
}

function firstSearchResultVirtualListItemIndex(
  items: readonly SearchResultVirtualListItem[],
  offset: number,
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
