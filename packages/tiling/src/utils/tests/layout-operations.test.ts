import { describe, expect, it } from 'vitest'

import {
  CLASSIC_DIAGNOSTICS_WINDOW_ID,
  CLASSIC_EDITOR_NODE_ID,
  CLASSIC_EDITOR_WINDOW_ID,
  CLASSIC_FILE_NAVIGATOR_WINDOW_ID,
  CLASSIC_MAIN_NODE_ID,
  CLASSIC_ROOT_NODE_ID,
  createClassicFirstRunWorkspaceLayout,
  createEmptyWorkspaceLayout,
  createChatSurface,
  createDiagnosticsSurface,
  createFileNavigatorSurface,
  createFileEditorSurface,
  createGitChangesSurface,
  createLogsSurface,
  createSearchPreviewSurface,
  createSearchResultsSurface,
  createSplitNode,
  createTerminalSurface,
  createWindowNode,
  createWorkbenchWindow,
} from '@workspace/tiling/utils/layout-builders'
import { defaultWindowManagementHotkeyPresets } from '@workspace/tiling/utils/layout-command-presets'
import { checkWorkspaceLayoutInvariants } from '@workspace/tiling/utils/layout-invariants'
import {
  CLASSIC_POLICY_ID,
  diagnosticsSurfaceId,
  fileEditorSurfaceId,
  gitChangesSurfaceId,
  layoutNodeId,
  layoutCommandId,
  REVIEW_LAYOUT_COMMAND_ID,
  REVIEW_RECIPE_ID,
  searchResultsSurfaceId,
  workbenchWindowId,
  windowManagementCommandId,
} from '@workspace/tiling/utils/layout-ids'
import {
  findParentNodeId,
  findNodeIdForWindow,
  findWindowIdContainingSurface,
  visibleSurfaceIdsInOrder,
  visibleWindowIdsInOrder,
} from '@workspace/tiling/utils/layout-normalize'
import { deriveLayoutGeometry } from '@workspace/tiling/utils/layout-geometry'
import {
  activateSurface,
  applyLayoutOperation,
  applyCustomWindowCommand,
  applyLayoutCommand,
  applyRecipe,
  closeSurface,
  collapseWindow,
  expandWindow,
  maximizeWindow,
  moveSurface,
  moveWindow,
  openSurface,
  reorderSurface,
  resizeSplit,
  restoreSurface,
  restoreWindow,
  tabSurface,
} from '@workspace/tiling/utils/layout-operations'
import {
  bottomPaneSurfaceVisibilityItems,
  bottomPaneSurfaceVisibilityOperation,
} from '@workspace/tiling/utils/bottom-pane-model'
import {
  isWorkbenchRailBottomPaneItem,
  railItemOperation,
  selectWorkbenchRailItems,
  selectWorkbenchRailRecipeItems,
  selectWorkbenchRailSurfaceItems,
} from '@workspace/tiling/utils/rail-model'
import type {
  CustomWindowFrame,
  CustomWindowManagementCommand,
  LayoutSplitNode,
  SurfaceId,
  SurfaceType,
  WindowId,
  WorkspaceLayout,
  WorkspaceLayoutCommand,
} from '@workspace/tiling/utils/layout-types'

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

  it('merges a multi-tab window into another window center', () => {
    const fileA = createFileEditorSurface({ path: '/repo/src/merge-a.ts' })
    const fileB = createFileEditorSurface({ path: '/repo/src/merge-b.ts' })
    const split = splitFileFromEditor(createClassicFirstRunWorkspaceLayout(), fileA)
    const sourceWindowId = mustFindWindowId(split, fileA.id)
    const tabbed = tabSurface(openSurface(split, fileB), fileB.id, sourceWindowId)
    const sourceSurfaceIds = tabbed.windowsById[sourceWindowId].surfaceIds
    const targetSurfaceIds = tabbed.windowsById[CLASSIC_EDITOR_WINDOW_ID].surfaceIds
    const merged = moveWindow(tabbed, sourceWindowId, {
      kind: 'window-center',
      windowId: CLASSIC_EDITOR_WINDOW_ID,
    })

    expect(merged.windowsById[sourceWindowId]).toBeUndefined()
    expect(visibleWindowIdsInOrder(merged)).not.toContain(sourceWindowId)
    expect(merged.windowsById[CLASSIC_EDITOR_WINDOW_ID].surfaceIds).toEqual([
      ...targetSurfaceIds,
      ...sourceSurfaceIds,
    ])
    expectValidLayout(merged)
  })

  it('reorders same-split windows without resizing them', () => {
    const layout = threeColumnLayoutWithSizes([0.2, 0.3, 0.5])
    const moved = moveWindow(layout, workbenchWindowId('test:c'), {
      edge: 'right',
      kind: 'window-edge',
      windowId: workbenchWindowId('test:a'),
    })
    const root = moved.nodesById[layoutNodeId('test:root')]
    if (!root || root.kind !== 'split') throw new Error('Expected test root split')

    expect(root.childIds).toEqual([
      layoutNodeId('test:a'),
      layoutNodeId('test:c'),
      layoutNodeId('test:b'),
    ])
    expect(root.sizes[0]).toBeCloseTo(0.2)
    expect(root.sizes[1]).toBeCloseTo(0.5)
    expect(root.sizes[2]).toBeCloseTo(0.3)
    expectValidLayout(moved)
  })

  it('supports parent-edge snaps and rejects self or descendant window moves', () => {
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

  it('collapses and expands windows without removing them from the split tree', () => {
    const file = createFileEditorSurface({ path: '/repo/src/collapsible.ts' })
    const opened = openSurface(emptyLayout(), file)
    const windowId = mustFindWindowId(opened, file.id)
    const collapsed = collapseWindow(opened, windowId)
    const expanded = expandWindow(collapsed, windowId)

    expect(collapsed.windowsById[windowId]?.mode).toBe('collapsed')
    expect(visibleWindowIdsInOrder(collapsed)).toEqual([windowId])
    expect(visibleSurfaceIdsInOrder(collapsed)).toEqual([file.id])
    expect(expanded.windowsById[windowId]?.mode).toBe('normal')
    expectValidLayout(expanded)
  })

  it('stores explicit collapsed edges and clears them on expand', () => {
    const file = createFileEditorSurface({ path: '/repo/src/collapsible-edge.ts' })
    const opened = openSurface(emptyLayout(), file)
    const windowId = mustFindWindowId(opened, file.id)
    const collapsed = collapseWindow(opened, windowId, 'left')
    const retargeted = collapseWindow(collapsed, windowId, 'bottom')
    const expanded = expandWindow(collapsed, windowId)

    expect(collapsed.windowsById[windowId]?.mode).toBe('collapsed')
    expect(collapsed.windowsById[windowId]?.collapsedEdge).toBe('left')
    expect(retargeted.windowsById[windowId]?.mode).toBe('collapsed')
    expect(retargeted.windowsById[windowId]?.collapsedEdge).toBe('bottom')
    expect(expanded.windowsById[windowId]?.mode).toBe('normal')
    expect(expanded.windowsById[windowId]?.collapsedEdge).toBeUndefined()
    expectValidLayout(expanded)
  })

  it('moves surfaces to background and restores recipe-slot snaps through concrete placement', () => {
    const git = createGitChangesSurface()
    const opened = openSurface(createClassicFirstRunWorkspaceLayout(), git)
    const backgrounded = moveSurface(opened, git.id, { kind: 'background' })
    const restored = moveSurface(backgrounded, git.id, {
      kind: 'recipe-slot',
      slot: 'left-tool-pane',
    })

    expect(visibleSurfaceIdsInOrder(backgrounded)).not.toContain(git.id)
    expect(backgrounded.rail.backgroundSurfaceIds).toContain(git.id)
    expect(visibleSurfaceIdsInOrder(restored)).toContain(git.id)
    expect(restored.rail.backgroundSurfaceIds).not.toContain(git.id)
    expectValidLayout(restored)
  })

  it('backgrounds, restores, and closes a last surface without preserving empty windows', () => {
    const file = createFileEditorSurface({ path: '/repo/src/solo.ts' })
    const opened = openSurface(emptyLayout(), file)
    const backgrounded = backgroundSurface(opened, file.id)
    const restored = restoreSurface(backgrounded, file.id)
    const closed = closeSurface(restored, file.id)

    expect(visibleWindowIdsInOrder(backgrounded)).toEqual([])
    expect(backgrounded.rail.backgroundSurfaceIds).toContain(file.id)
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

  it('uses a measured pixel reference when resizing splits', () => {
    const resized = resizeSplit(
      createClassicFirstRunWorkspaceLayout(),
      CLASSIC_ROOT_NODE_ID,
      0,
      100,
      500,
    )
    const root = resized.nodesById[CLASSIC_ROOT_NODE_ID] as LayoutSplitNode

    expect(root.sizes[0]).toBeCloseTo(0.42)
    expect(root.sizes[1]).toBeCloseTo(0.58)
    expectValidLayout(resized)
  })

  it('preserves content-aware resize minimums for tools and terminal panes', () => {
    const narrowToolPane = resizeSplit(
      createClassicFirstRunWorkspaceLayout(),
      CLASSIC_ROOT_NODE_ID,
      0,
      -1000,
    )
    const shortTerminalPane = resizeSplit(
      createClassicFirstRunWorkspaceLayout(),
      CLASSIC_MAIN_NODE_ID,
      0,
      1000,
    )
    const root = narrowToolPane.nodesById[CLASSIC_ROOT_NODE_ID] as LayoutSplitNode
    const main = shortTerminalPane.nodesById[CLASSIC_MAIN_NODE_ID] as LayoutSplitNode

    expect(root.sizes[0]).toBeCloseTo(0.14)
    expect(main.sizes[1]).toBeCloseTo(0.16)
    expectValidLayout(narrowToolPane)
    expectValidLayout(shortTerminalPane)
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

  it('applies workflow recipes without resetting the classic split shape', () => {
    const layout = createClassicFirstRunWorkspaceLayout()
    const review = applyRecipe(layout, REVIEW_RECIPE_ID)

    expect(review.activeRecipeId).toBe(REVIEW_RECIPE_ID)
    expect(review.rootNodeId).toBe(CLASSIC_ROOT_NODE_ID)
    expect(review.rail.recipeIds).toContain(REVIEW_RECIPE_ID)
    expectValidLayout(review)
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

  it('applies custom window command frame size as a split ratio', () => {
    const command = customWindowCommand({
      id: windowManagementCommandId('left-third'),
      targetFrame: frame('left', { height: 100, width: 33.333 }),
    })
    const applied = applyCustomWindowCommand(
      createClassicFirstRunWorkspaceLayout(),
      command,
      CLASSIC_EDITOR_WINDOW_ID,
    )

    expectWindowSplitRatio(applied, CLASSIC_EDITOR_WINDOW_ID, 0.333)
    expectValidLayout(applied)
  })

  it('applies centered custom window command frames to the current split axis', () => {
    const command = customWindowCommand({
      id: windowManagementCommandId('centered-width'),
      targetFrame: frame('center', { height: 70, width: 60 }),
    })
    const applied = applyCustomWindowCommand(
      createClassicFirstRunWorkspaceLayout(),
      command,
      CLASSIC_EDITOR_WINDOW_ID,
    )

    expectWindowSplitRatio(applied, CLASSIC_EDITOR_WINDOW_ID, 0.7)
    expectValidLayout(applied)
  })

  it('includes custom window command frame offsets in the split ratio', () => {
    const command = customWindowCommand({
      id: windowManagementCommandId('offset-left'),
      targetFrame: frame('left', { offsetX: 10, width: 30 }),
    })
    const applied = applyCustomWindowCommand(
      createClassicFirstRunWorkspaceLayout(),
      command,
      CLASSIC_EDITOR_WINDOW_ID,
    )

    expectWindowSplitRatio(applied, CLASSIC_EDITOR_WINDOW_ID, 0.4)
    expectValidLayout(applied)
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
    expectWindowSplitRatioGreaterThan(
      applied,
      mustFindWindowId(applied, fileEditorSurfaceId(filePath)),
      0.45,
    )
    expectValidLayout(applied)
  })

  it('applies saved workflow layout commands with their recipe and focus order', () => {
    const layout = createClassicFirstRunWorkspaceLayout()
    const command = layout.layoutCommandsById[REVIEW_LAYOUT_COMMAND_ID]
    if (!command) throw new Error('Expected default review layout command')

    const applied = applyLayoutCommand(layout, command)

    expect(applied.activeRecipeId).toBe(REVIEW_RECIPE_ID)
    expect(applied.activeSurfaceId).toBe(gitChangesSurfaceId())
    expect(applied.rail.recipeIds).toContain(REVIEW_RECIPE_ID)
    expect(visibleSurfaceIdsInOrder(applied)).toEqual(
      expect.arrayContaining([searchResultsSurfaceId(), gitChangesSurfaceId()]),
    )
    expectWindowSplitRatio(applied, mustFindWindowId(applied, gitChangesSurfaceId()), 0.28)
    expectWindowSplitRatio(applied, mustFindWindowId(applied, diagnosticsSurfaceId()), 0.28)
    expectValidLayout(applied)
  })

  it('upserts editable command definitions and applies active hotkey presets', () => {
    const customCommand = customWindowCommand({
      id: windowManagementCommandId('palette-left-half'),
      targetFrame: frame('left'),
    })
    const layoutCommand: WorkspaceLayoutCommand = {
      aliases: ['palette layout'],
      enabled: true,
      icon: 'layout',
      id: layoutCommandId('palette-layout'),
      slots: [
        {
          frame: frame('left'),
          id: 'search',
          surfaceType: 'search-results',
        },
      ],
      title: 'Palette Layout',
    }
    const preset = defaultWindowManagementHotkeyPresets()[1]
    if (!preset) throw new Error('Expected default hotkey preset')

    const withCustomCommand = applyLayoutOperation(createClassicFirstRunWorkspaceLayout(), {
      command: customCommand,
      type: 'upsertCustomWindowCommand',
    })
    const withLayoutCommand = applyLayoutOperation(withCustomCommand, {
      command: layoutCommand,
      type: 'upsertLayoutCommand',
    })
    const withPreset = applyLayoutOperation(withLayoutCommand, {
      preset,
      type: 'applyHotkeyPreset',
    })

    expect(withPreset.windowCommandsById[customCommand.id]).toEqual(customCommand)
    expect(withPreset.layoutCommandsById[layoutCommand.id]).toEqual(layoutCommand)
    expect(withPreset.activeHotkeyPresetId).toBe(preset.id)
    expect(withPreset.hotkeyPresetsById[preset.id]).toEqual(preset)
    expectValidLayout(withPreset)
  })

  it('allows multiple singleton tool surfaces to be visible at once', () => {
    const layout = createClassicFirstRunWorkspaceLayout()
    const withSearch = openSurface(layout, createSearchResultsSurface())
    const withGit = openSurface(withSearch, createGitChangesSurface())

    expect(visibleSurfaceIdsInOrder(withGit)).toContain(createSearchResultsSurface().id)
    expect(visibleSurfaceIdsInOrder(withGit)).toContain(createGitChangesSurface().id)
    expectValidLayout(withGit)
  })

  it('backgrounds and restores singleton tool surfaces from their sticky placement', () => {
    const git = createGitChangesSurface()
    const opened = openSurface(createClassicFirstRunWorkspaceLayout(), git)
    const moved = moveSurface(opened, git.id, {
      edge: 'right',
      kind: 'root-edge',
    })
    const backgrounded = backgroundSurface(moved, git.id)
    const restored = restoreSurface(backgrounded, git.id)

    expect(visibleSurfaceIdsInOrder(backgrounded)).not.toContain(git.id)
    expect(backgrounded.rail.backgroundSurfaceIds).toContain(git.id)
    expect(visibleSurfaceIdsInOrder(restored)).toContain(git.id)
    expect(mustFindWindowId(restored, git.id)).not.toBe(CLASSIC_EDITOR_WINDOW_ID)
    expectValidLayout(restored)
  })

  it('ignores rail sticky placement when restoring backgrounded rail surfaces', () => {
    const chat = createChatSurface()
    const base = createClassicFirstRunWorkspaceLayout()
    const layout = {
      ...base,
      policiesById: {
        ...base.policiesById,
        [CLASSIC_POLICY_ID]: {
          ...base.policiesById[CLASSIC_POLICY_ID],
          stickyPlacementsBySurfaceId: {
            [chat.id]: { kind: 'rail' },
          },
        },
      },
    } satisfies WorkspaceLayout
    const restored = restoreSurface(layout, chat.id)

    expect(restored.rail.backgroundSurfaceIds).not.toContain(chat.id)
    expect(restored.activeSurfaceId).toBe(chat.id)
    expect(
      restored.policiesById[CLASSIC_POLICY_ID].stickyPlacementsBySurfaceId[chat.id],
    ).toBeUndefined()
    expect(visibleSurfaceIdsInOrder(restored)).toContain(chat.id)
    expectValidLayout(restored)
  })

  it('ignores rail surface placement when restoring backgrounded rail surfaces', () => {
    const chat = createChatSurface()
    const base = createClassicFirstRunWorkspaceLayout()
    const layout = {
      ...base,
      surfacesById: {
        ...base.surfacesById,
        [chat.id]: {
          ...chat,
          placement: { kind: 'rail' },
        },
      },
    } satisfies WorkspaceLayout
    const restored = restoreSurface(layout, chat.id)

    expect(restored.rail.backgroundSurfaceIds).not.toContain(chat.id)
    expect(restored.activeSurfaceId).toBe(chat.id)
    expect(visibleSurfaceIdsInOrder(restored)).toContain(chat.id)
    expectValidLayout(restored)
  })

  it('ignores stale window surface placement when restoring backgrounded rail surfaces', () => {
    const chat = createChatSurface()
    const base = createClassicFirstRunWorkspaceLayout()
    const layout = {
      ...base,
      surfacesById: {
        ...base.surfacesById,
        [chat.id]: {
          ...chat,
          placement: {
            kind: 'window-center',
            windowId: mustFindWindowId(base, createFileNavigatorSurface().id),
          },
        },
      },
    } satisfies WorkspaceLayout
    const withoutTargetWindow = closeSurface(layout, createFileNavigatorSurface().id)
    const restored = restoreSurface(withoutTargetWindow, chat.id)

    expect(restored.rail.backgroundSurfaceIds).not.toContain(chat.id)
    expect(restored.activeSurfaceId).toBe(chat.id)
    expect(visibleSurfaceIdsInOrder(restored)).toContain(chat.id)
    expectValidLayout(restored)
  })

  it('ignores stale window surface placement when restoring files from the rail', () => {
    const fileNavigator = createFileNavigatorSurface()
    const base = createClassicFirstRunWorkspaceLayout()
    const fileWindowId = mustFindWindowId(base, fileNavigator.id)
    const layout = {
      ...base,
      surfacesById: {
        ...base.surfacesById,
        [fileNavigator.id]: {
          ...fileNavigator,
          placement: { kind: 'window-center', windowId: fileWindowId },
        },
      },
    } satisfies WorkspaceLayout
    const backgrounded = backgroundSurface(layout, fileNavigator.id)
    const restored = restoreSurface(backgrounded, fileNavigator.id)

    expect(restored.rail.backgroundSurfaceIds).not.toContain(fileNavigator.id)
    expect(restored.activeSurfaceId).toBe(fileNavigator.id)
    expect(visibleSurfaceIdsInOrder(restored)).toContain(fileNavigator.id)
    expectValidLayout(restored)
  })

  it('ignores stale sticky placement when opening missing default rail surfaces', () => {
    const chat = createChatSurface()
    const base = createClassicFirstRunWorkspaceLayout()
    const surfacesById = { ...base.surfacesById }
    delete surfacesById[chat.id]
    const layout = {
      ...base,
      policiesById: {
        ...base.policiesById,
        [CLASSIC_POLICY_ID]: {
          ...base.policiesById[CLASSIC_POLICY_ID],
          stickyPlacementsBySurfaceId: {
            [chat.id]: {
              kind: 'window-center',
              windowId: workbenchWindowId('missing'),
            },
          },
        },
      },
      rail: {
        ...base.rail,
        backgroundSurfaceIds: base.rail.backgroundSurfaceIds.filter((id) => id !== chat.id),
        pinnedSurfaceIds: base.rail.pinnedSurfaceIds.filter((id) => id !== chat.id),
      },
      surfacesById,
    } satisfies WorkspaceLayout
    const item = mustFindRailItem(selectWorkbenchRailSurfaceItems(layout), chat.id)
    const opened = applyLayoutOperation(layout, railItemOperation(layout, item))

    expect(opened.rail.backgroundSurfaceIds).not.toContain(chat.id)
    expect(
      opened.policiesById[CLASSIC_POLICY_ID].stickyPlacementsBySurfaceId[chat.id],
    ).toBeUndefined()
    expect(visibleSurfaceIdsInOrder(opened)).toContain(chat.id)
    expect(mustFindWindowId(opened, chat.id)).not.toBe(CLASSIC_DIAGNOSTICS_WINDOW_ID)
    expectValidLayout(opened)
  })

  it('clears sticky placements that are invalid for the surface capabilities', () => {
    const search = createSearchResultsSurface()
    const preview = createSearchPreviewSurface({
      ownerContextKey: 'result:/repo/src/app.ts:1',
      ownerSurfaceId: search.id,
      resourceKey: '/repo/src/app.ts',
    })
    const searchOpened = openSurface(createClassicFirstRunWorkspaceLayout(), search)
    const layout = {
      ...searchOpened,
      policiesById: {
        ...searchOpened.policiesById,
        [CLASSIC_POLICY_ID]: {
          ...searchOpened.policiesById[CLASSIC_POLICY_ID],
          stickyPlacementsBySurfaceId: {
            ...searchOpened.policiesById[CLASSIC_POLICY_ID].stickyPlacementsBySurfaceId,
            [preview.id]: { kind: 'recipe-slot', slot: 'left-tool-pane' },
          },
        },
      },
    } satisfies WorkspaceLayout
    const restored = openSurface(layout, preview)
    const restoredSticky =
      restored.policiesById[CLASSIC_POLICY_ID].stickyPlacementsBySurfaceId[preview.id]

    expect(restoredSticky).not.toMatchObject({ kind: 'recipe-slot', slot: 'left-tool-pane' })
    expect(preview.capabilities.validPlacements).toContain(restoredSticky?.kind)
    expect(visibleSurfaceIdsInOrder(restored)).toContain(preview.id)
    expectValidLayout(restored)
  })

  it('clears sticky recipe-slot placements that violate the active recipe slot', () => {
    const terminal = createTerminalSurface({ sessionId: 'terminal-1' })
    const base = createClassicFirstRunWorkspaceLayout()
    const layout = {
      ...base,
      policiesById: {
        ...base.policiesById,
        [CLASSIC_POLICY_ID]: {
          ...base.policiesById[CLASSIC_POLICY_ID],
          stickyPlacementsBySurfaceId: {
            ...base.policiesById[CLASSIC_POLICY_ID].stickyPlacementsBySurfaceId,
            [terminal.id]: { kind: 'recipe-slot', slot: 'left-tool-pane' },
          },
        },
      },
    } satisfies WorkspaceLayout
    const restored = restoreSurface(layout, terminal.id)
    const restoredSticky =
      restored.policiesById[CLASSIC_POLICY_ID].stickyPlacementsBySurfaceId[terminal.id]

    expect(restoredSticky).not.toMatchObject({ kind: 'recipe-slot', slot: 'left-tool-pane' })
    expect(visibleSurfaceIdsInOrder(restored)).toContain(terminal.id)
    expectValidLayout(restored)
  })

  it('opens main surfaces above the bottom tool pane when no main view is visible', () => {
    const fileNavigator = createFileNavigatorSurface()
    const file = createFileEditorSurface({ path: '/repo/src/bottom-only.ts' })
    const base = createClassicFirstRunWorkspaceLayout()
    const placeholderId = firstSurfaceIdOfType(base, 'placeholder')
    if (!placeholderId) throw new Error('Expected editor placeholder')

    const withoutFileNavigator = closeSurface(base, fileNavigator.id)
    const bottomOnly = closeSurface(withoutFileNavigator, placeholderId, { force: true })
    const opened = openSurface(bottomOnly, file)

    expect(visibleSurfaceIdsInOrder(opened)).toContain(file.id)
    expect(visibleSurfaceIdsInOrder(opened)).toContain(
      createTerminalSurface({ sessionId: 'terminal-1' }).id,
    )
    expect(mustFindWindowId(opened, file.id)).not.toBe(CLASSIC_DIAGNOSTICS_WINDOW_ID)
    expect(findNodeIdForWindow(opened, CLASSIC_DIAGNOSTICS_WINDOW_ID)).toBeDefined()
    expectValidLayout(opened)
  })

  it('nests the bottom recipe slot under the editor main panel beside left tools', () => {
    const layout = createClassicFirstRunWorkspaceLayout()
    const editorNodeId = findNodeIdForWindow(layout, CLASSIC_EDITOR_WINDOW_ID)
    const bottomNodeId = findNodeIdForWindow(layout, CLASSIC_DIAGNOSTICS_WINDOW_ID)
    const fileNavigatorNodeId = findNodeIdForWindow(layout, CLASSIC_FILE_NAVIGATOR_WINDOW_ID)
    if (!editorNodeId || !bottomNodeId || !fileNavigatorNodeId) {
      throw new Error('Expected classic recipe windows')
    }

    const editorParentId = findParentNodeId(layout, editorNodeId)
    const bottomParentId = findParentNodeId(layout, bottomNodeId)
    const fileNavigatorParentId = findParentNodeId(layout, fileNavigatorNodeId)
    const mainPanelNode = bottomParentId ? layout.nodesById[bottomParentId] : null

    expect(bottomParentId).toBe(editorParentId)
    expect(bottomParentId).not.toBe(fileNavigatorParentId)
    expect(mainPanelNode).toMatchObject({
      axis: 'vertical',
      childIds: [editorNodeId, bottomNodeId],
      kind: 'split',
    })
    expectValidLayout(layout)
  })

  it('closes the active terminal window from the terminal rail item', () => {
    const terminal = createTerminalSurface({ sessionId: 'terminal-1' })
    const layout = activateSurface(
      createClassicFirstRunWorkspaceLayout(),
      terminal.id,
      CLASSIC_DIAGNOSTICS_WINDOW_ID,
    )
    const item = mustFindBottomPaneRailItem(layout)

    expect(railItemOperation(layout, item)).toEqual({
      destination: { kind: 'background' },
      type: 'moveWindow',
      windowId: CLASSIC_DIAGNOSTICS_WINDOW_ID,
    })
  })

  it('closes the bottom pane from the terminal rail item when problems is active', () => {
    const diagnostics = createDiagnosticsSurface()
    const layout = activateSurface(
      createClassicFirstRunWorkspaceLayout(),
      diagnostics.id,
      CLASSIC_DIAGNOSTICS_WINDOW_ID,
    )
    const item = mustFindBottomPaneRailItem(layout)

    expect(item.state).toBe('active')
    expect(railItemOperation(layout, item)).toEqual({
      destination: { kind: 'background' },
      type: 'moveWindow',
      windowId: CLASSIC_DIAGNOSTICS_WINDOW_ID,
    })
  })

  it('does not expose diagnostics or terminal as normal rail items', () => {
    const diagnostics = createDiagnosticsSurface()
    const terminal = createTerminalSurface({ sessionId: 'terminal-1' })
    const layout = createClassicFirstRunWorkspaceLayout()
    const items = selectWorkbenchRailSurfaceItems(layout)

    expect(items.some((candidate) => candidate.surface.id === diagnostics.id)).toBe(false)
    expect(items.some((candidate) => candidate.surface.id === terminal.id)).toBe(false)
    expect(mustFindBottomPaneRailItem(layout).state).toBe('visible')
  })

  it('restores the preserved terminal surface when the bottom pane is hidden', () => {
    const terminal = createTerminalSurface({ sessionId: 'terminal-1' })
    const diagnostics = createDiagnosticsSurface()
    let layout = createClassicFirstRunWorkspaceLayout()
    layout = moveSurface(layout, terminal.id, { kind: 'background' })
    layout = moveSurface(layout, diagnostics.id, { kind: 'background' })
    const item = mustFindBottomPaneRailItem(layout)

    expect(railItemOperation(layout, item)).toEqual({
      placement: { kind: 'recipe-slot', slot: 'bottom' },
      surfaceId: terminal.id,
      type: 'restoreSurface',
    })
  })

  it('hides and restores bottom pane tabs through visibility operations', () => {
    const terminal = createTerminalSurface({ sessionId: 'terminal-1' })
    const items = bottomPaneSurfaceVisibilityItems(
      createClassicFirstRunWorkspaceLayout(),
      CLASSIC_DIAGNOSTICS_WINDOW_ID,
    )
    const terminalItem = items.find((item) => item.surface.id === terminal.id)
    if (!terminalItem) throw new Error('Expected terminal visibility item')

    const hideOperation = bottomPaneSurfaceVisibilityOperation(terminalItem, false)
    if (!hideOperation) throw new Error('Expected terminal hide operation')

    const hidden = applyLayoutOperation(createClassicFirstRunWorkspaceLayout(), hideOperation)
    expect(hidden.surfacesById[terminal.id]).toBeDefined()
    expect(hidden.rail.runningSurfaceIds).toContain(terminal.id)
    expect(visibleSurfaceIdsInOrder(hidden)).not.toContain(terminal.id)

    const hiddenItems = bottomPaneSurfaceVisibilityItems(hidden, CLASSIC_DIAGNOSTICS_WINDOW_ID)
    const hiddenTerminalItem = hiddenItems.find((item) => item.surface.id === terminal.id)
    const onlyVisibleItem = hiddenItems.find((item) => item.checked)
    if (!hiddenTerminalItem) throw new Error('Expected hidden terminal visibility item')
    if (!onlyVisibleItem) throw new Error('Expected one visible bottom pane item')

    expect(onlyVisibleItem.disabled).toBe(true)
    expect(bottomPaneSurfaceVisibilityOperation(onlyVisibleItem, false)).toBeNull()
    expect(bottomPaneSurfaceVisibilityOperation(hiddenTerminalItem, true)).toEqual({
      placement: { kind: 'recipe-slot', slot: 'bottom' },
      surfaceId: terminal.id,
      type: 'restoreSurface',
    })
  })

  it('seeds current default rail entries when surfaces are missing from the layout', () => {
    const fileNavigator = createFileNavigatorSurface()
    const chat = createChatSurface()
    const logs = createLogsSurface()
    const layout = emptyLayout()
    const items = selectWorkbenchRailSurfaceItems(layout)

    expect(items.map((item) => item.surface.id)).toEqual(
      expect.arrayContaining([fileNavigator.id, chat.id, logs.id]),
    )
    expect(railItemOperation(layout, mustFindRailItem(items, chat.id))).toEqual({
      surface: chat,
      type: 'openSurface',
    })
  })

  it('exposes active recipe rail entries that apply recipes', () => {
    const layout = createClassicFirstRunWorkspaceLayout()
    const item = selectWorkbenchRailRecipeItems(layout)[0]
    if (!item) throw new Error('Expected recipe rail item')

    expect(item.state).toBe('active-recipe')
    expect(railItemOperation(layout, item)).toEqual({
      recipeId: layout.activeRecipeId,
      type: 'applyRecipe',
    })
  })

  it('activates the first rail side pane opened as a new edge window', () => {
    const chat = createChatSurface()
    const layout = applyRailItem(createClassicFirstRunWorkspaceLayout(), chat.id)
    const item = mustFindRailItem(selectWorkbenchRailSurfaceItems(layout), chat.id)

    expect(layout.activeSurfaceId).toBe(chat.id)
    expect(layout.activeWindowId).toBe(mustFindWindowId(layout, chat.id))
    expect(item.state).toBe('active')
    expectValidLayout(layout)
  })

  it('opens primary and secondary rail entries as separate visible panes', () => {
    const chat = createChatSurface()
    const search = createSearchResultsSurface()
    let layout = createClassicFirstRunWorkspaceLayout()

    layout = applyLayoutOperation(
      layout,
      railItemOperation(
        layout,
        mustFindRailItem(selectWorkbenchRailSurfaceItems(layout), search.id),
      ),
    )
    layout = applyLayoutOperation(
      layout,
      railItemOperation(layout, mustFindRailItem(selectWorkbenchRailSurfaceItems(layout), chat.id)),
    )

    expect(visibleSurfaceIdsInOrder(layout)).toContain(search.id)
    expect(visibleSurfaceIdsInOrder(layout)).toContain(chat.id)
    expect(mustFindWindowId(layout, search.id)).not.toBe(mustFindWindowId(layout, chat.id))
    expectValidLayout(layout)
  })

  it('places same-slot rail entries as separate nested tool panes', () => {
    const chat = createChatSurface()
    const logs = createLogsSurface()
    const git = createGitChangesSurface()
    let layout = createClassicFirstRunWorkspaceLayout()

    layout = applyRailItem(layout, chat.id)
    layout = applyRailItem(layout, logs.id)
    layout = applyRailItem(layout, git.id)

    expect(visibleWindowIdsInOrder(layout)).toHaveLength(6)
    expect(mustFindWindowId(layout, chat.id)).not.toBe(mustFindWindowId(layout, logs.id))
    expect(mustFindWindowId(layout, logs.id)).not.toBe(mustFindWindowId(layout, git.id))
    expect(mustFindWindowId(layout, chat.id)).not.toBe(mustFindWindowId(layout, git.id))
    expect(visibleWindowIdsInOrder(layout).indexOf(mustFindWindowId(layout, git.id))).toBeLessThan(
      visibleWindowIdsInOrder(layout).indexOf(CLASSIC_EDITOR_WINDOW_ID),
    )
    expect(layout.windowsById[mustFindWindowId(layout, git.id)].activeSurfaceId).toBe(git.id)
    expectValidLayout(layout)
  })

  it('order-packs no-main tool panes into one stable left stack', () => {
    const fileNavigator = createFileNavigatorSurface()
    const search = createSearchResultsSurface()
    const git = createGitChangesSurface()
    const chat = createChatSurface()
    const hiddenBottom = layoutWithoutBottomSurfaces(createClassicFirstRunWorkspaceLayout())
    const placeholderId = firstSurfaceIdOfType(hiddenBottom, 'placeholder')
    if (!placeholderId) throw new Error('Expected editor placeholder')

    let layout = closeSurface(hiddenBottom, placeholderId, { force: true })
    layout = applyRailItem(layout, git.id)
    expectLeftToolStack(layout, [fileNavigator.id, git.id])

    layout = applyRailItem(layout, search.id)
    expectLeftToolStack(layout, [fileNavigator.id, search.id, git.id])

    layout = applyRailItem(layout, chat.id)
    expectLeftToolStack(layout, [fileNavigator.id, search.id, git.id, chat.id])
    expectValidLayout(layout)
  })

  it('restores backgrounded left tools back into stable recipe order', () => {
    const fileNavigator = createFileNavigatorSurface()
    const search = createSearchResultsSurface()
    const git = createGitChangesSurface()
    const chat = createChatSurface()
    const hiddenBottom = layoutWithoutBottomSurfaces(createClassicFirstRunWorkspaceLayout())
    const placeholderId = firstSurfaceIdOfType(hiddenBottom, 'placeholder')
    if (!placeholderId) throw new Error('Expected editor placeholder')

    let layout = closeSurface(hiddenBottom, placeholderId, { force: true })
    layout = backgroundSurface(layout, fileNavigator.id)
    layout = applyRailItem(layout, search.id)
    layout = applyRailItem(layout, git.id)
    layout = applyRailItem(layout, chat.id)
    layout = applyRailItem(layout, fileNavigator.id)

    expectLeftToolStack(layout, [fileNavigator.id, search.id, git.id, chat.id])
    expectValidLayout(layout)
  })

  it('restores backgrounded primary tools beside primary tools when a main pane is visible', () => {
    const fileNavigator = createFileNavigatorSurface()
    const search = createSearchResultsSurface()
    const git = createGitChangesSurface()
    const chat = createChatSurface()
    const file = createFileEditorSurface({ path: '/repo/src/main-before-files.ts' })
    const hiddenBottom = layoutWithoutBottomSurfaces(createClassicFirstRunWorkspaceLayout())
    const placeholderId = firstSurfaceIdOfType(hiddenBottom, 'placeholder')
    if (!placeholderId) throw new Error('Expected editor placeholder')

    let layout = closeSurface(hiddenBottom, placeholderId, { force: true })
    layout = backgroundSurface(layout, fileNavigator.id)
    layout = applyRailItem(layout, search.id)
    layout = applyRailItem(layout, git.id)
    layout = applyRailItem(layout, chat.id)
    layout = openSurface(layout, file)
    layout = applyRailItem(layout, fileNavigator.id)

    expect(mustFindWindowId(layout, fileNavigator.id)).not.toBe(mustFindWindowId(layout, chat.id))
    expect(mustFindWindowId(layout, fileNavigator.id)).not.toBe(mustFindWindowId(layout, git.id))
    expect(siblingNodeIds(layout, search.id)).toContain(mustFindNodeId(layout, fileNavigator.id))
    expect(
      layout.policiesById[CLASSIC_POLICY_ID].stickyPlacementsBySurfaceId[fileNavigator.id],
    ).toBeUndefined()
    expectValidLayout(layout)
  })

  it('returns removed nested pane height to the adjacent pane across toggles', () => {
    const fileNavigator = createFileNavigatorSurface()
    const git = createGitChangesSurface()
    const chat = createChatSurface()
    let layout = applyRailItem(createClassicFirstRunWorkspaceLayout(), git.id)
    layout = applyRailItem(layout, chat.id)
    layout = moveSurface(layout, fileNavigator.id, {
      edge: 'bottom',
      kind: 'window-edge',
      windowId: mustFindWindowId(layout, chat.id),
    })
    const baselineChatHeight = surfaceHeight(layout, chat.id)

    for (let index = 0; index < 3; index += 1) {
      layout = backgroundSurface(layout, fileNavigator.id)
      expect(surfaceHeight(layout, chat.id)).toBeGreaterThan(baselineChatHeight)

      layout = restoreSurface(layout, fileNavigator.id, {
        edge: 'bottom',
        kind: 'window-edge',
        windowId: mustFindWindowId(layout, chat.id),
      })
      expect(siblingNodeIds(layout, chat.id)).toContain(mustFindNodeId(layout, fileNavigator.id))
    }

    expectValidLayout(layout)
  })

  it('opens main surfaces beside active nested tool panes', () => {
    const chat = createChatSurface()
    const logs = createLogsSurface()
    const git = createGitChangesSurface()
    const file = createFileEditorSurface({ path: '/repo/src/main-from-tool.ts' })
    const hiddenBottom = layoutWithoutBottomSurfaces(createClassicFirstRunWorkspaceLayout())
    const placeholderId = firstSurfaceIdOfType(hiddenBottom, 'placeholder')
    if (!placeholderId) throw new Error('Expected editor placeholder')

    let toolOnly = closeSurface(hiddenBottom, placeholderId, { force: true })
    toolOnly = applyRailItem(toolOnly, chat.id)
    toolOnly = applyRailItem(toolOnly, logs.id)
    toolOnly = applyRailItem(toolOnly, git.id)
    const opened = openSurface(toolOnly, file)
    const fileWindowIndex = visibleWindowIdsInOrder(opened).indexOf(
      mustFindWindowId(opened, file.id),
    )

    expect(opened.activeSurfaceId).toBe(file.id)
    expect(mustFindWindowId(opened, file.id)).not.toBe(mustFindWindowId(opened, chat.id))
    expect(mustFindWindowId(opened, file.id)).not.toBe(mustFindWindowId(opened, logs.id))
    expect(mustFindWindowId(opened, file.id)).not.toBe(mustFindWindowId(opened, git.id))
    expect(visibleWindowIdsInOrder(opened)).toHaveLength(5)
    expect(visibleWindowIdsInOrder(opened).indexOf(mustFindWindowId(opened, chat.id))).toBeLessThan(
      fileWindowIndex,
    )
    expect(visibleWindowIdsInOrder(opened).indexOf(mustFindWindowId(opened, logs.id))).toBeLessThan(
      fileWindowIndex,
    )
    expect(visibleWindowIdsInOrder(opened).indexOf(mustFindWindowId(opened, git.id))).toBeLessThan(
      fileWindowIndex,
    )
    expectValidLayout(opened)
  })

  it('maps active expanded rail singleton items to collapse operations', () => {
    const git = createGitChangesSurface()
    const layout = activateSurface(openSurface(createClassicFirstRunWorkspaceLayout(), git), git.id)
    const item = selectWorkbenchRailSurfaceItems(layout).find(
      (candidate) => candidate.surface.id === git.id,
    )
    if (!item) throw new Error('Expected Git rail item')
    const windowId = mustFindWindowId(layout, git.id)

    expect(railItemOperation(layout, item)).toEqual({
      type: 'collapseWindow',
      windowId,
    })
  })

  it('maps visible inactive rail singleton items to focus operations', () => {
    const chat = createChatSurface()
    const logs = createLogsSurface()
    let layout = openSurface(createClassicFirstRunWorkspaceLayout(), chat)
    layout = openSurface(layout, logs)
    const item = mustFindRailItem(selectWorkbenchRailSurfaceItems(layout), chat.id)
    const windowId = mustFindWindowId(layout, chat.id)

    expect(item.state).toBe('visible')
    expect(railItemOperation(layout, item)).toEqual({
      surfaceId: chat.id,
      type: 'activateSurface',
      windowId,
    })
  })

  it('maps collapsed rail singleton items to expand operations', () => {
    const git = createGitChangesSurface()
    const opened = openSurface(createClassicFirstRunWorkspaceLayout(), git)
    const windowId = mustFindWindowId(opened, git.id)
    const layout = collapseWindow(opened, windowId)
    const item = mustFindRailItem(selectWorkbenchRailSurfaceItems(layout), git.id)

    expect(item.state).toBe('collapsed')
    expect(railItemOperation(layout, item)).toEqual({
      type: 'expandWindow',
      windowId,
    })
  })
})

function threeColumnLayoutWithSizes(sizes: readonly number[]) {
  const surfaceA = createFileEditorSurface({ path: '/repo/src/a.ts' })
  const surfaceB = createFileEditorSurface({ path: '/repo/src/b.ts' })
  const surfaceC = createFileEditorSurface({ path: '/repo/src/c.ts' })
  const windowAId = workbenchWindowId('test:a')
  const windowBId = workbenchWindowId('test:b')
  const windowCId = workbenchWindowId('test:c')
  const nodeAId = layoutNodeId('test:a')
  const nodeBId = layoutNodeId('test:b')
  const nodeCId = layoutNodeId('test:c')
  const rootNodeId = layoutNodeId('test:root')

  return {
    ...createEmptyWorkspaceLayout(),
    activeSurfaceId: surfaceA.id,
    activeWindowId: windowAId,
    mruSurfaceIds: [surfaceA.id, surfaceB.id, surfaceC.id],
    mruWindowIds: [windowAId, windowBId, windowCId],
    nodesById: {
      [nodeAId]: createWindowNode({ id: nodeAId, windowId: windowAId }),
      [nodeBId]: createWindowNode({ id: nodeBId, windowId: windowBId }),
      [nodeCId]: createWindowNode({ id: nodeCId, windowId: windowCId }),
      [rootNodeId]: createSplitNode({
        axis: 'horizontal',
        childIds: [nodeAId, nodeBId, nodeCId],
        id: rootNodeId,
        sizes,
      }),
    },
    rootNodeId,
    surfacesById: {
      [surfaceA.id]: surfaceA,
      [surfaceB.id]: surfaceB,
      [surfaceC.id]: surfaceC,
    },
    windowsById: {
      [windowAId]: createWorkbenchWindow({
        activeSurfaceId: surfaceA.id,
        id: windowAId,
        surfaceIds: [surfaceA.id],
      }),
      [windowBId]: createWorkbenchWindow({
        activeSurfaceId: surfaceB.id,
        id: windowBId,
        surfaceIds: [surfaceB.id],
      }),
      [windowCId]: createWorkbenchWindow({
        activeSurfaceId: surfaceC.id,
        id: windowCId,
        surfaceIds: [surfaceC.id],
      }),
    },
  } satisfies WorkspaceLayout
}

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

function expectLeftToolStack(layout: WorkspaceLayout, surfaceIds: readonly SurfaceId[]) {
  const nodeIds = surfaceIds.map((surfaceId) => mustFindNodeId(layout, surfaceId))
  if (nodeIds.length === 1) return nodeIds[0]

  const parentNodeId = findParentNodeId(layout, nodeIds[0])
  if (!parentNodeId) throw new Error('Expected tool column parent node')

  for (const nodeId of nodeIds) {
    expect(findParentNodeId(layout, nodeId)).toBe(parentNodeId)
  }
  expect(layout.nodesById[parentNodeId]).toMatchObject({
    axis: 'vertical',
    childIds: nodeIds,
    kind: 'split',
  })

  return parentNodeId
}

function mustFindNodeId(layout: WorkspaceLayout, surfaceId: SurfaceId) {
  const windowId = mustFindWindowId(layout, surfaceId)
  const nodeId = findNodeIdForWindow(layout, windowId)
  if (!nodeId) throw new Error(`Expected node for ${surfaceId}`)

  return nodeId
}

function siblingNodeIds(layout: WorkspaceLayout, surfaceId: SurfaceId) {
  const nodeId = mustFindNodeId(layout, surfaceId)
  const parentNodeId = findParentNodeId(layout, nodeId)
  if (!parentNodeId) throw new Error(`Expected parent node for ${surfaceId}`)

  const parentNode = layout.nodesById[parentNodeId]
  if (!parentNode || parentNode.kind !== 'split') throw new Error(`Expected split parent`)

  return parentNode.childIds.filter((childId) => childId !== nodeId)
}

function expectWindowSplitRatio(
  layout: WorkspaceLayout,
  windowId: WindowId,
  expectedRatio: number,
) {
  expect(windowSplitRatio(layout, windowId)).toBeCloseTo(expectedRatio, 2)
}

function expectWindowSplitRatioGreaterThan(
  layout: WorkspaceLayout,
  windowId: WindowId,
  minRatio: number,
) {
  expect(windowSplitRatio(layout, windowId)).toBeGreaterThan(minRatio)
}

function windowSplitRatio(layout: WorkspaceLayout, windowId: WindowId) {
  const nodeId = findNodeIdForWindow(layout, windowId)
  if (!nodeId) throw new Error(`Expected node for ${windowId}`)

  const parentNodeId = findParentNodeId(layout, nodeId)
  if (!parentNodeId) throw new Error(`Expected parent split for ${windowId}`)

  const parentNode = layout.nodesById[parentNodeId]
  if (!parentNode || parentNode.kind !== 'split') throw new Error(`Expected split parent`)

  const childIndex = parentNode.childIds.indexOf(nodeId)
  return parentNode.sizes[childIndex] ?? 0
}

function surfaceHeight(layout: WorkspaceLayout, surfaceId: SurfaceId) {
  const windowId = mustFindWindowId(layout, surfaceId)
  const geometry = deriveLayoutGeometry(layout, { height: 1000, width: 1000, x: 0, y: 0 })
  const rect = geometry.windowRectsById[windowId]?.rect
  if (!rect) throw new Error(`Expected rect for ${surfaceId}`)

  return rect.height
}

function layoutWithoutBottomSurfaces(layout: WorkspaceLayout) {
  const diagnostics = createDiagnosticsSurface()
  const terminal = createTerminalSurface({ sessionId: 'terminal-1' })

  return closeSurface(closeSurface(layout, terminal.id), diagnostics.id)
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
      backgroundSurfaceIds: [],
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

function mustFindRailItem(
  items: ReturnType<typeof selectWorkbenchRailSurfaceItems>,
  surfaceId: SurfaceId,
) {
  const item = items.find((candidate) => candidate.surface.id === surfaceId)
  if (!item) throw new Error(`Expected rail item ${surfaceId}`)

  return item
}

function mustFindBottomPaneRailItem(layout: WorkspaceLayout) {
  const item = selectWorkbenchRailItems(layout).find(isWorkbenchRailBottomPaneItem)
  if (!item) throw new Error('Expected bottom pane rail item')

  return item
}

function applyRailItem(layout: WorkspaceLayout, surfaceId: SurfaceId) {
  return applyLayoutOperation(
    layout,
    railItemOperation(layout, mustFindRailItem(selectWorkbenchRailSurfaceItems(layout), surfaceId)),
  )
}

function windowPreviewSurfaceIds(layout: WorkspaceLayout) {
  return Object.values(layout.windowsById)
    .map((window) => window.previewSurfaceId)
    .filter(Boolean)
}

function firstSurfaceIdOfType(layout: WorkspaceLayout, surfaceType: SurfaceType) {
  return Object.values(layout.surfacesById).find((surface) => surface.type === surfaceType)?.id
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

function backgroundSurface(layout: WorkspaceLayout, surfaceId: SurfaceId) {
  return moveSurface(layout, surfaceId, { kind: 'background' })
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

function frame(
  anchor: CustomWindowFrame['anchor'],
  size: {
    readonly height?: number
    readonly offsetX?: number
    readonly offsetY?: number
    readonly width?: number
  } = {},
): CustomWindowFrame {
  return {
    anchor,
    height: size.height ?? 50,
    offsetX: size.offsetX ?? 0,
    offsetY: size.offsetY ?? 0,
    unit: 'percent',
    width: size.width ?? 50,
  }
}
