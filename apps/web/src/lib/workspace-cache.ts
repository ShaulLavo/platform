import type { PickedFsEntry } from '@/lib/file-system-types'
import {
  DEFAULT_DIFF_VIEW_MODE,
  isEditorDiffViewMode,
  type EditorDiffViewMode,
} from '@/features/editor/utils/diff-view-mode'
import { parseConflictDiffDocumentId } from '@/features/editor/conflict-diff-document'
import {
  activeEditorPanePath,
  createEditorPaneLayoutForPaths,
  editorPaneOpenPaths,
  editorPaneTabs,
  filterEditorPaneLayoutTabs,
  normalizeEditorPaneLayout,
  type EditorPaneLayout,
  type EditorPaneNode,
  type EditorPaneSplitDirection,
  type EditorPaneTab,
} from '@/features/editor/state/editor-pane-state'
import { parseDiffDocumentId } from '@/features/git/diff-document'
import { parseSearchBufferDocumentId } from '@/features/search/search-buffer-document'
import { reportError, toClientError } from '@/lib/client-error-taxonomy'
import type { WorkspaceSearchMatchMode, WorkspaceSearchQuery } from '@workspace/contracts'
import * as v from 'valibot'

const CACHE_KEY = 'platform.workspace-state.v1'

type WorkspaceCachePayload =
  | {
      rootFolder: PickedFsEntry | null
      selectedFilePath: string | null
      version: 1
    }
  | {
      openFilePaths: string[]
      rootFolder: PickedFsEntry | null
      selectedFilePath: string | null
      version: 2
    }
  | {
      openFilePaths: string[]
      rootFolder: PickedFsEntry | null
      selectedFilePath: string | null
      version: 3
      workspacePanelTab: WorkspacePanelTab
    }
  | WorkspaceCachePayloadV4
  | WorkspaceCachePayloadV5
  | WorkspaceCachePayloadV6
  | WorkspaceCachePayloadV7

type WorkspaceCachePayloadV4 = {
  diffViewMode: EditorDiffViewMode
  openFilePaths: string[]
  rootFolder: PickedFsEntry | null
  selectedFilePath: string | null
  version: 4
  workspacePanelTab: WorkspacePanelTab
}

type WorkspaceCachePayloadV5 = {
  diffViewMode: EditorDiffViewMode
  editorHistory: string[]
  gitPanelOpen: boolean
  openFilePaths: string[]
  recentlyClosedEditorPaths: string[]
  rootFolder: PickedFsEntry | null
  selectedFilePath: string | null
  sidebarVisible: boolean
  version: 5
  workspacePanelTab: WorkspacePanelTab
}

type WorkspaceCachePayloadV6 = {
  diffViewMode: EditorDiffViewMode
  editorHistory: string[]
  gitPanelOpen: boolean
  openFilePaths: string[]
  recentlyClosedEditorPaths: string[]
  rootFolder: PickedFsEntry | null
  searchBuffer: CachedSearchBufferState | null
  selectedFilePath: string | null
  sidebarVisible: boolean
  version: 6
  workspacePanelTab: WorkspacePanelTab
}

type WorkspaceCachePayloadV7 = {
  diffViewMode: EditorDiffViewMode
  editorHistory: string[]
  editorPaneLayout: EditorPaneLayout
  gitPanelOpen: boolean
  recentlyClosedEditorPaths: string[]
  rootFolder: PickedFsEntry | null
  searchBuffer: CachedSearchBufferState | null
  sidebarVisible: boolean
  version: 7
  workspacePanelTab: WorkspacePanelTab
}

export type WorkspacePanelTab = 'chat' | 'files' | 'git' | 'logs' | 'search'

export type CachedSearchBufferState = {
  activeResultId: string | null
  caseSensitive: boolean
  collapsedPaths: string[]
  excludeGlobText: string
  filtersVisible: boolean
  includeGlobText: string
  matchMode: WorkspaceSearchMatchMode
  query: string
  queryHistory: string[]
  replaceHistory: string[]
  replaceText: string
  replaceVisible: boolean
  resultsQuery: string
  resultsSearchQuery: WorkspaceSearchQuery | null
  rootPath: string
  totalCount: number
  truncated: boolean
  wholeWord: boolean
}

