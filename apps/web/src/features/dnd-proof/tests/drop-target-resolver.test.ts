import { expect, test } from '../../../../test/fixtures'
import type { DndProofDragData, DndProofDropData } from '@/features/dnd-proof/utils/drag-data'
import {
  resolveDndProofTarget,
  type DndProofIntentMode,
  type ResolvedDndProofTarget,
} from '@/features/dnd-proof/utils/drop-target-resolver'
import {
  proofSnapDestinations,
  type DndProofDropCandidate,
} from '@/features/dnd-proof/utils/snap-destinations'
import { createProofScenarioModel } from '@/features/dnd-proof/utils/model'
import {
  deriveLayoutGeometry,
  type LayoutRect,
} from '@/features/tiling-surface-manager/engine/layout-geometry'
import type {
  LayoutEdge,
  SnapDestination,
  SurfaceId,
  WindowId,
} from '@/features/tiling-surface-manager/engine/layout-types'

const ROOT_RECT: LayoutRect = { height: 600, width: 1000, x: 0, y: 0 }
const TAB_SOURCE: DndProofDragData = { kind: 'tab', surfaceId: surfaceId('surface-a') }
const WINDOW_SOURCE: DndProofDragData = { kind: 'window', windowId: windowId('window-a') }

test('root snap candidates preview full edges but hit only the outer edge rail', () => {
  const model = createProofScenarioModel(3)
  const geometry = deriveLayoutGeometry(model.layout, ROOT_RECT, {
    gapPx: 8,
    minSnapDestinationPx: 44,
    resizeHandleThicknessPx: 8,
    snapEdgeRatio: 0.18,
  })
  const candidates = proofSnapDestinations({
    activeDrag: null,
    rootRect: ROOT_RECT,
    snapDestinationRects: geometry.snapDestinationRects,
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
  const previousTarget: ResolvedDndProofTarget = {
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

function resolveTarget({
  candidates,
  mode,
  point = { x: 40, y: 40 },
  previousTarget = null,
  source,
  tabPriority,
  tabTarget,
}: {
  readonly candidates: readonly DndProofDropCandidate[]
  readonly mode: DndProofIntentMode
  readonly point?: { readonly x: number; readonly y: number }
  readonly previousTarget?: ResolvedDndProofTarget | null
  readonly source: DndProofDragData
  readonly tabPriority?: number
  readonly tabTarget: Extract<DndProofDropData, { readonly kind: 'tab' | 'tab-strip' }> | null
}) {
  return resolveDndProofTarget({
    candidates,
    mode,
    point,
    previousTarget,
    source,
    tabTarget: tabTarget ? { priority: tabPriority ?? 110, target: tabTarget } : null,
  })
}

function rootCandidate(candidates: readonly DndProofDropCandidate[], edge: LayoutEdge) {
  const candidate = candidates.find((value) => value.kind === 'root-edge' && value.edge === edge)
  expect(candidate).toBeDefined()

  return candidate as DndProofDropCandidate
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
  readonly target?: DndProofDropData
}): DndProofDropCandidate {
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
): Extract<DndProofDropData, { readonly kind: 'tab-strip' }> {
  return { index, kind: 'tab-strip', windowId: windowId(windowIdValue) }
}

function snapTarget(destination: SnapDestination): DndProofDropData {
  return { destination, kind: 'snap-destination' }
}

function surfaceId(value: string) {
  return value as SurfaceId
}

function windowId(value: string) {
  return value as WindowId
}
