import type {
  Surface,
  SurfaceId,
  WindowId,
  WorkbenchWindow,
} from '@workspace/tiling/utils/layout-types'

export const WORKBENCH_TAB_DRAG_TYPE = 'workbench-tab'
export const WORKBENCH_WINDOW_DRAG_TYPE = 'workbench-window'

export type WorkbenchTabCapabilities = {
  readonly canDetach: boolean
  readonly canDrag: boolean
  readonly canReorder: boolean
}

export type WorkbenchWindowDragCapabilities = {
  readonly canDrag: boolean
}

export type WorkbenchTabDragData = {
  readonly capabilities: WorkbenchTabCapabilities
  readonly dragType: typeof WORKBENCH_TAB_DRAG_TYPE
  readonly sourceIndex: number
  readonly sourceWindowId: WindowId
  readonly stripId: string
  readonly surfaceId: SurfaceId
}

export type WorkbenchWindowDragData = {
  readonly capabilities: WorkbenchWindowDragCapabilities
  readonly dragType: typeof WORKBENCH_WINDOW_DRAG_TYPE
  readonly windowId: WindowId
}

export type WorkbenchDragData = WorkbenchTabDragData | WorkbenchWindowDragData

export function workbenchTabDragId(stripId: string, surfaceId: SurfaceId) {
  return `${WORKBENCH_TAB_DRAG_TYPE}:${stripId}:${surfaceId}`
}

export function workbenchWindowDragId(windowId: WindowId) {
  return `${WORKBENCH_WINDOW_DRAG_TYPE}:${windowId}`
}

export function workbenchTabCapabilities({
  surface,
}: {
  readonly surface: Surface
}): WorkbenchTabCapabilities {
  const canMove = surface.capabilities.validPlacements.length > 0

  return {
    canDetach: canMove,
    canDrag: canMove,
    canReorder: canMove,
  }
}

export function workbenchWindowDragCapabilities({
  surfaces,
  window,
}: {
  readonly surfaces: readonly Surface[]
  readonly window: WorkbenchWindow
}): WorkbenchWindowDragCapabilities {
  if (window.mode === 'fullscreen') return { canDrag: false }
  if (surfaces.length === 0) return { canDrag: false }

  return {
    canDrag: surfaces.some((surface) => surface.capabilities.validPlacements.length > 0),
  }
}

export function isWorkbenchTabDragData(value: unknown): value is WorkbenchTabDragData {
  if (!value || typeof value !== 'object') return false

  const data = value as Partial<WorkbenchTabDragData>
  if (data.dragType !== WORKBENCH_TAB_DRAG_TYPE) return false
  if (!isTabCapabilities(data.capabilities)) return false
  if (typeof data.sourceIndex !== 'number') return false
  if (typeof data.sourceWindowId !== 'string') return false
  if (typeof data.stripId !== 'string') return false

  return typeof data.surfaceId === 'string'
}

export function isWorkbenchWindowDragData(value: unknown): value is WorkbenchWindowDragData {
  if (!value || typeof value !== 'object') return false

  const data = value as Partial<WorkbenchWindowDragData>
  if (data.dragType !== WORKBENCH_WINDOW_DRAG_TYPE) return false
  if (!isWindowDragCapabilities(data.capabilities)) return false

  return typeof data.windowId === 'string'
}

function isTabCapabilities(value: unknown): value is WorkbenchTabCapabilities {
  if (!value || typeof value !== 'object') return false

  const capabilities = value as Partial<WorkbenchTabCapabilities>
  if (typeof capabilities.canDetach !== 'boolean') return false
  if (typeof capabilities.canDrag !== 'boolean') return false

  return typeof capabilities.canReorder === 'boolean'
}

function isWindowDragCapabilities(value: unknown): value is WorkbenchWindowDragCapabilities {
  if (!value || typeof value !== 'object') return false

  const capabilities = value as Partial<WorkbenchWindowDragCapabilities>
  return typeof capabilities.canDrag === 'boolean'
}