const pickedDirectorySchema = v.object({
  birthtimeMs: v.number(),
  mtimeMs: v.number(),
  name: v.string(),
  path: v.string(),
  size: v.number(),
  type: v.literal('directory'),
  version: v.optional(v.string(), ''),
})
const pickedSymlinkDirectorySchema = v.object({
  birthtimeMs: v.number(),
  mtimeMs: v.number(),
  name: v.string(),
  path: v.string(),
  size: v.number(),
  targetType: v.literal('directory'),
  type: v.literal('symlink'),
  version: v.optional(v.string(), ''),
})
const rootFolderSchema = v.nullable(v.union([pickedDirectorySchema, pickedSymlinkDirectorySchema]))
const selectedFilePathSchema = v.nullable(v.string())
const workspacePanelTabSchema = v.union([
  v.literal('chat'),
  v.literal('files'),
  v.literal('git'),
  v.literal('logs'),
  v.literal('search'),
])
const diffViewModeSchema = v.custom<EditorDiffViewMode>(isEditorDiffViewMode)
const entryTypeSchema = v.union([
  v.literal('file'),
  v.literal('directory'),
  v.literal('symlink'),
  v.literal('other'),
])
const workspaceSearchMatchModeSchema = v.union([
  v.literal('literal'),
  v.literal('regex'),
  v.literal('fuzzy'),
])
const workspaceSearchQuerySchema = v.object({
  caseSensitive: v.optional(v.boolean()),
  entryType: v.optional(entryTypeSchema),
  excludeGlobs: v.optional(v.array(v.string())),
  includeContent: v.boolean(),
  includeGlobs: v.optional(v.array(v.string())),
  includeNames: v.optional(v.boolean()),
  limit: v.number(),
  matchMode: v.optional(workspaceSearchMatchModeSchema),
  maxDepth: v.optional(v.number()),
  path: v.string(),
  query: v.string(),
  wholeWord: v.optional(v.boolean()),
})
const cachedSearchBufferStateSchema = v.strictObject({
  activeResultId: selectedFilePathSchema,
  caseSensitive: v.boolean(),
  collapsedPaths: v.array(v.string()),
  excludeGlobText: v.string(),
  filtersVisible: v.boolean(),
  includeGlobText: v.string(),
  matchMode: workspaceSearchMatchModeSchema,
  query: v.string(),
  queryHistory: v.array(v.string()),
  replaceHistory: v.array(v.string()),
  replaceText: v.string(),
  replaceVisible: v.boolean(),
  resultsQuery: v.string(),
  resultsSearchQuery: v.nullable(workspaceSearchQuerySchema),
  rootPath: v.string(),
  totalCount: v.number(),
  truncated: v.boolean(),
  wholeWord: v.boolean(),
})
const v1Schema = v.object({
  rootFolder: rootFolderSchema,
  selectedFilePath: selectedFilePathSchema,
  version: v.literal(1),
})
const v2Schema = v.object({
  openFilePaths: v.array(v.string()),
  rootFolder: rootFolderSchema,
  selectedFilePath: selectedFilePathSchema,
  version: v.literal(2),
})
const v3Schema = v.object({
  openFilePaths: v.array(v.string()),
  rootFolder: rootFolderSchema,
  selectedFilePath: selectedFilePathSchema,
  version: v.literal(3),
  workspacePanelTab: workspacePanelTabSchema,
})
const v4Schema = v.object({
  diffViewMode: diffViewModeSchema,
  openFilePaths: v.array(v.string()),
  rootFolder: rootFolderSchema,
  selectedFilePath: selectedFilePathSchema,
  version: v.literal(4),
  workspacePanelTab: workspacePanelTabSchema,
})
const v5Schema = v.object({
  diffViewMode: diffViewModeSchema,
  editorHistory: v.array(v.string()),
  gitPanelOpen: v.boolean(),
  openFilePaths: v.array(v.string()),
  recentlyClosedEditorPaths: v.array(v.string()),
  rootFolder: rootFolderSchema,
  selectedFilePath: selectedFilePathSchema,
  sidebarVisible: v.boolean(),
  version: v.literal(5),
  workspacePanelTab: workspacePanelTabSchema,
})
const v6Schema = v.object({
  diffViewMode: diffViewModeSchema,
  editorHistory: v.array(v.string()),
  gitPanelOpen: v.boolean(),
  openFilePaths: v.array(v.string()),
  recentlyClosedEditorPaths: v.array(v.string()),
  rootFolder: rootFolderSchema,
  searchBuffer: v.nullable(cachedSearchBufferStateSchema),
  selectedFilePath: selectedFilePathSchema,
  sidebarVisible: v.boolean(),
  version: v.literal(6),
  workspacePanelTab: workspacePanelTabSchema,
})
const editorPaneLayoutSchema = v.custom<EditorPaneLayout>(isEditorPaneLayoutPayload)
const v7Schema = v.object({
  diffViewMode: diffViewModeSchema,
  editorHistory: v.array(v.string()),
  editorPaneLayout: editorPaneLayoutSchema,
  gitPanelOpen: v.boolean(),
  recentlyClosedEditorPaths: v.array(v.string()),
  rootFolder: rootFolderSchema,
  searchBuffer: v.nullable(cachedSearchBufferStateSchema),
  sidebarVisible: v.boolean(),
  version: v.literal(7),
  workspacePanelTab: workspacePanelTabSchema,
})
const workspaceCachePayloadSchema = v.variant('version', [
  v1Schema,
  v2Schema,
  v3Schema,
  v4Schema,
  v5Schema,
  v6Schema,
  v7Schema,
])

