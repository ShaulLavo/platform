import {
  CLASSIC_POLICY_ID,
  CLASSIC_RECIPE_ID,
  diagnosticsSurfaceId,
  diffSurfaceId,
  fileEditorSurfaceId,
  fileNavigatorSurfaceId,
  gitChangesSurfaceId,
  layoutNodeId,
  logsSurfaceId,
  placeholderSurfaceId,
  searchPreviewSurfaceId,
  searchResultsSurfaceId,
  terminalSurfaceId,
  workbenchWindowId,
} from './layout-ids'
import {
  SURFACE_REGISTRY_VERSION,
  SURFACE_SERIALIZED_VERSION,
  WORKSPACE_LAYOUT_VERSION,
  type LayoutNode,
  type LayoutNodeId,
  type LayoutPolicyId,
  type LayoutPolicyState,
  type LayoutSplitAxis,
  type RecipeId,
  type Surface,
  type SurfaceCapabilities,
  type SurfaceId,
  type SurfaceLifecycle,
  type SurfacePlacementHint,
  type SurfaceType,
  type WindowId,
  type WorkbenchWindow,
  type WorkspaceLayout,
  type WorkspaceRecipe,
  type WorkspaceRecipeSlot,
} from './layout-types'

export const CLASSIC_ROOT_NODE_ID = layoutNodeId('classic:root')
export const CLASSIC_MAIN_NODE_ID = layoutNodeId('classic:main')
export const CLASSIC_FILE_NAVIGATOR_NODE_ID = layoutNodeId('classic:file-navigator')
export const CLASSIC_EDITOR_NODE_ID = layoutNodeId('classic:editor')
export const CLASSIC_DIAGNOSTICS_NODE_ID = layoutNodeId('classic:diagnostics')

export const CLASSIC_FILE_NAVIGATOR_WINDOW_ID = workbenchWindowId('classic:file-navigator')
export const CLASSIC_EDITOR_WINDOW_ID = workbenchWindowId('classic:editor')
export const CLASSIC_DIAGNOSTICS_WINDOW_ID = workbenchWindowId('classic:diagnostics')

const DEFAULT_VALID_PLACEMENTS = [
  'active-window',
  'window-center',
  'window-edge',
  'parent-edge',
  'root-edge',
  'rail',
] as const

export function createEmptyWorkspaceLayout(): WorkspaceLayout {
  return {
    activeRecipeId: CLASSIC_RECIPE_ID,
    hotkeyPresetsById: {},
    layoutCommandsById: {},
    mruSurfaceIds: [],
    mruWindowIds: [],
    nodesById: {},
    policiesById: defaultPoliciesById(),
    rail: emptyRailState(),
    recipesById: defaultRecipesById(),
    rootNodeId: null,
    surfaceRegistryVersion: SURFACE_REGISTRY_VERSION,
    surfacesById: {},
    version: WORKSPACE_LAYOUT_VERSION,
    windowCommandsById: {},
    windowsById: {},
  }
}

