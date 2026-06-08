import { useContext } from 'react'

import { WorkbenchTabDragFeedbackContext } from '@/features/workbench/providers/drag-drop-provider'
import type { SurfaceId } from '@/features/tiling-surface-manager/engine/layout-types'

export function useWorkbenchTabDragOffset(surfaceId: SurfaceId) {
  const feedback = useContext(WorkbenchTabDragFeedbackContext)
  if (!feedback) return 0
  if (feedback.surfaceId !== surfaceId) return 0

  return feedback.offsetX
}