export type CachedWorkspaceState = {
  diffViewMode: EditorDiffViewMode
  editorHistory: string[]
  editorPaneLayout: EditorPaneLayout
  gitPanelOpen: boolean
  openFilePaths: string[]
  recentlyClosedEditorPaths: string[]
  rootFolder: PickedFsEntry | null
  selectedFilePath: string | null
  sidebarVisible: boolean
  workspacePanelTab: WorkspacePanelTab
}

export type WorkspaceCacheState = CachedWorkspaceState & {
  searchBuffer: CachedSearchBufferState | null
}

export function readWorkspaceCache(): WorkspaceCacheState {
  const payload = readCachePayload()
  if (!payload) return emptyWorkspaceState()

  return workspaceStateFromPayload(payload)
}

export function writeWorkspaceCache({
  openFilePaths,
  rootFolder,
  selectedFilePath,
  workspacePanelTab,
  diffViewMode,
  editorHistory,
  gitPanelOpen,
  recentlyClosedEditorPaths,
  sidebarVisible,
  searchBuffer,
  editorPaneLayout,
}:
  | WorkspaceCacheState
  | (Omit<WorkspaceCacheState, 'editorPaneLayout'> & {
      editorPaneLayout?: EditorPaneLayout
    })) {
  if (!canUseLocalStorage()) return

  try {
    const persistedPaneLayout = editorPaneLayoutForWorkspace(
      rootFolder,
      editorPaneLayout ?? createEditorPaneLayoutForPaths(openFilePaths, selectedFilePath),
      openFilePaths,
      selectedFilePath,
    )
    const payload: WorkspaceCachePayloadV7 = {
      diffViewMode,
      editorHistory: workspacePathsForCache(rootFolder, editorHistory),
      editorPaneLayout: persistedPaneLayout,
      gitPanelOpen,
      recentlyClosedEditorPaths: workspacePathsForCache(rootFolder, recentlyClosedEditorPaths),
      rootFolder,
      searchBuffer: searchBufferForWorkspace(rootFolder, searchBuffer),
      sidebarVisible,
      version: 7,
      workspacePanelTab,
    }

    localStorage.setItem(CACHE_KEY, JSON.stringify(payload))
  } catch {
    // Ignore private-mode or quota failures; the app should still open normally.
  }
}

function readCachePayload() {
  if (!canUseLocalStorage()) return null

  try {
    const value = localStorage.getItem(CACHE_KEY)
    if (!value) return null

    const payload = parseCachePayload(value)
    if (payload) return payload

    localStorage.removeItem(CACHE_KEY)
    reportError(toClientError({ code: 'INVALID_PATH' }))
    return null
  } catch (error) {
    localStorage.removeItem(CACHE_KEY)
    reportError(toClientError({ code: 'OPERATION_FAILED', error }))
    return null
  }
}

function parseCachePayload(value: string): WorkspaceCachePayload | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return null
  }

  const result = v.safeParse(workspaceCachePayloadSchema, parsed)
  if (!result.success) return null

  return result.output
}

