import type { PickedFsEntry } from '@/lib/file-system-types'
import {
  DEFAULT_DIFF_VIEW_MODE,
  isEditorDiffViewMode,
  type EditorDiffViewMode,
} from '@/features/editor/utils/diff-view-mode'
import { parseConflictDiffDocumentId } from '@/features/editor/conflict-diff-document'
import { parseDiffDocumentId } from '@/features/git/diff-document'
import { parseSearchBufferDocumentId } from '@/features/search/search-buffer-document'
import type { WorkspaceLayout } from '@workspace/tiling/utils/layout-types'
import { createClassicFirstRunWorkspaceLayout } from '@workspace/tiling/utils/layout-builders'
import {
  restoreWorkspaceLayout,
  serializeWorkspaceLayout,
  type SerializedWorkspaceLayout,
} from '@/features/tiling-surface-manager/engine/layout-persistence'
import {
  activeEditorPathForWorkspaceLayout,
  editorOpenPathsForWorkspaceLayout,
} from '@/features/workbench/utils/editor-surface-layout'
import { reportError, toClientError } from '@/lib/client-error-taxonomy'
import type {
  WorkspaceSearchMatch,
  WorkspaceSearchMatchMode,
  WorkspaceSearchQuery,
} from '@workspace/contracts'
import * as v from 'valibot'

// Local-only UI state uses an explicit schema version plus a clear mismatch policy:
// update deliberately or drop intentionally. Server-backed caches may reset/refetch.
const CACHE_VERSION = 12
const CACHE_KEY_PREFIX = `platform.workspace-state.v${CACHE_VERSION}`
const LEGACY_WORKSPACE_CACHE_KEY = 'platform.workspace-state.v1'

export const WORKSPACE_CACHE_STORAGE_KEYS = {
  diffViewMode: `${CACHE_KEY_PREFIX}.diffViewMode`,
  editorHistory: `${CACHE_KEY_PREFIX}.editorHistory`,
  recentlyClosedEditorPaths: `${CACHE_KEY_PREFIX}.recentlyClosedEditorPaths`,
  rootFolder: `${CACHE_KEY_PREFIX}.rootFolder`,
  searchBuffer: `${CACHE_KEY_PREFIX}.searchBuffer`,
  workspaceLayout: `${CACHE_KEY_PREFIX}.workspaceLayout`,
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
const serializedWorkspaceLayoutSchema = v.unknown()

export type CachedWorkspaceState = {
  diffViewMode: EditorDiffViewMode
  editorHistory: string[]
  openFilePaths: string[]
  recentlyClosedEditorPaths: string[]
  rootFolder: PickedFsEntry | null
  selectedFilePath: string | null
  workspaceLayout: WorkspaceLayout
}

export type WorkspaceCacheState = CachedWorkspaceState & {
  searchBuffer: CachedSearchBufferState | null
}

export type WorkspaceCacheWriteState = Pick<
  CachedWorkspaceState,
  'diffViewMode' | 'editorHistory' | 'recentlyClosedEditorPaths' | 'rootFolder' | 'workspaceLayout'
> & {
  searchBuffer: CachedSearchBufferState | null
}

export function readWorkspaceCache(): WorkspaceCacheState {
  if (!canUseLocalStorage()) return emptyWorkspaceState()

  return workspaceStateFromCache()
}

export function writeWorkspaceCache({
  rootFolder,
  diffViewMode,
  editorHistory,
  recentlyClosedEditorPaths,
  searchBuffer,
  workspaceLayout,
}: WorkspaceCacheWriteState) {
  if (!canUseLocalStorage()) return

  removeCacheEntry(LEGACY_WORKSPACE_CACHE_KEY)
  writeCacheEntry(WORKSPACE_CACHE_STORAGE_KEYS.diffViewMode, diffViewMode)
  writeCacheEntry(
    WORKSPACE_CACHE_STORAGE_KEYS.editorHistory,
    workspacePathsForCache(rootFolder, editorHistory),
  )
  writeCacheEntry(
    WORKSPACE_CACHE_STORAGE_KEYS.recentlyClosedEditorPaths,
    workspacePathsForCache(rootFolder, recentlyClosedEditorPaths),
  )
  writeCacheEntry(WORKSPACE_CACHE_STORAGE_KEYS.rootFolder, rootFolder)
  writeCacheEntry(
    WORKSPACE_CACHE_STORAGE_KEYS.workspaceLayout,
    workspaceLayoutPayload(rootFolder, workspaceLayout),
  )
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
  const serializedWorkspaceLayout = readCacheEntry<unknown>(
    WORKSPACE_CACHE_STORAGE_KEYS.workspaceLayout,
    serializedWorkspaceLayoutSchema,
    null,
  )
  const workspaceLayout = restoreWorkspaceLayout(serializedWorkspaceLayout, {
    fallbackLayout: createClassicFirstRunWorkspaceLayout(),
    rootPath: rootFolder?.path ?? null,
  }).layout

  return {
    diffViewMode: readCacheEntry(
      WORKSPACE_CACHE_STORAGE_KEYS.diffViewMode,
      diffViewModeSchema,
      DEFAULT_DIFF_VIEW_MODE,
    ),
    editorHistory: workspacePathsForCache(
      rootFolder,
      readCacheEntry<string[]>(WORKSPACE_CACHE_STORAGE_KEYS.editorHistory, stringArraySchema, []),
    ),
    openFilePaths: editorOpenPathsForWorkspaceLayout(workspaceLayout),
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
    selectedFilePath: activeEditorPathForWorkspaceLayout(workspaceLayout),
    workspaceLayout,
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
  if (parseSearchBufferDocumentId(path)) return false

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
  const workspaceLayout = createClassicFirstRunWorkspaceLayout()

  return {
    diffViewMode: DEFAULT_DIFF_VIEW_MODE,
    editorHistory: [],
    openFilePaths: [],
    recentlyClosedEditorPaths: [],
    rootFolder: null,
    searchBuffer: null,
    selectedFilePath: null,
    workspaceLayout,
  }
}

function workspaceLayoutForCache(
  rootFolder: PickedFsEntry | null,
  workspaceLayout: WorkspaceLayout,
) {
  const serializedLayout = serializeWorkspaceLayout(workspaceLayout)
  return restoreWorkspaceLayout(serializedLayout, {
    fallbackLayout: createClassicFirstRunWorkspaceLayout(),
    rootPath: rootFolder?.path ?? null,
  }).layout
}

function workspaceLayoutPayload(
  rootFolder: PickedFsEntry | null,
  workspaceLayout: WorkspaceLayout,
): SerializedWorkspaceLayout {
  return serializeWorkspaceLayout(workspaceLayoutForCache(rootFolder, workspaceLayout))
}

function canUseLocalStorage() {
  return typeof localStorage !== 'undefined'
}
