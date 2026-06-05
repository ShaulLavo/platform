import { createEmptyWorkspaceLayout } from './layout-builders'
import { builtInWindowManagementCommands } from './layout-command-catalog'
import { checkWorkspaceLayoutInvariants } from './layout-invariants'
import { normalizeWorkspaceLayout } from './layout-normalize'
import {
  defaultSurfaceRegistry,
  restoreRegisteredSurface,
  serializeRegisteredSurface,
  type SerializedSurface,
  type SurfaceRegistry,
} from './surface-registry'
import {
  SURFACE_REGISTRY_VERSION,
  WORKSPACE_LAYOUT_VERSION,
  type CommandCycleRule,
  type CustomWindowFrame,
  type CustomWindowManagementCommand,
  type DropEdge,
  type HotkeyPresetId,
  type LayoutCommandId,
  type LayoutCommandSurfaceSlot,
  type LayoutNode,
  type LayoutNodeId,
  type LayoutPolicyId,
  type LayoutPolicyState,
  type LayoutSplitAxis,
  type RecipeId,
  type RailState,
  type Surface,
  type SurfaceId,
  type SurfacePlacementHint,
  type SurfacePlacementKind,
  type SurfaceType,
  type WindowId,
  type WindowManagementCommandId,
  type WindowManagementHotkeyPreset,
  type WorkbenchWindow,
  type WorkspaceLayout,
  type WorkspaceLayoutCommand,
  type WorkspaceRecipe,
  type WorkspaceRecipeSlot,
} from './layout-types'

export type SerializedWorkspaceSurfaceEntry = {
  readonly id: SurfaceId
  readonly surface: SerializedSurface
}

export type SerializedWorkspaceLayout = {
  readonly activeHotkeyPresetId?: HotkeyPresetId
  readonly activeRecipeId: RecipeId
  readonly activeSurfaceId?: SurfaceId
  readonly activeWindowId?: WindowId
  readonly customWindowCommands: readonly CustomWindowManagementCommand[]
  readonly hotkeyPresets: readonly WindowManagementHotkeyPreset[]
  readonly layoutCommands: readonly WorkspaceLayoutCommand[]
  readonly mruSurfaceIds: readonly SurfaceId[]
  readonly mruWindowIds: readonly WindowId[]
  readonly nodes: readonly LayoutNode[]
  readonly policies: readonly LayoutPolicyState[]
  readonly rail: RailState
  readonly recipes: readonly WorkspaceRecipe[]
  readonly rootNodeId: LayoutNodeId | null
  readonly surfaceRegistryVersion: typeof SURFACE_REGISTRY_VERSION
  readonly surfaces: readonly SerializedWorkspaceSurfaceEntry[]
  readonly version: typeof WORKSPACE_LAYOUT_VERSION
  readonly windows: readonly WorkbenchWindow[]
}

export type WorkspaceLayoutRestoreWarningCode =
  | 'command-recovered'
  | 'invalid-shape'
  | 'layout-recovered'
  | 'surface-dropped'
  | 'unsupported-surface-registry-version'
  | 'unsupported-version'

export type WorkspaceLayoutRestoreWarning = {
  readonly code: WorkspaceLayoutRestoreWarningCode
  readonly message: string
}

export type WorkspaceLayoutRestoreStatus = 'recovered' | 'restored' | 'unsupported-version'

export type RestoreWorkspaceLayoutOptions = {
  readonly fallbackLayout?: WorkspaceLayout
  readonly registry?: SurfaceRegistry
  readonly rootPath: string | null
}

export type WorkspaceLayoutRestoreResult = {
  readonly layout: WorkspaceLayout
  readonly status: WorkspaceLayoutRestoreStatus
  readonly warnings: readonly WorkspaceLayoutRestoreWarning[]
}

type SurfaceRestoreResult = {
  readonly idMap: ReadonlyMap<SurfaceId, SurfaceId>
  readonly surfacesById: WorkspaceLayout['surfacesById']
  readonly warnings: readonly WorkspaceLayoutRestoreWarning[]
}

type CommandRestoreResult = {
  readonly hotkeyPresetsById: WorkspaceLayout['hotkeyPresetsById']
  readonly layoutCommandsById: WorkspaceLayout['layoutCommandsById']
  readonly warnings: readonly WorkspaceLayoutRestoreWarning[]
  readonly windowCommandsById: WorkspaceLayout['windowCommandsById']
}

type SerializedSurfaceInput = SerializedWorkspaceSurfaceEntry & {
  readonly surface: SerializedSurface
}

