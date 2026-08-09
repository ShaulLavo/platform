import type { PickedFsEntry } from '@/lib/file-system-types'
import {
  DEFAULT_DIFF_VIEW_MODE,
  isEditorDiffViewMode,
  type EditorDiffViewMode,
} from '@/features/editor/utils/diff-view-mode'
import { parseConflictDiffDocumentId } from '@/features/editor/conflict-diff-document'
import { parseDiffDocumentId } from '@/features/git/diff-document'
import { parseSearchBufferDocumentId } from '@/features/search/search-buffer-document'
import {
  createDefaultChatModePanels,
  isChatModeToolTab,
  type ChatModePanels,
  type ChatModeToolTab,
} from '@/features/chat-mode/utils/panels'
import {
  createDefaultWorkbenchLayout,
  normalizeWorkbenchLayout,
  type WorkbenchLayout,
} from '@/features/workbench/utils/workbench-layout'
import { DEFAULT_WORKSPACE_UI_MODE, isWorkspaceUiMode, type WorkspaceUiMode } from '@/lib/ui-mode'
import {
  activeEditorPathForWorkbenchPanels,
  createDefaultWorkbenchPanels,
  editorOpenPathsForWorkbenchPanels,
  normalizeWorkbenchPanels,
  type WorkbenchPanels,
} from '@/features/workbench/utils/workbench-panels'
import { reportError, toClientError } from '@/lib/client-error-taxonomy'
import type {
  WorkspaceSearchMatch,
  WorkspaceSearchMatchMode,
  WorkspaceSearchQuery,
} from '@workspace/contracts'
import * as v from 'valibot'

// Local-only UI state uses an explicit schema version plus a clear mismatch policy:
// update deliberately or drop intentionally. Server-backed caches may reset/refetch.
const CACHE_VERSION = 14
const CACHE_KEY_PREFIX = `platform.workspace-state.v${CACHE_VERSION}`

export const WORKSPACE_CACHE_STORAGE_KEYS = {
  chatModePanels: `${CACHE_KEY_PREFIX}.chatModePanels`,
  diffViewMode: `${CACHE_KEY_PREFIX}.diffViewMode`,
  editorHistory: `${CACHE_KEY_PREFIX}.editorHistory`,
  recentlyClosedEditorPaths: `${CACHE_KEY_PREFIX}.recentlyClosedEditorPaths`,
  rootFolder: `${CACHE_KEY_PREFIX}.rootFolder`,
  searchBuffer: `${CACHE_KEY_PREFIX}.searchBuffer`,
  uiMode: `${CACHE_KEY_PREFIX}.uiMode`,
  workbenchLayout: `${CACHE_KEY_PREFIX}.workbenchLayout`,
  workbenchPanels: `${CACHE_KEY_PREFIX}.workbenchPanels`,
} as const

