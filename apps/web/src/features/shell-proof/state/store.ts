import {
  createWorkspaceLayoutStore,
  type WorkspaceLayoutStoreApi,
} from '@/features/tiling-surface-manager/engine/surface-state'
import { logWorkbenchLayoutWarn } from '@/features/tiling-surface-manager/engine/layout-logging'
import type { LayoutInvariantReport } from '@workspace/tiling/utils/layout-invariants'
import type { WorkspaceLayout } from '@workspace/tiling/utils/layout-types'

export function createShellProofLayoutStore(
  initialLayout: WorkspaceLayout,
): WorkspaceLayoutStoreApi {
  return createWorkspaceLayoutStore(initialLayout, {
    checkInvariants: true,
    onInvariantViolation: logShellProofInvariantViolation,
  })
}

function logShellProofInvariantViolation(report: LayoutInvariantReport, layout: WorkspaceLayout) {
  logWorkbenchLayoutWarn('shell-proof.layout.invariant', {
    layout,
    violations: report.violations,
  })
}
