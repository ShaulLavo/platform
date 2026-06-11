import { useEffect, useRef, useState } from 'react'
import type { DragEndEvent, DragMoveEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/react'

import {
  tilingDragData,
  tilingDropData,
  type TilingDragData,
  type TilingDropData,
} from '@workspace/tiling/utils/drag-data'
import type { PointerCoordinates } from '@workspace/tiling/utils/geometry-primitives'
import type { LayoutGeometry, LayoutRect } from '@workspace/tiling/utils/layout-geometry'
import type { WorkspaceLayout } from '@workspace/tiling/utils/layout-types'
import {
  resolveTilingTarget,
  type ResolvedTilingTarget,
} from '@workspace/tiling/utils/drop-target-resolver'
import { mergeEquivalentDropCandidates } from '@workspace/tiling/utils/drop-candidate-merge'
import {
  dropCandidatesForDragSource,
  tilingSnapDestinations,
  type TilingDropCandidate,
} from '@workspace/tiling/utils/snap-destinations'
import { tilingInsertionPreview } from '@workspace/tiling/utils/tab-preview'
import {
  createTabStripBodyAutoscroller,
  type TabStripBodyAutoscroller,
} from '@workspace/tiling/state/tab-strip-body-autoscroller'
import {
  activeTilingDragForSource,
  cancelPendingCommitFrame,
  dragEventPoint,
  dragMovePoint,
  localPointForRoot,
  sourceForDragEvent,
  sourceWindowIdForDrag,
  sourceWindowIdForResolver,
  sourceWindowRectForDrag,
  type ActiveTilingDrag,
  type PointerDetails,
} from '@workspace/tiling/utils/drag-state'
import {
  dragTargetForCommit,
  previewLayoutForTarget,
  resolvedTargetForCommit,
  resolvedTargetSignature,
  tilingDragTargetLayout,
} from '@workspace/tiling/utils/drag-layout'
import type { TilingDragDebugLogger } from '@workspace/tiling/hooks/use-tiling-drag-debug-log'
import {
  promoteWindowCenterTabTarget,
  rawWindowTargetForDrag,
  resolvedWindowBodyTabTargetForPoint,
  resolveIntentModeAndUpdateDetach,
  snapPreviewMode,
  sourceReturnTargetForDragEnd,
  tabTargetForDrag,
  tabTargetForDragSource,
  type BodyAutoScrollInput,
} from '@workspace/tiling/utils/drag-targets'

export type TilingCommitEvent = {
  readonly source: TilingDragData
  readonly target: TilingDropData
}

export type UseTilingDragControllerInput = {
  readonly coordinateRootRef: { readonly current: HTMLElement | null }
  readonly debugLog?: TilingDragDebugLogger
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
  debugLog,
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
  const [tabStripRenderEpoch, setTabStripRenderEpoch] = useState(0)
  const activeDragRef = useRef<ActiveTilingDrag | null>(null)
  const activeResolvedTargetRef = useRef<ResolvedTilingTarget | null>(null)
  const dragStartLayoutRef = useRef<WorkspaceLayout | null>(null)
  const lastResolvedTargetRef = useRef<ResolvedTilingTarget | null>(null)
  const layoutRef = useRef(layout)
  const onCommitLayoutRef = useRef(onCommitLayout)
  const pendingCommitFrameRef = useRef<number | null>(null)
  const pendingCommitRef = useRef<PendingCommit | null>(null)
  const bodyAutoscrollerRef = useRef<TabStripBodyAutoscroller | null>(null)
  const bodyAutoscroller = bodyAutoscrollerRef.current ?? createTabStripBodyAutoscroller()
  const snapLayout = activeDrag && dragStartLayoutRef.current ? dragStartLayoutRef.current : layout
  const snapDestinations = mergeEquivalentDropCandidates(
    snapLayout,
    activeDrag,
    dropCandidatesForDragSource(
      snapLayout,
      activeDrag,
      tilingSnapDestinations({
        activeDrag,
        rootRect,
        snapDestinationRects,
        sourceWindowId: sourceWindowIdForDrag(snapLayout, activeDrag),
        sourceWindowRect: sourceWindowRectForDrag(windowRectsById, activeDrag),
      }),
    ),
  )
  const snapDestinationsRef = useRef(snapDestinations)
  const insertionPreview = tilingInsertionPreview({
    activeDrag,
    layout: snapLayout,
    resolvedTarget: activeResolvedTarget,
  })

  layoutRef.current = layout
  onCommitLayoutRef.current = onCommitLayout
  snapDestinationsRef.current = snapDestinations
  bodyAutoscrollerRef.current = bodyAutoscroller

  useEffect(() => {
    return () => {
      bodyAutoscroller.stop()
      cancelPendingCommitFrame(pendingCommitFrameRef)
      pendingCommitRef.current = null
    }
  }, [])

  function handleDragStart(event: DragStartEvent) {
    const currentLayout = layoutRef.current
    const source = tilingDragData(event.operation.source?.data)
    bodyAutoscroller.stop()
    flushPendingCommit()
    setPreviewLayout(null)
    dragStartLayoutRef.current = currentLayout
    lastResolvedTargetRef.current = null
    activeDragRef.current = activeTilingDragForSource(source, event, currentLayout)
    updateActiveResolvedTarget(null)
    setActiveDrag(source)
    if (!source) return

    debugLog?.logStateAfterMove({
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
    bodyAutoscroller.stop()
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
    const commitTarget = source && target ? dragTargetForCommit(baseLayout, source, target) : null
    if (event.canceled || !source || !target || !commitTarget) {
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

    const nextLayout = tilingDragTargetLayout(baseLayout, source, commitTarget)
    debugLog?.logStateAfterMove({
      layout: nextLayout,
      phase: 'release',
      source,
      target: commitTarget,
    })
    dragStartLayoutRef.current = null
    lastResolvedTargetRef.current = null
    activeDragRef.current = null
    setActiveDrag(null)
    updateActiveResolvedTarget(null)
    setPreviewLayout(null)
    commitLayoutAfterDrag(nextLayout, { source, target: commitTarget })
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

    if (target) {
      debugLog?.logStateAfterMove({
        layout: baseLayout,
        phase: event.canceled ? 'cancel' : 'release',
        source,
        target,
      })
      return
    }

    debugLog?.logMissingTarget({
      activeDrag: activeDragRef.current,
      layout: baseLayout,
      phase: event.canceled ? 'cancel' : 'release',
      point: eventPoint.point,
      pointSource: eventPoint.source,
      rawTarget,
      source,
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
    const committableTarget = resolvedTargetForCommit(baseLayout, source, previewTarget)
    if (!committableTarget) {
      clearPreviewForMissingTarget({
        eventPoint,
        pointSource,
        rawTarget,
        source,
      })
      return
    }

    const nextPreviewLayout = previewLayoutForTarget(baseLayout, source, committableTarget)
    lastResolvedTargetRef.current = committableTarget
    updateActiveResolvedTarget(committableTarget)
    setPreviewLayout(nextPreviewLayout)
    debugLog?.logStateAfterMove({
      layout: nextPreviewLayout ?? baseLayout,
      phase: 'move',
      source,
      target: committableTarget.target,
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
    bodyAutoscroller.stop()
    updateActiveResolvedTarget(null)
    debugLog?.logMissingTarget({
      activeDrag: activeDragRef.current,
      layout: dragStartLayoutRef.current ?? layoutRef.current,
      phase: 'move',
      point: eventPoint,
      pointSource,
      rawTarget,
      source,
    })
    if (!snapPreviewMode(activeDragRef.current)) return

    setPreviewLayout(null)
  }

  function handleBodyAutoScroll({ eventPoint, source, windowId }: BodyAutoScrollInput) {
    const activeTilingDrag = activeDragRef.current
    if (!activeTilingDrag || activeTilingDrag.kind !== 'tab' || !activeTilingDrag.detached) {
      bodyAutoscroller.stop()
      return
    }

    const previousTarget = activeResolvedTargetRef.current ?? lastResolvedTargetRef.current
    const resolvedTarget = resolvedWindowBodyTabTargetForPoint({
      eventPoint,
      previousTarget,
      scroll: false,
      sourceTabId: source.surfaceId,
      windowId,
    })
    if (!resolvedTarget) return

    const baseLayout = dragStartLayoutRef.current ?? layoutRef.current
    const committableTarget = resolvedTargetForCommit(baseLayout, source, resolvedTarget)
    if (!committableTarget) return

    lastResolvedTargetRef.current = committableTarget
    updateActiveResolvedTarget(committableTarget)
    debugLog?.logStateAfterMove({
      layout: baseLayout,
      phase: 'move',
      source,
      target: committableTarget.target,
    })
  }

  function resetInteraction() {
    clearActiveInteraction()
    setActiveDrag(null)
    resetTabStripDom()
  }

  function clearActiveInteraction() {
    bodyAutoscroller.stop()
    cancelPendingCommit()
    dragStartLayoutRef.current = null
    lastResolvedTargetRef.current = null
    activeDragRef.current = null
    updateActiveResolvedTarget(null)
    setPreviewLayout(null)
  }

  function restoreDragStartLayout() {
    bodyAutoscroller.stop()
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
    const mode = resolveIntentModeAndUpdateDetach(activeDragRef.current, source, eventPoint)
    const localPoint = localPointForRoot(eventPoint, coordinateRoot)
    const tabTarget = tabTargetForDragSource(
      dragStartLayoutRef.current ?? layoutRef.current,
      source,
      tabTargetForDrag({
        activeDrag: activeDragRef.current,
        bodyAutoscroller,
        eventPoint,
        mode,
        onBodyAutoScroll,
        previousTarget,
        rawTarget,
        source,
      }),
    )

    return resolveTilingTarget({
      candidates,
      mode,
      point: localPoint,
      previousTarget,
      rootRect,
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
      mode: resolveIntentModeAndUpdateDetach(activeDragRef.current, source, eventPoint),
      rawTarget,
      source,
    })
    const baseLayout = dragStartLayoutRef.current ?? layoutRef.current
    if (rawWindowTarget && dragTargetForCommit(baseLayout, source, rawWindowTarget.target)) {
      return rawWindowTarget
    }

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
    snapDestinations,
    snapLayout,
    tabStripRenderEpoch,
  }
}
