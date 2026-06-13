import { describe, expect, it } from 'vitest'

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
} from '@workspace/tiling/utils/layout-builders'
import {
  AGENT_PAIRING_RECIPE_ID,
  CLASSIC_POLICY_ID,
  CLASSIC_RECIPE_ID,
  FOCUS_RECIPE_ID,
  REVIEW_LAYOUT_COMMAND_ID,
  REVIEW_RECIPE_ID,
  SEARCH_INVESTIGATE_RECIPE_ID,
  chatSurfaceId,
  diagnosticsSurfaceId,
  fileEditorSurfaceId,
  fileNavigatorSurfaceId,
  gitChangesSurfaceId,
  logsSurfaceId,
  placeholderSurfaceId,
  searchResultsSurfaceId,
  terminalSurfaceId,
} from '@workspace/tiling/utils/layout-ids'
import type {
  LayoutNode,
  Surface,
  WorkbenchWindow,
  WorkspaceLayout,
} from '@workspace/tiling/utils/layout-types'

describe('tiling surface layout builders', () => {
  it('creates an empty workspace layout snapshot', () => {
    expect(layoutSnapshot(createEmptyWorkspaceLayout())).toEqual({
      activeRecipeId: CLASSIC_RECIPE_ID,
      activeSurfaceId: undefined,
      activeWindowId: undefined,
      commandCycleState: undefined,
      hotkeyPresets: [],
      layoutCommands: [reviewLayoutCommandSnapshot()],
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
        backgroundSurfaceIds: [],
        pinnedSurfaceIds: [],
        recipeIds: [CLASSIC_RECIPE_ID],
        runningSurfaceIds: [],
        visibleSingletonSurfaceIds: [],
      },
      recipes: [
        {
          id: AGENT_PAIRING_RECIPE_ID,
          resetRootNodeId: undefined,
          title: 'Agent Pairing',
        },
        {
          id: CLASSIC_RECIPE_ID,
          resetRootNodeId: CLASSIC_ROOT_NODE_ID,
          title: 'Classic',
        },
        {
          id: FOCUS_RECIPE_ID,
          resetRootNodeId: undefined,
          title: 'Focus',
        },
        {
          id: REVIEW_RECIPE_ID,
          resetRootNodeId: undefined,
          title: 'Review',
        },
        {
          id: SEARCH_INVESTIGATE_RECIPE_ID,
          resetRootNodeId: undefined,
          title: 'Search And Investigate',
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
    const gitChanges = gitChangesSurfaceId()
    const chat = chatSurfaceId()
    const logs = logsSurfaceId()
    const searchResults = searchResultsSurfaceId()
    const terminal = terminalSurfaceId('terminal-1')

    expect(layoutSnapshot(createClassicFirstRunWorkspaceLayout())).toEqual({
      activeRecipeId: CLASSIC_RECIPE_ID,
      activeSurfaceId: placeholder,
      activeWindowId: CLASSIC_EDITOR_WINDOW_ID,
      commandCycleState: undefined,
      hotkeyPresets: [],
      layoutCommands: [reviewLayoutCommandSnapshot()],
      mruSurfaceIds: [placeholder, fileNavigator, terminal, diagnostics],
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
        backgroundSurfaceIds: [searchResults, gitChanges, chat, logs],
        pinnedSurfaceIds: [fileNavigator, searchResults, gitChanges, chat, diagnostics, logs],
        recipeIds: [CLASSIC_RECIPE_ID],
        runningSurfaceIds: [terminal],
        visibleSingletonSurfaceIds: [fileNavigator, diagnostics],
      },
      recipes: [
        {
          id: AGENT_PAIRING_RECIPE_ID,
          resetRootNodeId: undefined,
          title: 'Agent Pairing',
        },
        {
          id: CLASSIC_RECIPE_ID,
          resetRootNodeId: CLASSIC_ROOT_NODE_ID,
          title: 'Classic',
        },
        {
          id: FOCUS_RECIPE_ID,
          resetRootNodeId: undefined,
          title: 'Focus',
        },
        {
          id: REVIEW_RECIPE_ID,
          resetRootNodeId: undefined,
          title: 'Review',
        },
        {
          id: SEARCH_INVESTIGATE_RECIPE_ID,
          resetRootNodeId: undefined,
          title: 'Search And Investigate',
        },
      ],
      rootNodeId: CLASSIC_ROOT_NODE_ID,
      surfaceRegistryVersion: 1,
      surfaces: [
        {
          cardinality: 'singleton',
          id: chat,
          lifecycle: 'durable',
          ownerContextKey: undefined,
          ownerSurfaceId: undefined,
          placement: { kind: 'recipe-slot', slot: 'left-tool-pane' },
          title: 'Chat',
          type: 'chat',
        },
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
          placement: { kind: 'recipe-slot', slot: 'left-tool-pane' },
          title: 'Files',
          type: 'file-navigator',
        },
        {
          cardinality: 'singleton',
          id: gitChanges,
          lifecycle: 'durable',
          ownerContextKey: undefined,
          ownerSurfaceId: undefined,
          placement: { kind: 'recipe-slot', slot: 'left-tool-pane' },
          title: 'Git Changes',
          type: 'git-changes',
        },
        {
          cardinality: 'singleton',
          id: logs,
          lifecycle: 'durable',
          ownerContextKey: undefined,
          ownerSurfaceId: undefined,
          placement: { kind: 'recipe-slot', slot: 'left-tool-pane' },
          title: 'Logs',
          type: 'logs',
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
        {
          cardinality: 'singleton',
          id: searchResults,
          lifecycle: 'durable',
          ownerContextKey: undefined,
          ownerSurfaceId: undefined,
          placement: { kind: 'recipe-slot', slot: 'left-tool-pane' },
          title: 'Search',
          type: 'search-results',
        },
        {
          cardinality: 'multi',
          id: terminal,
          lifecycle: 'running',
          ownerContextKey: undefined,
          ownerSurfaceId: undefined,
          placement: { kind: 'recipe-slot', slot: 'bottom' },
          title: 'Terminal',
          type: 'terminal',
        },
      ],
      version: 1,
      windowCommands: [],
      windows: [
        {
          activeSurfaceId: terminal,
          id: CLASSIC_DIAGNOSTICS_WINDOW_ID,
          mode: 'normal',
          pinnedSurfaceIds: [diagnostics],
          previewSurfaceId: undefined,
          surfaceIds: [diagnostics, terminal],
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

  it('creates a classic first-run layout with a caller-provided editor file', () => {
    const path = 'apps/web/src/app.tsx'
    const layout = createClassicFirstRunWorkspaceLayout({ editorFile: { path } })
    const editorId = fileEditorSurfaceId(path)

    expect(layout.activeSurfaceId).toBe(editorId)
    expect(layout.surfacesById[editorId]).toMatchObject({
      placement: { kind: 'recipe-slot', slot: 'editor-center' },
      title: 'app.tsx',
      type: 'file-editor',
    })
    expect(layout.windowsById[CLASSIC_EDITOR_WINDOW_ID]).toMatchObject({
      activeSurfaceId: editorId,
      surfaceIds: [editorId],
    })
    expect(layout.mruSurfaceIds[0]).toBe(editorId)
  })

  it('registers workflow recipes with surface placement slots', () => {
    const layout = createEmptyWorkspaceLayout()

    expect(layout.recipesById[SEARCH_INVESTIGATE_RECIPE_ID].surfaceSlots).toMatchObject({
      'search-preview': 'transient-preview',
      'search-results': 'left-tool-pane',
      'search-results-detail': 'editor-center',
    })
    expect(layout.recipesById[REVIEW_RECIPE_ID].surfaceSlots).toMatchObject({
      diff: 'editor-center',
      'git-changes': 'left-tool-pane',
      logs: 'bottom',
    })
    expect(layout.recipesById[AGENT_PAIRING_RECIPE_ID].surfaceSlots).toMatchObject({
      chat: 'left-tool-pane',
      logs: 'bottom',
    })
    expect(layout.recipesById[FOCUS_RECIPE_ID].surfaceSlots).toMatchObject({
      'file-editor': 'editor-center',
      'file-navigator': 'rail',
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
    recipes: Object.values(layout.recipesById)
      .map((recipe) => ({
        id: recipe.id,
        resetRootNodeId: recipe.resetRootNodeId,
        title: recipe.title,
      }))
      .sort(compareIds),
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

function reviewLayoutCommandSnapshot() {
  return {
    aliases: ['git review', 'review changes', 'code review'],
    enabled: true,
    icon: 'git-pull-request',
    id: REVIEW_LAYOUT_COMMAND_ID,
    recipeId: REVIEW_RECIPE_ID,
    slots: [
      {
        displayHint: { kind: 'recipe-slot', slot: 'left-tool-pane' },
        frame: { anchor: 'left', height: 100, offsetX: 0, offsetY: 0, unit: 'percent', width: 28 },
        id: 'search',
        surfaceType: 'search-results',
      },
      {
        displayHint: { kind: 'recipe-slot', slot: 'bottom' },
        frame: {
          anchor: 'bottom',
          height: 28,
          offsetX: 0,
          offsetY: 0,
          unit: 'percent',
          width: 100,
        },
        id: 'diagnostics',
        surfaceType: 'diagnostics',
      },
      {
        displayHint: { kind: 'recipe-slot', slot: 'left-tool-pane' },
        frame: { anchor: 'left', height: 100, offsetX: 0, offsetY: 0, unit: 'percent', width: 28 },
        id: 'git-changes',
        surfaceType: 'git-changes',
      },
    ],
    title: 'Review Workspace',
  }
}
