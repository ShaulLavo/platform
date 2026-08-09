import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { PickedFsEntry } from '@/lib/file-system-types'
import { conflictDiffDocumentId } from '@/features/editor/conflict-diff-document'
import { snapshotDiffDocumentId } from '@/features/git/diff-document'
import type { FileDiff } from '@/features/git/types'
import { searchBufferDocumentId } from '@/features/search/search-buffer-document'
import {
  createDefaultWorkbenchPanels,
  openEditorPathInWorkbenchPanels,
  setWorkbenchBottomTab,
  setWorkbenchSidebarTab,
  type WorkbenchPanels,
} from '@/features/workbench/utils/workbench-panels'
import {
  WORKSPACE_CACHE_STORAGE_KEYS,
  readWorkspaceCache,
  type CachedSearchBufferState,
  type CachedWorkspaceState,
  writeDiffViewModeCache,
  writeEditorHistoryCache,
  writeRecentlyClosedEditorPathsCache,
  writeRootFolderCache,
  writeChatModePanelsCache,
  writeSearchBufferCache,
  writeUiModeCache,
  writeWorkbenchLayoutCache,
  writeWorkbenchPanelsCache,
} from '@/lib/workspace-cache'
import { createDefaultChatModePanels } from '@/features/chat-mode/utils/panels'
import { createDefaultWorkbenchLayout } from '@/features/workbench/utils/workbench-layout'
import { DEFAULT_WORKSPACE_UI_MODE } from '@/lib/ui-mode'

type WorkspaceCacheFixtureState = Pick<
  CachedWorkspaceState,
  'diffViewMode' | 'editorHistory' | 'recentlyClosedEditorPaths' | 'rootFolder' | 'workbenchPanels'
