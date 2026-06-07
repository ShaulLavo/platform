import { describe, expect, it } from 'vitest'

import { createEditorCommands } from '@/features/editor/state/editor-commands'
import { createEditorConflictStore } from '@/features/editor/state/editor-conflict-state'
import { createEditorDocumentStore } from '@/features/editor/state/editor-document-state'
import {
  removeDirtyFilePath,
  renameDirtyFilePath,
  updateDirtyFilePaths,
} from '@/features/editor/state/editor-dirty-paths'
import { createEditorLanguageServerStatusSource } from '@/features/editor/state/editor-language-server-status-source'
import { editorWorkspaceLayoutForPaths } from '../../../../test/factories/editor-workspace-layout'
import {
  nextSelectedFilePath,
  openFilePathList,
  renameOpenFilePath,
  reorderOpenFilePath,
} from '@/features/editor/state/editor-tab-paths'
import { createEditorUiStore } from '@/features/editor/state/editor-ui-state'
import { createEditorWorkspaceStore } from '@/features/editor/state/editor-workspace-state'
import {
  CLASSIC_FILE_NAVIGATOR_WINDOW_ID,
  CLASSIC_EDITOR_WINDOW_ID,
  createClassicFirstRunWorkspaceLayout,
} from '@/features/tiling-surface-manager/engine/layout-builders'
import {
  fileEditorSurfaceId,
  fileNavigatorSurfaceId,
  placeholderSurfaceId,
} from '@/features/tiling-surface-manager/engine/layout-ids'
import { activateSurface } from '@/features/tiling-surface-manager/engine/layout-operations'
import {
  editorGroupIdForWorkbenchWindow,
  editorSurfaceTabRecords,
  editorSurfaceSerializedState,
} from '@/features/workbench/utils/editor-surface-layout'
import type { FileResult } from '@/lib/file-system-types'
import type { CachedWorkspaceState } from '@/lib/workspace-cache'
import type {
  LanguageServerDefinitionTarget,
  LanguageServerReferencesResult,
} from '@editor/lsp-plugin'
import { createEditorBufferSession } from '@editor/core'

describe('editor path utilities', () => {
  it('adds, selects, and renames open tab paths', () => {
    const paths = ['src/a.ts', 'src/b.ts']

    expect(openFilePathList(['src/a.ts'], 'src/b.ts')).toEqual(['src/a.ts', 'src/b.ts'])
    expect(openFilePathList(paths, 'src/a.ts')).toBe(paths)
    expect(nextSelectedFilePath(['src/a.ts', 'src/b.ts'], 'src/a.ts')).toBe('src/b.ts')
    expect(renameOpenFilePath(['src/a.ts', 'src/b.ts'], 'src/a.ts', 'src/b.ts')).toEqual([
      'src/b.ts',
    ])
    expect(renameOpenFilePath(paths, 'src/missing.ts', 'src/c.ts')).toBe(paths)
    expect(renameOpenFilePath(paths, 'src/a.ts', 'src/a.ts')).toBe(paths)
  })

  it('reorders open tab paths by target index after removal', () => {
    const paths = ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts']

    expect(reorderOpenFilePath(paths, 'src/c.ts', 1)).toEqual([
      'src/a.ts',
      'src/c.ts',
      'src/b.ts',
      'src/d.ts',
    ])
    expect(reorderOpenFilePath(paths, 'src/b.ts', 2)).toEqual([
      'src/a.ts',
      'src/c.ts',
      'src/b.ts',
      'src/d.ts',
    ])
    expect(reorderOpenFilePath(paths, 'src/d.ts', 0)).toEqual([
      'src/d.ts',
      'src/a.ts',
      'src/b.ts',
      'src/c.ts',
    ])
    expect(reorderOpenFilePath(paths, 'src/a.ts', 3)).toEqual([
      'src/b.ts',
      'src/c.ts',
      'src/d.ts',
      'src/a.ts',
    ])
    expect(reorderOpenFilePath(paths, 'src/b.ts', 1)).toBe(paths)
    expect(reorderOpenFilePath(paths, 'src/missing.ts', 1)).toBe(paths)
    expect(reorderOpenFilePath(['src/a.ts'], 'src/a.ts', 0)).toEqual(['src/a.ts'])
  })

  it('updates dirty path sets without unnecessary replacements', () => {
    const paths = new Set(['src/a.ts'])

    expect(updateDirtyFilePaths(paths, 'src/a.ts', true)).toBe(null)
    expect(removeDirtyFilePath(paths, 'src/b.ts')).toBe(null)
    expect(removeDirtyFilePath(paths, 'src/a.ts')).toEqual(new Set())
    expect(renameDirtyFilePath(paths, 'src/a.ts', 'src/b.ts')).toEqual(new Set(['src/b.ts']))
  })
})

