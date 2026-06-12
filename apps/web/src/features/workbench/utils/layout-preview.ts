import { applyLayoutOperation } from '@workspace/tiling'
import type { LayoutOperation, WorkspaceLayout } from '@workspace/tiling/utils/layout-types'

export function previewLayoutForOperation(
  layout: WorkspaceLayout,
  operation: LayoutOperation | null,
) {
  if (!operation) return layout
  if (!previewableLayoutOperation(operation)) return layout

  return applyLayoutOperation(layout, operation)
}

function previewableLayoutOperation(operation: LayoutOperation) {
  if (operation.type === 'moveSurface') return true
  if (operation.type === 'reorderSurface') return true

  return operation.type === 'moveWindow'
}
