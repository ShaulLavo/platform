import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createEditorWorkspaceStore } from '@/features/editor/state/editor-workspace-state'
import { DEFAULT_DIFF_VIEW_MODE } from '@/features/editor/utils/diff-view-mode'
import { createSearchBufferStore } from '@/features/search/search-buffer-state'
import {
  createDefaultWorkbenchPanels,
  openEditorPathInWorkbenchPanels,
  type WorkbenchPanels,
} from '@/features/workbench/utils/workbench-panels'
import type { PickedFsEntry } from '@/lib/file-system-types'
import type { CachedSearchBufferState, CachedWorkspaceState } from '@/lib/workspace-cache'
import {
  subscribeWorkspaceCachePersistence,
  type WorkspaceCacheWriters,
} from '@/hooks/use-workspace-cache-persistence'

type CacheWrite =
  | {
      diffViewMode: CachedWorkspaceState['diffViewMode']
      key: 'diffViewMode'
    }
  | {
      key: 'editorHistory'
      paths: readonly string[]
      rootFolder: PickedFsEntry | null
    }
  | {
      key: 'recentlyClosedEditorPaths'
      paths: readonly string[]
      rootFolder: PickedFsEntry | null
    }
  | {
      key: 'rootFolder'
      rootFolder: PickedFsEntry | null
    }
  | {
      key: 'searchBuffer'
      rootFolder: PickedFsEntry | null
      searchBuffer: CachedSearchBufferState | null
    }
  | {
      key: 'workbenchPanels'
      rootFolder: PickedFsEntry | null
      workbenchPanels: WorkbenchPanels
    }

describe('workspace cache persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not persist every streaming search match batch', () => {
    const workspaceStore = createEditorWorkspaceStore(cachedWorkspace())
    const searchStore = createSearchBufferStore()
    const writes: CacheWrite[] = []
    const unsubscribe = subscribeWorkspaceCachePersistence({
      cacheWriters: recordingCacheWriters(writes),
      searchStore,
      workspaceStore,
    })
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
        match: {
          kind: 'content',
          path: '/repo/src/app.ts',
          source: 'disk',
          type: 'file',
        },
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
    expect(lastCacheWrite(writes, 'searchBuffer')?.searchBuffer).toMatchObject({
      matches: [
        expect.objectContaining({
          path: '/repo/src/app.ts',
        }),
      ],
      query: 'needle',
      resultsQuery: 'needle',
      totalCount: 1,
      truncated: false,
    })
    expect(cachedMatchCount(lastCacheWrite(writes, 'searchBuffer')?.searchBuffer)).toBe(1)

    unsubscribe()
  })

  it('ignores transient workspace picker and denormalized selection state', () => {
    const workspaceStore = createEditorWorkspaceStore(cachedWorkspace())
    const searchStore = createSearchBufferStore()
    const writes: CacheWrite[] = []
    const unsubscribe = subscribeWorkspaceCachePersistence({
      cacheWriters: recordingCacheWriters(writes),
      searchStore,
      workspaceStore,
    })

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
    expect(writeKeys(writes)).toEqual(['workbenchPanels'])
    expect(lastCacheWrite(writes, 'workbenchPanels')?.workbenchPanels.editorTabs).toMatchObject([
      { path: '/repo/src/a.ts' },
    ])

    unsubscribe()
  })

  it('writes only the cache key owned by the changed workspace field', () => {
    const workspaceStore = createEditorWorkspaceStore(cachedWorkspace())
    const searchStore = createSearchBufferStore()
    const writes: CacheWrite[] = []
    const unsubscribe = subscribeWorkspaceCachePersistence({
      cacheWriters: recordingCacheWriters(writes),
      searchStore,
      workspaceStore,
    })

    workspaceStore.getState().setDiffViewMode('stacked')
    vi.runAllTimers()
    expect(writeKeys(writes)).toEqual(['diffViewMode'])

    writes.length = 0
    workspaceStore.getState().setEditorHistory(['/repo/src/a.ts'])
    vi.runAllTimers()
    expect(writeKeys(writes)).toEqual(['editorHistory'])
    expect(lastCacheWrite(writes, 'editorHistory')).toMatchObject({
      paths: ['/repo/src/a.ts'],
      rootFolder: expect.objectContaining({ path: '/repo' }),
    })

    unsubscribe()
  })
})

function cachedWorkspace(): CachedWorkspaceState {
  return {
    diffViewMode: DEFAULT_DIFF_VIEW_MODE,
    editorHistory: [],
    openFilePaths: [],
    recentlyClosedEditorPaths: [],
    rootFolder: pickedDirectory('/repo'),
    selectedFilePath: null,
    workbenchPanels: createDefaultWorkbenchPanels(),
  }
}

function pickedDirectory(path: string): PickedFsEntry {
  return {
    birthtimeMs: 1,
    mtimeMs: 1,
    name: 'repo',
    path,
    size: 1,
    type: 'directory',
    version: 'test:1:1',
  }
}

function recordingCacheWriters(writes: CacheWrite[]): WorkspaceCacheWriters {
  return {
    diffViewMode: (diffViewMode) => writes.push({ diffViewMode, key: 'diffViewMode' }),
    editorHistory: (rootFolder, paths) =>
      writes.push({ key: 'editorHistory', paths: Array.from(paths), rootFolder }),
    recentlyClosedEditorPaths: (rootFolder, paths) =>
      writes.push({ key: 'recentlyClosedEditorPaths', paths: Array.from(paths), rootFolder }),
    rootFolder: (rootFolder) => writes.push({ key: 'rootFolder', rootFolder }),
    searchBuffer: (rootFolder, searchBuffer) =>
      writes.push({ key: 'searchBuffer', rootFolder, searchBuffer }),
    workbenchPanels: (rootFolder, workbenchPanels) =>
      writes.push({ key: 'workbenchPanels', rootFolder, workbenchPanels }),
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

function cachedMatchCount(searchBuffer: CachedSearchBufferState | null | undefined) {
  if (!searchBuffer) return 0

  return searchBuffer.matches.length
}
