import { describe, expect, it } from 'vitest'

import { applyLayoutOperation } from '@workspace/tiling'
import { deriveLayoutGeometry, type LayoutRect } from '@workspace/tiling/utils/layout-geometry'
import {
  createEmptyWorkspaceLayout,
  createPlaceholderSurface,
} from '@workspace/tiling/utils/layout-builders'
import { moveSurface, openSurface, tabSurface } from '@workspace/tiling/utils/layout-operations'
import { checkWorkspaceLayoutInvariants } from '@workspace/tiling/utils/layout-invariants'
import {
  visibleSurfaceIdsInOrder,
  visibleWindowIdsInOrder,
} from '@workspace/tiling/utils/layout-normalize'
import type {
  LayoutEdge,
  LayoutNodeId,
  LayoutOperation,
  SnapDestination,
  SurfaceId,
  WindowId,
  WorkspaceLayout,
} from '@workspace/tiling/utils/layout-types'

const ITERATIONS = 3000
const SEEDS = [1, 2, 3, 4, 5]
const EDGES: readonly LayoutEdge[] = ['left', 'right', 'top', 'bottom']
const ROOT_RECT: LayoutRect = { height: 660, width: 1200, x: 0, y: 0 }
const GEOMETRY_OPTIONS = { collapsedWindowHeaderPx: 40, gapPx: 8 }
// A rendered window overlapping a sibling by more than this fraction of the
// smaller window is a tiling violation: tiled windows must not stack.
const MAX_OVERLAP_RATIO = 0.05

// Drives the exact production mutation pipeline a real drop commits to
// (moveWindow / moveSurface / tabSurface / collapse / expand / reorder /
// split via applyLayoutOperation) over long randomized sequences, asserting
// the tree stays coherent and no surface silently vanishes.
describe('tiling drag-commit fuzz', () => {
  for (const seed of SEEDS) {
    it(`keeps every surface reachable across ${ITERATIONS} random moves (seed ${seed})`, () => {
      const random = mulberry32(seed)
      let layout = buildFuzzLayout(3, 2)

      const startReport = checkWorkspaceLayoutInvariants(layout)
      expect(startReport.violations).toEqual([])

      const initialSurfaceIds = sortedSurfaceIds(layout)
      const initialVisibleIds = sortedVisibleIds(layout)
      const history: string[] = []

      for (let step = 0; step < ITERATIONS; step += 1) {
        const operation = randomOperation(random, layout)
        if (!operation) continue

        history.push(describeOperation(operation))
        layout = applyOperation(layout, operation, { history, initialSurfaceIds, seed, step })
        assertHealthy(layout, { history, initialSurfaceIds, initialVisibleIds, seed, step })
      }
    })
  }
})

function applyOperation(
  layout: WorkspaceLayout,
  operation: LayoutOperation,
  context: FailureContext,
): WorkspaceLayout {
  try {
    return applyLayoutOperation(layout, operation)
  } catch (error) {
    throw new Error(
      report({
        ...context,
        failures: [`applyLayoutOperation threw: ${errorText(error)}`],
        layout,
      }),
    )
  }
}

// ---------------------------------------------------------------------------
// Random operations — mirror the gestures the drag controller commits.
// ---------------------------------------------------------------------------

function randomOperation(random: () => number, layout: WorkspaceLayout): LayoutOperation | null {
  const builders = [
    moveWindowToRootEdge,
    moveWindowToWindowEdge,
    moveWindowToCenter,
    moveSurfaceToRootEdge,
    moveSurfaceToWindowEdge,
    tabSurfaceIntoWindow,
    reorderWindowSurface,
    collapseRandomWindow,
    expandRandomWindow,
    splitRandomWindow,
  ]
  const builder = pick(random, builders)
  if (!builder) return null

  return builder(random, layout)
}

function moveWindowToRootEdge(
  random: () => number,
  layout: WorkspaceLayout,
): LayoutOperation | null {
  const windowId = pick(random, visibleWindowIdsInOrder(layout))
  if (!windowId) return null

  return {
    destination: { edge: pickEdge(random), kind: 'root-edge' },
    type: 'moveWindow',
    windowId,
  }
}

function moveWindowToWindowEdge(
  random: () => number,
  layout: WorkspaceLayout,
): LayoutOperation | null {
  const windowId = pick(random, visibleWindowIdsInOrder(layout))
  const target = pickOtherWindow(random, layout, windowId)
  if (!windowId || !target) return null

  return {
    destination: { edge: pickEdge(random), kind: 'window-edge', windowId: target },
    type: 'moveWindow',
    windowId,
  }
}

