import type { LayoutGeometryOptions, LayoutRect } from '@workspace/tiling/utils/layout-geometry'

export const DEFAULT_LAYOUT_RECT: LayoutRect = {
  height: 720,
  width: 1080,
  x: 0,
  y: 0,
}

export const DEFAULT_GEOMETRY_OPTIONS: LayoutGeometryOptions = {
  gapPx: 8,
  resizeHandleThicknessPx: 8,
}