export type CachedSearchBufferState = {
  activeResultId: string | null
  caseSensitive: boolean
  collapsedPaths: string[]
  excludeGlobText: string
  filtersVisible: boolean
  includeGlobText: string
  matchMode: WorkspaceSearchMatchMode
  matches: WorkspaceSearchMatch[]
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
const nullableStringSchema = v.nullable(v.string())
const diffViewModeSchema = v.custom<EditorDiffViewMode>(isEditorDiffViewMode)
const stringArraySchema = v.array(v.string())
const entryTypeSchema = v.union([
  v.literal('file'),
  v.literal('directory'),
  v.literal('symlink'),
  v.literal('other'),
])
const workspaceSearchSourceSchema = v.union([v.literal('disk'), v.literal('open-buffer')])
const workspaceSearchMatchModeSchema = v.union([
  v.literal('literal'),
  v.literal('regex'),
  v.literal('fuzzy'),
])
const workspaceSearchMatchSchema = v.object({
  birthtimeMs: v.optional(v.number()),
  column: v.optional(v.number()),
  endColumn: v.optional(v.number()),
  kind: v.union([v.literal('name'), v.literal('content')]),
  line: v.optional(v.number()),
  mtimeMs: v.optional(v.number()),
  path: v.string(),
  preview: v.optional(v.string()),
  previewStartColumn: v.optional(v.number()),
  size: v.optional(v.number()),
  source: workspaceSearchSourceSchema,
  targetType: v.optional(entryTypeSchema),
  type: entryTypeSchema,
})
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
  activeResultId: nullableStringSchema,
  caseSensitive: v.boolean(),
  collapsedPaths: v.array(v.string()),
  excludeGlobText: v.string(),
  filtersVisible: v.boolean(),
  includeGlobText: v.string(),
  matchMode: workspaceSearchMatchModeSchema,
  matches: v.array(workspaceSearchMatchSchema),
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
const sidebarTabSchema = v.union([
  v.literal('chat'),
  v.literal('files'),
  v.literal('git'),
  v.literal('logs'),
  v.literal('search'),
])
const bottomTabSchema = v.union([v.literal('terminal'), v.literal('problems')])
const editorTabRecordSchema = v.strictObject({
  id: v.string(),
  path: v.string(),
})
const outerLayoutSchema = v.strictObject({
  main: v.number(),
  sidebar: v.number(),
})
const mainLayoutSchema = v.strictObject({
  bottom: v.number(),
  editor: v.number(),
})
const workbenchPanelsSchema = v.strictObject({
  activeBottomTab: bottomTabSchema,
  activeEditorTabId: nullableStringSchema,
  activeSidebarTab: sidebarTabSchema,
  editorTabs: v.array(editorTabRecordSchema),
})
const workbenchLayoutSchema = v.strictObject({
  mainLayout: mainLayoutSchema,
  outerLayout: outerLayoutSchema,
})
const uiModeSchema = v.custom<WorkspaceUiMode>(isWorkspaceUiMode)
const chatModePanelsSchema = v.strictObject({
  activeToolTab: v.custom<ChatModeToolTab>(isChatModeToolTab),
  sessionRailOpen: v.boolean(),
  toolPaneOpen: v.boolean(),
})

export type CachedWorkspaceState = {
  chatModePanels: ChatModePanels
  diffViewMode: EditorDiffViewMode
  editorHistory: string[]
  openFilePaths: string[]
  recentlyClosedEditorPaths: string[]
  rootFolder: PickedFsEntry | null
  selectedFilePath: string | null
  uiMode: WorkspaceUiMode
  workbenchLayout: WorkbenchLayout
  workbenchPanels: WorkbenchPanels
}

export type WorkspaceCacheState = CachedWorkspaceState & {
  searchBuffer: CachedSearchBufferState | null
}

export function readWorkspaceCache(): WorkspaceCacheState {
  if (!canUseLocalStorage()) return emptyWorkspaceState()

  return workspaceStateFromCache()
}

export function writeDiffViewModeCache(diffViewMode: EditorDiffViewMode) {
  writeCacheEntry(WORKSPACE_CACHE_STORAGE_KEYS.diffViewMode, diffViewMode)
}

export function writeUiModeCache(uiMode: WorkspaceUiMode) {
  writeCacheEntry(WORKSPACE_CACHE_STORAGE_KEYS.uiMode, uiMode)
}

export function writeWorkbenchLayoutCache(workbenchLayout: WorkbenchLayout) {
  writeCacheEntry(WORKSPACE_CACHE_STORAGE_KEYS.workbenchLayout, workbenchLayout)
}

export function writeChatModePanelsCache(chatModePanels: ChatModePanels) {
  writeCacheEntry(WORKSPACE_CACHE_STORAGE_KEYS.chatModePanels, chatModePanels)
}

export function writeEditorHistoryCache(
  rootFolder: PickedFsEntry | null,
  editorHistory: readonly string[],
) {
  writeCacheEntry(
    WORKSPACE_CACHE_STORAGE_KEYS.editorHistory,
    workspacePathsForCache(rootFolder, editorHistory),
  )
}

export function writeRecentlyClosedEditorPathsCache(
  rootFolder: PickedFsEntry | null,
  recentlyClosedEditorPaths: readonly string[],
) {
  writeCacheEntry(
    WORKSPACE_CACHE_STORAGE_KEYS.recentlyClosedEditorPaths,
    workspacePathsForCache(rootFolder, recentlyClosedEditorPaths),
  )
}

export function writeRootFolderCache(rootFolder: PickedFsEntry | null) {
  writeCacheEntry(WORKSPACE_CACHE_STORAGE_KEYS.rootFolder, rootFolder)
}

export function writeWorkbenchPanelsCache(
  rootFolder: PickedFsEntry | null,
  workbenchPanels: WorkbenchPanels,
) {
  writeCacheEntry(
    WORKSPACE_CACHE_STORAGE_KEYS.workbenchPanels,
    workbenchPanelsForCache(rootFolder, workbenchPanels),
  )
}

export function writeSearchBufferCache(
  rootFolder: PickedFsEntry | null,
  searchBuffer: CachedSearchBufferState | null,
) {
  writeCacheEntry(
    WORKSPACE_CACHE_STORAGE_KEYS.searchBuffer,
    searchBufferForWorkspace(rootFolder, searchBuffer),
  )
}

function workspaceStateFromCache(): WorkspaceCacheState {
  const rootFolder = readCacheEntry<PickedFsEntry | null>(
    WORKSPACE_CACHE_STORAGE_KEYS.rootFolder,
    rootFolderSchema,
    null,
  )
  const workbenchPanels = workbenchPanelsForWorkspace(
    rootFolder,
    readCacheEntry<WorkbenchPanels>(
      WORKSPACE_CACHE_STORAGE_KEYS.workbenchPanels,
      workbenchPanelsSchema,
      createDefaultWorkbenchPanels(),
    ),
  )

  return {
    chatModePanels: readCacheEntry(
      WORKSPACE_CACHE_STORAGE_KEYS.chatModePanels,
      chatModePanelsSchema,
      createDefaultChatModePanels(),
    ),
    diffViewMode: readCacheEntry(
      WORKSPACE_CACHE_STORAGE_KEYS.diffViewMode,
      diffViewModeSchema,
      DEFAULT_DIFF_VIEW_MODE,
    ),
    editorHistory: workspacePathsForCache(
      rootFolder,
      readCacheEntry<string[]>(WORKSPACE_CACHE_STORAGE_KEYS.editorHistory, stringArraySchema, []),
    ),
    openFilePaths: editorOpenPathsForWorkbenchPanels(workbenchPanels),
    recentlyClosedEditorPaths: workspacePathsForCache(
      rootFolder,
      readCacheEntry<string[]>(
        WORKSPACE_CACHE_STORAGE_KEYS.recentlyClosedEditorPaths,
        stringArraySchema,
        [],
      ),
    ),
    rootFolder,
    searchBuffer: searchBufferForWorkspace(
      rootFolder,
      readCacheEntry<CachedSearchBufferState | null>(
        WORKSPACE_CACHE_STORAGE_KEYS.searchBuffer,
        v.nullable(cachedSearchBufferStateSchema),
        null,
      ),
    ),
    selectedFilePath: activeEditorPathForWorkbenchPanels(workbenchPanels),
    uiMode: readCacheEntry(
      WORKSPACE_CACHE_STORAGE_KEYS.uiMode,
      uiModeSchema,
      DEFAULT_WORKSPACE_UI_MODE,
    ),
    workbenchLayout: normalizeWorkbenchLayout(
      readCacheEntry(
        WORKSPACE_CACHE_STORAGE_KEYS.workbenchLayout,
        workbenchLayoutSchema,
        createDefaultWorkbenchLayout(),
      ),
    ),
    workbenchPanels,
  }
}

function readCacheEntry<T>(key: string, schema: v.GenericSchema, fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    if (!value) return fallback

    const result = v.safeParse(schema, JSON.parse(value))
    if (result.success) return result.output as T

    removeCacheEntry(key)
    reportError(toClientError({ code: 'INVALID_PATH' }))
    return fallback
  } catch (error) {
    removeCacheEntry(key)
    reportError(toClientError({ code: 'OPERATION_FAILED', error }))
    return fallback
  }
}

