import {
  useEffect,
  useReducer,
  useRef,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'

import {
  editorTabDropIndex,
  type EditorTabDropTargetBounds,
} from '@/components/workspace/editor-tabs/utils/editor-tab-dnd'

export const EDITOR_TAB_DRAG_KIND = 'platform/editor-tab'
export const EDITOR_TAB_DRAG_MIME = 'application/x-platform-editor-tab'
export const EDITOR_TAB_POINTER_DRAG_EVENT = 'platform-editor-tab-pointer-drag'
export const EDITOR_TAB_POINTER_DROP_EVENT = 'platform-editor-tab-pointer-drop'
export const EDITOR_TAB_POINTER_CANCEL_EVENT = 'platform-editor-tab-pointer-cancel'
// Chromium TabDragController uses 15 DIP mouse and 50 DIP touch vertical detach magnetism.
export const EDITOR_TAB_MOUSE_DETACH_THRESHOLD_PX = 15
export const EDITOR_TAB_TOUCH_DETACH_THRESHOLD_PX = 50
export const EDITOR_TAB_DETACH_HYSTERESIS_PX = 4
export const EDITOR_TAB_DRAG_START_THRESHOLD_PX = 3
const EDITOR_TAB_DRAG_AUTO_SCROLL_EDGE_PX = 36
const EDITOR_TAB_DRAG_AUTO_SCROLL_STEP_PX = 14

export type EditorTabDragItem = {
  id: string
  path: string
}

export type EditorTabDragState = {
  detached: boolean
  detachProgress: number
  offsetX: number
  paneId: string
  path: string
  sourceIndex: number
  tabId: string
  targetIndex: number | null
}

export type EditorTabInsertionEdge = 'before' | 'after' | null

export type EditorTabDragController = {
  draggedTabId: string | null
  state: EditorTabDragState | null
  onDragEnd: () => void
  onDragLeave: (event: ReactDragEvent<HTMLElement>) => void
  onDragOver: (event: ReactDragEvent<HTMLElement>) => void
  onDragStart: (event: ReactDragEvent<HTMLElement>, tab: EditorTabDragItem) => void
  onDrop: (event: ReactDragEvent<HTMLElement>) => void
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerDown: (event: ReactPointerEvent<HTMLElement>, tab: EditorTabDragItem) => void
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void
}

export type EditorTabDragAction =
  | {
      paneId: string
      path: string
      sourceIndex: number
      tabId: string
      type: 'start'
    }
  | { targetIndex: number | null; type: 'target' }
  | {
      detached: boolean
      detachProgress: number
      offsetX: number
      targetIndex: number | null
      type: 'move'
    }
  | { type: 'clear' }

export type EditorTabDragPayload = {
  kind: typeof EDITOR_TAB_DRAG_KIND
  paneId: string
  path: string
  tabId: string
}

export type EditorTabPointerDragDetail = EditorTabDragPayload & {
  clientX: number
  clientY: number
  detached: boolean
  detachProgress: number
}

type EditorTabPointerDrag = {
  detached: boolean
  path: string
  paneId: string
  pointerId: number
  pointerType: string
  sourceIndex: number
  startX: number
  startY: number
  started: boolean
  tabId: string
}

let activeEditorTabDragPayload: EditorTabDragPayload | null = null

export function useEditorTabDrag<TTab extends EditorTabDragItem>({
  paneId,
  tabs,
  tabListRef,
  onMoveToPane,
  onReorder,
}: {
  paneId: string
  tabs: readonly TTab[]
  tabListRef: RefObject<HTMLDivElement | null>
  onMoveToPane: (tabId: string, targetIndex: number) => boolean
  onReorder: (tabId: string, targetIndex: number) => boolean
}): EditorTabDragController {
  const [state, dispatch] = useReducer(editorTabDragReducer, null)
  const stateRef = useRef<EditorTabDragState | null>(null)
  const autoScrollFrameRef = useRef<number | null>(null)
  const documentDragCleanupRef = useRef<(() => void) | null>(null)
  const dragClientXRef = useRef<number | null>(null)
  const dragImageCleanupRef = useRef<(() => void) | null>(null)
  const ownsDragRef = useRef(false)
  const onMoveToPaneRef = useRef(onMoveToPane)
  const onReorderRef = useRef(onReorder)
  const pointerDragRef = useRef<EditorTabPointerDrag | null>(null)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    onMoveToPaneRef.current = onMoveToPane
  }, [onMoveToPane])

  useEffect(() => {
    onReorderRef.current = onReorder
  }, [onReorder])

  useEffect(
    () => () => {
      documentDragCleanupRef.current?.()
      documentDragCleanupRef.current = null
      dragImageCleanupRef.current?.()
      dragImageCleanupRef.current = null
      dragClientXRef.current = null
      cancelEditorTabPointerDrag()
      cancelEditorTabDragAutoScroll(autoScrollFrameRef)
    },
    [],
  )

  function dispatchDrag(action: EditorTabDragAction) {
    const nextState = editorTabDragReducer(stateRef.current, action)
    stateRef.current = nextState
    dispatch(action)
    return nextState
  }

  function syncDragTarget(clientX: number) {
    const current = stateRef.current
    if (!current) return

    const targetIndex = editorTabDropIndex(
      editorTabDropTargetBounds(tabListRef.current),
      clientX,
      current.tabId,
    )
    if (current.targetIndex === targetIndex) return

    dispatchDrag({ targetIndex, type: 'target' })
  }

  function clearDrag() {
    const currentTabId = stateRef.current?.tabId ?? null
    cancelEditorTabPointerDrag()
    dispatchDrag({ type: 'clear' })
    documentDragCleanupRef.current?.()
    documentDragCleanupRef.current = null
    dragImageCleanupRef.current?.()
    dragImageCleanupRef.current = null
    dragClientXRef.current = null
    cancelEditorTabDragAutoScroll(autoScrollFrameRef)
    clearActiveEditorTabDragPayload(currentTabId, ownsDragRef.current)
    ownsDragRef.current = false
  }

  function commitDrag(current: EditorTabDragState) {
    if (current.targetIndex === null) return
    if (current.paneId !== paneId) {
      onMoveToPaneRef.current(current.tabId, current.targetIndex)
      return
    }
    if (current.targetIndex === current.sourceIndex) return

    onReorderRef.current(current.tabId, current.targetIndex)
  }

  function runAutoScroll() {
    autoScrollFrameRef.current = null
    const scrollElement = tabListRef.current
    const clientX = dragClientXRef.current
    if (!stateRef.current) return
    if (stateRef.current.detached) return
    if (!scrollElement) return
    if (clientX === null) return

    const delta = editorTabDragAutoScrollDelta(scrollElement.getBoundingClientRect(), clientX)
    if (delta !== 0) scrollElement.scrollLeft += delta

    syncDragTarget(clientX)
    if (delta === 0) return

    autoScrollFrameRef.current = window.requestAnimationFrame(runAutoScroll)
  }

  function scheduleAutoScroll(clientX: number) {
    dragClientXRef.current = clientX
    if (autoScrollFrameRef.current !== null) return

    autoScrollFrameRef.current = window.requestAnimationFrame(runAutoScroll)
  }

  function startDocumentDragListeners() {
    if (documentDragCleanupRef.current) return

    document.addEventListener('dragover', handleDocumentDragOver, {
      capture: true,
      passive: false,
    })
    document.addEventListener('drop', handleDocumentDrop, {
      capture: true,
      passive: false,
    })
    document.addEventListener('dragend', handleDocumentDragEnd, true)

    documentDragCleanupRef.current = () => {
      document.removeEventListener('dragover', handleDocumentDragOver, true)
      document.removeEventListener('drop', handleDocumentDrop, true)
      document.removeEventListener('dragend', handleDocumentDragEnd, true)
    }
  }

  function ensureDragStateFromPayload(payload: EditorTabDragPayload) {
    const current = stateRef.current
    if (current?.tabId === payload.tabId && current.paneId === payload.paneId) {
      return current
    }

    return dispatchDrag({
      paneId: payload.paneId,
      path: payload.path,
      sourceIndex:
        payload.paneId === paneId
          ? tabs.findIndex((candidate) => candidate.id === payload.tabId)
          : -1,
      tabId: payload.tabId,
      type: 'start',
    })
  }

  function handleTabListDragOver(event: ReactDragEvent<HTMLElement>) {
    if (!hasEditorTabDragPayload(event.dataTransfer)) return

    const payload = activeEditorTabDragPayload
    if (!payload) return

    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'

    ensureDragStateFromPayload(payload)
    syncDragTarget(event.clientX)
    scheduleAutoScroll(event.clientX)
    startDocumentDragListeners()
  }

  function handleTabListDrop(event: ReactDragEvent<HTMLElement>) {
    if (!hasEditorTabDragPayload(event.dataTransfer)) return

    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'

    if (!stateRef.current) {
      const payload = readEditorTabDragPayload(event.dataTransfer)
      if (payload.status === 'valid') ensureDragStateFromPayload(payload.payload)
    }

    const current = stateRef.current
    if (!current) return
    if (!dropPayloadMatchesActiveTab(event.dataTransfer, current.tabId)) {
      clearDrag()
      return
    }

    syncDragTarget(event.clientX)
    const next = stateRef.current
    if (next) commitDrag(next)

    clearDrag()
  }

  function handleTabListDragLeave(event: ReactDragEvent<HTMLElement>) {
    if (elementContainsTarget(event.currentTarget, event.relatedTarget)) return

    if (ownsDragRef.current) {
      dispatchDrag({ targetIndex: null, type: 'target' })
      cancelEditorTabDragAutoScroll(autoScrollFrameRef)
      dragClientXRef.current = null
      return
    }

    clearDrag()
  }

  function handleDocumentDragOver(event: globalThis.DragEvent) {
    if (!stateRef.current) return

    if (!editorTabDragPointInsideTabList(tabListRef.current, event)) {
      dispatchDrag({ targetIndex: null, type: 'target' })
      cancelEditorTabDragAutoScroll(autoScrollFrameRef)
      dragClientXRef.current = null
      return
    }

    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'

    syncDragTarget(event.clientX)
    scheduleAutoScroll(event.clientX)
  }

  function handleDocumentDrop(event: globalThis.DragEvent) {
    const current = stateRef.current
    if (!current) return

    if (!editorTabDragPointInsideTabList(tabListRef.current, event)) {
      clearDrag()
      return
    }

    event.preventDefault()
    event.stopPropagation()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'

    if (!dropPayloadMatchesActiveTab(event.dataTransfer, current.tabId)) {
      clearDrag()
      return
    }

    syncDragTarget(event.clientX)
    const next = stateRef.current
    if (next) commitDrag(next)

    clearDrag()
  }

  function handleDocumentDragEnd() {
    clearDrag()
  }

  function handleDragStart(event: ReactDragEvent<HTMLElement>, tab: EditorTabDragItem) {
    if (isEditorTabDragBlockedTarget(event.target)) {
      event.preventDefault()
      return
    }

    const sourceIndex = tabs.findIndex((candidate) => candidate.id === tab.id)
    if (sourceIndex === -1) {
      event.preventDefault()
      return
    }

    clearDrag()
    dispatchDrag({
      paneId,
      path: tab.path,
      sourceIndex,
      tabId: tab.id,
      type: 'start',
    })

    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.dropEffect = 'move'
    writeEditorTabDragPayload(event.dataTransfer, {
      paneId,
      path: tab.path,
      tabId: tab.id,
    })
    activeEditorTabDragPayload = {
      kind: EDITOR_TAB_DRAG_KIND,
      paneId,
      path: tab.path,
      tabId: tab.id,
    }
    ownsDragRef.current = true
    dragImageCleanupRef.current = mountTransparentEditorTabDragImage(event)
    startDocumentDragListeners()
    syncDragTarget(event.clientX)
    scheduleAutoScroll(event.clientX)
  }

  function handleDragEnd() {
    const current = stateRef.current
    if (current) clearDrag()
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLElement>, tab: EditorTabDragItem) {
    if (event.button !== 0) return
    if (isEditorTabDragBlockedTarget(event.target)) return

    const sourceIndex = tabs.findIndex((candidate) => candidate.id === tab.id)
    if (sourceIndex === -1) return

    clearDrag()
    pointerDragRef.current = {
      detached: false,
      paneId,
      path: tab.path,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      sourceIndex,
      startX: event.clientX,
      startY: event.clientY,
      started: false,
      tabId: tab.id,
    }
    setPointerCapture(event.currentTarget, event.pointerId)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLElement>) {
    const pointer = pointerDragRef.current
    if (!pointerDragMatchesEvent(pointer, event)) return

    const delta = pointerDragDelta(pointer, event)
    if (!pointer.started && !pointerDragMovedEnough(delta)) return

    event.preventDefault()
    startPointerDrag(pointer)
    updatePointerDrag(pointer, event, delta)
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLElement>) {
    const pointer = pointerDragRef.current
    if (!pointerDragMatchesEvent(pointer, event)) return

    releasePointerCapture(event.currentTarget, pointer.pointerId)

    if (!pointer.started) {
      pointerDragRef.current = null
      return
    }

    if (pointer.detached) {
      dispatchEditorTabPointerDragEvent(EDITOR_TAB_POINTER_DROP_EVENT, pointer, event, {
        detached: true,
        progress: 1,
      })
      clearDrag()
      return
    }

    syncDragTarget(event.clientX)
    const next = stateRef.current
    if (next) commitDrag(next)

    clearDrag()
  }

  function handlePointerCancel(event: ReactPointerEvent<HTMLElement>) {
    const pointer = pointerDragRef.current
    if (!pointerDragMatchesEvent(pointer, event)) return

    releasePointerCapture(event.currentTarget, pointer.pointerId)
    clearDrag()
  }

  function startPointerDrag(pointer: EditorTabPointerDrag) {
    if (pointer.started) return

    pointer.started = true
    ownsDragRef.current = true
    dispatchDrag({
      paneId: pointer.paneId,
      path: pointer.path,
      sourceIndex: pointer.sourceIndex,
      tabId: pointer.tabId,
      type: 'start',
    })
  }

  function updatePointerDrag(
    pointer: EditorTabPointerDrag,
    event: ReactPointerEvent<HTMLElement>,
    delta: EditorTabPointerDelta,
  ) {
    const detach = editorTabDetachState({
      currentY: event.clientY,
      pointerType: pointer.pointerType,
      startY: pointer.startY,
      wasDetached: pointer.detached,
    })
    pointer.detached = detach.detached

    if (detach.detached) {
      updateDetachedPointerDrag(pointer, event, delta, detach.progress)
      return
    }

    updateAttachedPointerDrag(pointer, event, delta, detach.progress)
  }

  function updateAttachedPointerDrag(
    pointer: EditorTabPointerDrag,
    event: ReactPointerEvent<HTMLElement>,
    delta: EditorTabPointerDelta,
    detachProgress: number,
  ) {
    const targetIndex = editorTabDropIndex(
      editorTabDropTargetBounds(tabListRef.current),
      event.clientX,
      pointer.tabId,
    )
    dispatchDrag({
      detached: false,
      detachProgress,
      offsetX: delta.x,
      targetIndex,
      type: 'move',
    })
    dispatchEditorTabPointerDragEvent(EDITOR_TAB_POINTER_DRAG_EVENT, pointer, event, {
      detached: false,
      progress: detachProgress,
    })
    scheduleAutoScroll(event.clientX)
  }

  function updateDetachedPointerDrag(
    pointer: EditorTabPointerDrag,
    event: ReactPointerEvent<HTMLElement>,
    delta: EditorTabPointerDelta,
    detachProgress: number,
  ) {
    cancelEditorTabDragAutoScroll(autoScrollFrameRef)
    dragClientXRef.current = null
    dispatchDrag({
      detached: true,
      detachProgress,
      offsetX: delta.x,
      targetIndex: null,
      type: 'move',
    })
    dispatchEditorTabPointerDragEvent(EDITOR_TAB_POINTER_DRAG_EVENT, pointer, event, {
      detached: true,
      progress: detachProgress,
    })
  }

  function cancelEditorTabPointerDrag() {
    const pointer = pointerDragRef.current
    pointerDragRef.current = null
    if (!pointer?.started) return

    dispatchEditorTabPointerCancelEvent()
  }

  return {
    draggedTabId: state?.tabId ?? null,
    state,
    onDragEnd: handleDragEnd,
    onDragLeave: handleTabListDragLeave,
    onDragOver: handleTabListDragOver,
    onDragStart: handleDragStart,
    onDrop: handleTabListDrop,
    onPointerCancel: handlePointerCancel,
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
  }
}