const CUSTOM_WINDOW_COMMAND_CATEGORY = 'Window Management' as const
const KNOWN_SURFACE_TYPES = new Set<SurfaceType>([
  'diagnostics',
  'diff',
  'file-editor',
  'file-navigator',
  'git-changes',
  'placeholder',
  'search-preview',
  'search-results',
  'terminal',
])
const KNOWN_RECIPE_SLOTS = new Set<WorkspaceRecipeSlot>([
  'bottom',
  'editor-center',
  'primary-side',
  'rail',
  'secondary-side',
  'transient-preview',
])
const KNOWN_PLACEMENT_KINDS = new Set<SurfacePlacementKind>([
  'active-window',
  'parent-edge',
  'rail',
  'recipe-slot',
  'root-edge',
  'window-center',
  'window-edge',
])
const KNOWN_DROP_EDGES = new Set<DropEdge>(['bottom', 'left', 'right', 'top'])
const KNOWN_SPLIT_AXES = new Set<LayoutSplitAxis>(['horizontal', 'vertical'])
const KNOWN_FRAME_ANCHORS = new Set<CustomWindowFrame['anchor']>([
  'bottom',
  'bottom-left',
  'bottom-right',
  'center',
  'left',
  'right',
  'top',
  'top-left',
  'top-right',
])
const KNOWN_HOTKEY_PRESET_SOURCES = new Set<WindowManagementHotkeyPreset['source']>([
  'hyprland-i3',
  'magnet',
  'platform',
  'rectangle',
  'spectacle',
  'vscode',
])

export function serializeWorkspaceLayout(
  layout: WorkspaceLayout,
  registry: SurfaceRegistry = defaultSurfaceRegistry,
): SerializedWorkspaceLayout {
  return {
    activeHotkeyPresetId: layout.activeHotkeyPresetId,
    activeRecipeId: layout.activeRecipeId,
    activeSurfaceId: layout.activeSurfaceId,
    activeWindowId: layout.activeWindowId,
    customWindowCommands: customWindowCommandsForSerialization(layout),
    hotkeyPresets: Object.values(layout.hotkeyPresetsById),
    layoutCommands: Object.values(layout.layoutCommandsById),
    mruSurfaceIds: layout.mruSurfaceIds,
    mruWindowIds: layout.mruWindowIds,
    nodes: Object.values(layout.nodesById),
    policies: Object.values(layout.policiesById),
    rail: layout.rail,
    recipes: Object.values(layout.recipesById),
    rootNodeId: layout.rootNodeId,
    surfaceRegistryVersion: SURFACE_REGISTRY_VERSION,
    surfaces: serializedSurfaceEntries(layout, registry),
    version: WORKSPACE_LAYOUT_VERSION,
    windows: Object.values(layout.windowsById),
  }
}

export function restoreWorkspaceLayout(
  data: unknown,
  options: RestoreWorkspaceLayoutOptions,
): WorkspaceLayoutRestoreResult {
  const fallbackLayout = normalizeWorkspaceLayout(
    options.fallbackLayout ?? createEmptyWorkspaceLayout(),
  )
  const registry = options.registry ?? defaultSurfaceRegistry
  if (!isRecord(data)) {
    return fallbackRestoreResult(
      fallbackLayout,
      'invalid-shape',
      'Serialized layout is not an object.',
    )
  }
  if (data.version !== WORKSPACE_LAYOUT_VERSION) {
    return fallbackRestoreResult(
      fallbackLayout,
      'unsupported-version',
      `Unsupported workspace layout version: ${String(data.version)}.`,
    )
  }

  const warnings = registryVersionWarnings(data)
  const surfaces = restoreSurfaceEntries(data.surfaces, registry, options.rootPath)
  const commandResult = restoreCommands(data)
  const layout = restoreLayoutFromData(data, fallbackLayout, surfaces, commandResult)
  const recoveredLayout = normalizeAndRecoverLayout(layout, fallbackLayout, [
    ...warnings,
    ...surfaces.warnings,
    ...commandResult.warnings,
  ])

  return recoveredLayout
}

function customWindowCommandsForSerialization(layout: WorkspaceLayout) {
  return Object.values(layout.windowCommandsById).filter(
    (command): command is CustomWindowManagementCommand => command.kind === 'custom-window',
  )
}

function serializedSurfaceEntries(
  layout: WorkspaceLayout,
  registry: SurfaceRegistry,
): readonly SerializedWorkspaceSurfaceEntry[] {
  const entries: SerializedWorkspaceSurfaceEntry[] = []

  for (const surface of Object.values(layout.surfacesById)) {
    const serialized = serializeRegisteredSurface(registry, surface)
    if (!serialized) continue

    entries.push({ id: surface.id, surface: serialized })
  }

  return entries
}

