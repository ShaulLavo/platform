import {
  targetBelongsToTabStrip,
  type TilingDragData,
  type TilingDropData,
} from '@workspace/tiling/utils/drag-data'
import {
  distanceFromRange,
  type PointerCoordinates,
} from '@workspace/tiling/utils/geometry-primitives'
import { dragSourceCanUseDropTarget } from '@workspace/tiling/utils/drag-capabilities'
import type { LayoutRect } from '@workspace/tiling/utils/layout-geometry'
import type { SurfaceId, WindowId, WorkspaceLayout } from '@workspace/tiling/utils/layout-types'
import {
  DIRECT_TAB_TARGET_PRIORITY,
  DOCK_TAB_TARGET_PRIORITY,
  STRIP_TAB_TARGET_PRIORITY,
  WINDOW_BODY_TAB_TARGET_PRIORITY,
  type ResolvedTilingTarget,
  type TilingIntentMode,
  type TilingTabTarget,
} from '@workspace/tiling/utils/drop-target-resolver'
import {
  pointIsInsideTabStripForWindow,
  pointIsInsideTilingWindowCenter,
  resolveTabStripDropTarget,
  tabStripDropHitAtPoint,
  tabStripDropTargetForWindowAtPoint,
  tabStripDropTargetForWindowBodyPoint,
  tabStripDropTargetMatchesPoint,
  tilingWindowCenterElementAtPoint,
  type TabStripBodyAutoscroller,
  type TilingTabStripHit,
} from '@workspace/tiling/utils/tab-strip-hit-test'
import type { ActiveTilingDrag } from '@workspace/tiling/utils/drag-state'

const TAB_MOUSE_DETACH_THRESHOLD_PX = 15
const TAB_TOUCH_DETACH_THRESHOLD_PX = 50
const TAB_TRAVEL_DEADBAND_PX = 6

const WINDOW_BODY_STICKY_INFLATE_PX = 24

export type BodyAutoScrollInput = {
  readonly eventPoint: PointerCoordinates
  readonly source: Extract<TilingDragData, { readonly kind: 'tab' }>
  readonly windowId: WindowId
}

export function resolveIntentModeAndUpdateDetach(
  activeDrag: ActiveTilingDrag | null,
  source: TilingDragData,
  point: PointerCoordinates,
): TilingIntentMode {
  if (source.kind === 'window') return 'window'
  if (!activeDrag || activeDrag.kind !== 'tab') return 'tab-detached'

  updateTabTravel(activeDrag, point)
  updateTabDetachState(activeDrag, point)
  if (activeDrag.detached) return 'tab-detached'

  return 'tab-reorder'
}

export function tabTargetForDrag({
  activeDrag,
  bodyAutoscroller,
  eventPoint,
  mode,
  onBodyAutoScroll,
  previousTarget,
  rawTarget,
  source,
}: {
  readonly activeDrag: ActiveTilingDrag | null
  readonly bodyAutoscroller?: TabStripBodyAutoscroller | null
  readonly eventPoint: PointerCoordinates
  readonly mode: TilingIntentMode
  readonly onBodyAutoScroll: (input: BodyAutoScrollInput) => void
  readonly previousTarget: ResolvedTilingTarget | null
  readonly rawTarget: TilingDropData | null
  readonly source: TilingDragData
}) {
  if (mode === 'tab-detached') {
    return detachedTabTargetForDrag({
      activeDrag,
      bodyAutoscroller,
      eventPoint,
      onBodyAutoScroll,
      previousTarget,
      rawTarget,
      source,
    })
  }
  if (mode === 'window') {
    bodyAutoscroller?.stop()
    return (
      tabTargetFromHit(tabStripDropHitAtPoint(source, eventPoint)) ??
      rawTabTargetForPoint(source, rawTarget, eventPoint)
    )
  }
  if (mode !== 'tab-reorder') {
    bodyAutoscroller?.stop()
    return null
  }

  bodyAutoscroller?.stop()
  return tabReorderTargetForDrag({ activeDrag, eventPoint, source })
}

// A capability-blocked tab target must resolve to null, not survive until the
// commit check: its strip/dock priority would beat the window-edge snap
// candidates under the same point and leave the drag with no target at all.
export function tabTargetForDragSource(
  layout: WorkspaceLayout,
  source: TilingDragData,
  tabTarget: TilingTabTarget | null,
): TilingTabTarget | null {
  if (!tabTarget) return null
  if (!dragSourceCanUseDropTarget(layout, source, tabTarget.target)) return null

  return tabTarget
}