export function editorTabDragReducer(
  state: EditorTabDragState | null,
  action: EditorTabDragAction,
): EditorTabDragState | null {
  if (action.type === 'clear') return null

  if (action.type === 'start') {
    return {
      detached: false,
      detachProgress: 0,
      offsetX: 0,
      path: action.path,
      paneId: action.paneId,
      sourceIndex: action.sourceIndex,
      tabId: action.tabId,
      targetIndex: action.sourceIndex,
    }
  }

  if (!state) return state

  if (action.type === 'move') {
    return {
      ...state,
      detached: action.detached,
      detachProgress: action.detachProgress,
      offsetX: action.offsetX,
      targetIndex: action.targetIndex,
    }
  }

  if (state.targetIndex === action.targetIndex) return state

  return { ...state, targetIndex: action.targetIndex }
}

type EditorTabPointerDelta = {
  readonly x: number
  readonly y: number
}

export function editorTabDetachState({
  currentY,
  pointerType,
  startY,
  wasDetached,
}: {
  readonly currentY: number
  readonly pointerType: string
  readonly startY: number
  readonly wasDetached: boolean
}) {
  const threshold = editorTabDetachThreshold(pointerType)
  const distance = Math.abs(currentY - startY)
  const detachThreshold = wasDetached
    ? Math.max(0, threshold - EDITOR_TAB_DETACH_HYSTERESIS_PX)
    : threshold

  return {
    detached: distance >= detachThreshold,
    progress: Math.min(1, distance / threshold),
  }
}