function fallbackRestoreResult(
  fallbackLayout: WorkspaceLayout,
  code: WorkspaceLayoutRestoreWarningCode,
  message: string,
): WorkspaceLayoutRestoreResult {
  return {
    layout: fallbackLayout,
    status: code === 'unsupported-version' ? 'unsupported-version' : 'recovered',
    warnings: [{ code, message }],
  }
}

function registryVersionWarnings(data: Record<string, unknown>) {
  if (data.surfaceRegistryVersion === SURFACE_REGISTRY_VERSION) return []

  return [
    {
      code: 'unsupported-surface-registry-version',
      message: `Serialized surface registry version ${String(
        data.surfaceRegistryVersion,
      )} does not match ${SURFACE_REGISTRY_VERSION}.`,
    },
  ] satisfies readonly WorkspaceLayoutRestoreWarning[]
}

function restoreSurfaceEntries(
  value: unknown,
  registry: SurfaceRegistry,
  rootPath: string | null,
): SurfaceRestoreResult {
  const entries = serializedSurfaceInputs(value)
  const firstPass = restoreSurfacePass(entries, registry, rootPath, new Map(), false)
  const secondPass = restoreSurfacePass(
    entries,
    registry,
    rootPath,
    firstPass.idMap,
    true,
    firstPass.surfacesById,
  )

  return {
    idMap: secondPass.idMap,
    surfacesById: secondPass.surfacesById,
    warnings: surfaceRestoreWarnings(entries, secondPass),
  }
}

function restoreSurfacePass(
  entries: readonly SerializedSurfaceInput[],
  registry: SurfaceRegistry,
  rootPath: string | null,
  seedIdMap: ReadonlyMap<SurfaceId, SurfaceId>,
  includeOwnedSurfaces: boolean,
  seedSurfacesById: Readonly<Record<string, Surface>> = {},
) {
  const idMap = new Map(seedIdMap)
  const surfacesById: Record<string, Surface> = { ...seedSurfacesById }

  for (const entry of entries) {
    if (surfaceNeedsOwnerPass(entry) !== includeOwnedSurfaces) continue

    const surface = restoreRegisteredSurface(registry, mappedOwnerSurface(entry.surface, idMap), {
      rootPath,
      surfacesById,
    })
    if (!surface) continue

    idMap.set(entry.id, surface.id)
    surfacesById[surface.id] = surface
  }

  return { idMap, surfacesById }
}

function surfaceRestoreWarnings(
  entries: readonly SerializedSurfaceInput[],
  result: ReturnType<typeof restoreSurfacePass>,
) {
  const warnings: WorkspaceLayoutRestoreWarning[] = []

  for (const entry of entries) {
    if (result.idMap.has(entry.id)) continue

    warnings.push({
      code: 'surface-dropped',
      message: `Surface ${entry.id} could not be restored and was dropped.`,
    })
  }

  return warnings
}

function surfaceNeedsOwnerPass(entry: SerializedSurfaceInput) {
  return Boolean(entry.surface.ownerSurfaceId || entry.surface.ownerContextKey)
}

function mappedOwnerSurface(
  surface: SerializedSurface,
  idMap: ReadonlyMap<SurfaceId, SurfaceId>,
): SerializedSurface {
  if (!surface.ownerSurfaceId) return surface

  return {
    ...surface,
    ownerSurfaceId: idMap.get(surface.ownerSurfaceId) ?? surface.ownerSurfaceId,
  }
}

function restoreCommands(data: Record<string, unknown>): CommandRestoreResult {
  const windowCommandsById = restoredCustomWindowCommands(data.customWindowCommands)
  const layoutCommandResult = restoredLayoutCommands(data.layoutCommands)
  const knownCommandIds = knownHotkeyCommandIds(
    windowCommandsById,
    layoutCommandResult.commandsById,
  )
  const hotkeyPresetResult = restoredHotkeyPresets(data.hotkeyPresets, knownCommandIds)

  return {
    hotkeyPresetsById: hotkeyPresetResult.presetsById,
    layoutCommandsById: layoutCommandResult.commandsById,
    warnings: [
      ...commandRecoveryWarnings(layoutCommandResult.droppedSlotCount, 'layout command slots'),
      ...commandRecoveryWarnings(hotkeyPresetResult.droppedBindingCount, 'hotkey bindings'),
    ],
    windowCommandsById,
  }
}

