import { useLayoutEffect, useState, type RefObject } from 'react'

export function useElementWidth<TElement extends HTMLElement>(ref: RefObject<TElement | null>) {
  const [width, setWidth] = useState<number | null>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return

    function updateWidth() {
      setWidth(element?.clientWidth ?? null)
    }

    updateWidth()

    if (!('ResizeObserver' in window)) return

    const observer = new ResizeObserver(updateWidth)
    observer.observe(element)

    return () => observer.disconnect()
  }, [ref])

  return width
}
