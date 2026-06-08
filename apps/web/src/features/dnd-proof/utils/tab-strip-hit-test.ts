import type { DndProofDragData, DndProofDropData } from '@/features/dnd-proof/utils/drag-data'
import type { WindowId } from '@/features/tiling-surface-manager/engine/layout-types'

type PointerCoordinates = {
  readonly x: number
  readonly y: number
}

const TAB_STRIP_REORDER_SLOP_PX = 20
const TAB_STRIP_TRAILING_EDGE_SLOP_PX = 36

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
): DndProofDropData {
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