export function editorTabDetachThreshold(pointerType: string) {
  if (pointerType === 'touch') return EDITOR_TAB_TOUCH_DETACH_THRESHOLD_PX

  return EDITOR_TAB_MOUSE_DETACH_THRESHOLD_PX
}

export function editorTabInsertionEdge<TTab extends EditorTabDragItem>(
  tabs: readonly TTab[],
  tab: TTab,
  dragState: EditorTabDragState | null,
): EditorTabInsertionEdge {
  if (!dragState) return null
  if (dragState.targetIndex === null) return null
  if (isDraggingInOriginalSlot(tabs, dragState)) return null

  const targets = tabs.filter((candidate) => candidate.id !== dragState.tabId)
  if (targets.length === 0) return null

  const targetIndex = boundedTabDropIndex(dragState.targetIndex, targets.length)
  if (targetIndex === targets.length) {
    return targets.at(-1)?.id === tab.id ? 'after' : null
  }

  return targets[targetIndex]?.id === tab.id ? 'before' : null
}

function isDraggingInOriginalSlot<TTab extends EditorTabDragItem>(
  tabs: readonly TTab[],
  dragState: EditorTabDragState,
) {
  if (dragState.sourceIndex < 0) return false
  if (dragState.targetIndex !== dragState.sourceIndex) return false

  return tabs.some((candidate) => candidate.id === dragState.tabId)
}