export function rawWindowTargetForDrag({
  mode,
  rawTarget,
  source,
}: {
  readonly mode: TilingIntentMode
  readonly rawTarget: TilingDropData | null
  readonly source: TilingDragData
}): ResolvedTilingTarget | null {
  if (rawTarget?.kind !== 'window') return null
  if (source.kind === 'tab') return rawWindowTargetForTab(mode, rawTarget)
  if (source.windowId === rawTarget.windowId) return null
  if (mode !== 'window') return null

  return { mode, target: rawTarget }
}

export function promoteWindowCenterTabTarget(
  source: TilingDragData,
  target: ResolvedTilingTarget | null,
  eventPoint: PointerCoordinates,
): ResolvedTilingTarget | null {
  if (source.kind !== 'tab') return target
  if (!target) return null
  if (target.target.kind !== 'snap-destination') return target
  if (target.target.destination.kind !== 'window-center') return target

  const tabTarget = tabStripDropTargetForWindowBodyPoint(
    target.target.destination.windowId,
    eventPoint,
    {
      previousIndex: target.target.destination.tabIndex ?? null,
      sourceTabId: source.surfaceId,
    },
  )
  if (!tabTarget) return target

  return {
    mode: target.mode,
    previewKind: 'app',
    target: tabTarget,
  }
}

export function sourceReturnTargetForDragEnd(
  source: TilingDragData,
  target: ResolvedTilingTarget | null,
) {
  if (source.kind !== 'window') return null
  if (!target?.candidateId?.includes('source-return')) return null
  if (target.target.kind !== 'window') return null
  if (target.target.windowId !== source.windowId) return null

  return target
}

export function resolvedWindowBodyTabTarget(
  target: TilingDropData | null,
): ResolvedTilingTarget | null {
  const tabTarget = tabTargetFromTarget(target, WINDOW_BODY_TAB_TARGET_PRIORITY, 'app')
  if (!tabTarget) return null

  return {
    mode: 'tab-detached',
    previewKind: 'app',
    target: tabTarget.target,
  }
}

export function resolvedWindowBodyTabTargetForPoint({
  eventPoint,
  previousTarget,
  scroll = true,
  sourceTabId,
  windowId,
}: {
  readonly eventPoint: PointerCoordinates
  readonly previousTarget: ResolvedTilingTarget | null
  readonly scroll?: boolean
  readonly sourceTabId: SurfaceId | null
  readonly windowId: WindowId
}) {
  return resolvedWindowBodyTabTarget(
    tabStripDropTargetForWindowBodyPoint(windowId, eventPoint, {
      previousIndex: previousTargetTabIndexForWindow(previousTarget, windowId),
      scroll,
      sourceTabId,
    }),
  )
}

export function previousTargetTabIndexForWindow(
  previousTarget: ResolvedTilingTarget | null,
  windowId: WindowId,
) {
  const target = previousTarget?.target ?? null
  if (tabTargetWindowId(target) !== windowId) return null

  return tabTargetIndex(target)
}

export function tabTargetFromHit(
  hit: TilingTabStripHit | null,
  previewKind: TilingTabTarget['previewKind'] = 'dnd-kit',
): TilingTabTarget | null {
  if (!hit) return null

  return {
    previewKind,
    priority: tabTargetPriority(hit.strength),
    target: hit.target,
  }
}

export function tabTargetFromTarget(
  target: TilingDropData | null,
  priority = DIRECT_TAB_TARGET_PRIORITY,
  previewKind: TilingTabTarget['previewKind'] = 'dnd-kit',
): TilingTabTarget | null {
  if (!target) return null
  if (!targetBelongsToTabStrip(target)) return null

  return {
    previewKind,
    priority,
    target,
  }
}

export function snapPreviewMode(activeDrag: ActiveTilingDrag | null) {
  if (!activeDrag) return false
  if (activeDrag.kind === 'window') return true

  return activeDrag.detached
}

