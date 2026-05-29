import { describe, expect, it } from 'bun:test'

import { createEditorCommands } from '@/features/editor/state/editor-commands'
import { createEditorConflictStore } from '@/features/editor/state/editor-conflict-state'
import { createEditorDocumentStore } from '@/features/editor/state/editor-document-state'
import {
  removeDirtyFilePath,
  renameDirtyFilePath,
  updateDirtyFilePaths,
} from '@/features/editor/state/editor-dirty-paths'
import { createEditorLanguageServerStatusSource } from '@/features/editor/state/editor-language-server-status-source'
import {
  activeEditorPanePath,
  closeEditorPaneTabs,
  createEditorPaneLayoutForPaths,
  editorPaneLeaves,
  editorPanePathCounts,
  findEditorPane,
  moveEditorPaneTabToPane,
  moveEditorPaneTabToSplit,
  normalizeEditorPaneLayout,
  openEditorPathInActivePane,
  selectEditorPaneTab,
  setActiveEditorPane,
  splitEditorPaneTab,
  updateEditorPaneSplitSizes,
} from '@/features/editor/state/editor-pane-state'
import {
  nextSelectedFilePath,
  openFilePathList,
  renameOpenFilePath,
  reorderOpenFilePath,
} from '@/features/editor/state/editor-tab-paths'
import { createEditorUiStore } from '@/features/editor/state/editor-ui-state'
import { createEditorWorkspaceStore } from '@/features/editor/state/editor-workspace-state'
import type { FileResult } from '@/lib/file-system-types'
import type { CachedWorkspaceState } from '@/lib/workspace-cache'
import type {
  LanguageServerDefinitionTarget,
  LanguageServerReferencesResult,
} from '@editor/lsp-plugin'

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

