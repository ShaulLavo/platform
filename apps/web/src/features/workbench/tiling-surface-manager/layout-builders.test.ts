import { describe, expect, it } from 'bun:test'

import {
  CLASSIC_DIAGNOSTICS_NODE_ID,
  CLASSIC_DIAGNOSTICS_WINDOW_ID,
  CLASSIC_EDITOR_NODE_ID,
  CLASSIC_EDITOR_WINDOW_ID,
  CLASSIC_FILE_NAVIGATOR_NODE_ID,
  CLASSIC_FILE_NAVIGATOR_WINDOW_ID,
  CLASSIC_MAIN_NODE_ID,
  CLASSIC_ROOT_NODE_ID,
  createClassicFirstRunWorkspaceLayout,
  createEmptyWorkspaceLayout,
} from './layout-builders'
import {
  CLASSIC_POLICY_ID,
  CLASSIC_RECIPE_ID,
  diagnosticsSurfaceId,
  fileNavigatorSurfaceId,
  placeholderSurfaceId,
} from './layout-ids'
import type { LayoutNode, Surface, WorkbenchWindow, WorkspaceLayout } from './layout-types'

describe('tiling surface layout builders', () => {
  it('creates an empty workspace layout snapshot', () => {
    expect(layoutSnapshot(createEmptyWorkspaceLayout())).toEqual({
      activeRecipeId: CLASSIC_RECIPE_ID,
      activeSurfaceId: undefined,
      activeWindowId: undefined,
      commandCycleState: undefined,
      hotkeyPresets: [],
      layoutCommands: [],
      mruSurfaceIds: [],
      mruWindowIds: [],
      nodes: [],
      policies: [
        {
          id: CLASSIC_POLICY_ID,
          recipeId: CLASSIC_RECIPE_ID,
          stickyPlacementsBySurfaceId: {},
        },
      ],
      rail: {
        minimizedSurfaceIds: [],
        pinnedSurfaceIds: [],
        recipeIds: [CLASSIC_RECIPE_ID],
        runningSurfaceIds: [],
        visibleSingletonSurfaceIds: [],
      },
      recipes: [
        {
          id: CLASSIC_RECIPE_ID,
          resetRootNodeId: CLASSIC_ROOT_NODE_ID,
          title: 'Classic',
        },
      ],
      rootNodeId: null,
      surfaceRegistryVersion: 1,
      surfaces: [],
      version: 1,
      windowCommands: [],
      windows: [],
    })
  })

  it('creates a classic first-run layout snapshot', () => {
    const fileNavigator = fileNavigatorSurfaceId()
    const placeholder = placeholderSurfaceId('empty-editor')
    const diagnostics = diagnosticsSurfaceId()

    expect(layoutSnapshot(createClassicFirstRunWorkspaceLayout())).toEqual({
      activeRecipeId: CLASSIC_RECIPE_ID,
      activeSurfaceId: placeholder,
      activeWindowId: CLASSIC_EDITOR_WINDOW_ID,
      commandCycleState: undefined,
      hotkeyPresets: [],
      layoutCommands: [],
      mruSurfaceIds: [placeholder, fileNavigator, diagnostics],
      mruWindowIds: [
        CLASSIC_EDITOR_WINDOW_ID,
        CLASSIC_FILE_NAVIGATOR_WINDOW_ID,
        CLASSIC_DIAGNOSTICS_WINDOW_ID,
      ],
      nodes: [
        {
          id: CLASSIC_DIAGNOSTICS_NODE_ID,
          kind: 'window',
          windowId: CLASSIC_DIAGNOSTICS_WINDOW_ID,
        },
        {
          id: CLASSIC_EDITOR_NODE_ID,
          kind: 'window',
          windowId: CLASSIC_EDITOR_WINDOW_ID,
        },
        {
          id: CLASSIC_FILE_NAVIGATOR_NODE_ID,
          kind: 'window',
          windowId: CLASSIC_FILE_NAVIGATOR_WINDOW_ID,
        },
        {
          axis: 'vertical',
          childIds: [CLASSIC_EDITOR_NODE_ID, CLASSIC_DIAGNOSTICS_NODE_ID],
          id: CLASSIC_MAIN_NODE_ID,
          kind: 'split',
          sizes: [0.74, 0.26],
        },
        {
          axis: 'horizontal',
          childIds: [CLASSIC_FILE_NAVIGATOR_NODE_ID, CLASSIC_MAIN_NODE_ID],
          id: CLASSIC_ROOT_NODE_ID,
          kind: 'split',
          sizes: [0.22, 0.78],
        },
      ],
      policies: [
        {
          id: CLASSIC_POLICY_ID,
          recipeId: CLASSIC_RECIPE_ID,
          stickyPlacementsBySurfaceId: {},
        },
      ],
      rail: {
        minimizedSurfaceIds: [],
        pinnedSurfaceIds: [fileNavigator, diagnostics],
        recipeIds: [CLASSIC_RECIPE_ID],
        runningSurfaceIds: [],
        visibleSingletonSurfaceIds: [fileNavigator, diagnostics],
      },
      recipes: [
        {
          id: CLASSIC_RECIPE_ID,
          resetRootNodeId: CLASSIC_ROOT_NODE_ID,
          title: 'Classic',
        },
      ],
      rootNodeId: CLASSIC_ROOT_NODE_ID,
      surfaceRegistryVersion: 1,
      surfaces: [
        {
          cardinality: 'singleton',
          id: diagnostics,
          lifecycle: 'durable',
          ownerContextKey: undefined,
          ownerSurfaceId: undefined,
          placement: { kind: 'recipe-slot', slot: 'bottom' },
          title: 'Problems',
          type: 'diagnostics',
        },
        {
          cardinality: 'singleton',
          id: fileNavigator,
          lifecycle: 'durable',
          ownerContextKey: undefined,
          ownerSurfaceId: undefined,
          placement: { kind: 'recipe-slot', slot: 'primary-side' },
          title: 'Files',
          type: 'file-navigator',
        },
        {
          cardinality: 'multi',
          id: placeholder,
          lifecycle: 'placeholder',
          ownerContextKey: undefined,
          ownerSurfaceId: undefined,
          placement: { kind: 'recipe-slot', slot: 'editor-center' },
          title: 'No file selected',
          type: 'placeholder',
        },
      ],
      version: 1,
      windowCommands: [],
      windows: [
        {
          activeSurfaceId: diagnostics,
          id: CLASSIC_DIAGNOSTICS_WINDOW_ID,
          mode: 'normal',
          pinnedSurfaceIds: [diagnostics],
          previewSurfaceId: undefined,
          surfaceIds: [diagnostics],
        },
        {
          activeSurfaceId: placeholder,
          id: CLASSIC_EDITOR_WINDOW_ID,
          mode: 'normal',
          pinnedSurfaceIds: [],
          previewSurfaceId: undefined,
          surfaceIds: [placeholder],
        },
        {
          activeSurfaceId: fileNavigator,
          id: CLASSIC_FILE_NAVIGATOR_WINDOW_ID,
          mode: 'normal',
          pinnedSurfaceIds: [fileNavigator],
          previewSurfaceId: undefined,
          surfaceIds: [fileNavigator],
        },
      ],
    })
  })
})

