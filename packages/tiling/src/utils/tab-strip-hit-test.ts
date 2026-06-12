import {
  targetBelongsToTabStrip,
  type TilingDragData,
  type TilingDropData,
} from '@workspace/tiling/utils/drag-data'
import {
  distanceFromRange,
  formatPoint,
  type PointerCoordinates,
  type PointerTravel,
} from '@workspace/tiling/utils/geometry-primitives'
import type { SurfaceId, WindowId } from '@workspace/tiling/utils/layout-types'

export type TilingTabStripHit = {
  readonly strength: 'direct' | 'dock' | 'strip'
  readonly target: Extract<TilingDropData, { readonly kind: 'tab' | 'tab-strip' }>
}

export type TabStripBodyAutoscrollInput = {
  readonly onAutoScroll: (() => void) | null
  readonly point: PointerCoordinates
  readonly stripElement: HTMLElement
  readonly windowElement: HTMLElement
}

export type TabStripBodyAutoscroller = {
  readonly stop: () => void
  readonly update: (input: TabStripBodyAutoscrollInput) => void
}

type TabStripTabEntry = {
  readonly afterPreviewBlock: boolean
  readonly element: HTMLElement
}

type TabStripMiss = {
  readonly directInside: boolean
  readonly dockInside: boolean
  readonly horizontalDistance: number
  readonly id: string
  readonly ownsSource: boolean
  readonly verticalDistance: number
}

const TAB_STRIP_REORDER_SLOP_PX = 20
const TAB_STRIP_PREVIEW_EDGE_SLOP_PX = 12
const TAB_STRIP_TRAILING_EDGE_SLOP_PX = 36
const TAB_STRIP_DOCK_ABOVE_SLOP_PX = 44
const TAB_STRIP_DOCK_BELOW_SLOP_PX = 44
const TAB_STRIP_DOCK_HORIZONTAL_SLOP_PX = 48
const TAB_STRIP_BODY_AUTOSCROLL_EDGE_PX = 160
const TAB_STRIP_BODY_AUTOSCROLL_MAX_STEP_PX = 14
const TAB_STRIP_BODY_INDEX_HYSTERESIS_PX = 18
const WINDOW_BODY_CENTER_EDGE_RATIO = 0.18
const WINDOW_BODY_CENTER_MIN_EDGE_PX = 44
const WINDOW_BODY_CENTER_MAX_EDGE_RATIO = 0.35

export function resolveTabStripDropTarget(
  source: TilingDragData,
  target: TilingDropData,
  point: PointerCoordinates,
): TilingDropData {
  if (!validPointerCoordinates(point)) return target

  const sourceTabId = sourceTabIdForDrag(source)
  const stripAtPoint = tabStripElementAtPoint(source, point)
  if (stripAtPoint) return tabStripTargetForPoint(stripAtPoint, point, { sourceTabId })
  if (!targetBelongsToTabStrip(target)) return target

  const targetStrip = tabStripElementForWindow(target.windowId)
  if (!targetStrip) return target
  if (!pointIsNearTabStrip(targetStrip, point)) return target

  return tabStripTargetForPoint(targetStrip, point, { sourceTabId })
}

export function tabStripDropHitAtPoint(
  source: TilingDragData,
  point: PointerCoordinates,
  options: {
    readonly dockTravel?: PointerTravel | null
  } = {},
): TilingTabStripHit | null {
  if (!validPointerCoordinates(point)) return null

  const sourceTabId = sourceTabIdForDrag(source)
  const stripAtPoint = tabStripElementAtPoint(source, point)
  if (stripAtPoint) {
    return {
      strength: 'direct',
      target: tabStripTargetForPoint(stripAtPoint, point, { sourceTabId }),
    }
  }

  const dockingStrip = tabStripElementNearDockingPoint(source, point, options.dockTravel ?? null)
  if (!dockingStrip) return null

  return {
    strength: 'dock',
    target: tabStripTargetForPoint(dockingStrip, point, { sourceTabId }),
  }
}

