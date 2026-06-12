import { describe, expect, it } from 'vitest'

import type { TilingDragData, TilingDropData } from '@workspace/tiling/utils/drag-data'
import {
  resolveTilingTarget,
  type ResolvedTilingTarget,
  type TilingIntentMode,
} from '@workspace/tiling/utils/drop-target-resolver'
import {
  deriveLayoutGeometry,
  type LayoutRect,
  type SnapDestinationLayoutRect,
} from '@workspace/tiling/utils/layout-geometry'
import { overlayId } from '@workspace/tiling/utils/layout-ids'
import type {
  LayoutEdge,
  SnapDestination,
  SurfaceId,
  WindowId,
} from '@workspace/tiling/utils/layout-types'
import {
  tilingSnapDestinations,
  type TilingDropCandidate,
} from '@workspace/tiling/utils/snap-destinations'
import { createMultiWindowTestLayout } from '@workspace/tiling/utils/tests/test-layouts'

const ROOT_RECT: LayoutRect = { height: 600, width: 1000, x: 0, y: 0 }
const TAB_SOURCE: TilingDragData = { kind: 'tab', surfaceId: surfaceId('surface-a') }
const WINDOW_SOURCE: TilingDragData = { kind: 'window', windowId: windowId('window-a') }

describe('tiling drop target resolver', () => {
  it('builds root snap candidates as thin hit rails straddling the root edges', () => {
    const layout = createMultiWindowTestLayout()
    const geometry = deriveLayoutGeometry(layout, ROOT_RECT, {
      gapPx: 8,
      minSnapDestinationPx: 44,
      resizeHandleThicknessPx: 8,
      snapEdgeRatio: 0.18,
    })
    const candidates = tilingSnapDestinations({
      activeDrag: null,
      rootRect: ROOT_RECT,
      snapDestinationRects: geometry.snapDestinationRects,
      sourceWindowId: null,
      sourceWindowRect: null,
    })

    const rootTop = rootCandidate(candidates, 'top')
    const rootLeft = rootCandidate(candidates, 'left')
    const rootRight = rootCandidate(candidates, 'right')
    const rootBottom = rootCandidate(candidates, 'bottom')

    expect(soleHitRect(rootTop).y).toBeLessThan(ROOT_RECT.y)
    expect(soleHitRect(rootTop).height).toBeLessThan(ROOT_RECT.height / 4)
    expect(soleHitRect(rootTop).width).toBeGreaterThan(ROOT_RECT.width)
    expect(soleHitRect(rootLeft).x).toBeLessThan(ROOT_RECT.x)
    expect(soleHitRect(rootLeft).width).toBeLessThan(ROOT_RECT.width / 4)
    expect(soleHitRect(rootLeft).height).toBeGreaterThan(ROOT_RECT.height)
    expect(soleHitRect(rootRight).x).toBeGreaterThan(ROOT_RECT.x)
    expect(soleHitRect(rootRight).width).toBeLessThan(ROOT_RECT.width / 4)
    expect(soleHitRect(rootBottom).y).toBeGreaterThan(ROOT_RECT.y)
    expect(soleHitRect(rootBottom).height).toBeLessThan(ROOT_RECT.height / 4)
  })

  it('adds source return and source-vacancy root candidates for window drags', () => {
    const sourceWindowRect: LayoutRect = { height: 600, width: 300, x: 700, y: 0 }
    const candidates = tilingSnapDestinations({
      activeDrag: WINDOW_SOURCE,
      rootRect: ROOT_RECT,
      snapDestinationRects: rootSnapDestinationRects(),
      sourceWindowId: WINDOW_SOURCE.windowId,
      sourceWindowRect,
    })
    const sourceReturn = sourceReturnCandidate(candidates)
    const rootRight = sourceVacancyCandidate(candidates, 'right')
    const rootBottom = sourceVacancyCandidate(candidates, 'bottom')

    expect(sourceReturn.target).toEqual({ kind: 'window', windowId: WINDOW_SOURCE.windowId })
    expect(rootRight.target).toEqual(snapTarget({ edge: 'right', kind: 'root-edge' }))
    expect(rootBottom.target).toEqual(snapTarget({ edge: 'bottom', kind: 'root-edge' }))
    expect(soleHitRect(rootRight).x).toBeGreaterThan(soleHitRect(sourceReturn).x)
    expect(soleHitRect(rootBottom).y).toBeGreaterThan(soleHitRect(sourceReturn).y)
    expect(soleHitRect(rootRight).width).toBeLessThan(sourceWindowRect.width)
    expect(soleHitRect(rootBottom).height).toBeLessThan(sourceWindowRect.height)
  })

  it('resolves the source return core back to the dragged window', () => {
    const sourceWindowRect: LayoutRect = { height: 600, width: 300, x: 700, y: 0 }
    const candidates = tilingSnapDestinations({
      activeDrag: WINDOW_SOURCE,
      rootRect: ROOT_RECT,
      snapDestinationRects: rootSnapDestinationRects(),
      sourceWindowId: WINDOW_SOURCE.windowId,
      sourceWindowRect,
    })
    const result = resolveTarget({
      candidates,
      mode: 'window',
      point: { x: 780, y: 300 },
      source: WINDOW_SOURCE,
      tabTarget: null,
    })

    expect(result?.target).toEqual({ kind: 'window', windowId: WINDOW_SOURCE.windowId })
  })

  it('resolves the source-vacancy corridor to the root edge', () => {
    const sourceWindowRect: LayoutRect = { height: 600, width: 300, x: 700, y: 0 }
    const candidates = tilingSnapDestinations({
      activeDrag: WINDOW_SOURCE,
      rootRect: ROOT_RECT,
      snapDestinationRects: rootSnapDestinationRects(),
      sourceWindowId: WINDOW_SOURCE.windowId,
      sourceWindowRect,
    })
    const result = resolveTarget({
      candidates,
      mode: 'window',
      point: { x: 960, y: 300 },
      source: WINDOW_SOURCE,
      tabTarget: null,
    })

    expect(result?.target).toEqual(snapTarget({ edge: 'right', kind: 'root-edge' }))
  })

  it('resolves the source-vacancy corridor for lone-tab drags to the root edge', () => {
    const sourceWindowRect: LayoutRect = { height: 300, width: 1000, x: 0, y: 0 }
    const candidates = tilingSnapDestinations({
      activeDrag: TAB_SOURCE,
      rootRect: ROOT_RECT,
      snapDestinationRects: rootSnapDestinationRects(),
      sourceWindowId: windowId('window-a'),
      sourceWindowRect,
    })
    // Below the thin root-top rail but inside the corridor over the window
    // the tab vacates.
    const result = resolveTarget({
      candidates,
      mode: 'tab-detached',
      point: { x: 500, y: 60 },
      source: TAB_SOURCE,
      tabTarget: null,
    })

    expect(sourceVacancyCandidate(candidates, 'top').target).toEqual(
      snapTarget({ edge: 'top', kind: 'root-edge' }),
    )
    expect(result?.target).toEqual(snapTarget({ edge: 'top', kind: 'root-edge' }))
  })

  it('clamps window drags outside the root to the nearest root edge', () => {
    const result = resolveTarget({
      candidates: windowDragCandidates(),
      mode: 'window',
      point: { x: 400, y: -160 },
      rootRect: ROOT_RECT,
      source: WINDOW_SOURCE,
      tabTarget: null,
    })

    expect(result?.target).toEqual(snapTarget({ edge: 'top', kind: 'root-edge' }))
  })

  it('ignores tab strip docking halos for off-root window drags', () => {
    const result = resolveTarget({
      candidates: windowDragCandidates(),
      mode: 'window',
      point: { x: 400, y: -20 },
      rootRect: ROOT_RECT,
      source: WINDOW_SOURCE,
      tabPriority: 108,
      tabTarget: tabStripTarget('window-b', 0),
    })

    expect(result?.target).toEqual(snapTarget({ edge: 'top', kind: 'root-edge' }))
  })

  it('keeps window drags eligible for another strip while inside the root', () => {
    const result = resolveTarget({
      candidates: windowDragCandidates(),
      mode: 'window',
      point: { x: 400, y: 4 },
      rootRect: ROOT_RECT,
      source: WINDOW_SOURCE,
      tabPriority: 108,
      tabTarget: tabStripTarget('window-b', 0),
    })

    expect(result?.target).toEqual(tabStripTarget('window-b', 0))
  })

  it('prefers strip docking for detached tabs above the root until the halo is left', () => {
    const tabTarget = tabStripTarget('window-b', 0)
    const result = resolveTarget({
      candidates: tabDragCandidates(),
      mode: 'tab-detached',
      point: { x: 400, y: -20 },
      rootRect: ROOT_RECT,
      source: TAB_SOURCE,
      tabPriority: 108,
      tabTarget,
    })

    expect(result?.target).toEqual(tabTarget)
  })

  it('clamps detached tabs past the docking halo to the root top edge', () => {
    const result = resolveTarget({
      candidates: tabDragCandidates(),
      mode: 'tab-detached',
      point: { x: 400, y: -160 },
      rootRect: ROOT_RECT,
      source: TAB_SOURCE,
      tabTarget: null,
    })

    expect(result?.target).toEqual(snapTarget({ edge: 'top', kind: 'root-edge' }))
  })

  it('resolves attached tab drags to reorder targets instead of snap candidates', () => {
    const tabTarget = tabStripTarget('window-a', 1)
    const result = resolveTarget({
      candidates: [rootCandidateAtPoint()],
      mode: 'tab-reorder',
      source: TAB_SOURCE,
      tabTarget,
    })

    expect(result?.target).toBe(tabTarget)
    expect(result?.candidateId).toBeUndefined()
  })

  it('resolves detached tabs to snap when no strip is active', () => {
    const candidate = rootCandidateAtPoint()
    const result = resolveTarget({
      candidates: [candidate],
      mode: 'tab-detached',
      source: TAB_SOURCE,
      tabTarget: null,
    })

    expect(result?.target).toBe(candidate.target)
    expect(result?.candidateId).toBe(candidate.id)
  })

  it('resolves detached tabs over a strip back to tab insertion', () => {
    const tabTarget = tabStripTarget('window-b', 0)
    const result = resolveTarget({
      candidates: [rootCandidateAtPoint()],
      mode: 'tab-detached',
      source: TAB_SOURCE,
      tabTarget,
    })

    expect(result?.target).toBe(tabTarget)
    expect(result?.candidateId).toBeUndefined()
  })

  it('lets blank-strip and docking tab targets beat internal window edges', () => {
    const tabTarget = tabStripTarget('window-b', 0)
    const windowCandidate = candidate({
      id: 'window-left',
      priority: 90,
      target: snapTarget({ edge: 'left', kind: 'window-edge', windowId: windowId('window-b') }),
    })
    const directResult = resolveTarget({
      candidates: [windowCandidate],
      mode: 'tab-detached',
      source: TAB_SOURCE,
      tabTarget,
    })
    const dockResult = resolveTarget({
      candidates: [windowCandidate],
      mode: 'tab-detached',
      source: TAB_SOURCE,
      tabPriority: 92,
      tabTarget,
    })

    expect(directResult?.target).toBe(tabTarget)
    expect(directResult?.candidateId).toBeUndefined()
    expect(dockResult?.target).toBe(tabTarget)
    expect(dockResult?.candidateId).toBeUndefined()
  })

  it('resolves window drags over another strip to tab insertion over snap zones', () => {
    const tabTarget = tabStripTarget('window-b', 1)
    const windowCandidate = candidate({
      id: 'window-left',
      priority: 105,
      target: snapTarget({ edge: 'left', kind: 'window-edge', windowId: windowId('window-b') }),
    })
    const centerCandidate = candidate({
      id: 'window-center',
      priority: 100,
      target: snapTarget({ kind: 'window-center', windowId: windowId('window-b') }),
    })

    expect(
      resolveTarget({
        candidates: [windowCandidate],
        mode: 'window',
        source: WINDOW_SOURCE,
        tabTarget,
      })?.target,
    ).toBe(tabTarget)
    expect(
      resolveTarget({
        candidates: [centerCandidate],
        mode: 'window',
        source: WINDOW_SOURCE,
        tabTarget,
      })?.target,
    ).toBe(tabTarget)
  })

  it('does not create a merge target for a window dragged over its own strip', () => {
    const result = resolveTarget({
      candidates: [],
      mode: 'window',
      source: WINDOW_SOURCE,
      tabTarget: tabStripTarget('window-a', 1),
    })

    expect(result).toBeNull()
  })

  it('orders overlapping candidates by priority, area, center distance, then id', () => {
    const rootCandidate = candidate({
      id: 'root-left',
      priority: 80,
      target: snapTarget({ edge: 'left', kind: 'root-edge' }),
    })
    const outerWindowCandidate = candidate({
      id: 'window-left',
      priority: 60,
      target: snapTarget({ edge: 'left', kind: 'window-edge', windowId: windowId('window-b') }),
    })
    const windowCandidate = candidate({
      id: 'window-small',
      priority: 90,
      rect: { height: 160, width: 80, x: 0, y: 80 },
      target: snapTarget({ edge: 'left', kind: 'window-edge', windowId: windowId('window-b') }),
    })

    expect(
      resolveTarget({
        candidates: [outerWindowCandidate, rootCandidate],
        mode: 'window',
        source: WINDOW_SOURCE,
        tabTarget: null,
      })?.target,
    ).toBe(rootCandidate.target)
    expect(
      resolveTarget({
        candidates: [rootCandidate, windowCandidate],
        mode: 'window',
        point: { x: 40, y: 100 },
        source: WINDOW_SOURCE,
        tabTarget: null,
      })?.target,
    ).toBe(windowCandidate.target)
  })

  it('keeps sticky targets active while the pointer stays in the inflated hit rect', () => {
    const stickyCandidate = candidate({
      id: 'sticky',
      priority: 80,
      rect: { height: 50, width: 50, x: 0, y: 0 },
    })
    const nextCandidate = candidate({
      id: 'next',
      priority: 80,
      rect: { height: 50, width: 50, x: 60, y: 0 },
    })
    const previousTarget: ResolvedTilingTarget = {
      candidateId: stickyCandidate.id,
      mode: 'window',
      target: stickyCandidate.target,
    }
    const result = resolveTarget({
      candidates: [stickyCandidate, nextCandidate],
      mode: 'window',
      point: { x: 55, y: 25 },
      previousTarget,
      source: WINDOW_SOURCE,
      tabTarget: null,
    })

    expect(result?.target).toBe(stickyCandidate.target)
  })

  it('lets sticky top snap targets hold over strip halos until a direct or foreign hit wins', () => {
    const stickyCandidate = candidate({
      id: 'sticky-window-top',
      priority: 80,
      rect: { height: 60, width: 200, x: 0, y: 0 },
      target: snapTarget({ edge: 'top', kind: 'window-edge', windowId: windowId('window-b') }),
    })
    const previousTarget: ResolvedTilingTarget = {
      candidateId: stickyCandidate.id,
      mode: 'tab-detached',
      target: stickyCandidate.target,
    }
    const tabTarget = tabStripTarget('window-b', 1)
    const dockStickyResult = resolveTarget({
      candidates: [stickyCandidate],
      mode: 'tab-detached',
      point: { x: 80, y: 42 },
      previousTarget,
      source: TAB_SOURCE,
      tabPriority: 108,
      tabTarget,
    })
    const directHitResult = resolveTarget({
      candidates: [stickyCandidate],
      mode: 'tab-detached',
      point: { x: 80, y: 42 },
      previousTarget,
      source: TAB_SOURCE,
      tabTarget,
    })
    const foreignStripResult = resolveTarget({
      candidates: [stickyCandidate],
      mode: 'tab-detached',
      point: { x: 80, y: 42 },
      previousTarget,
      source: TAB_SOURCE,
      sourceWindowId: windowId('window-a'),
      tabPriority: 108,
      tabTarget,
    })

    expect(dockStickyResult?.target).toBe(stickyCandidate.target)
    expect(dockStickyResult?.candidateId).toBe(stickyCandidate.id)
    expect(directHitResult?.target).toBe(tabTarget)
    expect(directHitResult?.candidateId).toBeUndefined()
    expect(foreignStripResult?.target).toBe(tabTarget)
    expect(foreignStripResult?.candidateId).toBeUndefined()
  })
})

