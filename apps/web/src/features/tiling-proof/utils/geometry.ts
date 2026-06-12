import { DEFAULT_GEOMETRY_OPTIONS } from '@/features/workbench/utils/layout-defaults'
import type { LayoutGeometryOptions } from '@workspace/tiling/utils/layout-geometry'

export const PROOF_GEOMETRY_OPTIONS: LayoutGeometryOptions = {
  ...DEFAULT_GEOMETRY_OPTIONS,
  minSnapDestinationPx: 44,
  snapEdgeRatio: 0.18,
}
