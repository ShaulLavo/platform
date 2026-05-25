import { describe, expect, it } from 'bun:test'
import { fileSystemKeys } from '@/lib/query-keys'
import { shouldRefreshReadyRootTree } from '@/hooks/use-workspace-events'
import {
  affectedDirectoryPaths,
  affectedOpenFileRefreshPaths,
  planFetchedOpenFileRefresh,
  planWorkspaceFilesystemEvents,
  planWorkspaceReady,
} from '@/lib/workspace-event-model'

describe('shouldRefreshReadyRootTree', () => {
  it('skips ready refresh when the root tree query is fetching', () => {
    const queryClient = queryClientWithState('repo', {
      data: {},
      dataUpdatedAt: 0,
      fetchStatus: 'fetching',
    })

    expect(shouldRefreshReadyRootTree(queryClient, 'repo', 20_000)).toBe(false)
  })

  it('skips ready refresh when the root tree query is fresh', () => {
    const queryClient = queryClientWithState('repo', {
      data: {},
      dataUpdatedAt: 15_000,
      fetchStatus: 'idle',
    })

    expect(shouldRefreshReadyRootTree(queryClient, 'repo', 20_000)).toBe(false)
  })

  it('refreshes ready root tree when cached data is stale', () => {
    const queryClient = queryClientWithState('repo', {
      data: {},
      dataUpdatedAt: 1_000,
      fetchStatus: 'idle',
    })

    expect(shouldRefreshReadyRootTree(queryClient, 'repo', 20_000)).toBe(true)
  })

  it('refreshes ready root tree when cached data was invalidated', () => {
    const queryClient = queryClientWithState('repo', {
      data: {},
      dataUpdatedAt: 19_000,
      fetchStatus: 'idle',
      isInvalidated: true,
    })

    expect(shouldRefreshReadyRootTree(queryClient, 'repo', 20_000)).toBe(true)
  })
})

describe('affectedOpenFileRefreshPaths', () => {
  const root = 'repo'
  const openFiles = ['repo/a.ts', 'repo/b.ts', 'repo/src/c.ts']

  it('refreshes the exact open file for changed events', () => {
    const paths = affectedOpenFileRefreshPaths(
      [{ type: 'changed', path: 'repo/a.ts' }],
      openFiles,
      new Set(),
      root,
    )

    expect(paths).toEqual(['repo/a.ts'])
  })

  it('does not refresh sibling tabs for ordinary non-open changes', () => {
    const paths = affectedOpenFileRefreshPaths(
      [{ type: 'changed', path: 'repo/package.json' }],
      openFiles,
      new Set(),
      root,
    )

    expect(paths).toEqual([])
  })

  it('uses directory fallback for temporary save paths', () => {
    const paths = affectedOpenFileRefreshPaths(
      [{ type: 'changed', path: 'repo/.a.ts.tmp' }],
      openFiles,
      new Set(),
      root,
    )

    expect(paths).toEqual(['repo/a.ts', 'repo/b.ts'])
  })
})

describe('planWorkspaceFilesystemEvents', () => {
  const rootPath = 'repo'

  it('plans tree and open-file refresh operations for changed files', () => {
    const entry = treeEntry('repo/a.ts')
    const plan = planWorkspaceFilesystemEvents({
      events: [{ entry, path: 'repo/a.ts', type: 'changed' }],
      openFiles: [{ isDirty: false, path: 'repo/a.ts' }],
      rootPath,
    })

    expect(plan).toEqual({
      openFileOperations: [{ path: 'repo/a.ts', type: 'refresh-open-file' }],
      shouldInvalidateGitState: true,
      treeOperations: [{ entries: [entry], type: 'patch-changed-tree-entries' }],
    })
  })

  it('plans discard and conflict operations for deleted open files', () => {
    const plan = planWorkspaceFilesystemEvents({
      events: [{ path: 'repo/src', type: 'deleted' }],
      openFiles: [
        { isDirty: false, path: 'repo/src/a.ts' },
        { isDirty: true, path: 'repo/src/b.ts' },
      ],
      rootPath,
    })

    expect(plan.openFileOperations).toEqual([
      { path: 'repo/src/a.ts', type: 'discard-open-file' },
      { path: 'repo/src/b.ts', type: 'deleted-conflict' },
    ])
  })

  it('plans a refresh instead of discard when a deleted file is recreated', () => {
    const plan = planWorkspaceFilesystemEvents({
      events: [
        { path: 'repo/a.ts', type: 'deleted' },
        { path: 'repo/a.ts', type: 'created' },
      ],
      openFiles: [{ isDirty: false, path: 'repo/a.ts' }],
      rootPath,
    })

    expect(plan.openFileOperations).toEqual([{ path: 'repo/a.ts', type: 'refresh-open-file' }])
  })

  it('plans rename and conflict operations for renamed open files', () => {
    const plan = planWorkspaceFilesystemEvents({
      events: [{ oldPath: 'repo/old', path: 'repo/new', type: 'renamed' }],
      openFiles: [
        { isDirty: false, path: 'repo/old/a.ts' },
        { isDirty: true, path: 'repo/old/b.ts' },
      ],
      rootPath,
    })

    expect(plan.openFileOperations).toEqual([
      { from: 'repo/old/a.ts', to: 'repo/new/a.ts', type: 'rename-open-file' },
      {
        localPath: 'repo/old/b.ts',
        remotePath: 'repo/new/b.ts',
        type: 'renamed-conflict',
      },
    ])
  })
})

