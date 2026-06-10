import { expect, test } from '../../../../test/fixtures'
import type { TilingDragData, TilingDropData } from '@workspace/tiling/utils/drag-data'
import {
  resolveTilingTarget,
  type TilingIntentMode,
  type ResolvedTilingTarget,
} from '@workspace/tiling/utils/drop-target-resolver'
import {
  tilingSnapDestinations,
  type TilingDropCandidate,
} from '@workspace/tiling/utils/snap-destinations'
import { createProofScenarioModel } from '@/features/dnd-proof/utils/model'
import { overlayId } from '@workspace/tiling/utils/layout-ids'
import {
  deriveLayoutGeometry,
  type LayoutRect,
  type SnapDestinationLayoutRect,
} from '@workspace/tiling/utils/layout-geometry'
import type {
  LayoutEdge,
  SnapDestination,
  SurfaceId,
  WindowId,
} from '@workspace/tiling/utils/layout-types'

const ROOT_RECT: LayoutRect = { height: 600, width: 1000, x: 0, y: 0 }
const TAB_SOURCE: TilingDragData = { kind: 'tab', surfaceId: surfaceId('surface-a') }
const WINDOW_SOURCE: TilingDragData = { kind: 'window', windowId: windowId('window-a') }

test('root snap candidates preview full edges but hit only the outer edge rail', () => {
  const model = createProofScenarioModel(3)
  const geometry = deriveLayoutGeometry(model.layout, ROOT_RECT, {
    gapPx: 8,
    minSnapDestinationPx: 44,
    resizeHandleThicknessPx: 8,
    snapEdgeRatio: 0.18,
  })
  const candidates = tilingSnapDestinations({
    activeDrag: null,
    rootRect: ROOT_RECT,
    snapDestinationRects: geometry.snapDestinationRects,
    sourceWindowRect: null,
    sourceWindowId: null,
  })

  const rootTop = rootCandidate(candidates, 'top')
  const rootLeft = rootCandidate(candidates, 'left')
  const rootRight = rootCandidate(candidates, 'right')
  const rootBottom = rootCandidate(candidates, 'bottom')

  expect(rootTop.previewRect.y).toBe(ROOT_RECT.y)
  expect(rootTop.previewRect.x).toBe(ROOT_RECT.x)
  expect(rootTop.previewRect.width).toBe(ROOT_RECT.width)
  expect(rootLeft.previewRect.y).toBe(ROOT_RECT.y)
  expect(rootLeft.previewRect.height).toBe(ROOT_RECT.height)
  expect(rootRight.previewRect.y).toBe(ROOT_RECT.y)
  expect(rootRight.previewRect.height).toBe(ROOT_RECT.height)
  expect(rootBottom.previewRect.x).toBe(ROOT_RECT.x)
  expect(rootBottom.previewRect.width).toBe(ROOT_RECT.width)
  expect(rootTop.hitRect.y).toBeLessThan(ROOT_RECT.y)
  expect(rootTop.hitRect.height).toBeLessThan(rootTop.previewRect.height)
  expect(rootLeft.hitRect.x).toBeLessThan(ROOT_RECT.x)
  expect(rootLeft.hitRect.width).toBeLessThan(rootLeft.previewRect.width)
  expect(rootRight.hitRect.x).toBeGreaterThan(ROOT_RECT.x)
  expect(rootRight.hitRect.width).toBeLessThan(rootRight.previewRect.width)
  expect(rootBottom.hitRect.y).toBeGreaterThan(ROOT_RECT.y)
  expect(rootBottom.hitRect.height).toBeLessThan(rootBottom.previewRect.height)
})

test('window drags add source return and source-vacancy root candidates', () => {
  const sourceWindowRect: LayoutRect = { height: 600, width: 300, x: 700, y: 0 }
  const candidates = tilingSnapDestinations({
    activeDrag: WINDOW_SOURCE,
    rootRect: ROOT_RECT,
    snapDestinationRects: rootSnapDestinationRects(),
    sourceWindowRect,
    sourceWindowId: WINDOW_SOURCE.windowId,
  })
  const sourceReturn = sourceReturnCandidate(candidates)
  const rootRight = sourceVacancyCandidate(candidates, 'right')
  const rootBottom = sourceVacancyCandidate(candidates, 'bottom')

  expect(sourceReturn.target).toEqual({ kind: 'window', windowId: WINDOW_SOURCE.windowId })
  expect(rootRight.target).toEqual(snapTarget({ edge: 'right', kind: 'root-edge' }))
  expect(rootBottom.target).toEqual(snapTarget({ edge: 'bottom', kind: 'root-edge' }))
  expect(rootRight.hitRect.x).toBeGreaterThan(sourceReturn.hitRect.x)
  expect(rootBottom.hitRect.y).toBeGreaterThan(sourceReturn.hitRect.y)
  expect(rootRight.hitRect.width).toBeLessThan(sourceWindowRect.width)
  expect(rootBottom.hitRect.height).toBeLessThan(sourceWindowRect.height)
})

