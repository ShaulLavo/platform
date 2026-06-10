import { builtInWindowManagementCommands } from '@workspace/tiling/utils/layout-command-catalog'
import { hasInvalidTransientOwner } from '@workspace/tiling/utils/layout-queries'
import type {
  LayoutNode,
  LayoutNodeId,
  LayoutSplitAxis,
  LayoutSplitNode,
  RecipeId,
  SurfaceId,
  SurfaceType,
  WindowId,
  WorkbenchWindow,
  WorkspaceLayout,
} from '@workspace/tiling/utils/layout-types'

export type LayoutInvariantViolationCode =
  | 'active-surface-not-in-active-window'
  | 'bad-active-surface-id'
  | 'bad-active-window-id'
  | 'background-surface-visible'
  | 'duplicate-visible-surface'
  | 'invalid-split-child-count'
  | 'invalid-split-size-count'
  | 'invalid-layout-command-recipe'
  | 'invalid-layout-command-slot-surface-type'
  | 'invalid-hotkey-preset-command'
  | 'duplicate-hotkey-binding'
  | 'missing-node-child'
  | 'missing-root-node'
  | 'missing-surface'
  | 'missing-window'
  | 'orphan-transient-preview-owner'
  | 'rail-references-missing-recipe'
  | 'rail-references-missing-surface'
  | 'same-axis-split-chain'
  | 'window-active-surface-not-in-window'

export type LayoutInvariantViolation = {
  readonly childNodeId?: LayoutNodeId
  readonly code: LayoutInvariantViolationCode
  readonly commandId?: string
  readonly hotkey?: string
  readonly message: string
  readonly nodeId?: LayoutNodeId
  readonly presetId?: string
  readonly surfaceId?: SurfaceId
  readonly windowId?: WindowId
}

export type LayoutInvariantReport = {
  readonly ok: boolean
  readonly violations: readonly LayoutInvariantViolation[]
}

type TraversalContext = {
  readonly visibleNodeIds: Set<LayoutNodeId>
  readonly visibleWindowIds: Set<WindowId>
}

type VisibleSurfaceReference = {
  readonly surfaceId: SurfaceId
  readonly windowId: WindowId
}

const KNOWN_SURFACE_TYPES = new Set<SurfaceType>([
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
])

export function checkWorkspaceLayoutInvariants(layout: WorkspaceLayout): LayoutInvariantReport {
  const violations: LayoutInvariantViolation[] = []
  const traversal = collectVisibleWindows(layout, violations)
  const visibleSurfaceReferences = collectVisibleSurfaceReferences(
    layout,
    traversal.visibleWindowIds,
  )

  checkWindows(layout, violations)
  checkActiveIds(layout, violations)
  checkDuplicateVisibleSurfaces(visibleSurfaceReferences, violations)
  checkBackgroundSurfaces(layout, visibleSurfaceReferences, violations)
  checkTransientPreviewOwners(layout, violations)
  checkRailReferences(layout, violations)
  checkCommandReferences(layout, violations)

  return {
    ok: violations.length === 0,
    violations,
  }
}

function collectVisibleWindows(
  layout: WorkspaceLayout,
  violations: LayoutInvariantViolation[],
): TraversalContext {
  const context = {
    visibleNodeIds: new Set<LayoutNodeId>(),
    visibleWindowIds: new Set<WindowId>(),
  }

  if (!layout.rootNodeId) return context
  if (!layout.nodesById[layout.rootNodeId]) {
    pushViolation(violations, 'missing-root-node', `Root node ${layout.rootNodeId} is missing.`, {
      nodeId: layout.rootNodeId,
    })
    return context
  }

  visitNode(layout, layout.rootNodeId, null, context, violations)
  return context
}

function visitNode(
  layout: WorkspaceLayout,
  nodeId: LayoutNodeId,
  parentAxis: LayoutSplitAxis | null,
  context: TraversalContext,
  violations: LayoutInvariantViolation[],
) {
  const node = layout.nodesById[nodeId]
  if (!node) {
    pushViolation(violations, 'missing-node-child', `Layout node ${nodeId} is missing.`, { nodeId })
    return
  }
  if (context.visibleNodeIds.has(nodeId)) return

  context.visibleNodeIds.add(nodeId)
  if (node.kind === 'window') {
    collectWindowNode(layout, node, context, violations)
    return
  }

  checkSplitNode(node, parentAxis, layout, violations)
  for (const childId of node.childIds) {
    visitNode(layout, childId, node.axis, context, violations)
  }
}

