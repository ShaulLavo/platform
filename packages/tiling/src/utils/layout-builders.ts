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
  diffSurfaceId,
  fileEditorSurfaceId,
  fileNavigatorSurfaceId,
  gitChangesSurfaceId,
  layoutNodeId,
  logsSurfaceId,
  placeholderSurfaceId,
  searchPreviewSurfaceId,
  searchResultsDetailSurfaceId,
  searchResultsSurfaceId,
  terminalSurfaceId,
  workbenchWindowId,
} from '@workspace/tiling/utils/layout-ids'
import { balancedSizes } from '@workspace/tiling/utils/geometry-primitives'
import {
  SURFACE_REGISTRY_VERSION,
  SURFACE_SERIALIZED_VERSION,
  WORKSPACE_LAYOUT_VERSION,
  type CustomWindowFrame,
  type LayoutCommandSurfaceSlot,
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
  type WorkspaceLayoutCommand,
  type WorkspaceRecipe,
  type WorkspaceRecipeSlot,
} from '@workspace/tiling/utils/layout-types'

export const CLASSIC_ROOT_NODE_ID = layoutNodeId('classic:root')
export const CLASSIC_MAIN_NODE_ID = layoutNodeId('classic:main')
export const CLASSIC_FILE_NAVIGATOR_NODE_ID = layoutNodeId('classic:file-navigator')
export const CLASSIC_EDITOR_NODE_ID = layoutNodeId('classic:editor')
export const CLASSIC_DIAGNOSTICS_NODE_ID = layoutNodeId('classic:diagnostics')

export const CLASSIC_FILE_NAVIGATOR_WINDOW_ID = workbenchWindowId('classic:file-navigator')
export const CLASSIC_EDITOR_WINDOW_ID = workbenchWindowId('classic:editor')
export const CLASSIC_DIAGNOSTICS_WINDOW_ID = workbenchWindowId('classic:diagnostics')
export const DEFAULT_TERMINAL_SESSION_ID = 'terminal-1'
export const WINDOW_MANAGEMENT_SETTINGS_PLACEHOLDER_CONTEXT_KEY = 'window-management-settings'

const DEFAULT_VALID_PLACEMENTS = [
  'active-window',
  'window-center',
  'window-edge',
  'parent-edge',
  'root-edge',
  'background',
  'recipe-slot',
  'rail',
] as const

export type ClassicFirstRunEditorFile = {
  readonly path: string
  readonly title?: string
}

export type CreateClassicFirstRunWorkspaceLayoutOptions = {
  readonly editorFile?: ClassicFirstRunEditorFile
}