function resolveTarget({
  candidates,
  mode,
  point = { x: 40, y: 40 },
  previousTarget = null,
  rootRect = null,
  source,
  sourceWindowId = null,
  tabPriority,
  tabTarget,
}: {
  readonly candidates: readonly TilingDropCandidate[]
  readonly mode: TilingIntentMode
  readonly point?: { readonly x: number; readonly y: number }
  readonly previousTarget?: ResolvedTilingTarget | null
  readonly rootRect?: LayoutRect | null
  readonly source: TilingDragData
  readonly sourceWindowId?: WindowId | null
  readonly tabPriority?: number
  readonly tabTarget: Extract<TilingDropData, { readonly kind: 'tab' | 'tab-strip' }> | null
}) {
  return resolveTilingTarget({
    candidates,
    mode,
    point,
    previousTarget,
    rootRect,
    source,
    sourceWindowId,
    tabTarget: tabTarget ? { priority: tabPriority ?? 110, target: tabTarget } : null,
  })
}

function windowDragCandidates() {
  return tilingSnapDestinations({
    activeDrag: WINDOW_SOURCE,
    rootRect: ROOT_RECT,
    snapDestinationRects: rootSnapDestinationRects(),
    sourceWindowId: windowId('window-a'),
    sourceWindowRect: { height: 600, width: 300, x: 700, y: 0 },
  })
}

