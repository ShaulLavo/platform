import { createDefaultWorkbenchLayout } from '@/features/workbench/utils/workbench-layout'
import { createDefaultChatModePanels } from '@/features/chat-mode/utils/panels'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createEditorWorkspaceStore } from '@/features/editor/state/editor-workspace-state'
import { createEditorDocumentStore } from '@/features/editor/state/editor-document-state'
import { DEFAULT_DIFF_VIEW_MODE } from '@/features/editor/utils/diff-view-mode'
import { createSearchBufferStore } from '@/features/search/search-buffer-state'
import {
  createDefaultWorkbenchPanels,
  openEditorPathInWorkbenchPanels,
} from '@/features/workbench/utils/workbench-panels'
import type { FileResult, PickedFsEntry } from '@/lib/file-system-types'
import type {
  CachedSearchBufferState,
  CachedWorkspaceSlice,
  CachedWorkspaceState,
} from '@/lib/workspace-cache'
import {
  subscribeWorkspaceCachePersistence,
  type WorkspaceCacheWriters,
} from '@/hooks/use-workspace-cache-persistence'

type CacheWrite =
  | { chatModePanels: CachedWorkspaceState['chatModePanels']; key: 'chatModePanels' }
  | { diffViewMode: CachedWorkspaceState['diffViewMode']; key: 'diffViewMode' }
  | { key: 'uiMode'; uiMode: CachedWorkspaceState['uiMode'] }
  | { key: 'wallpaperHidden'; wallpaperHidden: CachedWorkspaceState['wallpaperHidden'] }
  | { key: 'rootFolder'; rootFolder: PickedFsEntry | null }
  | { key: 'searchBuffer'; rootPath: string; searchBuffer: CachedSearchBufferState | null }
  | { key: 'workbenchLayout'; workbenchLayout: CachedWorkspaceState['workbenchLayout'] }
  | { key: 'workspaceIndex'; rootPaths: readonly string[] }
  | { key: 'workspaceSlice'; rootPath: string; slice: CachedWorkspaceSlice }