function moveWindowToCenter(random: () => number, layout: WorkspaceLayout): LayoutOperation | null {
  const windowId = pick(random, visibleWindowIdsInOrder(layout))
  const target = pickOtherWindow(random, layout, windowId)
  if (!windowId || !target) return null

  return {
    destination: { kind: 'window-center', windowId: target },
    type: 'moveWindow',
    windowId,
  }
}

function moveSurfaceToRootEdge(
  random: () => number,
  layout: WorkspaceLayout,
): LayoutOperation | null {
  const surfaceId = pick(random, visibleSurfaceIdsInOrder(layout))
  if (!surfaceId) return null

  return {
    destination: { edge: pickEdge(random), kind: 'root-edge' },
    surfaceId,
    type: 'moveSurface',
  }
}

function moveSurfaceToWindowEdge(
  random: () => number,
  layout: WorkspaceLayout,
): LayoutOperation | null {
  const surfaceId = pick(random, visibleSurfaceIdsInOrder(layout))
  const target = pick(random, visibleWindowIdsInOrder(layout))
  if (!surfaceId || !target) return null

  return {
    destination: { edge: pickEdge(random), kind: 'window-edge', windowId: target },
    surfaceId,
    type: 'moveSurface',
  }
}

function tabSurfaceIntoWindow(
  random: () => number,
  layout: WorkspaceLayout,
): LayoutOperation | null {
  const surfaceId = pick(random, visibleSurfaceIdsInOrder(layout))
  const targetWindowId = pick(random, visibleWindowIdsInOrder(layout))
  if (!surfaceId || !targetWindowId) return null

  const target = layout.windowsById[targetWindowId]
  const index = Math.floor(random() * ((target?.surfaceIds.length ?? 0) + 1))

  return { index, surfaceId, targetWindowId, type: 'tabSurface' }
}

function reorderWindowSurface(
  random: () => number,
  layout: WorkspaceLayout,
): LayoutOperation | null {
  const windowId = pick(random, visibleWindowIdsInOrder(layout))
  const window = windowId ? layout.windowsById[windowId] : undefined
  if (!windowId || !window || window.surfaceIds.length < 2) return null

  const fromIndex = Math.floor(random() * window.surfaceIds.length)
  const toIndex = Math.floor(random() * window.surfaceIds.length)

  return { fromIndex, toIndex, type: 'reorderSurface', windowId }
}

function collapseRandomWindow(
  random: () => number,
  layout: WorkspaceLayout,
): LayoutOperation | null {
  const windowId = pick(random, visibleWindowIdsInOrder(layout))
  if (!windowId) return null

  const edge = random() < 0.25 ? undefined : pickEdge(random)

  return { edge, type: 'collapseWindow', windowId }
}

function expandRandomWindow(random: () => number, layout: WorkspaceLayout): LayoutOperation | null {
  const collapsed = visibleWindowIdsInOrder(layout).filter(
    (windowId) => layout.windowsById[windowId]?.mode === 'collapsed',
  )
  const windowId = pick(random, collapsed)
  if (!windowId) return null

  return { type: 'expandWindow', windowId }
}

function splitRandomWindow(random: () => number, layout: WorkspaceLayout): LayoutOperation | null {
  const windowId = pick(random, visibleWindowIdsInOrder(layout))
  const sourceWindowId = pickOtherWindow(random, layout, windowId)
  if (!windowId || !sourceWindowId) return null

  return { edge: pickEdge(random), sourceWindowId, type: 'splitWindow', windowId }
}

// ---------------------------------------------------------------------------
// Health invariants
// ---------------------------------------------------------------------------

type FailureContext = {
  readonly history: readonly string[]
  readonly initialSurfaceIds: readonly string[]
  readonly seed: number
  readonly step: number
}

function assertHealthy(
  layout: WorkspaceLayout,
  context: FailureContext & { readonly initialVisibleIds: readonly string[] },
) {
  const failures = collectFailures(layout, context)
  if (failures.length === 0) return

  throw new Error(report({ ...context, failures, layout }))
}