function tabDragCandidates() {
  return tilingSnapDestinations({
    activeDrag: TAB_SOURCE,
    rootRect: ROOT_RECT,
    snapDestinationRects: rootSnapDestinationRects(),
    sourceWindowId: null,
    sourceWindowRect: null,
  })
}

function rootCandidate(candidates: readonly TilingDropCandidate[], edge: LayoutEdge) {
  const value = candidates.find(
    (candidate) => candidate.kind === 'root-edge' && candidate.edge === edge,
  )
  expect(value).toBeDefined()

  return value as TilingDropCandidate
}

function soleHitRect(candidate: TilingDropCandidate): LayoutRect {
  expect(candidate.hitRects).toHaveLength(1)

  return candidate.hitRects[0] as LayoutRect
}

function sourceReturnCandidate(candidates: readonly TilingDropCandidate[]) {
  const value = candidates.find((candidate) => candidate.kind === 'source-return')
  expect(value).toBeDefined()

  return value as TilingDropCandidate
}

function sourceVacancyCandidate(candidates: readonly TilingDropCandidate[], edge: LayoutEdge) {
  const value = candidates.find(
    (candidate) => candidate.id.includes('source-vacancy') && candidate.edge === edge,
  )
  expect(value).toBeDefined()

  return value as TilingDropCandidate
}

