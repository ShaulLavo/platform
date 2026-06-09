import type { DndProofDragData, DndProofDropData } from '@/features/dnd-proof/utils/drag-data'
import type { LayoutRect } from '@/features/tiling-surface-manager/engine/layout-geometry'
import type { WindowId } from '@/features/tiling-surface-manager/engine/layout-types'

type PointerCoordinates = {
  readonly x: number
  readonly y: number
}

type TabDockingDirection = 'down' | 'left' | 'none' | 'right' | 'up'
type TabStripOrientation = 'horizontal' | 'vertical'

export type DndProofTabStripHit = {
  readonly strength: 'direct' | 'dock' | 'strip'
  readonly target: Extract<DndProofDropData, { readonly kind: 'tab' | 'tab-strip' }>
}

type TabStripMiss = {
  readonly directInside: boolean
  readonly dockInside: boolean
  readonly horizontalDistance: number
  readonly id: string
  readonly ownsSource: boolean
  readonly verticalDistance: number
}

type BodyAutoscrollState = {
  readonly onAutoScroll: (() => void) | null
  readonly point: PointerCoordinates
  frameId: number | null
  readonly stripElement: HTMLElement
  readonly windowElement: HTMLElement
}

const TAB_STRIP_REORDER_SLOP_PX = 20
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

let bodyAutoscrollState: BodyAutoscrollState | null = null

export function resolveTabStripDropTarget(
  source: DndProofDragData,
  target: DndProofDropData,
  point: PointerCoordinates,
): DndProofDropData {
  if (!validPointerCoordinates(point)) return target

  const stripAtPoint = tabStripElementAtPoint(source, point)
  if (stripAtPoint) return tabStripTargetForPoint(stripAtPoint, point)
  if (!targetBelongsToTabStrip(target)) return target

  const targetStrip = tabStripElementForWindow(target.windowId)
  if (!targetStrip) return target
  if (!pointIsNearTabStrip(targetStrip, point)) return target

  return tabStripTargetForPoint(targetStrip, point)
}

export function tabStripDropTargetAtPoint(
  source: DndProofDragData,
  point: PointerCoordinates,
  options: {
    readonly sourceStripOrientation?: TabStripOrientation | null
    readonly sourceStripRect?: LayoutRect | null
  } = {},
): DndProofDropData | null {
  return tabStripDropHitAtPoint(source, point, options)?.target ?? null
}

export function tabStripDropHitAtPoint(
  source: DndProofDragData,
  point: PointerCoordinates,
  options: {
    readonly sourceStripOrientation?: TabStripOrientation | null
    readonly sourceStripRect?: LayoutRect | null
  } = {},
): DndProofTabStripHit | null {
  if (!validPointerCoordinates(point)) return null

  const stripAtPoint = tabStripElementAtPoint(source, point)
  if (stripAtPoint) {
    return {
      strength: 'direct',
      target: tabStripTargetForPoint(stripAtPoint, point),
    }
  }

  const dockingStrip = tabStripElementNearDockingPoint(
    source,
    point,
    options.sourceStripRect ?? null,
    options.sourceStripOrientation ?? null,
  )
  if (!dockingStrip) return null

  return {
    strength: 'dock',
    target: tabStripTargetForPoint(dockingStrip, point),
  }
}

export function describeTabStripHitTest(
  source: DndProofDragData,
  point: PointerCoordinates,
  options: {
    readonly sourceStripOrientation?: TabStripOrientation | null
    readonly sourceStripRect?: LayoutRect | null
  } = {},
) {
  if (!validPointerCoordinates(point)) return `invalid point ${formatPoint(point)}`

  const directStrip = tabStripElementAtPoint(source, point)
  if (directStrip) return `direct strip ${tabStripElementId(directStrip)}`

  const direction = tabDockingDirection(
    options.sourceStripRect ?? null,
    options.sourceStripOrientation ?? null,
    point,
  )
  const dockingStrip = tabStripElementNearDockingPoint(
    source,
    point,
    options.sourceStripRect ?? null,
    options.sourceStripOrientation ?? null,
  )
  if (dockingStrip) return `dock strip ${tabStripElementId(dockingStrip)} dir=${direction}`

  const miss = nearestTabStripMiss(source, point)
  if (!miss) return 'no tab strips mounted'

  return [
    `nearest strip ${miss.id}`,
    `dx=${Math.round(miss.horizontalDistance)}`,
    `dy=${Math.round(miss.verticalDistance)}`,
    `direct=${miss.directInside ? 'yes' : 'no'}`,
    `dock=${miss.dockInside ? 'yes' : 'no'}`,
    `source=${miss.ownsSource ? 'yes' : 'no'}`,
    `dir=${direction}`,
  ].join(' ')
}