function boundedTabDropIndex(index: number, targetCount: number) {
  if (!Number.isFinite(index)) return targetCount

  return Math.min(targetCount, Math.max(0, Math.trunc(index)))
}

function editorTabDropTargetBounds(
  tabList: HTMLElement | null,
): readonly EditorTabDropTargetBounds[] {
  if (!tabList) return []

  return Array.from(tabList.querySelectorAll<HTMLElement>('[data-editor-tab-id]'))
    .map(editorTabDropTargetBound)
    .filter(isEditorTabDropTargetBound)
}

function editorTabDropTargetBound(element: HTMLElement): EditorTabDropTargetBounds | null {
  const path = element.dataset.editorTabPath
  const id = element.dataset.editorTabId
  if (!path) return null
  if (!id) return null

  const rect = element.getBoundingClientRect()
  return {
    id,
    left: rect.left,
    path,
    right: rect.right,
  }
}

function isEditorTabDropTargetBound(
  bound: EditorTabDropTargetBounds | null,
): bound is EditorTabDropTargetBounds {
  return bound !== null
}

function editorTabDragPointInsideTabList(
  tabList: HTMLElement | null,
  event: Pick<globalThis.DragEvent, 'clientX' | 'clientY'>,
) {
  if (!tabList) return false

  const rect = tabList.getBoundingClientRect()
  return (
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom
  )
}

