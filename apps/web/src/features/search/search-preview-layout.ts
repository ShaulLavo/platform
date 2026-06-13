import { createSearchResultsSurface } from '@workspace/tiling/utils/layout-builders'
import { PREVIEW_ADJACENT_POLICY_ID } from '@workspace/tiling/utils/layout-policies'
import { applyLayoutOperation } from '@workspace/tiling'
import type { Surface, SurfaceId, WorkspaceLayout } from '@workspace/tiling/utils/layout-types'
import type { WorkspaceSearchMatch } from '@workspace/contracts'
import type { WorkspaceSearchFileGroup } from '@/features/search/search-buffer-state'
import {
  searchResultItemById,
  searchResultItems,
  type SearchResultId,
} from '@/features/search/search-result-items'
import { transientFilePreviewSurfaceForTarget } from '@/features/workbench/utils/transient-file-preview'

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

  return transientFilePreviewSurfaceForTarget({
    ownerContextKey: activeResultId,
    ownerSurfaceId,
    target: searchPreviewTarget(item.match),
  })
}

export function layoutWithSearchPreview(layout: WorkspaceLayout, preview: Surface | null) {
  const ownerSurfaceId = preview?.ownerSurfaceId ?? createSearchResultsSurface().id
  const durableSurfaceId = durableFileSurfaceIdForPath(layout, preview?.resourceKey)
  if (durableSurfaceId) {
    const withoutOwnerPreviews = layoutWithoutSearchPreviews(layout, ownerSurfaceId)

    return applyLayoutOperation(withoutOwnerPreviews, {
      surfaceId: durableSurfaceId,
      type: 'activateSurface',
    })
  }

  const withoutStalePreviews = layoutWithoutSearchPreviews(
    layout,
    ownerSurfaceId,
    preview?.id,
    preview?.ownerContextKey,
  )
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
  keepOwnerContextKey?: string,
) {
  let nextLayout = layout

  for (const surface of Object.values(layout.surfacesById)) {
    if (surface.lifecycle !== 'transient') continue
    if (surface.ownerSurfaceId !== ownerSurfaceId) continue
    if (surface.id === keepSurfaceId && surface.ownerContextKey === keepOwnerContextKey) continue

    nextLayout = applyLayoutOperation(nextLayout, {
      surfaceId: surface.id,
      type: 'closeSurface',
    })
  }

  return nextLayout
}

function durableFileSurfaceIdForPath(layout: WorkspaceLayout, path: string | undefined) {
  if (!path) return null

  for (const surface of Object.values(layout.surfacesById)) {
    if (surface.type !== 'file-editor') continue
    if (surface.lifecycle === 'transient') continue
    if (surface.resourceKey !== path) continue

    return surface.id
  }

  return null
}

function searchPreviewTarget(match: WorkspaceSearchMatch) {
  const line = Math.max(0, (typeof match.line === 'number' ? match.line : 1) - 1)
  const character = Math.max(0, (typeof match.column === 'number' ? match.column : 1) - 1)
  const endCharacter =
    typeof match.endColumn === 'number'
      ? Math.max(character + 1, match.endColumn - 1)
      : character + 1

  return {
    path: match.path,
    range: {
      end: { character: endCharacter, line },
      start: { character, line },
    },
    uri: fileUriForPath(match.path),
  }
}

function fileUriForPath(path: string) {
  const normalized = path.replace(/^\/+/, '')

  return `file:///${normalized.split('/').map(encodeURIComponent).join('/')}`
}
