import type { TilingDragData } from '@workspace/tiling/utils/drag-data'
import type { ResolvedTilingTarget } from '@workspace/tiling/utils/drop-target-resolver'
import { findWindowIdContainingSurface } from '@workspace/tiling/utils/layout-normalize'
import type {
  Surface,
  SurfaceId,
  WindowId,
  WorkspaceLayout,
} from '@workspace/tiling/utils/layout-types'

export type TilingInsertionPreview = {
  readonly insertionIndex: number
  readonly kind: 'tab-insertion' | 'window-merge'
  readonly sourceSurfaceIds: readonly SurfaceId[]
  readonly sourceWindowId?: WindowId
  readonly targetWindowId: WindowId
}

export type TilingTabStripPreviewItem =
  | {
      readonly index: number
      readonly key: string
      readonly kind: 'surface'
      readonly surface: Surface
    }
  | {
      readonly key: string
      readonly kind: 'ghost'
      readonly surface: Surface
    }
  | {
      readonly key: string
      readonly kind: 'slot'
      readonly sourceSurfaceIds: readonly SurfaceId[]
    }

export function tilingInsertionPreview({
  activeDrag,
  layout,
  resolvedTarget,
}: {
  readonly activeDrag: TilingDragData | null
  readonly layout: WorkspaceLayout
  readonly resolvedTarget: ResolvedTilingTarget | null
}): TilingInsertionPreview | null {
  if (!activeDrag) return null
  if (!resolvedTarget) return null

  if (activeDrag.kind === 'tab') {
    return tabInsertionPreview({ activeDrag, layout, resolvedTarget })
  }

  return windowMergePreview({ activeDrag, layout, resolvedTarget })
}

export function tilingTabStripPreviewItems({
  insertionPreview,
  layout,
  surfaces,
  windowId,
}: {
  readonly insertionPreview: TilingInsertionPreview | null
  readonly layout: WorkspaceLayout
  readonly surfaces: readonly Surface[]
  readonly windowId: WindowId
}): readonly TilingTabStripPreviewItem[] {
  const surfaceItems = surfaces.map((surface, index) => ({
    index,
    key: `surface:${surface.id}`,
    kind: 'surface' as const,
    surface,
  }))
  if (insertionPreview?.targetWindowId !== windowId) return surfaceItems

  const previewItems = previewItemsForInsertion(layout, surfaces, insertionPreview)
  if (previewItems.length === 0) return surfaceItems

  const insertionIndex = clampIndex(insertionPreview.insertionIndex, surfaceItems.length)

  return [
    ...surfaceItems.slice(0, insertionIndex),
    ...previewItems,
    ...surfaceItems.slice(insertionIndex),
  ]
}

function tabInsertionPreview({
  activeDrag,
  layout,
  resolvedTarget,
}: {
  readonly activeDrag: Extract<TilingDragData, { readonly kind: 'tab' }>
  readonly layout: WorkspaceLayout
  readonly resolvedTarget: ResolvedTilingTarget
}): TilingInsertionPreview | null {
  const targetWindowId = targetWindowIdForInsertion(layout, resolvedTarget)
  if (!targetWindowId) return null
  if (!layout.surfacesById[activeDrag.surfaceId]) return null

  const sourceWindowId = findWindowIdContainingSurface(layout, activeDrag.surfaceId) ?? undefined
  if (resolvedTarget.mode === 'tab-reorder' && targetWindowId === sourceWindowId) return null

  return {
    insertionIndex: targetInsertionIndex(layout, targetWindowId, resolvedTarget),
    kind: 'tab-insertion',
    sourceSurfaceIds: [activeDrag.surfaceId],
    sourceWindowId,
    targetWindowId,
  }
}

