import {
  BACKGROUND_ACTIVE_SURFACE_COMMAND_ID,
  CLOSE_ACTIVE_SURFACE_COMMAND_ID,
  COLLAPSE_ACTIVE_WINDOW_COMMAND_ID,
  EXPAND_ACTIVE_WINDOW_COMMAND_ID,
  MAXIMIZE_ACTIVE_WINDOW_COMMAND_ID,
  MOVE_ACTIVE_SURFACE_TO_BACKGROUND_COMMAND_ID,
  MOVE_ACTIVE_WINDOW_BOTTOM_COMMAND_ID,
  MOVE_ACTIVE_WINDOW_LEFT_COMMAND_ID,
  MOVE_ACTIVE_WINDOW_RIGHT_COMMAND_ID,
  MOVE_ACTIVE_WINDOW_TOP_COMMAND_ID,
  RESTORE_ACTIVE_WINDOW_COMMAND_ID,
  SPLIT_ACTIVE_WINDOW_BOTTOM_COMMAND_ID,
  SPLIT_ACTIVE_WINDOW_LEFT_COMMAND_ID,
  SPLIT_ACTIVE_WINDOW_RIGHT_COMMAND_ID,
  SPLIT_ACTIVE_WINDOW_TOP_COMMAND_ID,
} from '@/features/tiling-surface-manager/engine/layout-command-catalog'
import type { WindowManagementCommandId } from '@/features/tiling-surface-manager/engine/layout-types'

import type { WorkspaceCommandId } from './types'

const WINDOW_MANAGEMENT_COMMAND_PAIRS = [
  [BACKGROUND_ACTIVE_SURFACE_COMMAND_ID, 'workspace.window.backgroundActiveSurface'],
  [CLOSE_ACTIVE_SURFACE_COMMAND_ID, 'workspace.window.closeActiveSurface'],
  [COLLAPSE_ACTIVE_WINDOW_COMMAND_ID, 'workspace.window.collapseActiveWindow'],
  [EXPAND_ACTIVE_WINDOW_COMMAND_ID, 'workspace.window.expandActiveWindow'],
  [MAXIMIZE_ACTIVE_WINDOW_COMMAND_ID, 'workspace.window.maximizeActiveWindow'],
  [MOVE_ACTIVE_SURFACE_TO_BACKGROUND_COMMAND_ID, 'workspace.window.moveActiveSurfaceToBackground'],
  [MOVE_ACTIVE_WINDOW_BOTTOM_COMMAND_ID, 'workspace.window.moveActiveWindowBottom'],
  [MOVE_ACTIVE_WINDOW_LEFT_COMMAND_ID, 'workspace.window.moveActiveWindowLeft'],
  [MOVE_ACTIVE_WINDOW_RIGHT_COMMAND_ID, 'workspace.window.moveActiveWindowRight'],
  [MOVE_ACTIVE_WINDOW_TOP_COMMAND_ID, 'workspace.window.moveActiveWindowTop'],
  [RESTORE_ACTIVE_WINDOW_COMMAND_ID, 'workspace.window.restoreActiveWindow'],
  [SPLIT_ACTIVE_WINDOW_BOTTOM_COMMAND_ID, 'workspace.window.splitActiveWindowBottom'],
  [SPLIT_ACTIVE_WINDOW_LEFT_COMMAND_ID, 'workspace.window.splitActiveWindowLeft'],
  [SPLIT_ACTIVE_WINDOW_RIGHT_COMMAND_ID, 'workspace.window.splitActiveWindowRight'],
  [SPLIT_ACTIVE_WINDOW_TOP_COMMAND_ID, 'workspace.window.splitActiveWindowTop'],
] as const satisfies readonly (readonly [WindowManagementCommandId, WorkspaceCommandId])[]

export const workspaceWindowManagementCommandIds = WINDOW_MANAGEMENT_COMMAND_PAIRS.map(
  ([, workspaceCommandId]) => workspaceCommandId,
)

const workspaceCommandIdByWindowManagementId = new Map<
  WindowManagementCommandId,
  WorkspaceCommandId
>(WINDOW_MANAGEMENT_COMMAND_PAIRS)
const windowManagementCommandIdByWorkspaceId = new Map<
  WorkspaceCommandId,
  WindowManagementCommandId
>(
  WINDOW_MANAGEMENT_COMMAND_PAIRS.map(([windowCommandId, workspaceCommandId]) => [
    workspaceCommandId,
    windowCommandId,
  ]),
)

export function workspaceCommandIdForWindowManagementCommand(id: WindowManagementCommandId) {
  return workspaceCommandIdByWindowManagementId.get(id) ?? null
}

export function windowManagementCommandIdForWorkspaceCommand(id: WorkspaceCommandId) {
  return windowManagementCommandIdByWorkspaceId.get(id) ?? null
}

export function isWindowManagementWorkspaceCommand(id: WorkspaceCommandId) {
  return windowManagementCommandIdByWorkspaceId.has(id)
}
