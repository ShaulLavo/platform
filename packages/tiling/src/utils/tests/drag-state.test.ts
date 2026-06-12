import { describe, expect, it } from 'vitest'

import { sourceWindowRectForDrag } from '@workspace/tiling/utils/drag-state'
import { deriveLayoutGeometry, type LayoutRect } from '@workspace/tiling/utils/layout-geometry'
import {
  createMultiWindowTestLayout,
  firstSurfaceIdForWindow,
  testWindowPair,
} from '@workspace/tiling/utils/tests/test-layouts'

const ROOT_RECT: LayoutRect = { height: 600, width: 1000, x: 0, y: 0 }
const GEOMETRY_OPTIONS = {
  gapPx: 8,
  minSnapDestinationPx: 44,
  resizeHandleThicknessPx: 8,
  snapEdgeRatio: 0.18,
}

describe('sourceWindowRectForDrag', () => {
  it('returns the source window rect for window drags', () => {
    const layout = createMultiWindowTestLayout()
    const { sourceWindowId } = testWindowPair(layout)
    const geometry = deriveLayoutGeometry(layout, ROOT_RECT, GEOMETRY_OPTIONS)

    const rect = sourceWindowRectForDrag(layout, geometry.windowRectsById, {
      kind: 'window',
      windowId: sourceWindowId,
    })

    expect(rect).toEqual(geometry.windowRectsById[sourceWindowId]?.rect)
  })

  it('returns the vacated window rect for lone-tab drags', () => {
    const layout = createMultiWindowTestLayout({ tabsPerWindow: 1 })
    const { sourceWindowId } = testWindowPair(layout)
    const geometry = deriveLayoutGeometry(layout, ROOT_RECT, GEOMETRY_OPTIONS)

    const rect = sourceWindowRectForDrag(layout, geometry.windowRectsById, {
      kind: 'tab',
      surfaceId: firstSurfaceIdForWindow(layout, sourceWindowId),
    })

    expect(rect).toEqual(geometry.windowRectsById[sourceWindowId]?.rect)
  })

  it('returns null for tabs leaving a multi-tab window', () => {
    const layout = createMultiWindowTestLayout({ tabsPerWindow: 2 })
    const { sourceWindowId } = testWindowPair(layout)
    const geometry = deriveLayoutGeometry(layout, ROOT_RECT, GEOMETRY_OPTIONS)

    const rect = sourceWindowRectForDrag(layout, geometry.windowRectsById, {
      kind: 'tab',
      surfaceId: firstSurfaceIdForWindow(layout, sourceWindowId),
    })

    expect(rect).toBeNull()
  })
})
