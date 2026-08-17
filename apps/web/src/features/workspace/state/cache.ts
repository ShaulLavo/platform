import type { PickedFsEntry } from '@/lib/file-system-types'
import { parseConflictDiffDocumentId } from '@/features/editor/utils/conflict-diff-document'
import { parseDiffDocumentId } from '@/features/git/utils/diff-document'
import { parseSearchBufferDocumentId } from '@/features/search/utils/buffer-document'
import {
  createDefaultChatModePanels,
  isChatModeToolTab,
  type ChatModePanels,
  type ChatModeToolTab,
} from '@/features/chat-mode/utils/panels'
import type { SessionSelection } from '@/features/chat-mode/utils/active-session'
import {
  createDefaultWorkbenchLayout,
  normalizeWorkbenchLayout,
  type WorkbenchLayout,
} from '@/features/workbench/utils/layout'
import { DEFAULT_WORKSPACE_UI_MODE, isWorkspaceUiMode, type WorkspaceUiMode } from '@/lib/ui-mode'
import {
  createDefaultWorkbenchPanels,
  normalizeWorkbenchPanels,
  type WorkbenchPanels,
} from '@/features/workbench/utils/panels'
import { reportError, toClientError } from '@/lib/client-error-taxonomy'
import { log } from '@/lib/client-logging'
import {
  isPathInWorkspace,
  toWorkspaceAbsolute,
  toWorkspaceRelative,
} from '@/features/workspace/utils/path'
import {
  projectIdSchema,
  threadIdSchema,
  type WorkspaceSearchMatch,
  type WorkspaceSearchMatchMode,
  type WorkspaceSearchQuery,
} from '@workspace/contracts'
import * as v from 'valibot'
import type { EditorScrollPosition } from '@singapor/core'

// Local-only UI state uses an explicit schema version plus a clear mismatch policy:
// update deliberately or drop intentionally. Server-backed caches may reset/refetch.
const CACHE_VERSION = 17
const CACHE_KEY_PREFIX = `platform.workspace-state.v${CACHE_VERSION}`
const CACHE_KEY_NAMESPACE = 'platform.workspace-state.v'
const WORKSPACE_SLICE_KEY_PREFIX = `${CACHE_KEY_PREFIX}.workspace:`
const SEARCH_BUFFER_KEY_PREFIX = `${CACHE_KEY_PREFIX}.search:`

/**
 * How many projects keep their tabs across restarts. Slices are small (paths and
 * ids), so the ceiling exists to bound localStorage growth over months of use,
 * not to protect any one write.
 */
export const WORKSPACE_SLICE_LIMIT = 8

export const WORKSPACE_CACHE_STORAGE_KEYS = {
  chatModePanels: `${CACHE_KEY_PREFIX}.chatModePanels`,
  chatModeSelection: `${CACHE_KEY_PREFIX}.chatModeSelection`,
  rootFolder: `${CACHE_KEY_PREFIX}.rootFolder`,
  uiMode: `${CACHE_KEY_PREFIX}.uiMode`,
  workbenchLayout: `${CACHE_KEY_PREFIX}.workbenchLayout`,
  workspaceIndex: `${CACHE_KEY_PREFIX}.workspaces`,
} as const

/** Per-project state lives under its own key so switching never rewrites another project's. */
export function workspaceSliceStorageKey(rootPath: string) {
  return `${WORKSPACE_SLICE_KEY_PREFIX}${rootPath}`
}

/**
 * Search results are the one bulky entry — a full match list. Splitting them from the
 * slice keeps a quota failure on search from taking the project's open tabs with it.
 */