function windowMergePreview({
  activeDrag,
  layout,
  resolvedTarget,
}: {
  readonly activeDrag: Extract<TilingDragData, { readonly kind: 'window' }>
  readonly layout: WorkspaceLayout
  readonly resolvedTarget: ResolvedTilingTarget
}): TilingInsertionPreview | null {
  const targetWindowId = targetWindowIdForInsertion(layout, resolvedTarget)
  if (!targetWindowId) return null
  if (targetWindowId === activeDrag.windowId) return null

  const sourceWindow = layout.windowsById[activeDrag.windowId]
  if (!sourceWindow) return null
  if (sourceWindow.surfaceIds.length === 0) return null

  return {
    insertionIndex: targetInsertionIndex(layout, targetWindowId, resolvedTarget),
    kind: 'window-merge',
    sourceSurfaceIds: sourceWindow.surfaceIds,
    sourceWindowId: activeDrag.windowId,
    targetWindowId,
  }
}

function targetWindowIdForInsertion(
  layout: WorkspaceLayout,
  resolvedTarget: ResolvedTilingTarget,
): WindowId | null {
  const target = resolvedTarget.target
  if (target.kind === 'tab') return existingWindowId(layout, target.windowId)
  if (target.kind === 'tab-strip') return existingWindowId(layout, target.windowId)
  if (target.kind !== 'snap-destination') return null
  if (target.destination.kind !== 'window-center') return null

  return existingWindowId(layout, target.destination.windowId)
}

function existingWindowId(layout: WorkspaceLayout, windowId: WindowId) {
  if (!layout.windowsById[windowId]) return null

  return windowId
}

function targetInsertionIndex(
  layout: WorkspaceLayout,
  targetWindowId: WindowId,
  resolvedTarget: ResolvedTilingTarget,
) {
  const target = resolvedTarget.target
  const targetSurfaceCount = layout.windowsById[targetWindowId]?.surfaceIds.length ?? 0
  if (target.kind === 'tab') return clampIndex(target.index, targetSurfaceCount)
  if (target.kind === 'tab-strip') return clampIndex(target.index, targetSurfaceCount)
  if (target.kind !== 'snap-destination') return targetSurfaceCount
  if (target.destination.kind !== 'window-center') return targetSurfaceCount

  return clampIndex(target.destination.tabIndex ?? targetSurfaceCount, targetSurfaceCount)
}

function previewItemsForInsertion(
  layout: WorkspaceLayout,
  surfaces: readonly Surface[],
  insertionPreview: TilingInsertionPreview,
): readonly TilingTabStripPreviewItem[] {
  if (mergePreviewAlreadyMaterialized(surfaces, insertionPreview)) return []
  if (previewUsesSlot(surfaces, insertionPreview)) {
    return [
      {
        key: `slot:${insertionPreview.sourceSurfaceIds.join(':')}`,
        kind: 'slot',
        sourceSurfaceIds: insertionPreview.sourceSurfaceIds,
      },
    ]
  }

  return surfacesForIds(layout, insertionPreview.sourceSurfaceIds).map((surface) => ({
    key: `ghost:${insertionPreview.kind}:${surface.id}`,
    kind: 'ghost',
    surface,
  }))
}

function mergePreviewAlreadyMaterialized(
  surfaces: readonly Surface[],
  insertionPreview: TilingInsertionPreview,
) {
  if (insertionPreview.kind !== 'window-merge') return false

  const surfaceIds = new Set(surfaces.map((surface) => surface.id))

  return insertionPreview.sourceSurfaceIds.every((surfaceId) => surfaceIds.has(surfaceId))
}

function previewUsesSlot(surfaces: readonly Surface[], insertionPreview: TilingInsertionPreview) {
  if (insertionPreview.kind !== 'tab-insertion') return false

  const surfaceIds = new Set(surfaces.map((surface) => surface.id))

  return insertionPreview.sourceSurfaceIds.some((surfaceId) => surfaceIds.has(surfaceId))
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

function clampIndex(index: number, length: number) {
  return Math.max(0, Math.min(index, length))
}