function restoreLayoutFromData(
  data: Record<string, unknown>,
  fallbackLayout: WorkspaceLayout,
  surfaces: SurfaceRestoreResult,
  commandResult: CommandRestoreResult,
): WorkspaceLayout {
  const recipesById = recordsById([
    ...Object.values(fallbackLayout.recipesById),
    ...restoredRecipes(data.recipes),
  ])
  const policiesById = recordsById([
    ...Object.values(fallbackLayout.policiesById),
    ...restoredPolicies(data.policies, surfaces.idMap),
  ])
  const activeRecipeId = restoredRecipeId(
    data.activeRecipeId,
    fallbackLayout.activeRecipeId,
    recipesById,
  )
  const activeHotkeyPresetId = restoredActiveHotkeyPresetId(
    data.activeHotkeyPresetId,
    commandResult.hotkeyPresetsById,
  )

  return {
    activeRecipeId,
    activeHotkeyPresetId,
    activeSurfaceId: mapOptionalSurfaceId(data.activeSurfaceId, surfaces.idMap),
    activeWindowId: optionalWindowId(data.activeWindowId),
    commandCycleState: undefined,
    hotkeyPresetsById: commandResult.hotkeyPresetsById,
    layoutCommandsById: commandResult.layoutCommandsById,
    mruSurfaceIds: mapSurfaceIds(data.mruSurfaceIds, surfaces.idMap),
    mruWindowIds: windowIds(data.mruWindowIds),
    nodesById: recordsById(restoredNodes(data.nodes)),
    policiesById,
    rail: restoredRail(data.rail, surfaces.idMap, fallbackLayout.rail),
    recipesById,
    rootNodeId: optionalNodeId(data.rootNodeId),
    surfaceRegistryVersion: SURFACE_REGISTRY_VERSION,
    surfacesById: surfaces.surfacesById,
    version: WORKSPACE_LAYOUT_VERSION,
    windowCommandsById: commandResult.windowCommandsById,
    windowsById: recordsById(restoredWindows(data.windows, surfaces.idMap)),
  }
}

function normalizeAndRecoverLayout(
  layout: WorkspaceLayout,
  fallbackLayout: WorkspaceLayout,
  warnings: readonly WorkspaceLayoutRestoreWarning[],
): WorkspaceLayoutRestoreResult {
  const preNormalizeReport = checkWorkspaceLayoutInvariants(layout)
  const normalizedLayout = normalizeWorkspaceLayout(layout)
  const normalizedReport = checkWorkspaceLayoutInvariants(normalizedLayout)
  const recoveryWarnings = layoutRecoveryWarnings(warnings, preNormalizeReport.ok)
  if (normalizedReport.ok) {
    return {
      layout: normalizedLayout,
      status: recoveryWarnings.length > 0 ? 'recovered' : 'restored',
      warnings: recoveryWarnings,
    }
  }

  return recoverCorruptLayoutTree(normalizedLayout, fallbackLayout, recoveryWarnings)
}

function recoverCorruptLayoutTree(
  layout: WorkspaceLayout,
  fallbackLayout: WorkspaceLayout,
  warnings: readonly WorkspaceLayoutRestoreWarning[],
): WorkspaceLayoutRestoreResult {
  const recoveredLayout = normalizeWorkspaceLayout({
    ...fallbackLayout,
    activeSurfaceId: undefined,
    activeWindowId: undefined,
    commandCycleState: undefined,
    hotkeyPresetsById: layout.hotkeyPresetsById,
    layoutCommandsById: layout.layoutCommandsById,
    mruSurfaceIds: layout.mruSurfaceIds,
    mruWindowIds: [],
    nodesById: {},
    rail: layout.rail,
    rootNodeId: null,
    surfacesById: layout.surfacesById,
    windowCommandsById: layout.windowCommandsById,
    windowsById: {},
  })

  return {
    layout: recoveredLayout,
    status: 'recovered',
    warnings: warnings.concat({
      code: 'layout-recovered',
      message:
        'Serialized layout tree stayed invalid after normalization; restored surfaces were recovered into fallback placement.',
    }),
  }
}

function layoutRecoveryWarnings(
  warnings: readonly WorkspaceLayoutRestoreWarning[],
  preNormalizeOk: boolean,
) {
  if (preNormalizeOk) return warnings

  return warnings.concat({
    code: 'layout-recovered',
    message: 'Serialized layout tree was repaired during restore.',
  })
}

function restoredCustomWindowCommands(value: unknown) {
  const commandsById: Record<string, CustomWindowManagementCommand> = {}

  for (const command of arrayValues(value)) {
    const restored = restoredCustomWindowCommand(command)
    if (!restored) continue

    commandsById[restored.id] = restored
  }

  return commandsById
}