export function searchBufferStorageKey(rootPath: string) {
  return `${SEARCH_BUFFER_KEY_PREFIX}${rootPath}`
}

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
const scrollPositionSchema = v.strictObject({
  left: v.number(),
  top: v.number(),
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
const workspaceSliceSchema = v.strictObject({
  editorHistory: stringArraySchema,
  recentlyClosedEditorPaths: stringArraySchema,
  scrollPositionByPath: v.record(v.string(), scrollPositionSchema),
  workbenchPanels: workbenchPanelsSchema,
})
const uiModeSchema = v.custom<WorkspaceUiMode>(isWorkspaceUiMode)
const chatModePanelsSchema = v.strictObject({
  activeToolTab: v.custom<ChatModeToolTab>(isChatModeToolTab),
  sessionRailOpen: v.boolean(),
  toolPaneOpen: v.boolean(),
})
const chatModeSelectionSchema = v.union([
  v.strictObject({ kind: v.literal('auto') }),
  v.strictObject({ kind: v.literal('draft'), projectId: projectIdSchema }),
  v.strictObject({
    kind: v.literal('session'),
    projectId: projectIdSchema,
    threadId: threadIdSchema,
  }),
])

const AUTO_SESSION_SELECTION: SessionSelection = { kind: 'auto' }

/** Everything a single project remembers. Keyed by its root path, never merged. */
export type CachedWorkspaceSlice = {
  editorHistory: string[]
  recentlyClosedEditorPaths: string[]
  scrollPositionByPath: Record<string, EditorScrollPosition>
  workbenchPanels: WorkbenchPanels
}

export type CachedWorkspaceState = {
  chatModePanels: ChatModePanels
  rootFolder: PickedFsEntry | null
  /** Restored search results, by the root path they belong to. */
  searchBuffers: Record<string, CachedSearchBufferState>
  uiMode: WorkspaceUiMode
  /** Suppresses the wallpaper image and video everywhere they are drawn. */
  workbenchLayout: WorkbenchLayout
  /** Every remembered project, active one included. Most-recent-first is `workspaceOrder`. */
  workspaces: Record<string, CachedWorkspaceSlice>
  workspaceOrder: string[]
}

export function readWorkspaceCache(): CachedWorkspaceState {
  if (!canUseLocalStorage()) return emptyWorkspaceState()

  purgeSupersededCacheVersions()

  return workspaceStateFromCache()
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

/**
 * Which conversation chat mode was last showing. Its own key rather than a field of
 * `CachedWorkspaceState`: that blob belongs to the editor workspace store, while the
 * selection store needs the value synchronously at module init — a selection restored
 * one frame late is a selection the auto-pick has already overwritten.
 */
export function readSessionSelectionCache(): SessionSelection {
  if (!canUseLocalStorage()) return AUTO_SESSION_SELECTION

  return readCacheEntry(
    WORKSPACE_CACHE_STORAGE_KEYS.chatModeSelection,
    chatModeSelectionSchema,
    AUTO_SESSION_SELECTION,
  )
}

export function writeSessionSelectionCache(selection: SessionSelection) {
  writeCacheEntry(WORKSPACE_CACHE_STORAGE_KEYS.chatModeSelection, selection)
}

export function writeRootFolderCache(rootFolder: PickedFsEntry | null) {
  writeCacheEntry(WORKSPACE_CACHE_STORAGE_KEYS.rootFolder, rootFolder)
}

export function writeWorkspaceSliceCache(rootPath: string, slice: CachedWorkspaceSlice) {
  writeCacheEntry(workspaceSliceStorageKey(rootPath), storedSliceForWorkspace(rootPath, slice))
}

export function writeSearchBufferCache(
  rootPath: string,
  searchBuffer: CachedSearchBufferState | null,
) {
  if (!searchBuffer || searchBuffer.rootPath !== rootPath) {
    removeCacheEntry(searchBufferStorageKey(rootPath))
    return
  }

  writeCacheEntry(searchBufferStorageKey(rootPath), searchBuffer)
}

/**
 * Records which projects are remembered, newest first, and deletes the storage of any
 * that fell off. Written after the slices themselves so a crash mid-write leaves an
 * orphan slice — harmless — rather than an index pointing at nothing.
 */
export function writeWorkspaceIndexCache(rootPaths: readonly string[]) {
  const kept = rootPaths.slice(0, WORKSPACE_SLICE_LIMIT)
  const keptSet = new Set(kept)

  // Both sources matter: the stored index knows about projects this caller has
  // forgotten, and `rootPaths` knows about the ones it just trimmed off the end.
  for (const rootPath of new Set([...readWorkspaceIndex(), ...rootPaths])) {
    if (keptSet.has(rootPath)) continue

    removeCacheEntry(workspaceSliceStorageKey(rootPath))
    removeCacheEntry(searchBufferStorageKey(rootPath))
  }

  writeCacheEntry(WORKSPACE_CACHE_STORAGE_KEYS.workspaceIndex, kept)
}

function workspaceStateFromCache(): CachedWorkspaceState {
  const rootFolder = readCacheEntry<PickedFsEntry | null>(
    WORKSPACE_CACHE_STORAGE_KEYS.rootFolder,
    rootFolderSchema,
    null,
  )
  const workspaceOrder = workspaceOrderFromCache(rootFolder?.path ?? null)
  const workspaces: Record<string, CachedWorkspaceSlice> = {}
  const searchBuffers: Record<string, CachedSearchBufferState> = {}

  for (const rootPath of workspaceOrder) {
    workspaces[rootPath] = readWorkspaceSlice(rootPath)
    const searchBuffer = readSearchBuffer(rootPath)
    if (searchBuffer) searchBuffers[rootPath] = searchBuffer
  }

  return {
    chatModePanels: readCacheEntry(
      WORKSPACE_CACHE_STORAGE_KEYS.chatModePanels,
      chatModePanelsSchema,
      createDefaultChatModePanels(),
    ),
    rootFolder,
    searchBuffers,
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
    workspaceOrder,
    workspaces,
  }
}

/**
 * Just the workspace order — the slug→root oracle — without touching a single slice.
 *
 * `readWorkspaceCache()` parses every slice AND every search buffer, and a search
 * buffer carries a materialized match list; it also sweeps the whole localStorage
 * keyspace. A caller that only needs the order should not pay for any of that, least
 * of all on a path that runs per back/forward press.
 */
export function readWorkspaceOrder(activeRootPath: string | null): readonly string[] {
  if (!canUseLocalStorage()) return []

  return workspaceOrderFromCache(activeRootPath)
}

/** The open root always leads, even when the index predates it or was dropped. */
function workspaceOrderFromCache(activePath: string | null) {
  const stored = readWorkspaceIndex()
  if (!activePath) return stored.slice(0, WORKSPACE_SLICE_LIMIT)

  return [activePath, ...stored.filter((rootPath) => rootPath !== activePath)].slice(
    0,
    WORKSPACE_SLICE_LIMIT,
  )
}

function readWorkspaceIndex() {
  return readCacheEntry<string[]>(
    WORKSPACE_CACHE_STORAGE_KEYS.workspaceIndex,
    stringArraySchema,
    [],
  )
}

function readWorkspaceSlice(rootPath: string): CachedWorkspaceSlice {
  return restoredSliceForWorkspace(
    rootPath,
    readCacheEntry<CachedWorkspaceSlice>(
      workspaceSliceStorageKey(rootPath),
      workspaceSliceSchema,
      emptyWorkspaceSlice(),
    ),
  )
}

function readSearchBuffer(rootPath: string) {
  const searchBuffer = readCacheEntry<CachedSearchBufferState | null>(
    searchBufferStorageKey(rootPath),
    v.nullable(cachedSearchBufferStateSchema),
    null,
  )
  if (!searchBuffer) return null
  if (searchBuffer.rootPath !== rootPath) return null

  return searchBuffer
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
  if (!canUseLocalStorage()) return

  try {
    localStorage.removeItem(key)
  } catch {
    // Ignore private-mode failures; the app should still open normally.
  }
}

function sliceForWorkspace(rootPath: string, slice: CachedWorkspaceSlice): CachedWorkspaceSlice {
  const editorTabs = slice.workbenchPanels.editorTabs.filter((tab) =>
    pathForWorkspace(rootPath, tab.path),
  )

  return {
    editorHistory: workspacePathsForCache(rootPath, slice.editorHistory),
    recentlyClosedEditorPaths: workspacePathsForCache(rootPath, slice.recentlyClosedEditorPaths),
    scrollPositionByPath: scrollPositionsForWorkspace(rootPath, slice.scrollPositionByPath),
    workbenchPanels: normalizeWorkbenchPanels({
      activeBottomTab: slice.workbenchPanels.activeBottomTab,
      activeEditorTabId: activeEditorTabIdForTabs(
        editorTabs,
        slice.workbenchPanels.activeEditorTabId,
      ),
      activeSidebarTab: slice.workbenchPanels.activeSidebarTab,
      editorTabs,
    }),
  }
}

function workspacePathsForCache(rootPath: string, paths: readonly string[]) {
  return Array.from(new Set(paths.filter((path) => pathForWorkspace(rootPath, path))))
}

function scrollPositionsForWorkspace(
  rootPath: string,
  scrollPositionByPath: Readonly<Record<string, EditorScrollPosition>>,
) {
  return Object.fromEntries(
    Object.entries(scrollPositionByPath).filter(([path]) => pathForWorkspace(rootPath, path)),
  )
}

function pathForWorkspace(rootPath: string, path: string) {
  if (!rootPath) return false
  if (parseConflictDiffDocumentId(path)) return false

  const searchBuffer = parseSearchBufferDocumentId(path)
  if (searchBuffer) return searchBuffer.rootPath === rootPath

  return isPathInWorkspace(backingPathForWorkspace(path), rootPath)
}

function backingPathForWorkspace(path: string) {
  if (parseConflictDiffDocumentId(path)) return ''

  const diff = parseDiffDocumentId(path)
  if (diff) return diff.path

  return path
}

/**
 * Serialized paths are workspace-relative; in-memory paths stay absolute, because the
 * file server wants absolute. The `./` marker is what makes the two forms tellable
 * apart on the way back in: every real file path is absolute and every synthetic
 * document id (`git-diff:`, `search-buffer:`, …) starts with a letter, so nothing
 * else in a slice can begin `./`. That avoids sniffing a list of document-id prefixes,
 * of which this codebase already keeps five copies that disagree.
 */
const RELATIVE_PATH_MARKER = './'

function storedPath(rootPath: string, path: string) {
  const relative = toWorkspaceRelative(rootPath, path)
  if (!relative) return path

  return `${RELATIVE_PATH_MARKER}${relative}`
}

function restoredPath(rootPath: string, path: string) {
  if (!path.startsWith(RELATIVE_PATH_MARKER)) return path

  return toWorkspaceAbsolute(rootPath, path.slice(RELATIVE_PATH_MARKER.length)) ?? path
}

/**
 * Relativize on the way out, absolutize on the way in. Both wrap `sliceForWorkspace`
 * rather than living inside it: that filter runs in BOTH directions and its predicate
 * only understands absolute paths, so relativizing inside it would make every restored
 * path fail `isPathInWorkspace` and silently empty the slice on the first reload.
 */
function storedSliceForWorkspace(rootPath: string, slice: CachedWorkspaceSlice) {
  return mapSlicePaths(sliceForWorkspace(rootPath, slice), (path) => storedPath(rootPath, path))
}

function restoredSliceForWorkspace(rootPath: string, slice: CachedWorkspaceSlice) {
  return sliceForWorkspace(
    rootPath,
    mapSlicePaths(slice, (path) => restoredPath(rootPath, path)),
  )
}

function mapSlicePaths(
  slice: CachedWorkspaceSlice,
  mapPath: (path: string) => string,
): CachedWorkspaceSlice {
  return {
    editorHistory: slice.editorHistory.map(mapPath),
    recentlyClosedEditorPaths: slice.recentlyClosedEditorPaths.map(mapPath),
    scrollPositionByPath: Object.fromEntries(
      Object.entries(slice.scrollPositionByPath).map(([path, position]) => [
        mapPath(path),
        position,
      ]),
    ),
    workbenchPanels: {
      ...slice.workbenchPanels,
      editorTabs: slice.workbenchPanels.editorTabs.map((tab) => ({
        ...tab,
        path: mapPath(tab.path),
      })),
    },
  }
}

/**
 * Bumping `CACHE_VERSION` renames the index too, and `writeWorkspaceIndexCache` — the
 * only deleter of per-root storage — walks the CURRENT version's index. So every
 * superseded `…v<n>.workspace:<root>` and `…v<n>.search:<root>` key becomes unreachable
 * and undeletable. Search buffers carry a materialized match list, so that is real
 * quota, not a few bytes. Sweeping them is garbage collection of keys nothing can
 * reach, not a migration: no value is read, translated or preserved.
 */
function purgeSupersededCacheVersions() {
  if (!canUseLocalStorage()) return

  const superseded = supersededCacheKeys()
  if (superseded.length === 0) return

  for (const key of superseded) removeCacheEntry(key)

  log.info({
    action: 'workspace.cache_versions_purged',
    area: 'workspace',
    keys: superseded.length,
    version: CACHE_VERSION,
  })
}

/**
 * Keys renamed rather than versioned, so the namespace walk below cannot see them.
 * Greenfield rule: delete the orphan instead of teaching anything to read it.
 */
const RENAMED_CACHE_KEYS = ['platform:prompt-stash:v1'] as const

function supersededCacheKeys() {
  const keys: string[] = []

  // Collected before any removal: deleting during the walk renumbers the indices.
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (!key) continue
      if (RENAMED_CACHE_KEYS.some((renamed) => renamed === key)) {
        keys.push(key)
        continue
      }
      if (!key.startsWith(CACHE_KEY_NAMESPACE)) continue
      if (key.startsWith(`${CACHE_KEY_PREFIX}.`)) continue

      keys.push(key)
    }
  } catch {
    return []
  }

  return keys
}

export function emptyWorkspaceSlice(): CachedWorkspaceSlice {
  return {
    editorHistory: [],
    recentlyClosedEditorPaths: [],
    scrollPositionByPath: {},
    workbenchPanels: createDefaultWorkbenchPanels(),
  }
}

function emptyWorkspaceState(): CachedWorkspaceState {
  return {
    chatModePanels: createDefaultChatModePanels(),
    rootFolder: null,
    searchBuffers: {},
    uiMode: DEFAULT_WORKSPACE_UI_MODE,
    workbenchLayout: createDefaultWorkbenchLayout(),
    workspaceOrder: [],
    workspaces: {},
  }
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
