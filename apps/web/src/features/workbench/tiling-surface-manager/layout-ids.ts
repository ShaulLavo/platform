import type {
  LayoutNodeId,
  LayoutPolicyId,
  HotkeyPresetId,
  LayoutCommandId,
  OverlayId,
  RecipeId,
  SurfaceId,
  WindowManagementCommandId,
  WindowId,
} from './layout-types'

export const CLASSIC_RECIPE_ID = recipeId('classic')
export const CLASSIC_POLICY_ID = layoutPolicyId('classic')

export function fileEditorSurfaceId(path: string): SurfaceId {
  return surfaceId('file-editor', path)
}

export function diffSurfaceId(diffDocumentId: string): SurfaceId {
  return surfaceId('diff', diffDocumentId)
}

export function searchResultsSurfaceId(): SurfaceId {
  return surfaceId('search-results', 'workspace')
}

export function searchPreviewSurfaceId(
  ownerSurfaceId: SurfaceId,
  ownerContextKey: string,
): SurfaceId {
  return surfaceId('search-preview', `${ownerSurfaceId}:${ownerContextKey}`)
}

export function terminalSurfaceId(sessionId: string): SurfaceId {
  return surfaceId('terminal', sessionId)
}

export function fileNavigatorSurfaceId(): SurfaceId {
  return surfaceId('file-navigator', 'workspace')
}

export function gitChangesSurfaceId(): SurfaceId {
  return surfaceId('git-changes', 'workspace')
}

export function logsSurfaceId(): SurfaceId {
  return surfaceId('logs', 'workspace')
}

export function diagnosticsSurfaceId(): SurfaceId {
  return surfaceId('diagnostics', 'workspace')
}

export function placeholderSurfaceId(contextKey: string): SurfaceId {
  return surfaceId('placeholder', contextKey)
}

export function workbenchWindowId(key: string): WindowId {
  return encodedId('window', key) as WindowId
}

export function layoutNodeId(key: string): LayoutNodeId {
  return encodedId('node', key) as LayoutNodeId
}

export function recipeId(key: string): RecipeId {
  return encodedId('recipe', key) as RecipeId
}

export function layoutPolicyId(key: string): LayoutPolicyId {
  return encodedId('policy', key) as LayoutPolicyId
}

export function windowManagementCommandId(key: string): WindowManagementCommandId {
  return encodedId('window-command', key) as WindowManagementCommandId
}

export function layoutCommandId(key: string): LayoutCommandId {
  return encodedId('layout-command', key) as LayoutCommandId
}

export function hotkeyPresetId(key: string): HotkeyPresetId {
  return encodedId('hotkey-preset', key) as HotkeyPresetId
}

export function overlayId(key: string): OverlayId {
  return encodedId('overlay', key) as OverlayId
}

function surfaceId(prefix: string, key: string): SurfaceId {
  return encodedId(`surface:${prefix}`, key) as SurfaceId
}

function encodedId(prefix: string, key: string) {
  return `${prefix}:${encodeURIComponent(key)}`
}
