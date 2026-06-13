import { decodeIdKey } from '@workspace/tiling/utils/layout-ids'
import {
  normalizeWorkspaceLayout,
  visibleSurfaceIdsInOrder,
} from '@workspace/tiling/utils/layout-normalize'
import type { LanguageServerDefinitionTarget } from '@singapor/lsp-plugin'
import type {
  Surface,
  SurfaceId,
  WindowId,
  WorkspaceLayout,
} from '@workspace/tiling/utils/layout-types'

export type EditorSurfaceSerializedState = {
  readonly definitionTarget?: LanguageServerDefinitionTarget
  readonly editorGroupId: string
  readonly editorTabId: string
}

export type EditorSurfaceTabRecord = {
  readonly id: string
  readonly path: string
  readonly surfaceId: SurfaceId
  readonly windowId: WindowId
}

export function editorOpenPathsForWorkspaceLayout(layout: WorkspaceLayout) {
  const normalizedLayout = normalizeWorkspaceLayout(layout)
  const paths = new Set<string>()

  for (const surfaceId of visibleSurfaceIdsInOrder(normalizedLayout)) {
    const path = editorPathForSurface(normalizedLayout.surfacesById[surfaceId])
    if (!path) continue

    paths.add(path)
  }

  return Array.from(paths)
}

export function activeEditorPathForWorkspaceLayout(layout: WorkspaceLayout) {
  const normalizedLayout = normalizeWorkspaceLayout(layout)
  const surfaceId = normalizedLayout.activeSurfaceId
  const activePath = editorPathForSurface(
    surfaceId ? normalizedLayout.surfacesById[surfaceId] : undefined,
  )
  if (activePath) return activePath

  return editorOpenPathsForWorkspaceLayout(normalizedLayout)[0] ?? null
}

export function editorSurfaceSerializedState(
  surface: Surface,
): EditorSurfaceSerializedState | null {
  if (!isRecord(surface.serializedState)) return null
  if (typeof surface.serializedState.editorGroupId !== 'string') return null
  if (typeof surface.serializedState.editorTabId !== 'string') return null

  const definitionTarget = languageServerDefinitionTarget(surface.serializedState.definitionTarget)

  return {
    ...(definitionTarget ? { definitionTarget } : {}),
    editorGroupId: surface.serializedState.editorGroupId,
    editorTabId: surface.serializedState.editorTabId,
  }
}

export function editorGroupIdForWorkbenchWindowId(windowId: WindowId): string | null {
  const rawId = String(windowId)
  if (!rawId.startsWith('window:')) return null

  const decodedKey = decodeIdKey(rawId.slice('window:'.length))
  if (!decodedKey.startsWith('editor-group:')) return null

  return decodedKey.slice('editor-group:'.length)
}

export function editorGroupIdForWorkbenchWindow(windowId: WindowId): string {
  return editorGroupIdForWorkbenchWindowId(windowId) ?? `workbench:${windowId}`
}

function editorTabIdForSurface(surface: Surface): string {
  return editorSurfaceSerializedState(surface)?.editorTabId ?? `surface-tab:${surface.id}`
}

export function activeEditorSurfaceTab(layout: WorkspaceLayout): EditorSurfaceTabRecord | null {
  const activeSurfaceId = layout.activeSurfaceId
  if (!activeSurfaceId) return activeEditorSurfaceTabForWindow(layout)

  const activeTab = editorSurfaceTabRecordForSurface(
    layout,
    activeSurfaceId,
    windowIdContainingSurface(layout, activeSurfaceId),
  )
  return activeTab ?? activeEditorSurfaceTabForWindow(layout)
}

export function editorSurfaceTabRecords(
  layout: WorkspaceLayout,
): readonly EditorSurfaceTabRecord[] {
  const records: EditorSurfaceTabRecord[] = []

  for (const window of Object.values(layout.windowsById)) {
    for (const surfaceId of window.surfaceIds) {
      const record = editorSurfaceTabRecordForSurface(layout, surfaceId, window.id)
      if (!record) continue

      records.push(record)
    }
  }

  return records
}

export function editorSurfacePathCounts(layout: WorkspaceLayout) {
  const counts = new Map<string, number>()
  for (const tab of editorSurfaceTabRecords(layout)) {
    counts.set(tab.path, (counts.get(tab.path) ?? 0) + 1)
  }

  return counts
}

function activeEditorSurfaceTabForWindow(layout: WorkspaceLayout) {
  const windowId = layout.activeWindowId
  const window = windowId ? layout.windowsById[windowId] : null
  if (!window) return null

  const activeTab = editorSurfaceTabRecordForSurface(layout, window.activeSurfaceId, window.id)
  if (activeTab) return activeTab

  for (const surfaceId of window.surfaceIds) {
    const tab = editorSurfaceTabRecordForSurface(layout, surfaceId, window.id)
    if (tab) return tab
  }

  return null
}

function editorSurfaceTabRecordForSurface(
  layout: WorkspaceLayout,
  surfaceId: SurfaceId | undefined,
  windowId: WindowId | null,
): EditorSurfaceTabRecord | null {
  if (!surfaceId) return null
  if (!windowId) return null

  const surface = layout.surfacesById[surfaceId]
  const tab = editorTabForSurface(surface)
  if (!tab) return null

  return {
    id: tab.id,
    path: tab.path,
    surfaceId,
    windowId,
  }
}

function windowIdContainingSurface(layout: WorkspaceLayout, surfaceId: SurfaceId) {
  for (const window of Object.values(layout.windowsById)) {
    if (!window.surfaceIds.includes(surfaceId)) continue

    return window.id
  }

  return null
}

function editorTabForSurface(surface: Surface | undefined) {
  if (!surface?.resourceKey) return null
  if (surface.type !== 'file-editor' && surface.type !== 'diff') return null

  return {
    id: editorTabIdForSurface(surface),
    path: surface.resourceKey,
  }
}

function editorPathForSurface(surface: Surface | undefined) {
  if (!surface) return null
  if (surface.type !== 'file-editor' && surface.type !== 'diff') return null

  return surface.resourceKey ?? null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function languageServerDefinitionTarget(value: unknown): LanguageServerDefinitionTarget | null {
  if (!isRecord(value)) return null
  if (typeof value.path !== 'string') return null
  if (typeof value.uri !== 'string') return null
  if (!languageServerRange(value.range)) return null

  return {
    path: value.path,
    range: value.range,
    uri: value.uri,
  }
}

type LanguageServerRange = LanguageServerDefinitionTarget['range']
type LanguageServerPosition = LanguageServerRange['start']

function languageServerRange(value: unknown): value is LanguageServerRange {
  if (!isRecord(value)) return false
  if (!languageServerPosition(value.start)) return false

  return languageServerPosition(value.end)
}

function languageServerPosition(value: unknown): value is LanguageServerPosition {
  if (!isRecord(value)) return false
  if (typeof value.character !== 'number') return false

  return typeof value.line === 'number'
}