export function describeTabStripHitTest(
  source: TilingDragData,
  point: PointerCoordinates,
  options: {
    readonly dockTravel?: PointerTravel | null
  } = {},
) {
  if (!validPointerCoordinates(point)) return `invalid point ${formatPoint(point)}`

  const directStrip = tabStripElementAtPoint(source, point)
  if (directStrip) return `direct strip ${tabStripElementId(directStrip)}`

  const travel = options.dockTravel ?? null
  const travelLabel = travel ? `${travel.vertical}/${travel.horizontal}` : 'none'
  const dockingStrip = tabStripElementNearDockingPoint(source, point, travel)
  if (dockingStrip) return `dock strip ${tabStripElementId(dockingStrip)} travel=${travelLabel}`

  const miss = nearestTabStripMiss(source, point)
  if (!miss) return 'no tab strips mounted'

  return [
    `nearest strip ${miss.id}`,
    `dx=${Math.round(miss.horizontalDistance)}`,
    `dy=${Math.round(miss.verticalDistance)}`,
    `direct=${miss.directInside ? 'yes' : 'no'}`,
    `dock=${miss.dockInside ? 'yes' : 'no'}`,
    `source=${miss.ownsSource ? 'yes' : 'no'}`,
    `travel=${travelLabel}`,
  ].join(' ')
}

export function tabStripDropTargetForWindowAtPoint(
  windowId: WindowId,
  point: PointerCoordinates,
  options: {
    readonly sourceTabId?: SurfaceId | null
  } = {},
): TilingDropData | null {
  if (!validPointerCoordinates(point)) return null

  const targetStrip = tabStripElementForWindow(windowId)
  if (!targetStrip) return null
  if (!pointIsNearTabStrip(targetStrip, point)) return null

  return tabStripTargetForPoint(targetStrip, point, { sourceTabId: options.sourceTabId })
}

export function pointIsInsideTabStripForWindow(windowId: WindowId, point: PointerCoordinates) {
  if (!validPointerCoordinates(point)) return false

  const stripElement = tabStripElementForWindow(windowId)
  if (!stripElement) return false

  return pointIsInsideTabStripBand(stripElement, point, 0)
}

export function tabStripDropTargetForWindowBodyPoint(
  windowId: WindowId,
  point: PointerCoordinates,
  options: {
    readonly bodyAutoscroller?: TabStripBodyAutoscroller | null
    readonly onAutoScroll?: (() => void) | null
    readonly previousIndex?: number | null
    readonly scroll?: boolean
    readonly sourceTabId?: SurfaceId | null
  } = {},
): TilingDropData | null {
  if (!validPointerCoordinates(point)) return null

  const targetStrip = tabStripElementForWindow(windowId)
  if (!targetStrip) return null

  const windowElement = tilingWindowElementForId(windowId)
  if (!windowElement) {
    return tabStripTargetForPoint(targetStrip, point, { sourceTabId: options.sourceTabId })
  }

  if (options.scroll !== false) {
    scrollTabStripForBodyPoint(targetStrip, windowElement, point)
  }
  options.bodyAutoscroller?.update({
    onAutoScroll: options.onAutoScroll ?? null,
    point,
    stripElement: targetStrip,
    windowElement,
  })

  return tabStripTargetForPoint(
    targetStrip,
    projectedTabStripPointForWindowBody(targetStrip, windowElement, point),
    { previousIndex: options.previousIndex, sourceTabId: options.sourceTabId },
  )
}

export function tilingWindowCenterElementAtPoint(point: PointerCoordinates) {
  return tilingWindowElements()
    .filter((element) => pointIsInsideWindowCenter(element, point))
    .toSorted((left, right) => elementArea(left) - elementArea(right))[0]
}

export function pointIsInsideTilingWindowCenter(
  windowId: WindowId,
  point: PointerCoordinates,
  inflatePx = 0,
) {
  const element = tilingWindowElementForId(windowId)
  if (!element) return false

  return pointIsInsideWindowCenter(element, point, inflatePx)
}

export function tabStripDropTargetMatchesPoint(target: TilingDropData, point: PointerCoordinates) {
  if (!validPointerCoordinates(point)) return false
  if (!targetBelongsToTabStrip(target)) return true

  const targetStrip = tabStripElementForWindow(target.windowId)
  if (!targetStrip) return false

  return pointIsNearTabStrip(targetStrip, point)
}

function validPointerCoordinates(point: PointerCoordinates) {
  return Number.isFinite(point.x) && Number.isFinite(point.y)
}

function sourceTabIdForDrag(source: TilingDragData): SurfaceId | null {
  if (source.kind !== 'tab') return null

  return source.surfaceId
}

