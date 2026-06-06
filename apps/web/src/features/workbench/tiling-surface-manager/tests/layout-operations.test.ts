import { describe, expect, it } from 'vitest'

import {
  CLASSIC_EDITOR_NODE_ID,
  CLASSIC_EDITOR_WINDOW_ID,
  CLASSIC_ROOT_NODE_ID,
  createClassicFirstRunWorkspaceLayout,
  createFileEditorSurface,
  createGitChangesSurface,
  createSearchPreviewSurface,
  createSearchResultsSurface,
} from '../layout-builders'
import { checkWorkspaceLayoutInvariants } from '../layout-invariants'
import {
  CLASSIC_POLICY_ID,
  fileEditorSurfaceId,
  layoutCommandId,
  windowManagementCommandId,
} from '../layout-ids'
import {
  findNodeIdForWindow,
  findWindowIdContainingSurface,
  visibleSurfaceIdsInOrder,
  visibleWindowIdsInOrder,
} from '../layout-normalize'
import {
  activateSurface,
  applyCustomWindowCommand,
  applyLayoutCommand,
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
} from '../layout-operations'
import type {
  CustomWindowFrame,
  CustomWindowManagementCommand,
  LayoutSplitNode,
  SurfaceId,
  WorkspaceLayout,
  WorkspaceLayoutCommand,
} from '../layout-types'

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

  it('activates existing tabs without recording sticky placement changes', () => {
    const fileA = createFileEditorSurface({ path: '/repo/src/focus-a.ts' })
    const fileB = createFileEditorSurface({ path: '/repo/src/focus-b.ts' })
    const opened = openSurface(openSurface(createClassicFirstRunWorkspaceLayout(), fileA), fileB)
    const stickyPlacement = { edge: 'right', kind: 'root-edge' } as const
    const layout = {
      ...opened,
      policiesById: {
        ...opened.policiesById,
        [CLASSIC_POLICY_ID]: {
          ...opened.policiesById[CLASSIC_POLICY_ID],
          stickyPlacementsBySurfaceId: {
            ...opened.policiesById[CLASSIC_POLICY_ID].stickyPlacementsBySurfaceId,
            [fileA.id]: stickyPlacement,
          },
        },
      },
    } satisfies WorkspaceLayout
    const activated = activateSurface(layout, fileA.id, CLASSIC_EDITOR_WINDOW_ID)

    expect(activated.activeSurfaceId).toBe(fileA.id)
    expect(activated.windowsById[CLASSIC_EDITOR_WINDOW_ID].activeSurfaceId).toBe(fileA.id)
    expect(activated.policiesById[CLASSIC_POLICY_ID].stickyPlacementsBySurfaceId[fileA.id]).toEqual(
      stickyPlacement,
    )
    expectValidLayout(activated)
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

  it('does not close surfaces blocked by close capabilities or close policy', () => {
    const layout = createClassicFirstRunWorkspaceLayout()
    const placeholderId = layout.activeSurfaceId
    if (!placeholderId) throw new Error('Expected placeholder')

    const closed = closeSurface(layout, placeholderId)

    expect(closed.surfacesById[placeholderId]).toBeDefined()
    expect(visibleSurfaceIdsInOrder(closed)).toContain(placeholderId)
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

  it('opens transient search and file previews before normalization can clean orphans', () => {
    const search = createSearchResultsSurface()
    const withSearch = openSurface(createClassicFirstRunWorkspaceLayout(), search)
    const searchPreview = createSearchPreviewSurface({
      ownerContextKey: 'result:/repo/src/app.ts:1',
      ownerSurfaceId: search.id,
      resourceKey: '/repo/src/app.ts',
    })
    const filePreview = createFileEditorSurface({
      lifecycle: 'transient',
      path: '/repo/src/file-preview.ts',
    })
    const withSearchPreview = openSurface(withSearch, searchPreview)
    const withFilePreview = openSurface(withSearchPreview, filePreview)

    expect(withSearchPreview.surfacesById[searchPreview.id]).toBeDefined()
    expect(visibleSurfaceIdsInOrder(withSearchPreview)).toContain(searchPreview.id)
    expect(withFilePreview.surfacesById[searchPreview.id]).toBeUndefined()
    expect(withFilePreview.surfacesById[filePreview.id]).toBeDefined()
    expect(visibleSurfaceIdsInOrder(withFilePreview)).toContain(filePreview.id)
    expectValidLayout(withFilePreview)
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

  it('applies custom window commands and advances command cycling state', () => {
    const command = customWindowCommand({
      cycleRule: {
        resetMs: 1000,
        scope: 'window',
        steps: [frame('left'), frame('right')],
      },
      id: windowManagementCommandId('cycle-halves'),
      targetFrame: frame('left'),
    })
    const first = applyCustomWindowCommand(
      createClassicFirstRunWorkspaceLayout(),
      command,
      CLASSIC_EDITOR_WINDOW_ID,
      10,
    )
    const second = applyCustomWindowCommand(first, command, CLASSIC_EDITOR_WINDOW_ID, 20)

    expect(first.commandCycleState?.stepIndex).toBe(0)
    expect(second.commandCycleState?.stepIndex).toBe(1)
    expect(second.commandCycleState?.commandId).toBe(command.id)
    expectValidLayout(second)
  })

  it('applies saved layout command slots by opening and placing surfaces', () => {
    const filePath = '/repo/src/layout-command.ts'
    const command: WorkspaceLayoutCommand = {
      aliases: ['review layout'],
      enabled: true,
      icon: 'layout',
      id: layoutCommandId('review-layout'),
      slots: [
        {
          frame: frame('right'),
          id: 'editor',
          resourceKey: filePath,
          surfaceType: 'file-editor',
        },
        {
          frame: frame('left'),
          id: 'search',
          surfaceType: 'search-results',
        },
      ],
      title: 'Review Layout',
    }
    const applied = applyLayoutCommand(createClassicFirstRunWorkspaceLayout(), command)

    expect(applied.surfacesById[fileEditorSurfaceId(filePath)]).toBeDefined()
    expect(
      Object.values(applied.surfacesById).some((surface) => surface.type === 'search-results'),
    ).toBe(true)
    expect(visibleSurfaceIdsInOrder(applied)).toContain(fileEditorSurfaceId(filePath))
    expectValidLayout(applied)
  })

  it('allows multiple singleton tool surfaces to be visible at once', () => {
    const layout = createClassicFirstRunWorkspaceLayout()
    const withSearch = openSurface(layout, createSearchResultsSurface())
    const withGit = openSurface(withSearch, createGitChangesSurface())

    expect(visibleSurfaceIdsInOrder(withGit)).toContain(createSearchResultsSurface().id)
    expect(visibleSurfaceIdsInOrder(withGit)).toContain(createGitChangesSurface().id)
    expectValidLayout(withGit)
  })

  it('minimizes and restores singleton tool surfaces from their sticky placement', () => {
    const git = createGitChangesSurface()
    const opened = openSurface(createClassicFirstRunWorkspaceLayout(), git)
    const moved = moveSurface(opened, git.id, {
      edge: 'right',
      kind: 'root-edge',
    })
    const minimized = minimizeSurface(moved, git.id)
    const restored = restoreSurface(minimized, git.id)

    expect(visibleSurfaceIdsInOrder(minimized)).not.toContain(git.id)
    expect(minimized.rail.minimizedSurfaceIds).toContain(git.id)
    expect(visibleSurfaceIdsInOrder(restored)).toContain(git.id)
    expect(mustFindWindowId(restored, git.id)).not.toBe(CLASSIC_EDITOR_WINDOW_ID)
    expectValidLayout(restored)
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

function customWindowCommand(
  patch: Pick<CustomWindowManagementCommand, 'id' | 'targetFrame'> &
    Partial<CustomWindowManagementCommand>,
): CustomWindowManagementCommand {
  return {
    aliases: [],
    category: 'Window Management',
    enabled: true,
    icon: 'window',
    kind: 'custom-window',
    title: 'Custom Window Command',
    ...patch,
  }
}

function frame(anchor: CustomWindowFrame['anchor']): CustomWindowFrame {
  return {
    anchor,
    height: 50,
    offsetX: 0,
    offsetY: 0,
    unit: 'percent',
    width: 50,
  }
}
