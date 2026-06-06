import {
  CLASSIC_POLICY_ID,
  layoutPolicyId,
} from '@/features/tiling-surface-manager/utils/layout-ids'
import { findWindowIdContainingSurface } from '@/features/tiling-surface-manager/utils/layout-normalize'
import {
  resolveSurfacePath,
  selectActiveSurface,
  selectActiveWindow,
} from '@/features/tiling-surface-manager/utils/layout-selectors'
import type {
  LayoutPolicyId,
  Surface,
  SurfaceId,
  SurfacePlacementHint,
  WorkspaceLayout,
  WorkspaceRecipeSlot,
} from '@/features/tiling-surface-manager/utils/layout-types'

export const PREVIEW_ADJACENT_POLICY_ID = layoutPolicyId('preview-adjacent')
export const MASTER_DETAIL_POLICY_ID = layoutPolicyId('master-detail')
export const FOCUS_POLICY_ID = layoutPolicyId('focus')
export const LANE_WORKFLOW_POLICY_ID = layoutPolicyId('lane-workflow-placeholder')

export type LayoutPlacementPolicy = {
  readonly id: LayoutPolicyId
  readonly placementForSurface: (layout: WorkspaceLayout, surface: Surface) => SurfacePlacementHint
  readonly title: string
}

export const classicPolicy: LayoutPlacementPolicy = {
  id: CLASSIC_POLICY_ID,
  placementForSurface: classicPlacementForSurface,
  title: 'Classic',
}

export const previewAdjacentPolicy: LayoutPlacementPolicy = {
  id: PREVIEW_ADJACENT_POLICY_ID,
  placementForSurface: previewAdjacentPlacementForSurface,
  title: 'Preview Adjacent',
}

export const masterDetailPolicy: LayoutPlacementPolicy = {
  id: MASTER_DETAIL_POLICY_ID,
  placementForSurface: masterDetailPlacementForSurface,
  title: 'Master Detail',
}

export const focusPolicy: LayoutPlacementPolicy = {
  id: FOCUS_POLICY_ID,
  placementForSurface: focusPlacementForSurface,
  title: 'Focus Active Window',
}

export const laneWorkflowPolicy: LayoutPlacementPolicy = {
  id: LANE_WORKFLOW_POLICY_ID,
  placementForSurface: laneWorkflowPlacementForSurface,
  title: 'Lane Workflow Placeholder',
}

export const DEFAULT_LAYOUT_PLACEMENT_POLICIES = [
  classicPolicy,
  previewAdjacentPolicy,
  masterDetailPolicy,
  focusPolicy,
  laneWorkflowPolicy,
] as const satisfies readonly LayoutPlacementPolicy[]

export function defaultLayoutPlacementPolicies(): readonly LayoutPlacementPolicy[] {
  return DEFAULT_LAYOUT_PLACEMENT_POLICIES
}

export function layoutPlacementPolicy(policyId: LayoutPolicyId): LayoutPlacementPolicy | null {
  return DEFAULT_LAYOUT_PLACEMENT_POLICIES.find((policy) => policy.id === policyId) ?? null
}

export function placementForSurfaceWithPolicy({
  layout,
  policyId,
  surface,
}: {
  readonly layout: WorkspaceLayout
  readonly policyId?: LayoutPolicyId
  readonly surface: Surface
}): SurfacePlacementHint {
  const policy = policyId ? layoutPlacementPolicy(policyId) : null

  return (policy ?? classicPolicy).placementForSurface(layout, surface)
}

function classicPlacementForSurface(
  layout: WorkspaceLayout,
  surface: Surface,
): SurfacePlacementHint {
  const stickyPlacement = stickyPlacementForSurface(layout, surface.id)
  if (stickyPlacement) return stickyPlacement

  return { kind: 'recipe-slot', slot: recipeSlotForSurface(layout, surface) }
}

function previewAdjacentPlacementForSurface(
  layout: WorkspaceLayout,
  surface: Surface,
): SurfacePlacementHint {
  const ownerPlacement = ownerAdjacentPlacement(layout, surface)
  if (ownerPlacement) return ownerPlacement

  return classicPlacementForSurface(layout, surface)
}

function masterDetailPlacementForSurface(
  layout: WorkspaceLayout,
  surface: Surface,
): SurfacePlacementHint {
  const ownerPlacement = ownerAdjacentPlacement(layout, surface)
  if (ownerPlacement) return ownerPlacement
  if (surface.type === 'file-navigator') return { edge: 'left', kind: 'root-edge' }
  if (surface.type === 'search-results') return { edge: 'left', kind: 'root-edge' }
  if (surface.type === 'git-changes') return { edge: 'right', kind: 'root-edge' }
  if (surface.type === 'chat') return { edge: 'right', kind: 'root-edge' }
  if (surface.type === 'logs') return { edge: 'right', kind: 'root-edge' }
  if (surface.type === 'diagnostics') return { edge: 'bottom', kind: 'root-edge' }
  if (surface.type === 'terminal') return { edge: 'bottom', kind: 'root-edge' }

  return focusPlacementForSurface(layout, surface)
}

function focusPlacementForSurface(layout: WorkspaceLayout, surface: Surface): SurfacePlacementHint {
  const activeWindow = selectActiveWindow(layout)
  if (activeWindow) return { kind: 'window-center', windowId: activeWindow.id }

  return classicPlacementForSurface(layout, surface)
}

function laneWorkflowPlacementForSurface(
  layout: WorkspaceLayout,
  surface: Surface,
): SurfacePlacementHint {
  const ownerWindowPlacement = ownerWindowCenterPlacement(layout, surface.ownerSurfaceId)
  if (ownerWindowPlacement) return ownerWindowPlacement

  const activeSurface = selectActiveSurface(layout)
  if (activeSurface && workflowSurfaceCanHost(activeSurface, surface)) {
    return { kind: 'active-window' }
  }

  return classicPlacementForSurface(layout, surface)
}

function ownerAdjacentPlacement(
  layout: WorkspaceLayout,
  surface: Surface,
): SurfacePlacementHint | null {
  const ownerWindowId = surface.ownerSurfaceId
    ? findWindowIdContainingSurface(layout, surface.ownerSurfaceId)
    : null
  if (!ownerWindowId) return null

  return { edge: 'right', kind: 'window-edge', windowId: ownerWindowId }
}

function ownerWindowCenterPlacement(
  layout: WorkspaceLayout,
  ownerSurfaceId?: SurfaceId,
): SurfacePlacementHint | null {
  if (!ownerSurfaceId) return null

  const ownerPath = resolveSurfacePath(layout, ownerSurfaceId)
  if (!ownerPath) return null

  return { kind: 'window-center', windowId: ownerPath.windowId }
}

function workflowSurfaceCanHost(owner: Surface, surface: Surface) {
  if (owner.type === 'search-results' && surface.type === 'search-preview') return true

  return owner.type === 'git-changes' && surface.type === 'diff'
}

function recipeSlotForSurface(layout: WorkspaceLayout, surface: Surface): WorkspaceRecipeSlot {
  return (
    layout.recipesById[layout.activeRecipeId]?.surfaceSlots[surface.type] ??
    surface.capabilities.defaultRecipeSlot
  )
}

function stickyPlacementForSurface(
  layout: WorkspaceLayout,
  surfaceId: SurfaceId,
): SurfacePlacementHint | null {
  const activePolicy = Object.values(layout.policiesById).find(
    (policy) => policy.recipeId === layout.activeRecipeId,
  )

  return activePolicy?.stickyPlacementsBySurfaceId[surfaceId] ?? null
}