function restoredCustomWindowCommand(value: unknown): CustomWindowManagementCommand | null {
  if (!isRecord(value)) return null
  if (value.kind !== 'custom-window') return null
  if (!isString(value.id)) return null
  if (!isString(value.title)) return null
  if (!isString(value.icon)) return null
  if (typeof value.enabled !== 'boolean') return null

  const targetFrame = restoredFrame(value.targetFrame)
  if (!targetFrame) return null

  return {
    aliases: stringArray(value.aliases),
    category: CUSTOM_WINDOW_COMMAND_CATEGORY,
    cycleRule: restoredCycleRule(value.cycleRule),
    enabled: value.enabled,
    icon: value.icon,
    id: value.id as WindowManagementCommandId,
    kind: 'custom-window',
    targetFrame,
    title: value.title,
  }
}

function restoredLayoutCommands(value: unknown) {
  const commandsById: Record<string, WorkspaceLayoutCommand> = {}
  let droppedSlotCount = 0

  for (const command of arrayValues(value)) {
    const restored = restoredLayoutCommand(command)
    if (!restored) continue

    droppedSlotCount += restored.droppedSlotCount
    commandsById[restored.command.id] = restored.command
  }

  return { commandsById, droppedSlotCount }
}

function restoredLayoutCommand(value: unknown) {
  if (!isRecord(value)) return null
  if (!isString(value.id)) return null
  if (!isString(value.title)) return null
  if (!isString(value.icon)) return null
  if (typeof value.enabled !== 'boolean') return null

  const rawSlots = arrayValues(value.slots)
  const slots = rawSlots.map(restoredLayoutCommandSlot).filter(isLayoutCommandSlot)

  return {
    command: {
      aliases: stringArray(value.aliases),
      enabled: value.enabled && slots.length > 0,
      hotkeyId: optionalString(value.hotkeyId),
      icon: value.icon,
      id: value.id as LayoutCommandId,
      slots,
      title: value.title,
    },
    droppedSlotCount: rawSlots.length - slots.length,
  }
}

function restoredLayoutCommandSlot(value: unknown): LayoutCommandSurfaceSlot | null {
  if (!isRecord(value)) return null
  if (!isString(value.id)) return null
  if (!isSurfaceType(value.surfaceType)) return null

  const frame = restoredFrame(value.frame)
  if (!frame) return null

  return {
    displayHint: restoredPlacementHint(value.displayHint),
    frame,
    id: value.id,
    payload: restoredLayoutCommandPayload(value.payload),
    resourceKey: optionalString(value.resourceKey),
    stateKey: optionalString(value.stateKey),
    surfaceType: value.surfaceType,
  }
}

function restoredLayoutCommandPayload(value: unknown) {
  if (!isRecord(value)) return undefined
  if (!isString(value.value)) return undefined
  if (value.kind !== 'file' && value.kind !== 'quicklink' && value.kind !== 'url') return undefined

  return {
    kind: value.kind,
    value: value.value,
  }
}

function restoredHotkeyPresets(value: unknown, knownCommandIds: ReadonlySet<string>) {
  const presetsById: Record<string, WindowManagementHotkeyPreset> = {}
  let droppedBindingCount = 0

  for (const preset of arrayValues(value)) {
    const restored = restoredHotkeyPreset(preset, knownCommandIds)
    if (!restored) continue

    droppedBindingCount += restored.droppedBindingCount
    presetsById[restored.preset.id] = restored.preset
  }

  return { droppedBindingCount, presetsById }
}

function restoredHotkeyPreset(value: unknown, knownCommandIds: ReadonlySet<string>) {
  if (!isRecord(value)) return null
  if (!isString(value.id)) return null
  if (!isString(value.title)) return null
  if (!isHotkeyPresetSource(value.source)) return null
  if (!isRecord(value.bindings)) return null

  const bindings = restoredHotkeyBindings(value.bindings, knownCommandIds)

  return {
    droppedBindingCount: Object.keys(value.bindings).length - Object.keys(bindings).length,
    preset: {
      bindings,
      id: value.id as HotkeyPresetId,
      source: value.source,
      title: value.title,
    },
  }
}

function restoredHotkeyBindings(
  value: Record<string, unknown>,
  knownCommandIds: ReadonlySet<string>,
) {
  const bindings: Record<string, string> = {}

  for (const [commandId, binding] of Object.entries(value)) {
    if (!isString(binding)) continue
    if (!knownCommandIds.has(commandId)) continue

    bindings[commandId] = binding
  }

  return bindings
}

function knownHotkeyCommandIds(
  windowCommandsById: WorkspaceLayout['windowCommandsById'],
  layoutCommandsById: WorkspaceLayout['layoutCommandsById'],
) {
  return new Set([
    ...builtInWindowManagementCommands().map((command) => command.id),
    ...Object.keys(windowCommandsById),
    ...Object.keys(layoutCommandsById),
  ])
}

