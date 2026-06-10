import { useEffect, useRef, useState } from 'react'
import type { DragEndEvent, DragMoveEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/react'

import {
  tilingDragData,
  tilingDropData,
  type TilingDragData,
  type TilingDropData,
} from '@workspace/tiling/utils/drag-data'
import type { LayoutGeometry, LayoutRect } from '@workspace/tiling/utils/layout-geometry'
import {
  findWindowIdContainingSurface,
  visibleWindowIdsInOrder,
} from '@workspace/tiling/utils/layout-normalize'
import { moveSurface, moveWindow, tabSurface } from '@workspace/tiling/utils/layout-operations'
import type {
  SnapDestination,
  SurfaceId,
  WindowId,
  WorkspaceLayout,
} from '@workspace/tiling/utils/layout-types'
import {
  resolveTilingTarget,
  type ResolvedTilingTarget,
  type TilingIntentMode,
  type TilingTabTarget,
} from '@workspace/tiling/utils/drop-target-resolver'
import {
  tilingSnapDestinations,
  type TilingDropCandidate,
} from '@workspace/tiling/utils/snap-destinations'
import {
  describeTabStripHitTest,
  pointIsInsideTilingWindowCenter,
  resolveTabStripDropTarget,
  stopTabStripBodyAutoscroll,
  tabStripDropHitAtPoint,
  tabStripDropTargetForWindowAtPoint,
  tabStripDropTargetForWindowBodyPoint,
  tabStripDropTargetMatchesPoint,
  tilingWindowCenterElementAtPoint,
  type TilingTabStripHit,
} from '@workspace/tiling/utils/tab-strip-hit-test'
import { tilingInsertionPreview } from '@workspace/tiling/utils/tab-preview'

const TAB_MOUSE_DETACH_THRESHOLD_PX = 15
const TAB_TOUCH_DETACH_THRESHOLD_PX = 50

const WINDOW_BODY_TAB_TARGET_PRIORITY = 100
const STRIP_TAB_TARGET_PRIORITY = 106
const DOCK_TAB_TARGET_PRIORITY = 108
const DIRECT_TAB_TARGET_PRIORITY = 110

const WINDOW_BODY_STICKY_INFLATE_PX = 24
const STATE_EVENT_LIMIT = 80

type PointerCoordinates = {
  readonly x: number
  readonly y: number
}

type PointerDetails = {
  readonly point: PointerCoordinates
  readonly source: 'native' | 'operation' | 'to'
}

type StateLogPhase = 'cancel' | 'move' | 'release' | 'start'

type StateLogInput = {
  readonly debug?: string
  readonly layout: WorkspaceLayout
  readonly phase: StateLogPhase
  readonly source: TilingDragData
  readonly target: TilingDropData | null
}

type BodyAutoScrollInput = {
  readonly eventPoint: PointerCoordinates
  readonly source: Extract<TilingDragData, { readonly kind: 'tab' }>
  readonly windowId: WindowId
}

type ActiveTilingDrag =
  | {
      detached: boolean
      kind: 'tab'
      pointerType: string
      source: Extract<TilingDragData, { readonly kind: 'tab' }>
      sourceIndex: number | null
      sourceWindowId: WindowId | null
      stripOrientation: 'horizontal' | 'vertical' | null
      stripRect: LayoutRect | null
    }
  | {
      kind: 'window'
      source: Extract<TilingDragData, { readonly kind: 'window' }>
    }

export type TilingCommitEvent = {
  readonly source: TilingDragData
  readonly target: TilingDropData
}

export type UseTilingDragControllerInput = {
  readonly coordinateRootRef: { readonly current: HTMLElement | null }
  readonly layout: WorkspaceLayout
  readonly onCommitLayout: (nextLayout: WorkspaceLayout, event: TilingCommitEvent) => void
  readonly rootRect: LayoutRect
  readonly snapDestinationRects: LayoutGeometry['snapDestinationRects']
  readonly windowRectsById: LayoutGeometry['windowRectsById']
}

type PendingCommit = {
  readonly event: TilingCommitEvent
  readonly layout: WorkspaceLayout
}

export function useTilingDragController({
  coordinateRootRef,
  layout,
  onCommitLayout,
  rootRect,
  snapDestinationRects,
  windowRectsById,
}: UseTilingDragControllerInput) {
  const [previewLayout, setPreviewLayout] = useState<WorkspaceLayout | null>(null)
  const [activeDrag, setActiveDrag] = useState<TilingDragData | null>(null)
  const [activeResolvedTarget, setActiveResolvedTarget] = useState<ResolvedTilingTarget | null>(
    null,
  )
  const [stateEvents, setStateEvents] = useState<readonly string[]>([])
  const [tabStripRenderEpoch, setTabStripRenderEpoch] = useState(0)
  const activeDragRef = useRef<ActiveTilingDrag | null>(null)
  const activeResolvedTargetRef = useRef<ResolvedTilingTarget | null>(null)
  const dragStartLayoutRef = useRef<WorkspaceLayout | null>(null)
  const lastResolvedTargetRef = useRef<ResolvedTilingTarget | null>(null)
  const lastStateEventSignatureRef = useRef<string | null>(null)
  const layoutRef = useRef(layout)
  const onCommitLayoutRef = useRef(onCommitLayout)
  const pendingCommitFrameRef = useRef<number | null>(null)
  const pendingCommitRef = useRef<PendingCommit | null>(null)
  const stateEventSequenceRef = useRef(0)
  const snapLayout = activeDrag && dragStartLayoutRef.current ? dragStartLayoutRef.current : layout
  const snapDestinations = tilingSnapDestinations({
    activeDrag,
    rootRect,
    snapDestinationRects,
    sourceWindowId: sourceWindowIdForDrag(snapLayout, activeDrag),
    sourceWindowRect: sourceWindowRectForDrag(windowRectsById, activeDrag),
  })
  const snapDestinationsRef = useRef(snapDestinations)
  const insertionPreview = tilingInsertionPreview({
    activeDrag,
    layout: snapLayout,
    resolvedTarget: activeResolvedTarget,
  })

  layoutRef.current = layout
  onCommitLayoutRef.current = onCommitLayout
  snapDestinationsRef.current = snapDestinations

  useEffect(() => {
    return () => {
      stopTabStripBodyAutoscroll()
      cancelPendingCommitFrame(pendingCommitFrameRef)
      pendingCommitRef.current = null
    }
  }, [])

  function handleDragStart(event: DragStartEvent) {
    const currentLayout = layoutRef.current
    const source = tilingDragData(event.operation.source?.data)
    stopTabStripBodyAutoscroll()
    flushPendingCommit()
    setPreviewLayout(null)
    dragStartLayoutRef.current = currentLayout
    lastResolvedTargetRef.current = null
    activeDragRef.current = activeTilingDragForSource(source, event, currentLayout)
    updateActiveResolvedTarget(null)
    setActiveDrag(source)
    if (!source) return

    logStateAfterMove({
      layout: currentLayout,
      phase: 'start',
      source,
      target: null,
    })
  }

  function handleDragMove(event: DragMoveEvent) {
    const source = sourceForDragEvent(
      event.operation.source?.data,
      activeDragRef.current,
      activeDrag,
    )
    if (!source) return

    const eventPoint = dragMovePoint(event)
    resolveAndPreview({
      candidates: snapDestinationsRef.current,
      coordinateRoot: coordinateRootRef.current,
      eventPoint: eventPoint.point,
      pointSource: eventPoint.source,
      rawTarget: null,
      source,
    })
  }

  function handleDragOver(event: DragOverEvent) {
    const source = sourceForDragEvent(
      event.operation.source?.data,
      activeDragRef.current,
      activeDrag,
    )
    const rawTarget = tilingDropData(event.operation.target?.data)
    if (!source) return

    const eventPoint = dragEventPoint(event)
    resolveAndPreview({
      candidates: snapDestinationsRef.current,
      coordinateRoot: coordinateRootRef.current,
      eventPoint: eventPoint.point,
      pointSource: eventPoint.source,
      rawTarget,
      source,
    })
  }

  function handleDragEnd(event: DragEndEvent) {
    stopTabStripBodyAutoscroll()
    const source = sourceForDragEvent(
      event.operation.source?.data,
      activeDragRef.current,
      activeDrag,
    )
    const rawTarget = tilingDropData(event.operation.target?.data)
    const eventPoint = dragEventPoint(event)
    const resolvedTarget = source
      ? (sourceReturnTargetForDragEnd(source, activeResolvedTargetRef.current) ??
        activeResolvedTargetRef.current ??
        promotedResolvedTargetForDragEnd({
          candidates: snapDestinationsRef.current,
          coordinateRoot: coordinateRootRef.current,
          eventPoint: eventPoint.point,
          rawTarget,
          source,
        }) ??
        lastResolvedTargetRef.current)
      : null
    const baseLayout = dragStartLayoutRef.current ?? layoutRef.current
    const target = resolvedTarget?.target ?? null
    if (event.canceled || !source || !target || !dropTargetCanCommit(baseLayout, target)) {
      logReleaseWithoutCommit({
        baseLayout,
        event,
        eventPoint,
        rawTarget,
        source,
        target,
      })
      restoreDragStartLayout()
      return
    }

    const nextLayout = tilingDragTargetLayout(baseLayout, source, target)
    logStateAfterMove({
      layout: nextLayout,
      phase: 'release',
      source,
      target,
    })
    dragStartLayoutRef.current = null
    lastResolvedTargetRef.current = null
    activeDragRef.current = null
    setActiveDrag(null)
    updateActiveResolvedTarget(null)
    setPreviewLayout(null)
    commitLayoutAfterDrag(nextLayout, { source, target })
  }

  function logReleaseWithoutCommit({
    baseLayout,
    event,
    eventPoint,
    rawTarget,
    source,
    target,
  }: {
    readonly baseLayout: WorkspaceLayout
    readonly event: DragEndEvent
    readonly eventPoint: PointerDetails
    readonly rawTarget: TilingDropData | null
    readonly source: TilingDragData | null
    readonly target: TilingDropData | null
  }) {
    if (!source) return

    logStateAfterMove({
      layout: baseLayout,
      phase: event.canceled ? 'cancel' : 'release',
      debug: target
        ? undefined
        : noneTargetDebug(
            source,
            eventPoint.point,
            eventPoint.source,
            rawTarget,
            activeDragRef.current,
          ),
      source,
      target,
    })
  }

  function resolveAndPreview({
    candidates,
    coordinateRoot,
    eventPoint,
    pointSource,
    rawTarget,
    source,
  }: {
    readonly candidates: readonly TilingDropCandidate[]
    readonly coordinateRoot: HTMLElement | null
    readonly eventPoint: PointerCoordinates
    readonly pointSource: PointerDetails['source']
    readonly rawTarget: TilingDropData | null
    readonly source: TilingDragData
  }) {
    const resolvedTarget = resolvedTargetForDrag({
      candidates,
      coordinateRoot,
      eventPoint,
      onBodyAutoScroll: handleBodyAutoScroll,
      previousTarget: lastResolvedTargetRef.current,
      rawTarget,
      source,
    })
    const previewTarget = promoteWindowCenterTabTarget(source, resolvedTarget, eventPoint)
    if (!previewTarget) {
      clearPreviewForMissingTarget({
        eventPoint,
        pointSource,
        rawTarget,
        source,
      })
      return
    }

    const baseLayout = dragStartLayoutRef.current ?? layoutRef.current
    const nextPreviewLayout = previewLayoutForTarget(baseLayout, source, previewTarget)
    if (dropTargetCanCommit(baseLayout, previewTarget.target)) {
      lastResolvedTargetRef.current = previewTarget
      updateActiveResolvedTarget(previewTarget)
    }
    setPreviewLayout(nextPreviewLayout)
    logStateAfterMove({
      layout: nextPreviewLayout ?? baseLayout,
      phase: 'move',
      source,
      target: previewTarget.target,
    })
  }

  function clearPreviewForMissingTarget({
    eventPoint,
    pointSource,
    rawTarget,
    source,
  }: {
    readonly eventPoint: PointerCoordinates
    readonly pointSource: PointerDetails['source']
    readonly rawTarget: TilingDropData | null
    readonly source: TilingDragData
  }) {
    stopTabStripBodyAutoscroll()
    updateActiveResolvedTarget(null)
    logStateAfterMove({
      layout: dragStartLayoutRef.current ?? layoutRef.current,
      phase: 'move',
      debug: noneTargetDebug(source, eventPoint, pointSource, rawTarget, activeDragRef.current),
      source,
      target: null,
    })
    if (!snapPreviewMode(activeDragRef.current)) return

    setPreviewLayout(null)
  }

  function handleBodyAutoScroll({ eventPoint, source, windowId }: BodyAutoScrollInput) {
    const activeTilingDrag = activeDragRef.current
    if (!activeTilingDrag || activeTilingDrag.kind !== 'tab' || !activeTilingDrag.detached) {
      stopTabStripBodyAutoscroll()
      return
    }

    const previousTarget = activeResolvedTargetRef.current ?? lastResolvedTargetRef.current
    const target = tabStripDropTargetForWindowBodyPoint(windowId, eventPoint, {
      previousIndex: previousTargetTabIndexForWindow(previousTarget, windowId),
      scroll: false,
    })
    const resolvedTarget = resolvedWindowBodyTabTarget(target)
    if (!resolvedTarget) return

    const baseLayout = dragStartLayoutRef.current ?? layoutRef.current
    if (!dropTargetCanCommit(baseLayout, resolvedTarget.target)) return

    lastResolvedTargetRef.current = resolvedTarget
    updateActiveResolvedTarget(resolvedTarget)
    logStateAfterMove({
      layout: baseLayout,
      phase: 'move',
      source,
      target: resolvedTarget.target,
    })
  }

  function logStateAfterMove(input: StateLogInput) {
    const details = stateLogDetails(input)
    if (details.signature === lastStateEventSignatureRef.current) return

    lastStateEventSignatureRef.current = details.signature
    stateEventSequenceRef.current += 1
    const event = `${stateEventSequenceRef.current}. ${details.message}`
    setStateEvents((current) => [event, ...current].slice(0, STATE_EVENT_LIMIT))
  }

  function resetInteraction() {
    clearActiveInteraction()
    setActiveDrag(null)
    resetTabStripDom()
  }

  function resetStateLog() {
    lastStateEventSignatureRef.current = null
    stateEventSequenceRef.current = 0
    setStateEvents([])
  }

  function clearActiveInteraction() {
    stopTabStripBodyAutoscroll()
    cancelPendingCommit()
    dragStartLayoutRef.current = null
    lastResolvedTargetRef.current = null
    activeDragRef.current = null
    updateActiveResolvedTarget(null)
    setPreviewLayout(null)
  }

  function restoreDragStartLayout() {
    stopTabStripBodyAutoscroll()
    dragStartLayoutRef.current = null
    lastResolvedTargetRef.current = null
    activeDragRef.current = null
    setActiveDrag(null)
    updateActiveResolvedTarget(null)
    setPreviewLayout(null)
    resetTabStripDom()
  }

  function resetTabStripDom() {
    setTabStripRenderEpoch((epoch) => epoch + 1)
  }

  function updateActiveResolvedTarget(target: ResolvedTilingTarget | null) {
    activeResolvedTargetRef.current = target
    setActiveResolvedTarget((current) => {
      if (resolvedTargetSignature(current) === resolvedTargetSignature(target)) return current

      return target
    })
  }

  function commitLayoutAfterDrag(nextLayout: WorkspaceLayout, event: TilingCommitEvent) {
    cancelPendingCommit()
    pendingCommitRef.current = { event, layout: nextLayout }
    pendingCommitFrameRef.current = requestAnimationFrame(() => {
      const pendingCommit = pendingCommitRef.current
      pendingCommitFrameRef.current = null
      pendingCommitRef.current = null
      if (!pendingCommit) return

      onCommitLayoutRef.current(pendingCommit.layout, pendingCommit.event)
      resetTabStripDom()
    })
  }

  function cancelPendingCommit() {
    cancelPendingCommitFrame(pendingCommitFrameRef)
    pendingCommitRef.current = null
  }

  function flushPendingCommit() {
    const pendingCommit = pendingCommitRef.current
    cancelPendingCommit()
    if (!pendingCommit) return

    onCommitLayoutRef.current(pendingCommit.layout, pendingCommit.event)
    resetTabStripDom()
  }

  function resolvedTargetForDrag({
    candidates,
    coordinateRoot,
    eventPoint,
    onBodyAutoScroll,
    previousTarget,
    rawTarget,
    source,
  }: {
    readonly candidates: readonly TilingDropCandidate[]
    readonly coordinateRoot: HTMLElement | null
    readonly eventPoint: PointerCoordinates
    readonly onBodyAutoScroll: (input: BodyAutoScrollInput) => void
    readonly previousTarget: ResolvedTilingTarget | null
    readonly rawTarget: TilingDropData | null
    readonly source: TilingDragData
  }) {
    const mode = intentModeForDrag(activeDragRef.current, source, eventPoint)
    const localPoint = localPointForRoot(eventPoint, coordinateRoot)
    const tabTarget = tabTargetForDrag({
      activeDrag: activeDragRef.current,
      eventPoint,
      mode,
      onBodyAutoScroll,
      previousTarget,
      rawTarget,
      source,
    })

    return resolveTilingTarget({
      candidates,
      mode,
      point: localPoint,
      previousTarget,
      source,
      sourceWindowId: sourceWindowIdForResolver(activeDragRef.current),
      tabTarget,
    })
  }

  function resolvedTargetForDragEnd({
    candidates,
    coordinateRoot,
    eventPoint,
    rawTarget,
    source,
  }: {
    readonly candidates: readonly TilingDropCandidate[]
    readonly coordinateRoot: HTMLElement | null
    readonly eventPoint: PointerCoordinates
    readonly rawTarget: TilingDropData | null
    readonly source: TilingDragData
  }) {
    const pointTarget = resolvedTargetForDrag({
      candidates,
      coordinateRoot,
      eventPoint,
      onBodyAutoScroll: handleBodyAutoScroll,
      previousTarget: null,
      rawTarget: null,
      source,
    })
    if (pointTarget) return pointTarget

    const rawWindowTarget = rawWindowTargetForDrag({
      mode: intentModeForDrag(activeDragRef.current, source, eventPoint),
      rawTarget,
      source,
    })
    if (rawWindowTarget) return rawWindowTarget

    return resolvedTargetForDrag({
      candidates,
      coordinateRoot,
      eventPoint,
      onBodyAutoScroll: handleBodyAutoScroll,
      previousTarget: null,
      rawTarget,
      source,
    })
  }

  function promotedResolvedTargetForDragEnd({
    candidates,
    coordinateRoot,
    eventPoint,
    rawTarget,
    source,
  }: {
    readonly candidates: readonly TilingDropCandidate[]
    readonly coordinateRoot: HTMLElement | null
    readonly eventPoint: PointerCoordinates
    readonly rawTarget: TilingDropData | null
    readonly source: TilingDragData
  }) {
    const resolvedTarget = resolvedTargetForDragEnd({
      candidates,
      coordinateRoot,
      eventPoint,
      rawTarget,
      source,
    })

    return promoteWindowCenterTabTarget(source, resolvedTarget, eventPoint)
  }

  return {
    activeDrag,
    activeResolvedTarget,
    flushPendingCommit,
    handleDragEnd,
    handleDragMove,
    handleDragOver,
    handleDragStart,
    insertionPreview,
    previewLayout,
    resetInteraction,
    resetStateLog,
    snapDestinations,
    snapLayout,
    stateEvents,
    tabStripRenderEpoch,
  }
}

function sourceWindowIdForDrag(layout: WorkspaceLayout, activeDrag: TilingDragData | null) {
  if (!activeDrag) return null
  if (activeDrag.kind === 'window') return activeDrag.windowId

  return findWindowIdContainingSurface(layout, activeDrag.surfaceId)
}

function sourceWindowRectForDrag(
  windowRectsById: LayoutGeometry['windowRectsById'],
  activeDrag: TilingDragData | null,
) {
  if (activeDrag?.kind !== 'window') return null

  return windowRectsById[activeDrag.windowId]?.rect ?? null
}

function stateLogDetails({ debug, layout, phase, source, target }: StateLogInput) {
  const sourceLabel = stateSourceLabel(layout, source)
  const targetLabel = stateTargetLabel(layout, target)
  const layoutLabel = layoutStateSummary(layout)
  const debugLabel = debug ? ` (${debug})` : ''
  const message = `${phase} ${sourceLabel} -> ${targetLabel}${debugLabel} | ${layoutLabel}`

  return {
    message,
    signature: `${phase}|${sourceLabel}|${targetLabel}|${debug ?? ''}|${layoutLabel}`,
  }
}

function sourceReturnTargetForDragEnd(source: TilingDragData, target: ResolvedTilingTarget | null) {
  if (source.kind !== 'window') return null
  if (!target?.candidateId?.includes('source-return')) return null
  if (target.target.kind !== 'window') return null
  if (target.target.windowId !== source.windowId) return null

  return target
}

function noneTargetDebug(
  source: TilingDragData,
  point: PointerCoordinates,
  pointSource: PointerDetails['source'],
  rawTarget: TilingDropData | null,
  activeDrag: ActiveTilingDrag | null,
) {
  const sourceStripRect = activeDrag?.kind === 'tab' ? activeDrag.stripRect : null
  const sourceStripOrientation = activeDrag?.kind === 'tab' ? activeDrag.stripOrientation : null
  const tabStripProbe = describeTabStripHitTest(source, point, {
    sourceStripOrientation,
    sourceStripRect,
  })

  return `${pointSource}@${formatPoint(point)} raw=${rawTargetDebugLabel(rawTarget)} ${tabStripProbe}`
}

function rawTargetDebugLabel(target: TilingDropData | null) {
  if (!target) return 'none'
  if (target.kind === 'tab') return `tab:${target.index}`
  if (target.kind === 'tab-strip') return `strip:${target.index}`
  if (target.kind === 'window') return 'window'

  return target.destination.kind
}

function formatPoint(point: PointerCoordinates) {
  return `${Math.round(point.x)},${Math.round(point.y)}`
}

function layoutStateSummary(layout: WorkspaceLayout) {
  const windowIds = visibleWindowIdsInOrder(layout)
  if (windowIds.length === 0) return '0w'

  const windowLabels = windowIds.map((windowId, index) =>
    layoutWindowSummary(layout, windowId, index),
  )

  return `${windowIds.length}w ${windowLabels.join(' | ')}`
}

function layoutWindowSummary(layout: WorkspaceLayout, windowId: WindowId, index: number) {
  const window = layout.windowsById[windowId]
  if (!window) return `W${index + 1}:[]`

  const tabs = window.surfaceIds
    .map((surfaceId) => layoutTabSummary(layout, surfaceId, window.activeSurfaceId))
    .join(',')

  return `W${index + 1}:[${tabs}]`
}

function layoutTabSummary(
  layout: WorkspaceLayout,
  surfaceId: SurfaceId,
  activeSurfaceId: SurfaceId,
) {
  const title = stateSurfaceTitle(layout, surfaceId)
  if (surfaceId === activeSurfaceId) return `${title}*`

  return title
}

function stateSourceLabel(layout: WorkspaceLayout, source: TilingDragData) {
  if (source.kind === 'tab') return `tab:${stateSurfaceTitle(layout, source.surfaceId)}`

  return `window:${stateWindowTitle(layout, source.windowId)}`
}

function stateTargetLabel(layout: WorkspaceLayout, target: TilingDropData | null) {
  if (!target) return 'none'
  if (target.kind === 'tab') return `${stateWindowTitle(layout, target.windowId)}:${target.index}`
  if (target.kind === 'tab-strip') {
    return `${stateWindowTitle(layout, target.windowId)}:${target.index}`
  }
  if (target.kind === 'window') return `window:${stateWindowTitle(layout, target.windowId)}`

  return stateDestinationLabel(layout, target.destination)
}

function stateDestinationLabel(layout: WorkspaceLayout, destination: SnapDestination) {
  if (destination.kind === 'root-edge') return `root ${destination.edge}`
  if (destination.kind === 'window-edge') {
    return `${stateWindowTitle(layout, destination.windowId)} ${destination.edge}`
  }
  if (destination.kind === 'window-center') {
    return `${stateWindowTitle(layout, destination.windowId)}:${destination.tabIndex ?? 'end'}`
  }
  if (destination.kind === 'parent-edge') return `parent ${destination.edge}`
  if (destination.kind === 'recipe-slot') return `slot ${destination.slot}`

  return destination.kind
}

function stateWindowTitle(layout: WorkspaceLayout, windowId: WindowId) {
  const window = layout.windowsById[windowId]
  if (!window) return String(windowId)

  return stateSurfaceTitle(layout, window.activeSurfaceId)
}

function stateSurfaceTitle(layout: WorkspaceLayout, surfaceId: SurfaceId) {
  return layout.surfacesById[surfaceId]?.title ?? String(surfaceId)
}

function activeTilingDragForSource(
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
  }
}

