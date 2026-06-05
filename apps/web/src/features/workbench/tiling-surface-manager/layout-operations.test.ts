import { describe, expect, it } from 'bun:test'

import {
  CLASSIC_EDITOR_NODE_ID,
  CLASSIC_EDITOR_WINDOW_ID,
  CLASSIC_ROOT_NODE_ID,
  createClassicFirstRunWorkspaceLayout,
  createFileEditorSurface,
  createSearchResultsSurface,
} from './layout-builders'
import { checkWorkspaceLayoutInvariants } from './layout-invariants'
import {
  findNodeIdForWindow,
  findWindowIdContainingSurface,
  visibleSurfaceIdsInOrder,
  visibleWindowIdsInOrder,
} from './layout-normalize'
import {
  applyRecipe,
  closeSurface,
  maximizeWindow,
  minimizeSurface,
  moveSurface,
  moveWindow,
  openSurface,
  reorderSurface,
  resizeSplit,
  restoreSurface,
  restoreWindow,
  tabSurface,
} from './layout-operations'
import type { LayoutSplitNode, SurfaceId, WorkspaceLayout } from './layout-types'

describe('tiling surface layout operations', () => {
  it('opens surfaces into tab containers and reorders tabs', () => {
    const fileA = createFileEditorSurface({ path: '/repo/src/a.ts' })
    const fileB = createFileEditorSurface({ path: '/repo/src/b.ts' })
    const opened = openSurface(openSurface(createClassicFirstRunWorkspaceLayout(), fileA), fileB)
    const editorWindow = opened.windowsById[CLASSIC_EDITOR_WINDOW_ID]
    const reordered = reorderSurface(
      opened,
      CLASSIC_EDITOR_WINDOW_ID,
      editorWindow.surfaceIds.indexOf(fileB.id),
      editorWindow.surfaceIds.indexOf(fileA.id),
    )

    expect(reordered.windowsById[CLASSIC_EDITOR_WINDOW_ID].surfaceIds).toEqual([
      editorWindow.surfaceIds[0],
      fileB.id,
      fileA.id,
    ])
    expectValidLayout(reordered)
  })

  it('splits a tab to a window edge and can tab it back into the center', () => {
    const file = createFileEditorSurface({ path: '/repo/src/split.ts' })
    const opened = openSurface(createClassicFirstRunWorkspaceLayout(), file)
    const split = moveSurface(opened, file.id, {
      edge: 'right',
      kind: 'window-edge',
      windowId: CLASSIC_EDITOR_WINDOW_ID,
    })
    const splitWindowId = findWindowIdContainingSurface(split, file.id)
    if (!splitWindowId) throw new Error('Expected split surface to be visible')

    expect(splitWindowId).not.toBe(CLASSIC_EDITOR_WINDOW_ID)
    expect(split.windowsById[splitWindowId].surfaceIds).toEqual([file.id])

    const tabbed = tabSurface(split, file.id, CLASSIC_EDITOR_WINDOW_ID)

    expect(findWindowIdContainingSurface(tabbed, file.id)).toBe(CLASSIC_EDITOR_WINDOW_ID)
    expect(tabbed.windowsById[splitWindowId]).toBeUndefined()
    expectValidLayout(tabbed)
  })

  it('preserves a single-surface window id while repairing edge destinations after source removal', () => {
    const file = createFileEditorSurface({ path: '/repo/src/preserve-window.ts' })
    const split = splitFileFromEditor(createClassicFirstRunWorkspaceLayout(), file)
    const sourceWindowId = mustFindWindowId(split, file.id)
    const moved = moveSurface(split, file.id, {
      edge: 'left',
      kind: 'window-edge',
      windowId: CLASSIC_EDITOR_WINDOW_ID,
    })

    expect(mustFindWindowId(moved, file.id)).toBe(sourceWindowId)
    expectValidLayout(moved)
  })

  it('supports parent-edge drops and rejects self or descendant window moves', () => {
    const file = createFileEditorSurface({ path: '/repo/src/parent-edge.ts' })
    const split = splitFileFromEditor(createClassicFirstRunWorkspaceLayout(), file)
    const fileWindowId = mustFindWindowId(split, file.id)
    const fileNodeId = findNodeIdForWindow(split, fileWindowId)
    if (!fileNodeId) throw new Error('Expected file window node')

    const rejected = moveWindow(split, fileWindowId, {
      edge: 'left',
      kind: 'parent-edge',
      nodeId: fileNodeId,
    })
    const moved = moveWindow(split, fileWindowId, {
      edge: 'bottom',
      kind: 'parent-edge',
      nodeId: CLASSIC_EDITOR_NODE_ID,
    })

    expect(layoutShape(rejected)).toEqual(layoutShape(split))
    expect(mustFindWindowId(moved, file.id)).toBe(fileWindowId)
    expectValidLayout(moved)
  })

  it('minimizes, restores, and closes a last surface without preserving empty windows', () => {
    const file = createFileEditorSurface({ path: '/repo/src/solo.ts' })
    const opened = openSurface(emptyLayout(), file)
    const minimized = minimizeSurface(opened, file.id)
    const restored = restoreSurface(minimized, file.id)
    const closed = closeSurface(restored, file.id)

    expect(visibleWindowIdsInOrder(minimized)).toEqual([])
    expect(minimized.rail.minimizedSurfaceIds).toContain(file.id)
    expect(visibleSurfaceIdsInOrder(restored)).toEqual([file.id])
    expect(closed.rootNodeId).toBeNull()
    expect(closed.surfacesById[file.id]).toBeUndefined()
    expectValidLayout(closed)
  })

  it('falls back to the nearest tab when closing the active surface', () => {
    const fileA = createFileEditorSurface({ path: '/repo/src/close-a.ts' })
    const fileB = createFileEditorSurface({ path: '/repo/src/close-b.ts' })
    const opened = openSurface(openSurface(createClassicFirstRunWorkspaceLayout(), fileA), fileB)
    const closed = closeSurface(opened, fileB.id)

    expect(closed.activeSurfaceId).toBe(fileA.id)
    expect(closed.windowsById[CLASSIC_EDITOR_WINDOW_ID].activeSurfaceId).toBe(fileA.id)
    expectValidLayout(closed)
  })

  it('resizes adjacent split percentages and normalizes the result', () => {
    const resized = resizeSplit(
      createClassicFirstRunWorkspaceLayout(),
      CLASSIC_ROOT_NODE_ID,
      0,
      100,
    )
    const root = resized.nodesById[CLASSIC_ROOT_NODE_ID] as LayoutSplitNode

    expect(root.sizes[0]).toBeCloseTo(0.32)
    expect(root.sizes[1]).toBeCloseTo(0.68)
    expectValidLayout(resized)
  })

  it('prevents singleton duplicates and promotes transient previews in place', () => {
    const search = createSearchResultsSurface()
    const withSearch = openSurface(
      openSurface(createClassicFirstRunWorkspaceLayout(), search),
      search,
    )
    const transientFile = createFileEditorSurface({
      lifecycle: 'transient',
      path: '/repo/src/preview.ts',
    })
    const durableFile = createFileEditorSurface({ path: '/repo/src/preview.ts' })
    const withPreview = openSurface(withSearch, transientFile)
    const promoted = openSurface(withPreview, durableFile)

    expect(
      Object.values(withSearch.surfacesById).filter((surface) => surface.type === 'search-results'),
    ).toHaveLength(1)
    expect(promoted.surfacesById[durableFile.id]?.lifecycle).toBe('durable')
    expect(windowPreviewSurfaceIds(promoted)).not.toContain(durableFile.id)
    expectValidLayout(promoted)
  })

  it('maximizes, restores, and applies existing recipes as pure state updates', () => {
    const maximized = maximizeWindow(
      createClassicFirstRunWorkspaceLayout(),
      CLASSIC_EDITOR_WINDOW_ID,
    )
    const restored = restoreWindow(maximized, CLASSIC_EDITOR_WINDOW_ID)
    const recipeApplied = applyRecipe(restored, restored.activeRecipeId)

    expect(maximized.windowsById[CLASSIC_EDITOR_WINDOW_ID].mode).toBe('maximized')
    expect(restored.windowsById[CLASSIC_EDITOR_WINDOW_ID].mode).toBe('normal')
    expect(recipeApplied.activeRecipeId).toBe(restored.activeRecipeId)
    expectValidLayout(recipeApplied)
  })
})

