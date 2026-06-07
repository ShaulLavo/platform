import type { WindowId } from '@/features/tiling-surface-manager/engine/layout-types'

export const WORKBENCH_WINDOW_POINTER_DRAG_EVENT = 'workbench-window-pointer-drag'
export const WORKBENCH_WINDOW_POINTER_DROP_EVENT = 'workbench-window-pointer-drop'
export const WORKBENCH_WINDOW_POINTER_CANCEL_EVENT = 'workbench-window-pointer-cancel'
export const WORKBENCH_WINDOW_DRAG_START_THRESHOLD_PX = 4

export type WorkbenchWindowPointerDragDetail = {
  readonly clientX: number
  readonly clientY: number
  readonly windowId: WindowId
}

export function dispatchWorkbenchWindowPointerDragEvent(
  type: typeof WORKBENCH_WINDOW_POINTER_DRAG_EVENT | typeof WORKBENCH_WINDOW_POINTER_DROP_EVENT,
  detail: WorkbenchWindowPointerDragDetail,
) {
  document.dispatchEvent(new CustomEvent<WorkbenchWindowPointerDragDetail>(type, { detail }))
}

export function dispatchWorkbenchWindowPointerCancelEvent() {
  document.dispatchEvent(new CustomEvent(WORKBENCH_WINDOW_POINTER_CANCEL_EVENT))
}

export function workbenchWindowPointerDragDetail(
  event: Event,
): WorkbenchWindowPointerDragDetail | null {
  if (!(event instanceof CustomEvent)) return null
  if (!isWorkbenchWindowPointerDragDetail(event.detail)) return null

  return event.detail
}

function isWorkbenchWindowPointerDragDetail(
  value: unknown,
): value is WorkbenchWindowPointerDragDetail {
  if (!value || typeof value !== 'object') return false

  const detail = value as Partial<WorkbenchWindowPointerDragDetail>
  if (typeof detail.clientX !== 'number') return false
  if (typeof detail.clientY !== 'number') return false

  return typeof detail.windowId === 'string' && detail.windowId.length > 0
}