function collectWindowNode(
  layout: WorkspaceLayout,
  node: Extract<LayoutNode, { readonly kind: 'window' }>,
  context: TraversalContext,
  violations: LayoutInvariantViolation[],
) {
  if (!layout.windowsById[node.windowId]) {
    pushViolation(violations, 'missing-window', `Window ${node.windowId} is missing.`, {
      nodeId: node.id,
      windowId: node.windowId,
    })
    return
  }

  context.visibleWindowIds.add(node.windowId)
}

function checkSplitNode(
  node: LayoutSplitNode,
  parentAxis: LayoutSplitAxis | null,
  layout: WorkspaceLayout,
  violations: LayoutInvariantViolation[],
) {
  if (node.childIds.length < 2) {
    pushViolation(
      violations,
      'invalid-split-child-count',
      `Split ${node.id} has too few children.`,
      {
        nodeId: node.id,
      },
    )
  }
  if (node.childIds.length !== node.sizes.length) {
    pushViolation(
      violations,
      'invalid-split-size-count',
      `Split ${node.id} has mismatched sizes.`,
      {
        nodeId: node.id,
      },
    )
  }
  if (parentAxis === node.axis) {
    pushViolation(
      violations,
      'same-axis-split-chain',
      `Split ${node.id} repeats its parent axis.`,
      {
        nodeId: node.id,
      },
    )
  }

  checkMissingChildNodes(node, layout, violations)
}

function checkMissingChildNodes(
  node: LayoutSplitNode,
  layout: WorkspaceLayout,
  violations: LayoutInvariantViolation[],
) {
  for (const childId of node.childIds) {
    if (layout.nodesById[childId]) continue

    pushViolation(
      violations,
      'missing-node-child',
      `Split ${node.id} references missing node ${childId}.`,
      {
        childNodeId: childId,
        nodeId: node.id,
      },
    )
  }
}

function checkWindows(layout: WorkspaceLayout, violations: LayoutInvariantViolation[]) {
  for (const window of Object.values(layout.windowsById)) {
    checkWindowSurfaceReferences(layout, window, violations)
  }
}

function checkWindowSurfaceReferences(
  layout: WorkspaceLayout,
  window: WorkbenchWindow,
  violations: LayoutInvariantViolation[],
) {
  for (const surfaceId of window.surfaceIds) {
    if (layout.surfacesById[surfaceId]) continue

    pushViolation(
      violations,
      'missing-surface',
      `Window ${window.id} references missing surface ${surfaceId}.`,
      {
        surfaceId,
        windowId: window.id,
      },
    )
  }

  checkWindowActiveSurface(layout, window, violations)
  checkOptionalSurfaceReference(layout, window, window.previewSurfaceId, violations)
  checkPinnedSurfaceReferences(layout, window, violations)
}

function checkWindowActiveSurface(
  layout: WorkspaceLayout,
  window: WorkbenchWindow,
  violations: LayoutInvariantViolation[],
) {
  if (!layout.surfacesById[window.activeSurfaceId]) {
    pushViolation(
      violations,
      'bad-active-surface-id',
      `Window ${window.id} has a missing active surface.`,
      {
        surfaceId: window.activeSurfaceId,
        windowId: window.id,
      },
    )
  }
  if (window.surfaceIds.includes(window.activeSurfaceId)) return

  pushViolation(
    violations,
    'window-active-surface-not-in-window',
    `Window ${window.id} active surface is not in its surface list.`,
    {
      surfaceId: window.activeSurfaceId,
      windowId: window.id,
    },
  )
}

function checkOptionalSurfaceReference(
  layout: WorkspaceLayout,
  window: WorkbenchWindow,
  surfaceId: SurfaceId | undefined,
  violations: LayoutInvariantViolation[],
) {
  if (!surfaceId) return
  if (layout.surfacesById[surfaceId]) return

  pushViolation(
    violations,
    'missing-surface',
    `Window ${window.id} references missing surface ${surfaceId}.`,
    {
      surfaceId,
      windowId: window.id,
    },
  )
}

function checkPinnedSurfaceReferences(
  layout: WorkspaceLayout,
  window: WorkbenchWindow,
  violations: LayoutInvariantViolation[],
) {
  for (const surfaceId of window.pinnedSurfaceIds) {
    checkOptionalSurfaceReference(layout, window, surfaceId, violations)
  }
}

