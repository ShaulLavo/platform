import { log } from '@/lib/client-logging'
import { createCoalescedLogQueue } from '@/lib/coalesced-log'

import {
  visibleSurfaceIdsInOrder,
  visibleWindowIdsInOrder,
} from '@/features/tiling-surface-manager/engine/layout-normalize'
import type {
  SnapDestination,
  LayoutNodeId,
  LayoutOperation,
  WorkspaceLayout,
} from '@/features/tiling-surface-manager/engine/layout-types'

type WorkbenchLayoutLogContext = Record<string, unknown>

const RESIZE_SPLIT_LAYOUT_LOG_DELAY_MS = 250
const resizeSplitLayoutInfoLogs = createCoalescedLogQueue({
  delayMs: RESIZE_SPLIT_LAYOUT_LOG_DELAY_MS,
  emit: (event) => log.info(event),
})

export function logWorkbenchLayoutInfo(action: string, context: WorkbenchLayoutLogContext = {}) {
  const event = workbenchLayoutLogEvent(action, context)
  if (!shouldCoalesceWorkbenchLayoutInfo(action, event)) {
    log.info(event)
    return
  }

  resizeSplitLayoutInfoLogs.queue(resizeSplitLayoutInfoLogKey(event), event)
}

export function logWorkbenchLayoutWarn(action: string, context: WorkbenchLayoutLogContext = {}) {
  log.warn(workbenchLayoutLogEvent(action, context))
}

export function flushPendingWorkbenchLayoutInfoLogs() {
  resizeSplitLayoutInfoLogs.flushAll()
}

export function layoutSnapshot(layout: WorkspaceLayout) {
  const activeSurface = layout.activeSurfaceId ? layout.surfacesById[layout.activeSurfaceId] : null
  const activeWindow = layout.activeWindowId ? layout.windowsById[layout.activeWindowId] : null

  return {
    activeSurface: activeSurface
      ? {
          id: compactLayoutId(activeSurface.id),
          title: activeSurface.title,
          type: activeSurface.type,
        }
      : null,
    activeWindow: activeWindow
      ? {
          id: compactLayoutId(activeWindow.id),
          mode: activeWindow.mode,
          surfaceCount: activeWindow.surfaceIds.length,
        }
      : null,
    backgroundSurfaceCount: (layout.rail.backgroundSurfaceIds ?? []).length,
    nodeCount: Object.keys(layout.nodesById).length,
    rootNodeId: compactNullableLayoutId(layout.rootNodeId),
    runningSurfaceCount: (layout.rail.runningSurfaceIds ?? []).length,
    surfaceCount: Object.keys(layout.surfacesById).length,
    visibleSingletonSurfaceCount: (layout.rail.visibleSingletonSurfaceIds ?? []).length,
    visibleSurfaceCount: visibleSurfaceIdsInOrder(layout).length,
    visibleWindowCount: visibleWindowIdsInOrder(layout).length,
    windowCount: Object.keys(layout.windowsById).length,
  }
}

export function visibleLayoutChanged(before: WorkspaceLayout, after: WorkspaceLayout) {
  return (
    stableStringify(visibleLayoutSnapshot(before)) !== stableStringify(visibleLayoutSnapshot(after))
  )
}

