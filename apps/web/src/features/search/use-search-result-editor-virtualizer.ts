import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
  type UIEvent,
} from "react"

import {
  INITIAL_SEARCH_RESULT_VIRTUAL_VIEWPORT,
  SEARCH_RESULT_VIRTUAL_FALLBACK_COUNT,
  SEARCH_RESULT_VIRTUAL_OVERSCAN_IDLE_DELAY_MS,
  SEARCH_RESULT_VIRTUAL_PADDING,
  SEARCH_RESULT_VIRTUAL_ROW_OFFSET,
} from "@/features/search/search-result-editor-constants"
import type {
  SearchResultEditorVirtualizer,
  SearchResultVirtualOverscanLevel,
  SearchResultVirtualRowScrollTarget,
  SearchResultVirtualScrollSample,
} from "@/features/search/search-result-editor-types"
import {
  equalSearchResultVirtualViewport,
  searchResultVirtualOverscan,
  searchResultVirtualOverscanLevel,
  searchResultVirtualRowInputs,
  searchResultVirtualViewportHeight,
} from "@/features/search/search-result-editor-utils"
import type { SearchResultVirtualRow } from "@/features/search/search-result-view-model"
import {
  clampSearchResultVirtualListScrollTop,
  createSearchResultVirtualListMetrics,
  scrollTopForSearchResultVirtualListItem,
  visibleSearchResultVirtualListItems,
  type SearchResultVirtualListViewport,
} from "@/features/search/search-result-virtual-list"

export function useSearchResultEditorVirtualizer(
  rows: readonly SearchResultVirtualRow[],
  parentRef: RefObject<HTMLDivElement | null>
): SearchResultEditorVirtualizer {
  const viewportRef = useRef<SearchResultVirtualListViewport>(
    INITIAL_SEARCH_RESULT_VIRTUAL_VIEWPORT
  )
  const scrollSampleRef = useRef<SearchResultVirtualScrollSample | null>(null)
  const scrollOverscanLevelRef = useRef<SearchResultVirtualOverscanLevel>(0)
  const overscanIdleTimeoutRef = useRef<number | null>(null)
  const [viewport, setViewport] = useState<SearchResultVirtualListViewport>(
    INITIAL_SEARCH_RESULT_VIRTUAL_VIEWPORT
  )
  const [scrollOverscanLevel, setScrollOverscanLevelState] =
    useState<SearchResultVirtualOverscanLevel>(0)
  const itemInputs = useMemo(() => searchResultVirtualRowInputs(rows), [rows])
  const metrics = useMemo(
    () => createSearchResultVirtualListMetrics(itemInputs),
    [itemInputs]
  )
  const overscan = useMemo(
    () => searchResultVirtualOverscan(viewport.height, scrollOverscanLevel),
    [scrollOverscanLevel, viewport.height]
  )
  const items = useMemo(
    () =>
      visibleSearchResultVirtualListItems(metrics, viewport, {
        fallbackCount: SEARCH_RESULT_VIRTUAL_FALLBACK_COUNT,
        overscan,
      }),
    [metrics, overscan, viewport]
  )
  const viewportHeight = viewport.height
  const setScrollOverscanLevel = useCallback(
    (level: SearchResultVirtualOverscanLevel) => {
      if (scrollOverscanLevelRef.current === level) return

      scrollOverscanLevelRef.current = level
      setScrollOverscanLevelState(level)
    },
    []
  )
  const resetScrollOverscanLevelSoon = useCallback(() => {
    if (overscanIdleTimeoutRef.current !== null) {
      window.clearTimeout(overscanIdleTimeoutRef.current)
    }

    overscanIdleTimeoutRef.current = window.setTimeout(() => {
      overscanIdleTimeoutRef.current = null
      setScrollOverscanLevel(0)
    }, SEARCH_RESULT_VIRTUAL_OVERSCAN_IDLE_DELAY_MS)
  }, [setScrollOverscanLevel])
  const updateScrollOverscanLevel = useCallback(
    (top: number) => {
      const time = performance.now()
      const previous = scrollSampleRef.current
      scrollSampleRef.current = { time, top }
      resetScrollOverscanLevelSoon()
      if (!previous) return

      const elapsed = time - previous.time
      if (elapsed <= 0) return

      const velocity = Math.abs(top - previous.top) / elapsed
      const level = searchResultVirtualOverscanLevel(velocity)
      if (level <= scrollOverscanLevelRef.current) return

      setScrollOverscanLevel(level)
    },
    [resetScrollOverscanLevelSoon, setScrollOverscanLevel]
  )
  const updateViewport = useCallback(
    (next: SearchResultVirtualListViewport) => {
      viewportRef.current = next
      setViewport((current) =>
        equalSearchResultVirtualViewport(current, next) ? current : next
      )
    },
    []
  )
  const updateViewportHeight = useCallback(
    (height: number) => {
      updateViewport({
        height,
        top: viewportRef.current.top,
      })
    },
    [updateViewport]
  )
  const updateViewportTop = useCallback(
    (top: number) => {
      updateScrollOverscanLevel(top)
      updateViewport({
        height: viewportRef.current.height,
        top,
      })
    },
    [updateScrollOverscanLevel, updateViewport]
  )

  useEffect(
    () => () => {
      if (overscanIdleTimeoutRef.current === null) return

      window.clearTimeout(overscanIdleTimeoutRef.current)
    },
    []
  )

  useEffect(() => {
    const element = parentRef.current
    if (!element) return

    updateViewportTop(element.scrollTop)
  }, [metrics.totalSize, parentRef, updateViewportTop])

  useEffect(() => {
    const element = parentRef.current
    if (!element) return
    if (typeof ResizeObserver === "undefined") return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return

      updateViewportHeight(searchResultVirtualViewportHeight(entry))
    })
    observer.observe(element)

    return () => observer.disconnect()
  }, [parentRef, updateViewportHeight])

  const scrollToOffset = useCallback(
    (offset: number) => {
      const element = parentRef.current
      if (!element) return

      const top = clampSearchResultVirtualListScrollTop(
        offset,
        metrics.totalSize + SEARCH_RESULT_VIRTUAL_PADDING,
        viewportRef.current.height
      )
      element.scrollTop = top
      updateViewportTop(top)
    },
    [metrics.totalSize, parentRef, updateViewportTop]
  )
  const scrollToIndex = useCallback(
    (index: number, target?: SearchResultVirtualRowScrollTarget | null) => {
      const element = parentRef.current
      if (!element) return
      if (viewportHeight <= 0) return

      const nextTop = scrollTopForSearchResultVirtualListItem(
        metrics,
        index,
        viewportRef.current,
        {
          itemOffset: SEARCH_RESULT_VIRTUAL_ROW_OFFSET,
          targetOffset: target?.offset,
          targetSize: target?.size,
          totalPadding: SEARCH_RESULT_VIRTUAL_PADDING,
        }
      )
      if (nextTop === null) return

      element.scrollTop = nextTop
      updateViewportTop(nextTop)
    },
    [metrics, parentRef, updateViewportTop, viewportHeight]
  )
  const onScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) =>
      updateViewportTop(event.currentTarget.scrollTop),
    [updateViewportTop]
  )

  return {
    items,
    onScroll,
    scrollToIndex,
    scrollToOffset,
    totalSize: metrics.totalSize,
  }
}
