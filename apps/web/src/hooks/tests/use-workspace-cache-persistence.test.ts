import { describe, expect, it } from 'vitest'

import { createEditorPaneLayoutForPaths } from '@/features/editor/state/editor-pane-state'
import { createEditorWorkspaceStore } from '@/features/editor/state/editor-workspace-state'
import { createSearchBufferStore } from '@/features/search/search-buffer-state'
import { createSearchResultsSurface } from '@/features/workbench/tiling-surface-manager/layout-builders'
import { openSurface } from '@/features/workbench/tiling-surface-manager/layout-operations'
import { workspaceLayoutForEditorPaneLayout } from '@/features/workbench/tiling-surface-manager/workbench-editor-surface-layout'
import type { PickedFsEntry } from '@/lib/file-system-types'
import type { CachedWorkspaceState, WorkspaceCacheState } from '@/lib/workspace-cache'
import { subscribeWorkspaceCachePersistence } from '@/hooks/use-workspace-cache-persistence'

describe('workspace cache persistence', () => {
  it('does not persist every streaming search match batch', () => {
    const workspaceStore = createEditorWorkspaceStore(cachedWorkspace())
    const searchStore = createSearchBufferStore()
    const timers = deferredTimers()
    const writes: WorkspaceCacheState[] = []
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
      query: 'needle',
      resultsQuery: 'needle',
      totalCount: 1,
      truncated: false,
    })
    expect(hasCachedMatches(writes.at(-1))).toBe(false)

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
  const editorPaneLayout = createEditorPaneLayoutForPaths([], null)

  return {
    diffViewMode: 'split',
    editorHistory: [],
    editorPaneLayout,
    openFilePaths: [],
    recentlyClosedEditorPaths: [],
    rootFolder: pickedDirectory('/repo'),
    selectedFilePath: null,
    workspaceLayout: workspaceLayoutForEditorPaneLayout(editorPaneLayout),
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

function hasCachedMatches(state: WorkspaceCacheState | undefined) {
  const searchBuffer = state?.searchBuffer
  if (!searchBuffer) return false

  return 'matches' in searchBuffer
}
