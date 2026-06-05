export const WORKSPACE_LAYOUT_VERSION = 1
export const SURFACE_REGISTRY_VERSION = 1
export const SURFACE_SERIALIZED_VERSION = 1

type Brand<TValue, TBrand extends string> = TValue & { readonly __brand: TBrand }

export type SurfaceId = Brand<string, 'SurfaceId'>
export type WindowId = Brand<string, 'WindowId'>
export type LayoutNodeId = Brand<string, 'LayoutNodeId'>
export type RecipeId = Brand<string, 'RecipeId'>
export type LayoutPolicyId = Brand<string, 'LayoutPolicyId'>
export type OverlayId = Brand<string, 'OverlayId'>

export type SerializedWorkspaceLayoutVersion = typeof WORKSPACE_LAYOUT_VERSION
export type SurfaceRegistryVersion = typeof SURFACE_REGISTRY_VERSION
export type SerializedSurfaceVersion = typeof SURFACE_SERIALIZED_VERSION

export type SurfaceType =
  | 'diagnostics'
  | 'diff'
  | 'file-editor'
  | 'file-navigator'
  | 'git-changes'
  | 'placeholder'
  | 'search-preview'
  | 'search-results'
  | 'terminal'

export type SurfaceLifecycle = 'durable' | 'placeholder' | 'running' | 'transient'
export type SurfaceCardinality = 'multi' | 'singleton' | 'singleton-per-context'
export type SurfaceRendererLifecycle = 'keep-mounted' | 'unmount-when-hidden'

export type SurfaceClosePolicy =
  | { readonly type: 'block'; readonly reason: string }
  | { readonly type: 'close' }
  | { readonly type: 'confirm-dirty-file'; readonly path: string }
  | { readonly type: 'dispose-running-surface'; readonly sessionId: string }

export type WorkspaceRecipeSlot =
  | 'bottom'
  | 'editor-center'
  | 'primary-side'
  | 'rail'
  | 'secondary-side'
  | 'transient-preview'

export type SurfacePlacementKind =
  | 'active-window'
  | 'parent-edge'
  | 'rail'
  | 'recipe-slot'
  | 'root-edge'
  | 'window-center'
  | 'window-edge'

export type DropEdge = 'bottom' | 'left' | 'right' | 'top'
export type LayoutSplitAxis = 'horizontal' | 'vertical'

export type SurfacePlacementHint =
  | { readonly kind: 'active-window'; readonly tabIndex?: number }
  | { readonly kind: 'parent-edge'; readonly edge: DropEdge; readonly nodeId: LayoutNodeId }
  | { readonly kind: 'rail' }
  | { readonly kind: 'recipe-slot'; readonly slot: WorkspaceRecipeSlot }
  | { readonly kind: 'root-edge'; readonly edge: DropEdge }
  | { readonly kind: 'window-center'; readonly tabIndex?: number; readonly windowId: WindowId }
  | { readonly kind: 'window-edge'; readonly edge: DropEdge; readonly windowId: WindowId }

export type SurfaceCapabilities = {
  readonly canClose: boolean
  readonly canFloat: boolean
  readonly canMinimize: boolean
  readonly canSplit: boolean
  readonly canUnmountWhenHidden: boolean
  readonly defaultRecipeSlot: WorkspaceRecipeSlot
  readonly supportsPreview: boolean
  readonly validPlacements: readonly SurfacePlacementKind[]
}

export type Surface = {
  readonly capabilities: SurfaceCapabilities
  readonly cardinality: SurfaceCardinality
  readonly closePolicy: SurfaceClosePolicy
  readonly id: SurfaceId
  readonly lifecycle: SurfaceLifecycle
  readonly ownerContextKey?: string
  readonly ownerSurfaceId?: SurfaceId
  readonly placement?: SurfacePlacementHint
  readonly rendererLifecycle: SurfaceRendererLifecycle
  readonly resourceKey?: string
  readonly serializedState?: unknown
  readonly serializedVersion: SerializedSurfaceVersion
  readonly stateKey?: string
  readonly title: string
  readonly type: SurfaceType
}

export type WorkbenchWindowMode = 'maximized' | 'normal'

export type WorkbenchWindow = {
  readonly activeSurfaceId: SurfaceId
  readonly id: WindowId
  readonly mode: WorkbenchWindowMode
  readonly pinnedSurfaceIds: readonly SurfaceId[]
  readonly previewSurfaceId?: SurfaceId
  readonly surfaceIds: readonly SurfaceId[]
}

export type LayoutSplitNode = {
  readonly axis: LayoutSplitAxis
  readonly childIds: readonly LayoutNodeId[]
  readonly id: LayoutNodeId
  readonly kind: 'split'
  readonly sizes: readonly number[]
}

export type LayoutWindowNode = {
  readonly id: LayoutNodeId
  readonly kind: 'window'
  readonly windowId: WindowId
}

export type LayoutNode = LayoutSplitNode | LayoutWindowNode

export type RailState = {
  readonly minimizedSurfaceIds: readonly SurfaceId[]
  readonly pinnedSurfaceIds: readonly SurfaceId[]
  readonly recipeIds: readonly RecipeId[]
  readonly runningSurfaceIds: readonly SurfaceId[]
  readonly visibleSingletonSurfaceIds: readonly SurfaceId[]
}

export type WorkspaceRecipe = {
  readonly description?: string
  readonly id: RecipeId
  readonly resetRootNodeId?: LayoutNodeId
  readonly surfaceSlots: Readonly<Partial<Record<SurfaceType, WorkspaceRecipeSlot>>>
  readonly title: string
}

export type LayoutPolicyState = {
  readonly id: LayoutPolicyId
  readonly recipeId: RecipeId
  readonly stickyPlacementsBySurfaceId: Readonly<Record<string, SurfacePlacementHint>>
}

export type WorkspaceLayout = {
  readonly activeRecipeId: RecipeId
  readonly activeSurfaceId?: SurfaceId
  readonly activeWindowId?: WindowId
  readonly mruSurfaceIds: readonly SurfaceId[]
  readonly mruWindowIds: readonly WindowId[]
  readonly nodesById: Readonly<Record<LayoutNodeId, LayoutNode>>
  readonly policiesById: Readonly<Record<LayoutPolicyId, LayoutPolicyState>>
  readonly rail: RailState
  readonly recipesById: Readonly<Record<RecipeId, WorkspaceRecipe>>
  readonly rootNodeId: LayoutNodeId | null
  readonly surfaceRegistryVersion: SurfaceRegistryVersion
  readonly surfacesById: Readonly<Record<SurfaceId, Surface>>
  readonly version: SerializedWorkspaceLayoutVersion
  readonly windowsById: Readonly<Record<WindowId, WorkbenchWindow>>
}
