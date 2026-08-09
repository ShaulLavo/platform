export type WorkspaceUiMode = 'chat' | 'workbench'

export const DEFAULT_WORKSPACE_UI_MODE: WorkspaceUiMode = 'workbench'

const WORKSPACE_UI_MODES: readonly WorkspaceUiMode[] = ['chat', 'workbench']

export function isWorkspaceUiMode(value: unknown): value is WorkspaceUiMode {
  if (typeof value !== 'string') return false

  return WORKSPACE_UI_MODES.includes(value as WorkspaceUiMode)
}

export function toggledWorkspaceUiMode(mode: WorkspaceUiMode): WorkspaceUiMode {
  return mode === 'chat' ? 'workbench' : 'chat'
}

export function workspaceUiModeLabel(mode: WorkspaceUiMode) {
  return mode === 'chat' ? 'Chat' : 'Workbench'
}