describe('workspace cache persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not persist every streaming search match batch', () => {
    const { searchStore, unsubscribe, writes } = harness()
    const runId = searchStore.getState().startSearch({
      includeContent: true,
      limit: 20,
      path: '/repo',
      query: 'needle',
    })

    vi.runAllTimers()
    expect(writeKeys(writes)).toEqual(['searchBuffer'])
    expect(lastCacheWrite(writes, 'searchBuffer')?.searchBuffer).toMatchObject({
      query: 'needle',
      resultsQuery: '',
      totalCount: 0,
    })

    searchStore.getState().appendEvents(runId, [
      {
        match: { kind: 'content', path: '/repo/src/app.ts', source: 'disk', type: 'file' },
        type: 'match',
      },
    ])

    vi.runAllTimers()
    expect(writeKeys(writes)).toEqual(['searchBuffer'])

    searchStore.getState().appendEvent(runId, {
      count: 1,
      path: '/repo',
      query: 'needle',
      truncated: false,
      type: 'done',
    })

    vi.runAllTimers()
    expect(writeKeys(writes)).toEqual(['searchBuffer', 'searchBuffer'])
    expect(lastCacheWrite(writes, 'searchBuffer')).toMatchObject({
      rootPath: '/repo',
      searchBuffer: {
        matches: [expect.objectContaining({ path: '/repo/src/app.ts' })],
        query: 'needle',
        resultsQuery: 'needle',
        totalCount: 1,
      },
    })

    unsubscribe()
  })

  it('ignores transient workspace picker and denormalized selection state', () => {
    const { unsubscribe, workspaceStore, writes } = harness()

    workspaceStore.getState().setPickerOpen(true)
    vi.runAllTimers()
    expect(writes).toHaveLength(0)

    workspaceStore.setState({
      openFilePaths: ['/repo/src/a.ts'],
      selectedFilePath: '/repo/src/a.ts',
    })
    vi.runAllTimers()
    expect(writes).toHaveLength(0)

    workspaceStore
      .getState()
      .setWorkbenchPanels(
        openEditorPathInWorkbenchPanels(
          workspaceStore.getState().workbenchPanels,
          '/repo/src/a.ts',
        ),
      )
    vi.runAllTimers()
    expect(writeKeys(writes)).toEqual(['workspaceSlice'])
    expect(lastCacheWrite(writes, 'workspaceSlice')).toMatchObject({
      rootPath: '/repo',
      slice: { workbenchPanels: { editorTabs: [{ path: '/repo/src/a.ts' }] } },
    })

    unsubscribe()
  })

  it('writes only the cache key owned by the changed workspace field', () => {
    const { unsubscribe, workspaceStore, writes } = harness()

    // Must differ from DEFAULT_DIFF_VIEW_MODE, or the store short-circuits and
    // there is no change for the persistence hook to write.
    workspaceStore.getState().setDiffViewMode('split')
    vi.runAllTimers()
    expect(writeKeys(writes)).toEqual(['diffViewMode'])

    writes.length = 0
    workspaceStore.getState().setWallpaperHidden(true)
    vi.runAllTimers()
    expect(writeKeys(writes)).toEqual(['wallpaperHidden'])
    expect(lastCacheWrite(writes, 'wallpaperHidden')?.wallpaperHidden).toBe(true)

    writes.length = 0
    workspaceStore.getState().setEditorHistory(['/repo/src/a.ts'])
    vi.runAllTimers()
    expect(writeKeys(writes)).toEqual(['workspaceSlice'])
    expect(lastCacheWrite(writes, 'workspaceSlice')).toMatchObject({
      rootPath: '/repo',
      slice: { editorHistory: ['/repo/src/a.ts'] },
    })

    unsubscribe()
  })

  it('files a switched-away project under its own key and records the new order', () => {
    const { unsubscribe, workspaceStore, writes } = harness()

    workspaceStore.getState().setEditorHistory(['/repo/src/a.ts'])
    vi.runAllTimers()
    writes.length = 0

    workspaceStore.getState().switchWorkspace(pickedDirectory('/other'))
    vi.runAllTimers()

    // The parked slice is the same object the active writer already stored, so the
    // switch costs an index write and a first write for the newly opened project.
    expect(lastCacheWrite(writes, 'workspaceIndex')?.rootPaths).toEqual(['/other', '/repo'])
    expect(cacheWrites(writes, 'workspaceSlice').map((write) => write.rootPath)).toEqual(['/other'])

    unsubscribe()
  })

  it('keeps writing a parked project’s results to that project’s key', () => {
    const { searchStore, unsubscribe, workspaceStore, writes } = harness()
    searchStore.getState().startSearch({
      includeContent: true,
      limit: 20,
      path: '/repo',
      query: 'needle',
    })
    vi.runAllTimers()
    writes.length = 0

    workspaceStore.getState().switchWorkspace(pickedDirectory('/other'))
    searchStore.getState().switchWorkspace('/other')
    searchStore.getState().setQuery('/other', 'haystack')
    vi.runAllTimers()

    expect(cacheWrites(writes, 'searchBuffer').map((write) => write.rootPath)).toEqual(['/other'])
    expect(lastCacheWrite(writes, 'searchBuffer')?.searchBuffer).toMatchObject({
      query: 'haystack',
      rootPath: '/other',
    })

    unsubscribe()
  })

  it('writes editor scroll positions into the workspace slice keyed by path', () => {
    const { documentStore, unsubscribe, workspaceStore, writes } = harness()
    workspaceStore
      .getState()
      .setWorkbenchPanels(
        openEditorPathInWorkbenchPanels(
          workspaceStore.getState().workbenchPanels,
          '/repo/src/a.ts',
        ),
      )
    vi.runAllTimers()
    writes.length = 0

    const tab = workspaceStore.getState().workbenchPanels.editorTabs[0]
    expect(tab).toBeTruthy()
    documentStore.getState().ensureEditorView(tab!.id, fileResult('/repo/src/a.ts'))
    documentStore.getState().setEditorViewScrollPosition(tab!.id, { left: 0, top: 240 })
    vi.runAllTimers()

    expect(lastCacheWrite(writes, 'workspaceSlice')?.slice.scrollPositionByPath).toEqual({
      '/repo/src/a.ts': { left: 0, top: 240 },
    })

    unsubscribe()
  })
})