export function createEmptyWorkspaceLayout(): WorkspaceLayout {
  return {
    activeRecipeId: CLASSIC_RECIPE_ID,
    bottomPaneShare: null,
    hotkeyPresetsById: {},
    layoutCommandsById: defaultLayoutCommandsById(),
    leftToolPane: null,
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

export function createClassicFirstRunWorkspaceLayout(
  options: CreateClassicFirstRunWorkspaceLayoutOptions = {},
): WorkspaceLayout {
  const fileNavigator = createFileNavigatorSurface()
  const searchResults = createSearchResultsSurface()
  const gitChanges = createGitChangesSurface()
  const chat = createChatSurface()
  const logs = createLogsSurface()
  const editorSurface = createClassicFirstRunEditorSurface(options)
  const diagnostics = createDiagnosticsSurface()
  const terminal = createTerminalSurface({ sessionId: DEFAULT_TERMINAL_SESSION_ID })
  const sideWindow = createWorkbenchWindow({
    activeSurfaceId: fileNavigator.id,
    id: CLASSIC_FILE_NAVIGATOR_WINDOW_ID,
    pinnedSurfaceIds: [fileNavigator.id],
    surfaceIds: [fileNavigator.id],
  })
  const editorWindow = createWorkbenchWindow({
    activeSurfaceId: editorSurface.id,
    id: CLASSIC_EDITOR_WINDOW_ID,
    surfaceIds: [editorSurface.id],
  })
  const diagnosticsWindow = createWorkbenchWindow({
    activeSurfaceId: terminal.id,
    id: CLASSIC_DIAGNOSTICS_WINDOW_ID,
    pinnedSurfaceIds: [diagnostics.id],
    surfaceIds: [diagnostics.id, terminal.id],
  })

  return {
    activeRecipeId: CLASSIC_RECIPE_ID,
    activeSurfaceId: editorSurface.id,
    activeWindowId: editorWindow.id,
    bottomPaneShare: null,
    hotkeyPresetsById: {},
    layoutCommandsById: defaultLayoutCommandsById(),
    leftToolPane: null,
    mruSurfaceIds: [editorSurface.id, fileNavigator.id, terminal.id, diagnostics.id],
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
      backgroundSurfaceIds: [searchResults.id, gitChanges.id, chat.id, logs.id],
      pinnedSurfaceIds: [
        fileNavigator.id,
        searchResults.id,
        gitChanges.id,
        chat.id,
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
      [editorSurface.id]: editorSurface,
      [fileNavigator.id]: fileNavigator,
      [gitChanges.id]: gitChanges,
      [chat.id]: chat,
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

function createEmptyEditorPlaceholderSurface() {
  return createPlaceholderSurface({
    contextKey: 'empty-editor',
    title: 'No file selected',
  })
}

function createClassicFirstRunEditorSurface({
  editorFile,
}: CreateClassicFirstRunWorkspaceLayoutOptions): Surface {
  if (!editorFile) return createEmptyEditorPlaceholderSurface()

  return createFileEditorSurface(editorFile)
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
      canUnmountWhenNotExpanded: true,
      defaultRecipeSlot: 'left-tool-pane',
      supportsPreview: true,
    }),
    cardinality: 'singleton',
    closePolicy: { type: 'close' },
    id: searchResultsSurfaceId(),
    lifecycle: 'durable',
    placement: { kind: 'recipe-slot', slot: 'left-tool-pane' },
    rendererLifecycle: 'unmount-when-not-expanded',
    resourceKey: 'workspace-search',
    stateKey: 'workspace-search',
    title: 'Search',
    type: 'search-results',
  })
}

export function createSearchResultsDetailSurface(): Surface {
  return createSurface({
    capabilities: surfaceCapabilities({
      canCollapse: false,
      defaultRecipeSlot: 'editor-center',
      supportsPreview: true,
    }),
    cardinality: 'singleton',
    closePolicy: { type: 'close' },
    id: searchResultsDetailSurfaceId(),
    lifecycle: 'durable',
    placement: { kind: 'recipe-slot', slot: 'editor-center' },
    resourceKey: 'workspace-search-results',
    stateKey: 'workspace-search-results',
    title: 'Search Results',
    type: 'search-results-detail',
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
      canCollapse: false,
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
      closeRuntimePolicy: 'dispose-running-surface',
      canUnmountWhenNotExpanded: false,
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
    slot: 'left-tool-pane',
    title: 'Files',
    type: 'file-navigator',
  })
}

export function createGitChangesSurface(): Surface {
  return createSingletonSurface({
    id: gitChangesSurfaceId(),
    slot: 'left-tool-pane',
    title: 'Git Changes',
    type: 'git-changes',
  })
}

export function createLogsSurface(): Surface {
  return createSingletonSurface({
    id: logsSurfaceId(),
    slot: 'left-tool-pane',
    title: 'Logs',
    type: 'logs',
  })
}

export function createChatSurface(): Surface {
  return createSingletonSurface({
    id: chatSurfaceId(),
    slot: 'left-tool-pane',
    title: 'Chat',
    type: 'chat',
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
  canCollapse = false,
  canClose = false,
  contextKey,
  title,
}: {
  readonly canCollapse?: boolean
  readonly canClose?: boolean
  readonly contextKey: string
  readonly title: string
}): Surface {
  return createSurface({
    capabilities: surfaceCapabilities({
      canCollapse,
      canClose,
      canFloat: false,
      defaultRecipeSlot: 'editor-center',
      validPlacements: ['active-window', 'window-center', 'window-edge', 'root-edge'],
    }),
    cardinality: 'multi',
    closePolicy: canClose
      ? { type: 'close' }
      : { reason: 'placeholder surfaces are replaced, not closed', type: 'block' },
    id: placeholderSurfaceId(contextKey),
    lifecycle: 'placeholder',
    placement: { kind: 'recipe-slot', slot: 'editor-center' },
    stateKey: contextKey,
    title,
    type: 'placeholder',
  })
}

export function createWindowManagementSettingsSurface(): Surface {
  return createPlaceholderSurface({
    canClose: true,
    contextKey: WINDOW_MANAGEMENT_SETTINGS_PLACEHOLDER_CONTEXT_KEY,
    title: 'Window Management Settings',
  })
}

export function createWorkbenchWindow({
  activeSurfaceId,
  collapsedEdge,
  id,
  mode = 'normal',
  pinnedSurfaceIds = [],
  previewSurfaceId,
  surfaceIds,
}: {
  readonly activeSurfaceId: SurfaceId
  readonly collapsedEdge?: WorkbenchWindow['collapsedEdge']
  readonly id: WindowId
  readonly mode?: WorkbenchWindow['mode']
  readonly pinnedSurfaceIds?: readonly SurfaceId[]
  readonly previewSurfaceId?: SurfaceId
  readonly surfaceIds: readonly SurfaceId[]
}): WorkbenchWindow {
  const window = {
    activeSurfaceId,
    id,
    mode,
    pinnedSurfaceIds,
    previewSurfaceId,
    surfaceIds,
  } satisfies WorkbenchWindow
  if (mode !== 'collapsed') return window
  if (!collapsedEdge) return window

  return {
    ...window,
    collapsedEdge,
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
      chat: 'left-tool-pane',
      diff: 'editor-center',
      'file-editor': 'editor-center',
      'file-navigator': 'left-tool-pane',
      'git-changes': 'left-tool-pane',
      logs: 'left-tool-pane',
      placeholder: 'editor-center',
      'search-preview': 'transient-preview',
      'search-results': 'left-tool-pane',
      'search-results-detail': 'editor-center',
      terminal: 'bottom',
    },
    title: 'Classic',
  }
}

export function searchInvestigateWorkspaceRecipe(): WorkspaceRecipe {
  return {
    description:
      'Search results on the side, contextual previews near results, and files in the main editor.',
    id: SEARCH_INVESTIGATE_RECIPE_ID,
    surfaceSlots: {
      diagnostics: 'bottom',
      chat: 'left-tool-pane',
      diff: 'editor-center',
      'file-editor': 'editor-center',
      'file-navigator': 'left-tool-pane',
      'git-changes': 'rail',
      logs: 'left-tool-pane',
      placeholder: 'editor-center',
      'search-preview': 'transient-preview',
      'search-results': 'left-tool-pane',
      'search-results-detail': 'editor-center',
      terminal: 'bottom',
    },
    title: 'Search And Investigate',
  }
}

export function reviewWorkspaceRecipe(): WorkspaceRecipe {
  return {
    description:
      'Git changes and search context on the side, diffs in the editor, and checks below.',
    id: REVIEW_RECIPE_ID,
    surfaceSlots: {
      diagnostics: 'bottom',
      chat: 'left-tool-pane',
      diff: 'editor-center',
      'file-editor': 'editor-center',
      'file-navigator': 'rail',
      'git-changes': 'left-tool-pane',
      logs: 'bottom',
      placeholder: 'editor-center',
      'search-preview': 'transient-preview',
      'search-results': 'left-tool-pane',
      'search-results-detail': 'editor-center',
      terminal: 'bottom',
    },
    title: 'Review',
  }
}

export function agentPairingWorkspaceRecipe(): WorkspaceRecipe {
  return {
    description:
      'A placeholder pairing workflow with chat on the side and logs or terminal output below.',
    id: AGENT_PAIRING_RECIPE_ID,
    surfaceSlots: {
      diagnostics: 'bottom',
      chat: 'left-tool-pane',
      diff: 'editor-center',
      'file-editor': 'editor-center',
      'file-navigator': 'rail',
      'git-changes': 'rail',
      logs: 'bottom',
      placeholder: 'editor-center',
      'search-preview': 'transient-preview',
      'search-results': 'rail',
      'search-results-detail': 'editor-center',
      terminal: 'bottom',
    },
    title: 'Agent Pairing',
  }
}

export function focusWorkspaceRecipe(): WorkspaceRecipe {
  return {
    description: 'Editors stay central while supporting tools stay in the rail until opened.',
    id: FOCUS_RECIPE_ID,
    surfaceSlots: {
      diagnostics: 'rail',
      chat: 'rail',
      diff: 'editor-center',
      'file-editor': 'editor-center',
      'file-navigator': 'rail',
      'git-changes': 'rail',
      logs: 'rail',
      placeholder: 'editor-center',
      'search-preview': 'transient-preview',
      'search-results': 'rail',
      'search-results-detail': 'editor-center',
      terminal: 'rail',
    },
    title: 'Focus',
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
      canUnmountWhenNotExpanded: true,
      defaultRecipeSlot: slot,
    }),
    cardinality: 'singleton',
    closePolicy: { type: 'close' },
    id,
    lifecycle: 'durable',
    placement: { kind: 'recipe-slot', slot },
    rendererLifecycle: 'unmount-when-not-expanded',
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
  const closeRuntimePolicy = overrides.closeRuntimePolicy ?? 'close'

  return {
    canCollapse: true,
    canClose: true,
    canFloat: false,
    canSplit: true,
    canUnmountWhenNotExpanded: false,
    closeRuntimePolicy,
    defaultRecipeSlot: 'editor-center',
    supportsPreview: false,
    validPlacements: DEFAULT_VALID_PLACEMENTS,
    ...overrides,
  }
}