export function operationSummary(operation: LayoutOperation): WorkbenchLayoutLogContext {
  const base = { operationType: operation.type }

  switch (operation.type) {
    case 'activateSurface':
      return {
        ...base,
        surfaceId: compactLayoutId(operation.surfaceId),
        windowId: compactNullableLayoutId(operation.windowId),
      }
    case 'applyCustomWindowCommand':
      return {
        ...base,
        commandId: operation.command.id,
        commandTitle: operation.command.title,
        targetWindowId: compactNullableLayoutId(operation.targetWindowId),
      }
    case 'applyLayoutCommand':
      return { ...base, commandId: operation.command.id, commandTitle: operation.command.title }
    case 'applyHotkeyPreset':
      return { ...base, presetId: operation.preset.id, presetTitle: operation.preset.title }
    case 'applyRecipe':
      return { ...base, recipeId: operation.recipeId }
    case 'closeSurface':
    case 'restoreSurface':
      return { ...base, surfaceId: compactLayoutId(operation.surfaceId) }
    case 'collapseWindow':
    case 'expandWindow':
      return { ...base, windowId: compactLayoutId(operation.windowId) }
    case 'fullscreenWindow':
    case 'maximizeWindow':
    case 'restoreWindow':
      return { ...base, windowId: compactLayoutId(operation.windowId) }
    case 'moveSurface':
      return {
        ...base,
        snapDestination: snapDestinationSummary(operation.destination),
        surfaceId: compactLayoutId(operation.surfaceId),
      }
    case 'moveWindow':
      return {
        ...base,
        snapDestination: snapDestinationSummary(operation.destination),
        windowId: compactLayoutId(operation.windowId),
      }
    case 'openSurface':
      return {
        ...base,
        policyId: operation.policyId,
        surfaceId: compactLayoutId(operation.surface.id),
        surfaceTitle: operation.surface.title,
        surfaceType: operation.surface.type,
      }
    case 'reorderSurface':
      return {
        ...base,
        fromIndex: operation.fromIndex,
        toIndex: operation.toIndex,
        windowId: compactLayoutId(operation.windowId),
      }
    case 'resizeSplit':
      return {
        ...base,
        deltaPx: operation.deltaPx,
        handleIndex: operation.handleIndex,
        splitId: compactLayoutId(operation.splitId),
      }
    case 'splitWindow':
      return {
        ...base,
        edge: operation.edge,
        sourceWindowId: compactNullableLayoutId(operation.sourceWindowId),
        surfaceId: compactNullableLayoutId(operation.surfaceId),
        windowId: compactLayoutId(operation.windowId),
      }
    case 'tabSurface':
      return {
        ...base,
        index: operation.index,
        surfaceId: compactLayoutId(operation.surfaceId),
        targetWindowId: compactLayoutId(operation.targetWindowId),
      }
    case 'upsertCustomWindowCommand':
      return { ...base, commandId: operation.command.id, commandTitle: operation.command.title }
    case 'upsertLayoutCommand':
      return { ...base, commandId: operation.command.id, commandTitle: operation.command.title }
  }
}

function workbenchLayoutLogEvent(action: string, context: WorkbenchLayoutLogContext) {
  return sanitizeLayoutLogContext({
    action,
    area: 'workbench.layout',
    ...context,
  })
}

function shouldCoalesceWorkbenchLayoutInfo(action: string, event: WorkbenchLayoutLogContext) {
  if (action !== 'layout.operation.dispatch') return false
  if (event.outcome !== 'ok') return false

  const operation = event.operation
  if (!isRecord(operation)) return false

  return operation.operationType === 'resizeSplit'
}

function resizeSplitLayoutInfoLogKey(event: WorkbenchLayoutLogContext) {
  const operation = event.operation
  if (!isRecord(operation)) return 'resizeSplit'

  return [
    event.area,
    event.action,
    event.dispatcher ?? 'store',
    operation.operationType,
    operation.splitId,
    operation.handleIndex,
  ].join(':')
}

function visibleLayoutSnapshot(layout: WorkspaceLayout) {
  const visibleWindowIds = visibleWindowIdsInOrder(layout)

  return {
    activeSurfaceId: layout.activeSurfaceId,
    activeWindowId: layout.activeWindowId,
    nodes: visibleNodeSnapshots(layout, layout.rootNodeId),
    rootNodeId: layout.rootNodeId,
    windows: visibleWindowIds.map((windowId) => {
      const window = layout.windowsById[windowId]

      return {
        activeSurfaceId: window?.activeSurfaceId,
        id: windowId,
        mode: window?.mode,
        previewSurfaceId: window?.previewSurfaceId,
        surfaceIds: window?.surfaceIds ?? [],
      }
    }),
  }
}

