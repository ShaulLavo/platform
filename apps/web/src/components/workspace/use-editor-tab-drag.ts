import {
  useEffect,
  useReducer,
  useRef,
  type DragEvent as ReactDragEvent,
  type RefObject,
} from "react"

import {
  editorTabDropIndex,
  type EditorTabDropTargetBounds,
} from "@/components/workspace/editor-tab-dnd"

const EDITOR_TAB_DRAG_KIND = "platform/editor-tab"
const EDITOR_TAB_DRAG_MIME = "application/x-platform-editor-tab"
const EDITOR_TAB_PANE_ID = "main"
const EDITOR_TAB_DRAG_AUTO_SCROLL_EDGE_PX = 36
const EDITOR_TAB_DRAG_AUTO_SCROLL_STEP_PX = 14

export type EditorTabDragItem = {
  path: string
}

export type EditorTabDragState = {
  path: string
  sourceIndex: number
  targetIndex: number | null
}

export type EditorTabInsertionEdge = "before" | "after" | null

export type EditorTabDragController = {
  draggedPath: string | null
  state: EditorTabDragState | null
  onDragEnd: () => void
  onDragStart: (event: ReactDragEvent<HTMLElement>, path: string) => void
}

export type EditorTabDragAction =
  | { path: string; sourceIndex: number; type: "start" }
  | { targetIndex: number | null; type: "target" }
  | { type: "clear" }

type EditorTabDragPayload = {
  kind: typeof EDITOR_TAB_DRAG_KIND
  paneId: typeof EDITOR_TAB_PANE_ID
  path: string
}