function workspaceStateFromPayload(payload: WorkspaceCachePayload): WorkspaceCacheState {
  const selectedFilePath = selectedPathFromPayload(payload)
  const payloadOpenPaths =
    payload.version === 1
      ? selectedFilePathForArray(selectedFilePath)
      : payload.version === 7
        ? editorPaneOpenPaths(editorPaneLayoutFromPayload(payload, selectedFilePath, []))
        : payload.openFilePaths
  const editorPaneLayout = editorPaneLayoutFromPayload(payload, selectedFilePath, payloadOpenPaths)

  return {
    diffViewMode: diffViewModeFromPayload(payload),
    editorHistory: workspacePathsForCache(
      payload.rootFolder,
      payload.version === 5 || payload.version === 6 || payload.version === 7
        ? payload.editorHistory
        : selectedFilePathForArray(selectedFilePath),
    ),
    editorPaneLayout,
    gitPanelOpen:
      payload.version === 5 || payload.version === 6 || payload.version === 7
        ? payload.gitPanelOpen
        : true,
    openFilePaths: openPathsForWorkspace(payload.rootFolder, payloadOpenPaths, selectedFilePath),
    recentlyClosedEditorPaths:
      payload.version === 5 || payload.version === 6 || payload.version === 7
        ? workspacePathsForCache(payload.rootFolder, payload.recentlyClosedEditorPaths)
        : [],
    rootFolder: payload.rootFolder,
    searchBuffer: searchBufferFromPayload(payload),
    selectedFilePath: activeEditorPanePath(editorPaneLayout),
    sidebarVisible:
      payload.version === 5 || payload.version === 6 || payload.version === 7
        ? payload.sidebarVisible
        : true,
    workspacePanelTab: workspacePanelTabFromPayload(payload),
  }
}

function diffViewModeFromPayload(payload: WorkspaceCachePayload) {
  if (
    payload.version === 4 ||
    payload.version === 5 ||
    payload.version === 6 ||
    payload.version === 7
  )
    return payload.diffViewMode

  return DEFAULT_DIFF_VIEW_MODE
}

function workspacePanelTabFromPayload(payload: WorkspaceCachePayload) {
  if (
    payload.version === 3 ||
    payload.version === 4 ||
    payload.version === 5 ||
    payload.version === 6 ||
    payload.version === 7
  ) {
    return payload.workspacePanelTab
  }

  return 'files'
}

function selectedPathForWorkspace(
  rootFolder: PickedFsEntry | null,
  selectedFilePath: string | null,
) {
  if (!rootFolder) return null
  if (!selectedFilePath) return null
  if (parseConflictDiffDocumentId(selectedFilePath)) return null
  if (isPathInWorkspace(backingPathForWorkspace(selectedFilePath), rootFolder.path)) {
    return selectedFilePath
  }

  return null
}

function openPathsForWorkspace(
  rootFolder: PickedFsEntry | null,
  openFilePaths: readonly string[],
  selectedFilePath: string | null,
) {
  const uniquePaths = workspacePathsForCache(rootFolder, openFilePaths)
  if (!selectedFilePath) return uniquePaths
  if (uniquePaths.includes(selectedFilePath)) return uniquePaths

  return uniquePaths.concat(selectedFilePath)
}

function workspacePathsForCache(rootFolder: PickedFsEntry | null, paths: readonly string[]) {
  return Array.from(new Set(paths.filter((path) => pathForWorkspace(rootFolder, path))))
}

function pathForWorkspace(rootFolder: PickedFsEntry | null, path: string) {
  if (!rootFolder) return false
  if (parseConflictDiffDocumentId(path)) return false

  return isPathInWorkspace(backingPathForWorkspace(path), rootFolder.path)
}

function backingPathForWorkspace(path: string) {
  if (parseConflictDiffDocumentId(path)) return ''

  const diff = parseDiffDocumentId(path)
  if (diff) return diff.path

  const searchBuffer = parseSearchBufferDocumentId(path)
  if (searchBuffer) return searchBuffer.rootPath

  return path
}

function searchBufferFromPayload(payload: WorkspaceCachePayload) {
  if (payload.version !== 6 && payload.version !== 7) return null

  return searchBufferForWorkspace(payload.rootFolder, payload.searchBuffer)
}

function searchBufferForWorkspace(
  rootFolder: PickedFsEntry | null,
  searchBuffer: CachedSearchBufferState | null,
) {
  if (!rootFolder) return null
  if (!searchBuffer) return null
  if (searchBuffer.rootPath !== rootFolder.path) return null

  return searchBuffer
}

