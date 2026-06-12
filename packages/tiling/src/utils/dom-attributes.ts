import type { SurfaceId, WindowId } from '@workspace/tiling/utils/layout-types'

export const TILING_TAB_ATTRIBUTE = 'data-tiling-tab-id'
export const TILING_TAB_PREVIEW_ATTRIBUTE = 'data-tiling-tab-preview'
export const TILING_TAB_STRIP_ATTRIBUTE = 'data-tiling-tab-strip-id'
export const TILING_TAB_STRIP_ORIENTATION_ATTRIBUTE = 'data-tiling-tab-strip-orientation'
export const TILING_WINDOW_ATTRIBUTE = 'data-tiling-window-id'

export type TilingTabStripOrientation = 'horizontal' | 'vertical'

export function tilingTabAttributes(surfaceId: SurfaceId) {
  return {
    [TILING_TAB_ATTRIBUTE]: surfaceId,
  }
}

// Marks an element in a tab strip as part of an insertion-preview block.
// The hit test skips these when counting insertion indices and switches to
// near-edge boundaries while a block is present.
export function tilingTabPreviewAttributes() {
  return {
    [TILING_TAB_PREVIEW_ATTRIBUTE]: 'true',
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
