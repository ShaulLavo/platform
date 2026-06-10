export const WORKSPACE_LAYOUT_VERSION = 1
export const SURFACE_REGISTRY_VERSION = 1
export const SURFACE_SERIALIZED_VERSION = 1

type Brand<TValue, TBrand extends string> = TValue & { readonly __brand: TBrand }

export type SurfaceId = Brand<string, 'SurfaceId'>
export type WindowId = Brand<string, 'WindowId'>
export type LayoutNodeId = Brand<string, 'LayoutNodeId'>
export type RecipeId = Brand<string, 'RecipeId'>
export type LayoutPolicyId = Brand<string, 'LayoutPolicyId'>
export type WindowManagementCommandId = Brand<string, 'WindowManagementCommandId'>
export type LayoutCommandId = Brand<string, 'LayoutCommandId'>
export type HotkeyPresetId = Brand<string, 'HotkeyPresetId'>
export type OverlayId = Brand<string, 'OverlayId'>

export type SerializedWorkspaceLayoutVersion = typeof WORKSPACE_LAYOUT_VERSION
export type SurfaceRegistryVersion = typeof SURFACE_REGISTRY_VERSION
export type SerializedSurfaceVersion = typeof SURFACE_SERIALIZED_VERSION

export const SURFACE_TYPES = [
  'chat',
  'diagnostics',
  'diff',
  'file-editor',
  'file-navigator',
  'git-changes',
  'logs',
  'placeholder',
  'search-preview',
  'search-results',
  'terminal',
] as const

export type SurfaceType = (typeof SURFACE_TYPES)[number]

export type SurfaceLifecycle = 'durable' | 'placeholder' | 'running' | 'transient'
export type SurfaceCardinality = 'multi' | 'singleton' | 'singleton-per-context'
export type SurfaceRendererLifecycle = 'keep-mounted' | 'unmount-when-not-expanded'

export type SurfaceClosePolicy =
  | { readonly type: 'block'; readonly reason: string }
  | { readonly type: 'close' }
  | { readonly type: 'confirm-dirty-file'; readonly path: string }
  | { readonly type: 'dispose-running-surface'; readonly sessionId: string }

export type WorkspaceRecipeSlot =
  | 'bottom'
  | 'editor-center'
  | 'left-tool-pane'
  | 'rail'
  | 'transient-preview'

export type SurfacePlacementKind =
  | 'active-window'
  | 'background'
  | 'parent-edge'
  | 'rail'
  | 'recipe-slot'
  | 'root-edge'
  | 'window-center'
  | 'window-edge'

export type LayoutEdge = 'bottom' | 'left' | 'right' | 'top'
export type LayoutSplitAxis = 'horizontal' | 'vertical'

export type SurfacePlacementHint =
  | { readonly kind: 'active-window'; readonly tabIndex?: number }
  | { readonly kind: 'background' }
  | { readonly kind: 'parent-edge'; readonly edge: LayoutEdge; readonly nodeId: LayoutNodeId }
  | { readonly kind: 'rail' }
  | { readonly kind: 'recipe-slot'; readonly slot: WorkspaceRecipeSlot }
  | { readonly kind: 'root-edge'; readonly edge: LayoutEdge }
  | { readonly kind: 'window-center'; readonly tabIndex?: number; readonly windowId: WindowId }
  | { readonly kind: 'window-edge'; readonly edge: LayoutEdge; readonly windowId: WindowId }

