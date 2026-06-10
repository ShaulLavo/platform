import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { PickedFsEntry } from '@/lib/file-system-types'
import { conflictDiffDocumentId } from '@/features/editor/conflict-diff-document'
import {
  editorWorkspaceLayoutForPaths,
  splitEditorWorkspaceLayoutForPaths,
} from '../../../test/factories/editor-workspace-layout'
import { snapshotDiffDocumentId } from '@/features/git/diff-document'
import { searchBufferDocumentId } from '@/features/search/search-buffer-document'
import type { FileDiff } from '@/features/git/types'
import { createGitChangesSurface } from '@workspace/tiling/utils/layout-builders'
import { visibleSurfaceIdsInOrder } from '@workspace/tiling/utils/layout-normalize'
import { moveSurface, openSurface } from '@workspace/tiling/utils/layout-operations'
import {
  WORKSPACE_CACHE_STORAGE_KEYS,
  readWorkspaceCache,
  writeWorkspaceCache,
  type WorkspaceCacheState,
} from '@/lib/workspace-cache'

const STORE = new Map<string, string>()

describe('workspace cache', () => {
  beforeEach(() => {
    STORE.clear()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: fakeLocalStorage(),
    })
  })

  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage
  })

  it('persists git diff tabs when their backing file is in the workspace', () => {
    const rootFolder = pickedDirectory('/repo')
    const diffPath = snapshotDiffDocumentId(snapshotDiff('/repo/src/app.ts'))

    writeWorkspaceCache(
      workspaceCacheState({
        diffViewMode: 'stacked',
        editorHistory: [diffPath, '/repo/src/readme.md'],
        openFilePaths: ['/repo/src/readme.md', diffPath],
        recentlyClosedEditorPaths: ['/repo/src/closed.ts'],
        rootFolder,
        searchBuffer: null,
        selectedFilePath: diffPath,
      }),
    )

    const cachedWorkspaceLayout = cacheEntry<Record<string, unknown>>(
      WORKSPACE_CACHE_STORAGE_KEYS.workspaceLayout,
    )
    const cached = readWorkspaceCache()

    expect(new Set(STORE.keys())).toEqual(new Set(Object.values(WORKSPACE_CACHE_STORAGE_KEYS)))
    expect(cachedWorkspaceLayout).not.toHaveProperty('editorPaneLayout')
    expect(cachedWorkspaceLayout).not.toHaveProperty('openFilePaths')
    expect(cachedWorkspaceLayout).not.toHaveProperty('selectedFilePath')
    expect(cachedWorkspaceLayout).toHaveProperty('version')
    expect(cached).toMatchObject({
      diffViewMode: 'stacked',
      editorHistory: [diffPath, '/repo/src/readme.md'],
      openFilePaths: ['/repo/src/readme.md', diffPath],
      recentlyClosedEditorPaths: ['/repo/src/closed.ts'],
      rootFolder,
      searchBuffer: null,
      selectedFilePath: diffPath,
    })
    expect(cached.openFilePaths).toEqual(['/repo/src/readme.md', diffPath])
    expect(cached.selectedFilePath).toBe(diffPath)
  })

  it('filters git diff tabs when their backing file is outside the workspace', () => {
    const rootFolder = pickedDirectory('/repo')
    const diffPath = snapshotDiffDocumentId(snapshotDiff('/other/src/app.ts'))

    writeWorkspaceCache(
      workspaceCacheState({
        diffViewMode: 'split',
        editorHistory: [diffPath],
        openFilePaths: [diffPath],
        recentlyClosedEditorPaths: ['/other/src/closed.ts'],
        rootFolder,
        searchBuffer: null,
        selectedFilePath: diffPath,
      }),
    )

    const cached = readWorkspaceCache()

    expect(cached).toMatchObject({
      diffViewMode: 'split',
      editorHistory: [],
      openFilePaths: [],
      recentlyClosedEditorPaths: [],
      rootFolder,
      searchBuffer: null,
      selectedFilePath: null,
    })
    expect(cached.openFilePaths).toEqual([])
    expect(cached.selectedFilePath).toBe(null)
  })

  it('does not persist transient conflict diff tabs', () => {
    const rootFolder = pickedDirectory('/repo')
    const conflictPath = conflictDiffDocumentId('conflict-1')

    writeWorkspaceCache(
      workspaceCacheState({
        diffViewMode: 'split',
        editorHistory: [conflictPath, '/repo/src/readme.md'],
        openFilePaths: ['/repo/src/readme.md', conflictPath],
        recentlyClosedEditorPaths: [conflictPath],
        rootFolder,
        searchBuffer: null,
        selectedFilePath: conflictPath,
      }),
    )

    const cached = readWorkspaceCache()

    expect(cached).toMatchObject({
      diffViewMode: 'split',
      editorHistory: ['/repo/src/readme.md'],
      openFilePaths: ['/repo/src/readme.md'],
      recentlyClosedEditorPaths: [],
      rootFolder,
      searchBuffer: null,
      selectedFilePath: '/repo/src/readme.md',
    })
    expect(cached.openFilePaths).toEqual(['/repo/src/readme.md'])
    expect(cached.selectedFilePath).toBe('/repo/src/readme.md')
  })

  it('persists pane split sizes in the workspace cache', () => {
    const rootFolder = pickedDirectory('/repo')
    const workspaceLayout = splitEditorWorkspaceLayoutForPaths({
      activePath: '/repo/src/b.ts',
      leftPaths: ['/repo/src/a.ts'],
      rightPaths: ['/repo/src/b.ts'],
      sizes: [0.3, 0.7],
    })

    writeWorkspaceCache(
      workspaceCacheState({
        diffViewMode: 'split',
        editorHistory: [],
        openFilePaths: ['/repo/src/a.ts', '/repo/src/b.ts'],
        recentlyClosedEditorPaths: [],
        rootFolder,
        searchBuffer: null,
        selectedFilePath: '/repo/src/b.ts',
        workspaceLayout,
      }),
    )

    const cached = readWorkspaceCache()

    expect(Object.values(cached.workspaceLayout.nodesById)).toContainEqual(
      expect.objectContaining({
        axis: 'horizontal',
        kind: 'split',
        sizes: [0.3, 0.7],
      }),
    )
    expect(cached).toMatchObject({
      openFilePaths: ['/repo/src/a.ts', '/repo/src/b.ts'],
      selectedFilePath: '/repo/src/b.ts',
    })
  })

  it('persists singleton tool surface layout', () => {
    const rootFolder = pickedDirectory('/repo')
    const gitChanges = createGitChangesSurface()
    const workspaceLayout = moveSurface(
      openSurface(
        editorWorkspaceLayoutForPaths(['/repo/src/app.ts'], '/repo/src/app.ts'),
        gitChanges,
      ),
      gitChanges.id,
      {
        edge: 'right',
        kind: 'root-edge',
      },
    )

    writeWorkspaceCache(
      workspaceCacheState({
        diffViewMode: 'split',
        editorHistory: [],
        openFilePaths: ['/repo/src/app.ts'],
        recentlyClosedEditorPaths: [],
        rootFolder,
        searchBuffer: null,
        selectedFilePath: '/repo/src/app.ts',
        workspaceLayout,
      }),
    )

    const cached = readWorkspaceCache()

    expect(visibleSurfaceIdsInOrder(cached.workspaceLayout)).toContain(gitChanges.id)
    expect(cached.workspaceLayout.rail.backgroundSurfaceIds).not.toContain(gitChanges.id)
    expect(cached.selectedFilePath).toBe('/repo/src/app.ts')
  })

  it('drops legacy search buffer editor tabs', () => {
    const rootFolder = pickedDirectory('/repo')
    const searchPath = searchBufferDocumentId('/repo')

    writeWorkspaceCache(
      workspaceCacheState({
        diffViewMode: 'split',
        editorHistory: [searchPath],
        openFilePaths: ['/repo/src/readme.md', searchPath],
        recentlyClosedEditorPaths: [searchPath],
        rootFolder,
        searchBuffer: null,
        selectedFilePath: searchPath,
      }),
    )

    expect(readWorkspaceCache()).toMatchObject({
      editorHistory: [],
      openFilePaths: ['/repo/src/readme.md'],
      recentlyClosedEditorPaths: [],
      selectedFilePath: '/repo/src/readme.md',
    })
  })

  it('persists cached search buffer metadata for the active workspace', () => {
    const rootFolder = pickedDirectory('/repo')
    const searchBuffer = {
      activeResultId: null,
      caseSensitive: true,
      collapsedPaths: ['/repo/src/app.ts'],
      excludeGlobText: '*.test.ts',
      filtersVisible: true,
      includeGlobText: 'src/**/*.ts',
      matchMode: 'regex' as const,
      matches: [
        {
          column: 1,
          kind: 'content' as const,
          line: 1,
          path: '/repo/src/app.ts',
          preview: 'needle',
          source: 'disk' as const,
          type: 'file' as const,
        },
      ],
      query: 'needle',
      queryHistory: ['needle'],
      replaceHistory: ['pin'],
      replaceText: 'pin',
      replaceVisible: true,
      resultsQuery: 'needle',
      resultsSearchQuery: {
        caseSensitive: true,
        excludeGlobs: ['*.test.ts'],
        includeContent: true,
        includeGlobs: ['src/**/*.ts'],
        limit: 200,
        matchMode: 'regex' as const,
        path: '/repo',
        query: 'needle',
      },
      rootPath: '/repo',
      totalCount: 1,
      truncated: false,
      wholeWord: false,
    }

    writeWorkspaceCache(
      workspaceCacheState({
        diffViewMode: 'split',
        editorHistory: [],
        openFilePaths: [],
        recentlyClosedEditorPaths: [],
        rootFolder,
        searchBuffer,
        selectedFilePath: null,
      }),
    )

    expect(readWorkspaceCache().searchBuffer).toEqual(searchBuffer)
  })

  it('drops cached search buffer state for a different workspace', () => {
    writeWorkspaceCache(
      workspaceCacheState({
        diffViewMode: 'split',
        editorHistory: [],
        openFilePaths: [],
        recentlyClosedEditorPaths: [],
        rootFolder: pickedDirectory('/repo'),
        searchBuffer: emptySearchBuffer('/other'),
        selectedFilePath: null,
      }),
    )

    expect(readWorkspaceCache()).toMatchObject({
      searchBuffer: null,
    })
  })

  it('drops only the invalid cache entry while restoring valid workspace state', () => {
    const rootFolder = pickedDirectory('/repo')

    writeWorkspaceCache(
      workspaceCacheState({
        diffViewMode: 'stacked',
        editorHistory: ['/repo/src/readme.md'],
        openFilePaths: ['/repo/src/readme.md'],
        recentlyClosedEditorPaths: [],
        rootFolder,
        searchBuffer: null,
        selectedFilePath: '/repo/src/readme.md',
      }),
    )
    STORE.set(WORKSPACE_CACHE_STORAGE_KEYS.searchBuffer, JSON.stringify({ rootPath: '/repo' }))

    const cached = readWorkspaceCache()

    expect(STORE.has(WORKSPACE_CACHE_STORAGE_KEYS.searchBuffer)).toBe(false)
    expect(cached).toMatchObject({
      diffViewMode: 'stacked',
      editorHistory: ['/repo/src/readme.md'],
      openFilePaths: ['/repo/src/readme.md'],
      rootFolder,
      searchBuffer: null,
      selectedFilePath: '/repo/src/readme.md',
    })
  })

  it('keeps small cache entries when the search buffer entry fails to write', () => {
    const rootFolder = pickedDirectory('/repo')
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: fakeLocalStorage({
        failingSetKeys: new Set([WORKSPACE_CACHE_STORAGE_KEYS.searchBuffer]),
      }),
    })

    writeWorkspaceCache(
      workspaceCacheState({
        diffViewMode: 'stacked',
        editorHistory: ['/repo/src/readme.md'],
        openFilePaths: ['/repo/src/readme.md'],
        recentlyClosedEditorPaths: [],
        rootFolder,
        searchBuffer: emptySearchBuffer('/repo'),
        selectedFilePath: '/repo/src/readme.md',
      }),
    )

    const cached = readWorkspaceCache()

    expect(STORE.has(WORKSPACE_CACHE_STORAGE_KEYS.searchBuffer)).toBe(false)
    expect(cached).toMatchObject({
      diffViewMode: 'stacked',
      editorHistory: ['/repo/src/readme.md'],
      openFilePaths: ['/repo/src/readme.md'],
      rootFolder,
      searchBuffer: null,
      selectedFilePath: '/repo/src/readme.md',
    })
  })
})