export function createClassicFirstRunWorkspaceLayout(): WorkspaceLayout {
  const fileNavigator = createFileNavigatorSurface()
  const searchResults = createSearchResultsSurface()
  const gitChanges = createGitChangesSurface()
  const logs = createLogsSurface()
  const editorPlaceholder = createPlaceholderSurface({
    contextKey: 'empty-editor',
    title: 'No file selected',
  })
  const diagnostics = createDiagnosticsSurface()
  const terminal = createTerminalSurface({ sessionId: 'terminal-1' })
  const sideWindow = createWorkbenchWindow({
    activeSurfaceId: fileNavigator.id,
    id: CLASSIC_FILE_NAVIGATOR_WINDOW_ID,
    pinnedSurfaceIds: [fileNavigator.id],
    surfaceIds: [fileNavigator.id],
  })
  const editorWindow = createWorkbenchWindow({
    activeSurfaceId: editorPlaceholder.id,
    id: CLASSIC_EDITOR_WINDOW_ID,
    surfaceIds: [editorPlaceholder.id],
  })
  const diagnosticsWindow = createWorkbenchWindow({
    activeSurfaceId: terminal.id,
    id: CLASSIC_DIAGNOSTICS_WINDOW_ID,
    pinnedSurfaceIds: [diagnostics.id],
    surfaceIds: [diagnostics.id, terminal.id],
  })

  return {
    activeRecipeId: CLASSIC_RECIPE_ID,
    activeSurfaceId: editorPlaceholder.id,
    activeWindowId: editorWindow.id,
    hotkeyPresetsById: {},
    layoutCommandsById: {},
    mruSurfaceIds: [editorPlaceholder.id, fileNavigator.id, terminal.id, diagnostics.id],
    mruWindowIds: [editorWindow.id, sideWindow.id, diagnosticsWindow.id],
    nodesById: {
      [CLASSIC_DIAGNOSTICS_NODE_ID]: createWindowNode({
        id: CLASSIC_DIAGNOSTICS_NODE_ID,
        windowId: diagnosticsWindow.id,
      }),
      [CLASSIC_EDITOR_NODE_ID]: createWindowNode({
        id: CLASSIC_EDITOR_NODE_ID,
        windowId: editorWindow.id,
      }),
      [CLASSIC_FILE_NAVIGATOR_NODE_ID]: createWindowNode({
        id: CLASSIC_FILE_NAVIGATOR_NODE_ID,
        windowId: sideWindow.id,
      }),
      [CLASSIC_MAIN_NODE_ID]: createSplitNode({
        axis: 'vertical',
        childIds: [CLASSIC_EDITOR_NODE_ID, CLASSIC_DIAGNOSTICS_NODE_ID],
        id: CLASSIC_MAIN_NODE_ID,
        sizes: [0.74, 0.26],
      }),
      [CLASSIC_ROOT_NODE_ID]: createSplitNode({
        axis: 'horizontal',
        childIds: [CLASSIC_FILE_NAVIGATOR_NODE_ID, CLASSIC_MAIN_NODE_ID],
        id: CLASSIC_ROOT_NODE_ID,
        sizes: [0.22, 0.78],
      }),
    },
    policiesById: defaultPoliciesById(),
    rail: {
      minimizedSurfaceIds: [searchResults.id, gitChanges.id, logs.id],
      pinnedSurfaceIds: [
        fileNavigator.id,
        searchResults.id,
        gitChanges.id,
        diagnostics.id,
        logs.id,
      ],
      recipeIds: [CLASSIC_RECIPE_ID],
      runningSurfaceIds: [terminal.id],
      visibleSingletonSurfaceIds: [fileNavigator.id, diagnostics.id],
    },
    recipesById: defaultRecipesById(),
    rootNodeId: CLASSIC_ROOT_NODE_ID,
    surfaceRegistryVersion: SURFACE_REGISTRY_VERSION,
    surfacesById: {
      [diagnostics.id]: diagnostics,
      [editorPlaceholder.id]: editorPlaceholder,
      [fileNavigator.id]: fileNavigator,
      [gitChanges.id]: gitChanges,
      [logs.id]: logs,
      [searchResults.id]: searchResults,
      [terminal.id]: terminal,
    },
    version: WORKSPACE_LAYOUT_VERSION,
    windowCommandsById: {},
    windowsById: {
      [diagnosticsWindow.id]: diagnosticsWindow,
      [editorWindow.id]: editorWindow,
      [sideWindow.id]: sideWindow,
    },
  }
}

export function createFileEditorSurface({
  lifecycle = 'durable',
  path,
  title,
}: {
  readonly lifecycle?: Extract<SurfaceLifecycle, 'durable' | 'transient'>
  readonly path: string
  readonly title?: string
}): Surface {
  return createSurface({
    capabilities: surfaceCapabilities({
      defaultRecipeSlot: 'editor-center',
      supportsPreview: true,
    }),
    cardinality: 'multi',
    closePolicy: { path, type: 'confirm-dirty-file' },
    id: fileEditorSurfaceId(path),
    lifecycle,
    placement: { kind: 'recipe-slot', slot: 'editor-center' },
    resourceKey: path,
    stateKey: path,
    title: title ?? pathTitle(path),
    type: 'file-editor',
  })
}

export function createDiffSurface({
  diffDocumentId,
  lifecycle = 'durable',
  title,
}: {
  readonly diffDocumentId: string
  readonly lifecycle?: Extract<SurfaceLifecycle, 'durable' | 'transient'>
  readonly title?: string
}): Surface {
  return createSurface({
    capabilities: surfaceCapabilities({
      defaultRecipeSlot: 'editor-center',
      supportsPreview: true,
    }),
    cardinality: 'multi',
    closePolicy: { type: 'close' },
    id: diffSurfaceId(diffDocumentId),
    lifecycle,
    placement: { kind: 'recipe-slot', slot: 'editor-center' },
    resourceKey: diffDocumentId,
    stateKey: diffDocumentId,
    title: title ?? 'Diff',
    type: 'diff',
  })
}

export function createSearchResultsSurface(): Surface {
  return createSurface({
    capabilities: surfaceCapabilities({
      canSplit: false,
      canUnmountWhenHidden: true,
      defaultRecipeSlot: 'primary-side',
      supportsPreview: true,
    }),
    cardinality: 'singleton',
    closePolicy: { type: 'close' },
    id: searchResultsSurfaceId(),
    lifecycle: 'durable',
    placement: { kind: 'recipe-slot', slot: 'primary-side' },
    rendererLifecycle: 'unmount-when-hidden',
    resourceKey: 'workspace-search',
    stateKey: 'workspace-search',
    title: 'Search',
    type: 'search-results',
  })
}

