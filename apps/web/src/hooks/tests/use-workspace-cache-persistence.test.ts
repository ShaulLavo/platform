import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createEditorWorkspaceStore } from '@/features/editor/state/editor-workspace-state'
import { DEFAULT_DIFF_VIEW_MODE } from '@/features/editor/utils/diff-view-mode'
import { createSearchBufferStore } from '@/features/search/search-buffer-state'
import {
  createDefaultWorkbenchPanels,
  openEditorPathInWorkbenchPanels,
} from '@/features/workbench/utils/workbench-panels'
import type { PickedFsEntry } from '@/lib/file-system-types'
import type { CachedWorkspaceState, WorkspaceCacheWriteState } from '@/lib/workspace-cache'
import { subscribeWorkspaceCachePersistence } from '@/hooks/use-workspace-cache-persistence'

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
    const writes: WorkspaceCacheWriteState[] = []
    const unsubscribe = subscribeWorkspaceCachePersistence({
      searchStore,
      workspaceStore,
      writeCache: (state) => writes.push(state),
    })
    const runId = searchStore.getState().startSearch({
      includeContent: true,
      limit: 20,
      path: '/repo',
      query: 'needle',
    })

    vi.runAllTimers()
    expect(writes).toHaveLength(1)
    expect(writes.at(-1)?.searchBuffer).toMatchObject({
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
    expect(writes).toHaveLength(1)

    searchStore.getState().appendEvent(runId, {
      count: 1,
      path: '/repo',
      query: 'needle',
      truncated: false,
      type: 'done',
    })

    vi.runAllTimers()
    expect(writes).toHaveLength(2)
    expect(writes.at(-1)?.searchBuffer).toMatchObject({
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
    expect(cachedMatchCount(writes.at(-1))).toBe(1)

    unsubscribe()
  })

  it('ignores transient workspace picker and denormalized selection state', () => {
    const workspaceStore = createEditorWorkspaceStore(cachedWorkspace())
    const searchStore = createSearchBufferStore()
    const writes: WorkspaceCacheWriteState[] = []
    const unsubscribe = subscribeWorkspaceCachePersistence({
      searchStore,
      workspaceStore,
      writeCache: (state) => writes.push(state),
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
    expect(writes).toHaveLength(1)
    expect(writes.at(-1)?.workbenchPanels.editorTabs.map((tab) => tab.path)).toEqual([
      '/repo/src/a.ts',
    ])

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

function cachedMatchCount(state: WorkspaceCacheWriteState | undefined) {
  const searchBuffer = state?.searchBuffer
  if (!searchBuffer) return 0

  return searchBuffer.matches.length
}
