import { useEffect, useRef, useState } from 'react'
import type { DragEndEvent, DragMoveEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/react'

import {
  activateProofSurface,
  addProofTab,
  addProofWindow,
  createInitialProofModel,
  createProofScenarioModel,
  dispatchProofLayoutOperation,
  moveProofSurfaceToDestination,
  moveProofSurfaceToTab,
  moveProofSurfaceToWindowEnd,
  moveProofWindowNextToWindow,
  moveProofWindowToDestination,
  removeProofSurface,
  removeProofWindow,
  surfaceWindowId,
  type ProofModel,
  type ProofScenario,
} from '@/features/dnd-proof/utils/model'
import {
  proofDragData,
  proofDropData,
  type DndProofDragData,
  type DndProofDropData,
} from '@/features/dnd-proof/utils/drag-data'
import type {
  LayoutOperation,
  SnapDestination,
  SurfaceId,
  WindowId,
  WorkspaceLayout,
} from '@/features/tiling-surface-manager/engine/layout-types'
import type { LayoutRect } from '@/features/tiling-surface-manager/engine/layout-geometry'
import { visibleWindowIdsInOrder } from '@/features/tiling-surface-manager/engine/layout-normalize'
import {
  describeTabStripHitTest,
  pointIsInsideProofWindowCenter,
  proofWindowCenterElementAtPoint,
  resolveTabStripDropTarget,
  stopTabStripBodyAutoscroll,
  tabStripDropHitAtPoint,
  tabStripDropTargetForWindowBodyPoint,
  tabStripDropTargetForWindowAtPoint,
  tabStripDropTargetMatchesPoint,
  type DndProofTabStripHit,
} from '@/features/dnd-proof/utils/tab-strip-hit-test'
import {
  resolveDndProofTarget,
  type DndProofTabTarget,
  type DndProofIntentMode,
  type ResolvedDndProofTarget,
} from '@/features/dnd-proof/utils/drop-target-resolver'
import type { DndProofDropCandidate } from '@/features/dnd-proof/utils/snap-destinations'

const TAB_MOUSE_DETACH_THRESHOLD_PX = 15
const TAB_TOUCH_DETACH_THRESHOLD_PX = 50
const DIRECT_TAB_TARGET_PRIORITY = 110
const WINDOW_BODY_TAB_TARGET_PRIORITY = 100
const STRIP_TAB_TARGET_PRIORITY = 106
const DOCK_TAB_TARGET_PRIORITY = 108
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
  readonly source: DndProofDragData
  readonly target: DndProofDropData | null
}

type BodyAutoScrollInput = {
  readonly eventPoint: PointerCoordinates
  readonly source: Extract<DndProofDragData, { readonly kind: 'tab' }>
  readonly windowId: WindowId
}

type ActiveProofDrag =
  | {
      detached: boolean
      kind: 'tab'
      pointerType: string
      source: Extract<DndProofDragData, { readonly kind: 'tab' }>
      sourceIndex: number | null
      sourceWindowId: WindowId | null
      stripRect: LayoutRect | null
      stripOrientation: 'horizontal' | 'vertical' | null
    }
  | {
      kind: 'window'
      source: Extract<DndProofDragData, { readonly kind: 'window' }>
    }