function snapshotDiff(path: string): FileDiff & { newObjectId: string; oldObjectId: string } {
  return {
    hunks: [],
    newObjectId: 'b'.repeat(40),
    oldObjectId: 'a'.repeat(40),
    patch: '',
    path,
    staged: false,
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

function emptySearchBuffer(rootPath: string): WorkspaceCacheState['searchBuffer'] {
  return {
    activeResultId: null,
    caseSensitive: false,
    collapsedPaths: [],
    excludeGlobText: '',
    filtersVisible: false,
    includeGlobText: '',
    matchMode: 'literal',
    matches: [],
    query: 'needle',
    queryHistory: [],
    replaceHistory: [],
    replaceText: '',
    replaceVisible: false,
    resultsQuery: '',
    resultsSearchQuery: null,
    rootPath,
    totalCount: 0,
    truncated: false,
    wholeWord: false,
  }
}

type WorkspaceCacheTestState = Omit<WorkspaceCacheState, 'workspaceLayout'> & {
  readonly workspaceLayout?: WorkspaceCacheState['workspaceLayout']
}

function workspaceCacheState(input: WorkspaceCacheTestState): WorkspaceCacheState {
  return {
    diffViewMode: input.diffViewMode,
    editorHistory: input.editorHistory,
    openFilePaths: input.openFilePaths,
    recentlyClosedEditorPaths: input.recentlyClosedEditorPaths,
    rootFolder: input.rootFolder,
    searchBuffer: input.searchBuffer,
    selectedFilePath: input.selectedFilePath,
    workspaceLayout:
      input.workspaceLayout ??
      editorWorkspaceLayoutForPaths(input.openFilePaths, input.selectedFilePath),
  }
}

function cacheEntry<T>(key: string): T {
  return JSON.parse(STORE.get(key) ?? 'null') as T
}

type FakeLocalStorageOptions = {
  readonly failingSetKeys?: ReadonlySet<string>
}

function fakeLocalStorage(options: FakeLocalStorageOptions = {}) {
  return {
    getItem: (key: string) => STORE.get(key) ?? null,
    removeItem: (key: string) => {
      STORE.delete(key)
    },
    setItem: (key: string, value: string) => {
      if (options.failingSetKeys?.has(key)) throw new Error('localStorage quota exceeded')

      STORE.set(key, value)
    },
  }
}
