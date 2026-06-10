import {
  createSearchPreviewSurface,
  createSearchResultsSurface,
} from '@workspace/tiling/utils/layout-builders'
import { PREVIEW_ADJACENT_POLICY_ID } from '@workspace/tiling/utils/layout-policies'
import { applyLayoutOperation } from '@workspace/tiling'
import type { Surface, SurfaceId, WorkspaceLayout } from '@workspace/tiling/utils/layout-types'
import type { WorkspaceSearchFileGroup } from '@/features/search/search-buffer-state'
import {
  searchResultItemById,
  searchResultItems,
  type SearchResultId,
} from '@/features/search/search-result-items'

export function searchPreviewSurfaceForResult({
  activeResultId,
  groups,
  ownerSurfaceId = createSearchResultsSurface().id,
}: {
  readonly activeResultId: SearchResultId | null
  readonly groups: readonly WorkspaceSearchFileGroup[]
  readonly ownerSurfaceId?: SurfaceId
}): Surface | null {
  if (!activeResultId) return null

  const item = searchResultItemById(searchResultItems(groups), activeResultId)
  if (!item || item.type === 'group') return null

  return createSearchPreviewSurface({
    ownerContextKey: item.id,
    ownerSurfaceId,
    resourceKey: item.match.path,
    title: `Search Preview: ${item.match.path}`,
  })
}

export function layoutWithSearchPreview(layout: WorkspaceLayout, preview: Surface | null) {
  const ownerSurfaceId = preview?.ownerSurfaceId ?? createSearchResultsSurface().id
  const withoutStalePreviews = layoutWithoutSearchPreviews(layout, ownerSurfaceId, preview?.id)
  if (!preview) return withoutStalePreviews
  if (withoutStalePreviews.surfacesById[preview.id]) return withoutStalePreviews

  return applyLayoutOperation(withoutStalePreviews, {
    policyId: PREVIEW_ADJACENT_POLICY_ID,
    surface: preview,
    type: 'openSurface',
  })
}

function layoutWithoutSearchPreviews(
  layout: WorkspaceLayout,
  ownerSurfaceId: SurfaceId,
  keepSurfaceId?: SurfaceId,
) {
  let nextLayout = layout

  for (const surface of Object.values(layout.surfacesById)) {
    if (surface.type !== 'search-preview') continue
    if (surface.ownerSurfaceId !== ownerSurfaceId) continue
    if (surface.id === keepSurfaceId) continue

    nextLayout = applyLayoutOperation(nextLayout, {
      surfaceId: surface.id,
      type: 'closeSurface',
    })
  }

  return nextLayout
}
