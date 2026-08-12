import { useEffect, useRef, type RefObject } from 'react'

/**
 * The value of the row the palette currently highlights, reported however the
 * highlight moved — arrow keys, pointer, or the list re-filtering under a new
 * query.
 *
 * Read off the DOM rather than through cmdk's `onValueChange`, which only fires
 * when the list is a controlled component. Controlling it would mean owning
 * "which row is highlighted first after filtering", and only cmdk knows that —
 * it runs the filter. The `data-selected` attribute it writes is the same fact
 * without taking on that ownership.
 */
export function useHighlightedPaletteValue({
  enabled,
  listRef,
  onHighlight,
}: {
  readonly enabled: boolean
  readonly listRef: RefObject<HTMLElement | null>
  readonly onHighlight: (value: string) => void
}) {
  // The observer must not be torn down and rebuilt every render just because the
  // callback is a new closure; the latest one is read at report time instead.
  const onHighlightRef = useRef(onHighlight)
  useEffect(() => {
    onHighlightRef.current = onHighlight
  })

  useEffect(() => {
    const list = listRef.current
    if (!enabled || !list) return

    const reportHighlightedValue = () => {
      const value = list
        .querySelector('[cmdk-item][data-selected="true"]')
        ?.getAttribute('data-value')
      if (!value) return

      onHighlightRef.current(value)
    }

    reportHighlightedValue()
    const observer = new MutationObserver(reportHighlightedValue)
    observer.observe(list, { attributeFilter: ['data-selected'], subtree: true })

    return () => {
      observer.disconnect()
    }
  }, [enabled, listRef])
}