function collectFailures(
  layout: WorkspaceLayout,
  context: {
    readonly initialSurfaceIds: readonly string[]
    readonly initialVisibleIds: readonly string[]
  },
): string[] {
  const failures: string[] = []

  const report = checkWorkspaceLayoutInvariants(layout)
  for (const violation of report.violations) {
    failures.push(`invariant ${violation.code}: ${violation.message}`)
  }

  const surfaceIds = sortedSurfaceIds(layout)
  if (!sameIds(surfaceIds, context.initialSurfaceIds)) {
    failures.push(
      `surface registry changed: expected ${context.initialSurfaceIds.length}` +
        ` got ${surfaceIds.length} [${surfaceIds.map(short).join(', ')}]`,
    )
  }

  const visibleIds = sortedVisibleIds(layout)
  if (!sameIds(visibleIds, context.initialVisibleIds)) {
    failures.push(
      `visible surface set changed: expected [${context.initialVisibleIds
        .map(short)
        .join(', ')}] got [${visibleIds.map(short).join(', ')}]`,
    )
  }

  pushGeometryFailures(layout, failures)

  return failures
}

// Tiled windows must partition the surface: no window may render with zero
// area, spill outside the surface, or overlap a sibling.
function pushGeometryFailures(layout: WorkspaceLayout, failures: string[]) {
  const geometry = deriveLayoutGeometry(layout, ROOT_RECT, GEOMETRY_OPTIONS)
  const rects = visibleWindowIdsInOrder(layout).flatMap((windowId) => {
    const rect = geometry.windowRectsById[windowId]?.rect
    if (!rect) return []

    return [{ rect, windowId }]
  })

  for (const { rect, windowId } of rects) {
    if (rect.width < 1 || rect.height < 1) {
      failures.push(`window ${short(windowId)} has zero area ${rectText(rect)}`)
    }
    if (spillsOutside(rect)) {
      failures.push(`window ${short(windowId)} spills outside surface ${rectText(rect)}`)
    }
  }

  pushOverlapFailures(rects, failures)
}

function pushOverlapFailures(
  rects: ReadonlyArray<{ readonly rect: LayoutRect; readonly windowId: WindowId }>,
  failures: string[],
) {
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      const a = rects[i]
      const b = rects[j]
      if (!a || !b) continue

      const overlap = overlapArea(a.rect, b.rect)
      const smaller = Math.min(area(a.rect), area(b.rect))
      if (smaller <= 0 || overlap <= MAX_OVERLAP_RATIO * smaller) continue

      failures.push(
        `windows ${short(a.windowId)} ${rectText(a.rect)} and ${short(b.windowId)} ${rectText(
          b.rect,
        )} overlap ${Math.round((100 * overlap) / smaller)}% of the smaller`,
      )
    }
  }
}

function spillsOutside(rect: LayoutRect) {
  return (
    rect.x < ROOT_RECT.x - 1 ||
    rect.y < ROOT_RECT.y - 1 ||
    rect.x + rect.width > ROOT_RECT.x + ROOT_RECT.width + 1 ||
    rect.y + rect.height > ROOT_RECT.y + ROOT_RECT.height + 1
  )
}

function overlapArea(a: LayoutRect, b: LayoutRect) {
  const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))

  return x * y
}

function area(rect: LayoutRect) {
  return rect.width * rect.height
}

function rectText(rect: LayoutRect) {
  return `[${Math.round(rect.x)},${Math.round(rect.y)} ${Math.round(rect.width)}x${Math.round(
    rect.height,
  )}]`
}