export function createSearchPreviewSurface({
  ownerContextKey,
  ownerSurfaceId,
  resourceKey,
  title = 'Search Preview',
}: {
  readonly ownerContextKey: string
  readonly ownerSurfaceId: SurfaceId
  readonly resourceKey?: string
  readonly title?: string
}): Surface {
  return createSurface({
    capabilities: surfaceCapabilities({
      canMinimize: false,
      defaultRecipeSlot: 'transient-preview',
      validPlacements: ['active-window', 'window-center', 'window-edge', 'root-edge'],
    }),
    cardinality: 'singleton-per-context',
    closePolicy: { type: 'close' },
    id: searchPreviewSurfaceId(ownerSurfaceId, ownerContextKey),
    lifecycle: 'transient',
    ownerContextKey,
    ownerSurfaceId,
    placement: { kind: 'recipe-slot', slot: 'transient-preview' },
    resourceKey,
    stateKey: ownerContextKey,
    title,
    type: 'search-preview',
  })
}

export function createTerminalSurface({
  sessionId,
  title = 'Terminal',
}: {
  readonly sessionId: string
  readonly title?: string
}): Surface {
  return createSurface({
    capabilities: surfaceCapabilities({
      canUnmountWhenHidden: false,
      defaultRecipeSlot: 'bottom',
    }),
    cardinality: 'multi',
    closePolicy: { sessionId, type: 'dispose-running-surface' },
    id: terminalSurfaceId(sessionId),
    lifecycle: 'running',
    placement: { kind: 'recipe-slot', slot: 'bottom' },
    rendererLifecycle: 'keep-mounted',
    resourceKey: sessionId,
    stateKey: sessionId,
    title,
    type: 'terminal',
  })
}

export function createFileNavigatorSurface(): Surface {
  return createSingletonSurface({
    id: fileNavigatorSurfaceId(),
    slot: 'primary-side',
    title: 'Files',
    type: 'file-navigator',
  })
}

export function createGitChangesSurface(): Surface {
  return createSingletonSurface({
    id: gitChangesSurfaceId(),
    slot: 'secondary-side',
    title: 'Git Changes',
    type: 'git-changes',
  })
}

export function createLogsSurface(): Surface {
  return createSingletonSurface({
    id: logsSurfaceId(),
    slot: 'secondary-side',
    title: 'Logs',
    type: 'logs',
  })
}

export function createDiagnosticsSurface(): Surface {
  return createSingletonSurface({
    id: diagnosticsSurfaceId(),
    slot: 'bottom',
    title: 'Problems',
    type: 'diagnostics',
  })
}

export function createPlaceholderSurface({
  contextKey,
  title,
}: {
  readonly contextKey: string
  readonly title: string
}): Surface {
  return createSurface({
    capabilities: surfaceCapabilities({
      canClose: false,
      canFloat: false,
      canMinimize: false,
      defaultRecipeSlot: 'editor-center',
      validPlacements: ['active-window', 'window-center', 'window-edge', 'root-edge'],
    }),
    cardinality: 'multi',
    closePolicy: { reason: 'placeholder surfaces are replaced, not closed', type: 'block' },
    id: placeholderSurfaceId(contextKey),
    lifecycle: 'placeholder',
    placement: { kind: 'recipe-slot', slot: 'editor-center' },
    stateKey: contextKey,
    title,
    type: 'placeholder',
  })
}

export function createWorkbenchWindow({
  activeSurfaceId,
  id,
  mode = 'normal',
  pinnedSurfaceIds = [],
  previewSurfaceId,
  surfaceIds,
}: {
  readonly activeSurfaceId: SurfaceId
  readonly id: WindowId
  readonly mode?: WorkbenchWindow['mode']
  readonly pinnedSurfaceIds?: readonly SurfaceId[]
  readonly previewSurfaceId?: SurfaceId
  readonly surfaceIds: readonly SurfaceId[]
}): WorkbenchWindow {
  return {
    activeSurfaceId,
    id,
    mode,
    pinnedSurfaceIds,
    previewSurfaceId,
    surfaceIds,
  }
}

export function createWindowNode({
  id,
  windowId,
}: {
  readonly id: LayoutNodeId
  readonly windowId: WindowId
}): LayoutNode {
  return {
    id,
    kind: 'window',
    windowId,
  }
}

