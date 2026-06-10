import { describe, expect, it } from 'vitest'

import { visibleWindowIdsInOrder } from '@workspace/tiling/utils/layout-normalize'
import { createTilingInvariantError } from '@workspace/tiling/utils/structured-errors'
import {
  tilingInsertionPreview,
  tilingTabStripPreviewItems,
} from '@workspace/tiling/utils/tab-preview'
import {
  createMultiWindowTestLayout,
  firstSurfaceIdForWindow,
  testSurfacesForWindow,
  testWindowPair,
} from '@workspace/tiling/utils/tests/test-layouts'

describe('tiling tab insertion preview', () => {
  it('resolves window-center snap targets to merge previews at the target window end', () => {
    const layout = createMultiWindowTestLayout()
    const { sourceWindowId, targetWindowId } = testWindowPair(layout)
    const sourceWindow = layout.windowsById[sourceWindowId]
    const targetWindow = layout.windowsById[targetWindowId]

    const preview = tilingInsertionPreview({
      activeDrag: { kind: 'window', windowId: sourceWindowId },
      layout,
      resolvedTarget: {
        mode: 'window',
        target: {
          destination: { kind: 'window-center', windowId: targetWindowId },
          kind: 'snap-destination',
        },
      },
    })

    expect(preview).toEqual({
      insertionIndex: targetWindow?.surfaceIds.length,
      kind: 'window-merge',
      sourceSurfaceIds: sourceWindow?.surfaceIds,
      sourceWindowId,
      targetWindowId,
    })
  })

  it('uses window-center tabIndex when one is present', () => {
    const layout = createMultiWindowTestLayout()
    const { sourceWindowId, targetWindowId } = testWindowPair(layout)

    const preview = tilingInsertionPreview({
      activeDrag: { kind: 'window', windowId: sourceWindowId },
      layout,
      resolvedTarget: {
        mode: 'window',
        target: {
          destination: { kind: 'window-center', tabIndex: 1, windowId: targetWindowId },
          kind: 'snap-destination',
        },
      },
    })

    expect(preview?.insertionIndex).toBe(1)
  })

  it('inserts dragged window surfaces as ghosts in the target strip', () => {
    const layout = createMultiWindowTestLayout()
    const { sourceWindowId, targetWindowId } = testWindowPair(layout)
    const targetSurfaces = testSurfacesForWindow(layout, targetWindowId)
    const preview = tilingInsertionPreview({
      activeDrag: { kind: 'window', windowId: sourceWindowId },
      layout,
      resolvedTarget: {
        mode: 'window',
        target: { index: 1, kind: 'tab-strip', windowId: targetWindowId },
      },
    })

    const items = tilingTabStripPreviewItems({
      insertionPreview: preview,
      layout,
      surfaces: targetSurfaces,
      windowId: targetWindowId,
    })

    expect(items.map(previewItemLabel)).toEqual([
      `surface:${targetSurfaces[0]?.id}`,
      ...testSurfacesForWindow(layout, sourceWindowId).map((surface) => `ghost:${surface.id}`),
      `surface:${targetSurfaces[1]?.id}`,
    ])
  })

  it('moves the dragged tab to the insertion index when it returns to its source strip', () => {
    const layout = createMultiWindowTestLayout()
    const [sourceWindowId] = visibleWindowIdsInOrder(layout)
    if (!sourceWindowId) throw createTilingInvariantError('Expected source window')

    const sourceSurfaces = testSurfacesForWindow(layout, sourceWindowId)
    const sourceSurfaceId = firstSurfaceIdForWindow(layout, sourceWindowId)
    const preview = tilingInsertionPreview({
      activeDrag: { kind: 'tab', surfaceId: sourceSurfaceId },
      layout,
      resolvedTarget: {
        mode: 'tab-detached',
        target: { index: 1, kind: 'tab-strip', windowId: sourceWindowId },
      },
    })
    const items = tilingTabStripPreviewItems({
      insertionPreview: preview,
      layout,
      surfaces: sourceSurfaces,
      windowId: sourceWindowId,
    })

    expect(items.map(previewItemLabel)).toEqual([
      `surface:${sourceSurfaces[1]?.id}`,
      `surface:${sourceSurfaceId}`,
    ])
  })

  it('does not ghost a window merge that is already materialized in the strip', () => {
    const layout = createMultiWindowTestLayout()
    const { sourceWindowId } = testWindowPair(layout)
    const sourceSurfaces = testSurfacesForWindow(layout, sourceWindowId)
    const preview = tilingInsertionPreview({
      activeDrag: { kind: 'window', windowId: sourceWindowId },
      layout,
      resolvedTarget: {
        mode: 'window',
        target: { index: 0, kind: 'tab-strip', windowId: sourceWindowId },
      },
    })

    expect(preview).toBeNull()
    expect(
      tilingTabStripPreviewItems({
        insertionPreview: preview,
        layout,
        surfaces: sourceSurfaces,
        windowId: sourceWindowId,
      }).map(previewItemLabel),
    ).toEqual(sourceSurfaces.map((surface) => `surface:${surface.id}`))
  })
})

function previewItemLabel(item: ReturnType<typeof tilingTabStripPreviewItems>[number]) {
  if (item.kind === 'surface') return `surface:${item.surface.id}`

  return `ghost:${item.surface.id}`
}