describe('editor pane state', () => {
  it('keeps pane layout identity for repeated no-op pane updates', () => {
    let layout = createEditorPaneLayoutForPaths(['src/a.ts', 'src/b.ts'], 'src/a.ts')
    layout = splitEditorPaneTab(layout, tabIdForPathInLayout(layout, 'src/a.ts'), 'horizontal')

    const activePane = editorPaneLeaves(layout.root).find((pane) =>
      pane.tabs.some((tab) => tab.path === 'src/a.ts'),
    )
    if (!activePane) throw new Error('Missing active pane')

    expect(setActiveEditorPane(layout, activePane.id)).toBe(layout)
    expect(selectEditorPaneTab(layout, activePane.id, activePane.activeTabId ?? '')).toBe(layout)
    expect(updateEditorPaneSplitSizes(layout, layout.root.id, [50, 50])).toBe(layout)
    expect(normalizeEditorPaneLayout(layout)).toBe(layout)
  })

  it('splits tabs into panes, persists sizes, and collapses emptied panes', () => {
    let layout = createEditorPaneLayoutForPaths(['src/a.ts', 'src/b.ts'], 'src/a.ts')
    const aTabId = tabIdForPathInLayout(layout, 'src/a.ts')

    layout = splitEditorPaneTab(layout, aTabId, 'horizontal')

    expect(layout.root).toMatchObject({
      direction: 'horizontal',
      kind: 'split',
      sizes: [50, 50],
    })
    expect(activeEditorPanePath(layout)).toBe('src/a.ts')
    expect(panePathGroups(layout)).toEqual([['src/b.ts'], ['src/a.ts']])

    layout = updateEditorPaneSplitSizes(layout, layout.root.id, [25, 75])

    expect(layout.root).toMatchObject({
      kind: 'split',
      sizes: [25, 75],
    })

    layout = closeEditorPaneTabs(layout, [tabIdForPathInLayout(layout, 'src/b.ts')])

    expect(layout.root.kind).toBe('leaf')
    expect(panePathGroups(layout)).toEqual([['src/a.ts']])
  })

  it('moves tabs between panes and allows duplicate paths across panes', () => {
    let layout = createEditorPaneLayoutForPaths(['src/a.ts', 'src/b.ts'], 'src/a.ts')
    layout = splitEditorPaneTab(layout, tabIdForPathInLayout(layout, 'src/a.ts'), 'horizontal')

    const paneWithB = editorPaneLeaves(layout.root).find((pane) =>
      pane.tabs.some((tab) => tab.path === 'src/b.ts'),
    )
    if (!paneWithB) throw new Error('Missing pane for src/b.ts')

    layout = setActiveEditorPane(layout, paneWithB.id)
    layout = openEditorPathInActivePane(layout, 'src/a.ts')

    expect(editorPanePathCounts(layout).get('src/a.ts')).toBe(2)
    expect(panePathGroups(layout)).toEqual([['src/b.ts', 'src/a.ts'], ['src/a.ts']])

    const sourcePane = editorPaneLeaves(layout.root).at(1)
    if (!sourcePane) throw new Error('Missing source pane')

    layout = moveEditorPaneTabToPane(layout, sourcePane.tabs[0]!.id, paneWithB.id)

    expect(layout.root.kind).toBe('leaf')
    expect(panePathGroups(layout)).toEqual([['src/b.ts', 'src/a.ts', 'src/a.ts']])
  })

  it('moves a tab into another pane at the requested tab-bar index', () => {
    let layout = createEditorPaneLayoutForPaths(['src/a.ts', 'src/b.ts', 'src/c.ts'], 'src/a.ts')
    layout = splitEditorPaneTab(layout, tabIdForPathInLayout(layout, 'src/a.ts'), 'horizontal')

    const targetPane = editorPaneLeaves(layout.root).find((pane) =>
      pane.tabs.some((tab) => tab.path === 'src/b.ts'),
    )
    if (!targetPane) throw new Error('Missing target pane')

    layout = moveEditorPaneTabToPane(
      layout,
      tabIdForPathInLayout(layout, 'src/a.ts'),
      targetPane.id,
      1,
    )

    expect(layout.root.kind).toBe('leaf')
    expect(panePathGroups(layout)).toEqual([['src/b.ts', 'src/a.ts', 'src/c.ts']])
    expect(activeEditorPanePath(layout)).toBe('src/a.ts')
  })

  it('can split the root around an existing horizontal split', () => {
    let layout = createEditorPaneLayoutForPaths(['src/a.ts', 'src/b.ts', 'src/c.ts'], 'src/a.ts')
    layout = splitEditorPaneTab(layout, tabIdForPathInLayout(layout, 'src/a.ts'), 'horizontal')

    const paneWithC = editorPaneLeaves(layout.root).find((pane) =>
      pane.tabs.some((tab) => tab.path === 'src/c.ts'),
    )
    if (!paneWithC) throw new Error('Missing pane for src/c.ts')

    layout = moveEditorPaneTabToSplit(layout, {
      scope: 'root',
      sourceTabId: tabIdForPathInLayout(layout, 'src/b.ts'),
      targetPaneId: paneWithC.id,
      zone: 'top',
    })

    expect(layout.root).toMatchObject({
      direction: 'vertical',
      kind: 'split',
    })
    expect(panePathGroups(layout)).toEqual([['src/b.ts'], ['src/c.ts'], ['src/a.ts']])
    expect(activeEditorPanePath(layout)).toBe('src/b.ts')
  })

  it('limits pane split nesting depth', () => {
    let layout = createEditorPaneLayoutForPaths(['src/a.ts', 'src/b.ts', 'src/c.ts'], 'src/a.ts')
    layout = splitEditorPaneTab(layout, tabIdForPathInLayout(layout, 'src/a.ts'), 'horizontal')

    const paneWithC = editorPaneLeaves(layout.root).find((pane) =>
      pane.tabs.some((tab) => tab.path === 'src/c.ts'),
    )
    if (!paneWithC) throw new Error('Missing pane for src/c.ts')

    layout = moveEditorPaneTabToSplit(layout, {
      scope: 'root',
      sourceTabId: tabIdForPathInLayout(layout, 'src/b.ts'),
      targetPaneId: paneWithC.id,
      zone: 'top',
    })

    const nestedPaneWithC = editorPaneLeaves(layout.root).find((pane) =>
      pane.tabs.some((tab) => tab.path === 'src/c.ts'),
    )
    if (!nestedPaneWithC) throw new Error('Missing nested pane for src/c.ts')

    const blocked = moveEditorPaneTabToSplit(layout, {
      sourceTabId: tabIdForPathInLayout(layout, 'src/a.ts'),
      targetPaneId: nestedPaneWithC.id,
      zone: 'bottom',
    })

    expect(blocked).toBe(layout)
    expect(panePathGroups(blocked)).toEqual([['src/b.ts'], ['src/c.ts'], ['src/a.ts']])
  })

  it('repairs duplicate persisted pane and tab ids during normalization', () => {
    const layout = normalizeEditorPaneLayout({
      activePaneId: 'pane-1',
      root: {
        children: [
          {
            activeTabId: 'tab-1',
            id: 'pane-1',
            kind: 'leaf',
            tabs: [{ id: 'tab-1', path: 'src/a.ts' }],
          },
          {
            activeTabId: 'tab-1',
            id: 'pane-1',
            kind: 'leaf',
            tabs: [{ id: 'tab-1', path: 'src/b.ts' }],
          },
        ],
        direction: 'horizontal',
        id: 'split-1',
        kind: 'split',
        sizes: [50, 50],
      },
    })
    const panes = editorPaneLeaves(layout.root)
    const paneIds = panes.map((pane) => pane.id)
    const tabIds = panes.flatMap((pane) => pane.tabs.map((tab) => tab.id))

    expect(new Set(paneIds).size).toBe(paneIds.length)
    expect(new Set(tabIds).size).toBe(tabIds.length)
    expect(panes.every((pane) => pane.tabs[0]?.id === pane.activeTabId)).toBe(true)
    expect(panePathGroups(layout)).toEqual([['src/a.ts'], ['src/b.ts']])
  })
})