export function tabStripDropTargetForWindowAtPoint(
  windowId: WindowId,
  point: PointerCoordinates,
): DndProofDropData | null {
  if (!validPointerCoordinates(point)) return null

  const targetStrip = tabStripElementForWindow(windowId)
  if (!targetStrip) return null
  if (!pointIsNearTabStrip(targetStrip, point)) return null

  return tabStripTargetForPoint(targetStrip, point)
}

export function tabStripDropTargetForWindowBodyPoint(
  windowId: WindowId,
  point: PointerCoordinates,
  options: {
    readonly continuousAutoscroll?: boolean
    readonly onAutoScroll?: (() => void) | null
    readonly previousIndex?: number | null
    readonly scroll?: boolean
  } = {},
): DndProofDropData | null {
  if (!validPointerCoordinates(point)) return null

  const targetStrip = tabStripElementForWindow(windowId)
  if (!targetStrip) return null

  const windowElement = proofWindowElementForId(windowId)
  if (!windowElement) return tabStripTargetForPoint(targetStrip, point)

  if (options.scroll !== false) {
    scrollTabStripForBodyPoint(targetStrip, windowElement, point)
  }
  updateTabStripBodyAutoscroll({
    continuous: options.continuousAutoscroll ?? false,
    onAutoScroll: options.onAutoScroll ?? null,
    point,
    stripElement: targetStrip,
    windowElement,
  })

  return tabStripTargetForPoint(
    targetStrip,
    projectedTabStripPointForWindowBody(targetStrip, windowElement, point),
    { previousIndex: options.previousIndex },
  )
}

export function stopTabStripBodyAutoscroll() {
  const frameId = bodyAutoscrollState?.frameId ?? null
  if (frameId !== null) {
    cancelAnimationFrame(frameId)
  }
  bodyAutoscrollState = null
}

export function proofWindowCenterElementAtPoint(point: PointerCoordinates) {
  return proofWindowElements()
    .filter((element) => pointIsInsideWindowCenter(element, point))
    .toSorted((left, right) => elementArea(left) - elementArea(right))[0]
}

export function pointIsInsideProofWindowCenter(
  windowId: WindowId,
  point: PointerCoordinates,
  inflatePx = 0,
) {
  const element = proofWindowElementForId(windowId)
  if (!element) return false

  return pointIsInsideWindowCenter(element, point, inflatePx)
}

export function tabStripDropTargetMatchesPoint(
  target: DndProofDropData,
  point: PointerCoordinates,
) {
  if (!validPointerCoordinates(point)) return false
  if (!targetBelongsToTabStrip(target)) return true

  const targetStrip = tabStripElementForWindow(target.windowId)
  if (!targetStrip) return false

  return pointIsNearTabStrip(targetStrip, point)
}

function validPointerCoordinates(point: PointerCoordinates) {
  return Number.isFinite(point.x) && Number.isFinite(point.y)
}

function targetBelongsToTabStrip(
  target: DndProofDropData,
): target is Extract<DndProofDropData, { readonly kind: 'tab' | 'tab-strip' }> {
  return target.kind === 'tab' || target.kind === 'tab-strip'
}

function tabStripTargetForPoint(
  stripElement: HTMLElement,
  point: PointerCoordinates,
  options: {
    readonly previousIndex?: number | null
  } = {},
): Extract<DndProofDropData, { readonly kind: 'tab-strip' }> {
  return {
    index: tabInsertionIndexForPoint(stripElement, point, options.previousIndex ?? null),
    kind: 'tab-strip',
    windowId: stripElement.dataset.proofTabStripId as WindowId,
  }
}

function tabInsertionIndexForPoint(
  stripElement: HTMLElement,
  point: PointerCoordinates,
  previousIndex: number | null,
) {
  const tabElements = uniqueTabElements(stripElement)
  const pointCoordinate = tabStripContentCoordinateForPoint(stripElement, point)
  const proposedIndex = proposedTabInsertionIndex(tabElements, stripElement, pointCoordinate)

  return stableTabInsertionIndex({
    pointCoordinate,
    previousIndex,
    proposedIndex,
    stripElement,
    tabElements,
  })
}

