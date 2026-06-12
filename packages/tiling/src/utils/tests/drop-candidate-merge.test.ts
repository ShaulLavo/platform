import { describe, expect, it } from 'vitest'

import type { TilingDragData, TilingDropData } from '@workspace/tiling/utils/drag-data'
import { mergeEquivalentDropCandidates } from '@workspace/tiling/utils/drop-candidate-merge'
import {
  createEmptyWorkspaceLayout,
  createPlaceholderSurface,
} from '@workspace/tiling/utils/layout-builders'
import { deriveLayoutGeometry, type LayoutRect } from '@workspace/tiling/utils/layout-geometry'
import { overlayId } from '@workspace/tiling/utils/layout-ids'
import { visibleWindowIdsInOrder } from '@workspace/tiling/utils/layout-normalize'
import { moveSurface, openSurface, tabSurface } from '@workspace/tiling/utils/layout-operations'
import type {
  SnapDestination,
  Surface,
  SurfaceId,
  WindowId,
  WorkspaceLayout,
} from '@workspace/tiling/utils/layout-types'
import {
  dropCandidatesForDragSource,
  tilingSnapDestinations,
  type TilingDropCandidate,
} from '@workspace/tiling/utils/snap-destinations'

const ROOT_RECT: LayoutRect = { height: 600, width: 1000, x: 0, y: 0 }

describe('merge equivalent drop candidates', () => {
  it('merges root-left with the leftmost full-height column left edge, root wins', () => {
    const { dragSurfaceId, layout, windowIds } = createColumnsLayout()
    const source: TilingDragData = { kind: 'tab', surfaceId: dragSurfaceId }
    const merged = mergedCandidates(layout, source)

    const candidate = candidateWithMember(merged, rootEdgeId('left'))
    expect(candidate.id).toBe(mergedId([rootEdgeId('left'), windowEdgeId(windowIds[0], 'left')]))
    expect(candidate.hitRects).toHaveLength(2)
    expect(candidate.kind).toBe('root-edge')
    expect(candidate.target).toEqual(snapTarget({ edge: 'left', kind: 'root-edge' }))
  })

  it('merges adjacent window edges that insert at the same split index', () => {
    const { dragSurfaceId, layout, windowIds } = createColumnsLayout()
    const source: TilingDragData = { kind: 'tab', surfaceId: dragSurfaceId }
    const merged = mergedCandidates(layout, source)

    const candidate = candidateWithMember(merged, windowEdgeId(windowIds[0], 'right'))
    expect(candidate.id).toBe(
      mergedId([windowEdgeId(windowIds[0], 'right'), windowEdgeId(windowIds[1], 'left')]),
    )
    expect(candidate.hitRects).toHaveLength(2)
  })

  it('keeps root edges separate from partial-span window edges in a grid', () => {
    const { dragSurfaceId, layout, quadrantWindowIds } = createGridLayout()
    const source: TilingDragData = { kind: 'tab', surfaceId: dragSurfaceId }
    const merged = mergedCandidates(layout, source)

    const rootRight = candidateWithMember(merged, rootEdgeId('right'))
    const quadrantRight = candidateWithMember(
      merged,
      windowEdgeId(quadrantWindowIds.bottomRight, 'right'),
    )
    expect(rootRight.id).not.toBe(quadrantRight.id)
    expect(rootRight.id).not.toContain(windowEdgeId(quadrantWindowIds.bottomRight, 'right'))
  })

  it('merges no-op destinations into the source return zone for window drags', () => {
    const { layout, windowIds } = createColumnsLayout()
    const source: TilingDragData = { kind: 'window', windowId: windowIds[0] }
    const merged = mergedCandidates(layout, source, windowIds[0])

    const candidate = candidateWithMember(merged, `snap:source-return:${windowIds[0]}`)
    expect(candidate.id).toContain(rootEdgeId('left'))
    expect(candidate.target).toEqual({ kind: 'window', windowId: windowIds[0] })
  })

  it('keeps window-center targets with different tab indexes separate', () => {
    const { dragSurfaceId, layout, windowIds } = createColumnsLayout()
    const source: TilingDragData = { kind: 'tab', surfaceId: dragSurfaceId }
    const candidates = [
      syntheticCandidate('center-start', {
        kind: 'window-center',
        tabIndex: 0,
        windowId: windowIds[0],
      }),
      syntheticCandidate('center-end', { kind: 'window-center', windowId: windowIds[0] }),
    ]

    const merged = mergeEquivalentDropCandidates(layout, source, candidates)
    expect(merged).toHaveLength(2)
  })

  it('produces the same merged ids regardless of candidate order', () => {
    const { dragSurfaceId, layout } = createColumnsLayout()
    const source: TilingDragData = { kind: 'tab', surfaceId: dragSurfaceId }
    const candidates = dragCandidates(layout, source)

    const forward = mergeEquivalentDropCandidates(layout, source, candidates)
    const reversed = mergeEquivalentDropCandidates(layout, source, candidates.toReversed())
    expect(candidateIds(forward)).toEqual(candidateIds(reversed))
  })
})

function mergedCandidates(
  layout: WorkspaceLayout,
  source: TilingDragData,
  sourceWindowId: WindowId | null = null,
) {
  return mergeEquivalentDropCandidates(
    layout,
    source,
    dropCandidatesForDragSource(layout, source, dragCandidates(layout, source, sourceWindowId)),
  )
}