describe('editor document store', () => {
  it('force replaces dirty cached documents and clears dirty state', () => {
    const store = createEditorDocumentStore()
    const original = store.getState().ensureCachedEditorDocument(file('src/file.ts', 'local'))
    original.session.applyText(' edit')
    store.getState().setCachedEditorDocumentDirty('src/file.ts', true)

    const result = store
      .getState()
      .forceReplaceCachedEditorDocument(file('src/file.ts', 'remote', 2))
    const replaced = store.getState().getCachedEditorDocument('src/file.ts')

    expect(result.wasDirty).toBe(true)
    expect(replaced?.session.materializeFullText()).toBe('remote')
    expect(store.getState().dirtyFilePaths.has('src/file.ts')).toBe(false)
  })

  it('tracks scroll position on cached documents', () => {
    const store = createEditorDocumentStore()
    const document = store.getState().ensureCachedEditorDocument(file('src/file.ts', 'local'))

    store.getState().setCachedEditorDocumentScrollPosition('src/file.ts', {
      left: 10,
      top: 20,
    })

    const scrolledDocument = store.getState().getCachedEditorDocument('src/file.ts')
    expect(scrolledDocument?.session).toBe(document.session)
    expect(scrolledDocument?.scrollPosition).toEqual({
      left: 10,
      top: 20,
    })
  })

  it('tracks scroll position on cached tab documents without replacing the document', () => {
    const store = createEditorDocumentStore()
    const document = store
      .getState()
      .ensureCachedEditorTabDocument('tab-a', file('src/file.ts', 'local'))

    store.getState().setCachedEditorTabDocumentScrollPosition('tab-a', {
      left: 12,
      top: 24,
    })

    const scrolledDocument = store.getState().getCachedEditorTabDocument('tab-a')
    expect(scrolledDocument?.session).toBe(document.session)
    expect(scrolledDocument?.scrollPosition).toEqual({
      left: 12,
      top: 24,
    })
  })

  it('skips unchanged scroll position updates', () => {
    const store = createEditorDocumentStore()
    store.getState().ensureCachedEditorDocument(file('src/file.ts', 'local'))
    let updates = 0
    const unsubscribe = store.subscribe((state, previousState) => {
      if (state.scrollPositionByPath !== previousState.scrollPositionByPath) {
        updates += 1
      }
    })

    store.getState().setCachedEditorDocumentScrollPosition('src/file.ts', {
      left: 10,
      top: 20,
    })
    store.getState().setCachedEditorDocumentScrollPosition('src/file.ts', {
      left: 10,
      top: 20,
    })
    unsubscribe()

    expect(updates).toBe(1)
  })

  it('marks cached documents clean after saving without replacing the session', () => {
    const store = createEditorDocumentStore()
    const original = store.getState().ensureCachedEditorDocument(file('src/file.ts', 'local'))
    original.session.applyText('saved')
    store.getState().setCachedEditorDocumentDirty('src/file.ts', true)

    const result = store.getState().markCachedEditorDocumentClean('src/file.ts', 2)
    const saved = store.getState().getCachedEditorDocument('src/file.ts')

    expect(result).toBe(true)
    expect(saved?.session).toBe(original.session)
    expect(saved?.revision).toBe(2)
    expect(saved?.session.isDirty()).toBe(false)
    expect(store.getState().dirtyFilePaths.has('src/file.ts')).toBe(false)
  })

  it('records dirty text changes even after the path is already dirty', () => {
    const store = createEditorDocumentStore()
    store.getState().ensureCachedEditorDocument(file('src/file.ts', 'local'))
    const initialRevision = store.getState().documentContentRevisions['src/file.ts']

    store.getState().recordCachedEditorDocumentTextChange('src/file.ts')
    const firstEditRevision = store.getState().documentContentRevisions['src/file.ts']
    store.getState().recordCachedEditorDocumentTextChange('src/file.ts')

    expect(store.getState().dirtyContentRevision).toBe(2)
    expect(store.getState().dirtyFilePaths.has('src/file.ts')).toBe(true)
    expect(firstEditRevision).not.toBe(initialRevision)
    expect(store.getState().documentContentRevisions['src/file.ts']).not.toBe(firstEditRevision)
  })

  it('shares duplicate tab document text and document-wide history while preserving per-tab scroll', () => {
    const store = createEditorDocumentStore()
    store.getState().ensureCachedEditorTabDocument('tab-a', file('src/file.ts', 'abc'))
    store.getState().ensureCachedEditorTabDocument('tab-b', file('src/file.ts', 'abc'))

    store.getState().setCachedEditorTabDocumentScrollPosition('tab-a', {
      left: 4,
      top: 8,
    })
    const sourceTab = store.getState().getCachedEditorTabDocument('tab-a')
    const siblingTab = store.getState().getCachedEditorTabDocument('tab-b')
    if (!sourceTab || !siblingTab) throw new Error('Missing cached tab documents')

    const change = sourceTab.session.applyText('!')
    store.getState().recordCachedEditorDocumentTextChange('src/file.ts', {
      change,
      sourceTabId: 'tab-a',
    })

    const syncedTabA = store.getState().getCachedEditorTabDocument('tab-a')
    const syncedTabB = store.getState().getCachedEditorTabDocument('tab-b')

    expect(
      store.getState().getCachedEditorDocument('src/file.ts')?.session.materializeFullText(),
    ).toBe('abc!')
    expect(syncedTabA?.session.materializeFullText()).toBe('abc!')
    expect(syncedTabB?.session.materializeFullText()).toBe('abc!')
    expect(syncedTabA?.session.canUndo()).toBe(true)
    expect(syncedTabB?.session.canUndo()).toBe(true)
    expect(syncedTabA?.scrollPosition).toEqual({ left: 4, top: 8 })
    expect(syncedTabB?.scrollPosition).toBeUndefined()
    expect(syncedTabA?.buffer).toBe(sourceTab.buffer)
    expect(syncedTabB?.buffer).toBe(siblingTab.buffer)
    expect(syncedTabA?.session).toBe(sourceTab.session)
    expect(syncedTabB?.session).toBe(siblingTab.session)
    expect(store.getState().dirtyFilePaths.has('src/file.ts')).toBe(true)
  })

  it('keeps the source tab buffer and view session for single-tab local edits', () => {
    const store = createEditorDocumentStore()
    const tab = store.getState().ensureCachedEditorTabDocument('tab-a', file('src/file.ts', 'abc'))
    let tabDocumentUpdates = 0
    const unsubscribe = store.subscribe((state, previousState) => {
      if (state.tabDocuments !== previousState.tabDocuments) {
        tabDocumentUpdates += 1
      }
    })

    const change = tab.session.applyText('!')
    store.getState().recordCachedEditorDocumentTextChange('src/file.ts', {
      change,
      sourceTabId: 'tab-a',
    })
    unsubscribe()

    const updatedTab = store.getState().getCachedEditorTabDocument('tab-a')
    expect(updatedTab?.buffer).toBe(tab.buffer)
    expect(updatedTab?.session).toBe(tab.session)
    expect(updatedTab?.view).toBe(tab.view)
    expect(tabDocumentUpdates).toBe(1)
  })

  it('creates clean tab sessions without materializing canonical text', () => {
    const store = createEditorDocumentStore()
    const canonical = store.getState().ensureCachedEditorDocument(file('src/file.ts', 'abc'))
    canonical.session.materializeFullText = () => {
      throw new Error('clean tab session should use file content')
    }

    const tab = store.getState().ensureCachedEditorTabDocument('tab-a', file('src/file.ts', 'abc'))

    expect(tab.session.getTextSnapshot().readRange(0, tab.session.getSnapshot().length)).toBe('abc')
  })

  it('syncs tab document text from canonical edits without replaying the source', () => {
    const store = createEditorDocumentStore()
    const canonical = store.getState().ensureCachedEditorDocument(file('src/file.ts', 'abc'))
    store.getState().ensureCachedEditorTabDocument('tab-a', file('src/file.ts', 'abc'))

    const change = canonical.session.applyText('!')
    store.getState().recordCachedEditorDocumentTextChange('src/file.ts', {
      edits: change.edits,
      source: 'canonical',
    })

    expect(canonical.session.materializeFullText()).toBe('abc!')
    expect(
      store.getState().getCachedEditorTabDocument('tab-a')?.session.materializeFullText(),
    ).toBe('abc!')
  })

  it('tracks content revisions by cached document path', () => {
    const store = createEditorDocumentStore()
    store.getState().ensureCachedEditorDocument(file('src/a.ts', 'a'))
    store.getState().ensureCachedEditorDocument(file('src/b.ts', 'b'))
    const aRevision = store.getState().documentContentRevisions['src/a.ts']
    const bRevision = store.getState().documentContentRevisions['src/b.ts']

    store.getState().recordCachedEditorDocumentTextChange('src/a.ts')

    expect(store.getState().documentContentRevisions['src/a.ts']).not.toBe(aRevision)
    expect(store.getState().documentContentRevisions['src/b.ts']).toBe(bRevision)
  })

  it('moves and clears cached document content revisions', () => {
    const store = createEditorDocumentStore()
    store.getState().ensureCachedEditorDocument(file('src/old.ts', 'a'))
    const revision = store.getState().documentContentRevisions['src/old.ts']

    store.getState().renameCachedEditorDocumentPath('src/old.ts', 'src/new.ts')
    expect(store.getState().documentContentRevisions['src/new.ts']).toBe(revision)

    store.getState().deleteCachedEditorDocument('src/new.ts')

    expect(store.getState().documentContentRevisions['src/old.ts']).toBeUndefined()
    expect(store.getState().documentContentRevisions['src/new.ts']).toBeUndefined()
    expect(revision).toEqual(expect.any(String))
  })

  it('preserves the session when a forced refresh has matching content', () => {
    const store = createEditorDocumentStore()
    const original = store.getState().ensureCachedEditorDocument(file('src/file.ts', 'local'))
    original.session.applyText(' edit')
    store.getState().setCachedEditorDocumentDirty('src/file.ts', true)

    const result = store
      .getState()
      .forceReplaceCachedEditorDocument(file('src/file.ts', 'local edit', 2))
    const refreshed = store.getState().getCachedEditorDocument('src/file.ts')

    expect(result.wasDirty).toBe(true)
    expect(refreshed?.session).toBe(original.session)
    expect(refreshed?.revision).toBe(2)
    expect(refreshed?.session.isDirty()).toBe(false)
    expect(store.getState().dirtyFilePaths.has('src/file.ts')).toBe(false)
  })

  it('skips forced refresh updates when content and revision already match', () => {
    const store = createEditorDocumentStore()
    const original = store.getState().ensureCachedEditorDocument(file('src/file.ts', 'local', 2))
    let documentUpdates = 0
    const unsubscribe = store.subscribe((state, previousState) => {
      if (state.documents !== previousState.documents) documentUpdates += 1
    })

    const result = store
      .getState()
      .forceReplaceCachedEditorDocument(file('src/file.ts', 'local', 2))
    unsubscribe()

    expect(result.wasDirty).toBe(false)
    expect(documentUpdates).toBe(0)
    expect(store.getState().getCachedEditorDocument('src/file.ts')).toBe(original)
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
    documentStore.getState().ensureCachedEditorDocument(file('src/a.ts', 'a'))
    const statusBarSource = {} as never
    uiStore.setState({ statusBarSource })

    commands.selectFile('src/b.ts')

    expect(workspaceStore.getState().openFilePaths).toEqual(['src/a.ts', 'src/b.ts'])
    expect(workspaceStore.getState().selectedFilePath).toBe('src/b.ts')
    expect(workspaceStore.getState().editorHistory).toEqual(['src/b.ts', 'src/a.ts'])
    expect(documentStore.getState().fallbackDocumentPath).toBe('src/a.ts')
    expect(uiStore.getState().statusBarSource).toBe(statusBarSource)
  })

  it('opens definitions through workspace, document, and ui stores', () => {
    const { commands, documentStore, uiStore, workspaceStore } = setupStores(
      workspaceState(['src/a.ts'], 'src/a.ts'),
    )
    documentStore.getState().ensureCachedEditorDocument(file('src/a.ts', 'a'))

    const result = commands.openDefinition(definitionTarget('src/target.ts'))

    expect(result).toBe(true)
    expect(uiStore.getState().definitionTarget?.path).toBe('src/target.ts')
    expect(workspaceStore.getState().openFilePaths).toEqual(['src/a.ts', 'src/target.ts'])
    expect(workspaceStore.getState().selectedFilePath).toBe('src/target.ts')
    expect(workspaceStore.getState().editorHistory).toEqual(['src/target.ts', 'src/a.ts'])
    expect(documentStore.getState().fallbackDocumentPath).toBe('src/a.ts')
  })

  it('discards cached documents and closes deleted tabs', () => {
    const { commands, documentStore, workspaceStore } = setupStores(
      workspaceState(['src/a.ts', 'src/b.ts'], 'src/a.ts'),
    )
    documentStore.getState().ensureCachedEditorDocument(file('src/a.ts', 'a'))
    documentStore.getState().setCachedEditorDocumentDirty('src/a.ts', true)

    const result = commands.discardCachedEditorDocument('src/a.ts')

    expect(result.wasDirty).toBe(true)
    expect(workspaceStore.getState().openFilePaths).toEqual(['src/b.ts'])
    expect(workspaceStore.getState().selectedFilePath).toBe('src/b.ts')
    expect(workspaceStore.getState().editorHistory).toEqual([])
    expect(documentStore.getState().getCachedEditorDocument('src/a.ts')).toBe(null)
    expect(workspaceStore.getState().recentlyClosedEditorPaths).toEqual([])
  })

  it('discards dirty tabs from user close and tracks them as recently closed', () => {
    const { commands, documentStore, workspaceStore } = setupStores(
      workspaceState(['src/a.ts', 'src/b.ts'], 'src/a.ts'),
    )
    documentStore.getState().ensureCachedEditorDocument(file('src/a.ts', 'a'))
    documentStore.getState().setCachedEditorDocumentDirty('src/a.ts', true)

    const result = commands.discardAndCloseTab(tabIdForPath(workspaceStore, 'src/a.ts'))

    expect(result.wasDirty).toBe(true)
    expect(workspaceStore.getState().openFilePaths).toEqual(['src/b.ts'])
    expect(workspaceStore.getState().selectedFilePath).toBe('src/b.ts')
    expect(workspaceStore.getState().editorHistory).toEqual([])
    expect(workspaceStore.getState().recentlyClosedEditorPaths).toEqual(['src/a.ts'])
    expect(documentStore.getState().getCachedEditorDocument('src/a.ts')).toBe(null)
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
    documentStore.getState().ensureCachedEditorDocument(file('src/a.ts', 'a'))
    documentStore.getState().setCachedEditorDocumentDirty('src/a.ts', true)
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

  it('renames tabs, cached documents, dirty markers, and LSP targets', () => {
    const { commands, documentStore, uiStore, workspaceStore } = setupStores(
      workspaceState(['src/old.ts'], 'src/old.ts'),
    )
    documentStore.getState().ensureCachedEditorDocument(file('src/old.ts', 'a'))
    documentStore.getState().setCachedEditorDocumentDirty('src/old.ts', true)
    uiStore.getState().setDefinitionTarget(definitionTarget('src/old.ts'))
    uiStore.getState().setLanguageServerReferences(referencesResult('src/old.ts'))

    const result = commands.renameCachedEditorDocument('src/old.ts', 'src/new.ts')

    expect(result.wasDirty).toBe(true)
    expect(workspaceStore.getState().openFilePaths).toEqual(['src/new.ts'])
    expect(workspaceStore.getState().selectedFilePath).toBe('src/new.ts')
    expect(workspaceStore.getState().editorHistory).toEqual(['src/new.ts'])
    expect(documentStore.getState().dirtyFilePaths.has('src/old.ts')).toBe(false)
    expect(documentStore.getState().dirtyFilePaths.has('src/new.ts')).toBe(true)
    expect(documentStore.getState().getCachedEditorDocument('src/new.ts')?.path).toBe('src/new.ts')
    expect(uiStore.getState().definitionTarget?.path).toBe('src/new.ts')
    expect(uiStore.getState().languageServerReferences?.targets[0]?.path).toBe('src/new.ts')
  })

  it('resets workspace, document, and ui state for a picked root folder', () => {
    const { commands, documentStore, uiStore, workspaceStore } = setupStores(
      workspaceState(['src/a.ts'], 'src/a.ts'),
    )
    documentStore.getState().ensureCachedEditorDocument(file('src/a.ts', 'a'))
    uiStore.getState().setDefinitionTarget(definitionTarget('src/a.ts'))
    uiStore.getState().setLanguageServerReferences(referencesResult('src/a.ts'))

    commands.pickRootFolder(rootFolder('/repo'))

    expect(workspaceStore.getState().rootFolder?.path).toBe('/repo')
    expect(workspaceStore.getState().openFilePaths).toEqual([])
    expect(workspaceStore.getState().selectedFilePath).toBe(null)
    expect(workspaceStore.getState().editorHistory).toEqual([])
    expect(workspaceStore.getState().gitPanelOpen).toBe(true)
    expect(workspaceStore.getState().recentlyClosedEditorPaths).toEqual([])
    expect(workspaceStore.getState().sidebarVisible).toBe(true)
    expect(workspaceStore.getState().workspacePanelTab).toBe('files')
    expect(documentStore.getState().dirtyFilePaths).toEqual(new Set())
    expect(documentStore.getState().fallbackDocumentPath).toBe(null)
    expect(uiStore.getState().definitionTarget).toBe(null)
    expect(uiStore.getState().languageServerReferences).toBe(null)
  })

  it('coalesces workspace panel selection updates', () => {
    const store = createEditorWorkspaceStore(workspaceState([], null))
    let panelUpdates = 0
    const unsubscribe = store.subscribe((state, previousState) => {
      if (
        state.sidebarVisible !== previousState.sidebarVisible ||
        state.workspacePanelTab !== previousState.workspacePanelTab
      ) {
        panelUpdates += 1
      }
    })

    store.getState().setWorkspacePanelSelection({
      sidebarVisible: true,
      workspacePanelTab: 'files',
    })
    store.getState().setWorkspacePanelSelection({
      sidebarVisible: true,
      workspacePanelTab: 'search',
    })
    store.getState().setWorkspacePanelSelection({
      sidebarVisible: true,
      workspacePanelTab: 'search',
    })
    unsubscribe()

    expect(panelUpdates).toBe(1)
  })

  it('activates workspace panel tabs without duplicate updates', () => {
    const store = createEditorWorkspaceStore(workspaceState([], null))
    let panelUpdates = 0
    const unsubscribe = store.subscribe((state, previousState) => {
      if (
        state.sidebarVisible !== previousState.sidebarVisible ||
        state.workspacePanelTab !== previousState.workspacePanelTab
      ) {
        panelUpdates += 1
      }
    })

    store.getState().activateWorkspacePanelTab('files')
    store.getState().activateWorkspacePanelTab('files')
    store.getState().activateWorkspacePanelTab('search')
    unsubscribe()

    expect(store.getState().sidebarVisible).toBe(true)
    expect(store.getState().workspacePanelTab).toBe('search')
    expect(panelUpdates).toBe(3)
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
  const editorPaneLayout = createEditorPaneLayoutForPaths(openFilePaths, selectedFilePath)

  return {
    diffViewMode: 'split',
    editorHistory: selectedFilePath ? [selectedFilePath] : [],
    editorPaneLayout,
    gitPanelOpen: true,
    openFilePaths,
    recentlyClosedEditorPaths: [],
    rootFolder: rootFolder(''),
    selectedFilePath,
    sidebarVisible: true,
    workspacePanelTab: 'files',
  }
}

function activePaneId(workspaceStore: ReturnType<typeof createEditorWorkspaceStore>) {
  return workspaceStore.getState().editorPaneLayout.activePaneId
}

function panePathGroups(layout: ReturnType<typeof createEditorPaneLayoutForPaths>) {
  return editorPaneLeaves(layout.root).map((pane) => pane.tabs.map((tab) => tab.path))
}

function tabIdForPathInLayout(
  layout: ReturnType<typeof createEditorPaneLayoutForPaths>,
  path: string,
) {
  for (const pane of editorPaneLeaves(layout.root)) {
    const tab = pane.tabs.find((candidate) => candidate.path === path)
    if (tab) return tab.id
  }

  throw new Error(`Missing test tab for ${path}`)
}

function tabIdForPath(workspaceStore: ReturnType<typeof createEditorWorkspaceStore>, path: string) {
  const layout = workspaceStore.getState().editorPaneLayout
  const pane = findEditorPane(layout.root, layout.activePaneId)
  const match = pane?.tabs.find((candidate) => candidate.path === path)
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