function commandRecoveryWarnings(count: number, label: string) {
  if (count === 0) return []

  return [
    {
      code: 'command-recovered',
      message: `${count} invalid ${label} were dropped during layout restore.`,
    },
  ] satisfies readonly WorkspaceLayoutRestoreWarning[]
}

function restoredWindows(value: unknown, idMap: ReadonlyMap<SurfaceId, SurfaceId>) {
  const windows: WorkbenchWindow[] = []

  for (const item of arrayValues(value)) {
    const window = restoredWindow(item, idMap)
    if (!window) continue

    windows.push(window)
  }

  return windows
}

function restoredWindow(
  value: unknown,
  idMap: ReadonlyMap<SurfaceId, SurfaceId>,
): WorkbenchWindow | null {
  if (!isRecord(value)) return null
  if (!isString(value.id)) return null

  const surfaceIds = mapSurfaceIds(value.surfaceIds, idMap)
  const activeSurfaceId = mapOptionalSurfaceId(value.activeSurfaceId, idMap) ?? surfaceIds[0]
  if (!activeSurfaceId) return null

  return {
    activeSurfaceId,
    id: value.id as WindowId,
    mode: value.mode === 'maximized' ? 'maximized' : 'normal',
    pinnedSurfaceIds: mapSurfaceIds(value.pinnedSurfaceIds, idMap).filter((surfaceId) =>
      surfaceIds.includes(surfaceId),
    ),
    previewSurfaceId: mapOptionalSurfaceId(value.previewSurfaceId, idMap),
    surfaceIds,
  }
}

function restoredNodes(value: unknown) {
  const nodes: LayoutNode[] = []

  for (const item of arrayValues(value)) {
    const node = restoredNode(item)
    if (!node) continue

    nodes.push(node)
  }

  return nodes
}

function restoredNode(value: unknown): LayoutNode | null {
  if (!isRecord(value)) return null
  if (!isString(value.id)) return null
  if (value.kind === 'window') return restoredWindowNode(value)
  if (value.kind === 'split') return restoredSplitNode(value)

  return null
}

function restoredWindowNode(value: Record<string, unknown>): LayoutNode | null {
  if (!isString(value.windowId)) return null

  return {
    id: value.id as LayoutNodeId,
    kind: 'window',
    windowId: value.windowId as WindowId,
  }
}

function restoredSplitNode(value: Record<string, unknown>): LayoutNode | null {
  if (!isSplitAxis(value.axis)) return null

  return {
    axis: value.axis,
    childIds: nodeIds(value.childIds),
    id: value.id as LayoutNodeId,
    kind: 'split',
    sizes: numberArray(value.sizes),
  }
}

function restoredRail(
  value: unknown,
  idMap: ReadonlyMap<SurfaceId, SurfaceId>,
  fallbackRail: RailState,
): RailState {
  if (!isRecord(value)) return fallbackRail

  return {
    minimizedSurfaceIds: mapSurfaceIds(value.minimizedSurfaceIds, idMap),
    pinnedSurfaceIds: mapSurfaceIds(value.pinnedSurfaceIds, idMap),
    recipeIds: recipeIds(value.recipeIds),
    runningSurfaceIds: mapSurfaceIds(value.runningSurfaceIds, idMap),
    visibleSingletonSurfaceIds: mapSurfaceIds(value.visibleSingletonSurfaceIds, idMap),
  }
}

function restoredRecipes(value: unknown) {
  const recipes: WorkspaceRecipe[] = []

  for (const item of arrayValues(value)) {
    const recipe = restoredRecipe(item)
    if (!recipe) continue

    recipes.push(recipe)
  }

  return recipes
}

function restoredRecipe(value: unknown): WorkspaceRecipe | null {
  if (!isRecord(value)) return null
  if (!isString(value.id)) return null
  if (!isString(value.title)) return null
  if (!isRecord(value.surfaceSlots)) return null

  return {
    description: optionalString(value.description),
    id: value.id as RecipeId,
    resetRootNodeId: optionalNodeId(value.resetRootNodeId),
    surfaceSlots: restoredRecipeSlots(value.surfaceSlots),
    title: value.title,
  }
}

function restoredRecipeSlots(value: Record<string, unknown>) {
  const slots: Partial<Record<SurfaceType, WorkspaceRecipeSlot>> = {}

  for (const [surfaceType, slot] of Object.entries(value)) {
    if (!isSurfaceType(surfaceType)) continue
    if (!isRecipeSlot(slot)) continue

    slots[surfaceType] = slot
  }

  return slots
}

function restoredPolicies(value: unknown, idMap: ReadonlyMap<SurfaceId, SurfaceId>) {
  const policies: LayoutPolicyState[] = []

  for (const item of arrayValues(value)) {
    const policy = restoredPolicy(item, idMap)
    if (!policy) continue

    policies.push(policy)
  }

  return policies
}