describe('editor live document store', () => {
  it('force replaces dirty live documents and clears dirty state', () => {
    const store = createEditorDocumentStore()
    const original = store.getState().ensureLiveEditorDocument(file('src/file.ts', 'local'))
    createEditorBufferSession(original.buffer).applyText(' edit')
    store.getState().setLiveEditorDocumentDirty('src/file.ts', true)

    const result = store.getState().forceReplaceLiveEditorDocument(file('src/file.ts', 'remote', 2))
    const replaced = store.getState().getLiveEditorDocument('src/file.ts')

    expect(result.wasDirty).toBe(true)
    expect(replaced?.buffer.materializeFullText()).toBe('remote')
    expect(store.getState().dirtyFilePaths.has('src/file.ts')).toBe(false)
  })

  it('stores tab views separately from live document buffers', () => {
    const store = createEditorDocumentStore()
    const tabA = store.getState().ensureEditorView('tab-a', file('src/file.ts', 'abc'))
    const tabB = store.getState().ensureEditorView('tab-b', file('src/file.ts', 'abc'))

    store.getState().setEditorViewScrollPosition('tab-a', {
      left: 4,
      top: 8,
    })

    expect(Object.keys(store.getState().liveDocumentsById)).toEqual(['src/file.ts'])
    expect(Object.keys(store.getState().viewsByTabId).sort()).toEqual(['tab-a', 'tab-b'])
    expect(tabA.buffer).toBe(tabB.buffer)
    expect(tabA.view).not.toBe(tabB.view)
    expect(store.getState().getEditorViewDocument('tab-a')?.scrollPosition).toEqual({
      left: 4,
      top: 8,
    })
    expect(store.getState().getEditorViewDocument('tab-b')?.scrollPosition).toBeUndefined()
  })

  it('shares text and undo across duplicate views without replay sync code', () => {
    const store = createEditorDocumentStore()
    const tabA = store.getState().ensureEditorView('tab-a', file('src/file.ts', 'abc'))
    const tabB = store.getState().ensureEditorView('tab-b', file('src/file.ts', 'abc'))
    const sessionA = createEditorBufferSession(tabA.buffer, tabA.view)
    const sessionB = createEditorBufferSession(tabB.buffer, tabB.view)

    sessionA.applyText('!')
    store.getState().recordLiveEditorDocumentTextChange('src/file.ts')

    expect(
      store.getState().getLiveEditorDocument('src/file.ts')?.buffer.materializeFullText(),
    ).toBe('abc!')
    expect(sessionB.materializeFullText()).toBe('abc!')
    expect(sessionA.canUndo()).toBe(true)
    expect(sessionB.canUndo()).toBe(true)
    expect(store.getState().dirtyFilePaths.has('src/file.ts')).toBe(true)
  })

  it('removes closed views while retaining dirty live documents', () => {
    const store = createEditorDocumentStore()
    const tab = store.getState().ensureEditorView('tab-a', file('src/file.ts', 'abc'))
    createEditorBufferSession(tab.buffer, tab.view).applyText('!')
    store.getState().recordLiveEditorDocumentTextChange('src/file.ts')

    expect(store.getState().removeEditorView('tab-a')).toBe(true)
    expect(store.getState().evictCleanUnviewedLiveEditorDocument('src/file.ts')).toBe(false)

    expect(store.getState().viewsByTabId['tab-a']).toBeUndefined()
    expect(store.getState().liveDocumentsById['src/file.ts']).toBeDefined()
  })

  it('evicts clean unviewed live documents', () => {
    const store = createEditorDocumentStore()
    store.getState().ensureEditorView('tab-a', file('src/file.ts', 'abc'))

    expect(store.getState().removeEditorView('tab-a')).toBe(true)
    expect(store.getState().evictCleanUnviewedLiveEditorDocument('src/file.ts')).toBe(true)

    expect(store.getState().viewsByTabId['tab-a']).toBeUndefined()
    expect(store.getState().liveDocumentsById['src/file.ts']).toBeUndefined()
  })

  it('tracks content revisions by live document path', () => {
    const store = createEditorDocumentStore()
    store.getState().ensureLiveEditorDocument(file('src/a.ts', 'a'))
    store.getState().ensureLiveEditorDocument(file('src/b.ts', 'b'))
    const aRevision = store.getState().documentContentRevisions['src/a.ts']
    const bRevision = store.getState().documentContentRevisions['src/b.ts']

    store.getState().recordLiveEditorDocumentTextChange('src/a.ts')

    expect(store.getState().documentContentRevisions['src/a.ts']).not.toBe(aRevision)
    expect(store.getState().documentContentRevisions['src/b.ts']).toBe(bRevision)
  })

  it('moves and clears live document content revisions', () => {
    const store = createEditorDocumentStore()
    store.getState().ensureLiveEditorDocument(file('src/old.ts', 'a'))
    const revision = store.getState().documentContentRevisions['src/old.ts']

    store.getState().renameLiveEditorDocumentPath('src/old.ts', 'src/new.ts')
    expect(store.getState().documentContentRevisions['src/new.ts']).toBe(revision)

    store.getState().deleteLiveEditorDocument('src/new.ts')

    expect(store.getState().documentContentRevisions['src/old.ts']).toBeUndefined()
    expect(store.getState().documentContentRevisions['src/new.ts']).toBeUndefined()
    expect(revision).toEqual(expect.any(String))
  })

  it('keeps matching-content refreshes on the same live buffer', () => {
    const store = createEditorDocumentStore()
    const original = store.getState().ensureLiveEditorDocument(file('src/file.ts', 'local edit'))
    store.getState().setLiveEditorDocumentDirty('src/file.ts', true)

    const result = store
      .getState()
      .forceReplaceLiveEditorDocument(file('src/file.ts', 'local edit', 2))
    const refreshed = store.getState().getLiveEditorDocument('src/file.ts')

    expect(result.wasDirty).toBe(true)
    expect(refreshed?.buffer).toBe(original.buffer)
    expect(refreshed?.sync).toEqual(
      expect.objectContaining({
        kind: 'file',
        mtimeMs: 2,
      }),
    )
    expect(refreshed?.buffer.isDirty()).toBe(false)
    expect(store.getState().dirtyFilePaths.has('src/file.ts')).toBe(false)
  })
})

