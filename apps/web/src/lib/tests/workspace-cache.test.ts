import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { PickedFsEntry } from '@/lib/file-system-types'
import { conflictDiffDocumentId } from '@/features/editor/conflict-diff-document'
import {
  createEditorPaneLayoutForPaths,
  type EditorPaneLayout,
} from '@/features/editor/state/editor-pane-state'
import { snapshotDiffDocumentId } from '@/features/git/diff-document'
import { searchBufferDocumentId } from '@/features/search/search-buffer-document'
import type { FileDiff } from '@/features/git/types'
import { createGitChangesSurface } from '@/features/tiling-surface-manager/engine/layout-builders'
import { visibleSurfaceIdsInOrder } from '@/features/tiling-surface-manager/engine/layout-normalize'
import {
  moveSurface,
  openSurface,
} from '@/features/tiling-surface-manager/engine/layout-operations'
import { workspaceLayoutForEditorPaneLayout } from '@/features/workbench/utils/editor-surface-layout'
import {
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

    const rawPayload = JSON.parse(Array.from(STORE.values())[0] ?? '{}') as Record<string, unknown>
    const cached = readWorkspaceCache()

    expect(rawPayload).not.toHaveProperty('editorPaneLayout')
    expect(rawPayload).not.toHaveProperty('openFilePaths')
    expect(rawPayload).not.toHaveProperty('selectedFilePath')
    expect(rawPayload).toHaveProperty('workspaceLayout')
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
    const editorPaneLayout: EditorPaneLayout = {
      activePaneId: 'pane-b',
      root: {
        children: [
          {
            activeTabId: 'tab-a',
            id: 'pane-a',
            kind: 'leaf',
            tabs: [{ id: 'tab-a', path: '/repo/src/a.ts' }],
          },
          {
            activeTabId: 'tab-b',
            id: 'pane-b',
            kind: 'leaf',
            tabs: [{ id: 'tab-b', path: '/repo/src/b.ts' }],
          },
        ],
        direction: 'horizontal',
        id: 'split-a',
        kind: 'split',
        sizes: [30, 70],
      },
    }

    writeWorkspaceCache(
      workspaceCacheState({
        diffViewMode: 'split',
        editorHistory: [],
        editorPaneLayout,
        openFilePaths: ['/repo/src/a.ts', '/repo/src/b.ts'],
        recentlyClosedEditorPaths: [],
        rootFolder,
        searchBuffer: null,
        selectedFilePath: '/repo/src/b.ts',
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
    const editorPaneLayout = createEditorPaneLayoutForPaths(
      ['/repo/src/app.ts'],
      '/repo/src/app.ts',
    )
    const gitChanges = createGitChangesSurface()
    const workspaceLayout = moveSurface(
      openSurface(workspaceLayoutForEditorPaneLayout(editorPaneLayout), gitChanges),
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
        editorPaneLayout,
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
        searchBuffer: {
          activeResultId: null,
          caseSensitive: false,
          collapsedPaths: [],
          excludeGlobText: '',
          filtersVisible: false,
          includeGlobText: '',
          matchMode: 'literal',
          query: 'needle',
          queryHistory: [],
          replaceHistory: [],
          replaceText: '',
          replaceVisible: false,
          resultsQuery: '',
          resultsSearchQuery: null,
          rootPath: '/other',
          totalCount: 0,
          truncated: false,
          wholeWord: false,
        },
        selectedFilePath: null,
      }),
    )

    expect(readWorkspaceCache()).toMatchObject({
      searchBuffer: null,
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

type WorkspaceCacheTestState = Omit<WorkspaceCacheState, 'workspaceLayout'> & {
  readonly editorPaneLayout?: EditorPaneLayout
  readonly workspaceLayout?: WorkspaceCacheState['workspaceLayout']
}

function workspaceCacheState(input: WorkspaceCacheTestState): WorkspaceCacheState {
  const editorPaneLayout =
    input.editorPaneLayout ??
    createEditorPaneLayoutForPaths(input.openFilePaths, input.selectedFilePath)

  return {
    diffViewMode: input.diffViewMode,
    editorHistory: input.editorHistory,
    openFilePaths: input.openFilePaths,
    recentlyClosedEditorPaths: input.recentlyClosedEditorPaths,
    rootFolder: input.rootFolder,
    searchBuffer: input.searchBuffer,
    selectedFilePath: input.selectedFilePath,
    workspaceLayout: input.workspaceLayout ?? workspaceLayoutForEditorPaneLayout(editorPaneLayout),
  }
}

function fakeLocalStorage() {
  return {
    getItem: (key: string) => STORE.get(key) ?? null,
    removeItem: (key: string) => {
      STORE.delete(key)
    },
    setItem: (key: string, value: string) => {
      STORE.set(key, value)
    },
  }
}
