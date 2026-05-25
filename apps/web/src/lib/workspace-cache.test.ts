import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import type { PickedFsEntry } from '@/lib/file-system-types'
import { conflictDiffDocumentId } from '@/features/editor/conflict-diff-document'
import {
  activeEditorPanePath,
  editorPaneTabs,
  type EditorPaneLayout,
} from '@/features/editor/state/editor-pane-state'
import { diffDocumentId } from '@/features/git/diff-document'
import { searchBufferDocumentId } from '@/features/search/search-buffer-document'
import type { FileDiff } from '@/features/git/types'
import { readWorkspaceCache, writeWorkspaceCache } from '@/lib/workspace-cache'

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
    const diffPath = diffDocumentId(snapshotDiff('/repo/src/app.ts'))

    writeWorkspaceCache({
      diffViewMode: 'stacked',
      editorHistory: [diffPath, '/repo/src/readme.md'],
      gitPanelOpen: false,
      openFilePaths: ['/repo/src/readme.md', diffPath],
      recentlyClosedEditorPaths: ['/repo/src/closed.ts'],
      rootFolder,
      searchBuffer: null,
      selectedFilePath: diffPath,
      sidebarVisible: false,
      workspacePanelTab: 'git',
    })

    const cached = readWorkspaceCache()

    expect(cached).toMatchObject({
      diffViewMode: 'stacked',
      editorHistory: [diffPath, '/repo/src/readme.md'],
      gitPanelOpen: false,
      openFilePaths: ['/repo/src/readme.md', diffPath],
      recentlyClosedEditorPaths: ['/repo/src/closed.ts'],
      rootFolder,
      searchBuffer: null,
      selectedFilePath: diffPath,
      sidebarVisible: false,
      workspacePanelTab: 'git',
    })
    expect(editorPanePaths(cached.editorPaneLayout)).toEqual(['/repo/src/readme.md', diffPath])
    expect(activeEditorPanePath(cached.editorPaneLayout)).toBe(diffPath)
  })

  it('filters git diff tabs when their backing file is outside the workspace', () => {
    const rootFolder = pickedDirectory('/repo')
    const diffPath = diffDocumentId(snapshotDiff('/other/src/app.ts'))

    writeWorkspaceCache({
      diffViewMode: 'split',
      editorHistory: [diffPath],
      gitPanelOpen: true,
      openFilePaths: [diffPath],
      recentlyClosedEditorPaths: ['/other/src/closed.ts'],
      rootFolder,
      searchBuffer: null,
      selectedFilePath: diffPath,
      sidebarVisible: true,
      workspacePanelTab: 'git',
    })

    const cached = readWorkspaceCache()

    expect(cached).toMatchObject({
      diffViewMode: 'split',
      editorHistory: [],
      gitPanelOpen: true,
      openFilePaths: [],
      recentlyClosedEditorPaths: [],
      rootFolder,
      searchBuffer: null,
      selectedFilePath: null,
      sidebarVisible: true,
      workspacePanelTab: 'git',
    })
    expect(editorPanePaths(cached.editorPaneLayout)).toEqual([])
    expect(activeEditorPanePath(cached.editorPaneLayout)).toBe(null)
  })

  it('does not persist transient conflict diff tabs', () => {
    const rootFolder = pickedDirectory('/repo')
    const conflictPath = conflictDiffDocumentId('conflict-1')

    writeWorkspaceCache({
      diffViewMode: 'split',
      editorHistory: [conflictPath, '/repo/src/readme.md'],
      gitPanelOpen: true,
      openFilePaths: ['/repo/src/readme.md', conflictPath],
      recentlyClosedEditorPaths: [conflictPath],
      rootFolder,
      searchBuffer: null,
      selectedFilePath: conflictPath,
      sidebarVisible: true,
      workspacePanelTab: 'files',
    })

    const cached = readWorkspaceCache()

    expect(cached).toMatchObject({
      diffViewMode: 'split',
      editorHistory: ['/repo/src/readme.md'],
      gitPanelOpen: true,
      openFilePaths: ['/repo/src/readme.md'],
      recentlyClosedEditorPaths: [],
      rootFolder,
      searchBuffer: null,
      selectedFilePath: '/repo/src/readme.md',
      sidebarVisible: true,
      workspacePanelTab: 'files',
    })
    expect(editorPanePaths(cached.editorPaneLayout)).toEqual(['/repo/src/readme.md'])
    expect(activeEditorPanePath(cached.editorPaneLayout)).toBe('/repo/src/readme.md')
  })

  it('migrates v6 tabs into one persisted pane', () => {
    const rootFolder = pickedDirectory('/repo')

    STORE.set(
      'platform.workspace-state.v1',
      JSON.stringify({
        diffViewMode: 'split',
        editorHistory: ['/repo/src/readme.md'],
        gitPanelOpen: true,
        openFilePaths: ['/repo/src/readme.md', '/repo/src/app.ts'],
        recentlyClosedEditorPaths: [],
        rootFolder,
        searchBuffer: null,
        selectedFilePath: '/repo/src/app.ts',
        sidebarVisible: true,
        version: 6,
        workspacePanelTab: 'files',
      }),
    )

    const cached = readWorkspaceCache()

    expect(cached.openFilePaths).toEqual(['/repo/src/readme.md', '/repo/src/app.ts'])
    expect(editorPanePaths(cached.editorPaneLayout)).toEqual([
      '/repo/src/readme.md',
      '/repo/src/app.ts',
    ])
    expect(activeEditorPanePath(cached.editorPaneLayout)).toBe('/repo/src/app.ts')
  })

  it('migrates v6 logs panel tab state', () => {
    const rootFolder = pickedDirectory('/repo')

    STORE.set(
      'platform.workspace-state.v1',
      JSON.stringify({
        diffViewMode: 'split',
        editorHistory: [],
        gitPanelOpen: true,
        openFilePaths: [],
        recentlyClosedEditorPaths: [],
        rootFolder,
        searchBuffer: null,
        selectedFilePath: null,
        sidebarVisible: true,
        version: 6,
        workspacePanelTab: 'logs',
      }),
    )

    expect(readWorkspaceCache().workspacePanelTab).toBe('logs')
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

    writeWorkspaceCache({
      diffViewMode: 'split',
      editorHistory: [],
      editorPaneLayout,
      gitPanelOpen: true,
      openFilePaths: ['/repo/src/a.ts', '/repo/src/b.ts'],
      recentlyClosedEditorPaths: [],
      rootFolder,
      searchBuffer: null,
      selectedFilePath: '/repo/src/b.ts',
      sidebarVisible: true,
      workspacePanelTab: 'files',
    })

    const cached = readWorkspaceCache()

    expect(cached.editorPaneLayout.root).toMatchObject({
      direction: 'horizontal',
      kind: 'split',
      sizes: [30, 70],
    })
    expect(activeEditorPanePath(cached.editorPaneLayout)).toBe('/repo/src/b.ts')
  })

  it('persists the search panel tab', () => {
    const rootFolder = pickedDirectory('/repo')

    writeWorkspaceCache({
      diffViewMode: 'split',
      editorHistory: [],
      gitPanelOpen: true,
      openFilePaths: [],
      recentlyClosedEditorPaths: [],
      rootFolder,
      searchBuffer: null,
      selectedFilePath: null,
      sidebarVisible: true,
      workspacePanelTab: 'search',
    })

    expect(readWorkspaceCache().workspacePanelTab).toBe('search')
  })

  it('persists the logs panel tab', () => {
    const rootFolder = pickedDirectory('/repo')

    writeWorkspaceCache({
      diffViewMode: 'split',
      editorHistory: [],
      gitPanelOpen: true,
      openFilePaths: [],
      recentlyClosedEditorPaths: [],
      rootFolder,
      searchBuffer: null,
      selectedFilePath: null,
      sidebarVisible: true,
      workspacePanelTab: 'logs',
    })

    expect(readWorkspaceCache().workspacePanelTab).toBe('logs')
  })

  it('persists search buffer tabs', () => {
    const rootFolder = pickedDirectory('/repo')
    const searchPath = searchBufferDocumentId('/repo')

    writeWorkspaceCache({
      diffViewMode: 'split',
      editorHistory: [searchPath],
      gitPanelOpen: true,
      openFilePaths: ['/repo/src/readme.md', searchPath],
      recentlyClosedEditorPaths: [searchPath],
      rootFolder,
      searchBuffer: null,
      selectedFilePath: searchPath,
      sidebarVisible: true,
      workspacePanelTab: 'search',
    })

    expect(readWorkspaceCache()).toMatchObject({
      editorHistory: [searchPath],
      openFilePaths: ['/repo/src/readme.md', searchPath],
      recentlyClosedEditorPaths: [searchPath],
      selectedFilePath: searchPath,
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

    writeWorkspaceCache({
      diffViewMode: 'split',
      editorHistory: [],
      gitPanelOpen: true,
      openFilePaths: [],
      recentlyClosedEditorPaths: [],
      rootFolder,
      searchBuffer,
      selectedFilePath: null,
      sidebarVisible: true,
      workspacePanelTab: 'search',
    })

    expect(readWorkspaceCache().searchBuffer).toEqual(searchBuffer)
  })

  it('drops cache payloads with legacy cached search matches', () => {
    const rootFolder = pickedDirectory('/repo')
    const searchBuffer = {
      activeResultId: 'search-result-match-a',
      caseSensitive: false,
      collapsedPaths: [],
      excludeGlobText: '',
      filtersVisible: false,
      includeGlobText: '',
      matchMode: 'literal' as const,
      matches: [
        {
          kind: 'content' as const,
          path: '/repo/src/app.ts',
          source: 'disk' as const,
          type: 'file' as const,
        },
      ],
      query: 'needle',
      queryHistory: ['needle'],
      replaceHistory: [],
      replaceText: '',
      replaceVisible: false,
      resultsQuery: 'needle',
      resultsSearchQuery: {
        includeContent: true,
        limit: 200,
        path: '/repo',
        query: 'needle',
      },
      rootPath: '/repo',
      totalCount: 1,
      truncated: false,
      wholeWord: false,
    }

    STORE.set(
      'platform.workspace-state.v1',
      JSON.stringify({
        diffViewMode: 'split',
        editorHistory: [],
        gitPanelOpen: true,
        openFilePaths: [],
        recentlyClosedEditorPaths: [],
        rootFolder,
        searchBuffer,
        selectedFilePath: null,
        sidebarVisible: true,
        version: 6,
        workspacePanelTab: 'search',
      }),
    )

    expect(readWorkspaceCache()).toMatchObject({
      rootFolder: null,
      searchBuffer: null,
    })
    expect(STORE.has('platform.workspace-state.v1')).toBe(false)
  })

  it('drops cached search buffer state for a different workspace', () => {
    writeWorkspaceCache({
      diffViewMode: 'split',
      editorHistory: [],
      gitPanelOpen: true,
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
      sidebarVisible: true,
      workspacePanelTab: 'search',
    })

    expect(readWorkspaceCache()).toMatchObject({
      searchBuffer: null,
    })
  })
})

function snapshotDiff(path: string): FileDiff {
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
  }
}

function editorPanePaths(layout: EditorPaneLayout) {
  return editorPaneTabs(layout.root).map((tab) => tab.path)
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
