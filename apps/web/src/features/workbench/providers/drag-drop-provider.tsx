import { createContext, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Feedback, PointerActivationConstraints, PointerSensor } from '@dnd-kit/dom'
import {
  DragDropProvider,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/react'

import type {
  LayoutOperation,
  SurfaceId,
} from '@/features/tiling-surface-manager/engine/layout-types'
import type {
  LayoutRect,
  SnapDestinationLayoutRect,
} from '@/features/tiling-surface-manager/engine/layout-geometry'
import {
  isWorkbenchTabDragData,
  isWorkbenchWindowDragData,
  type WorkbenchTabDragData,
  type WorkbenchWindowDragData,
} from '@/features/workbench/utils/drag-drop-data'

const TAB_MOUSE_DETACH_THRESHOLD_PX = 15
const TAB_TOUCH_DETACH_THRESHOLD_PX = 50
const TAB_DETACH_HYSTERESIS_PX = 4
const POINTER_ACTIVATION_DISTANCE_PX = 4

const WORKBENCH_DND_SENSORS = [
  PointerSensor.configure({
    activationConstraints: () => [
      new PointerActivationConstraints.Distance({ value: POINTER_ACTIVATION_DISTANCE_PX }),
    ],
    preventActivation(event, source) {
      const data = sourceDragData(source.data)
      if (!data) return workbenchDragBlockedTarget(event.target)
      if (!data.capabilities.canDrag) return true
      if (isWorkbenchTabDragData(data)) {
        return workbenchTabDragBlockedTarget(event.target, source.element)
      }

      return workbenchDragBlockedTarget(event.target)
    },
  }),
]

export type WorkbenchTabDragFeedback = {
  readonly offsetX: number
  readonly surfaceId: SurfaceId
}

export const WorkbenchTabDragFeedbackContext = createContext<WorkbenchTabDragFeedback | null>(null)

export function WorkbenchDragDropProvider({
  children,
  coordinateRootRef,
  snapDestinationRects,
  onDispatch,
  onPreview,
}: {
  readonly children: ReactNode
  readonly coordinateRootRef: RefObject<HTMLElement | null>
  readonly snapDestinationRects: readonly SnapDestinationLayoutRect[]
  readonly onDispatch: (operation: LayoutOperation) => void
  readonly onPreview?: (operation: LayoutOperation | null) => void
}) {
  const activeDragRef = useRef<ActiveWorkbenchDrag | null>(null)
  const pointerMoveListenerRef = useRef<((event: PointerEvent) => void) | null>(null)
  const previewFrameRef = useRef<number | null>(null)
  const pendingPreviewRef = useRef<LayoutOperation | null>(null)
  const [tabFeedback, setTabFeedback] = useState<WorkbenchTabDragFeedback | null>(null)

  useEffect(
    () => () => {
      stopPointerMoveTracking()
      clearScheduledPreview(previewFrameRef)
    },
    [],
  )

  function schedulePreview(operation: LayoutOperation | null) {
    pendingPreviewRef.current = operation
    if (previewFrameRef.current !== null) return

    previewFrameRef.current = window.requestAnimationFrame(() => {
      previewFrameRef.current = null
      onPreview?.(pendingPreviewRef.current)
    })
  }

  function clearPreview() {
    clearScheduledPreview(previewFrameRef)
    pendingPreviewRef.current = null
    onPreview?.(null)
  }

  function handleDragStart(event: DragStartEvent) {
    const source = event.operation.source
    const data = sourceDragData(source?.data)
    if (!data) {
      activeDragRef.current = null
      stopPointerMoveTracking()
      return
    }

    activeDragRef.current = activeDragForSource(data, source?.element, event)
    startPointerMoveTracking()
  }

  function handleDragMove(event: DragMoveEvent) {
    updateActiveDragPreview(dragMovePoint(event))
  }

  function handleDragOver(event: DragOverEvent) {
    const activeDrag = activeDragRef.current
    if (!activeDrag || activeDrag.kind !== 'tab') return

    if (activeDrag.detached) {
      event.preventDefault()
      return
    }

    preventCrossStripTabSorting(event, activeDrag.data.stripId)
  }

  function handleDragEnd(event: DragEndEvent) {
    const activeDrag = activeDragRef.current
    activeDragRef.current = null
    stopPointerMoveTracking()
    setTabFeedbackValue(null)
    clearPreview()
    if (!activeDrag) return
    if (event.canceled) return

    const operation = committedOperationForDrag(activeDrag, event)
    if (!operation) return

    onDispatch(operation)
  }

  function startPointerMoveTracking() {
    stopPointerMoveTracking()

    const listener = (event: PointerEvent) => {
      updateActiveDragPreview({
        x: event.clientX,
        y: event.clientY,
      })
    }

    pointerMoveListenerRef.current = listener
    document.addEventListener('pointermove', listener, { capture: true })
  }

  function stopPointerMoveTracking() {
    const listener = pointerMoveListenerRef.current
    if (!listener) return

    document.removeEventListener('pointermove', listener, { capture: true })
    pointerMoveListenerRef.current = null
  }

  function updateActiveDragPreview(point: { readonly x: number; readonly y: number }) {
    const activeDrag = activeDragRef.current
    if (!activeDrag) return

    const operation = previewOperationForDrag(activeDrag, point)
    activeDrag.previewOperation = operation
    updateTabDragFeedback(activeDrag, point)
    schedulePreview(operation)
  }

  function updateTabDragFeedback(activeDrag: ActiveWorkbenchDrag, point: { readonly x: number }) {
    if (activeDrag.kind === 'window' || activeDrag.detached) {
      setTabFeedbackValue(null)
      return
    }

    setTabFeedbackValue({
      offsetX: tabDragOffset(activeDrag, point),
      surfaceId: activeDrag.data.surfaceId,
    })
  }

  function setTabFeedbackValue(value: WorkbenchTabDragFeedback | null) {
    setTabFeedback((current) => {
      if (tabFeedbackEqual(current, value)) return current

      return value
    })
  }

  return (
    <WorkbenchTabDragFeedbackContext.Provider value={tabFeedback}>
      <DragDropProvider
        plugins={(defaults) =>
          defaults.map((plugin) =>
            plugin === Feedback
              ? Feedback.configure({ dropAnimation: null, feedback: 'none' })
              : plugin,
          )
        }
        sensors={WORKBENCH_DND_SENSORS}
        onDragEnd={handleDragEnd}
        onDragMove={handleDragMove}
        onDragOver={handleDragOver}
        onDragStart={handleDragStart}
      >
        {children}
      </DragDropProvider>
    </WorkbenchTabDragFeedbackContext.Provider>
  )

  function previewOperationForDrag(
    activeDrag: ActiveWorkbenchDrag,
    point: { readonly x: number; readonly y: number },
  ): LayoutOperation | null {
    if (activeDrag.kind === 'window') return windowPreviewOperation(activeDrag.data, point)

    updateTabDetachState(activeDrag, point)
    if (!activeDrag.detached) return tabReorderOperation(activeDrag, point)

    return surfacePreviewOperation(activeDrag.data.surfaceId, point)
  }

  function committedOperationForDrag(
    activeDrag: ActiveWorkbenchDrag,
    event: DragEndEvent,
  ): LayoutOperation | null {
    if (activeDrag.kind === 'window') return activeDrag.previewOperation
    if (activeDrag.detached) return activeDrag.previewOperation

    return tabReorderOperation(activeDrag, dragEndPoint(event))
  }

  function surfacePreviewOperation(
    surfaceId: SurfaceId,
    point: { readonly x: number; readonly y: number },
  ): LayoutOperation | null {
    const localPoint = localSnapPoint(coordinateRootRef, point)
    const destination = snapDestinationAtPoint(snapDestinationRects, localPoint.x, localPoint.y)
    if (!destination) return null

    return {
      destination: destination.destination,
      surfaceId,
      type: 'moveSurface',
    }
  }

  function windowPreviewOperation(
    data: WorkbenchWindowDragData,
    point: { readonly x: number; readonly y: number },
  ): LayoutOperation | null {
    if (!data.capabilities.canDrag) return null

    const localPoint = localSnapPoint(coordinateRootRef, point)
    const destination = snapDestinationAtPoint(snapDestinationRects, localPoint.x, localPoint.y)
    if (!destination) return null

    return {
      destination: destination.destination,
      type: 'moveWindow',
      windowId: data.windowId,
    }
  }
}

function localSnapPoint(
  coordinateRootRef: RefObject<HTMLElement | null>,
  point: { readonly x: number; readonly y: number },
) {
  const rect = coordinateRootRef.current?.getBoundingClientRect()
  if (!rect) return point

  return {
    x: point.x - rect.left,
    y: point.y - rect.top,
  }
}

type ActiveWorkbenchDrag =
  | {
      detached: boolean
      kind: 'tab'
      pointerType: string
      previewOperation: LayoutOperation | null
      sourceRect: LayoutRect | null
      startPoint: { readonly x: number; readonly y: number }
      stripRect: LayoutRect | null
      stripTabs: readonly TabStripItem[]
      data: WorkbenchTabDragData
    }
  | {
      kind: 'window'
      previewOperation: LayoutOperation | null
      data: WorkbenchWindowDragData
    }

function activeDragForSource(
  data: WorkbenchTabDragData | WorkbenchWindowDragData,
  sourceElement: Element | undefined,
  event: DragStartEvent,
): ActiveWorkbenchDrag {
  if (isWorkbenchWindowDragData(data)) {
    return {
      data,
      kind: 'window',
      previewOperation: null,
    }
  }

  return {
    data,
    detached: false,
    kind: 'tab',
    pointerType: pointerTypeFromEvent(event.nativeEvent ?? event.operation.activatorEvent),
    previewOperation: null,
    sourceRect: tabSourceRect(sourceElement),
    startPoint: dragStartPoint(event),
    stripRect: tabStripRect(sourceElement),
    stripTabs: tabStripItems(sourceElement),
  }
}

type TabStripItem = {
  readonly centerX: number
}

function sourceDragData(value: unknown) {
  if (isWorkbenchTabDragData(value)) return value
  if (isWorkbenchWindowDragData(value)) return value

  return null
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function tabFeedbackEqual(
  left: WorkbenchTabDragFeedback | null,
  right: WorkbenchTabDragFeedback | null,
) {
  if (left === right) return true
  if (!left || !right) return false
  if (left.surfaceId !== right.surfaceId) return false

  return Object.is(left.offsetX, right.offsetX)
}

function tabDragOffset(
  activeDrag: Extract<ActiveWorkbenchDrag, { kind: 'tab' }>,
  point: { readonly x: number },
) {
  const offset = point.x - activeDrag.startPoint.x
  const sourceRect = activeDrag.sourceRect
  const stripRect = activeDrag.stripRect
  if (!sourceRect || !stripRect) return offset

  const min = stripRect.x - sourceRect.x
  const max = stripRect.x + stripRect.width - sourceRect.x - sourceRect.width
  return clamp(offset, min, max)
}

function updateTabDetachState(
  activeDrag: Extract<ActiveWorkbenchDrag, { kind: 'tab' }>,
  point: { readonly y: number },
) {
  if (!activeDrag.data.capabilities.canDetach) {
    activeDrag.detached = false
    return
  }

  const outsideDistance = tabStripOutsideDistance(activeDrag.stripRect, point.y)
  const threshold = tabDetachThreshold(activeDrag.pointerType, activeDrag.detached)
  activeDrag.detached = outsideDistance >= threshold
}

function tabDetachThreshold(pointerType: string, detached: boolean) {
  const threshold =
    pointerType === 'touch' ? TAB_TOUCH_DETACH_THRESHOLD_PX : TAB_MOUSE_DETACH_THRESHOLD_PX
  if (!detached) return threshold

  return Math.max(0, threshold - TAB_DETACH_HYSTERESIS_PX)
}

function tabStripOutsideDistance(rect: LayoutRect | null, clientY: number) {
  if (!rect) return 0
  if (clientY < rect.y) return rect.y - clientY
  if (clientY > rect.y + rect.height) return clientY - rect.y - rect.height

  return 0
}

function tabReorderOperation(
  activeDrag: Extract<ActiveWorkbenchDrag, { kind: 'tab' }>,
  point: { readonly x: number },
): LayoutOperation | null {
  const data = activeDrag.data
  if (!data.capabilities.canReorder) return null

  const toIndex = tabReorderIndex(activeDrag.stripTabs, point.x)
  if (data.sourceIndex === toIndex) return null

  return {
    fromIndex: data.sourceIndex,
    toIndex,
    type: 'reorderSurface',
    windowId: data.sourceWindowId,
  }
}

function dragMovePoint(event: DragMoveEvent) {
  return pointFromEvent(event.nativeEvent) ?? event.to ?? event.operation.position.current
}

function dragStartPoint(event: DragStartEvent) {
  return pointFromEvent(event.nativeEvent) ?? event.operation.position.current
}

function dragEndPoint(event: DragEndEvent) {
  return pointFromEvent(event.nativeEvent) ?? event.operation.position.current
}

function pointFromEvent(event: Event | null | undefined) {
  if (!event) return null
  if (!('clientX' in event) || !('clientY' in event)) return null

  return {
    x: Number(event.clientX),
    y: Number(event.clientY),
  }
}

function tabReorderIndex(tabs: readonly TabStripItem[], clientX: number) {
  if (tabs.length === 0) return 0

  const candidateIndex = tabs.filter((tab) => clientX > tab.centerX).length
  return Math.min(tabs.length - 1, Math.max(0, candidateIndex))
}

function preventCrossStripTabSorting(event: DragOverEvent, sourceStripId: string) {
  const targetData = event.operation.target?.data
  if (!isWorkbenchTabDragData(targetData)) return
  if (targetData.stripId === sourceStripId) return

  event.preventDefault()
}

function tabStripRect(sourceElement: Element | undefined): LayoutRect | null {
  const stripElement = tabStripElement(sourceElement)
  if (!stripElement) return null

  return layoutRectFromDomRect(stripElement.getBoundingClientRect())
}

function tabSourceRect(sourceElement: Element | undefined): LayoutRect | null {
  if (!sourceElement) return null

  return layoutRectFromDomRect(sourceElement.getBoundingClientRect())
}

function tabStripItems(sourceElement: Element | undefined): readonly TabStripItem[] {
  const stripElement = tabStripElement(sourceElement)
  if (!stripElement) return []

  return Array.from(stripElement.querySelectorAll<HTMLElement>('[data-workbench-tab-id]')).flatMap(
    (tab) => {
      const surfaceId = tab.dataset.workbenchTabId
      if (!surfaceId) return []

      const rect = tab.getBoundingClientRect()
      return [
        {
          centerX: rect.left + rect.width / 2,
        },
      ]
    },
  )
}

function tabStripElement(sourceElement: Element | undefined) {
  return sourceElement?.closest('[data-workbench-tab-strip-id]') ?? null
}

function layoutRectFromDomRect(rect: DOMRect): LayoutRect {
  return {
    height: rect.height,
    width: rect.width,
    x: rect.left,
    y: rect.top,
  }
}

function snapDestinationAtPoint(
  snapDestinationRects: readonly SnapDestinationLayoutRect[],
  clientX: number,
  clientY: number,
) {
  return (
    snapDestinationRects.find((destination) => {
      const rect = destination.rect
      if (clientX < rect.x) return false
      if (clientX > rect.x + rect.width) return false
      if (clientY < rect.y) return false

      return clientY <= rect.y + rect.height
    }) ?? null
  )
}

function pointerTypeFromEvent(event: Event | null | undefined) {
  if (typeof PointerEvent === 'undefined') return 'mouse'
  if (event instanceof PointerEvent) return event.pointerType

  return 'mouse'
}

function workbenchDragBlockedTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false

  return Boolean(target.closest('[data-workbench-drag-blocker]'))
}

function workbenchTabDragBlockedTarget(target: EventTarget | null, sourceElement?: Element) {
  if (!(target instanceof Element)) return false

  const blocker = target.closest('[data-workbench-drag-blocker]')
  if (!blocker) return false
  if (!sourceElement) return true

  return sourceElement.contains(blocker)
}

function clearScheduledPreview(frameRef: { current: number | null }) {
  if (frameRef.current === null) return

  window.cancelAnimationFrame(frameRef.current)
  frameRef.current = null
}
