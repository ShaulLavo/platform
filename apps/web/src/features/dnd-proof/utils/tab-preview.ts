import type { DndProofDragData } from '@/features/dnd-proof/utils/drag-data'
import type { ResolvedDndProofTarget } from '@/features/dnd-proof/utils/drop-target-resolver'
import { findWindowIdContainingSurface } from '@/features/tiling-surface-manager/engine/layout-normalize'
import type {
  Surface,
  SurfaceId,
  WindowId,
  WorkspaceLayout,
} from '@/features/tiling-surface-manager/engine/layout-types'

export function tabPreviewSurfacesForWindow({
  activeDrag,
  layout,
  resolvedTarget,
  surfaces,
  windowId,
}: {
  readonly activeDrag: DndProofDragData | null
  readonly layout: WorkspaceLayout
  readonly resolvedTarget: ResolvedDndProofTarget | null
  readonly surfaces: readonly Surface[]
  readonly windowId: WindowId
}) {
  const surfaceIds = tabPreviewSurfaceIdsForWindow({
    activeDrag,
    layout,
    resolvedTarget,
    surfaces,
    windowId,
  })
  if (!surfaceIds) return surfaces

  return surfacesForIds(layout, surfaceIds)
}

function tabPreviewSurfaceIdsForWindow({
  activeDrag,
  layout,
  resolvedTarget,
  surfaces,
  windowId,
}: {
  readonly activeDrag: DndProofDragData | null
  readonly layout: WorkspaceLayout
  readonly resolvedTarget: ResolvedDndProofTarget | null
  readonly surfaces: readonly Surface[]
  readonly windowId: WindowId
}) {
  if (activeDrag?.kind !== 'tab') return null
  if (resolvedTarget?.previewKind !== 'app') return null
  if (!targetBelongsToTabStrip(resolvedTarget)) return null

  const target = resolvedTarget.target
  const sourceWindowId = findWindowIdContainingSurface(layout, activeDrag.surfaceId)
  const windowIsRelevant = windowId === sourceWindowId || windowId === target.windowId
  if (!windowIsRelevant) return null

  const withoutDraggedSurface = surfaces
    .map((surface) => surface.id)
    .filter((surfaceId) => surfaceId !== activeDrag.surfaceId)
  if (windowId !== target.windowId) return withoutDraggedSurface

  return insertSurfaceId(withoutDraggedSurface, activeDrag.surfaceId, target.index)
}

function targetBelongsToTabStrip(
  target: ResolvedDndProofTarget,
): target is ResolvedDndProofTarget & {
  readonly target: Extract<ResolvedDndProofTarget['target'], { readonly kind: 'tab' | 'tab-strip' }>
} {
  return target.target.kind === 'tab' || target.target.kind === 'tab-strip'
}

function surfacesForIds(layout: WorkspaceLayout, surfaceIds: readonly SurfaceId[]) {
  const surfaces: Surface[] = []

  for (const surfaceId of surfaceIds) {
    const surface = layout.surfacesById[surfaceId]
    if (!surface) continue

    surfaces.push(surface)
  }

  return surfaces
}

function insertSurfaceId(surfaceIds: readonly SurfaceId[], surfaceId: SurfaceId, index: number) {
  const insertIndex = Math.max(0, Math.min(index, surfaceIds.length))

  return [...surfaceIds.slice(0, insertIndex), surfaceId, ...surfaceIds.slice(insertIndex)]
}