function writeEditorTabDragPayload(
  dataTransfer: DataTransfer,
  {
    paneId,
    path,
    tabId,
  }: {
    paneId: string
    path: string
    tabId: string
  },
) {
  const payload: EditorTabDragPayload = {
    kind: EDITOR_TAB_DRAG_KIND,
    paneId,
    path,
    tabId,
  }

  setEditorTabDragData(dataTransfer, EDITOR_TAB_DRAG_MIME, JSON.stringify(payload))
  setEditorTabDragData(dataTransfer, 'text/plain', path)
}

function setEditorTabDragData(dataTransfer: DataTransfer, format: string, value: string) {
  try {
    dataTransfer.setData(format, value)
  } catch {
    // Some browser/test implementations reject custom MIME writes; text/plain remains a fallback.
  }
}

function dropPayloadMatchesActiveTab(dataTransfer: DataTransfer | null, tabId: string) {
  const result = readEditorTabDragPayload(dataTransfer)
  if (result.status === 'missing') return true
  if (result.status === 'invalid') return false

  return result.payload.tabId === tabId
}

export function readEditorTabDragPayload(
  dataTransfer: DataTransfer | null,
):
  | { status: 'missing' }
  | { status: 'invalid' }
  | { payload: EditorTabDragPayload; status: 'valid' } {
  if (!dataTransfer) return { status: 'missing' }

  const hasPayloadType = dataTransferHasType(dataTransfer, EDITOR_TAB_DRAG_MIME)
  const raw = dataTransfer.getData(EDITOR_TAB_DRAG_MIME)
  if (!raw) return hasPayloadType ? { status: 'invalid' } : { status: 'missing' }

  try {
    const value: unknown = JSON.parse(raw)
    if (!isEditorTabDragPayload(value)) return { status: 'invalid' }

    return { payload: value, status: 'valid' }
  } catch {
    return { status: 'invalid' }
  }
}

