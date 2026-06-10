import { describe, expect, it } from 'vitest'

import { editorWorkspaceLayoutForPaths } from '../../../test/factories/editor-workspace-layout'
import { createEditorWorkspaceStore } from '@/features/editor/state/editor-workspace-state'
import { createSearchBufferStore } from '@/features/search/search-buffer-state'
import { createSearchResultsSurface } from '@workspace/tiling/utils/layout-builders'
import { openSurface } from '@workspace/tiling/utils/layout-operations'
import type { PickedFsEntry } from '@/lib/file-system-types'
import type { CachedWorkspaceState, WorkspaceCacheWriteState } from '@/lib/workspace-cache'
import { subscribeWorkspaceCachePersistence } from '@/hooks/use-workspace-cache-persistence'

describe('workspace cache persistence', () => {
  it('does not persist every streaming search match batch', () => {
    const workspaceStore = createEditorWorkspaceStore(cachedWorkspace())
    const searchStore = createSearchBufferStore()
    const timers = deferredTimers()
    const writes: WorkspaceCacheWriteState[] = []
    const unsubscribe = subscribeWorkspaceCachePersistence({
      clearTimeout: timers.clearTimeout,
      searchStore,
      setTimeout: timers.setTimeout,
      workspaceStore,
      writeCache: (state) => writes.push(state),
    })
    const runId = searchStore.getState().startSearch({
      includeContent: true,
      limit: 20,
      path: '/repo',
      query: 'needle',
    })

    expect(timers.hasPending()).toBe(true)
    timers.flush()
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

    expect(timers.hasPending()).toBe(false)

    searchStore.getState().appendEvent(runId, {
      count: 1,
      path: '/repo',
      query: 'needle',
      truncated: false,
      type: 'done',
    })

    expect(timers.hasPending()).toBe(true)
    timers.flush()
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

  it('ignores transient workspace picker state', () => {
    const workspaceStore = createEditorWorkspaceStore(cachedWorkspace())
    const searchStore = createSearchBufferStore()
    const timers = deferredTimers()
    const unsubscribe = subscribeWorkspaceCachePersistence({
      clearTimeout: timers.clearTimeout,
      searchStore,
      setTimeout: timers.setTimeout,
      workspaceStore,
      writeCache: () => {},
    })

    workspaceStore.getState().setPickerOpen(true)
    expect(timers.hasPending()).toBe(false)

    workspaceStore.setState({
      openFilePaths: ['/repo/src/a.ts'],
      selectedFilePath: '/repo/src/a.ts',
    })
    expect(timers.hasPending()).toBe(false)

    workspaceStore
      .getState()
      .setWorkspaceLayout(
        openSurface(workspaceStore.getState().workspaceLayout, createSearchResultsSurface()),
      )
    expect(timers.hasPending()).toBe(true)

    unsubscribe()
  })
})

function cachedWorkspace(): CachedWorkspaceState {
  return {
    diffViewMode: 'split',
    editorHistory: [],
    openFilePaths: [],
    recentlyClosedEditorPaths: [],
    rootFolder: pickedDirectory('/repo'),
    selectedFilePath: null,
    workspaceLayout: editorWorkspaceLayoutForPaths([], null),
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

function deferredTimers() {
  let callback: (() => void) | null = null
  const timer = 1 as unknown as ReturnType<typeof setTimeout>

  return {
    clearTimeout() {
      callback = null
    },
    flush() {
      const next = callback
      callback = null
      next?.()
    },
    hasPending() {
      return callback !== null
    },
    setTimeout(next: () => void) {
      callback = next
      return timer
    },
  }
}

function cachedMatchCount(state: WorkspaceCacheWriteState | undefined) {
  const searchBuffer = state?.searchBuffer
  if (!searchBuffer) return 0

  return searchBuffer.matches.length
}