export function createSplitNode({
  axis,
  childIds,
  id,
  sizes = balancedSizes(childIds.length),
}: {
  readonly axis: LayoutSplitAxis
  readonly childIds: readonly LayoutNodeId[]
  readonly id: LayoutNodeId
  readonly sizes?: readonly number[]
}): LayoutNode {
  return {
    axis,
    childIds,
    id,
    kind: 'split',
    sizes,
  }
}

export function classicWorkspaceRecipe(): WorkspaceRecipe {
  return {
    description:
      'Files on the side, editor in the center, and diagnostics or terminal output below.',
    id: CLASSIC_RECIPE_ID,
    resetRootNodeId: CLASSIC_ROOT_NODE_ID,
    surfaceSlots: {
      diagnostics: 'bottom',
      diff: 'editor-center',
      'file-editor': 'editor-center',
      'file-navigator': 'primary-side',
      'git-changes': 'secondary-side',
      logs: 'secondary-side',
      placeholder: 'editor-center',
      'search-preview': 'transient-preview',
      'search-results': 'primary-side',
      terminal: 'bottom',
    },
    title: 'Classic',
  }
}

export function classicLayoutPolicyState(): LayoutPolicyState {
  return {
    id: CLASSIC_POLICY_ID,
    recipeId: CLASSIC_RECIPE_ID,
    stickyPlacementsBySurfaceId: {},
  }
}

function createSingletonSurface({
  id,
  slot,
  title,
  type,
}: {
  readonly id: SurfaceId
  readonly slot: WorkspaceRecipeSlot
  readonly title: string
  readonly type: SurfaceType
}): Surface {
  return createSurface({
    capabilities: surfaceCapabilities({
      canSplit: false,
      canUnmountWhenHidden: true,
      defaultRecipeSlot: slot,
    }),
    cardinality: 'singleton',
    closePolicy: { type: 'close' },
    id,
    lifecycle: 'durable',
    placement: { kind: 'recipe-slot', slot },
    rendererLifecycle: 'unmount-when-hidden',
    resourceKey: type,
    stateKey: type,
    title,
    type,
  })
}

function createSurface({
  capabilities,
  cardinality,
  closePolicy,
  id,
  lifecycle,
  ownerContextKey,
  ownerSurfaceId,
  placement,
  rendererLifecycle,
  resourceKey,
  stateKey,
  title,
  type,
}: {
  readonly capabilities: SurfaceCapabilities
  readonly cardinality: Surface['cardinality']
  readonly closePolicy: Surface['closePolicy']
  readonly id: SurfaceId
  readonly lifecycle: Surface['lifecycle']
  readonly ownerContextKey?: string
  readonly ownerSurfaceId?: SurfaceId
  readonly placement?: SurfacePlacementHint
  readonly rendererLifecycle?: Surface['rendererLifecycle']
  readonly resourceKey?: string
  readonly stateKey?: string
  readonly title: string
  readonly type: Surface['type']
}): Surface {
  return {
    capabilities,
    cardinality,
    closePolicy,
    id,
    lifecycle,
    ownerContextKey,
    ownerSurfaceId,
    placement,
    rendererLifecycle: rendererLifecycle ?? rendererLifecycleForCapabilities(capabilities),
    resourceKey,
    serializedVersion: SURFACE_SERIALIZED_VERSION,
    stateKey,
    title,
    type,
  }
}

function surfaceCapabilities(overrides: Partial<SurfaceCapabilities> = {}): SurfaceCapabilities {
  return {
    canClose: true,
    canFloat: false,
    canMinimize: true,
    canSplit: true,
    canUnmountWhenHidden: false,
    defaultRecipeSlot: 'editor-center',
    supportsPreview: false,
    validPlacements: DEFAULT_VALID_PLACEMENTS,
    ...overrides,
  }
}

function rendererLifecycleForCapabilities(capabilities: SurfaceCapabilities) {
  if (capabilities.canUnmountWhenHidden) return 'unmount-when-hidden'

  return 'keep-mounted'
}

function emptyRailState() {
  return {
    minimizedSurfaceIds: [],
    pinnedSurfaceIds: [],
    recipeIds: [CLASSIC_RECIPE_ID],
    runningSurfaceIds: [],
    visibleSingletonSurfaceIds: [],
  }
}

function defaultRecipesById(): Readonly<Record<RecipeId, WorkspaceRecipe>> {
  return {
    [CLASSIC_RECIPE_ID]: classicWorkspaceRecipe(),
  }
}

function defaultPoliciesById(): Readonly<Record<LayoutPolicyId, LayoutPolicyState>> {
  return {
    [CLASSIC_POLICY_ID]: classicLayoutPolicyState(),
  }
}

function balancedSizes(count: number) {
  if (count === 0) return []

  return Array.from({ length: count }, () => 1 / count)
}

function pathTitle(path: string) {
  const title = path.split('/').filter(Boolean).at(-1)
  if (title) return title

  return path
}