function checkActiveIds(layout: WorkspaceLayout, violations: LayoutInvariantViolation[]) {
  if (layout.activeWindowId && !layout.windowsById[layout.activeWindowId]) {
    pushViolation(
      violations,
      'bad-active-window-id',
      `Active window ${layout.activeWindowId} is missing.`,
      {
        windowId: layout.activeWindowId,
      },
    )
  }
  if (layout.activeSurfaceId && !layout.surfacesById[layout.activeSurfaceId]) {
    pushViolation(
      violations,
      'bad-active-surface-id',
      `Active surface ${layout.activeSurfaceId} is missing.`,
      {
        surfaceId: layout.activeSurfaceId,
      },
    )
  }

  checkActiveSurfaceBelongsToWindow(layout, violations)
}

function checkActiveSurfaceBelongsToWindow(
  layout: WorkspaceLayout,
  violations: LayoutInvariantViolation[],
) {
  if (!layout.activeWindowId) return
  if (!layout.activeSurfaceId) return

  const window = layout.windowsById[layout.activeWindowId]
  if (!window) return
  if (window.surfaceIds.includes(layout.activeSurfaceId)) return

  pushViolation(
    violations,
    'active-surface-not-in-active-window',
    'The active surface does not belong to the active window.',
    {
      surfaceId: layout.activeSurfaceId,
      windowId: layout.activeWindowId,
    },
  )
}

function collectVisibleSurfaceReferences(
  layout: WorkspaceLayout,
  visibleWindowIds: ReadonlySet<WindowId>,
) {
  const references: VisibleSurfaceReference[] = []

  for (const windowId of visibleWindowIds) {
    const window = layout.windowsById[windowId]
    if (!window) continue

    for (const surfaceId of window.surfaceIds) {
      references.push({ surfaceId, windowId })
    }
  }

  return references
}

function checkDuplicateVisibleSurfaces(
  references: readonly VisibleSurfaceReference[],
  violations: LayoutInvariantViolation[],
) {
  const referencesBySurfaceId = groupVisibleSurfaceReferences(references)

  for (const [surfaceId, surfaceReferences] of referencesBySurfaceId) {
    if (surfaceReferences.length <= 1) continue

    pushViolation(
      violations,
      'duplicate-visible-surface',
      `Surface ${surfaceId} is visible in multiple windows.`,
      {
        surfaceId,
        windowId: surfaceReferences[0]?.windowId,
      },
    )
  }
}

function groupVisibleSurfaceReferences(references: readonly VisibleSurfaceReference[]) {
  const referencesBySurfaceId = new Map<SurfaceId, VisibleSurfaceReference[]>()

  for (const reference of references) {
    const existing = referencesBySurfaceId.get(reference.surfaceId) ?? []
    referencesBySurfaceId.set(reference.surfaceId, existing.concat(reference))
  }

  return referencesBySurfaceId
}

function checkBackgroundSurfaces(
  layout: WorkspaceLayout,
  references: readonly VisibleSurfaceReference[],
  violations: LayoutInvariantViolation[],
) {
  const visibleSurfaceIds = new Set(references.map((reference) => reference.surfaceId))

  for (const surfaceId of layout.rail.backgroundSurfaceIds) {
    if (!visibleSurfaceIds.has(surfaceId)) continue

    pushViolation(
      violations,
      'background-surface-visible',
      `Background surface ${surfaceId} is visible.`,
      {
        surfaceId,
      },
    )
  }
}

function checkTransientPreviewOwners(
  layout: WorkspaceLayout,
  violations: LayoutInvariantViolation[],
) {
  for (const surface of Object.values(layout.surfacesById)) {
    if (surface.lifecycle !== 'transient') continue
    if (!hasInvalidTransientOwner(surface, layout.surfacesById)) continue

    pushViolation(
      violations,
      'orphan-transient-preview-owner',
      `Transient surface ${surface.id} is missing a valid owner.`,
      {
        surfaceId: surface.id,
      },
    )
  }
}

function checkRailReferences(layout: WorkspaceLayout, violations: LayoutInvariantViolation[]) {
  checkRailSurfaceIds(layout, layout.rail.backgroundSurfaceIds, violations)
  checkRailSurfaceIds(layout, layout.rail.pinnedSurfaceIds, violations)
  checkRailSurfaceIds(layout, layout.rail.runningSurfaceIds, violations)
  checkRailSurfaceIds(layout, layout.rail.visibleSingletonSurfaceIds, violations)

  for (const recipeId of layout.rail.recipeIds) {
    if (layout.recipesById[recipeId]) continue

    pushViolation(
      violations,
      'rail-references-missing-recipe',
      `Rail references missing recipe ${recipeId}.`,
    )
  }
}