> & {
  searchBuffer: CachedSearchBufferState | null
}

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

    writeCacheFixtureEntries(
      workspaceCacheState({
        diffViewMode: 'stacked',
        editorHistory: [diffPath, '/repo/src/readme.md'],
        recentlyClosedEditorPaths: ['/repo/src/closed.ts'],
        rootFolder,
        searchBuffer: null,
        workbenchPanels: workbenchPanelsForPaths(['/repo/src/readme.md', diffPath], diffPath),
      }),
    )

    const cachedPanels = cacheEntry<WorkbenchPanels>(WORKSPACE_CACHE_STORAGE_KEYS.workbenchPanels)
    const cached = readWorkspaceCache()

    expect(new Set(STORE.keys())).toEqual(new Set(Object.values(WORKSPACE_CACHE_STORAGE_KEYS)))
    expect(cachedPanels).not.toHaveProperty('editorPaneLayout')
    expect(cachedPanels).not.toHaveProperty('openFilePaths')
    expect(cachedPanels.editorTabs.map((tab) => tab.path)).toEqual([
      '/repo/src/readme.md',
      diffPath,
    ])
    expect(cached).toMatchObject({
      diffViewMode: 'stacked',
      editorHistory: [diffPath, '/repo/src/readme.md'],
      openFilePaths: ['/repo/src/readme.md', diffPath],
      recentlyClosedEditorPaths: ['/repo/src/closed.ts'],
      rootFolder,
      searchBuffer: null,
      selectedFilePath: diffPath,
    })
  })

  it('filters git diff tabs when their backing file is outside the workspace', () => {
    const rootFolder = pickedDirectory('/repo')
    const diffPath = snapshotDiffDocumentId(snapshotDiff('/other/src/app.ts'))

    writeCacheFixtureEntries(
      workspaceCacheState({
        diffViewMode: 'split',
        editorHistory: [diffPath],
        recentlyClosedEditorPaths: ['/other/src/closed.ts'],
        rootFolder,
        searchBuffer: null,
        workbenchPanels: workbenchPanelsForPaths([diffPath], diffPath),
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
    expect(cached.workbenchPanels.editorTabs).toEqual([])
  })

  it('does not persist transient conflict diff tabs', () => {
    const rootFolder = pickedDirectory('/repo')
    const conflictPath = conflictDiffDocumentId('conflict-1')

    writeCacheFixtureEntries(
      workspaceCacheState({
        diffViewMode: 'split',
        editorHistory: [conflictPath, '/repo/src/readme.md'],
        recentlyClosedEditorPaths: [conflictPath],
        rootFolder,
        searchBuffer: null,
        workbenchPanels: workbenchPanelsForPaths(
          ['/repo/src/readme.md', conflictPath],
          conflictPath,
        ),
      }),
    )

    expect(readWorkspaceCache()).toMatchObject({
      editorHistory: ['/repo/src/readme.md'],
      openFilePaths: ['/repo/src/readme.md'],
      recentlyClosedEditorPaths: [],
      selectedFilePath: '/repo/src/readme.md',
    })
  })

  it('persists search buffer editor tabs for the active workspace', () => {
    const rootFolder = pickedDirectory('/repo')
    const searchPath = searchBufferDocumentId('/repo')

    writeCacheFixtureEntries(
      workspaceCacheState({
        diffViewMode: 'split',
        editorHistory: [searchPath],
        recentlyClosedEditorPaths: [searchPath],
        rootFolder,
        searchBuffer: null,
        workbenchPanels: workbenchPanelsForPaths(['/repo/src/readme.md', searchPath], searchPath),
      }),
    )

    expect(readWorkspaceCache()).toMatchObject({
      editorHistory: [searchPath],
      openFilePaths: ['/repo/src/readme.md', searchPath],
      recentlyClosedEditorPaths: [searchPath],
      selectedFilePath: searchPath,
    })
  })

  it('filters search buffer editor tabs for a different workspace', () => {
    const rootFolder = pickedDirectory('/repo')
    const searchPath = searchBufferDocumentId('/other')

    writeCacheFixtureEntries(
      workspaceCacheState({
        diffViewMode: 'split',
        editorHistory: [searchPath],
        recentlyClosedEditorPaths: [searchPath],
        rootFolder,
        searchBuffer: null,
        workbenchPanels: workbenchPanelsForPaths(['/repo/src/readme.md', searchPath], searchPath),
      }),
    )

    expect(readWorkspaceCache()).toMatchObject({
      editorHistory: [],
      openFilePaths: ['/repo/src/readme.md'],
      recentlyClosedEditorPaths: [],
      selectedFilePath: '/repo/src/readme.md',
    })
  })

  it('persists fixed panel tabs', () => {
    const rootFolder = pickedDirectory('/repo')
    let panels = workbenchPanelsForPaths(['/repo/src/a.ts', '/repo/src/b.ts'], '/repo/src/b.ts')
    panels = setWorkbenchSidebarTab(panels, 'git')
    panels = setWorkbenchBottomTab(panels, 'problems')

    writeCacheFixtureEntries(
      workspaceCacheState({
        diffViewMode: 'split',
        editorHistory: [],
        recentlyClosedEditorPaths: [],
        rootFolder,
        searchBuffer: null,
        workbenchPanels: panels,
      }),
    )

    expect(readWorkspaceCache()).toMatchObject({
      openFilePaths: ['/repo/src/a.ts', '/repo/src/b.ts'],
      selectedFilePath: '/repo/src/b.ts',
      workbenchPanels: {
        activeBottomTab: 'problems',
        activeSidebarTab: 'git',
      },
    })
  })

  it('persists cached search buffer metadata for the active workspace', () => {
    const rootFolder = pickedDirectory('/repo')
    const buffer = cachedSearchBuffer('/repo')

    writeCacheFixtureEntries(
      workspaceCacheState({
        diffViewMode: 'split',
        editorHistory: [],
        recentlyClosedEditorPaths: [],
        rootFolder,
        searchBuffer: buffer,
        workbenchPanels: createDefaultWorkbenchPanels(),
      }),
    )

    expect(readWorkspaceCache().searchBuffer).toEqual(buffer)
  })

  it('drops cached search buffer state for a different workspace', () => {
    writeCacheFixtureEntries(
      workspaceCacheState({
        diffViewMode: 'split',
        editorHistory: [],
        recentlyClosedEditorPaths: [],
        rootFolder: pickedDirectory('/repo'),
        searchBuffer: emptySearchBuffer('/other'),
        workbenchPanels: createDefaultWorkbenchPanels(),
      }),
    )

    expect(readWorkspaceCache()).toMatchObject({
      searchBuffer: null,
    })
  })

  it('drops only the invalid cache entry while restoring valid workspace state', () => {
    const rootFolder = pickedDirectory('/repo')

    writeCacheFixtureEntries(
      workspaceCacheState({
        diffViewMode: 'stacked',
        editorHistory: ['/repo/src/readme.md'],
        recentlyClosedEditorPaths: [],
        rootFolder,
        searchBuffer: null,
        workbenchPanels: workbenchPanelsForPaths(['/repo/src/readme.md'], '/repo/src/readme.md'),
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

    writeCacheFixtureEntries(
      workspaceCacheState({
        diffViewMode: 'stacked',
        editorHistory: ['/repo/src/readme.md'],
        recentlyClosedEditorPaths: [],
        rootFolder,
        searchBuffer: emptySearchBuffer('/repo'),
        workbenchPanels: workbenchPanelsForPaths(['/repo/src/readme.md'], '/repo/src/readme.md'),
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

function cachedSearchBuffer(rootPath: string): CachedSearchBufferState {
  return {
    ...emptySearchBuffer(rootPath),
    caseSensitive: true,
    collapsedPaths: ['/repo/src/app.ts'],
    excludeGlobText: '*.test.ts',
    includeGlobText: 'src/**/*.ts',
    matchMode: 'regex',
    matches: [
      {
        column: 1,
        kind: 'content',
        line: 1,
        path: '/repo/src/app.ts',
        preview: 'needle',
        source: 'disk',
        type: 'file',
      },
    ],
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
      matchMode: 'regex',
      path: rootPath,
      query: 'needle',
    },
    totalCount: 1,
  }
}

function emptySearchBuffer(rootPath: string): CachedSearchBufferState {
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

function workbenchPanelsForPaths(paths: readonly string[], activePath: string | null) {
  let panels = createDefaultWorkbenchPanels()
  for (const path of paths) panels = openEditorPathInWorkbenchPanels(panels, path)
  if (!activePath) return panels

  return openEditorPathInWorkbenchPanels(panels, activePath)
}

function writeCacheFixtureEntries({
  diffViewMode,
  editorHistory,
  recentlyClosedEditorPaths,
  rootFolder,
  searchBuffer,
  workbenchPanels,
}: WorkspaceCacheFixtureState) {
  writeDiffViewModeCache(diffViewMode)
  writeEditorHistoryCache(rootFolder, editorHistory)
  writeRecentlyClosedEditorPathsCache(rootFolder, recentlyClosedEditorPaths)
  writeRootFolderCache(rootFolder)
  writeWorkbenchPanelsCache(rootFolder, workbenchPanels)
  writeSearchBufferCache(rootFolder, searchBuffer)
  // Workspace-independent entries: written so key-coverage assertions stay meaningful.
  writeChatModePanelsCache(createDefaultChatModePanels())
  writeUiModeCache(DEFAULT_WORKSPACE_UI_MODE)
  writeWorkbenchLayoutCache(createDefaultWorkbenchLayout())
}

function workspaceCacheState(input: WorkspaceCacheFixtureState): WorkspaceCacheFixtureState {
  return input
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
      if (options.failingSetKeys?.has(key)) throw new DOMException('localStorage quota exceeded')

      STORE.set(key, value)
    },
  }
}
