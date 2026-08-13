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
} from '@/features/workbench/utils/workbench-panels'
import {
  WORKSPACE_CACHE_STORAGE_KEYS,
  WORKSPACE_SLICE_LIMIT,
  emptyWorkspaceSlice,
  readWorkspaceCache,
  searchBufferStorageKey,
  workspaceSliceStorageKey,
  type CachedSearchBufferState,
  type CachedWorkspaceSlice,
  writeRootFolderCache,
  writeChatModePanelsCache,
  writeSearchBufferCache,
  writeSessionSelectionCache,
  writeUiModeCache,
  writeWorkbenchLayoutCache,
  writeWorkspaceIndexCache,
  writeWorkspaceSliceCache,
} from '@/lib/workspace-cache'
import { createDefaultChatModePanels } from '@/features/chat-mode/utils/panels'
import { createDefaultWorkbenchLayout } from '@/features/workbench/utils/workbench-layout'
import { DEFAULT_WORKSPACE_UI_MODE } from '@/lib/ui-mode'

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
    const diffPath = snapshotDiffDocumentId(snapshotDiff('/repo/src/app.ts'))

    writeRootFolderCache(pickedDirectory('/repo'))
    writeWorkspaceSliceCache('/repo', {
      editorHistory: [diffPath, '/repo/src/readme.md'],
      recentlyClosedEditorPaths: ['/repo/src/closed.ts'],
      scrollPositionByPath: {},
      workbenchPanels: workbenchPanelsForPaths(['/repo/src/readme.md', diffPath], diffPath),
    })
    writeWorkspaceIndexCache(['/repo'])

    expect(readWorkspaceCache().workspaces['/repo']).toMatchObject({
      editorHistory: [diffPath, '/repo/src/readme.md'],
      recentlyClosedEditorPaths: ['/repo/src/closed.ts'],
    })
    expect(cachedSlice('/repo').workbenchPanels.editorTabs.map((tab) => tab.path)).toEqual([
      '/repo/src/readme.md',
      diffPath,
    ])
  })

  it('filters paths that belong to another workspace out of the slice that owns them', () => {
    const diffPath = snapshotDiffDocumentId(snapshotDiff('/other/src/app.ts'))

    writeWorkspaceSliceCache('/repo', {
      editorHistory: [diffPath, conflictDiffDocumentId('conflict-1')],
      recentlyClosedEditorPaths: ['/other/src/closed.ts'],
      scrollPositionByPath: {},
      workbenchPanels: workbenchPanelsForPaths([diffPath, '/repo/src/a.ts'], diffPath),
    })

    expect(cachedSlice('/repo')).toMatchObject({
      editorHistory: [],
      recentlyClosedEditorPaths: [],
    })
    expect(cachedSlice('/repo').workbenchPanels.editorTabs.map((tab) => tab.path)).toEqual([
      '/repo/src/a.ts',
    ])
  })

  it('persists scroll positions for workspace paths only', () => {
    writeWorkspaceSliceCache('/repo', {
      ...emptyWorkspaceSlice(),
      scrollPositionByPath: {
        '/other/src/elsewhere.ts': { left: 0, top: 40 },
        '/repo/src/app.ts': { left: 8, top: 320 },
      },
    })

    expect(cachedSlice('/repo').scrollPositionByPath).toEqual({
      '/repo/src/app.ts': { left: 8, top: 320 },
    })
  })

  it('keeps a search editor tab only for the workspace it searches', () => {
    writeWorkspaceSliceCache('/repo', {
      ...emptyWorkspaceSlice(),
      editorHistory: [searchBufferDocumentId('/repo'), searchBufferDocumentId('/other')],
    })

    expect(cachedSlice('/repo').editorHistory).toEqual([searchBufferDocumentId('/repo')])
  })

  it('persists fixed panel tabs', () => {
    let panels = workbenchPanelsForPaths(['/repo/src/a.ts', '/repo/src/b.ts'], '/repo/src/b.ts')
    panels = setWorkbenchSidebarTab(panels, 'git')
    panels = setWorkbenchBottomTab(panels, 'problems')

    writeWorkspaceSliceCache('/repo', { ...emptyWorkspaceSlice(), workbenchPanels: panels })

    expect(cachedSlice('/repo').workbenchPanels).toMatchObject({
      activeBottomTab: 'problems',
      activeSidebarTab: 'git',
    })
  })

  it('restores every remembered project, not just the open one', () => {
    writeRootFolderCache(pickedDirectory('/repo'))
    writeWorkspaceSliceCache('/repo', {
      ...emptyWorkspaceSlice(),
      workbenchPanels: workbenchPanelsForPaths(['/repo/src/a.ts'], '/repo/src/a.ts'),
    })
    writeWorkspaceSliceCache('/other', {
      ...emptyWorkspaceSlice(),
      workbenchPanels: workbenchPanelsForPaths(['/other/src/b.ts'], '/other/src/b.ts'),
    })
    writeWorkspaceIndexCache(['/repo', '/other'])

    const cached = readWorkspaceCache()

    expect(cached.workspaceOrder).toEqual(['/repo', '/other'])
    expect(cached.workspaces['/other']?.workbenchPanels.editorTabs.map((tab) => tab.path)).toEqual([
      '/other/src/b.ts',
    ])
  })

  it('leads with the open root even when the index has not caught up', () => {
    writeRootFolderCache(pickedDirectory('/repo'))
    writeWorkspaceIndexCache(['/other'])

    expect(readWorkspaceCache().workspaceOrder).toEqual(['/repo', '/other'])
  })

  it('deletes the storage of projects that fall off the index', () => {
    writeWorkspaceSliceCache('/other', {
      ...emptyWorkspaceSlice(),
      editorHistory: ['/other/src/b.ts'],
    })
    writeSearchBufferCache('/other', emptySearchBuffer('/other'))
    writeWorkspaceIndexCache(['/repo', '/other'])

    writeWorkspaceIndexCache(['/repo'])

    expect(STORE.has(workspaceSliceStorageKey('/other'))).toBe(false)
    expect(STORE.has(searchBufferStorageKey('/other'))).toBe(false)
  })

  it('remembers at most the slice limit', () => {
    const rootPaths = Array.from(
      { length: WORKSPACE_SLICE_LIMIT + 3 },
      (_, index) => `/repo-${index}`,
    )
    for (const rootPath of rootPaths) {
      writeWorkspaceSliceCache(rootPath, emptyWorkspaceSlice())
    }

    writeWorkspaceIndexCache(rootPaths)

    expect(readWorkspaceCache().workspaceOrder).toEqual(rootPaths.slice(0, WORKSPACE_SLICE_LIMIT))
    expect(STORE.has(workspaceSliceStorageKey(rootPaths[WORKSPACE_SLICE_LIMIT]!))).toBe(false)
  })

  it('persists cached search buffer metadata under the workspace it searched', () => {
    const buffer = cachedSearchBuffer('/repo')

    writeRootFolderCache(pickedDirectory('/repo'))
    writeSearchBufferCache('/repo', buffer)
    writeWorkspaceIndexCache(['/repo'])

    expect(readWorkspaceCache().searchBuffers['/repo']).toEqual(buffer)
  })

  it('refuses to file a search buffer under a workspace it does not belong to', () => {
    writeRootFolderCache(pickedDirectory('/repo'))
    writeSearchBufferCache('/repo', emptySearchBuffer('/other'))
    writeWorkspaceIndexCache(['/repo'])

    expect(readWorkspaceCache().searchBuffers).toEqual({})
    expect(STORE.has(searchBufferStorageKey('/repo'))).toBe(false)
  })

  it('drops only the invalid cache entry while restoring valid workspace state', () => {
    writeRootFolderCache(pickedDirectory('/repo'))
    writeWorkspaceSliceCache('/repo', {
      ...emptyWorkspaceSlice(),
      editorHistory: ['/repo/src/readme.md'],
    })
    writeWorkspaceIndexCache(['/repo'])
    STORE.set(searchBufferStorageKey('/repo'), JSON.stringify({ rootPath: '/repo' }))

    const cached = readWorkspaceCache()

    expect(STORE.has(searchBufferStorageKey('/repo'))).toBe(false)
    expect(cached.searchBuffers).toEqual({})
    expect(cached.workspaces['/repo']?.editorHistory).toEqual(['/repo/src/readme.md'])
  })

  it('keeps a project’s tabs when its search results are too big to write', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: fakeLocalStorage({ failingSetKeys: new Set([searchBufferStorageKey('/repo')]) }),
    })

    writeRootFolderCache(pickedDirectory('/repo'))
    writeWorkspaceSliceCache('/repo', {
      ...emptyWorkspaceSlice(),
      editorHistory: ['/repo/src/readme.md'],
    })
    writeSearchBufferCache('/repo', emptySearchBuffer('/repo'))
    writeWorkspaceIndexCache(['/repo'])

    const cached = readWorkspaceCache()

    expect(cached.searchBuffers).toEqual({})
    expect(cached.workspaces['/repo']?.editorHistory).toEqual(['/repo/src/readme.md'])
  })

  it('keeps workspace-independent entries in their own keys', () => {
    writeChatModePanelsCache(createDefaultChatModePanels())
    writeUiModeCache(DEFAULT_WORKSPACE_UI_MODE)
    writeWorkbenchLayoutCache(createDefaultWorkbenchLayout())
    writeRootFolderCache(pickedDirectory('/repo'))
    writeSessionSelectionCache({ kind: 'auto' })
    writeWorkspaceIndexCache(['/repo'])

    expect(new Set(STORE.keys())).toEqual(new Set(Object.values(WORKSPACE_CACHE_STORAGE_KEYS)))
  })
})

function cachedSlice(rootPath: string): CachedWorkspaceSlice {
  return JSON.parse(STORE.get(workspaceSliceStorageKey(rootPath)) ?? 'null') as CachedWorkspaceSlice
}

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