function report({
  failures,
  history,
  layout,
  seed,
  step,
}: FailureContext & { readonly failures: readonly string[]; readonly layout: WorkspaceLayout }) {
  return [
    `Drag-commit fuzz broke at seed ${seed}, step ${step}.`,
    '',
    'Failures:',
    ...failures.map((failure) => `  - ${failure}`),
    '',
    'Layout:',
    describeLayout(layout),
    '',
    'Last operations:',
    ...history.slice(-20).map((entry, index) => `  ${history.length - 20 + index}: ${entry}`),
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Layout construction + helpers
// ---------------------------------------------------------------------------

function buildFuzzLayout(windowCount: number, tabsPerWindow: number): WorkspaceLayout {
  let layout = createEmptyWorkspaceLayout()
  let surfaceNumber = 1

  for (let index = 0; index < windowCount; index += 1) {
    const surface = fuzzSurface(surfaceNumber)
    surfaceNumber += 1
    layout = openSurface(layout, surface)
    if (index > 0) {
      layout = moveSurface(layout, surface.id, { edge: 'right', kind: 'root-edge' })
    }
  }

  for (const windowId of visibleWindowIdsInOrder(layout)) {
    for (let tab = 1; tab < tabsPerWindow; tab += 1) {
      const surface = fuzzSurface(surfaceNumber)
      surfaceNumber += 1
      layout = openSurface(layout, surface)
      layout = tabSurface(layout, surface.id, windowId)
    }
  }

  return layout
}

function fuzzSurface(surfaceNumber: number) {
  return createPlaceholderSurface({
    canClose: true,
    canCollapse: true,
    contextKey: `fuzz:${surfaceNumber}`,
    title: `Surface ${surfaceNumber}`,
  })
}

function pickOtherWindow(
  random: () => number,
  layout: WorkspaceLayout,
  windowId: WindowId | undefined,
) {
  const others = visibleWindowIdsInOrder(layout).filter((candidate) => candidate !== windowId)

  return pick(random, others)
}

function sortedSurfaceIds(layout: WorkspaceLayout) {
  return Object.keys(layout.surfacesById).sort()
}

function sortedVisibleIds(layout: WorkspaceLayout) {
  return [...visibleSurfaceIdsInOrder(layout)].sort()
}

function describeLayout(layout: WorkspaceLayout) {
  const windows = visibleWindowIdsInOrder(layout).map((id) => {
    const window = layout.windowsById[id]
    const surfaces = window?.surfaceIds.map(short).join(', ') ?? ''

    return `  ${short(id)} [${window?.mode ?? '?'}${
      window?.collapsedEdge ? `:${window.collapsedEdge}` : ''
    }]: ${surfaces}`
  })
  const railIds = layout.rail.backgroundSurfaceIds.map(short).join(', ')

  return [
    `  root=${layout.rootNodeId ? short(layout.rootNodeId) : 'null'}`,
    `  nodes=${describeNode(layout, layout.rootNodeId)}`,
    ...windows,
    `  rail.background=[${railIds}]`,
  ].join('\n')
}

function describeNode(layout: WorkspaceLayout, nodeId: LayoutNodeId | null): string {
  if (!nodeId) return 'null'

  const node = layout.nodesById[nodeId]
  if (!node) return `<missing ${short(nodeId)}>`
  if (node.kind === 'window') return short(node.windowId)

  const children = node.childIds.map((childId) => describeNode(layout, childId)).join(' ')

  return `(${node.axis[0]} ${children})`
}

function describeOperation(operation: LayoutOperation): string {
  if (operation.type === 'moveWindow') {
    return `moveWindow ${short(operation.windowId)} -> ${destinationText(operation.destination)}`
  }
  if (operation.type === 'moveSurface') {
    return `moveSurface ${short(operation.surfaceId)} -> ${destinationText(operation.destination)}`
  }
  if (operation.type === 'tabSurface') {
    return `tabSurface ${short(operation.surfaceId)} -> ${short(operation.targetWindowId)}@${operation.index}`
  }
  if (operation.type === 'reorderSurface') {
    return `reorder ${short(operation.windowId)} ${operation.fromIndex}->${operation.toIndex}`
  }
  if (operation.type === 'collapseWindow') {
    return `collapse ${short(operation.windowId)} ${operation.edge ?? 'auto'}`
  }
  if (operation.type === 'expandWindow') return `expand ${short(operation.windowId)}`
  if (operation.type === 'splitWindow') {
    return `split ${short(operation.windowId)} <- ${short(operation.sourceWindowId ?? '?')} ${operation.edge}`
  }

  return operation.type
}

function destinationText(destination: SnapDestination): string {
  if (destination.kind === 'root-edge') return `root:${destination.edge}`
  if (destination.kind === 'window-edge') {
    return `${short(destination.windowId)}:${destination.edge}`
  }
  if (destination.kind === 'window-center') return `${short(destination.windowId)}:center`

  return destination.kind
}

function pick<TItem>(random: () => number, items: readonly TItem[]): TItem | undefined {
  if (items.length === 0) return undefined

  return items[Math.floor(random() * items.length)]
}

function pickEdge(random: () => number): LayoutEdge {
  return EDGES[Math.floor(random() * EDGES.length)] ?? 'right'
}

function sameIds(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false

  return left.every((id, index) => id === right[index])
}

function short(id: SurfaceId | WindowId | string) {
  const parts = id.split(':')
  if (parts.length <= 2) return id

  return parts.slice(-2).join(':')
}

function errorText(error: unknown) {
  if (error instanceof Error) return error.message

  return String(error)
}

function mulberry32(seed: number) {
  let state = seed >>> 0

  return () => {
    state += 0x6d2b79f5
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