function detachedTabTargetForDrag({
  activeDrag,
  bodyAutoscroller,
  eventPoint,
  onBodyAutoScroll,
  previousTarget,
  rawTarget,
  source,
}: {
  readonly activeDrag: ActiveTilingDrag | null
  readonly bodyAutoscroller?: TabStripBodyAutoscroller | null
  readonly eventPoint: PointerCoordinates
  readonly onBodyAutoScroll: (input: BodyAutoScrollInput) => void
  readonly previousTarget: ResolvedTilingTarget | null
  readonly rawTarget: TilingDropData | null
  readonly source: TilingDragData
}) {
  const dockTravel = activeDrag?.kind === 'tab' ? activeDrag.travel : null
  const pointTarget = tabTargetFromHit(
    tabStripDropHitAtPoint(source, eventPoint, { dockTravel }),
    'app',
  )
  if (pointTarget) {
    bodyAutoscroller?.stop()
    return pointTarget
  }

  const bodyTarget =
    stickyWindowBodyTabTargetForDrag(
      source,
      previousTarget,
      eventPoint,
      onBodyAutoScroll,
      bodyAutoscroller,
    ) ??
    windowBodyTabTargetForDrag(
      source,
      eventPoint,
      previousTarget,
      onBodyAutoScroll,
      bodyAutoscroller,
    )
  if (bodyTarget) return bodyTarget

  bodyAutoscroller?.stop()
  return rawTabTargetForPoint(source, rawTarget, eventPoint)
}

function tabReorderTargetForDrag({
  activeDrag,
  eventPoint,
  source,
}: {
  readonly activeDrag: ActiveTilingDrag | null
  readonly eventPoint: PointerCoordinates
  readonly source: TilingDragData
}) {
  if (!activeDrag || activeDrag.kind !== 'tab') return null
  if (!activeDrag.sourceWindowId) return null

  return (
    directCrossWindowTabTarget(source, eventPoint, activeDrag.sourceWindowId) ??
    tabTargetFromTarget(
      tabStripDropTargetForWindowAtPoint(activeDrag.sourceWindowId, eventPoint, {
        sourceTabId: source.kind === 'tab' ? source.surfaceId : null,
      }),
    )
  )
}

function directCrossWindowTabTarget(
  source: TilingDragData,
  eventPoint: PointerCoordinates,
  sourceWindowId: WindowId,
) {
  const hit = tabStripDropHitAtPoint(source, eventPoint)
  if (!hit) return null
  if (hit.strength !== 'direct') return null
  if (hit.target.windowId === sourceWindowId) return null

  return tabTargetFromHit(hit, 'app')
}

function rawTabTargetForPoint(
  source: TilingDragData,
  rawTarget: TilingDropData | null,
  eventPoint: PointerCoordinates,
): TilingTabTarget | null {
  if (!rawTarget) return null
  if (!targetBelongsToTabStrip(rawTarget)) return null
  if (!tabStripDropTargetMatchesPoint(rawTarget, eventPoint)) return null

  return tabTargetFromTarget(resolveTabStripDropTarget(source, rawTarget, eventPoint))
}

function windowBodyTabTargetForDrag(
  source: TilingDragData,
  eventPoint: PointerCoordinates,
  previousTarget: ResolvedTilingTarget | null,
  onBodyAutoScroll: (input: BodyAutoScrollInput) => void,
  bodyAutoscroller: TabStripBodyAutoscroller | null | undefined,
): TilingTabTarget | null {
  if (source.kind !== 'tab') return null

  const windowId = centerWindowIdAtPoint(eventPoint)
  if (!windowId) return null

  return tabTargetFromTarget(
    tabStripDropTargetForWindowBodyPoint(windowId, eventPoint, {
      bodyAutoscroller,
      onAutoScroll: () => onBodyAutoScroll({ eventPoint, source, windowId }),
      previousIndex: previousTargetTabIndexForWindow(previousTarget, windowId),
      sourceTabId: source.surfaceId,
    }),
    WINDOW_BODY_TAB_TARGET_PRIORITY,
    'app',
  )
}

