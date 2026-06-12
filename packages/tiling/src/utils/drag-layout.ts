import {
  targetBelongsToTabStrip,
  type TilingDragData,
  type TilingDropData,
} from '@workspace/tiling/utils/drag-data'
import { dragSourceCanUseDropTarget } from '@workspace/tiling/utils/drag-capabilities'
import type { ResolvedTilingTarget } from '@workspace/tiling/utils/drop-target-resolver'
import { moveSurface, moveWindow, tabSurface } from '@workspace/tiling/utils/layout-operations'
import type {
  SnapDestination,
  SurfaceId,
  WindowId,
  WorkspaceLayout,
} from '@workspace/tiling/utils/layout-types'

export function previewLayoutForTarget(
  baseLayout: WorkspaceLayout,
  source: TilingDragData,
  resolvedTarget: ResolvedTilingTarget,
) {
  const target = dragTargetForCommit(baseLayout, source, resolvedTarget.target)
  if (!target) return null
  if (!tabDragCanPreviewTarget(source, target)) return baseLayout
  if (targetMergesWindowIntoTabs(source, target)) {
    return tilingDragTargetLayout(baseLayout, source, target)
  }
  if (resolvedTarget.previewKind === 'dnd-kit') return null
  if (resolvedTarget.previewKind === 'app' && targetBelongsToTabStrip(target)) return null

  return tilingDragTargetLayout(baseLayout, source, target)
}

export function tilingDragTargetLayout(
  layout: WorkspaceLayout,
  source: TilingDragData,
  target: TilingDropData,
) {
  const commitTarget = dragTargetForCommit(layout, source, target)
  if (!commitTarget) return layout

  return tilingDragCommitTargetLayout(layout, source, commitTarget)
}

export function dragTargetForCommit(
  layout: WorkspaceLayout,
  source: TilingDragData,
  target: TilingDropData,
): TilingDropData | null {
  if (!targetExistsInLayout(layout, target)) return null
  if (dragSourceCanUseDropTarget(layout, source, target)) return target

  return null
}

export function resolvedTargetForCommit(
  layout: WorkspaceLayout,
  source: TilingDragData,
  resolvedTarget: ResolvedTilingTarget,
): ResolvedTilingTarget | null {
  const target = dragTargetForCommit(layout, source, resolvedTarget.target)
  if (!target) return null
  if (target === resolvedTarget.target) return resolvedTarget

  return {
    mode: resolvedTarget.mode,
    previewKind: 'app',
    target,
  }
}

function tilingDragCommitTargetLayout(
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

export function dropTargetCanCommit(
  layout: WorkspaceLayout,
  target: TilingDropData,
  source?: TilingDragData,
) {
  if (source) return Boolean(dragTargetForCommit(layout, source, target))
  if (target.kind !== 'snap-destination') return targetExistsInLayout(layout, target)

  return snapDestinationCanCommit(layout, target.destination)
}

export function resolvedTargetSignature(target: ResolvedTilingTarget | null) {
  if (!target) return 'none'

  return [
    target.mode,
    target.previewKind ?? 'snap',
    target.candidateId ?? '',
    dropTargetSignature(target.target),
  ].join('|')
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

function snapDestinationCanCommit(layout: WorkspaceLayout, destination: SnapDestination) {
  if (destination.kind === 'root-edge') return Boolean(layout.rootNodeId)
  if (destination.kind === 'window-edge') return Boolean(layout.windowsById[destination.windowId])
  if (destination.kind === 'window-center') return Boolean(layout.windowsById[destination.windowId])
  if (destination.kind === 'parent-edge') return Boolean(layout.nodesById[destination.nodeId])

  return true
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