function dragCandidates(
  layout: WorkspaceLayout,
  source: TilingDragData,
  sourceWindowId: WindowId | null = null,
) {
  const geometry = deriveLayoutGeometry(layout, ROOT_RECT, {
    gapPx: 8,
    minSnapDestinationPx: 44,
    resizeHandleThicknessPx: 8,
    snapEdgeRatio: 0.18,
  })

  return tilingSnapDestinations({
    activeDrag: source,
    rootRect: ROOT_RECT,
    snapDestinationRects: geometry.snapDestinationRects,
    sourceWindowId,
    sourceWindowRect: sourceWindowId ? geometry.windowRectsById[sourceWindowId]?.rect : null,
  })
}

function candidateWithMember(candidates: readonly TilingDropCandidate[], memberId: string) {
  const candidate = candidates.find((value) => value.id.includes(memberId))
  expect(candidate, `candidate containing ${memberId}`).toBeDefined()

  return candidate as TilingDropCandidate
}

function candidateIds(candidates: readonly TilingDropCandidate[]) {
  return candidates
    .map((candidate) => candidate.id)
    .toSorted((left, right) => left.localeCompare(right))
}

function mergedId(memberIds: readonly string[]) {
  return `merged:${memberIds.toSorted().join('|')}`
}

function rootEdgeId(edge: string) {
  return overlayId(`snap:root:${edge}`)
}

function windowEdgeId(windowId: WindowId, edge: string) {
  return overlayId(`snap:window:${windowId}:${edge}`)
}

function snapTarget(destination: SnapDestination): TilingDropData {
  return { destination, kind: 'snap-destination' }
}

function syntheticCandidate(id: string, destination: SnapDestination): TilingDropCandidate {
  return {
    hitRects: [{ height: 100, width: 100, x: 0, y: 0 }],
    id,
    kind: 'window-center',
    label: id,
    priority: 100,
    target: snapTarget(destination),
  }
}

// Three full-height columns, two tabs each. The drag surface is the second
// tab of the last column so detaching it leaves the column structure intact.
function createColumnsLayout(): {
  readonly dragSurfaceId: SurfaceId
  readonly layout: WorkspaceLayout
  readonly windowIds: readonly [WindowId, WindowId, WindowId]
} {
  let layout = createEmptyWorkspaceLayout()

  for (const surfaceNumber of [1, 2, 3]) {
    const surface = createTestSurface(surfaceNumber)
    layout = openSurface(layout, surface)
    if (surfaceNumber === 1) continue

    layout = moveSurface(layout, surface.id, { edge: 'right', kind: 'root-edge' })
  }

  let surfaceNumber = 4
  for (const windowId of visibleWindowIdsInOrder(layout)) {
    const surface = createTestSurface(surfaceNumber)
    layout = openSurface(layout, surface)
    layout = tabSurface(layout, surface.id, windowId)
    surfaceNumber += 1
  }

  const [first, second, third] = visibleWindowIdsInOrder(layout)
  if (!first || !second || !third) throw new Error('Expected three columns')

  const dragSurfaceId = layout.windowsById[third]?.surfaceIds[1]
  if (!dragSurfaceId) throw new Error('Expected a second tab in the last column')

  return { dragSurfaceId, layout, windowIds: [first, second, third] }
}

// A 2x2 grid plus an extra tab in the top-left window to drag. The
// bottom-right quadrant's right edge is flush with the root but only spans
// half its height, so root-right and quadrant-right are not equivalent.
function createGridLayout(): {
  readonly dragSurfaceId: SurfaceId
  readonly layout: WorkspaceLayout
  readonly quadrantWindowIds: { readonly bottomRight: WindowId }
} {
  let layout = createEmptyWorkspaceLayout()

  const topLeft = createTestSurface(1)
  layout = openSurface(layout, topLeft)

  const topRight = createTestSurface(2)
  layout = openSurface(layout, topRight)
  layout = moveSurface(layout, topRight.id, { edge: 'right', kind: 'root-edge' })

  const [topLeftWindowId, topRightWindowId] = visibleWindowIdsInOrder(layout)
  if (!topLeftWindowId || !topRightWindowId) throw new Error('Expected two columns')

  const bottomLeft = createTestSurface(3)
  layout = openSurface(layout, bottomLeft)
  layout = moveSurface(layout, bottomLeft.id, {
    edge: 'bottom',
    kind: 'window-edge',
    windowId: topLeftWindowId,
  })

  const bottomRight = createTestSurface(4)
  layout = openSurface(layout, bottomRight)
  layout = moveSurface(layout, bottomRight.id, {
    edge: 'bottom',
    kind: 'window-edge',
    windowId: topRightWindowId,
  })

  const dragSurface = createTestSurface(5)
  layout = openSurface(layout, dragSurface)
  layout = tabSurface(layout, dragSurface.id, topLeftWindowId)

  const bottomRightWindowId = visibleWindowIdsInOrder(layout).find((windowId) =>
    layout.windowsById[windowId]?.surfaceIds.includes(bottomRight.id),
  )
  if (!bottomRightWindowId) throw new Error('Expected a bottom-right quadrant window')

  return {
    dragSurfaceId: dragSurface.id,
    layout,
    quadrantWindowIds: { bottomRight: bottomRightWindowId },
  }
}

function createTestSurface(surfaceNumber: number): Surface {
  return createPlaceholderSurface({
    canClose: true,
    contextKey: `drop-merge-test-surface-${surfaceNumber}`,
    title: `Drop Merge Surface ${surfaceNumber}`,
  })
}