function proposedTabInsertionIndex(
  tabElements: readonly HTMLElement[],
  stripElement: HTMLElement,
  pointCoordinate: number,
) {
  for (const [index, tabElement] of tabElements.entries()) {
    const range = tabElementContentRange(stripElement, tabElement)
    if (pointCoordinate < range.start + (range.end - range.start) / 2) return index
  }

  return tabElements.length
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
  if (stripElement.dataset.proofTabStripOrientation === 'vertical') return 'vertical'

  return 'horizontal'
}

function uniqueTabElements(stripElement: HTMLElement) {
  const tabIds = new Set<string>()
  const tabElements: HTMLElement[] = []

  for (const child of stripElement.children) {
    if (!(child instanceof HTMLElement)) continue
    if (!child.dataset.proofTabId) continue
    if (tabIds.has(child.dataset.proofTabId)) continue

    tabIds.add(child.dataset.proofTabId)
    tabElements.push(child)
  }

  return tabElements
}

function tabStripElementAtPoint(source: DndProofDragData, point: PointerCoordinates) {
  for (const stripElement of tabStripElements()) {
    if (sourceWindowOwnsTabStrip(source, stripElement)) continue
    if (!pointIsInsideTabStripBand(stripElement, point, 0)) continue

    return stripElement
  }

  return null
}

function tabStripElementNearDockingPoint(
  source: DndProofDragData,
  point: PointerCoordinates,
  sourceStripRect: LayoutRect | null,
  sourceStripOrientation: TabStripOrientation | null,
) {
  const direction = tabDockingDirection(sourceStripRect, sourceStripOrientation, point)
  const candidates = tabStripElements().flatMap((stripElement) => {
    if (sourceWindowOwnsTabStrip(source, stripElement)) return []
    if (!pointIsInsideTabStripDockingBand(stripElement, point)) return []
    if (!tabStripMatchesDockingDirection(stripElement, point, direction)) return []

    return [{ score: tabStripDockingScore(stripElement, point), stripElement }]
  })
  const closest = candidates.toSorted((left, right) => left.score - right.score)[0]
  if (!closest) return null

  return closest.stripElement
}

function sourceWindowOwnsTabStrip(source: DndProofDragData, stripElement: HTMLElement) {
  if (source.kind !== 'window') return false

  return stripElement.dataset.proofTabStripId === source.windowId
}

function tabStripElementForWindow(windowId: WindowId) {
  return tabStripElements().find((element) => element.dataset.proofTabStripId === windowId) ?? null
}

function tabStripElements() {
  if (typeof document === 'undefined') return []

  return Array.from(document.querySelectorAll<HTMLElement>('[data-proof-tab-strip-id]'))
}

function proofWindowElementForId(windowId: WindowId) {
  return proofWindowElements().find((element) => element.dataset.proofWindowId === windowId) ?? null
}

function proofWindowElements() {
  if (typeof document === 'undefined') return []

  return Array.from(document.querySelectorAll<HTMLElement>('[data-proof-window-id]'))
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
    const ratio = normalizedPosition(point.y, centerRect.top, centerRect.bottom)

    return {
      x: stripRect.left + stripRect.width / 2,
      y: stripRect.top + ratio * stripRect.height,
    }
  }

  const ratio = normalizedPosition(point.x, centerRect.left, centerRect.right)

  return {
    x: stripRect.left + ratio * stripRect.width,
    y: stripRect.top + stripRect.height / 2,
  }
}

function projectedTabStripAutoscrollPoint(
  stripElement: HTMLElement,
  stripRect: DOMRect,
  centerRect: ReturnType<typeof windowBodyCenterRect>,
  point: PointerCoordinates,
): PointerCoordinates | null {
  const orientation = tabStripOrientation(stripElement)
  if (orientation === 'vertical') {
    return projectedVerticalAutoscrollPoint(stripRect, centerRect, point)
  }

  return projectedHorizontalAutoscrollPoint(stripRect, centerRect, point)
}

function projectedHorizontalAutoscrollPoint(
  stripRect: DOMRect,
  centerRect: ReturnType<typeof windowBodyCenterRect>,
  point: PointerCoordinates,
): PointerCoordinates | null {
  const delta = edgeScrollDelta(point.x, centerRect.left, centerRect.right)
  if (delta < 0) {
    return {
      x: stripRect.left + 1,
      y: stripRect.top + stripRect.height / 2,
    }
  }
  if (delta <= 0) return null

  return {
    x: stripRect.right - 1,
    y: stripRect.top + stripRect.height / 2,
  }
}

