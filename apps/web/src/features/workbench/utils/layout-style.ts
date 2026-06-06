import type { CSSProperties } from 'react'

import type { LayoutRect } from '@/features/tiling-surface-manager/engine/layout-geometry'

export function layoutRectStyle(rect: LayoutRect): CSSProperties {
  return {
    height: rect.height,
    left: rect.x,
    top: rect.y,
    width: rect.width,
  }
}

export function rootLayoutRect(width: number, height: number): LayoutRect {
  return {
    height,
    width,
    x: 0,
    y: 0,
  }
}