function sourceTabIndex(data: unknown) {
  const target = tilingDropData(data)
  if (target?.kind !== 'tab') return null

  return target.index
}

function sourceWindowIdForResolver(activeDrag: ActiveTilingDrag | null) {
  if (!activeDrag) return null
  if (activeDrag.kind === 'window') return activeDrag.source.windowId

  return activeDrag.sourceWindowId
}

function intentModeForDrag(
  activeDrag: ActiveTilingDrag | null,
  source: TilingDragData,
  point: PointerCoordinates,
): TilingIntentMode {
  if (source.kind === 'window') return 'window'
  if (!activeDrag || activeDrag.kind !== 'tab') return 'tab-detached'

  updateTabDetachState(activeDrag, point)
  if (activeDrag.detached) return 'tab-detached'

  return 'tab-reorder'
}

function tabTargetForDrag({
  activeDrag,
  eventPoint,
  mode,
  onBodyAutoScroll,
  previousTarget,
  rawTarget,
  source,
}: {
  readonly activeDrag: ActiveTilingDrag | null
  readonly eventPoint: PointerCoordinates
  readonly mode: TilingIntentMode
  readonly onBodyAutoScroll: (input: BodyAutoScrollInput) => void
  readonly previousTarget: ResolvedTilingTarget | null
  readonly rawTarget: TilingDropData | null
  readonly source: TilingDragData
}) {
  if (mode === 'tab-detached') {
    const sourceStripRect = activeDrag?.kind === 'tab' ? activeDrag.stripRect : null
    const sourceStripOrientation = activeDrag?.kind === 'tab' ? activeDrag.stripOrientation : null
    const pointTarget = tabTargetFromHit(
      tabStripDropHitAtPoint(source, eventPoint, { sourceStripOrientation, sourceStripRect }),
      'app',
    )
    if (pointTarget) {
      stopTabStripBodyAutoscroll()
      return pointTarget
    }

    const bodyTarget =
      stickyWindowBodyTabTargetForDrag(source, previousTarget, eventPoint, onBodyAutoScroll) ??
      windowBodyTabTargetForDrag(source, eventPoint, previousTarget, onBodyAutoScroll)
    if (bodyTarget) return bodyTarget

    stopTabStripBodyAutoscroll()
    return rawTabTargetForPoint(source, rawTarget, eventPoint)
  }
  if (mode === 'window') {
    stopTabStripBodyAutoscroll()
    return (
      tabTargetFromHit(tabStripDropHitAtPoint(source, eventPoint)) ??
      rawTabTargetForPoint(source, rawTarget, eventPoint)
    )
  }
  if (mode !== 'tab-reorder') {
    stopTabStripBodyAutoscroll()
    return null
  }

  stopTabStripBodyAutoscroll()
  return tabReorderTargetForDrag({ activeDrag, eventPoint, source })
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
    tabTargetFromTarget(tabStripDropTargetForWindowAtPoint(activeDrag.sourceWindowId, eventPoint))
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
): TilingTabTarget | null {
  if (source.kind !== 'tab') return null

  const windowId = centerWindowIdAtPoint(eventPoint)
  if (!windowId) return null

  return tabTargetFromTarget(
    tabStripDropTargetForWindowBodyPoint(windowId, eventPoint, {
      continuousAutoscroll: true,
      onAutoScroll: () => onBodyAutoScroll({ eventPoint, source, windowId }),
      previousIndex: previousTargetTabIndexForWindow(previousTarget, windowId),
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
): TilingTabTarget | null {
  if (source.kind !== 'tab') return null

  const windowId = tabTargetWindowId(previousTarget?.target ?? null)
  if (!windowId) return null
  if (!pointIsInsideTilingWindowCenter(windowId, eventPoint, WINDOW_BODY_STICKY_INFLATE_PX)) {
    return null
  }

  return tabTargetFromTarget(
    tabStripDropTargetForWindowBodyPoint(windowId, eventPoint, {
      continuousAutoscroll: true,
      onAutoScroll: () => onBodyAutoScroll({ eventPoint, source, windowId }),
      previousIndex: previousTargetTabIndexForWindow(previousTarget, windowId),
    }),
    WINDOW_BODY_TAB_TARGET_PRIORITY,
    'app',
  )
}

function previousTargetTabIndexForWindow(
  previousTarget: ResolvedTilingTarget | null,
  windowId: WindowId,
) {
  const target = previousTarget?.target ?? null
  if (tabTargetWindowId(target) !== windowId) return null

  return tabTargetIndex(target)
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

function rawWindowTargetForDrag({
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

function rawWindowTargetForTab(
  mode: TilingIntentMode,
  rawTarget: Extract<TilingDropData, { readonly kind: 'window' }>,
): ResolvedTilingTarget | null {
  if (mode !== 'tab-detached') return null

  return { mode, target: rawTarget }
}

function promoteWindowCenterTabTarget(
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
    { previousIndex: target.target.destination.tabIndex ?? null },
  )
  if (!tabTarget) return target

  return {
    mode: target.mode,
    previewKind: 'app',
    target: tabTarget,
  }
}

function sourceForDragEvent(
  data: unknown,
  activeDrag: ActiveTilingDrag | null,
  fallback: TilingDragData | null,
) {
  const source = tilingDragData(data)
  if (source) return source
  if (activeDrag) return activeDrag.source

  return fallback
}

function tabTargetFromHit(
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

function tabTargetFromTarget(
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

function resolvedWindowBodyTabTarget(target: TilingDropData | null): ResolvedTilingTarget | null {
  const tabTarget = tabTargetFromTarget(target, WINDOW_BODY_TAB_TARGET_PRIORITY, 'app')
  if (!tabTarget) return null

  return {
    mode: 'tab-detached',
    previewKind: 'app',
    target: tabTarget.target,
  }
}

function tabTargetPriority(strength: TilingTabStripHit['strength']) {
  if (strength === 'direct') return DIRECT_TAB_TARGET_PRIORITY
  if (strength === 'strip') return STRIP_TAB_TARGET_PRIORITY

  return DOCK_TAB_TARGET_PRIORITY
}

function targetBelongsToTabStrip(
  target: TilingDropData,
): target is Extract<TilingDropData, { readonly kind: 'tab' | 'tab-strip' }> {
  return target.kind === 'tab' || target.kind === 'tab-strip'
}

function snapPreviewMode(activeDrag: ActiveTilingDrag | null) {
  if (!activeDrag) return false
  if (activeDrag.kind === 'window') return true

  return activeDrag.detached
}

function updateTabDetachState(
  activeDrag: Extract<ActiveTilingDrag, { readonly kind: 'tab' }>,
  point: PointerCoordinates,
) {
  if (activeDrag.detached) return

  const outsideDistance = tabStripOutsideDistance(
    activeDrag.stripRect,
    activeDrag.stripOrientation,
    point,
  )
  const threshold = tabDetachThreshold(activeDrag.pointerType)
  activeDrag.detached = outsideDistance >= threshold
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

function distanceFromRange(value: number, min: number, max: number) {
  if (value < min) return min - value
  if (value > max) return value - max

  return 0
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

function localPointForRoot(point: PointerCoordinates, coordinateRoot: HTMLElement | null) {
  const rect = coordinateRoot?.getBoundingClientRect()
  if (!rect) return point

  return {
    x: point.x - rect.left,
    y: point.y - rect.top,
  }
}

function dragMovePoint(event: DragMoveEvent) {
  const nativePoint = pointFromEvent(event.nativeEvent)
  if (nativePoint) return { point: nativePoint, source: 'native' } satisfies PointerDetails
  if (event.to) return { point: event.to, source: 'to' } satisfies PointerDetails

  return {
    point: event.operation.position.current,
    source: 'operation',
  } satisfies PointerDetails
}

function dragEventPoint(event: DragEndEvent | DragOverEvent) {
  const nativeEvent = 'nativeEvent' in event ? event.nativeEvent : null
  const nativePoint = pointFromEvent(nativeEvent)
  if (nativePoint) return { point: nativePoint, source: 'native' } satisfies PointerDetails

  return {
    point: event.operation.position.current,
    source: 'operation',
  } satisfies PointerDetails
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

function cancelPendingCommitFrame(ref: { current: number | null }) {
  if (ref.current === null) return

  cancelAnimationFrame(ref.current)
  ref.current = null
}

function previewLayoutForTarget(
  baseLayout: WorkspaceLayout,
  source: TilingDragData,
  resolvedTarget: ResolvedTilingTarget,
) {
  const target = resolvedTarget.target
  if (!dropTargetCanCommit(baseLayout, target)) return null
  if (!tabDragCanPreviewTarget(source, target)) return baseLayout
  if (targetMergesWindowIntoTabs(source, target)) {
    return tilingDragTargetLayout(baseLayout, source, target)
  }
  if (resolvedTarget.previewKind === 'dnd-kit') return null
  if (resolvedTarget.previewKind === 'app' && targetBelongsToTabStrip(target)) return null

  return tilingDragTargetLayout(baseLayout, source, target)
}

function tabDragCanPreviewTarget(source: TilingDragData, target: TilingDropData) {
  if (source.kind !== 'tab') return true
  if (target.kind !== 'snap-destination') return true

  return target.destination.kind !== 'window-center'
}

function targetMergesWindowIntoTabs(source: TilingDragData, target: TilingDropData) {
  if (source.kind !== 'window') return false
  if (target.kind === 'tab' || target.kind === 'tab-strip') return true

  return target.kind === 'snap-destination' && target.destination.kind === 'window-center'
}

function tilingDragTargetLayout(
  layout: WorkspaceLayout,
  source: TilingDragData,
  target: TilingDropData,
) {
  if (source.kind === 'tab') return tabDragTargetLayout(layout, source, target)
  if (target.kind === 'snap-destination')
    return moveWindow(layout, source.windowId, target.destination)
  if (target.kind === 'window')
    return windowToWindowTargetLayout(layout, source.windowId, target.windowId)
  if (target.kind === 'tab' || target.kind === 'tab-strip') {
    return moveWindow(layout, source.windowId, {
      kind: 'window-center',
      tabIndex: target.index,
      windowId: target.windowId,
    })
  }

  return layout
}

function windowToWindowTargetLayout(
  layout: WorkspaceLayout,
  sourceWindowId: WindowId,
  targetWindowId: WindowId,
) {
  if (sourceWindowId === targetWindowId) return layout

  return moveWindow(layout, sourceWindowId, {
    edge: 'right',
    kind: 'window-edge',
    windowId: targetWindowId,
  })
}

function tabDragTargetLayout(
  layout: WorkspaceLayout,
  source: Extract<TilingDragData, { readonly kind: 'tab' }>,
  target: TilingDropData,
) {
  if (target.kind === 'tab') {
    return tabSurface(layout, source.surfaceId, target.windowId, target.index)
  }
  if (target.kind === 'tab-strip') {
    return tabSurface(layout, source.surfaceId, target.windowId, target.index)
  }
  if (target.kind === 'snap-destination') {
    return moveSurface(layout, source.surfaceId, target.destination)
  }
  if (target.kind === 'window') {
    return moveSurfaceToWindowEnd(layout, source.surfaceId, target.windowId)
  }

  return layout
}

function moveSurfaceToWindowEnd(
  layout: WorkspaceLayout,
  surfaceId: SurfaceId,
  targetWindowId: WindowId,
) {
  const targetWindow = layout.windowsById[targetWindowId]
  if (!targetWindow) return layout

  return tabSurface(layout, surfaceId, targetWindowId, targetWindow.surfaceIds.length)
}

function targetExistsInLayout(layout: WorkspaceLayout, target: TilingDropData) {
  if (target.kind === 'tab') return Boolean(layout.surfacesById[target.surfaceId])
  if (target.kind === 'tab-strip') return Boolean(layout.windowsById[target.windowId])
  if (target.kind === 'window') return Boolean(layout.windowsById[target.windowId])

  return true
}

function dropTargetCanCommit(layout: WorkspaceLayout, target: TilingDropData) {
  if (target.kind !== 'snap-destination') return targetExistsInLayout(layout, target)

  return snapDestinationCanCommit(layout, target.destination)
}

function snapDestinationCanCommit(layout: WorkspaceLayout, destination: SnapDestination) {
  if (destination.kind === 'root-edge') return Boolean(layout.rootNodeId)
  if (destination.kind === 'window-edge') return Boolean(layout.windowsById[destination.windowId])
  if (destination.kind === 'window-center') return Boolean(layout.windowsById[destination.windowId])
  if (destination.kind === 'parent-edge') return Boolean(layout.nodesById[destination.nodeId])

  return true
}

function resolvedTargetSignature(target: ResolvedTilingTarget | null) {
  if (!target) return 'none'

  return [
    target.mode,
    target.previewKind ?? 'snap',
    target.candidateId ?? '',
    dropTargetSignature(target.target),
  ].join('|')
}

function dropTargetSignature(target: TilingDropData) {
  if (target.kind === 'tab') return `tab:${target.windowId}:${target.surfaceId}:${target.index}`
  if (target.kind === 'tab-strip') return `strip:${target.windowId}:${target.index}`
  if (target.kind === 'window') return `window:${target.windowId}`

  return snapDestinationSignature(target.destination)
}

function snapDestinationSignature(destination: SnapDestination) {
  if (destination.kind === 'root-edge') return `root:${destination.edge}`
  if (destination.kind === 'window-edge') {
    return `window-edge:${destination.windowId}:${destination.edge}`
  }
  if (destination.kind === 'window-center') {
    return `window-center:${destination.windowId}:${destination.tabIndex ?? 'end'}`
  }
  if (destination.kind === 'parent-edge') return `parent:${destination.nodeId}:${destination.edge}`
  if (destination.kind === 'recipe-slot') return `slot:${destination.slot}`

  return destination.kind
}
