import { arraysEqual } from '@/lib/arrays'
import type { Surface } from '@workspace/tiling/utils/layout-types'

export function surfaceEqual(left: Surface | null, right: Surface | null) {
  if (left === right) return true
  if (!left || !right) return false
  if (left.id !== right.id) return false
  if (left.type !== right.type) return false
  if (left.title !== right.title) return false
  if (left.resourceKey !== right.resourceKey) return false
  if (left.stateKey !== right.stateKey) return false
  if (left.lifecycle !== right.lifecycle) return false
  if (left.rendererLifecycle !== right.rendererLifecycle) return false
  if (left.serializedState !== right.serializedState) return false

  return surfaceCapabilitiesEqual(left.capabilities, right.capabilities)
}

function surfaceCapabilitiesEqual(left: Surface['capabilities'], right: Surface['capabilities']) {
  if (left === right) return true
  if (left.canCollapse !== right.canCollapse) return false
  if (left.canClose !== right.canClose) return false
  if (left.canFloat !== right.canFloat) return false
  if (left.canSplit !== right.canSplit) return false
  if (left.canUnmountWhenNotExpanded !== right.canUnmountWhenNotExpanded) return false
  if (left.closeRuntimePolicy !== right.closeRuntimePolicy) return false
  if (left.defaultRecipeSlot !== right.defaultRecipeSlot) return false
  if (left.supportsPreview !== right.supportsPreview) return false

  return arraysEqual(left.validPlacements, right.validPlacements)
}