function checkRailSurfaceIds(
  layout: WorkspaceLayout,
  surfaceIds: readonly SurfaceId[],
  violations: LayoutInvariantViolation[],
) {
  for (const surfaceId of surfaceIds) {
    if (layout.surfacesById[surfaceId]) continue

    pushViolation(
      violations,
      'rail-references-missing-surface',
      `Rail references missing surface ${surfaceId}.`,
      {
        surfaceId,
      },
    )
  }
}

function checkCommandReferences(layout: WorkspaceLayout, violations: LayoutInvariantViolation[]) {
  checkLayoutCommandSlots(layout, violations)
  checkHotkeyPresetBindings(layout, violations)
}

function checkLayoutCommandSlots(layout: WorkspaceLayout, violations: LayoutInvariantViolation[]) {
  for (const command of Object.values(layout.layoutCommandsById)) {
    checkLayoutCommandRecipe(layout, command.id, command.recipeId, violations)

    for (const slot of command.slots) {
      checkLayoutCommandSlot(command.id, slot.surfaceType, violations)
    }
  }
}

function checkLayoutCommandRecipe(
  layout: WorkspaceLayout,
  commandId: string,
  recipeId: RecipeId | undefined,
  violations: LayoutInvariantViolation[],
) {
  if (!recipeId) return
  if (layout.recipesById[recipeId]) return

  pushViolation(
    violations,
    'invalid-layout-command-recipe',
    `Layout command ${commandId} references unknown recipe ${recipeId}.`,
  )
}

function checkLayoutCommandSlot(
  commandId: string,
  surfaceType: SurfaceType,
  violations: LayoutInvariantViolation[],
) {
  if (KNOWN_SURFACE_TYPES.has(surfaceType)) return

  pushViolation(
    violations,
    'invalid-layout-command-slot-surface-type',
    `Layout command ${commandId} references unknown surface type ${surfaceType}.`,
  )
}

function checkHotkeyPresetBindings(
  layout: WorkspaceLayout,
  violations: LayoutInvariantViolation[],
) {
  const knownCommandIds = new Set([
    ...builtInWindowManagementCommands().map((command) => command.id),
    ...Object.keys(layout.windowCommandsById),
    ...Object.keys(layout.layoutCommandsById),
  ])

  for (const preset of Object.values(layout.hotkeyPresetsById)) {
    const commandsByHotkey = new Map<string, string[]>()

    for (const [commandId, hotkey] of Object.entries(preset.bindings)) {
      checkHotkeyPresetBinding(preset.id, commandId, knownCommandIds, violations)
      appendHotkeyPresetCommand(commandsByHotkey, hotkey, commandId)
    }

    checkDuplicateHotkeyPresetBindings(preset.id, commandsByHotkey, violations)
  }
}

function checkHotkeyPresetBinding(
  presetId: string,
  commandId: string,
  knownCommandIds: ReadonlySet<string>,
  violations: LayoutInvariantViolation[],
) {
  if (knownCommandIds.has(commandId)) return

  pushViolation(
    violations,
    'invalid-hotkey-preset-command',
    `Hotkey preset ${presetId} references unknown command ${commandId}.`,
  )
}

function appendHotkeyPresetCommand(
  commandsByHotkey: Map<string, string[]>,
  hotkey: string,
  commandId: string,
) {
  const existing = commandsByHotkey.get(hotkey)
  if (!existing) {
    commandsByHotkey.set(hotkey, [commandId])
    return
  }

  commandsByHotkey.set(hotkey, existing.concat(commandId))
}

function checkDuplicateHotkeyPresetBindings(
  presetId: string,
  commandsByHotkey: ReadonlyMap<string, readonly string[]>,
  violations: LayoutInvariantViolation[],
) {
  for (const [hotkey, commandIds] of commandsByHotkey) {
    if (commandIds.length <= 1) continue

    pushViolation(
      violations,
      'duplicate-hotkey-binding',
      `Hotkey preset ${presetId} binds ${hotkey} to multiple commands: ${commandIds.join(', ')}.`,
      {
        commandId: commandIds[0],
        hotkey,
        presetId,
      },
    )
  }
}

function pushViolation(
  violations: LayoutInvariantViolation[],
  code: LayoutInvariantViolationCode,
  message: string,
  details: Omit<LayoutInvariantViolation, 'code' | 'message'> = {},
) {
  violations.push({
    code,
    message,
    ...details,
  })
}