describe('editor language server status source', () => {
  it('notifies subscribers only when status snapshots change', () => {
    const source = createEditorLanguageServerStatusSource()
    let notifications = 0
    const unsubscribe = source.subscribe(() => {
      notifications += 1
    })

    expect(source.getSnapshot()).toEqual({ diagnostics: null, status: 'idle' })

    source.setSnapshot({ diagnostics: null, status: 'loading' })
    source.setStatus('loading')
    source.setDiagnostics(null)

    expect(notifications).toBe(1)
    expect(source.getSnapshot()).toEqual({ diagnostics: null, status: 'loading' })

    source.reset()
    unsubscribe()
    source.setStatus('loading')

    expect(notifications).toBe(2)
  })
})

describe('editor conflict store', () => {
  it('adds, updates, and removes filesystem conflicts', () => {
    const store = createEditorConflictStore()

    store.getState().addConflict({
      eventType: 'changed',
      id: 'conflict-1',
      localPath: 'src/file.ts',
      localText: 'local',
      remoteMtimeMs: 2,
      remotePath: 'src/file.ts',
      remoteSize: 6,
      remoteText: 'remote',
      remoteVersion: 'remote-version-1',
    })
    store.getState().updateConflict('conflict-1', {
      diffDocumentId: 'conflict-diff:conflict-1',
      toastId: 'toast-1',
    })

    expect(store.getState().conflicts['conflict-1']).toMatchObject({
      diffDocumentId: 'conflict-diff:conflict-1',
      toastId: 'toast-1',
    })

    store.getState().removeConflict('conflict-1')

    expect(store.getState().conflicts['conflict-1']).toBeUndefined()
  })
})

