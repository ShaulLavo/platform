import { useLayoutEffect, useRef, useState } from 'react'

import { rootLayoutRect } from './workbench-layout-style'
import type { LayoutRect } from './layout-geometry'

export function useWorkbenchLayoutRootRect(initialRect: LayoutRect | null = null) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [rect, setRect] = useState<LayoutRect | null>(initialRect)

  useLayoutEffect(() => {
    const element = rootRef.current
    if (!element) return

    function updateRect() {
      setRect(rootLayoutRect(element?.clientWidth ?? 0, element?.clientHeight ?? 0))
    }

    updateRect()
    if (!('ResizeObserver' in window)) return

    const observer = new ResizeObserver(updateRect)
    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  return { rect, rootRef }
}