export function useDndProofModel() {
  const [model, setModel] = useState(createInitialProofModel)
  const [previewModel, setPreviewModel] = useState<ProofModel | null>(null)
  const [activeDrag, setActiveDrag] = useState<DndProofDragData | null>(null)
  const [activeResolvedTarget, setActiveResolvedTarget] = useState<ResolvedDndProofTarget | null>(
    null,
  )
  const [stateEvents, setStateEvents] = useState<readonly string[]>([])
  const [tabStripRenderEpoch, setTabStripRenderEpoch] = useState(0)
  const activeDragRef = useRef<ActiveProofDrag | null>(null)
  const dragStartModelRef = useRef<ProofModel | null>(null)
  const activeResolvedTargetRef = useRef<ResolvedDndProofTarget | null>(null)
  const lastResolvedTargetRef = useRef<ResolvedDndProofTarget | null>(null)
  const lastStateEventSignatureRef = useRef<string | null>(null)
  const pendingCommitFrameRef = useRef<number | null>(null)
  const pendingCommitModelRef = useRef<ProofModel | null>(null)
  const stateEventSequenceRef = useRef(0)

  useEffect(() => {
    return () => {
      stopTabStripBodyAutoscroll()
      cancelPendingCommitFrame(pendingCommitFrameRef)
      pendingCommitModelRef.current = null
    }
  }, [])

  function handleDragStart(event: DragStartEvent) {
    const source = proofDragData(event.operation.source?.data)
    stopTabStripBodyAutoscroll()
    flushPendingCommit()
    setPreviewModel(null)
    dragStartModelRef.current = model
    lastResolvedTargetRef.current = null
    activeDragRef.current = activeProofDragForSource(source, event, model)
    updateActiveResolvedTarget(null)
    setActiveDrag(source)
    if (!source) return

    logStateAfterMove({
      layout: model.layout,
      phase: 'start',
      source,
      target: null,
    })
  }

  function handleDragMove(
    event: DragMoveEvent,
    candidates: readonly DndProofDropCandidate[],
    coordinateRoot: HTMLElement | null,
  ) {
    const source = sourceForDragEvent(
      event.operation.source?.data,
      activeDragRef.current,
      activeDrag,
    )
    if (!source) return

    const eventPoint = dragMovePoint(event)
    resolveAndPreview({
      candidates,
      coordinateRoot,
      eventPoint: eventPoint.point,
      pointSource: eventPoint.source,
      rawTarget: null,
      source,
    })
  }

  function handleDragOver(
    event: DragOverEvent,
    candidates: readonly DndProofDropCandidate[],
    coordinateRoot: HTMLElement | null,
  ) {
    const source = sourceForDragEvent(
      event.operation.source?.data,
      activeDragRef.current,
      activeDrag,
    )
    const rawTarget = proofDropData(event.operation.target?.data)
    if (!source) return

    const eventPoint = dragEventPoint(event)
    resolveAndPreview({
      candidates,
      coordinateRoot,
      eventPoint: eventPoint.point,
      pointSource: eventPoint.source,
      rawTarget,
      source,
    })
  }

  function handleDragEnd(
    event: DragEndEvent,
    candidates: readonly DndProofDropCandidate[],
    coordinateRoot: HTMLElement | null,
  ) {
    stopTabStripBodyAutoscroll()
    const source = sourceForDragEvent(
      event.operation.source?.data,
      activeDragRef.current,
      activeDrag,
    )
    const rawTarget = proofDropData(event.operation.target?.data)
    const eventPoint = dragEventPoint(event)
    const resolvedTarget = source
      ? (sourceReturnTargetForDragEnd(source, activeResolvedTargetRef.current) ??
        activeResolvedTargetRef.current ??
        promotedResolvedTargetForDragEnd({
          candidates,
          coordinateRoot,
          eventPoint: eventPoint.point,
          rawTarget,
          source,
        }) ??
        lastResolvedTargetRef.current)
      : null
    const baseModel = dragStartModelRef.current ?? model
    const target = resolvedTarget?.target ?? null
    if (event.canceled || !source || !target || !dropTargetCanCommit(baseModel.layout, target)) {
      if (source) {
        logStateAfterMove({
          layout: baseModel.layout,
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
      restoreDragStartModel()
      return
    }

    const nextModel = proofDragTargetModel(baseModel, source, target)
    logStateAfterMove({
      layout: nextModel.layout,
      phase: 'release',
      source,
      target,
    })
    dragStartModelRef.current = null
    lastResolvedTargetRef.current = null
    activeDragRef.current = null
    setActiveDrag(null)
    updateActiveResolvedTarget(null)
    setPreviewModel(null)
    commitModelAfterDrag(nextModel)
  }

  function resolveAndPreview({
    candidates,
    coordinateRoot,
    eventPoint,
    pointSource,
    rawTarget,
    source,
  }: {
    readonly candidates: readonly DndProofDropCandidate[]
    readonly coordinateRoot: HTMLElement | null
    readonly eventPoint: PointerCoordinates
    readonly pointSource: PointerDetails['source']
    readonly rawTarget: DndProofDropData | null
    readonly source: DndProofDragData
  }) {
    const resolvedTarget = resolvedTargetForDrag({
      candidates,
      coordinateRoot,
      eventPoint,
      onBodyAutoScroll: handleBodyAutoScroll,
      rawTarget,
      previousTarget: lastResolvedTargetRef.current,
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

    const baseModel = dragStartModelRef.current ?? model
    const nextPreviewModel = previewModelForTarget(baseModel, source, previewTarget)
    if (dropTargetCanCommit(baseModel.layout, previewTarget.target)) {
      lastResolvedTargetRef.current = previewTarget
      updateActiveResolvedTarget(previewTarget)
    }
    setPreviewModel(nextPreviewModel)
    logStateAfterMove({
      layout: nextPreviewModel?.layout ?? baseModel.layout,
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
    readonly rawTarget: DndProofDropData | null
    readonly source: DndProofDragData
  }) {
    stopTabStripBodyAutoscroll()
    updateActiveResolvedTarget(null)
    logStateAfterMove({
      layout: (dragStartModelRef.current ?? model).layout,
      phase: 'move',
      debug: noneTargetDebug(source, eventPoint, pointSource, rawTarget, activeDragRef.current),
      source,
      target: null,
    })
    if (!snapPreviewMode(activeDragRef.current)) return

    setPreviewModel(null)
  }

  function handleBodyAutoScroll({ eventPoint, source, windowId }: BodyAutoScrollInput) {
    const activeProofDrag = activeDragRef.current
    if (!activeProofDrag || activeProofDrag.kind !== 'tab' || !activeProofDrag.detached) {
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

    const baseModel = dragStartModelRef.current ?? model
    if (!dropTargetCanCommit(baseModel.layout, resolvedTarget.target)) return

    lastResolvedTargetRef.current = resolvedTarget
    updateActiveResolvedTarget(resolvedTarget)
    logStateAfterMove({
      layout: baseModel.layout,
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

  function addWindow() {
    flushPendingCommit()
    dragStartModelRef.current = null
    lastResolvedTargetRef.current = null
    activeDragRef.current = null
    updateActiveResolvedTarget(null)
    setPreviewModel(null)
    setModel((current) => addProofWindow(current))
  }

  function addTab(windowId?: WindowId) {
    flushPendingCommit()
    dragStartModelRef.current = null
    lastResolvedTargetRef.current = null
    activeDragRef.current = null
    updateActiveResolvedTarget(null)
    setPreviewModel(null)
    setModel((current) => addProofTab(current, windowId))
  }

  function activateSurface(surfaceId: SurfaceId) {
    setModel((current) => activateProofSurface(current, surfaceId))
  }

  function dispatchLayoutOperation(operation: LayoutOperation) {
    flushPendingCommit()
    if (operation.type === 'resizeSplit') {
      setModel((current) => dispatchProofLayoutOperation(current, operation))
      return
    }

    clearActiveInteraction()
    setActiveDrag(null)
    setModel((current) => dispatchProofLayoutOperation(current, operation))
    resetTabStripDom()
  }

  function removeSurface(surfaceId: SurfaceId) {
    flushPendingCommit()
    dragStartModelRef.current = null
    lastResolvedTargetRef.current = null
    activeDragRef.current = null
    updateActiveResolvedTarget(null)
    setPreviewModel(null)
    setModel((current) => removeProofSurface(current, surfaceId))
  }

  function removeWindow(windowId: WindowId) {
    flushPendingCommit()
    dragStartModelRef.current = null
    lastResolvedTargetRef.current = null
    activeDragRef.current = null
    updateActiveResolvedTarget(null)
    setPreviewModel(null)
    setModel((current) => removeProofWindow(current, windowId))
  }

  function reset() {
    cancelPendingCommit()
    resetStateLog()
    dragStartModelRef.current = null
    lastResolvedTargetRef.current = null
    activeDragRef.current = null
    setActiveDrag(null)
    updateActiveResolvedTarget(null)
    setPreviewModel(null)
    setModel(createInitialProofModel())
  }

  function setScenario(scenario: ProofScenario) {
    cancelPendingCommit()
    resetStateLog()
    dragStartModelRef.current = null
    lastResolvedTargetRef.current = null
    activeDragRef.current = null
    setActiveDrag(null)
    updateActiveResolvedTarget(null)
    setPreviewModel(null)
    setModel(createProofScenarioModel(scenario))
  }

  function resetTabStripDom() {
    setTabStripRenderEpoch((epoch) => epoch + 1)
  }

  function resetStateLog() {
    lastStateEventSignatureRef.current = null
    stateEventSequenceRef.current = 0
    setStateEvents([])
  }

  function clearActiveInteraction() {
    stopTabStripBodyAutoscroll()
    dragStartModelRef.current = null
    lastResolvedTargetRef.current = null
    activeDragRef.current = null
    updateActiveResolvedTarget(null)
    setPreviewModel(null)
  }

  function restoreDragStartModel() {
    stopTabStripBodyAutoscroll()
    dragStartModelRef.current = null
    lastResolvedTargetRef.current = null
    activeDragRef.current = null
    setActiveDrag(null)
    updateActiveResolvedTarget(null)
    setPreviewModel(null)
    resetTabStripDom()
  }

  function updateActiveResolvedTarget(target: ResolvedDndProofTarget | null) {
    activeResolvedTargetRef.current = target
    setActiveResolvedTarget((current) => {
      if (resolvedTargetSignature(current) === resolvedTargetSignature(target)) return current

      return target
    })
  }

  function commitModelAfterDrag(nextModel: ProofModel) {
    cancelPendingCommit()
    pendingCommitModelRef.current = nextModel
    pendingCommitFrameRef.current = requestAnimationFrame(() => {
      const pendingModel = pendingCommitModelRef.current
      pendingCommitFrameRef.current = null
      pendingCommitModelRef.current = null
      if (!pendingModel) return

      setModel(pendingModel)
      resetTabStripDom()
    })
  }

  function cancelPendingCommit() {
    cancelPendingCommitFrame(pendingCommitFrameRef)
    pendingCommitModelRef.current = null
  }

  function flushPendingCommit() {
    const pendingModel = pendingCommitModelRef.current
    cancelPendingCommit()
    if (!pendingModel) return

    setModel(pendingModel)
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
    readonly candidates: readonly DndProofDropCandidate[]
    readonly coordinateRoot: HTMLElement | null
    readonly eventPoint: PointerCoordinates
    readonly onBodyAutoScroll: (input: BodyAutoScrollInput) => void
    readonly previousTarget: ResolvedDndProofTarget | null
    readonly rawTarget: DndProofDropData | null
    readonly source: DndProofDragData
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

    return resolveDndProofTarget({
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
    readonly candidates: readonly DndProofDropCandidate[]
    readonly coordinateRoot: HTMLElement | null
    readonly eventPoint: PointerCoordinates
    readonly rawTarget: DndProofDropData | null
    readonly source: DndProofDragData
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
    readonly candidates: readonly DndProofDropCandidate[]
    readonly coordinateRoot: HTMLElement | null
    readonly eventPoint: PointerCoordinates
    readonly rawTarget: DndProofDropData | null
    readonly source: DndProofDragData
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
    activateSurface,
    activeDrag,
    activeResolvedTarget,
    addTab,
    addWindow,
    dispatchLayoutOperation,
    handleDragEnd,
    handleDragMove,
    handleDragOver,
    handleDragStart,
    model,
    previewLayout: previewModel?.layout ?? null,
    removeSurface,
    removeWindow,
    reset,
    snapLayout:
      activeDrag && dragStartModelRef.current ? dragStartModelRef.current.layout : model.layout,
    setScenario,
    stateEvents,
    tabStripRenderEpoch,
  }
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

function sourceReturnTargetForDragEnd(
  source: DndProofDragData,
  target: ResolvedDndProofTarget | null,
) {
  if (source.kind !== 'window') return null
  if (!target?.candidateId?.includes('source-return')) return null
  if (target.target.kind !== 'window') return null
  if (target.target.windowId !== source.windowId) return null

  return target
}

function noneTargetDebug(
  source: DndProofDragData,
  point: PointerCoordinates,
  pointSource: PointerDetails['source'],
  rawTarget: DndProofDropData | null,
  activeDrag: ActiveProofDrag | null,
) {
  const sourceStripRect = activeDrag?.kind === 'tab' ? activeDrag.stripRect : null
  const sourceStripOrientation = activeDrag?.kind === 'tab' ? activeDrag.stripOrientation : null
  const tabStripProbe = describeTabStripHitTest(source, point, {
    sourceStripOrientation,
    sourceStripRect,
  })

  return `${pointSource}@${formatPoint(point)} raw=${rawTargetDebugLabel(rawTarget)} ${tabStripProbe}`
}

function rawTargetDebugLabel(target: DndProofDropData | null) {
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

function stateSourceLabel(layout: WorkspaceLayout, source: DndProofDragData) {
  if (source.kind === 'tab') return `tab:${stateSurfaceTitle(layout, source.surfaceId)}`

  return `window:${stateWindowTitle(layout, source.windowId)}`
}

function stateTargetLabel(layout: WorkspaceLayout, target: DndProofDropData | null) {
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

function activeProofDragForSource(
  source: DndProofDragData | null,
  event: DragStartEvent,
  model: ProofModel,
): ActiveProofDrag | null {
  if (!source) return null
  if (source.kind === 'window') return { kind: 'window', source }

  const sourceElement = event.operation.source?.element

  return {
    detached: false,
    kind: 'tab',
    pointerType: pointerTypeFromEvent(event.nativeEvent ?? event.operation.activatorEvent),
    source,
    sourceIndex: sourceTabIndex(event.operation.source?.data),
    sourceWindowId: surfaceWindowId(model.layout, source.surfaceId),
    stripOrientation: tabStripOrientation(sourceElement),
    stripRect: tabStripRect(sourceElement),
  }
}

function sourceTabIndex(data: unknown) {
  const target = proofDropData(data)
  if (target?.kind !== 'tab') return null

  return target.index
}

function sourceWindowIdForResolver(activeDrag: ActiveProofDrag | null) {
  if (!activeDrag) return null
  if (activeDrag.kind === 'window') return activeDrag.source.windowId

  return activeDrag.sourceWindowId
}

function intentModeForDrag(
  activeDrag: ActiveProofDrag | null,
  source: DndProofDragData,
  point: PointerCoordinates,
): DndProofIntentMode {
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
  readonly activeDrag: ActiveProofDrag | null
  readonly eventPoint: PointerCoordinates
  readonly mode: DndProofIntentMode
  readonly onBodyAutoScroll: (input: BodyAutoScrollInput) => void
  readonly previousTarget: ResolvedDndProofTarget | null
  readonly rawTarget: DndProofDropData | null
  readonly source: DndProofDragData
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
  readonly activeDrag: ActiveProofDrag | null
  readonly eventPoint: PointerCoordinates
  readonly source: DndProofDragData
}) {
  if (!activeDrag || activeDrag.kind !== 'tab') return null
  if (!activeDrag.sourceWindowId) return null

  return (
    directCrossWindowTabTarget(source, eventPoint, activeDrag.sourceWindowId) ??
    tabTargetFromTarget(tabStripDropTargetForWindowAtPoint(activeDrag.sourceWindowId, eventPoint))
  )
}

function directCrossWindowTabTarget(
  source: DndProofDragData,
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
  source: DndProofDragData,
  rawTarget: DndProofDropData | null,
  eventPoint: PointerCoordinates,
): DndProofTabTarget | null {
  if (!rawTarget) return null
  if (!targetBelongsToTabStrip(rawTarget)) return null
  if (!tabStripDropTargetMatchesPoint(rawTarget, eventPoint)) return null

  return tabTargetFromTarget(resolveTabStripDropTarget(source, rawTarget, eventPoint))
}

function windowBodyTabTargetForDrag(
  source: DndProofDragData,
  eventPoint: PointerCoordinates,
  previousTarget: ResolvedDndProofTarget | null,
  onBodyAutoScroll: (input: BodyAutoScrollInput) => void,
): DndProofTabTarget | null {
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
  source: DndProofDragData,
  previousTarget: ResolvedDndProofTarget | null,
  eventPoint: PointerCoordinates,
  onBodyAutoScroll: (input: BodyAutoScrollInput) => void,
): DndProofTabTarget | null {
  if (source.kind !== 'tab') return null

  const windowId = tabTargetWindowId(previousTarget?.target ?? null)
  if (!windowId) return null
  if (!pointIsInsideProofWindowCenter(windowId, eventPoint, WINDOW_BODY_STICKY_INFLATE_PX)) {
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
  previousTarget: ResolvedDndProofTarget | null,
  windowId: WindowId,
) {
  const target = previousTarget?.target ?? null
  if (tabTargetWindowId(target) !== windowId) return null

  return tabTargetIndex(target)
}

function tabTargetWindowId(target: DndProofDropData | null): WindowId | null {
  if (target?.kind === 'tab') return target.windowId
  if (target?.kind === 'tab-strip') return target.windowId

  return null
}

function tabTargetIndex(target: DndProofDropData | null) {
  if (target?.kind === 'tab') return target.index
  if (target?.kind === 'tab-strip') return target.index

  return null
}

function centerWindowIdAtPoint(point: PointerCoordinates): WindowId | null {
  const windowElement = proofWindowCenterElementAtPoint(point)
  if (!windowElement?.dataset.proofWindowId) return null

  return windowElement.dataset.proofWindowId as WindowId
}

function rawWindowTargetForDrag({
  mode,
  rawTarget,
  source,
}: {
  readonly mode: DndProofIntentMode
  readonly rawTarget: DndProofDropData | null
  readonly source: DndProofDragData
}): ResolvedDndProofTarget | null {
  if (rawTarget?.kind !== 'window') return null
  if (source.kind === 'tab') return rawWindowTargetForTab(mode, rawTarget)
  if (source.windowId === rawTarget.windowId) return null
  if (mode !== 'window') return null

  return { mode, target: rawTarget }
}

function rawWindowTargetForTab(
  mode: DndProofIntentMode,
  rawTarget: Extract<DndProofDropData, { readonly kind: 'window' }>,
): ResolvedDndProofTarget | null {
  if (mode !== 'tab-detached') return null

  return { mode, target: rawTarget }
}

function promoteWindowCenterTabTarget(
  source: DndProofDragData,
  target: ResolvedDndProofTarget | null,
  eventPoint: PointerCoordinates,
): ResolvedDndProofTarget | null {
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
  activeDrag: ActiveProofDrag | null,
  fallback: DndProofDragData | null,
) {
  const source = proofDragData(data)
  if (source) return source
  if (activeDrag) return activeDrag.source

  return fallback
}

function tabTargetFromHit(
  hit: DndProofTabStripHit | null,
  previewKind: DndProofTabTarget['previewKind'] = 'dnd-kit',
): DndProofTabTarget | null {
  if (!hit) return null

  return {
    previewKind,
    priority: tabTargetPriority(hit.strength),
    target: hit.target,
  }
}

function tabTargetFromTarget(
  target: DndProofDropData | null,
  priority = DIRECT_TAB_TARGET_PRIORITY,
  previewKind: DndProofTabTarget['previewKind'] = 'dnd-kit',
): DndProofTabTarget | null {
  if (!target) return null
  if (!targetBelongsToTabStrip(target)) return null

  return {
    previewKind,
    priority,
    target,
  }
}

function resolvedWindowBodyTabTarget(
  target: DndProofDropData | null,
): ResolvedDndProofTarget | null {
  const tabTarget = tabTargetFromTarget(target, WINDOW_BODY_TAB_TARGET_PRIORITY, 'app')
  if (!tabTarget) return null

  return {
    mode: 'tab-detached',
    previewKind: 'app',
    target: tabTarget.target,
  }
}

function tabTargetPriority(strength: DndProofTabStripHit['strength']) {
  if (strength === 'direct') return DIRECT_TAB_TARGET_PRIORITY
  if (strength === 'strip') return STRIP_TAB_TARGET_PRIORITY

  return DOCK_TAB_TARGET_PRIORITY
}

function targetBelongsToTabStrip(
  target: DndProofDropData,
): target is Extract<DndProofDropData, { readonly kind: 'tab' | 'tab-strip' }> {
  return target.kind === 'tab' || target.kind === 'tab-strip'
}

function snapPreviewMode(activeDrag: ActiveProofDrag | null) {
  if (!activeDrag) return false
  if (activeDrag.kind === 'window') return true

  return activeDrag.detached
}

function updateTabDetachState(
  activeDrag: Extract<ActiveProofDrag, { readonly kind: 'tab' }>,
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
  const stripElement = sourceElement?.closest('[data-proof-tab-strip-id]')
  if (!stripElement) return null

  return layoutRectFromDomRect(stripElement.getBoundingClientRect())
}

function tabStripOrientation(sourceElement: Element | undefined) {
  const stripElement = sourceElement?.closest<HTMLElement>('[data-proof-tab-strip-id]')
  if (stripElement?.dataset.proofTabStripOrientation === 'vertical') return 'vertical'
  if (stripElement?.dataset.proofTabStripOrientation === 'horizontal') return 'horizontal'

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

function previewModelForTarget(
  baseModel: ProofModel,
  source: DndProofDragData,
  resolvedTarget: ResolvedDndProofTarget,
) {
  const target = resolvedTarget.target
  if (!dropTargetCanCommit(baseModel.layout, target)) return null
  if (!tabDragCanPreviewTarget(source, target)) return baseModel
  if (targetMergesWindowIntoTabs(source, target))
    return previewModelFromTarget(baseModel, source, target)
  if (resolvedTarget.previewKind === 'dnd-kit') return null
  if (resolvedTarget.previewKind === 'app' && targetBelongsToTabStrip(target)) return null

  return previewModelFromTarget(baseModel, source, target)
}

function previewModelFromTarget(
  baseModel: ProofModel,
  source: DndProofDragData,
  target: DndProofDropData,
) {
  const previewModel = proofDragTargetModel(baseModel, source, target)

  return {
    ...previewModel,
    events: baseModel.events,
  }
}

function tabDragCanPreviewTarget(source: DndProofDragData, target: DndProofDropData) {
  if (source.kind !== 'tab') return true
  if (target.kind !== 'snap-destination') return true

  return target.destination.kind !== 'window-center'
}

function targetMergesWindowIntoTabs(source: DndProofDragData, target: DndProofDropData) {
  if (source.kind !== 'window') return false
  if (target.kind === 'tab' || target.kind === 'tab-strip') return true

  return target.kind === 'snap-destination' && target.destination.kind === 'window-center'
}

function proofDragTargetModel(
  model: ProofModel,
  source: DndProofDragData,
  target: DndProofDropData,
) {
  if (source.kind === 'tab') return tabDragTargetModel(model, source, target)
  if (target.kind === 'snap-destination') {
    return moveProofWindowToDestination(model, source.windowId, target.destination)
  }
  if (target.kind === 'window') {
    return moveProofWindowNextToWindow(model, source.windowId, target.windowId)
  }
  if (target.kind === 'tab' || target.kind === 'tab-strip') {
    return moveProofWindowToDestination(model, source.windowId, {
      kind: 'window-center',
      tabIndex: target.index,
      windowId: target.windowId,
    })
  }

  return model
}

function tabDragTargetModel(
  model: ProofModel,
  source: Extract<DndProofDragData, { readonly kind: 'tab' }>,
  target: DndProofDropData,
) {
  if (target.kind === 'tab') {
    return moveProofSurfaceToTab(model, source.surfaceId, target.windowId, target.index)
  }
  if (target.kind === 'tab-strip') {
    return moveProofSurfaceToTab(model, source.surfaceId, target.windowId, target.index)
  }
  if (target.kind === 'snap-destination') {
    return moveProofSurfaceToDestination(model, source.surfaceId, target.destination)
  }
  if (target.kind === 'window') {
    return moveProofSurfaceToWindowEnd(model, source.surfaceId, target.windowId)
  }

  return model
}

function targetExistsInLayout(layout: WorkspaceLayout, target: DndProofDropData) {
  if (target.kind === 'tab') return Boolean(layout.surfacesById[target.surfaceId])
  if (target.kind === 'tab-strip') return Boolean(layout.windowsById[target.windowId])
  if (target.kind === 'window') return Boolean(layout.windowsById[target.windowId])

  return true
}

function dropTargetCanCommit(layout: WorkspaceLayout, target: DndProofDropData) {
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

function resolvedTargetSignature(target: ResolvedDndProofTarget | null) {
  if (!target) return 'none'

  return [
    target.mode,
    target.previewKind ?? 'snap',
    target.candidateId ?? '',
    dropTargetSignature(target.target),
  ].join('|')
}

function dropTargetSignature(target: DndProofDropData) {
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