function rendererLifecycleForCapabilities(capabilities: SurfaceCapabilities) {
  if (capabilities.canUnmountWhenNotExpanded) return 'unmount-when-not-expanded'

  return 'keep-mounted'
}

function emptyRailState() {
  return {
    backgroundSurfaceIds: [],
    pinnedSurfaceIds: [],
    recipeIds: [CLASSIC_RECIPE_ID],
    runningSurfaceIds: [],
    visibleSingletonSurfaceIds: [],
  }
}

function defaultRecipesById(): Readonly<Record<RecipeId, WorkspaceRecipe>> {
  return {
    [AGENT_PAIRING_RECIPE_ID]: agentPairingWorkspaceRecipe(),
    [CLASSIC_RECIPE_ID]: classicWorkspaceRecipe(),
    [FOCUS_RECIPE_ID]: focusWorkspaceRecipe(),
    [REVIEW_RECIPE_ID]: reviewWorkspaceRecipe(),
    [SEARCH_INVESTIGATE_RECIPE_ID]: searchInvestigateWorkspaceRecipe(),
  }
}

function defaultLayoutCommandsById(): WorkspaceLayout['layoutCommandsById'] {
  const reviewCommand = reviewLayoutCommand()

  return {
    [reviewCommand.id]: reviewCommand,
  }
}

