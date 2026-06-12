import type { DragEndEvent, DragMoveEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/react'

import {
  tilingDragData,
  tilingDropData,
  type TilingDragData,
} from '@workspace/tiling/utils/drag-data'
import type { PointerCoordinates, PointerTravel } from '@workspace/tiling/utils/geometry-primitives'
import type { LayoutGeometry, LayoutRect } from '@workspace/tiling/utils/layout-geometry'
import { findWindowIdContainingSurface } from '@workspace/tiling/utils/layout-normalize'
import type { WindowId, WorkspaceLayout } from '@workspace/tiling/utils/layout-types'

export type PointerDetails = {
  readonly point: PointerCoordinates
  readonly source: 'native' | 'operation' | 'to'
}

export type TabDragTravel = {
  horizontal: PointerTravel['horizontal']
  lastPoint: { x: number; y: number } | null
  vertical: PointerTravel['vertical']
}

export type ActiveTilingDrag =
  | {
      detached: boolean
      kind: 'tab'
      pointerType: string
      source: Extract<TilingDragData, { readonly kind: 'tab' }>
      sourceIndex: number | null
      sourceWindowId: WindowId | null
      stripOrientation: 'horizontal' | 'vertical' | null
      stripRect: LayoutRect | null
      travel: TabDragTravel
    }
  | {
      kind: 'window'
      source: Extract<TilingDragData, { readonly kind: 'window' }>
    }

export function initialTabDragTravel(): TabDragTravel {
  return { horizontal: 'none', lastPoint: null, vertical: 'none' }
}

export function sourceWindowIdForDrag(layout: WorkspaceLayout, activeDrag: TilingDragData | null) {
  if (!activeDrag) return null
  if (activeDrag.kind === 'window') return activeDrag.windowId

  return findWindowIdContainingSurface(layout, activeDrag.surfaceId)
}

export function sourceWindowRectForDrag(
  layout: WorkspaceLayout,
  windowRectsById: LayoutGeometry['windowRectsById'],
  activeDrag: TilingDragData | null,
) {
  const windowId = vacatingWindowIdForDrag(layout, activeDrag)
  if (!windowId) return null

  return windowRectsById[windowId]?.rect ?? null
}

// A tab that is its window's only surface vacates the window when it leaves,
// so dragging it is dragging the window: it earns the same source-return and
// source-vacancy zones. Tabs from multi-tab windows leave the window standing
// and get neither.
function vacatingWindowIdForDrag(layout: WorkspaceLayout, activeDrag: TilingDragData | null) {
  if (!activeDrag) return null
  if (activeDrag.kind === 'window') return activeDrag.windowId

  const windowId = findWindowIdContainingSurface(layout, activeDrag.surfaceId)
  if (!windowId) return null
  if (layout.windowsById[windowId]?.surfaceIds.length !== 1) return null

  return windowId
}

export function activeTilingDragForSource(
  source: TilingDragData | null,
  event: DragStartEvent,
  layout: WorkspaceLayout,
): ActiveTilingDrag | null {
  if (!source) return null
  if (source.kind === 'window') return { kind: 'window', source }

  const sourceElement = event.operation.source?.element

  return {
    detached: false,
    kind: 'tab',
    pointerType: pointerTypeFromEvent(event.nativeEvent ?? event.operation.activatorEvent),
    source,
    sourceIndex: sourceTabIndex(event.operation.source?.data),
    sourceWindowId: findWindowIdContainingSurface(layout, source.surfaceId),
    stripOrientation: tabStripOrientation(sourceElement),
    stripRect: tabStripRect(sourceElement),
    travel: initialTabDragTravel(),
  }
}

export function sourceWindowIdForResolver(activeDrag: ActiveTilingDrag | null) {
  if (!activeDrag) return null
  if (activeDrag.kind === 'window') return activeDrag.source.windowId

  return activeDrag.sourceWindowId
}

export function sourceForDragEvent(
  data: unknown,
  activeDrag: ActiveTilingDrag | null,
  fallback: TilingDragData | null,
) {
  const source = tilingDragData(data)
  if (source) return source
  if (activeDrag) return activeDrag.source

  return fallback
}

export function localPointForRoot(point: PointerCoordinates, coordinateRoot: HTMLElement | null) {
  const rect = coordinateRoot?.getBoundingClientRect()
  if (!rect) return point

  return {
    x: point.x - rect.left,
    y: point.y - rect.top,
  }
}

export function dragMovePoint(event: DragMoveEvent) {
  const nativePoint = pointFromEvent(event.nativeEvent)
  if (nativePoint) return { point: nativePoint, source: 'native' } satisfies PointerDetails
  if (event.to) return { point: event.to, source: 'to' } satisfies PointerDetails

  return {
    point: event.operation.position.current,
    source: 'operation',
  } satisfies PointerDetails
}

export function dragEventPoint(event: DragEndEvent | DragOverEvent) {
  const nativeEvent = 'nativeEvent' in event ? event.nativeEvent : null
  const nativePoint = pointFromEvent(nativeEvent)
  if (nativePoint) return { point: nativePoint, source: 'native' } satisfies PointerDetails

  return {
    point: event.operation.position.current,
    source: 'operation',
  } satisfies PointerDetails
}

export function cancelPendingCommitFrame(ref: { current: number | null }) {
  if (ref.current === null) return

  cancelAnimationFrame(ref.current)
  ref.current = null
}

function sourceTabIndex(data: unknown) {
  const target = tilingDropData(data)
  if (target?.kind !== 'tab') return null

  return target.index
}

function tabStripRect(sourceElement: Element | undefined): LayoutRect | null {
  const stripElement = sourceElement?.closest('[data-tiling-tab-strip-id]')
  if (!stripElement) return null

  return layoutRectFromDomRect(stripElement.getBoundingClientRect())
}

function tabStripOrientation(sourceElement: Element | undefined) {
  const stripElement = sourceElement?.closest<HTMLElement>('[data-tiling-tab-strip-id]')
  if (stripElement?.dataset.tilingTabStripOrientation === 'vertical') return 'vertical'
  if (stripElement?.dataset.tilingTabStripOrientation === 'horizontal') return 'horizontal'

  return null
}

function layoutRectFromDomRect(rect: DOMRect): LayoutRect {
  return {
    height: rect.height,
    width: rect.width,
    x: rect.left,
    y: rect.top,
  }
}

function pointFromEvent(event: Event | null | undefined) {
  if (!event) return null
  if (!('clientX' in event) || !('clientY' in event)) return null

  return {
    x: Number(event.clientX),
    y: Number(event.clientY),
  }
}

function pointerTypeFromEvent(event: Event | null | undefined) {
  if (typeof PointerEvent === 'undefined') return 'mouse'
  if (event instanceof PointerEvent) return event.pointerType

  return 'mouse'
}