function isPathInWorkspace(path: string, rootPath: string) {
  if (!rootPath) return true
  if (path === rootPath) return true

  return path.startsWith(`${rootPath}/`)
}

function selectedFilePathForArray(selectedFilePath: string | null) {
  return selectedFilePath ? [selectedFilePath] : []
}

function emptyWorkspaceState(): WorkspaceCacheState {
  const editorPaneLayout = createEditorPaneLayoutForPaths([], null)

  return {
    diffViewMode: DEFAULT_DIFF_VIEW_MODE,
    editorHistory: [],
    editorPaneLayout,
    gitPanelOpen: true,
    openFilePaths: [],
    recentlyClosedEditorPaths: [],
    rootFolder: null,
    searchBuffer: null,
    selectedFilePath: null,
    sidebarVisible: true,
    workspacePanelTab: 'files',
  }
}

function canUseLocalStorage() {
  return typeof localStorage !== 'undefined'
}

function selectedPathFromPayload(payload: WorkspaceCachePayload) {
  if (payload.version === 7) {
    return activeEditorPanePath(
      editorPaneLayoutForWorkspace(payload.rootFolder, payload.editorPaneLayout, [], null),
    )
  }

  return selectedPathForWorkspace(payload.rootFolder, payload.selectedFilePath)
}

function editorPaneLayoutFromPayload(
  payload: WorkspaceCachePayload,
  selectedFilePath: string | null,
  openFilePaths: readonly string[],
) {
  if (payload.version === 7) {
    return editorPaneLayoutForWorkspace(
      payload.rootFolder,
      payload.editorPaneLayout,
      openFilePaths,
      selectedFilePath,
    )
  }

  return createEditorPaneLayoutForPaths(openFilePaths, selectedFilePath)
}

function editorPaneLayoutForWorkspace(
  rootFolder: PickedFsEntry | null,
  layout: EditorPaneLayout,
  fallbackOpenFilePaths: readonly string[],
  fallbackSelectedFilePath: string | null,
) {
  const normalized = normalizeEditorPaneLayout(layout)
  const filtered = filterEditorPaneLayoutTabs(normalized, (tab) =>
    pathForWorkspace(rootFolder, tab.path),
  )
  if (editorPaneTabs(filtered.root).length > 0) return filtered

  const selectedFilePath = selectedPathForWorkspace(rootFolder, fallbackSelectedFilePath)
  return createEditorPaneLayoutForPaths(
    openPathsForWorkspace(rootFolder, fallbackOpenFilePaths, selectedFilePath),
    selectedFilePath,
  )
}

function isEditorPaneLayoutPayload(value: unknown): value is EditorPaneLayout {
  if (!isRecord(value)) return false
  if (typeof value.activePaneId !== 'string') return false

  return isEditorPaneNode(value.root)
}

function isEditorPaneNode(value: unknown): value is EditorPaneNode {
  if (!isRecord(value)) return false
  if (value.kind === 'leaf') return isEditorPaneLeaf(value)
  if (value.kind === 'split') return isEditorPaneSplit(value)

  return false
}

function isEditorPaneLeaf(value: Record<string, unknown>) {
  if (typeof value.id !== 'string') return false
  if (value.activeTabId !== null && typeof value.activeTabId !== 'string') {
    return false
  }
  if (!Array.isArray(value.tabs)) return false

  return value.tabs.every(isEditorPaneTab)
}

function isEditorPaneSplit(value: Record<string, unknown>) {
  if (typeof value.id !== 'string') return false
  if (!isEditorPaneSplitDirection(value.direction)) return false
  if (!Array.isArray(value.children)) return false
  if (!Array.isArray(value.sizes)) return false
  if (!value.sizes.every(isFiniteNumber)) return false

  return value.children.every(isEditorPaneNode)
}

function isEditorPaneTab(value: unknown): value is EditorPaneTab {
  if (!isRecord(value)) return false
  if (typeof value.id !== 'string') return false

  return typeof value.path === 'string'
}

function isEditorPaneSplitDirection(value: unknown): value is EditorPaneSplitDirection {
  return value === 'horizontal' || value === 'vertical'
}

function isFiniteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value) return false

  return typeof value === 'object'
}