function writeCacheEntry(key: string, value: unknown) {
  if (!canUseLocalStorage()) return

  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    removeCacheEntry(key)
  }
}

function removeCacheEntry(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    // Ignore private-mode failures; the app should still open normally.
  }
}

function workspacePathsForCache(rootFolder: PickedFsEntry | null, paths: readonly string[]) {
  return Array.from(new Set(paths.filter((path) => pathForWorkspace(rootFolder, path))))
}

function pathForWorkspace(rootFolder: PickedFsEntry | null, path: string) {
  if (!rootFolder) return false
  if (parseConflictDiffDocumentId(path)) return false

  const searchBuffer = parseSearchBufferDocumentId(path)
  if (searchBuffer) return searchBuffer.rootPath === rootFolder.path

  return isPathInWorkspace(backingPathForWorkspace(path), rootFolder.path)
}

function backingPathForWorkspace(path: string) {
  if (parseConflictDiffDocumentId(path)) return ''

  const diff = parseDiffDocumentId(path)
  if (diff) return diff.path

  return path
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

function emptyWorkspaceState(): WorkspaceCacheState {
  const workbenchPanels = createDefaultWorkbenchPanels()

  return {
    chatModePanels: createDefaultChatModePanels(),
    diffViewMode: DEFAULT_DIFF_VIEW_MODE,
    editorHistory: [],
    openFilePaths: [],
    recentlyClosedEditorPaths: [],
    rootFolder: null,
    searchBuffer: null,
    selectedFilePath: null,
    uiMode: DEFAULT_WORKSPACE_UI_MODE,
    workbenchLayout: createDefaultWorkbenchLayout(),
    workbenchPanels,
  }
}

function workbenchPanelsForWorkspace(
  rootFolder: PickedFsEntry | null,
  workbenchPanels: WorkbenchPanels,
) {
  const editorTabs = workbenchPanels.editorTabs.filter((tab) =>
    pathForWorkspace(rootFolder, tab.path),
  )
  const activeEditorTabId = activeEditorTabIdForTabs(editorTabs, workbenchPanels.activeEditorTabId)

  return normalizeWorkbenchPanels({
    activeBottomTab: workbenchPanels.activeBottomTab,
    activeEditorTabId,
    activeSidebarTab: workbenchPanels.activeSidebarTab,
    editorTabs,
  })
}

function workbenchPanelsForCache(
  rootFolder: PickedFsEntry | null,
  workbenchPanels: WorkbenchPanels,
) {
  return workbenchPanelsForWorkspace(rootFolder, workbenchPanels)
}

function activeEditorTabIdForTabs(
  editorTabs: WorkbenchPanels['editorTabs'],
  activeEditorTabId: string | null,
) {
  if (!activeEditorTabId) return editorTabs[0]?.id ?? null
  if (editorTabs.some((tab) => tab.id === activeEditorTabId)) return activeEditorTabId

  return editorTabs[0]?.id ?? null
}

function canUseLocalStorage() {
  return typeof localStorage !== 'undefined'
}