export function useEditorTabDrag<TTab extends EditorTabDragItem>({
  tabs,
  tabListRef,
  onReorder,
}: {
  tabs: readonly TTab[]
  tabListRef: RefObject<HTMLDivElement | null>
  onReorder: (path: string, targetIndex: number) => boolean
}): EditorTabDragController {
  const [state, dispatch] = useReducer(editorTabDragReducer, null)
  const stateRef = useRef<EditorTabDragState | null>(null)
  const autoScrollFrameRef = useRef<number | null>(null)
  const documentDragCleanupRef = useRef<(() => void) | null>(null)
  const dragClientXRef = useRef<number | null>(null)
  const dragImageCleanupRef = useRef<(() => void) | null>(null)
  const onReorderRef = useRef(onReorder)

  useEffect(() => {
    stateRef.current = state
  }, [state])

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
      cancelEditorTabDragAutoScroll(autoScrollFrameRef)
    },
    []
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
      current.path
    )
    if (current.targetIndex === targetIndex) return

    dispatchDrag({ targetIndex, type: "target" })
  }

  function clearDrag() {
    dispatchDrag({ type: "clear" })
    documentDragCleanupRef.current?.()
    documentDragCleanupRef.current = null
    dragImageCleanupRef.current?.()
    dragImageCleanupRef.current = null
    dragClientXRef.current = null
    cancelEditorTabDragAutoScroll(autoScrollFrameRef)
  }

  function commitDrag(current: EditorTabDragState) {
    if (current.targetIndex === null) return

    onReorderRef.current(current.path, current.targetIndex)
  }

  function runAutoScroll() {
    autoScrollFrameRef.current = null
    const scrollElement = tabListRef.current
    const clientX = dragClientXRef.current
    if (!stateRef.current) return
    if (!scrollElement) return
    if (clientX === null) return

    const delta = editorTabDragAutoScrollDelta(
      scrollElement.getBoundingClientRect(),
      clientX
    )
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
    documentDragCleanupRef.current?.()

    document.addEventListener("dragover", handleDocumentDragOver, {
      capture: true,
      passive: false,
    })
    document.addEventListener("drop", handleDocumentDrop, {
      capture: true,
      passive: false,
    })
    document.addEventListener("dragend", handleDocumentDragEnd, true)

    documentDragCleanupRef.current = () => {
      document.removeEventListener("dragover", handleDocumentDragOver, true)
      document.removeEventListener("drop", handleDocumentDrop, true)
      document.removeEventListener("dragend", handleDocumentDragEnd, true)
    }
  }

  function handleDocumentDragOver(event: globalThis.DragEvent) {
    if (!stateRef.current) return

    if (!editorTabDragPointInsideTabList(tabListRef.current, event)) {
      dispatchDrag({ targetIndex: null, type: "target" })
      cancelEditorTabDragAutoScroll(autoScrollFrameRef)
      dragClientXRef.current = null
      return
    }

    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move"

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
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move"

    if (!dropPayloadMatchesActiveTab(event.dataTransfer, current.path)) {
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

  function handleDragStart(event: ReactDragEvent<HTMLElement>, path: string) {
    if (isEditorTabDragBlockedTarget(event.target)) {
      event.preventDefault()
      return
    }

    const sourceIndex = tabs.findIndex((tab) => tab.path === path)
    if (sourceIndex === -1) {
      event.preventDefault()
      return
    }

    clearDrag()
    dispatchDrag({ path, sourceIndex, type: "start" })

    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.dropEffect = "move"
    writeEditorTabDragPayload(event.dataTransfer, path)
    dragImageCleanupRef.current = mountEditorTabDragImage(event)
    startDocumentDragListeners()
    syncDragTarget(event.clientX)
    scheduleAutoScroll(event.clientX)
  }

  function handleDragEnd() {
    const current = stateRef.current
    if (current) clearDrag()
  }

  return {
    draggedPath: state?.path ?? null,
    state,
    onDragEnd: handleDragEnd,
    onDragStart: handleDragStart,
  }
}

export function editorTabDragReducer(
  state: EditorTabDragState | null,
  action: EditorTabDragAction
): EditorTabDragState | null {
  if (action.type === "clear") return null

  if (action.type === "start") {
    return {
      path: action.path,
      sourceIndex: action.sourceIndex,
      targetIndex: action.sourceIndex,
    }
  }

  if (!state) return state
  if (state.targetIndex === action.targetIndex) return state

  return { ...state, targetIndex: action.targetIndex }
}

export function editorTabInsertionEdge<TTab extends EditorTabDragItem>(
  tabs: readonly TTab[],
  tab: TTab,
  dragState: EditorTabDragState | null
): EditorTabInsertionEdge {
  if (!dragState) return null
  if (dragState.targetIndex === null) return null

  const targets = tabs.filter((candidate) => candidate.path !== dragState.path)
  if (targets.length === 0) return null

  const targetIndex = boundedTabDropIndex(dragState.targetIndex, targets.length)
  if (targetIndex === targets.length) {
    return targets.at(-1)?.path === tab.path ? "after" : null
  }

  return targets[targetIndex]?.path === tab.path ? "before" : null
}

function boundedTabDropIndex(index: number, targetCount: number) {
  if (!Number.isFinite(index)) return targetCount

  return Math.min(targetCount, Math.max(0, Math.trunc(index)))
}

function editorTabDropTargetBounds(
  tabList: HTMLElement | null
): readonly EditorTabDropTargetBounds[] {
  if (!tabList) return []

  return Array.from(
    tabList.querySelectorAll<HTMLElement>("[data-editor-tab-path]")
  )
    .map(editorTabDropTargetBound)
    .filter(isEditorTabDropTargetBound)
}

function editorTabDropTargetBound(
  element: HTMLElement
): EditorTabDropTargetBounds | null {
  const path = element.dataset.editorTabPath
  if (!path) return null

  const rect = element.getBoundingClientRect()
  return {
    left: rect.left,
    path,
    right: rect.right,
  }
}

function isEditorTabDropTargetBound(
  bound: EditorTabDropTargetBounds | null
): bound is EditorTabDropTargetBounds {
  return bound !== null
}

function editorTabDragPointInsideTabList(
  tabList: HTMLElement | null,
  event: Pick<globalThis.DragEvent, "clientX" | "clientY">
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

function writeEditorTabDragPayload(dataTransfer: DataTransfer, path: string) {
  const payload: EditorTabDragPayload = {
    kind: EDITOR_TAB_DRAG_KIND,
    paneId: EDITOR_TAB_PANE_ID,
    path,
  }

  setEditorTabDragData(
    dataTransfer,
    EDITOR_TAB_DRAG_MIME,
    JSON.stringify(payload)
  )
  setEditorTabDragData(dataTransfer, "text/plain", path)
}

function setEditorTabDragData(
  dataTransfer: DataTransfer,
  format: string,
  value: string
) {
  try {
    dataTransfer.setData(format, value)
  } catch {
    // Some browser/test shims reject custom MIME writes; text/plain remains a fallback.
  }
}

function dropPayloadMatchesActiveTab(
  dataTransfer: DataTransfer | null,
  path: string
) {
  const result = readEditorTabDragPayload(dataTransfer)
  if (result.status === "missing") return true
  if (result.status === "invalid") return false

  return result.payload.path === path
}

function readEditorTabDragPayload(
  dataTransfer: DataTransfer | null
):
  | { status: "missing" }
  | { status: "invalid" }
  | { payload: EditorTabDragPayload; status: "valid" } {
  if (!dataTransfer) return { status: "missing" }

  const hasPayloadType = dataTransferHasType(dataTransfer, EDITOR_TAB_DRAG_MIME)
  const raw = dataTransfer.getData(EDITOR_TAB_DRAG_MIME)
  if (!raw)
    return hasPayloadType ? { status: "invalid" } : { status: "missing" }

  try {
    const value: unknown = JSON.parse(raw)
    if (!isEditorTabDragPayload(value)) return { status: "invalid" }

    return { payload: value, status: "valid" }
  } catch {
    return { status: "invalid" }
  }
}

function dataTransferHasType(dataTransfer: DataTransfer, type: string) {
  return Array.from(dataTransfer.types).includes(type)
}

function isEditorTabDragPayload(value: unknown): value is EditorTabDragPayload {
  if (!value || typeof value !== "object") return false

  const payload = value as Partial<Record<keyof EditorTabDragPayload, unknown>>
  return (
    payload.kind === EDITOR_TAB_DRAG_KIND &&
    payload.paneId === EDITOR_TAB_PANE_ID &&
    typeof payload.path === "string" &&
    payload.path.length > 0
  )
}

function mountEditorTabDragImage(event: ReactDragEvent<HTMLElement>) {
  const source = editorTabDragImageSource(event.currentTarget)
  const rect = source.getBoundingClientRect()
  const clone = source.cloneNode(true) as HTMLElement
  clone.style.position = "fixed"
  clone.style.top = "-1000px"
  clone.style.left = "-1000px"
  clone.style.width = `${rect.width}px`
  clone.style.height = `${rect.height}px`
  clone.style.pointerEvents = "none"
  clone.style.opacity = "0.92"

  document.body.appendChild(clone)
  event.dataTransfer.setDragImage(
    clone,
    Math.max(0, event.clientX - rect.left),
    Math.max(0, event.clientY - rect.top)
  )

  return () => clone.remove()
}

function editorTabDragImageSource(element: HTMLElement) {
  return element.closest<HTMLElement>("[data-editor-tab-path]") ?? element
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

function isEditorTabDragBlockedTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false

  return Boolean(target.closest("[data-editor-tab-drag-blocker]"))
}
