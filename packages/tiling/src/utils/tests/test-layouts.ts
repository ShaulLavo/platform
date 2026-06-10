import {
  createEmptyWorkspaceLayout,
  createPlaceholderSurface,
} from '@workspace/tiling/utils/layout-builders'
import { visibleWindowIdsInOrder } from '@workspace/tiling/utils/layout-normalize'
import { moveSurface, openSurface, tabSurface } from '@workspace/tiling/utils/layout-operations'
import { createTilingInvariantError } from '@workspace/tiling/utils/structured-errors'
import type {
  LayoutEdge,
  Surface,
  SurfaceId,
  WindowId,
  WorkspaceLayout,
} from '@workspace/tiling/utils/layout-types'

export function createMultiWindowTestLayout({
  tabsPerWindow = 2,
  windowCount = 3,
}: {
  readonly tabsPerWindow?: number
  readonly windowCount?: number
} = {}): WorkspaceLayout {
  let layout = createEmptyWorkspaceLayout()
  let surfaceNumber = 1

  for (let index = 0; index < windowCount; index += 1) {
    const surface = createTestSurface(surfaceNumber)
    layout = openSurface(layout, surface)
    if (index > 0) {
      layout = moveSurface(layout, surface.id, {
        edge: edgeForWindowIndex(index),
        kind: 'root-edge',
      })
    }
    surfaceNumber += 1
  }

  const extraTabCount = Math.max(0, tabsPerWindow - 1)
  for (const windowId of visibleWindowIdsInOrder(layout)) {
    for (let index = 0; index < extraTabCount; index += 1) {
      const surface = createTestSurface(surfaceNumber)
      layout = openSurface(layout, surface)
      layout = tabSurface(layout, surface.id, windowId)
      surfaceNumber += 1
    }
  }

  return layout
}

export function testWindowPair(layout: WorkspaceLayout): {
  readonly sourceWindowId: WindowId
  readonly targetWindowId: WindowId
} {
  const [sourceWindowId, targetWindowId] = visibleWindowIdsInOrder(layout)
  if (!sourceWindowId) throw createTilingInvariantError('Expected source window')
  if (!targetWindowId) throw createTilingInvariantError('Expected target window')

  return { sourceWindowId, targetWindowId }
}

export function testSurfacesForWindow(
  layout: WorkspaceLayout,
  windowId: WindowId,
): readonly Surface[] {
  const window = layout.windowsById[windowId]
  if (!window) return []

  return window.surfaceIds.flatMap((surfaceId) => {
    const surface = layout.surfacesById[surfaceId]
    if (!surface) return []

    return [surface]
  })
}

export function firstSurfaceIdForWindow(layout: WorkspaceLayout, windowId: WindowId): SurfaceId {
  const surfaceId = layout.windowsById[windowId]?.surfaceIds[0]
  if (!surfaceId) throw createTilingInvariantError(`Expected a surface in ${windowId}`)

  return surfaceId
}

function createTestSurface(surfaceNumber: number): Surface {
  return createPlaceholderSurface({
    canClose: true,
    contextKey: `tiling-test-surface-${surfaceNumber}`,
    title: `Test Surface ${surfaceNumber}`,
  })
}

function edgeForWindowIndex(index: number): LayoutEdge {
  const edges: readonly LayoutEdge[] = ['right', 'bottom', 'left', 'top']

  return edges[(index - 1) % edges.length] ?? 'right'
}
