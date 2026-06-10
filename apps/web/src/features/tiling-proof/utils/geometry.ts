import type { LayoutGeometryOptions, LayoutRect } from '@workspace/tiling/utils/layout-geometry'

export const PROOF_DEFAULT_LAYOUT_RECT: LayoutRect = {
  height: 720,
  width: 1080,
  x: 0,
  y: 0,
}

export const PROOF_GEOMETRY_OPTIONS: LayoutGeometryOptions = {
  gapPx: 8,
  minSnapDestinationPx: 44,
  resizeHandleThicknessPx: 8,
  snapEdgeRatio: 0.18,
}