describe('editor commands', () => {
  it('selects files, opens tabs, preserves status, and records fallbacks', () => {
    const { commands, documentStore, uiStore, workspaceStore } = setupStores(
      workspaceState(['src/a.ts'], 'src/a.ts'),
    )
    documentStore.getState().ensureLiveEditorDocument(file('src/a.ts', 'a'))
    const statusBarSource = {} as never
    uiStore.setState({ statusBarSource })

    commands.selectFile('src/b.ts')

    expect(workspaceStore.getState().openFilePaths).toEqual(['src/a.ts', 'src/b.ts'])
    expect(workspaceStore.getState().selectedFilePath).toBe('src/b.ts')
    expect(workspaceStore.getState().editorHistory).toEqual(['src/b.ts', 'src/a.ts'])
    expect(documentStore.getState().fallbackDocumentPath).toBe('src/a.ts')
    expect(uiStore.getState().statusBarSource).toBe(statusBarSource)
  })

  it('replaces the first-run empty editor tab and keeps opening tree selections', () => {
    const { commands, workspaceStore } = setupStores(classicWorkspaceState())
    const placeholderId = placeholderSurfaceId('empty-editor')

    commands.selectFile('src/a.ts')

    expect(workspaceStore.getState().workspaceLayout.surfacesById[placeholderId]).toBeUndefined()
    expect(
      workspaceStore.getState().workspaceLayout.windowsById[CLASSIC_EDITOR_WINDOW_ID],
    ).toMatchObject({
      activeSurfaceId: fileEditorSurfaceId('src/a.ts'),
      surfaceIds: [fileEditorSurfaceId('src/a.ts')],
    })

    workspaceStore
      .getState()
      .setWorkspaceLayout(
        activateSurface(
          workspaceStore.getState().workspaceLayout,
          fileNavigatorSurfaceId(),
          CLASSIC_FILE_NAVIGATOR_WINDOW_ID,
        ),
      )
    commands.selectFile('src/b.ts')

    expect(workspaceStore.getState().openFilePaths).toEqual(['src/a.ts', 'src/b.ts'])
    expect(workspaceStore.getState().selectedFilePath).toBe('src/b.ts')
    expect(
      editorSurfaceSerializedState(
        workspaceStore.getState().workspaceLayout.surfacesById[fileEditorSurfaceId('src/b.ts')]!,
      )?.editorGroupId,
    ).toBe(editorGroupIdForWorkbenchWindow(CLASSIC_EDITOR_WINDOW_ID))
    expect(
      workspaceStore.getState().workspaceLayout.windowsById[CLASSIC_EDITOR_WINDOW_ID],
    ).toMatchObject({
      activeSurfaceId: fileEditorSurfaceId('src/b.ts'),
      surfaceIds: [fileEditorSurfaceId('src/a.ts'), fileEditorSurfaceId('src/b.ts')],
    })
  })

  it('opens definitions through workspace, document, and ui stores', () => {
    const { commands, documentStore, uiStore, workspaceStore } = setupStores(
      workspaceState(['src/a.ts'], 'src/a.ts'),
    )
    documentStore.getState().ensureLiveEditorDocument(file('src/a.ts', 'a'))

    const result = commands.openDefinition(definitionTarget('src/target.ts'))

    expect(result).toBe(true)
    expect(uiStore.getState().definitionTarget?.path).toBe('src/target.ts')
    expect(workspaceStore.getState().openFilePaths).toEqual(['src/a.ts', 'src/target.ts'])
    expect(workspaceStore.getState().selectedFilePath).toBe('src/target.ts')
    expect(workspaceStore.getState().editorHistory).toEqual(['src/target.ts', 'src/a.ts'])
    expect(documentStore.getState().fallbackDocumentPath).toBe('src/a.ts')
  })

  it('discards live documents and closes deleted tabs', () => {
    const { commands, documentStore, workspaceStore } = setupStores(
      workspaceState(['src/a.ts', 'src/b.ts'], 'src/a.ts'),
    )
    documentStore.getState().ensureLiveEditorDocument(file('src/a.ts', 'a'))
    documentStore.getState().setLiveEditorDocumentDirty('src/a.ts', true)

    const result = commands.discardLiveEditorDocument('src/a.ts')

    expect(result.wasDirty).toBe(true)
    expect(workspaceStore.getState().openFilePaths).toEqual(['src/b.ts'])
    expect(workspaceStore.getState().selectedFilePath).toBe('src/b.ts')
    expect(workspaceStore.getState().editorHistory).toEqual([])
    expect(documentStore.getState().getLiveEditorDocument('src/a.ts')).toBe(null)
    expect(workspaceStore.getState().recentlyClosedEditorPaths).toEqual([])
  })

  it('discards dirty tabs from user close and tracks them as recently closed', () => {
    const { commands, documentStore, workspaceStore } = setupStores(
      workspaceState(['src/a.ts', 'src/b.ts'], 'src/a.ts'),
    )
    documentStore.getState().ensureLiveEditorDocument(file('src/a.ts', 'a'))
    documentStore.getState().setLiveEditorDocumentDirty('src/a.ts', true)

    const result = commands.discardAndCloseTab(tabIdForPath(workspaceStore, 'src/a.ts'))

    expect(result.wasDirty).toBe(true)
    expect(workspaceStore.getState().openFilePaths).toEqual(['src/b.ts'])
    expect(workspaceStore.getState().selectedFilePath).toBe('src/b.ts')
    expect(workspaceStore.getState().editorHistory).toEqual([])
    expect(workspaceStore.getState().recentlyClosedEditorPaths).toEqual(['src/a.ts'])
    expect(documentStore.getState().getLiveEditorDocument('src/a.ts')).toBe(null)
    expect(documentStore.getState().dirtyFilePaths.has('src/a.ts')).toBe(false)
  })

  it('tracks closed editors and reopens the last closed tab', () => {
    const { commands, workspaceStore } = setupStores(
      workspaceState(['src/a.ts', 'src/b.ts'], 'src/a.ts'),
    )

    commands.closeTab(tabIdForPath(workspaceStore, 'src/a.ts'))

    expect(workspaceStore.getState().openFilePaths).toEqual(['src/b.ts'])
    expect(workspaceStore.getState().recentlyClosedEditorPaths).toEqual(['src/a.ts'])

    const reopened = commands.reopenClosedEditor()

    expect(reopened).toBe(true)
    expect(workspaceStore.getState().openFilePaths).toEqual(['src/b.ts', 'src/a.ts'])
    expect(workspaceStore.getState().selectedFilePath).toBe('src/a.ts')
    expect(workspaceStore.getState().recentlyClosedEditorPaths).toEqual([])
  })

  it('selects the previous editor from editor history', () => {
    const { commands, workspaceStore } = setupStores(
      workspaceState(['src/a.ts', 'src/b.ts'], 'src/b.ts'),
    )
    workspaceStore.setState({
      editorHistory: ['src/b.ts', 'src/a.ts'],
    })

    const selected = commands.selectPreviousEditor()

    expect(selected).toBe(true)
    expect(workspaceStore.getState().selectedFilePath).toBe('src/a.ts')
  })

  it('keeps open path references stable when selecting an existing tab', () => {
    const { commands, workspaceStore } = setupStores(
      workspaceState(['src/a.ts', 'src/b.ts'], 'src/a.ts'),
    )
    const openFilePaths = workspaceStore.getState().openFilePaths

    commands.selectTab(activePaneId(workspaceStore), tabIdForPath(workspaceStore, 'src/b.ts'))

    expect(workspaceStore.getState().selectedFilePath).toBe('src/b.ts')
    expect(workspaceStore.getState().openFilePaths).toBe(openFilePaths)
  })

  it('does not update stores when selecting the active tab', () => {
    const { commands, documentStore, workspaceStore } = setupStores(
      workspaceState(['src/a.ts', 'src/b.ts'], 'src/a.ts'),
    )
    let documentUpdates = 0
    let workspaceUpdates = 0
    const unsubscribeDocument = documentStore.subscribe(() => {
      documentUpdates += 1
    })
    const unsubscribeWorkspace = workspaceStore.subscribe(() => {
      workspaceUpdates += 1
    })

    commands.selectTab(activePaneId(workspaceStore), tabIdForPath(workspaceStore, 'src/a.ts'))
    unsubscribeDocument()
    unsubscribeWorkspace()

    expect(documentUpdates).toBe(0)
    expect(workspaceUpdates).toBe(0)
  })

  it('reorders tabs without touching editor selection metadata', () => {
    const { commands, documentStore, workspaceStore } = setupStores(
      workspaceState(['src/a.ts', 'src/b.ts', 'src/c.ts'], 'src/b.ts'),
    )
    documentStore.getState().ensureLiveEditorDocument(file('src/a.ts', 'a'))
    documentStore.getState().setLiveEditorDocumentDirty('src/a.ts', true)
    workspaceStore.setState({
      editorHistory: ['src/b.ts', 'src/a.ts'],
      recentlyClosedEditorPaths: ['src/old.ts'],
    })

    const paneId = activePaneId(workspaceStore)
    const reordered = commands.reorderTab(paneId, tabIdForPath(workspaceStore, 'src/a.ts'), 2)
    const noop = commands.reorderTab(paneId, tabIdForPath(workspaceStore, 'src/b.ts'), 0)
    const missing = commands.reorderTab(paneId, 'missing-tab', 1)

    expect(reordered).toBe(true)
    expect(noop).toBe(false)
    expect(missing).toBe(false)
    expect(workspaceStore.getState().openFilePaths).toEqual(['src/b.ts', 'src/c.ts', 'src/a.ts'])
    expect(workspaceStore.getState().selectedFilePath).toBe('src/b.ts')
    expect(workspaceStore.getState().editorHistory).toEqual(['src/b.ts', 'src/a.ts'])
    expect(workspaceStore.getState().recentlyClosedEditorPaths).toEqual(['src/old.ts'])
    expect(documentStore.getState().dirtyFilePaths.has('src/a.ts')).toBe(true)
  })

  it('renames tabs, live documents, dirty markers, and LSP targets', () => {
    const { commands, documentStore, uiStore, workspaceStore } = setupStores(
      workspaceState(['src/old.ts'], 'src/old.ts'),
    )
    documentStore.getState().ensureLiveEditorDocument(file('src/old.ts', 'a'))
    documentStore.getState().setLiveEditorDocumentDirty('src/old.ts', true)
    uiStore.getState().setDefinitionTarget(definitionTarget('src/old.ts'))
    uiStore.getState().setLanguageServerReferences(referencesResult('src/old.ts'))

    const result = commands.renameLiveEditorDocument('src/old.ts', 'src/new.ts')

    expect(result.wasDirty).toBe(true)
    expect(workspaceStore.getState().openFilePaths).toEqual(['src/new.ts'])
    expect(workspaceStore.getState().selectedFilePath).toBe('src/new.ts')
    expect(workspaceStore.getState().editorHistory).toEqual(['src/new.ts'])
    expect(documentStore.getState().dirtyFilePaths.has('src/old.ts')).toBe(false)
    expect(documentStore.getState().dirtyFilePaths.has('src/new.ts')).toBe(true)
    expect(documentStore.getState().getLiveEditorDocument('src/new.ts')?.path).toBe('src/new.ts')
    expect(uiStore.getState().definitionTarget?.path).toBe('src/new.ts')
    expect(uiStore.getState().languageServerReferences?.targets[0]?.path).toBe('src/new.ts')
  })

  it('resets workspace, document, and ui state for a picked root folder', () => {
    const { commands, documentStore, uiStore, workspaceStore } = setupStores(
      workspaceState(['src/a.ts'], 'src/a.ts'),
    )
    documentStore.getState().ensureLiveEditorDocument(file('src/a.ts', 'a'))
    uiStore.getState().setDefinitionTarget(definitionTarget('src/a.ts'))
    uiStore.getState().setLanguageServerReferences(referencesResult('src/a.ts'))

    commands.pickRootFolder(rootFolder('/repo'))

    expect(workspaceStore.getState().rootFolder?.path).toBe('/repo')
    expect(workspaceStore.getState().openFilePaths).toEqual([])
    expect(workspaceStore.getState().selectedFilePath).toBe(null)
    expect(workspaceStore.getState().editorHistory).toEqual([])
    expect(workspaceStore.getState().recentlyClosedEditorPaths).toEqual([])
    expect(workspaceStore.getState().workspaceLayout.rootNodeId).not.toBeNull()
    expect(documentStore.getState().dirtyFilePaths).toEqual(new Set())
    expect(documentStore.getState().fallbackDocumentPath).toBe(null)
    expect(uiStore.getState().definitionTarget).toBe(null)
    expect(uiStore.getState().languageServerReferences).toBe(null)
  })
})