function visibleNodeSnapshots(layout: WorkspaceLayout, nodeId: LayoutNodeId | null): unknown {
  if (!nodeId) return null

  const node = layout.nodesById[nodeId]
  if (!node) return null
  if (node.kind === 'window') return { id: node.id, kind: node.kind, windowId: node.windowId }

  return {
    axis: node.axis,
    childIds: node.childIds,
    children: node.childIds.map((childId) => visibleNodeSnapshots(layout, childId)),
    id: node.id,
    kind: node.kind,
    sizes: node.sizes,
  }
}

function stableStringify(value: unknown) {
  return JSON.stringify(value)
}

function snapDestinationSummary(destination: SnapDestination) {
  if (destination.kind === 'background') return { kind: destination.kind }
  if (destination.kind === 'rail') return { kind: destination.kind }
  if (destination.kind === 'recipe-slot') {
    return { kind: destination.kind, slot: destination.slot }
  }
  if (destination.kind === 'root-edge') {
    return { edge: destination.edge, kind: destination.kind }
  }
  if (destination.kind === 'parent-edge') {
    return {
      edge: destination.edge,
      kind: destination.kind,
      nodeId: compactLayoutId(destination.nodeId),
    }
  }
  if (destination.kind === 'window-center') {
    return {
      kind: destination.kind,
      tabIndex: destination.tabIndex,
      windowId: compactLayoutId(destination.windowId),
    }
  }

  return {
    edge: destination.edge,
    kind: destination.kind,
    windowId: compactLayoutId(destination.windowId),
  }
}

function sanitizeLayoutLogContext(context: Record<string, unknown>) {
  const sanitized: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(context)) {
    sanitized[key] = sanitizeLayoutLogValue(key, value)
  }

  return sanitized
}

function sanitizeLayoutLogValue(key: string, value: unknown): unknown {
  if (typeof value === 'string' && layoutIdKey(key)) return compactLayoutId(value)
  if (Array.isArray(value) && layoutIdsKey(key)) return compactLayoutIdList(value)
  if (!isRecord(value)) return value

  return sanitizeLayoutLogContext(value)
}

function compactLayoutIdList(values: readonly unknown[]) {
  const ids = values.filter((value): value is string => typeof value === 'string')

  return {
    count: ids.length,
    sample: ids.slice(0, 3).map(compactLayoutId),
  }
}

function compactNullableLayoutId(id: string | null | undefined) {
  return id ? compactLayoutId(id) : null
}

function compactLayoutId(id: string) {
  const decoded = safeDecodeId(id)
  const parts = decoded.split(':')
  if (parts.length <= 2) return limitLogText(decoded)

  const prefix = parts.slice(0, 2).join(':')
  const key = parts.slice(2).join(':')
  if (key === 'workspace' || /^[a-z]+-\d+$/u.test(key)) return `${prefix}:${key}`
  if (key.includes('/')) return `${prefix}:${compactPathKey(key)}`

  return `${prefix}:${limitLogText(key)}`
}

function safeDecodeId(id: string) {
  let decoded = id
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const next = safeDecodeURIComponent(decoded)
    if (next === decoded) return decoded

    decoded = next
  }

  return decoded
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function limitLogText(value: string) {
  if (value.length <= 48) return value

  return `${value.slice(0, 45)}...`
}

function compactPathKey(key: string) {
  const normalized = key.replace(/^file:\/\//u, '')
  const segments = normalized.split('/').filter(Boolean)
  const tail = segments.slice(-2).join('/')
  if (!tail) return limitLogText(key)

  const label = pathKeyLabel(normalized)
  return label ? `${label}:.../${tail}` : `.../${tail}`
}

function pathKeyLabel(key: string) {
  const firstColonIndex = key.indexOf(':')
  if (firstColonIndex <= 0) return null

  return key.slice(0, firstColonIndex)
}

function layoutIdKey(key: string) {
  return key === 'id' || key.endsWith('Id')
}

function layoutIdsKey(key: string) {
  return key.endsWith('Ids')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