function stickyWindowBodyTabTargetForDrag(
  source: TilingDragData,
  previousTarget: ResolvedTilingTarget | null,
  eventPoint: PointerCoordinates,
  onBodyAutoScroll: (input: BodyAutoScrollInput) => void,
  bodyAutoscroller: TabStripBodyAutoscroller | null | undefined,
): TilingTabTarget | null {
  if (source.kind !== 'tab') return null

  const windowId = tabTargetWindowId(previousTarget?.target ?? null)
  if (!windowId) return null
  if (!pointIsInsideTilingWindowCenter(windowId, eventPoint, WINDOW_BODY_STICKY_INFLATE_PX)) {
    return null
  }

  return tabTargetFromTarget(
    tabStripDropTargetForWindowBodyPoint(windowId, eventPoint, {
      bodyAutoscroller,
      onAutoScroll: () => onBodyAutoScroll({ eventPoint, source, windowId }),
      previousIndex: previousTargetTabIndexForWindow(previousTarget, windowId),
      sourceTabId: source.surfaceId,
    }),
    WINDOW_BODY_TAB_TARGET_PRIORITY,
    'app',
  )
}

function tabTargetWindowId(target: TilingDropData | null): WindowId | null {
  if (target?.kind === 'tab') return target.windowId
  if (target?.kind === 'tab-strip') return target.windowId

  return null
}

function tabTargetIndex(target: TilingDropData | null) {
  if (target?.kind === 'tab') return target.index
  if (target?.kind === 'tab-strip') return target.index

  return null
}

function centerWindowIdAtPoint(point: PointerCoordinates): WindowId | null {
  const windowElement = tilingWindowCenterElementAtPoint(point)
  if (!windowElement?.dataset.tilingWindowId) return null

  return windowElement.dataset.tilingWindowId as WindowId
}

function rawWindowTargetForTab(
  mode: TilingIntentMode,
  rawTarget: Extract<TilingDropData, { readonly kind: 'window' }>,
): ResolvedTilingTarget | null {
  if (mode !== 'tab-detached') return null

  return { mode, target: rawTarget }
}

function tabTargetPriority(strength: TilingTabStripHit['strength']) {
  if (strength === 'direct') return DIRECT_TAB_TARGET_PRIORITY
  if (strength === 'strip') return STRIP_TAB_TARGET_PRIORITY

  return DOCK_TAB_TARGET_PRIORITY
}

function updateTabTravel(
  activeDrag: Extract<ActiveTilingDrag, { readonly kind: 'tab' }>,
  point: PointerCoordinates,
) {
  const travel = activeDrag.travel
  if (!travel.lastPoint) {
    travel.lastPoint = { x: point.x, y: point.y }
    return
  }
  if (Math.abs(point.x - travel.lastPoint.x) >= TAB_TRAVEL_DEADBAND_PX) {
    travel.horizontal = point.x < travel.lastPoint.x ? 'left' : 'right'
    travel.lastPoint.x = point.x
  }
  if (Math.abs(point.y - travel.lastPoint.y) >= TAB_TRAVEL_DEADBAND_PX) {
    travel.vertical = point.y < travel.lastPoint.y ? 'up' : 'down'
    travel.lastPoint.y = point.y
  }
}

function updateTabDetachState(
  activeDrag: Extract<ActiveTilingDrag, { readonly kind: 'tab' }>,
  point: PointerCoordinates,
) {
  if (activeDrag.detached) {
    // A detached tab re-attaches when the pointer is back inside its source
    // strip, so returning to the tab bar behaves like a plain reorder drag.
    if (!tabCanReattach(activeDrag, point)) return

    activeDrag.detached = false
    return
  }

  const outsideDistance = tabStripOutsideDistance(
    activeDrag.stripRect,
    activeDrag.stripOrientation,
    point,
  )
  const threshold = tabDetachThreshold(activeDrag.pointerType)
  activeDrag.detached = outsideDistance >= threshold
}

function tabCanReattach(
  activeDrag: Extract<ActiveTilingDrag, { readonly kind: 'tab' }>,
  point: PointerCoordinates,
) {
  if (!activeDrag.sourceWindowId) return false

  return pointIsInsideTabStripForWindow(activeDrag.sourceWindowId, point)
}

function tabDetachThreshold(pointerType: string) {
  if (pointerType === 'touch') return TAB_TOUCH_DETACH_THRESHOLD_PX

  return TAB_MOUSE_DETACH_THRESHOLD_PX
}

function tabStripOutsideDistance(
  rect: LayoutRect | null,
  orientation: 'horizontal' | 'vertical' | null,
  point: PointerCoordinates,
) {
  if (!rect) return 0
  if (orientation === 'vertical') return distanceFromRange(point.x, rect.x, rect.x + rect.width)

  return distanceFromRange(point.y, rect.y, rect.y + rect.height)
}
