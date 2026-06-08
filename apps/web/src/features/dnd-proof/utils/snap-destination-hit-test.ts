import {
  proofDropData,
  type DndProofDragData,
  type DndProofDropData,
} from '@/features/dnd-proof/utils/drag-data'
import type { WindowId } from '@/features/tiling-surface-manager/engine/layout-types'

type PointerCoordinates = {
  readonly x: number
  readonly y: number
}

type SnapDropTarget = {
  readonly area: number
  readonly data: DndProofDropData
}

const WINDOW_MERGE_EDGE_RATIO = 0.18
const WINDOW_MERGE_MIN_EDGE_PX = 44

export function resolveSnapDropTarget(
  source: DndProofDragData,
  target: DndProofDropData | null,
  point: PointerCoordinates,
): DndProofDropData | null {
  if (!validPointerCoordinates(point)) return target

  const windowMergeTarget = windowMergeTargetAtPoint(source, point)
  if (windowMergeTarget) return windowMergeTarget

  const snapTargets = snapDropTargetsAtPoint(source, point)
  const mergeTarget = snapTargets.find((snapTarget) => isMergeTabsTarget(snapTarget.data))
  if (mergeTarget) return mergeTarget.data

  return smallestSnapTarget(snapTargets)?.data ?? fallbackTargetForSource(source, target)
}

function snapDropTargetsAtPoint(source: DndProofDragData, point: PointerCoordinates) {
  const snapTargets: SnapDropTarget[] = []

  for (const element of snapDestinationElements()) {
    const rect = element.getBoundingClientRect()
    if (!pointIsInsideRect(rect, point)) continue

    const data = snapDropDataForElement(element)
    if (!data) continue
    if (!snapTargetAllowedForSource(source, data)) continue

    snapTargets.push({ area: rect.width * rect.height, data })
  }

  return snapTargets
}

function smallestSnapTarget(snapTargets: readonly SnapDropTarget[]) {
  return snapTargets.toSorted((left, right) => left.area - right.area)[0] ?? null
}

function windowMergeTargetAtPoint(source: DndProofDragData, point: PointerCoordinates) {
  if (source.kind !== 'window') return null

  for (const element of windowElements()) {
    const windowId = element.dataset.proofWindowId as WindowId | undefined
    if (!windowId) continue
    if (windowId === source.windowId) continue
    if (!pointIsInsideWindowMergeRect(element.getBoundingClientRect(), point)) continue

    return {
      destination: { kind: 'window-center' as const, windowId },
      kind: 'snap-destination' as const,
    }
  }

  return null
}

function windowElements() {
  if (typeof document === 'undefined') return []

  return Array.from(document.querySelectorAll<HTMLElement>('[data-proof-window-id]'))
}

function pointIsInsideWindowMergeRect(rect: DOMRect, point: PointerCoordinates) {
  const horizontalInset = edgeThickness(rect.width)
  const verticalInset = edgeThickness(rect.height)

  return (
    point.x >= rect.left + horizontalInset &&
    point.x <= rect.right - horizontalInset &&
    point.y >= rect.top + verticalInset &&
    point.y <= rect.bottom - verticalInset
  )
}

function edgeThickness(size: number) {
  return Math.min(size / 2, Math.max(WINDOW_MERGE_MIN_EDGE_PX, size * WINDOW_MERGE_EDGE_RATIO))
}

function snapDropDataForElement(element: HTMLElement) {
  const value = element.dataset.proofSnapDropData
  if (!value) return null

  try {
    return proofDropData(JSON.parse(value))
  } catch {
    return null
  }
}

function snapDestinationElements() {
  if (typeof document === 'undefined') return []

  return Array.from(document.querySelectorAll<HTMLElement>('[data-proof-snap-drop-data]'))
}

function pointIsInsideRect(rect: DOMRect, point: PointerCoordinates) {
  return (
    point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
  )
}

function isMergeTabsTarget(target: DndProofDropData) {
  return target.kind === 'snap-destination' && target.destination.kind === 'window-center'
}

function snapTargetAllowedForSource(source: DndProofDragData, target: DndProofDropData) {
  if (source.kind !== 'window') return true
  if (target.kind !== 'snap-destination') return true
  if (target.destination.kind === 'window-center') {
    return target.destination.windowId !== source.windowId
  }
  if (target.destination.kind === 'window-edge') {
    return target.destination.windowId !== source.windowId
  }

  return true
}

function fallbackTargetForSource(source: DndProofDragData, target: DndProofDropData | null) {
  if (!target) return null
  if (!snapTargetAllowedForSource(source, target)) return null

  return target
}

function validPointerCoordinates(point: PointerCoordinates) {
  return Number.isFinite(point.x) && Number.isFinite(point.y)
}