function splitFileFromEditor(
  layout: WorkspaceLayout,
  file: ReturnType<typeof createFileEditorSurface>,
) {
  return moveSurface(openSurface(layout, file), file.id, {
    edge: 'right',
    kind: 'window-edge',
    windowId: CLASSIC_EDITOR_WINDOW_ID,
  })
}

function emptyLayout(): WorkspaceLayout {
  return {
    ...createClassicFirstRunWorkspaceLayout(),
    activeSurfaceId: undefined,
    activeWindowId: undefined,
    mruSurfaceIds: [],
    mruWindowIds: [],
    nodesById: {},
    rail: {
      minimizedSurfaceIds: [],
      pinnedSurfaceIds: [],
      recipeIds: createClassicFirstRunWorkspaceLayout().rail.recipeIds,
      runningSurfaceIds: [],
      visibleSingletonSurfaceIds: [],
    },
    rootNodeId: null,
    surfacesById: {},
    windowsById: {},
  }
}

function mustFindWindowId(layout: WorkspaceLayout, surfaceId: SurfaceId) {
  const windowId = findWindowIdContainingSurface(layout, surfaceId)
  if (!windowId) throw new Error(`Expected visible surface ${surfaceId}`)

  return windowId
}

function windowPreviewSurfaceIds(layout: WorkspaceLayout) {
  return Object.values(layout.windowsById)
    .map((window) => window.previewSurfaceId)
    .filter(Boolean)
}

function layoutShape(layout: WorkspaceLayout) {
  return {
    activeSurfaceId: layout.activeSurfaceId,
    activeWindowId: layout.activeWindowId,
    nodesById: layout.nodesById,
    rootNodeId: layout.rootNodeId,
    windowsById: layout.windowsById,
  }
}

function expectValidLayout(layout: WorkspaceLayout) {
  expect(checkWorkspaceLayoutInvariants(layout)).toEqual({
    ok: true,
    violations: [],
  })
}
