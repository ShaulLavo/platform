import { builtInWindowManagementCommands } from '@workspace/tiling/utils/layout-command-catalog'
import { decodeIdKey } from '@workspace/tiling/utils/layout-ids'
import type { WindowManagementCommandId } from '@workspace/tiling/utils/layout-types'

import type { WorkspaceCommandId } from './types'

const WINDOW_COMMAND_ID_PREFIX = 'window-command:'
const WORKSPACE_WINDOW_COMMAND_PREFIX = 'workspace.window.'

const WINDOW_MANAGEMENT_COMMAND_PAIRS = builtInWindowManagementCommands().map(
  (command) =>
    [command.id, workspaceCommandIdForBuiltInWindowManagementCommand(command.id)] as const,
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

function workspaceCommandIdForBuiltInWindowManagementCommand(id: WindowManagementCommandId) {
  const key = String(id).startsWith(WINDOW_COMMAND_ID_PREFIX)
    ? String(id).slice(WINDOW_COMMAND_ID_PREFIX.length)
    : String(id)
  const decodedKey = decodeIdKey(key)

  return `${WORKSPACE_WINDOW_COMMAND_PREFIX}${camelCaseCommandKey(decodedKey)}` as WorkspaceCommandId
}

function camelCaseCommandKey(key: string) {
  return key.replace(/-([a-z0-9])/g, (_match, value: string) => value.toUpperCase())
}