function rootCandidateAtPoint() {
  return candidate({
    id: 'root-left',
    priority: 80,
    target: snapTarget({ edge: 'left', kind: 'root-edge' }),
  })
}

function candidate({
  id,
  priority,
  rect = { height: 100, width: 100, x: 0, y: 0 },
  target = snapTarget({ edge: 'left', kind: 'root-edge' }),
}: {
  readonly id: string
  readonly priority: number
  readonly rect?: LayoutRect
  readonly target?: TilingDropData
}): TilingDropCandidate {
  return {
    edge: 'left',
    hitRects: [rect],
    id,
    kind: 'root-edge',
    label: id,
    priority,
    target,
  }
}

function tabStripTarget(
  windowIdValue: string,
  index: number,
): Extract<TilingDropData, { readonly kind: 'tab-strip' }> {
  return { index, kind: 'tab-strip', windowId: windowId(windowIdValue) }
}

function snapTarget(destination: SnapDestination): TilingDropData {
  return { destination, kind: 'snap-destination' }
}

function rootSnapDestinationRects(): readonly SnapDestinationLayoutRect[] {
  return [
    rootSnapDestinationRect('left', { height: 600, width: 180, x: 0, y: 0 }),
    rootSnapDestinationRect('right', { height: 600, width: 180, x: 820, y: 0 }),
    rootSnapDestinationRect('top', { height: 108, width: 1000, x: 0, y: 0 }),
    rootSnapDestinationRect('bottom', { height: 108, width: 1000, x: 0, y: 492 }),
  ]
}

function rootSnapDestinationRect(edge: LayoutEdge, rect: LayoutRect): SnapDestinationLayoutRect {
  return {
    destination: { edge, kind: 'root-edge' as const },
    edge,
    id: overlayId(`snap:root:${edge}`),
    kind: 'root-edge' as const,
    rect,
  }
}

function surfaceId(value: string) {
  return value as SurfaceId
}

function windowId(value: string) {
  return value as WindowId
}