describe('planWorkspaceReady', () => {
  it('refreshes only clean file-backed open files', () => {
    const plan = planWorkspaceReady({
      openFiles: [
        { isDirty: false, path: 'repo/a.ts' },
        { isDirty: true, path: 'repo/b.ts' },
      ],
      rootPath: 'repo',
    })

    expect(plan).toEqual({
      openFileOperations: [{ path: 'repo/a.ts', type: 'refresh-open-file' }],
      shouldInvalidateGitState: true,
      treeOperations: [{ path: 'repo', type: 'refresh-ready-root-tree' }],
    })
  })
})

describe('planFetchedOpenFileRefresh', () => {
  it('replaces matching text without dirty-overwrite notification', () => {
    const operation = planFetchedOpenFileRefresh({
      cachedText: 'same',
      isDirty: true,
      path: 'repo/a.ts',
      remoteText: 'same',
    })

    expect(operation).toEqual({
      notifyDirtyOverwrite: false,
      path: 'repo/a.ts',
      type: 'replace-open-file',
    })
  })

  it('plans a conflict for dirty documents with different remote text', () => {
    const operation = planFetchedOpenFileRefresh({
      cachedText: 'local',
      isDirty: true,
      path: 'repo/a.ts',
      remoteText: 'remote',
    })

    expect(operation).toEqual({
      path: 'repo/a.ts',
      type: 'changed-conflict',
    })
  })

  it('replaces clean documents with dirty-overwrite notification enabled', () => {
    const operation = planFetchedOpenFileRefresh({
      cachedText: 'local',
      isDirty: false,
      path: 'repo/a.ts',
      remoteText: 'remote',
    })

    expect(operation).toEqual({
      notifyDirtyOverwrite: true,
      path: 'repo/a.ts',
      type: 'replace-open-file',
    })
  })
})

describe('affectedDirectoryPaths', () => {
  it('does not refresh tree directories for temporary save files', () => {
    const paths = affectedDirectoryPaths(
      [
        { type: 'created', path: 'repo/.a.ts.ulid.tmp' },
        { type: 'deleted', path: 'repo/.a.ts.ulid.tmp' },
      ],
      'repo',
    )

    expect(Array.from(paths)).toEqual([])
  })

  it('refreshes tree directories for real created files', () => {
    const paths = affectedDirectoryPaths([{ type: 'created', path: 'repo/src/new.ts' }], 'repo')

    expect(Array.from(paths)).toEqual(['repo/src'])
  })
})

function queryClientWithState(
  rootPath: string,
  state: {
    data?: unknown
    dataUpdatedAt: number
    fetchStatus: string
    isInvalidated?: boolean
  },
) {
  return {
    getQueryState: (queryKey: readonly unknown[]) => {
      if (JSON.stringify(queryKey) !== JSON.stringify(fileSystemKeys.tree(rootPath))) {
        return undefined
      }

      return state
    },
  }
}

function treeEntry(path: string) {
  return {
    birthtimeMs: 1,
    mtimeMs: 2,
    name: path.split('/').at(-1) ?? path,
    path,
    size: 3,
    type: 'file' as const,
  }
}