function restoredPolicy(
  value: unknown,
  idMap: ReadonlyMap<SurfaceId, SurfaceId>,
): LayoutPolicyState | null {
  if (!isRecord(value)) return null
  if (!isString(value.id)) return null
  if (!isString(value.recipeId)) return null

  return {
    id: value.id as LayoutPolicyId,
    recipeId: value.recipeId as RecipeId,
    stickyPlacementsBySurfaceId: restoredStickyPlacements(value.stickyPlacementsBySurfaceId, idMap),
  }
}

function restoredStickyPlacements(value: unknown, idMap: ReadonlyMap<SurfaceId, SurfaceId>) {
  const placements: Record<string, SurfacePlacementHint> = {}
  if (!isRecord(value)) return placements

  for (const [surfaceId, placement] of Object.entries(value)) {
    const mappedSurfaceId = idMap.get(surfaceId as SurfaceId)
    const restored = restoredPlacementHint(placement)
    if (!mappedSurfaceId || !restored) continue

    placements[mappedSurfaceId] = restored
  }

  return placements
}

function restoredPlacementHint(value: unknown): SurfacePlacementHint | undefined {
  if (!isRecord(value)) return undefined
  if (!isPlacementKind(value.kind)) return undefined
  if (value.kind === 'active-window')
    return { kind: value.kind, tabIndex: optionalNumber(value.tabIndex) }
  if (value.kind === 'rail') return { kind: value.kind }
  if (value.kind === 'recipe-slot') return restoredRecipeSlotPlacement(value)
  if (value.kind === 'window-center') return restoredWindowCenterPlacement(value)
  if (value.kind === 'window-edge') return restoredWindowEdgePlacement(value)
  if (value.kind === 'parent-edge') return restoredParentEdgePlacement(value)
  if (value.kind === 'root-edge') return restoredRootEdgePlacement(value)

  return undefined
}

function restoredRecipeSlotPlacement(
  value: Record<string, unknown>,
): SurfacePlacementHint | undefined {
  if (!isRecipeSlot(value.slot)) return undefined

  return { kind: 'recipe-slot', slot: value.slot }
}

function restoredWindowCenterPlacement(
  value: Record<string, unknown>,
): SurfacePlacementHint | undefined {
  if (!isString(value.windowId)) return undefined

  return {
    kind: 'window-center',
    tabIndex: optionalNumber(value.tabIndex),
    windowId: value.windowId as WindowId,
  }
}

function restoredWindowEdgePlacement(
  value: Record<string, unknown>,
): SurfacePlacementHint | undefined {
  if (!isDropEdge(value.edge)) return undefined
  if (!isString(value.windowId)) return undefined

  return {
    edge: value.edge,
    kind: 'window-edge',
    windowId: value.windowId as WindowId,
  }
}

function restoredParentEdgePlacement(
  value: Record<string, unknown>,
): SurfacePlacementHint | undefined {
  if (!isDropEdge(value.edge)) return undefined
  if (!isString(value.nodeId)) return undefined

  return {
    edge: value.edge,
    kind: 'parent-edge',
    nodeId: value.nodeId as LayoutNodeId,
  }
}

function restoredRootEdgePlacement(
  value: Record<string, unknown>,
): SurfacePlacementHint | undefined {
  if (!isDropEdge(value.edge)) return undefined

  return { edge: value.edge, kind: 'root-edge' }
}

function restoredFrame(value: unknown): CustomWindowFrame | null {
  if (!isRecord(value)) return null
  if (!isFrameAnchor(value.anchor)) return null
  if (!isFiniteNumber(value.height)) return null
  if (!isFiniteNumber(value.offsetX)) return null
  if (!isFiniteNumber(value.offsetY)) return null
  if (!isFiniteNumber(value.width)) return null
  if (value.unit !== 'percent' && value.unit !== 'points') return null

  return {
    anchor: value.anchor,
    height: value.height,
    offsetX: value.offsetX,
    offsetY: value.offsetY,
    unit: value.unit,
    width: value.width,
  }
}

function restoredCycleRule(value: unknown): CommandCycleRule | undefined {
  if (!isRecord(value)) return undefined
  if (!isFiniteNumber(value.resetMs)) return undefined
  if (value.scope !== 'surface' && value.scope !== 'window' && value.scope !== 'workspace') {
    return undefined
  }

  const steps = arrayValues(value.steps).map(restoredFrame).filter(isFrame)
  if (steps.length === 0) return undefined

  return {
    resetMs: value.resetMs,
    scope: value.scope,
    steps,
    wrapDisplays: typeof value.wrapDisplays === 'boolean' ? value.wrapDisplays : undefined,
  }
}

