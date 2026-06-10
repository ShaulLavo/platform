import type {
  LayoutPolicyId,
  LayoutPolicyState,
  Surface,
  SurfaceId,
  SurfacePlacementHint,
  WorkbenchWindow,
  WorkspaceLayout,
  WorkspaceRecipeSlot,
} from '@workspace/tiling/utils/layout-types'

export function recipeSlotForSurface(
  layout: WorkspaceLayout,
  surface: Surface,
): WorkspaceRecipeSlot {
  return (
    layout.recipesById[layout.activeRecipeId]?.surfaceSlots[surface.type] ??
    surface.capabilities.defaultRecipeSlot
  )
}

export function stickyPlacementForSurface(
  layout: WorkspaceLayout,
  surfaceId: SurfaceId,
  policyId?: LayoutPolicyId,
): SurfacePlacementHint | null {
  const policy = policyId ? layout.policiesById[policyId] : policyForStickyPlacement(layout)

  return policy?.stickyPlacementsBySurfaceId[surfaceId] ?? null
}

export function hasInvalidTransientOwner(
  surface: Surface,
  surfacesById: WorkspaceLayout['surfacesById'],
) {
  if (surface.type === 'search-preview') return !hasValidTransientOwner(surface, surfacesById)
  if (!surface.ownerSurfaceId && !surface.ownerContextKey) return false

  return !hasValidTransientOwner(surface, surfacesById)
}

export function hasValidTransientOwner(
  surface: Surface,
  surfacesById: WorkspaceLayout['surfacesById'],
) {
  if (!surface.ownerSurfaceId) return false
  if (!surface.ownerContextKey) return false

  return Boolean(surfacesById[surface.ownerSurfaceId])
}

export function windowCanCollapse(layout: WorkspaceLayout, window: WorkbenchWindow) {
  for (const surfaceId of window.surfaceIds) {
    const surface = layout.surfacesById[surfaceId]
    if (!surface?.capabilities.canCollapse) return false
  }

  return true
}

export function surfaceCanClose(surface: Surface) {
  if (!surface.capabilities.canClose) return false

  return surface.closePolicy.type !== 'block'
}

export function policyForStickyPlacement(layout: WorkspaceLayout): LayoutPolicyState | null {
  const activeRecipePolicy = Object.values(layout.policiesById).find(
    (policy) => policy.recipeId === layout.activeRecipeId,
  )
  if (activeRecipePolicy) return activeRecipePolicy

  return Object.values(layout.policiesById)[0] ?? null
}
