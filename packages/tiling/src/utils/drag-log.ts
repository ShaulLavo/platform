import { type TilingDragData, type TilingDropData } from '@workspace/tiling/utils/drag-data'
import { formatPoint, type PointerCoordinates } from '@workspace/tiling/utils/geometry-primitives'
import { visibleWindowIdsInOrder } from '@workspace/tiling/utils/layout-normalize'
import { windowTitle } from '@workspace/tiling/utils/layout-queries'
import type {
  SnapDestination,
  SurfaceId,
  WindowId,
  WorkspaceLayout,
} from '@workspace/tiling/utils/layout-types'
import { describeTabStripHitTest } from '@workspace/tiling/utils/tab-strip-hit-test'
import type { ActiveTilingDrag, PointerDetails } from '@workspace/tiling/utils/drag-state'

export type StateLogPhase = 'cancel' | 'move' | 'release' | 'start'

export type StateLogInput = {
  readonly debug?: string
  readonly layout: WorkspaceLayout
  readonly phase: StateLogPhase
  readonly source: TilingDragData
  readonly target: TilingDropData | null
}

export function stateLogDetails({ debug, layout, phase, source, target }: StateLogInput) {
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

export function noneTargetDebug(
  source: TilingDragData,
  point: PointerCoordinates,
  pointSource: PointerDetails['source'],
  rawTarget: TilingDropData | null,
  activeDrag: ActiveTilingDrag | null,
) {
  const dockTravel = activeDrag?.kind === 'tab' ? activeDrag.travel : null
  const tabStripProbe = describeTabStripHitTest(source, point, { dockTravel })

  return `${pointSource}@${formatPoint(point)} raw=${rawTargetDebugLabel(rawTarget)} ${tabStripProbe}`
}

function rawTargetDebugLabel(target: TilingDropData | null) {
  if (!target) return 'none'
  if (target.kind === 'tab') return `tab:${target.index}`
  if (target.kind === 'tab-strip') return `strip:${target.index}`
  if (target.kind === 'window') return 'window'

  return target.destination.kind
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

  return `window:${windowTitle(layout, source.windowId)}`
}

function stateTargetLabel(layout: WorkspaceLayout, target: TilingDropData | null) {
  if (!target) return 'none'
  if (target.kind === 'tab') return `${windowTitle(layout, target.windowId)}:${target.index}`
  if (target.kind === 'tab-strip') {
    return `${windowTitle(layout, target.windowId)}:${target.index}`
  }
  if (target.kind === 'window') return `window:${windowTitle(layout, target.windowId)}`

  return stateDestinationLabel(layout, target.destination)
}

function stateDestinationLabel(layout: WorkspaceLayout, destination: SnapDestination) {
  if (destination.kind === 'root-edge') return `root ${destination.edge}`
  if (destination.kind === 'window-edge') {
    return `${windowTitle(layout, destination.windowId)} ${destination.edge}`
  }
  if (destination.kind === 'window-center') {
    return `${windowTitle(layout, destination.windowId)}:${destination.tabIndex ?? 'end'}`
  }
  if (destination.kind === 'parent-edge') return `parent ${destination.edge}`
  if (destination.kind === 'recipe-slot') return `slot ${destination.slot}`

  return destination.kind
}

function stateSurfaceTitle(layout: WorkspaceLayout, surfaceId: SurfaceId) {
  return layout.surfacesById[surfaceId]?.title ?? String(surfaceId)
}