function projectedVerticalAutoscrollPoint(
  stripRect: DOMRect,
  centerRect: ReturnType<typeof windowBodyCenterRect>,
  point: PointerCoordinates,
): PointerCoordinates | null {
  const delta = edgeScrollDelta(point.y, centerRect.top, centerRect.bottom)
  if (delta < 0) {
    return {
      x: stripRect.left + stripRect.width / 2,
      y: stripRect.top + 1,
    }
  }
  if (delta <= 0) return null

  return {
    x: stripRect.left + stripRect.width / 2,
    y: stripRect.bottom - 1,
  }
}

function scrollTabStripForBodyPoint(
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

function updateTabStripBodyAutoscroll({
  continuous,
  onAutoScroll,
  point,
  stripElement,
  windowElement,
}: {
  readonly continuous: boolean
  readonly onAutoScroll: (() => void) | null
  readonly point: PointerCoordinates
  readonly stripElement: HTMLElement
  readonly windowElement: HTMLElement
}) {
  if (!continuous) return
  if (!tabStripBodyAutoscrollCanAdvance(stripElement, windowElement, point)) {
    stopTabStripBodyAutoscroll()
    return
  }

  const frameId = bodyAutoscrollState?.frameId ?? null
  bodyAutoscrollState = {
    frameId,
    onAutoScroll,
    point,
    stripElement,
    windowElement,
  }
  scheduleTabStripBodyAutoscrollFrame()
}

function scheduleTabStripBodyAutoscrollFrame() {
  if (!bodyAutoscrollState) return
  if (bodyAutoscrollState.frameId !== null) return

  bodyAutoscrollState.frameId = requestAnimationFrame(runTabStripBodyAutoscrollFrame)
}

function runTabStripBodyAutoscrollFrame() {
  const state = bodyAutoscrollState
  if (!state) return

  state.frameId = null
  if (!tabStripBodyAutoscrollCanAdvance(state.stripElement, state.windowElement, state.point)) {
    stopTabStripBodyAutoscroll()
    return
  }

  const moved = scrollTabStripForBodyPoint(state.stripElement, state.windowElement, state.point)
  if (!moved) {
    stopTabStripBodyAutoscroll()
    return
  }

  state.onAutoScroll?.()
  scheduleTabStripBodyAutoscrollFrame()
}

function tabStripBodyAutoscrollCanAdvance(
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

function normalizedPosition(value: number, min: number, max: number) {
  if (max <= min) return 0

  return clamp((value - min) / (max - min), 0, 1)
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

function nearestTabStripMiss(source: DndProofDragData, point: PointerCoordinates) {
  const misses = tabStripElements().map((element) => tabStripMiss(source, element, point))

  return misses.toSorted((left, right) => tabStripMissScore(left) - tabStripMissScore(right))[0]
}

function tabStripMiss(
  source: DndProofDragData,
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
  return element.dataset.proofTabStripId ?? 'unknown'
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

function tabDockingDirection(
  sourceStripRect: LayoutRect | null,
  sourceStripOrientation: TabStripOrientation | null,
  point: PointerCoordinates,
): TabDockingDirection {
  if (!sourceStripRect) return 'none'
  if (sourceStripOrientation === 'vertical') {
    const sourceCenterX = sourceStripRect.x + sourceStripRect.width / 2
    if (point.x < sourceCenterX) return 'left'
    if (point.x > sourceCenterX) return 'right'

    return 'none'
  }

  const sourceCenterY = sourceStripRect.y + sourceStripRect.height / 2
  if (point.y < sourceCenterY) return 'up'
  if (point.y > sourceCenterY) return 'down'

  return 'none'
}

function tabStripMatchesDockingDirection(
  element: HTMLElement,
  point: PointerCoordinates,
  direction: TabDockingDirection,
) {
  if (direction === 'none') return true

  const rect = element.getBoundingClientRect()
  if (direction === 'left') return rect.right <= point.x
  if (direction === 'right') return rect.left >= point.x
  if (direction === 'up') return rect.bottom <= point.y

  return rect.top >= point.y
}

function formatPoint(point: PointerCoordinates) {
  return `${Math.round(point.x)},${Math.round(point.y)}`
}

function distanceFromRange(value: number, min: number, max: number) {
  if (value < min) return min - value
  if (value > max) return value - max

  return 0
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
