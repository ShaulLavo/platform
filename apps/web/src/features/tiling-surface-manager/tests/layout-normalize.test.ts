import { describe, expect, it } from 'vitest'

import {
  CLASSIC_DIAGNOSTICS_WINDOW_ID,
  CLASSIC_EDITOR_NODE_ID,
  CLASSIC_EDITOR_WINDOW_ID,
  CLASSIC_FILE_NAVIGATOR_NODE_ID,
  CLASSIC_ROOT_NODE_ID,
  createClassicFirstRunWorkspaceLayout,
  createFileEditorSurface,
  createSearchPreviewSurface,
  createSplitNode,
  createTerminalSurface,
  createWindowNode,
  createWorkbenchWindow,
} from '@/features/tiling-surface-manager/utils/layout-builders'
import { checkWorkspaceLayoutInvariants } from '@/features/tiling-surface-manager/utils/layout-invariants'
import { layoutNodeId, workbenchWindowId } from '@/features/tiling-surface-manager/utils/layout-ids'
import {
  normalizeWorkspaceLayout,
  visibleSurfaceIdsInOrder,
  visibleWindowIdsInOrder,
} from '@/features/tiling-surface-manager/utils/layout-normalize'
import type {
  LayoutSplitNode,
  WorkspaceLayout,
} from '@/features/tiling-surface-manager/utils/layout-types'

describe('tiling surface layout normalization', () => {
  it('removes empty windows, collapses empty splits, flattens same-axis chains, and repairs sizes', () => {
    const layout = layoutWithSameAxisSplitAndEmptyWindow()
    const normalized = normalizeWorkspaceLayout(layout)
    const root = normalized.rootNodeId ? normalized.nodesById[normalized.rootNodeId] : null

    expect(root?.kind).toBe('split')
    expect((root as LayoutSplitNode).axis).toBe('horizontal')
    expect((root as LayoutSplitNode).childIds).toEqual([
      CLASSIC_FILE_NAVIGATOR_NODE_ID,
      CLASSIC_EDITOR_NODE_ID,
    ])
    expect(sumSizes((root as LayoutSplitNode).sizes)).toBeCloseTo(1)
    expect(normalized.windowsById[workbenchWindowId('normalizer:empty')]).toBeUndefined()
    expect(checkWorkspaceLayoutInvariants(normalized).ok).toBe(true)
  })

  it('removes duplicate visible surface references from later windows', () => {
    const layout = createClassicFirstRunWorkspaceLayout()
    const duplicateSurfaceId = layout.rail.visibleSingletonSurfaceIds[0]
    const editorWindow = layout.windowsById[CLASSIC_EDITOR_WINDOW_ID]
    const normalized = normalizeWorkspaceLayout({
      ...layout,
      windowsById: {
        ...layout.windowsById,
        [CLASSIC_EDITOR_WINDOW_ID]: {
          ...editorWindow,
          surfaceIds: editorWindow.surfaceIds.concat(duplicateSurfaceId),
        },
      },
    })

    expect(visibleSurfaceIdsInOrder(normalized).filter((id) => id === duplicateSurfaceId)).toEqual([
      duplicateSurfaceId,
    ])
    expect(checkWorkspaceLayoutInvariants(normalized).ok).toBe(true)
  })

  it('removes a later visible window when every surface in it is duplicated', () => {
    const layout = createClassicFirstRunWorkspaceLayout()
    const duplicateSurfaceId = layout.rail.visibleSingletonSurfaceIds[0]
    const diagnosticsWindow = layout.windowsById[CLASSIC_DIAGNOSTICS_WINDOW_ID]
    const normalized = normalizeWorkspaceLayout({
      ...layout,
      windowsById: {
        ...layout.windowsById,
        [CLASSIC_DIAGNOSTICS_WINDOW_ID]: {
          ...diagnosticsWindow,
          activeSurfaceId: duplicateSurfaceId,
          surfaceIds: [duplicateSurfaceId],
        },
      },
    })

    expect(normalized.windowsById[CLASSIC_DIAGNOSTICS_WINDOW_ID]).toBeUndefined()
    expect(visibleWindowIdsInOrder(normalized)).not.toContain(CLASSIC_DIAGNOSTICS_WINDOW_ID)
    expect(checkWorkspaceLayoutInvariants(normalized).ok).toBe(true)
  })

  it('routes orphan durable and running surfaces to rail and drops orphan previews', () => {
    const layout = createClassicFirstRunWorkspaceLayout()
    const file = createFileEditorSurface({ path: '/repo/src/orphan.ts' })
    const terminal = createTerminalSurface({ sessionId: 'terminal-orphan' })
    const preview = createSearchPreviewSurface({
      ownerContextKey: 'result:/repo/src/missing.ts:1',
      ownerSurfaceId: file.id,
    })
    const normalized = normalizeWorkspaceLayout({
      ...layout,
      surfacesById: {
        ...layout.surfacesById,
        [file.id]: file,
        [preview.id]: preview,
        [terminal.id]: terminal,
      },
    })

    expect(normalized.rail.minimizedSurfaceIds).toContain(file.id)
    expect(normalized.rail.runningSurfaceIds).toContain(terminal.id)
    expect(normalized.surfacesById[preview.id]).toBeUndefined()
    expect(checkWorkspaceLayoutInvariants(normalized).ok).toBe(true)
  })

  it('creates a fallback window when restored state has surfaces but no visible root', () => {
    const file = createFileEditorSurface({ path: '/repo/src/fallback.ts' })
    const layout = {
      ...createClassicFirstRunWorkspaceLayout(),
      activeSurfaceId: undefined,
      activeWindowId: undefined,
      nodesById: {},
      rootNodeId: null,
      surfacesById: { [file.id]: file },
      windowsById: {},
    } satisfies WorkspaceLayout
    const normalized = normalizeWorkspaceLayout(layout)

    expect(visibleWindowIdsInOrder(normalized)).toHaveLength(1)
    expect(visibleSurfaceIdsInOrder(normalized)).toEqual([file.id])
    expect(normalized.rail.minimizedSurfaceIds).toEqual([])
    expect(checkWorkspaceLayoutInvariants(normalized).ok).toBe(true)
  })
})