function layoutSnapshot(layout: WorkspaceLayout) {
  return {
    activeRecipeId: layout.activeRecipeId,
    activeSurfaceId: layout.activeSurfaceId,
    activeWindowId: layout.activeWindowId,
    commandCycleState: layout.commandCycleState,
    hotkeyPresets: Object.values(layout.hotkeyPresetsById).sort(compareIds),
    layoutCommands: Object.values(layout.layoutCommandsById).sort(compareIds),
    mruSurfaceIds: layout.mruSurfaceIds,
    mruWindowIds: layout.mruWindowIds,
    nodes: Object.values(layout.nodesById).map(nodeSnapshot).sort(compareIds),
    policies: Object.values(layout.policiesById).map((policy) => ({
      id: policy.id,
      recipeId: policy.recipeId,
      stickyPlacementsBySurfaceId: policy.stickyPlacementsBySurfaceId,
    })),
    rail: layout.rail,
    recipes: Object.values(layout.recipesById).map((recipe) => ({
      id: recipe.id,
      resetRootNodeId: recipe.resetRootNodeId,
      title: recipe.title,
    })),
    rootNodeId: layout.rootNodeId,
    surfaceRegistryVersion: layout.surfaceRegistryVersion,
    surfaces: Object.values(layout.surfacesById).map(surfaceSnapshot).sort(compareIds),
    version: layout.version,
    windowCommands: Object.values(layout.windowCommandsById).sort(compareIds),
    windows: Object.values(layout.windowsById).map(windowSnapshot).sort(compareIds),
  }
}

function nodeSnapshot(node: LayoutNode) {
  if (node.kind === 'window') return node

  return {
    axis: node.axis,
    childIds: node.childIds,
    id: node.id,
    kind: node.kind,
    sizes: node.sizes,
  }
}

function surfaceSnapshot(surface: Surface) {
  return {
    cardinality: surface.cardinality,
    id: surface.id,
    lifecycle: surface.lifecycle,
    ownerContextKey: surface.ownerContextKey,
    ownerSurfaceId: surface.ownerSurfaceId,
    placement: surface.placement,
    title: surface.title,
    type: surface.type,
  }
}

function windowSnapshot(window: WorkbenchWindow) {
  return {
    activeSurfaceId: window.activeSurfaceId,
    id: window.id,
    mode: window.mode,
    pinnedSurfaceIds: window.pinnedSurfaceIds,
    previewSurfaceId: window.previewSurfaceId,
    surfaceIds: window.surfaceIds,
  }
}

function compareIds(left: { readonly id: string }, right: { readonly id: string }) {
  return left.id.localeCompare(right.id)
}
