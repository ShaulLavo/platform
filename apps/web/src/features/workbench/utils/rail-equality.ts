import {
  isWorkbenchRailBottomPaneItem,
  isWorkbenchRailRecipeItem,
  isWorkbenchRailSurfaceItem,
  type WorkbenchRailItem,
} from '@workspace/tiling/utils/rail-model'

export function railItemsEqual(
  left: readonly WorkbenchRailItem[],
  right: readonly WorkbenchRailItem[],
) {
  if (left === right) return true
  if (left.length !== right.length) return false

  return left.every((item, index) => railItemsAreEqual(item, right[index]))
}

function railItemsAreEqual(left: WorkbenchRailItem, right: WorkbenchRailItem | undefined) {
  if (!right) return false
  if (left.state !== right.state) return false
  if (isWorkbenchRailBottomPaneItem(left)) return isWorkbenchRailBottomPaneItem(right)
  if (isWorkbenchRailSurfaceItem(left)) return surfaceRailItemsAreEqual(left, right)
  if (isWorkbenchRailRecipeItem(left)) return recipeRailItemsAreEqual(left, right)

  return false
}

function surfaceRailItemsAreEqual(left: WorkbenchRailItem, right: WorkbenchRailItem) {
  if (!isWorkbenchRailSurfaceItem(left)) return false
  if (!isWorkbenchRailSurfaceItem(right)) return false

  return left.surface === right.surface
}

function recipeRailItemsAreEqual(left: WorkbenchRailItem, right: WorkbenchRailItem) {
  if (!isWorkbenchRailRecipeItem(left)) return false
  if (!isWorkbenchRailRecipeItem(right)) return false

  return left.recipe === right.recipe
}
