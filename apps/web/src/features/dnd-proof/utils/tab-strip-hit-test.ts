import type { DndProofDragData, DndProofDropData } from '@/features/dnd-proof/utils/drag-data'
import type { LayoutRect } from '@/features/tiling-surface-manager/engine/layout-geometry'
import type { WindowId } from '@/features/tiling-surface-manager/engine/layout-types'

type PointerCoordinates = {
  readonly x: number
  readonly y: number
}

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

const TAB_STRIP_REORDER_SLOP_PX = 20
const TAB_STRIP_TRAILING_EDGE_SLOP_PX = 36
const TAB_STRIP_DOCK_ABOVE_SLOP_PX = 44
const TAB_STRIP_DOCK_BELOW_SLOP_PX = 44
const TAB_STRIP_DOCK_HORIZONTAL_SLOP_PX = 48

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
    readonly sourceStripRect?: LayoutRect | null
  } = {},
): DndProofDropData | null {
  return tabStripDropHitAtPoint(source, point, options)?.target ?? null
}

export function tabStripDropHitAtPoint(
  source: DndProofDragData,
  point: PointerCoordinates,
  options: {
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
    readonly sourceStripRect?: LayoutRect | null
  } = {},
) {
  if (!validPointerCoordinates(point)) return `invalid point ${formatPoint(point)}`

  const directStrip = tabStripElementAtPoint(source, point)
  if (directStrip) return `direct strip ${tabStripElementId(directStrip)}`

  const direction = tabDockingDirection(options.sourceStripRect ?? null, point)
  const dockingStrip = tabStripElementNearDockingPoint(
    source,
    point,
    options.sourceStripRect ?? null,
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
): Extract<DndProofDropData, { readonly kind: 'tab-strip' }> {
  return {
    index: tabInsertionIndexForPoint(stripElement, point),
    kind: 'tab-strip',
    windowId: stripElement.dataset.proofTabStripId as WindowId,
  }
}

function tabInsertionIndexForPoint(stripElement: HTMLElement, point: PointerCoordinates) {
  const tabElements = uniqueTabElements(stripElement)

  for (const [index, tabElement] of tabElements.entries()) {
    const rect = tabElement.getBoundingClientRect()
    if (point.x < rect.left + rect.width / 2) return index
  }

  return tabElements.length
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
) {
  const direction = tabDockingDirection(sourceStripRect, point)
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
  verticalSlop: number,
) {
  const rect = element.getBoundingClientRect()
  const horizontalSlop = TAB_STRIP_TRAILING_EDGE_SLOP_PX

  return (
    point.x >= rect.left - horizontalSlop &&
    point.x <= rect.right + horizontalSlop &&
    point.y >= rect.top - verticalSlop &&
    point.y <= rect.bottom + verticalSlop
  )
}

function pointIsNearTabStrip(element: HTMLElement, point: PointerCoordinates) {
  return pointIsInsideTabStripBand(element, point, TAB_STRIP_REORDER_SLOP_PX)
}

function pointIsInsideTabStripDockingBand(element: HTMLElement, point: PointerCoordinates) {
  const rect = element.getBoundingClientRect()

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

  return verticalDistance * 10 + horizontalDistance
}

function tabDockingDirection(sourceStripRect: LayoutRect | null, point: PointerCoordinates) {
  if (!sourceStripRect) return 'none'

  const sourceCenterY = sourceStripRect.y + sourceStripRect.height / 2
  if (point.y < sourceCenterY) return 'up'
  if (point.y > sourceCenterY) return 'down'

  return 'none'
}

function tabStripMatchesDockingDirection(
  element: HTMLElement,
  point: PointerCoordinates,
  direction: 'down' | 'none' | 'up',
) {
  if (direction === 'none') return true

  const rect = element.getBoundingClientRect()
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