function tabStripTargetForPoint(
  stripElement: HTMLElement,
  point: PointerCoordinates,
  options: {
    readonly previousIndex?: number | null
    readonly sourceTabId?: SurfaceId | null
  } = {},
): Extract<TilingDropData, { readonly kind: 'tab-strip' }> {
  return {
    index: tabInsertionIndexForPoint(stripElement, point, options),
    kind: 'tab-strip',
    windowId: stripElement.dataset.tilingTabStripId as WindowId,
  }
}

function tabInsertionIndexForPoint(
  stripElement: HTMLElement,
  point: PointerCoordinates,
  options: {
    readonly previousIndex?: number | null
    readonly sourceTabId?: SurfaceId | null
  },
) {
  // Insertion indices count the strip without the dragged tab and without
  // preview-block elements: commits remove the source and apply the index to
  // the pre-preview layout, and previews lay the strip out the same way.
  const { previewBlockPresent, tabEntries } = tabStripTabEntries(stripElement, options.sourceTabId)
  const pointCoordinate = tabStripContentCoordinateForPoint(stripElement, point)
  const proposedIndex = proposedTabInsertionIndex(
    tabEntries,
    stripElement,
    pointCoordinate,
    previewBlockPresent,
  )
  // The near-edge boundaries around a preview block sit a block-width apart,
  // so they already provide the anti-jitter gap the midpoint hysteresis adds.
  if (previewBlockPresent) return proposedIndex

  return stableTabInsertionIndex({
    pointCoordinate,
    previousIndex: options.previousIndex ?? null,
    proposedIndex,
    stripElement,
    tabElements: tabEntries.map((entry) => entry.element),
  })
}

function proposedTabInsertionIndex(
  tabEntries: readonly TabStripTabEntry[],
  stripElement: HTMLElement,
  pointCoordinate: number,
  previewBlockPresent: boolean,
) {
  for (const [index, entry] of tabEntries.entries()) {
    const range = tabElementContentRange(stripElement, entry.element)
    if (pointCoordinate < insertionBoundaryForEntry(range, entry, previewBlockPresent)) return index
  }

  return tabEntries.length
}

// While a preview block occupies the strip it has already pushed the
// neighboring tabs a full block-width aside, so the midpoint rule would add
// half a tab of over-drag on every step. With a block present the boundary
// moves to the neighbor's near edge: nudging onto the next tab advances the
// slot and nudging back onto the previous one retreats it, matching the feel
// of a native in-strip sort.
function insertionBoundaryForEntry(
  range: { readonly end: number; readonly start: number },
  entry: TabStripTabEntry,
  previewBlockPresent: boolean,
) {
  if (!previewBlockPresent) return range.start + (range.end - range.start) / 2
  if (entry.afterPreviewBlock) return range.start + TAB_STRIP_PREVIEW_EDGE_SLOP_PX

  return range.end - TAB_STRIP_PREVIEW_EDGE_SLOP_PX
}

function stableTabInsertionIndex({
  pointCoordinate,
  previousIndex,
  proposedIndex,
  stripElement,
  tabElements,
}: {
  readonly pointCoordinate: number
  readonly previousIndex: number | null
  readonly proposedIndex: number
  readonly stripElement: HTMLElement
  readonly tabElements: readonly HTMLElement[]
}) {
  if (previousIndex === null) return proposedIndex
  if (previousIndex === proposedIndex) return proposedIndex
  if (Math.abs(previousIndex - proposedIndex) !== 1) return proposedIndex

  const boundary = tabInsertionBoundaryCoordinate(
    stripElement,
    tabElements,
    Math.min(previousIndex, proposedIndex),
  )
  if (boundary === null) return proposedIndex
  if (proposedIndex > previousIndex) {
    return stableIndexForRightMove(pointCoordinate, boundary, previousIndex, proposedIndex)
  }

  return stableIndexForLeftMove(pointCoordinate, boundary, previousIndex, proposedIndex)
}

function stableIndexForRightMove(
  pointCoordinate: number,
  boundary: number,
  previousIndex: number,
  proposedIndex: number,
) {
  if (pointCoordinate < boundary + TAB_STRIP_BODY_INDEX_HYSTERESIS_PX) return previousIndex

  return proposedIndex
}