export function hasEditorTabDragPayload(dataTransfer: Pick<DataTransfer, 'types'> | null) {
  return dataTransferHasType(dataTransfer, EDITOR_TAB_DRAG_MIME)
}

function dataTransferHasType(dataTransfer: Pick<DataTransfer, 'types'> | null, type: string) {
  if (!dataTransfer) return false

  return Array.from(dataTransfer.types).includes(type)
}

function clearActiveEditorTabDragPayload(tabId: string | null, ownsDrag: boolean) {
  if (!ownsDrag) return
  if (tabId && activeEditorTabDragPayload?.tabId !== tabId) return

  activeEditorTabDragPayload = null
}

function dispatchEditorTabPointerDragEvent(
  type: typeof EDITOR_TAB_POINTER_DRAG_EVENT | typeof EDITOR_TAB_POINTER_DROP_EVENT,
  pointer: EditorTabPointerDrag,
  event: Pick<ReactPointerEvent<HTMLElement>, 'clientX' | 'clientY'>,
  state: { readonly detached: boolean; readonly progress: number },
) {
  document.dispatchEvent(
    new CustomEvent<EditorTabPointerDragDetail>(type, {
      detail: {
        detached: state.detached,
        detachProgress: state.progress,
        clientX: event.clientX,
        clientY: event.clientY,
        kind: EDITOR_TAB_DRAG_KIND,
        paneId: pointer.paneId,
        path: pointer.path,
        tabId: pointer.tabId,
      },
    }),
  )
}