function restoredRecipeId(
  value: unknown,
  fallbackRecipeId: RecipeId,
  recipesById: WorkspaceLayout['recipesById'],
) {
  if (!isString(value)) return fallbackRecipeId
  if (!recipesById[value as RecipeId]) return fallbackRecipeId

  return value as RecipeId
}

function restoredActiveHotkeyPresetId(
  value: unknown,
  hotkeyPresetsById: WorkspaceLayout['hotkeyPresetsById'],
) {
  if (!isString(value)) return undefined
  if (!hotkeyPresetsById[value as HotkeyPresetId]) return undefined

  return value as HotkeyPresetId
}

function serializedSurfaceInputs(value: unknown) {
  const entries: SerializedSurfaceInput[] = []

  for (const item of arrayValues(value)) {
    if (!isSerializedSurfaceInput(item)) continue

    entries.push(item)
  }

  return entries
}

function isSerializedSurfaceInput(value: unknown): value is SerializedSurfaceInput {
  if (!isRecord(value)) return false
  if (!isString(value.id)) return false
  if (!isRecord(value.surface)) return false

  return true
}

function recordsById<TItem extends { readonly id: string }>(items: readonly TItem[]) {
  const records: Record<string, TItem> = {}

  for (const item of items) {
    records[item.id] = item
  }

  return records
}

function mapSurfaceIds(value: unknown, idMap: ReadonlyMap<SurfaceId, SurfaceId>) {
  const ids: SurfaceId[] = []

  for (const surfaceId of stringArray(value)) {
    const mappedSurfaceId = idMap.get(surfaceId as SurfaceId)
    if (!mappedSurfaceId) continue
    if (ids.includes(mappedSurfaceId)) continue

    ids.push(mappedSurfaceId)
  }

  return ids
}

function mapOptionalSurfaceId(value: unknown, idMap: ReadonlyMap<SurfaceId, SurfaceId>) {
  if (!isString(value)) return undefined

  return idMap.get(value as SurfaceId)
}

function windowIds(value: unknown) {
  return stringArray(value) as WindowId[]
}

function nodeIds(value: unknown) {
  return stringArray(value) as LayoutNodeId[]
}

function recipeIds(value: unknown) {
  return stringArray(value) as RecipeId[]
}

function optionalWindowId(value: unknown) {
  if (!isString(value)) return undefined

  return value as WindowId
}

function optionalNodeId(value: unknown) {
  if (!isString(value)) return undefined

  return value as LayoutNodeId
}

function arrayValues(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) return []

  return value
}

function stringArray(value: unknown) {
  return arrayValues(value).filter(isString)
}

function numberArray(value: unknown) {
  return arrayValues(value).filter(isFiniteNumber)
}

function optionalString(value: unknown) {
  if (!isString(value)) return undefined

  return value
}

function optionalNumber(value: unknown) {
  if (!isFiniteNumber(value)) return undefined

  return value
}

function isLayoutCommandSlot(
  value: LayoutCommandSurfaceSlot | null,
): value is LayoutCommandSurfaceSlot {
  return Boolean(value)
}

function isFrame(value: CustomWindowFrame | null): value is CustomWindowFrame {
  return Boolean(value)
}

function isSurfaceType(value: unknown): value is SurfaceType {
  return isString(value) && KNOWN_SURFACE_TYPES.has(value as SurfaceType)
}

function isRecipeSlot(value: unknown): value is WorkspaceRecipeSlot {
  return isString(value) && KNOWN_RECIPE_SLOTS.has(value as WorkspaceRecipeSlot)
}

function isPlacementKind(value: unknown): value is SurfacePlacementKind {
  return isString(value) && KNOWN_PLACEMENT_KINDS.has(value as SurfacePlacementKind)
}

function isDropEdge(value: unknown): value is DropEdge {
  return isString(value) && KNOWN_DROP_EDGES.has(value as DropEdge)
}

function isSplitAxis(value: unknown): value is LayoutSplitAxis {
  return isString(value) && KNOWN_SPLIT_AXES.has(value as LayoutSplitAxis)
}

function isFrameAnchor(value: unknown): value is CustomWindowFrame['anchor'] {
  return isString(value) && KNOWN_FRAME_ANCHORS.has(value as CustomWindowFrame['anchor'])
}

function isHotkeyPresetSource(value: unknown): value is WindowManagementHotkeyPreset['source'] {
  return (
    isString(value) &&
    KNOWN_HOTKEY_PRESET_SOURCES.has(value as WindowManagementHotkeyPreset['source'])
  )
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