function stableIndexForLeftMove(
  pointCoordinate: number,
  boundary: number,
  previousIndex: number,
  proposedIndex: number,
) {
  if (pointCoordinate > boundary - TAB_STRIP_BODY_INDEX_HYSTERESIS_PX) return previousIndex

  return proposedIndex
}

function tabInsertionBoundaryCoordinate(
  stripElement: HTMLElement,
  tabElements: readonly HTMLElement[],
  index: number,
) {
  const tabElement = tabElements[index]
  if (!tabElement) return null

  const range = tabElementContentRange(stripElement, tabElement)

  return range.start + (range.end - range.start) / 2
}

function tabStripContentCoordinateForPoint(stripElement: HTMLElement, point: PointerCoordinates) {
  const rect = stripElement.getBoundingClientRect()

  if (tabStripOrientation(stripElement) === 'vertical') {
    return stripElement.scrollTop + point.y - rect.top
  }

  return stripElement.scrollLeft + point.x - rect.left
}

function tabElementContentRange(stripElement: HTMLElement, tabElement: HTMLElement) {
  const stripRect = stripElement.getBoundingClientRect()
  const tabRect = tabElement.getBoundingClientRect()

  if (tabStripOrientation(stripElement) === 'vertical') {
    return {
      end: stripElement.scrollTop + tabRect.bottom - stripRect.top,
      start: stripElement.scrollTop + tabRect.top - stripRect.top,
    }
  }

  return {
    end: stripElement.scrollLeft + tabRect.right - stripRect.left,
    start: stripElement.scrollLeft + tabRect.left - stripRect.left,
  }
}

function tabStripOrientation(stripElement: HTMLElement) {
  if (stripElement.dataset.tilingTabStripOrientation === 'vertical') return 'vertical'

  return 'horizontal'
}

function tabStripTabEntries(stripElement: HTMLElement, sourceTabId?: SurfaceId | null) {
  const tabIds = new Set<string>()
  const tabEntries: TabStripTabEntry[] = []
  let previewBlockPresent = false

  for (const child of stripElement.children) {
    if (!(child instanceof HTMLElement)) continue
    if (child.dataset.tilingTabPreview) {
      previewBlockPresent = true
      continue
    }
    if (!child.dataset.tilingTabId) continue
    if (child.dataset.tilingTabId === sourceTabId) continue
    if (tabIds.has(child.dataset.tilingTabId)) continue

    tabIds.add(child.dataset.tilingTabId)
    tabEntries.push({ afterPreviewBlock: previewBlockPresent, element: child })
  }

  return { previewBlockPresent, tabEntries }
}

function tabStripElementAtPoint(source: TilingDragData, point: PointerCoordinates) {
  for (const stripElement of tabStripElements()) {
    if (sourceWindowOwnsTabStrip(source, stripElement)) continue
    if (!pointIsInsideTabStripBand(stripElement, point, 0)) continue

    return stripElement
  }

  return null
}

function tabStripElementNearDockingPoint(
  source: TilingDragData,
  point: PointerCoordinates,
  travel: PointerTravel | null,
) {
  const candidates = tabStripElements().flatMap((stripElement) => {
    if (sourceWindowOwnsTabStrip(source, stripElement)) return []
    if (!pointIsInsideTabStripDockingBand(stripElement, point)) return []
    if (!tabStripMatchesDockTravel(stripElement, point, travel)) return []

    return [{ score: tabStripDockingScore(stripElement, point), stripElement }]
  })
  const closest = candidates.toSorted((left, right) => left.score - right.score)[0]
  if (!closest) return null

  return closest.stripElement
}

function sourceWindowOwnsTabStrip(source: TilingDragData, stripElement: HTMLElement) {
  if (source.kind !== 'window') return false

  return stripElement.dataset.tilingTabStripId === source.windowId
}

function tabStripElementForWindow(windowId: WindowId) {
  return tabStripElements().find((element) => element.dataset.tilingTabStripId === windowId) ?? null
}

function tabStripElements() {
  if (typeof document === 'undefined') return []

  return Array.from(document.querySelectorAll<HTMLElement>('[data-tiling-tab-strip-id]'))
}

function tilingWindowElementForId(windowId: WindowId) {
  return (
    tilingWindowElements().find((element) => element.dataset.tilingWindowId === windowId) ?? null
  )
}

