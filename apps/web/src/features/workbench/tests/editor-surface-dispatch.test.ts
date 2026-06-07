import { describe, expect, it } from 'vitest'

import { splitEditorWorkspaceLayoutForPaths } from '../../../../test/factories/editor-workspace-layout'
import {
  createChatSurface,
  createClassicFirstRunWorkspaceLayout,
  createFileNavigatorSurface,
} from '@/features/tiling-surface-manager/engine/layout-builders'
import { createWorkspaceLayoutStore } from '@/features/tiling-surface-manager/engine/surface-state'
import { dispatchEditorSurfaceOperation } from '@/features/workbench/utils/editor-surface-dispatch'
import {
  editorSurfaceSerializedState,
  editorGroupIdForWorkbenchWindowId,
} from '@/features/workbench/utils/editor-surface-layout'
import { CLASSIC_POLICY_ID } from '@/features/tiling-surface-manager/engine/layout-ids'
import {
  findWindowIdContainingSurface,
  visibleSurfaceIdsInOrder,
} from '@/features/tiling-surface-manager/engine/layout-normalize'
import {
  closeSurface,
  moveSurface,
} from '@/features/tiling-surface-manager/engine/layout-operations'
import type {
  LayoutNodeId,
  SurfaceId,
  WorkspaceLayout,
} from '@/features/tiling-surface-manager/engine/layout-types'

describe('dispatchEditorSurfaceOperation', () => {
  it('commits renderer-owned resize and maximize operations', () => {
    const layout = splitEditorWorkspaceLayout()
    const store = createWorkspaceLayoutStore(layout)
    const committed: WorkspaceLayout[] = []
    const splitId = editorSplitNodeId(layout)
    const windowId = layout.activeWindowId
    if (!splitId) throw new Error('Expected split layout')
    if (!windowId) throw new Error('Expected active window')

    dispatchEditorSurfaceOperation(
      { deltaPx: 120, handleIndex: 0, splitId, type: 'resizeSplit' },
      {
        commitLayout: (layout) => committed.push(layout),
        requestCloseTab: () => false,
        store,
      },
    )
    dispatchEditorSurfaceOperation(
      { type: 'maximizeWindow', windowId },
      {
        commitLayout: (layout) => committed.push(layout),
        requestCloseTab: () => false,
        store,
      },
    )

    expect(committed).toHaveLength(2)
    expect(committed[0]?.nodesById[splitId]).toMatchObject({
      kind: 'split',
      sizes: [0.62, 0.38],
    })
    expect(committed[1]?.windowsById[windowId]?.mode).toBe('maximized')
  })

  it('routes editor closes through dirty-close request handling', () => {
    const layout = splitEditorWorkspaceLayout()
    const store = createWorkspaceLayoutStore(layout)
    const requestedTabIds: string[] = []
    const committed: WorkspaceLayout[] = []
    const surfaceId = layout.activeSurfaceId
    if (!surfaceId) throw new Error('Expected active surface')

    dispatchEditorSurfaceOperation(
      { surfaceId, type: 'closeSurface' },
      {
        commitLayout: (layout) => committed.push(layout),
        requestCloseTab: (tabId) => {
          requestedTabIds.push(tabId)
          return true
        },
        store,
      },
    )

    expect(requestedTabIds).toEqual([
      editorSurfaceSerializedState(layout.surfacesById[surfaceId])?.editorTabId,
    ])
    expect(committed).toEqual([])
  })

  it('commits rail restores that have stale rail sticky placement', () => {
    const chat = createChatSurface()
    const layout = layoutWithRailStickyPlacement(chat.id)
    const store = createWorkspaceLayoutStore(layout)
    const committed: WorkspaceLayout[] = []

    dispatchEditorSurfaceOperation(
      { surfaceId: chat.id, type: 'restoreSurface' },
      {
        commitLayout: (layout) => committed.push(layout),
        requestCloseTab: () => false,
        store,
      },
    )

    const committedLayout = committed[0]
    if (!committedLayout) throw new Error('Expected committed layout')

    expect(committedLayout.activeSurfaceId).toBe(chat.id)
    expect(committedLayout.rail.backgroundSurfaceIds).not.toContain(chat.id)
    expect(visibleSurfaceIdsInOrder(committedLayout)).toContain(chat.id)
  })

  it('commits rail restores that have stale rail surface placement', () => {
    const chat = createChatSurface()
    const layout = layoutWithRailSurfacePlacement(chat.id)
    const store = createWorkspaceLayoutStore(layout)
    const committed: WorkspaceLayout[] = []

    dispatchEditorSurfaceOperation(
      { surfaceId: chat.id, type: 'restoreSurface' },
      {
        commitLayout: (layout) => committed.push(layout),
        requestCloseTab: () => false,
        store,
      },
    )

    const committedLayout = committed[0]
    expect(committedLayout).toBeDefined()
    expect(committedLayout?.activeSurfaceId).toBe(chat.id)
    expect(committedLayout?.rail.backgroundSurfaceIds).not.toContain(chat.id)
    expect(visibleSurfaceIdsInOrder(committedLayout)).toContain(chat.id)
  })

  it('commits rail restores that have stale window surface placement', () => {
    const chat = createChatSurface()
    const layout = layoutWithStaleWindowSurfacePlacement(chat.id)
    const store = createWorkspaceLayoutStore(layout)
    const committed: WorkspaceLayout[] = []

    dispatchEditorSurfaceOperation(
      { surfaceId: chat.id, type: 'restoreSurface' },
      {
        commitLayout: (layout) => committed.push(layout),
        requestCloseTab: () => false,
        store,
      },
    )

    const committedLayout = committed[0]
    expect(committedLayout).toBeDefined()
    expect(committedLayout?.activeSurfaceId).toBe(chat.id)
    expect(committedLayout?.rail.backgroundSurfaceIds).not.toContain(chat.id)
    expect(visibleSurfaceIdsInOrder(committedLayout)).toContain(chat.id)
  })

  it('commits files rail restores that have stale window surface placement', () => {
    const fileNavigator = createFileNavigatorSurface()
    const layout = layoutWithStaleFilesWindowSurfacePlacement()
    const store = createWorkspaceLayoutStore(layout)
    const committed: WorkspaceLayout[] = []

    dispatchEditorSurfaceOperation(
      { surfaceId: fileNavigator.id, type: 'restoreSurface' },
      {
        commitLayout: (layout) => committed.push(layout),
        requestCloseTab: () => false,
        store,
      },
    )

    const committedLayout = committed[0]
    expect(committedLayout).toBeDefined()
    expect(committedLayout?.activeSurfaceId).toBe(fileNavigator.id)
    expect(committedLayout?.rail.backgroundSurfaceIds).not.toContain(fileNavigator.id)
    expect(visibleSurfaceIdsInOrder(committedLayout)).toContain(fileNavigator.id)
  })
})

