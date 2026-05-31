import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { flushSync } from 'react-dom'

import type {
  SearchResultEditorScrollToIndex,
  SearchResultEditorVirtualizer,
} from '@/features/search/search-result-editor-types'
import {
  searchResultVirtualRowInputs,
  searchResultVirtualViewportHeight,
} from '@/features/search/search-result-editor-utils'
import type { SearchResultVirtualRow } from '@/features/search/search-result-view-model'
import { createSearchResultVirtualListMetrics } from '@/features/search/search-result-virtual-list'
import {
  SearchResultVirtualWindowStore,
  type SearchResultVirtualWindow,
} from '@/features/search/search-result-virtual-window-store'

export type SearchResultScrollSyncMode = 'raf' | 'sync'

export function useSearchResultEditorVirtualizer(
  rows: readonly SearchResultVirtualRow[],
  parentRef: RefObject<HTMLDivElement | null>,
  scrollSyncMode: SearchResultScrollSyncMode = 'raf',
): SearchResultEditorVirtualizer {
  const itemInputs = useMemo(() => searchResultVirtualRowInputs(rows), [rows])
  const metrics = useMemo(() => createSearchResultVirtualListMetrics(itemInputs), [itemInputs])
  const storeRef = useRef<SearchResultVirtualWindowStore | null>(null)
  if (storeRef.current === null) {
    storeRef.current = new SearchResultVirtualWindowStore({ metrics })
  }
  const store = storeRef.current
  const [windowState, setWindowState] = useState<SearchResultVirtualWindow>(() => store.getWindow())

  useLayoutEffect(() => {
    store.setChangeHandler(setWindowState)

    return () => store.setChangeHandler(null)
  }, [store])

  useLayoutEffect(() => {
    store.setMetrics(metrics)
  }, [metrics, store])

  useEffect(() => () => store.dispose(), [store])

  useEffect(() => {
    const element = parentRef.current
    if (!element) return

    const handleScroll = () => {
      if (scrollSyncMode === 'sync') {
        flushSync(() => {
          store.setScrollTop(element.scrollTop, { publish: 'sync' })
        })
        return
      }

      store.setScrollTop(element.scrollTop, { publish: 'defer' })
    }

    element.addEventListener('scroll', handleScroll, { passive: true })
    store.setScrollTop(element.scrollTop, {
      publish: 'sync',
      updateVelocity: false,
    })

    return () => element.removeEventListener('scroll', handleScroll)
  }, [parentRef, scrollSyncMode, store])

  useEffect(() => {
    const element = parentRef.current
    if (!element) return
    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return

      store.setViewportHeight(searchResultVirtualViewportHeight(entry))
    })
    observer.observe(element)

    return () => observer.disconnect()
  }, [parentRef, store])

  const scrollToOffset = useCallback(
    (offset: number) => {
      const element = parentRef.current
      if (!element) return

      const top = store.scrollTopForOffset(offset)
      element.scrollTop = top
      store.setScrollTop(top, {
        publish: 'sync',
        updateVelocity: false,
      })
    },
    [parentRef, store],
  )
  const scrollToIndex = useCallback<SearchResultEditorScrollToIndex>(
    (index, target) => {
      const element = parentRef.current
      if (!element) return

      const nextTop = store.scrollTopForIndex(index, target)
      if (nextTop === null) return

      element.scrollTop = nextTop
      store.setScrollTop(nextTop, {
        publish: 'sync',
        updateVelocity: false,
      })
    },
    [parentRef, store],
  )

  return {
    items: windowState.items,
    scrollToIndex,
    scrollToOffset,
    totalSize: windowState.totalSize,
    viewport: windowState.viewport,
  }
}