test('window source return core resolves to the source window', () => {
  const sourceWindowRect: LayoutRect = { height: 600, width: 300, x: 700, y: 0 }
  const candidates = tilingSnapDestinations({
    activeDrag: WINDOW_SOURCE,
    rootRect: ROOT_RECT,
    snapDestinationRects: rootSnapDestinationRects(),
    sourceWindowRect,
    sourceWindowId: WINDOW_SOURCE.windowId,
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

test('window source vacancy corridor resolves to a root edge', () => {
  const sourceWindowRect: LayoutRect = { height: 600, width: 300, x: 700, y: 0 }
  const candidates = tilingSnapDestinations({
    activeDrag: WINDOW_SOURCE,
    rootRect: ROOT_RECT,
    snapDestinationRects: rootSnapDestinationRects(),
    sourceWindowRect,
    sourceWindowId: WINDOW_SOURCE.windowId,
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

test('attached tab over its strip resolves to tab reorder instead of snap', () => {
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

test('detached tab past the detach threshold resolves to snap when no strip is active', () => {
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

test('detached tab over a tab strip resolves back to tab insertion', () => {
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

test('detached tab inside a blank strip beats an internal window edge', () => {
  const tabTarget = tabStripTarget('window-b', 0)
  const windowCandidate = candidate({
    id: 'window-left',
    priority: 90,
    target: snapTarget({ edge: 'left', kind: 'window-edge', windowId: windowId('window-b') }),
  })
  const result = resolveTarget({
    candidates: [windowCandidate],
    mode: 'tab-detached',
    source: TAB_SOURCE,
    tabTarget,
  })

  expect(result?.target).toBe(tabTarget)
  expect(result?.candidateId).toBeUndefined()
})

test('detached tab docking halo beats an internal window edge', () => {
  const tabTarget = tabStripTarget('window-b', 0)
  const windowCandidate = candidate({
    id: 'window-left',
    priority: 90,
    target: snapTarget({ edge: 'left', kind: 'window-edge', windowId: windowId('window-b') }),
  })
  const result = resolveTarget({
    candidates: [windowCandidate],
    mode: 'tab-detached',
    source: TAB_SOURCE,
    tabPriority: 92,
    tabTarget,
  })

  expect(result?.target).toBe(tabTarget)
  expect(result?.candidateId).toBeUndefined()
})

test('detached tab direct strip hit beats an internal window edge', () => {
  const tabTarget = tabStripTarget('window-b', 0)
  const windowCandidate = candidate({
    id: 'window-left',
    priority: 90,
    target: snapTarget({ edge: 'left', kind: 'window-edge', windowId: windowId('window-b') }),
  })
  const result = resolveTarget({
    candidates: [windowCandidate],
    mode: 'tab-detached',
    source: TAB_SOURCE,
    tabTarget,
  })

  expect(result?.target).toBe(tabTarget)
  expect(result?.candidateId).toBeUndefined()
})

test('window over another tab strip resolves to tab insertion over window snap', () => {
  const tabTarget = tabStripTarget('window-b', 1)
  const windowCandidate = candidate({
    id: 'window-left',
    priority: 105,
    target: snapTarget({ edge: 'left', kind: 'window-edge', windowId: windowId('window-b') }),
  })
  const result = resolveTarget({
    candidates: [windowCandidate],
    mode: 'window',
    source: WINDOW_SOURCE,
    tabTarget,
  })

  expect(result?.target).toBe(tabTarget)
  expect(result?.candidateId).toBeUndefined()
})

test('window over another tab strip resolves to tab insertion over window center', () => {
  const tabTarget = tabStripTarget('window-b', 1)
  const centerCandidate = candidate({
    id: 'window-center',
    priority: 100,
    target: snapTarget({ kind: 'window-center', windowId: windowId('window-b') }),
  })
  const result = resolveTarget({
    candidates: [centerCandidate],
    mode: 'window',
    source: WINDOW_SOURCE,
    tabTarget,
  })

  expect(result?.target).toBe(tabTarget)
  expect(result?.candidateId).toBeUndefined()
})

test('window over its own source strip does not create a merge target', () => {
  const result = resolveTarget({
    candidates: [],
    mode: 'window',
    source: WINDOW_SOURCE,
    tabTarget: tabStripTarget('window-a', 1),
  })

  expect(result).toBeNull()
})

test('root edge beats an outer window edge at the workspace boundary', () => {
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
  const result = resolveTarget({
    candidates: [outerWindowCandidate, rootCandidate],
    mode: 'window',
    source: WINDOW_SOURCE,
    tabTarget: null,
  })

  expect(result?.target).toBe(rootCandidate.target)
})

test('internal window edge beats a larger root zone', () => {
  const rootCandidate = candidate({
    id: 'root-left',
    priority: 80,
    rect: { height: 600, width: 200, x: 0, y: 0 },
    target: snapTarget({ edge: 'left', kind: 'root-edge' }),
  })
  const windowCandidate = candidate({
    id: 'window-left',
    priority: 90,
    rect: { height: 160, width: 80, x: 0, y: 80 },
    target: snapTarget({ edge: 'left', kind: 'window-edge', windowId: windowId('window-b') }),
  })
  const result = resolveTarget({
    candidates: [rootCandidate, windowCandidate],
    mode: 'window',
    point: { x: 40, y: 100 },
    source: WINDOW_SOURCE,
    tabTarget: null,
  })

  expect(result?.target).toBe(windowCandidate.target)
})

test('sticky target prevents flicker between adjacent overlapping zones', () => {
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

test('sticky snap target remains active over tab insertion until its hit rect is left', () => {
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
  const result = resolveTarget({
    candidates: [stickyCandidate],
    mode: 'tab-detached',
    point: { x: 80, y: 42 },
    previousTarget,
    source: TAB_SOURCE,
    tabTarget: tabStripTarget('window-b', 1),
  })

  expect(result?.target).toBe(stickyCandidate.target)
  expect(result?.candidateId).toBe(stickyCandidate.id)
})

test('sticky top snap does not block direct docking into another strip', () => {
  const stickyCandidate = candidate({
    id: 'sticky-window-top',
    priority: 80,
    rect: { height: 60, width: 200, x: 0, y: 0 },
    target: snapTarget({ edge: 'top', kind: 'window-edge', windowId: windowId('window-b') }),
  })
  const tabTarget = tabStripTarget('window-b', 1)
  const previousTarget: ResolvedTilingTarget = {
    candidateId: stickyCandidate.id,
    mode: 'tab-detached',
    target: stickyCandidate.target,
  }
  const result = resolveTarget({
    candidates: [stickyCandidate],
    mode: 'tab-detached',
    point: { x: 80, y: 42 },
    previousTarget,
    source: TAB_SOURCE,
    sourceWindowId: windowId('window-a'),
    tabTarget,
  })

  expect(result?.target).toBe(tabTarget)
  expect(result?.candidateId).toBeUndefined()
})

function resolveTarget({
  candidates,
  mode,
  point = { x: 40, y: 40 },
  previousTarget = null,
  source,
  sourceWindowId = null,
  tabPriority,
  tabTarget,
}: {
  readonly candidates: readonly TilingDropCandidate[]
  readonly mode: TilingIntentMode
  readonly point?: { readonly x: number; readonly y: number }
  readonly previousTarget?: ResolvedTilingTarget | null
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
    source,
    sourceWindowId,
    tabTarget: tabTarget ? { priority: tabPriority ?? 110, target: tabTarget } : null,
  })
}

function rootCandidate(candidates: readonly TilingDropCandidate[], edge: LayoutEdge) {
  const candidate = candidates.find((value) => value.kind === 'root-edge' && value.edge === edge)
  expect(candidate).toBeDefined()

  return candidate as TilingDropCandidate
}

function sourceReturnCandidate(candidates: readonly TilingDropCandidate[]) {
  const candidate = candidates.find((value) => value.kind === 'source-return')
  expect(candidate).toBeDefined()

  return candidate as TilingDropCandidate
}

function sourceVacancyCandidate(candidates: readonly TilingDropCandidate[], edge: LayoutEdge) {
  const candidate = candidates.find(
    (value) => value.id.includes('source-vacancy') && value.edge === edge,
  )
  expect(candidate).toBeDefined()

  return candidate as TilingDropCandidate
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
    hitRect: rect,
    id,
    kind: 'root-edge',
    label: id,
    previewRect: rect,
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