function tilingWindowElements() {
  if (typeof document === 'undefined') return []

  return Array.from(document.querySelectorAll<HTMLElement>('[data-tiling-window-id]'))
}

function pointIsInsideWindowCenter(element: HTMLElement, point: PointerCoordinates, inflatePx = 0) {
  const rect = element.getBoundingClientRect()
  const centerRect = windowBodyCenterRect(rect, inflatePx)

  return (
    point.x >= centerRect.left &&
    point.x <= centerRect.right &&
    point.y >= centerRect.top &&
    point.y <= centerRect.bottom
  )
}

// Body points project straight onto the strip in the middle of the body
// center so the insertion slot tracks the pointer 1:1 — one tab width of
// movement moves the tab one slot. Overflowing strips get the autoscroll
// snap toward the hidden content; otherwise the edge zones compress the
// strip range left outside the body center, keeping the extreme insertion
// indices reachable (the body center is inset from the window, so a plain
// clamp could never reach slots under the first tabs of a wide strip).
function projectedTabStripPointForWindowBody(
  stripElement: HTMLElement,
  windowElement: HTMLElement,
  point: PointerCoordinates,
): PointerCoordinates {
  const centerRect = windowBodyCenterRect(windowElement.getBoundingClientRect())
  const stripRect = stripElement.getBoundingClientRect()
  const autoscrollPoint = projectedTabStripAutoscrollPoint(
    stripElement,
    stripRect,
    centerRect,
    point,
  )
  if (autoscrollPoint) return autoscrollPoint

  if (tabStripOrientation(stripElement) === 'vertical') {
    return {
      x: stripRect.left + stripRect.width / 2,
      y: bodyCoordinateProjectedToStrip(
        point.y,
        { max: centerRect.bottom, min: centerRect.top },
        { max: stripRect.bottom - 1, min: stripRect.top + 1 },
      ),
    }
  }

  return {
    x: bodyCoordinateProjectedToStrip(
      point.x,
      { max: centerRect.right, min: centerRect.left },
      { max: stripRect.right - 1, min: stripRect.left + 1 },
    ),
    y: stripRect.top + stripRect.height / 2,
  }
}

function bodyCoordinateProjectedToStrip(
  value: number,
  center: { readonly max: number; readonly min: number },
  strip: { readonly max: number; readonly min: number },
) {
  const clamped = clamp(value, strip.min, strip.max)
  const edgeSize = Math.min(TAB_STRIP_BODY_AUTOSCROLL_EDGE_PX, (center.max - center.min) / 3)
  if (edgeSize <= 0) return clamped

  const startZoneEnd = center.min + edgeSize
  if (value < startZoneEnd && strip.min < startZoneEnd) {
    const reach = clamp((value - center.min) / edgeSize, 0, 1)

    return clamp(strip.min + reach * (startZoneEnd - strip.min), strip.min, strip.max)
  }

  const endZoneStart = center.max - edgeSize
  if (value > endZoneStart && strip.max > endZoneStart) {
    const reach = clamp((center.max - value) / edgeSize, 0, 1)

    return clamp(strip.max - reach * (strip.max - endZoneStart), strip.min, strip.max)
  }

  return clamped
}

// Snapping the projected point to a strip extreme is only meaningful while
// autoscroll can actually move the strip; otherwise it would make insertion
// indices near the edges unreachable from the window body.
function projectedTabStripAutoscrollPoint(
  stripElement: HTMLElement,
  stripRect: DOMRect,
  centerRect: ReturnType<typeof windowBodyCenterRect>,
  point: PointerCoordinates,
): PointerCoordinates | null {
  const vertical = tabStripOrientation(stripElement) === 'vertical'
  const delta = vertical
    ? edgeScrollDelta(point.y, centerRect.top, centerRect.bottom)
    : edgeScrollDelta(point.x, centerRect.left, centerRect.right)
  if (delta === 0) return null
  if (!tabStripCanScrollByDelta(stripElement, delta)) return null
  if (vertical) {
    return {
      x: stripRect.left + stripRect.width / 2,
      y: delta < 0 ? stripRect.top + 1 : stripRect.bottom - 1,
    }
  }

  return {
    x: delta < 0 ? stripRect.left + 1 : stripRect.right - 1,
    y: stripRect.top + stripRect.height / 2,
  }
}