function setupStores(initialState: CachedWorkspaceState) {
  const documentStore = createEditorDocumentStore()
  const uiStore = createEditorUiStore()
  const workspaceStore = createEditorWorkspaceStore(initialState)
  const commands = createEditorCommands({
    documentStore,
    uiStore,
    workspaceStore,
  })

  return { commands, documentStore, uiStore, workspaceStore }
}

function workspaceState(
  openFilePaths: string[],
  selectedFilePath: string | null,
): CachedWorkspaceState {
  return {
    diffViewMode: 'split',
    editorHistory: selectedFilePath ? [selectedFilePath] : [],
    openFilePaths,
    recentlyClosedEditorPaths: [],
    rootFolder: rootFolder(''),
    selectedFilePath,
    workspaceLayout: editorWorkspaceLayoutForPaths(openFilePaths, selectedFilePath),
  }
}

function classicWorkspaceState(): CachedWorkspaceState {
  const workspaceLayout = createClassicFirstRunWorkspaceLayout()

  return {
    diffViewMode: 'split',
    editorHistory: [],
    openFilePaths: [],
    recentlyClosedEditorPaths: [],
    rootFolder: rootFolder(''),
    selectedFilePath: null,
    workspaceLayout,
  }
}

function activePaneId(workspaceStore: ReturnType<typeof createEditorWorkspaceStore>) {
  const windowId = workspaceStore.getState().workspaceLayout.activeWindowId
  if (!windowId) throw new Error('Missing active test window')

  return editorGroupIdForWorkbenchWindow(windowId)
}

function tabIdForPath(workspaceStore: ReturnType<typeof createEditorWorkspaceStore>, path: string) {
  const match = editorSurfaceTabRecords(workspaceStore.getState().workspaceLayout).find(
    (candidate) => candidate.path === path,
  )
  if (match) return match.id

  throw new Error(`Missing test tab for ${path}`)
}

function rootFolder(path: string) {
  return {
    birthtimeMs: 1,
    mtimeMs: 1,
    name: 'repo',
    path,
    size: 1,
    type: 'directory' as const,
    version: 'test:1:1',
  }
}

function file(path: string, content: string, mtimeMs = 1): FileResult {
  return {
    content,
    mtimeMs,
    path,
    size: content.length,
    version: testFileVersion(mtimeMs, content.length),
  }
}

function testFileVersion(mtimeMs: number, size: number) {
  return `test:${mtimeMs}:${size}`
}

function definitionTarget(path: string): LanguageServerDefinitionTarget {
  return {
    path,
    range: {
      end: { character: 1, line: 1 },
      start: { character: 0, line: 1 },
    },
    uri: `file://${path}`,
  }
}

function referencesResult(path: string): LanguageServerReferencesResult {
  return {
    targets: [definitionTarget(path)],
    uri: `file://${path}`,
  }
}