function harness() {
  const documentStore = createEditorDocumentStore()
  const workspaceStore = createEditorWorkspaceStore(cachedWorkspace())
  const searchStore = createSearchBufferStore()
  const writes: CacheWrite[] = []
  const unsubscribe = subscribeWorkspaceCachePersistence({
    cacheWriters: recordingCacheWriters(writes),
    documentStore,
    searchStore,
    workspaceStore,
  })

  return { documentStore, searchStore, unsubscribe, workspaceStore, writes }
}

function cachedWorkspace(): CachedWorkspaceState {
  return {
    chatModePanels: createDefaultChatModePanels(),
    diffViewMode: DEFAULT_DIFF_VIEW_MODE,
    rootFolder: pickedDirectory('/repo'),
    searchBuffers: {},
    uiMode: 'workbench',
    wallpaperHidden: false,
    workbenchLayout: createDefaultWorkbenchLayout(),
    workspaceOrder: ['/repo'],
    workspaces: {
      '/repo': {
        editorHistory: [],
        recentlyClosedEditorPaths: [],
        scrollPositionByPath: {},
        workbenchPanels: createDefaultWorkbenchPanels(),
      },
    },
  }
}

function pickedDirectory(path: string): PickedFsEntry {
  return {
    birthtimeMs: 1,
    mtimeMs: 1,
    name: path.split('/').filter(Boolean).at(-1) ?? path,
    path,
    size: 1,
    type: 'directory',
    version: 'test:1:1',
  }
}

function fileResult(path: string): FileResult {
  return {
    content: `contents of ${path}`,
    mtimeMs: 1,
    path,
    size: 1,
    version: `test:${path}`,
  }
}

function recordingCacheWriters(writes: CacheWrite[]): WorkspaceCacheWriters {
  return {
    chatModePanels: (chatModePanels) => writes.push({ chatModePanels, key: 'chatModePanels' }),
    diffViewMode: (diffViewMode) => writes.push({ diffViewMode, key: 'diffViewMode' }),
    rootFolder: (rootFolder) => writes.push({ key: 'rootFolder', rootFolder }),
    searchBuffer: (rootPath, searchBuffer) =>
      writes.push({ key: 'searchBuffer', rootPath, searchBuffer }),
    uiMode: (uiMode) => writes.push({ key: 'uiMode', uiMode }),
    wallpaperHidden: (wallpaperHidden) => writes.push({ key: 'wallpaperHidden', wallpaperHidden }),
    workbenchLayout: (workbenchLayout) => writes.push({ key: 'workbenchLayout', workbenchLayout }),
    workspaceIndex: (rootPaths) =>
      writes.push({ key: 'workspaceIndex', rootPaths: Array.from(rootPaths) }),
    workspaceSlice: (rootPath, slice) => writes.push({ key: 'workspaceSlice', rootPath, slice }),
  }
}

function writeKeys(writes: readonly CacheWrite[]) {
  return writes.map((write) => write.key)
}

function lastCacheWrite<TKey extends CacheWrite['key']>(writes: readonly CacheWrite[], key: TKey) {
  return cacheWrites(writes, key).at(-1)
}

function cacheWrites<TKey extends CacheWrite['key']>(
  writes: readonly CacheWrite[],
  key: TKey,
): Extract<CacheWrite, { key: TKey }>[] {
  return writes.filter((write): write is Extract<CacheWrite, { key: TKey }> => write.key === key)
}