function tabStripCanScrollByDelta(stripElement: HTMLElement, delta: number) {
  if (delta < 0) return tabStripScrollPosition(stripElement) > 0
  if (tabStripOrientation(stripElement) === 'vertical') {
    return stripElement.scrollTop + stripElement.clientHeight < stripElement.scrollHeight - 1
  }

  return stripElement.scrollLeft + stripElement.clientWidth < stripElement.scrollWidth - 1
}

export function scrollTabStripForBodyPoint(
  stripElement: HTMLElement,
  windowElement: HTMLElement,
  point: PointerCoordinates,
) {
  const centerRect = windowBodyCenterRect(windowElement.getBoundingClientRect())

  if (tabStripOrientation(stripElement) === 'vertical') {
    return scrollTabStripByDelta(
      stripElement,
      edgeScrollDelta(point.y, centerRect.top, centerRect.bottom),
    )
  }

  return scrollTabStripByDelta(
    stripElement,
    edgeScrollDelta(point.x, centerRect.left, centerRect.right),
  )
}

function scrollTabStripByDelta(stripElement: HTMLElement, delta: number) {
  if (delta === 0) return false

  const before = tabStripScrollPosition(stripElement)
  setTabStripScrollPosition(stripElement, before + delta)

  return tabStripScrollPosition(stripElement) !== before
}

function tabStripScrollPosition(stripElement: HTMLElement) {
  if (tabStripOrientation(stripElement) === 'vertical') return stripElement.scrollTop

  return stripElement.scrollLeft
}

function setTabStripScrollPosition(stripElement: HTMLElement, value: number) {
  if (tabStripOrientation(stripElement) === 'vertical') {
    stripElement.scrollTop = value
    return
  }

  stripElement.scrollLeft = value
}

export function tabStripBodyAutoscrollCanAdvance(
  stripElement: HTMLElement,
  windowElement: HTMLElement,
  point: PointerCoordinates,
) {
  const centerRect = windowBodyCenterRect(windowElement.getBoundingClientRect())

  if (tabStripOrientation(stripElement) === 'vertical') {
    return edgeScrollDelta(point.y, centerRect.top, centerRect.bottom) !== 0
  }

  return edgeScrollDelta(point.x, centerRect.left, centerRect.right) !== 0
}

function windowBodyCenterRect(rect: DOMRect, inflatePx = 0) {
  const horizontalInset = windowBodyCenterInset(rect.width)
  const verticalInset = windowBodyCenterInset(rect.height)

  return {
    bottom: rect.bottom - verticalInset + inflatePx,
    left: rect.left + horizontalInset - inflatePx,
    right: rect.right - horizontalInset + inflatePx,
    top: rect.top + verticalInset - inflatePx,
  }
}

function windowBodyCenterInset(size: number) {
  const proportionalInset = size * WINDOW_BODY_CENTER_EDGE_RATIO
  const maxInset = size * WINDOW_BODY_CENTER_MAX_EDGE_RATIO

  return Math.min(maxInset, Math.max(WINDOW_BODY_CENTER_MIN_EDGE_PX, proportionalInset))
}

function edgeScrollDelta(value: number, min: number, max: number) {
  if (max <= min) return 0

  const edgeSize = Math.min(TAB_STRIP_BODY_AUTOSCROLL_EDGE_PX, (max - min) / 3)
  if (edgeSize <= 0) return 0

  const startDistance = value - min
  if (startDistance < edgeSize) return -edgeScrollStep(edgeSize - startDistance, edgeSize)

  const endDistance = max - value
  if (endDistance < edgeSize) return edgeScrollStep(edgeSize - endDistance, edgeSize)

  return 0
}

function edgeScrollStep(edgeOverlap: number, edgeSize: number) {
  const intensity = clamp(edgeOverlap / edgeSize, 0, 1)
  const easedIntensity = intensity * intensity

  return Math.max(1, Math.ceil(easedIntensity * TAB_STRIP_BODY_AUTOSCROLL_MAX_STEP_PX))
}

function elementArea(element: HTMLElement) {
  const rect = element.getBoundingClientRect()

  return rect.width * rect.height
}

function nearestTabStripMiss(source: TilingDragData, point: PointerCoordinates) {
  const misses = tabStripElements().map((element) => tabStripMiss(source, element, point))

  return misses.toSorted((left, right) => tabStripMissScore(left) - tabStripMissScore(right))[0]
}