function reviewLayoutCommand(): WorkspaceLayoutCommand {
  return {
    aliases: ['git review', 'review changes', 'code review'],
    enabled: true,
    icon: 'git-pull-request',
    id: REVIEW_LAYOUT_COMMAND_ID,
    recipeId: REVIEW_RECIPE_ID,
    slots: [
      recipeCommandSlot({
        frame: layoutCommandFrame('left'),
        id: 'search',
        slot: 'left-tool-pane',
        surfaceType: 'search-results',
      }),
      recipeCommandSlot({
        frame: layoutCommandFrame('bottom'),
        id: 'diagnostics',
        slot: 'bottom',
        surfaceType: 'diagnostics',
      }),
      recipeCommandSlot({
        frame: layoutCommandFrame('left'),
        id: 'git-changes',
        slot: 'left-tool-pane',
        surfaceType: 'git-changes',
      }),
    ],
    title: 'Review Workspace',
  }
}

function recipeCommandSlot({
  frame,
  id,
  slot,
  surfaceType,
}: {
  readonly frame: CustomWindowFrame
  readonly id: string
  readonly slot: WorkspaceRecipeSlot
  readonly surfaceType: LayoutCommandSurfaceSlot['surfaceType']
}): LayoutCommandSurfaceSlot {
  return {
    displayHint: { kind: 'recipe-slot', slot },
    frame,
    id,
    surfaceType,
  }
}

function layoutCommandFrame(anchor: CustomWindowFrame['anchor']): CustomWindowFrame {
  if (anchor === 'bottom') {
    return { anchor, height: 28, offsetX: 0, offsetY: 0, unit: 'percent', width: 100 }
  }
  if (anchor === 'left') {
    return { anchor, height: 100, offsetX: 0, offsetY: 0, unit: 'percent', width: 28 }
  }

  return { anchor, height: 100, offsetX: 0, offsetY: 0, unit: 'percent', width: 100 }
}

function defaultPoliciesById(): Readonly<Record<LayoutPolicyId, LayoutPolicyState>> {
  return {
    [CLASSIC_POLICY_ID]: classicLayoutPolicyState(),
  }
}

function pathTitle(path: string) {
  const title = path.split('/').filter(Boolean).at(-1)
  if (title) return title

  return path
}