function layoutWithSameAxisSplitAndEmptyWindow(): WorkspaceLayout {
  const layout = createClassicFirstRunWorkspaceLayout()
  const emptyWindowId = workbenchWindowId('normalizer:empty')
  const emptyNodeId = layoutNodeId('normalizer:empty')
  const sameAxisNodeId = layoutNodeId('normalizer:same-axis')
  const placeholderId = layout.activeSurfaceId
  if (!placeholderId) throw new Error('Classic layout missing active placeholder')

  return {
    ...layout,
    activeWindowId: emptyWindowId,
    nodesById: {
      ...layout.nodesById,
      [CLASSIC_ROOT_NODE_ID]: createSplitNode({
        axis: 'horizontal',
        childIds: [CLASSIC_FILE_NAVIGATOR_NODE_ID, sameAxisNodeId],
        id: CLASSIC_ROOT_NODE_ID,
        sizes: [4, Number.NaN],
      }),
      [emptyNodeId]: createWindowNode({
        id: emptyNodeId,
        windowId: emptyWindowId,
      }),
      [sameAxisNodeId]: createSplitNode({
        axis: 'horizontal',
        childIds: [CLASSIC_EDITOR_NODE_ID, emptyNodeId],
        id: sameAxisNodeId,
        sizes: [0],
      }),
    },
    windowsById: {
      ...layout.windowsById,
      [emptyWindowId]: createWorkbenchWindow({
        activeSurfaceId: placeholderId,
        id: emptyWindowId,
        surfaceIds: [],
      }),
    },
  }
}

function sumSizes(sizes: readonly number[]) {
  return sizes.reduce((sum, size) => sum + size, 0)
}
