import { describe, expect, it } from 'vitest'

import { createEditorCommands } from '@/features/editor/state/editor-commands'
import { createEditorDocumentStore } from '@/features/editor/state/editor-document-state'
import { createEditorUiStore } from '@/features/editor/state/editor-ui-state'
import { createEditorWorkspaceStore } from '@/features/editor/state/editor-workspace-state'
import { DEFAULT_DIFF_VIEW_MODE } from '@/features/editor/utils/diff-view-mode'
import {
  createDefaultWorkbenchPanels,
  openEditorPathInWorkbenchPanels,
} from '@/features/workbench/utils/workbench-panels'
import type { PickedFsEntry } from '@/lib/file-system-types'
import type { CachedWorkspaceState } from '@/lib/workspace-cache'

describe('editor workspace state', () => {
  it('opens files as flat editor tabs and records history', () => {
    const { commands, workspaceStore } = editorHarness()

    commands.openFileSurface('/repo/src/app.ts')

    expect(workspaceStore.getState()).toMatchObject({
      editorHistory: ['/repo/src/app.ts'],
      openFilePaths: ['/repo/src/app.ts'],
      selectedFilePath: '/repo/src/app.ts',
    })
    expect(workspaceStore.getState().workbenchPanels.editorTabs).toEqual([
      expect.objectContaining({ path: '/repo/src/app.ts' }),
    ])
  })

  it('selects existing tabs without duplicating open paths', () => {
    const panels = workbenchPanelsForPaths(['/repo/src/a.ts', '/repo/src/b.ts'], '/repo/src/a.ts')
    const { commands, workspaceStore } = editorHarness({ workbenchPanels: panels })
    const tab = workspaceStore
      .getState()
      .workbenchPanels.editorTabs.find((candidate) => candidate.path === '/repo/src/b.ts')
    expect(tab).toBeTruthy()

    commands.selectTab('main', tab!.id)

    expect(workspaceStore.getState()).toMatchObject({
      editorHistory: ['/repo/src/b.ts'],
      openFilePaths: ['/repo/src/a.ts', '/repo/src/b.ts'],
      selectedFilePath: '/repo/src/b.ts',
    })
  })

  it('closes editor tabs and reopens the most recently closed path', () => {
    const panels = workbenchPanelsForPaths(['/repo/src/a.ts', '/repo/src/b.ts'], '/repo/src/b.ts')
    const { commands, workspaceStore } = editorHarness({
      editorHistory: ['/repo/src/b.ts', '/repo/src/a.ts'],
      workbenchPanels: panels,
    })
    const activeTabId = workspaceStore.getState().workbenchPanels.activeEditorTabId
    expect(activeTabId).toBeTruthy()

    commands.closeTab(activeTabId!)

    expect(workspaceStore.getState()).toMatchObject({
      openFilePaths: ['/repo/src/a.ts'],
      recentlyClosedEditorPaths: ['/repo/src/b.ts'],
      selectedFilePath: '/repo/src/a.ts',
    })

    expect(commands.reopenClosedEditor()).toBe(true)
    expect(workspaceStore.getState()).toMatchObject({
      openFilePaths: ['/repo/src/a.ts', '/repo/src/b.ts'],
      recentlyClosedEditorPaths: [],
      selectedFilePath: '/repo/src/b.ts',
    })
  })

  it('renames editor paths across panels, history, and recent closes', () => {
    const panels = workbenchPanelsForPaths(['/repo/src/a.ts'], '/repo/src/a.ts')
    const { commands, uiStore, workspaceStore } = editorHarness({
      editorHistory: ['/repo/src/a.ts'],
      recentlyClosedEditorPaths: ['/repo/src/a.ts'],
      workbenchPanels: panels,
    })
    uiStore.getState().setDefinitionTarget({
      path: '/repo/src/a.ts',
      range: {
        end: { character: 1, line: 0 },
        start: { character: 0, line: 0 },
      },
      uri: 'file:///repo/src/a.ts',
    })

    commands.renameLiveEditorDocument('/repo/src/a.ts', '/repo/src/renamed.ts')

    expect(workspaceStore.getState()).toMatchObject({
      editorHistory: ['/repo/src/renamed.ts'],
      openFilePaths: ['/repo/src/renamed.ts'],
      recentlyClosedEditorPaths: ['/repo/src/renamed.ts'],
      selectedFilePath: '/repo/src/renamed.ts',
    })
    expect(uiStore.getState().definitionTarget?.path).toBe('/repo/src/renamed.ts')
  })

  it('keeps split and pane movement commands inert in the fixed workbench', () => {
    const panels = workbenchPanelsForPaths(['/repo/src/a.ts'], '/repo/src/a.ts')
    const { commands, workspaceStore } = editorHarness({ workbenchPanels: panels })
    const activeTabId = workspaceStore.getState().workbenchPanels.activeEditorTabId
    expect(activeTabId).toBeTruthy()

    expect(commands.splitTab(activeTabId!, 'horizontal')).toBe(false)
    expect(commands.moveTabToPane(activeTabId!, 'secondary')).toBe(false)
    expect(commands.moveTabToSplit(activeTabId!, 'main', 'right')).toBe(false)
  })
})

function editorHarness(overrides: Partial<CachedWorkspaceState> = {}) {
  const documentStore = createEditorDocumentStore()
  const uiStore = createEditorUiStore()
  const workspaceStore = createEditorWorkspaceStore(cachedWorkspace(overrides))
  const commands = createEditorCommands({ documentStore, uiStore, workspaceStore })

  return { commands, documentStore, uiStore, workspaceStore }
}

function cachedWorkspace(overrides: Partial<CachedWorkspaceState>): CachedWorkspaceState {
  const workbenchPanels = overrides.workbenchPanels ?? createDefaultWorkbenchPanels()

  return {
    diffViewMode: DEFAULT_DIFF_VIEW_MODE,
    editorHistory: [],
    openFilePaths: workbenchPanels.editorTabs.map((tab) => tab.path),
    recentlyClosedEditorPaths: [],
    rootFolder: pickedDirectory('/repo'),
    selectedFilePath:
      workbenchPanels.editorTabs.find((tab) => tab.id === workbenchPanels.activeEditorTabId)
        ?.path ?? null,
    workbenchPanels,
    ...overrides,
  }
}

function workbenchPanelsForPaths(paths: readonly string[], activePath: string | null) {
  let panels = createDefaultWorkbenchPanels()
  for (const path of paths) panels = openEditorPathInWorkbenchPanels(panels, path)
  if (!activePath) return panels

  return openEditorPathInWorkbenchPanels(panels, activePath)
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