export type SurfaceCapabilities = {
  readonly canCollapse: boolean
  readonly canClose: boolean
  readonly canFloat: boolean
  readonly canSplit: boolean
  readonly canUnmountWhenNotExpanded: boolean
  readonly closeRuntimePolicy: SurfaceClosePolicy['type']
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

export type WorkbenchWindowMode = 'collapsed' | 'fullscreen' | 'maximized' | 'normal'

export type WorkbenchWindow = {
  readonly activeSurfaceId: SurfaceId
  readonly collapsedEdge?: LayoutEdge
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
  readonly backgroundSurfaceIds: readonly SurfaceId[]
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

export type CommandIcon = string

export type CustomWindowFrame = {
  readonly anchor:
    | 'bottom'
    | 'bottom-left'
    | 'bottom-right'
    | 'center'
    | 'left'
    | 'right'
    | 'top'
    | 'top-left'
    | 'top-right'
  readonly height: number
  readonly offsetX: number
  readonly offsetY: number
  readonly unit: 'percent' | 'points'
  readonly width: number
}

export type CommandCycleRule = {
  readonly resetMs: number
  readonly scope: 'surface' | 'window' | 'workspace'
  readonly steps: readonly CustomWindowFrame[]
  readonly wrapDisplays?: boolean
}

export type CommandCycleState = {
  readonly commandId: WindowManagementCommandId
  readonly scopeKey: string
  readonly stepIndex: number
  readonly updatedAtMs: number
}

export type BuiltInWindowManagementCommand = {
  readonly aliases: readonly string[]
  readonly capabilityPredicate?: string
  readonly category: 'Window Management'
  readonly cycleRule?: CommandCycleRule
  readonly frame?: CustomWindowFrame
  readonly icon: CommandIcon
  readonly id: WindowManagementCommandId
  readonly kind: 'built-in'
  readonly operation: LayoutOperation['type']
  readonly title: string
}

export type CustomWindowManagementCommand = {
  readonly aliases: readonly string[]
  readonly category: 'Window Management'
  readonly cycleRule?: CommandCycleRule
  readonly enabled: boolean
  readonly hotkeyId?: string
  readonly icon: CommandIcon
  readonly id: WindowManagementCommandId
  readonly kind: 'custom-window'
  readonly targetFrame: CustomWindowFrame
  readonly title: string
}

export type WindowManagementCommand = BuiltInWindowManagementCommand | CustomWindowManagementCommand

export type LayoutCommandSurfaceSlot = {
  readonly displayHint?: SurfacePlacementHint
  readonly frame: CustomWindowFrame
  readonly id: string
  readonly payload?: { readonly kind: 'file' | 'quicklink' | 'url'; readonly value: string }
  readonly resourceKey?: string
  readonly stateKey?: string
  readonly surfaceType: SurfaceType
}

export type WorkspaceLayoutCommand = {
  readonly aliases: readonly string[]
  readonly enabled: boolean
  readonly hotkeyId?: string
  readonly icon: CommandIcon
  readonly id: LayoutCommandId
  readonly recipeId?: RecipeId
  readonly slots: readonly LayoutCommandSurfaceSlot[]
  readonly title: string
}

export type WindowManagementHotkeyPreset = {
  readonly bindings: Readonly<Record<string, string>>
  readonly id: HotkeyPresetId
  readonly source: 'hyprland-i3' | 'magnet' | 'platform' | 'rectangle' | 'spectacle' | 'vscode'
  readonly title: string
}

export type LayoutOperation =
  | {
      readonly surfaceId: SurfaceId
      readonly type: 'activateSurface'
      readonly windowId?: WindowId
    }
  | { readonly policyId?: LayoutPolicyId; readonly surface: Surface; readonly type: 'openSurface' }
  | { readonly surfaceId: SurfaceId; readonly type: 'closeSurface' }
  | { readonly edge?: LayoutEdge; readonly type: 'collapseWindow'; readonly windowId: WindowId }
  | { readonly type: 'expandWindow'; readonly windowId: WindowId }
  | {
      readonly placement?: SurfacePlacementHint
      readonly surfaceId: SurfaceId
      readonly type: 'restoreSurface'
    }
  | {
      readonly edge: LayoutEdge
      readonly sourceWindowId?: WindowId
      readonly surfaceId?: SurfaceId
      readonly type: 'splitWindow'
      readonly windowId: WindowId
    }
  | {
      readonly destination: SnapDestination
      readonly surfaceId: SurfaceId
      readonly type: 'moveSurface'
    }
  | {
      readonly destination: SnapDestination
      readonly type: 'moveWindow'
      readonly windowId: WindowId
    }
  | {
      readonly index?: number
      readonly surfaceId: SurfaceId
      readonly targetWindowId: WindowId
      readonly type: 'tabSurface'
    }
  | {
      readonly fromIndex: number
      readonly toIndex: number
      readonly type: 'reorderSurface'
      readonly windowId: WindowId
    }
  | {
      readonly deltaPx: number
      readonly handleIndex: number
      readonly referencePx?: number
      readonly splitId: LayoutNodeId
      readonly type: 'resizeSplit'
    }
  | { readonly type: 'fullscreenWindow'; readonly windowId: WindowId }
  | { readonly type: 'maximizeWindow'; readonly windowId: WindowId }
  | { readonly type: 'restoreWindow'; readonly windowId: WindowId }
  | { readonly recipeId: RecipeId; readonly type: 'applyRecipe' }
  | {
      readonly command: CustomWindowManagementCommand
      readonly type: 'upsertCustomWindowCommand'
    }
  | { readonly command: WorkspaceLayoutCommand; readonly type: 'upsertLayoutCommand' }
  | { readonly preset: WindowManagementHotkeyPreset; readonly type: 'applyHotkeyPreset' }
  | {
      readonly command: CustomWindowManagementCommand
      readonly nowMs?: number
      readonly targetWindowId?: WindowId
      readonly type: 'applyCustomWindowCommand'
    }
  | { readonly command: WorkspaceLayoutCommand; readonly type: 'applyLayoutCommand' }

export type SnapDestination =
  | { readonly kind: 'background' }
  | { readonly kind: 'parent-edge'; readonly edge: LayoutEdge; readonly nodeId: LayoutNodeId }
  | { readonly kind: 'rail' }
  | { readonly kind: 'recipe-slot'; readonly slot: WorkspaceRecipeSlot }
  | { readonly kind: 'root-edge'; readonly edge: LayoutEdge }
  | { readonly kind: 'window-center'; readonly tabIndex?: number; readonly windowId: WindowId }
  | { readonly kind: 'window-edge'; readonly edge: LayoutEdge; readonly windowId: WindowId }

export type WorkspaceLayout = {
  readonly activeRecipeId: RecipeId
  readonly activeHotkeyPresetId?: HotkeyPresetId
  readonly activeSurfaceId?: SurfaceId
  readonly activeWindowId?: WindowId
  readonly commandCycleState?: CommandCycleState
  readonly hotkeyPresetsById: Readonly<Record<HotkeyPresetId, WindowManagementHotkeyPreset>>
  readonly layoutCommandsById: Readonly<Record<LayoutCommandId, WorkspaceLayoutCommand>>
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
  readonly windowCommandsById: Readonly<Record<WindowManagementCommandId, WindowManagementCommand>>
  readonly windowsById: Readonly<Record<WindowId, WorkbenchWindow>>
}