function layoutWithRailStickyPlacement(surfaceId: SurfaceId): WorkspaceLayout {
  const layout = createClassicFirstRunWorkspaceLayout()

  return {
    ...layout,
    policiesById: {
      ...layout.policiesById,
      [CLASSIC_POLICY_ID]: {
        ...layout.policiesById[CLASSIC_POLICY_ID],
        stickyPlacementsBySurfaceId: {
          [surfaceId]: { kind: 'rail' },
        },
      },
    },
  }
}

function layoutWithRailSurfacePlacement(surfaceId: SurfaceId): WorkspaceLayout {
  const layout = createClassicFirstRunWorkspaceLayout()
  const surface = layout.surfacesById[surfaceId]
  if (!surface) return layout

  return {
    ...layout,
    surfacesById: {
      ...layout.surfacesById,
      [surfaceId]: {
        ...surface,
        placement: { kind: 'rail' },
      },
    },
  }
}

function layoutWithStaleWindowSurfacePlacement(surfaceId: SurfaceId): WorkspaceLayout {
  const fileNavigator = createFileNavigatorSurface()
  const layout = createClassicFirstRunWorkspaceLayout()
  const surface = layout.surfacesById[surfaceId]
  const targetWindowId = findWindowIdContainingSurface(layout, fileNavigator.id)
  if (!surface || !targetWindowId) return layout

  const withStalePlacement = {
    ...layout,
    surfacesById: {
      ...layout.surfacesById,
      [surfaceId]: {
        ...surface,
        placement: { kind: 'window-center', windowId: targetWindowId },
      },
    },
  }

  return closeSurface(withStalePlacement, fileNavigator.id)
}

function layoutWithStaleFilesWindowSurfacePlacement(): WorkspaceLayout {
  const fileNavigator = createFileNavigatorSurface()
  const layout = createClassicFirstRunWorkspaceLayout()
  const surface = layout.surfacesById[fileNavigator.id]
  const targetWindowId = findWindowIdContainingSurface(layout, fileNavigator.id)
  if (!surface || !targetWindowId) return layout

  const withStalePlacement = {
    ...layout,
    surfacesById: {
      ...layout.surfacesById,
      [fileNavigator.id]: {
        ...surface,
        placement: { kind: 'window-center', windowId: targetWindowId },
      },
    },
  }

  return backgroundSurface(withStalePlacement, fileNavigator.id)
}

function splitEditorWorkspaceLayout() {
  return splitEditorWorkspaceLayoutForPaths({
    activePath: '/repo/src/b.ts',
    leftPaths: ['/repo/src/a.ts'],
    rightPaths: ['/repo/src/b.ts'],
  })
}

function backgroundSurface(layout: WorkspaceLayout, surfaceId: SurfaceId) {
  return moveSurface(layout, surfaceId, { kind: 'background' })
}

function editorSplitNodeId(layout: WorkspaceLayout): LayoutNodeId | null {
  for (const node of Object.values(layout.nodesById)) {
    if (node.kind !== 'split') continue
    if (!node.childIds.every((nodeId) => editorWindowNode(layout, nodeId))) continue

    return node.id
  }

  return null
}

function editorWindowNode(layout: WorkspaceLayout, nodeId: LayoutNodeId) {
  const node = layout.nodesById[nodeId]
  if (!node || node.kind !== 'window') return false

  return Boolean(editorGroupIdForWorkbenchWindowId(node.windowId))
}
