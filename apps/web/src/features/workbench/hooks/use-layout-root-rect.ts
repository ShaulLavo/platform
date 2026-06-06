import { useLayoutEffect, useRef, useState } from 'react'

import { rootLayoutRect } from '@/features/workbench/utils/layout-style'
import type { LayoutRect } from '@/features/tiling-surface-manager/engine/layout-geometry'

export function useLayoutRootRect(initialRect: LayoutRect | null = null) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [rect, setRect] = useState<LayoutRect | null>(initialRect)

  useLayoutEffect(() => {
    const element = rootRef.current
    if (!element) return

    function updateRect() {
      const nextRect = rootLayoutRect(element?.clientWidth ?? 0, element?.clientHeight ?? 0)
      setRect((current) => (layoutRectsEqual(current, nextRect) ? current : nextRect))
    }

    updateRect()
    if (!('ResizeObserver' in window)) return

    const observer = new ResizeObserver(updateRect)
    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  return { rect, rootRef }
}

function layoutRectsEqual(left: LayoutRect | null, right: LayoutRect) {
  if (!left) return false
  if (left.height !== right.height) return false
  if (left.width !== right.width) return false
  if (left.x !== right.x) return false

  return left.y === right.y
}
