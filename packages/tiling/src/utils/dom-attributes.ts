import type { SurfaceId, WindowId } from '@workspace/tiling/utils/layout-types'

export const TILING_TAB_ATTRIBUTE = 'data-tiling-tab-id'
export const TILING_TAB_STRIP_ATTRIBUTE = 'data-tiling-tab-strip-id'
export const TILING_TAB_STRIP_ORIENTATION_ATTRIBUTE = 'data-tiling-tab-strip-orientation'
export const TILING_WINDOW_ATTRIBUTE = 'data-tiling-window-id'

export type TilingTabStripOrientation = 'horizontal' | 'vertical'

export function tilingTabAttributes(surfaceId: SurfaceId) {
  return {
    [TILING_TAB_ATTRIBUTE]: surfaceId,
  }
}

export function tilingTabStripAttributes({
  orientation,
  windowId,
}: {
  readonly orientation: TilingTabStripOrientation
  readonly windowId: WindowId
}) {
  return {
    [TILING_TAB_STRIP_ATTRIBUTE]: windowId,
    [TILING_TAB_STRIP_ORIENTATION_ATTRIBUTE]: orientation,
  }
}

export function tilingWindowAttributes(windowId: WindowId) {
  return {
    [TILING_WINDOW_ATTRIBUTE]: windowId,
  }
}