function dispatchEditorTabPointerCancelEvent() {
  document.dispatchEvent(new CustomEvent(EDITOR_TAB_POINTER_CANCEL_EVENT))
}

export function isEditorTabPointerDragDetail(value: unknown): value is EditorTabPointerDragDetail {
  if (!isEditorTabDragPayload(value)) return false

  const detail = value as Partial<EditorTabPointerDragDetail>
  if (typeof detail.clientX !== 'number') return false
  if (typeof detail.clientY !== 'number') return false
  if (typeof detail.detached !== 'boolean') return false

  return typeof detail.detachProgress === 'number'
}

function isEditorTabDragPayload(value: unknown): value is EditorTabDragPayload {
  if (!value || typeof value !== 'object') return false

  const payload = value as Partial<Record<keyof EditorTabDragPayload, unknown>>
  return (
    payload.kind === EDITOR_TAB_DRAG_KIND &&
    typeof payload.paneId === 'string' &&
    payload.paneId.length > 0 &&
    typeof payload.path === 'string' &&
    payload.path.length > 0 &&
    typeof payload.tabId === 'string' &&
    payload.tabId.length > 0
  )
}

function mountTransparentEditorTabDragImage(event: ReactDragEvent<HTMLElement>) {
  const image = document.createElement('div')
  image.style.position = 'fixed'
  image.style.top = '-1000px'
  image.style.left = '-1000px'
  image.style.width = '1px'
  image.style.height = '1px'
  image.style.pointerEvents = 'none'
  image.style.opacity = '0'

  document.body.appendChild(image)
  event.dataTransfer.setDragImage(image, 0, 0)

  return () => image.remove()
}

function editorTabDragAutoScrollDelta(rect: DOMRect, clientX: number) {
  if (clientX < rect.left + EDITOR_TAB_DRAG_AUTO_SCROLL_EDGE_PX) {
    return -EDITOR_TAB_DRAG_AUTO_SCROLL_STEP_PX
  }
  if (clientX > rect.right - EDITOR_TAB_DRAG_AUTO_SCROLL_EDGE_PX) {
    return EDITOR_TAB_DRAG_AUTO_SCROLL_STEP_PX
  }

  return 0
}

function cancelEditorTabDragAutoScroll(frameRef: { current: number | null }) {
  if (frameRef.current === null) return

  window.cancelAnimationFrame(frameRef.current)
  frameRef.current = null
}

function pointerDragMatchesEvent(
  pointer: EditorTabPointerDrag | null,
  event: ReactPointerEvent<HTMLElement>,
): pointer is EditorTabPointerDrag {
  if (!pointer) return false

  return pointer.pointerId === event.pointerId
}

function pointerDragDelta(
  pointer: EditorTabPointerDrag,
  event: Pick<ReactPointerEvent<HTMLElement>, 'clientX' | 'clientY'>,
): EditorTabPointerDelta {
  return {
    x: event.clientX - pointer.startX,
    y: event.clientY - pointer.startY,
  }
}

function pointerDragMovedEnough(delta: EditorTabPointerDelta) {
  return Math.hypot(delta.x, delta.y) >= EDITOR_TAB_DRAG_START_THRESHOLD_PX
}

function setPointerCapture(element: HTMLElement, pointerId: number) {
  if (!element.isConnected) return
  if (!element.setPointerCapture) return

  element.setPointerCapture(pointerId)
}

function releasePointerCapture(element: HTMLElement, pointerId: number) {
  if (!element.isConnected) return
  if (!element.releasePointerCapture) return
  if (element.hasPointerCapture && !element.hasPointerCapture(pointerId)) return

  element.releasePointerCapture(pointerId)
}

function isEditorTabDragBlockedTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false

  return Boolean(target.closest('[data-editor-tab-drag-blocker]'))
}

function elementContainsTarget(element: HTMLElement, target: EventTarget | null) {
  if (!(target instanceof Node)) return false

  return element.contains(target)
}