function tabStripMiss(
  source: TilingDragData,
  element: HTMLElement,
  point: PointerCoordinates,
): TabStripMiss {
  const rect = element.getBoundingClientRect()

  return {
    directInside: pointIsInsideTabStripBand(element, point, 0),
    dockInside: pointIsInsideTabStripDockingBand(element, point),
    horizontalDistance: distanceFromRange(point.x, rect.left, rect.right),
    id: tabStripElementId(element),
    ownsSource: sourceWindowOwnsTabStrip(source, element),
    verticalDistance: distanceFromRange(point.y, rect.top, rect.bottom),
  }
}

function tabStripMissScore(miss: TabStripMiss) {
  return miss.verticalDistance * 10 + miss.horizontalDistance
}

function tabStripElementId(element: HTMLElement) {
  return element.dataset.tilingTabStripId ?? 'unknown'
}

function pointIsInsideTabStripBand(
  element: HTMLElement,
  point: PointerCoordinates,
  crossAxisSlop: number,
) {
  const rect = element.getBoundingClientRect()
  const trailingSlop = TAB_STRIP_TRAILING_EDGE_SLOP_PX
  if (tabStripOrientation(element) === 'vertical') {
    return (
      point.x >= rect.left - crossAxisSlop &&
      point.x <= rect.right + crossAxisSlop &&
      point.y >= rect.top - trailingSlop &&
      point.y <= rect.bottom + trailingSlop
    )
  }

  return (
    point.x >= rect.left - trailingSlop &&
    point.x <= rect.right + trailingSlop &&
    point.y >= rect.top - crossAxisSlop &&
    point.y <= rect.bottom + crossAxisSlop
  )
}

function pointIsNearTabStrip(element: HTMLElement, point: PointerCoordinates) {
  return pointIsInsideTabStripBand(element, point, TAB_STRIP_REORDER_SLOP_PX)
}

function pointIsInsideTabStripDockingBand(element: HTMLElement, point: PointerCoordinates) {
  const rect = element.getBoundingClientRect()
  if (tabStripOrientation(element) === 'vertical') {
    return (
      point.x >= rect.left - TAB_STRIP_DOCK_ABOVE_SLOP_PX &&
      point.x <= rect.right + TAB_STRIP_DOCK_BELOW_SLOP_PX &&
      point.y >= rect.top - TAB_STRIP_DOCK_HORIZONTAL_SLOP_PX &&
      point.y <= rect.bottom + TAB_STRIP_DOCK_HORIZONTAL_SLOP_PX
    )
  }

  return (
    point.x >= rect.left - TAB_STRIP_DOCK_HORIZONTAL_SLOP_PX &&
    point.x <= rect.right + TAB_STRIP_DOCK_HORIZONTAL_SLOP_PX &&
    point.y >= rect.top - TAB_STRIP_DOCK_ABOVE_SLOP_PX &&
    point.y <= rect.bottom + TAB_STRIP_DOCK_BELOW_SLOP_PX
  )
}

function tabStripDockingScore(element: HTMLElement, point: PointerCoordinates) {
  const rect = element.getBoundingClientRect()
  const verticalDistance = distanceFromRange(point.y, rect.top, rect.bottom)
  const horizontalDistance = distanceFromRange(point.x, rect.left, rect.right)
  if (tabStripOrientation(element) === 'vertical') return horizontalDistance * 10 + verticalDistance

  return verticalDistance * 10 + horizontalDistance
}

// Docking halos engage only for strips the pointer travels toward; this keeps
// a strip from recapturing a tab that is being dragged away while letting the
// same halo catch the tab on the way back.
function tabStripMatchesDockTravel(
  element: HTMLElement,
  point: PointerCoordinates,
  travel: PointerTravel | null,
) {
  if (!travel) return true

  const rect = element.getBoundingClientRect()
  if (tabStripOrientation(element) === 'vertical') {
    if (point.x < rect.left) return travel.horizontal !== 'left'
    if (point.x > rect.right) return travel.horizontal !== 'right'

    return true
  }

  if (point.y < rect.top) return travel.vertical !== 'up'
  if (point.y > rect.bottom) return travel.vertical !== 'down'

  return true
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
