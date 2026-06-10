import { describe, expect, it } from 'vitest'
import type { WorkspaceSearchMatch } from '@workspace/contracts'

import type { WorkspaceSearchFileGroup } from '@/features/search/search-buffer-state'
import {
  layoutWithSearchPreview,
  searchPreviewSurfaceForResult,
} from '@/features/search/search-preview-layout'
import { searchResultItems } from '@/features/search/search-result-items'
import {
  createClassicFirstRunWorkspaceLayout,
  createSearchPreviewSurface,
  createSearchResultsSurface,
} from '@workspace/tiling/utils/layout-builders'
import {
  findWindowIdContainingSurface,
  visibleSurfaceIdsInOrder,
} from '@workspace/tiling/utils/layout-normalize'
import { openSurface } from '@workspace/tiling/utils/layout-operations'
import type { Surface, WorkspaceLayout } from '@workspace/tiling/utils/layout-types'

describe('search preview layout', () => {
  it('creates a search preview surface for an active match result', () => {
    const match = contentMatch({ path: '/repo/src/app.ts' })
    const group = fileGroup([match])
    const matchId = firstMatchResultId(group)
    const preview = searchPreviewSurfaceForResult({
      activeResultId: matchId,
      groups: [group],
    })

    expect(preview).toEqual(
      expect.objectContaining({
        lifecycle: 'transient',
        ownerContextKey: matchId,
        ownerSurfaceId: createSearchResultsSurface().id,
        resourceKey: match.path,
        title: `Search Preview: ${match.path}`,
        type: 'search-preview',
      }),
    )
  })

  it('does not create a preview for group rows or missing results', () => {
    const group = fileGroup([contentMatch({ path: '/repo/src/app.ts' })])
    const groupId = searchResultItems([group]).find((item) => item.type === 'group')?.id ?? null

    expect(searchPreviewSurfaceForResult({ activeResultId: groupId, groups: [group] })).toBeNull()
    expect(searchPreviewSurfaceForResult({ activeResultId: 'missing', groups: [group] })).toBeNull()
    expect(searchPreviewSurfaceForResult({ activeResultId: null, groups: [group] })).toBeNull()
  })

  it('opens a single adjacent preview and replaces stale owner previews', () => {
    const search = createSearchResultsSurface()
    const matchA = contentMatch({ path: '/repo/src/a.ts' })
    const matchB = contentMatch({ path: '/repo/src/b.ts' })
    const group = fileGroup([matchA, matchB])
    const [previewA, previewB] = previewsForMatches(group)
    const openedA = layoutWithSearchPreview(layoutWithSearch(search), previewA)
    const openedB = layoutWithSearchPreview(openedA, previewB)

    expect(visibleSurfaceIdsInOrder(openedA)).toContain(previewA.id)
    expect(findWindowIdContainingSurface(openedA, previewA.id)).not.toBe(
      findWindowIdContainingSurface(openedA, search.id),
    )
    expect(openedB.surfacesById[previewA.id]).toBeUndefined()
    expect(openedB.surfacesById[previewB.id]).toBeDefined()
    expect(visibleSearchPreviewIds(openedB)).toEqual([previewB.id])
  })

  it('removes transient previews when the owner has no active match', () => {
    const search = createSearchResultsSurface()
    const group = fileGroup([contentMatch({ path: '/repo/src/app.ts' })])
    const preview = previewForFirstMatch(group)
    const opened = layoutWithSearchPreview(layoutWithSearch(search), preview)
    const closed = layoutWithSearchPreview(opened, null)

    expect(opened.surfacesById[preview.id]).toBeDefined()
    expect(closed.surfacesById[preview.id]).toBeUndefined()
    expect(visibleSearchPreviewIds(closed)).toEqual([])
  })
})

function layoutWithSearch(search: Surface): WorkspaceLayout {
  return openSurface(createClassicFirstRunWorkspaceLayout(), search)
}

function previewsForMatches(group: WorkspaceSearchFileGroup): readonly [Surface, Surface] {
  const items = searchResultItems([group])
  const matchIds = items.filter((item) => item.type === 'match').map((item) => item.id)
  const first = matchIds[0]
  const second = matchIds[1]
  if (!first || !second) throw new Error('Expected two match ids')

  return [
    createSearchPreviewSurface({
      ownerContextKey: first,
      ownerSurfaceId: createSearchResultsSurface().id,
      resourceKey: group.matches[0]?.path,
    }),
    createSearchPreviewSurface({
      ownerContextKey: second,
      ownerSurfaceId: createSearchResultsSurface().id,
      resourceKey: group.matches[1]?.path,
    }),
  ]
}

function previewForFirstMatch(group: WorkspaceSearchFileGroup): Surface {
  const matchId = firstMatchResultId(group)

  return createSearchPreviewSurface({
    ownerContextKey: matchId,
    ownerSurfaceId: createSearchResultsSurface().id,
    resourceKey: group.matches[0]?.path,
  })
}

function firstMatchResultId(group: WorkspaceSearchFileGroup) {
  const matchId = searchResultItems([group]).find((item) => item.type === 'match')?.id
  if (!matchId) throw new Error('Expected match id')

  return matchId
}

function visibleSearchPreviewIds(layout: WorkspaceLayout) {
  return visibleSurfaceIdsInOrder(layout).filter((surfaceId) => {
    const surface = layout.surfacesById[surfaceId]
    return surface?.type === 'search-preview'
  })
}

function contentMatch(patch: Partial<WorkspaceSearchMatch> = {}): WorkspaceSearchMatch {
  return {
    column: 14,
    endColumn: 20,
    kind: 'content',
    line: 12,
    path: '/repo/src/app.ts',
    preview: 'export const needle = true',
    source: 'disk',
    type: 'file',
    ...patch,
  }
}

function fileGroup(matches: WorkspaceSearchMatch[]): WorkspaceSearchFileGroup {
  const path = matches[0]?.path ?? '/repo/src/app.ts'

  return {
    collapsed: false,
    count: matches.length,
    matches,
    name: path.split('/').at(-1) ?? 'app.ts',
    path,
    pathLabel: path.replace('/repo/', ''),
  }
}
