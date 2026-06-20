import { describe, expect, it } from 'vitest'

import {
  closeEditorPathInWorkbenchPanels,
  closeEditorTabInWorkbenchPanels,
  createDefaultWorkbenchPanels,
  normalizeWorkbenchPanels,
  openEditorPathInWorkbenchPanels,
  renameEditorPathInWorkbenchPanels,
  reorderEditorTabInWorkbenchPanels,
  selectEditorTabInWorkbenchPanels,
  setWorkbenchBottomTab,
  setWorkbenchMainLayout,
  setWorkbenchOuterLayout,
  setWorkbenchSidebarTab,
  type WorkbenchPanels,
} from '@/features/workbench/utils/workbench-panels'

describe('workbench panel-state model', () => {
  it('creates default panels', () => {
    expect(createDefaultWorkbenchPanels()).toMatchObject({
      activeBottomTab: 'terminal',
      activeEditorTabId: null,
      activeSidebarTab: 'files',
      editorTabs: [],
      mainLayout: {
        bottom: 30,
        editor: 70,
      },
      outerLayout: {
        main: 76,
        sidebar: 24,
      },
    })
  })

  it('opens a new path as the active tab', () => {
    const panels = openEditorPathInWorkbenchPanels(createDefaultWorkbenchPanels(), '/repo/a.ts')

    expect(panels.editorTabs).toHaveLength(1)
    expect(panels.editorTabs[0]?.path).toBe('/repo/a.ts')
    expect(panels.activeEditorTabId).toBe(panels.editorTabs[0]?.id)
  })

  it('selects an already-open path without adding a tab', () => {
    let panels = workbenchPanelsForPaths(['/repo/a.ts', '/repo/b.ts'])
    panels = openEditorPathInWorkbenchPanels(panels, '/repo/a.ts')

    expect(panels.editorTabs).toHaveLength(2)
    expect(panels.activeEditorTabId).toBe(editorTabIdAt(panels, 0))
  })

  it('keeps select operations inert when the tab is absent or already active', () => {
    const panels = workbenchPanelsForPaths(['/repo/a.ts'])
    const activeTabId = editorTabIdAt(panels, 0)

    expect(selectEditorTabInWorkbenchPanels(panels, 'missing-tab')).toBe(panels)
    expect(selectEditorTabInWorkbenchPanels(panels, activeTabId)).toBe(panels)
  })

  it('selects an existing inactive editor tab', () => {
    const panels = workbenchPanelsForPaths(['/repo/a.ts', '/repo/b.ts'])
    const firstTabId = editorTabIdAt(panels, 0)
    const result = selectEditorTabInWorkbenchPanels(panels, firstTabId)

    expect(result).not.toBe(panels)
    expect(result.activeEditorTabId).toBe(firstTabId)
  })

  it('reorders editor tabs and clamps insertion indexes', () => {
    const panels = workbenchPanelsForPaths(['/repo/a.ts', '/repo/b.ts', '/repo/c.ts'])
    const firstTabId = editorTabIdAt(panels, 0)
    const movedToMiddle = reorderEditorTabInWorkbenchPanels(panels, firstTabId, 2)
    const movedToEnd = reorderEditorTabInWorkbenchPanels(panels, firstTabId, 99)

    expect(editorTabPaths(movedToMiddle)).toEqual(['/repo/b.ts', '/repo/c.ts', '/repo/a.ts'])
    expect(editorTabPaths(movedToEnd)).toEqual(['/repo/b.ts', '/repo/c.ts', '/repo/a.ts'])
  })

  it('keeps no-op reorder operations referentially stable', () => {
    const panels = workbenchPanelsForPaths(['/repo/a.ts', '/repo/b.ts'])
    const secondTabId = editorTabIdAt(panels, 1)

    expect(reorderEditorTabInWorkbenchPanels(panels, secondTabId, 1)).toBe(panels)
    expect(reorderEditorTabInWorkbenchPanels(panels, 'missing-tab', 1)).toBe(panels)
  })

  it('renames matching editor paths', () => {
    const panels = workbenchPanelsForPaths(['/repo/a.ts', '/repo/b.ts'])
    const result = renameEditorPathInWorkbenchPanels(panels, '/repo/a.ts', '/repo/renamed.ts')

    expect(editorTabPaths(result)).toEqual(['/repo/renamed.ts', '/repo/b.ts'])
  })

  it('keeps missing editor path renames referentially stable', () => {
    const panels = workbenchPanelsForPaths(['/repo/a.ts'])

    expect(renameEditorPathInWorkbenchPanels(panels, '/repo/missing.ts', '/repo/renamed.ts')).toBe(
      panels,
    )
  })

  it('activates the tab now at the same index after closing the active middle tab', () => {
    let panels = workbenchPanelsForPaths(['/repo/a.ts', '/repo/b.ts', '/repo/c.ts'])
    panels = openEditorPathInWorkbenchPanels(panels, '/repo/b.ts')
    const middleTabId = editorTabIdAt(panels, 1)
    const lastTabId = editorTabIdAt(panels, 2)
    const result = closeEditorTabInWorkbenchPanels(panels, middleTabId)

    expect(editorTabPaths(result)).toEqual(['/repo/a.ts', '/repo/c.ts'])
    expect(result.activeEditorTabId).toBe(lastTabId)
  })

  it('activates the new last tab after closing the active last tab', () => {
    const panels = workbenchPanelsForPaths(['/repo/a.ts', '/repo/b.ts', '/repo/c.ts'])
    const activeLastTabId = editorTabIdAt(panels, 2)
    const previousTabId = editorTabIdAt(panels, 1)
    const result = closeEditorTabInWorkbenchPanels(panels, activeLastTabId)

    expect(editorTabPaths(result)).toEqual(['/repo/a.ts', '/repo/b.ts'])
    expect(result.activeEditorTabId).toBe(previousTabId)
  })

  it('clears the active editor tab after closing the only tab', () => {
    const panels = workbenchPanelsForPaths(['/repo/a.ts'])
    const tabId = editorTabIdAt(panels, 0)
    const result = closeEditorTabInWorkbenchPanels(panels, tabId)

    expect(result.editorTabs).toEqual([])
    expect(result.activeEditorTabId).toBeNull()
  })

  it('preserves the active editor tab after closing a non-active tab', () => {
    const panels = workbenchPanelsForPaths(['/repo/a.ts', '/repo/b.ts', '/repo/c.ts'])
    const firstTabId = editorTabIdAt(panels, 0)
    const activeTabId = editorTabIdAt(panels, 2)
    const result = closeEditorTabInWorkbenchPanels(panels, firstTabId)

    expect(editorTabPaths(result)).toEqual(['/repo/b.ts', '/repo/c.ts'])
    expect(result.activeEditorTabId).toBe(activeTabId)
  })

  it('keeps absent close-tab operations referentially stable', () => {
    const panels = workbenchPanelsForPaths(['/repo/a.ts'])

    expect(closeEditorTabInWorkbenchPanels(panels, 'missing-tab')).toBe(panels)
  })

  it('closes every editor tab with a matching path', () => {
    const panels = renameEditorPathInWorkbenchPanels(
      workbenchPanelsForPaths(['/repo/a.ts', '/repo/b.ts']),
      '/repo/b.ts',
      '/repo/a.ts',
    )
    const result = closeEditorPathInWorkbenchPanels(panels, '/repo/a.ts')

    expect(result.editorTabs).toEqual([])
    expect(result.activeEditorTabId).toBeNull()
  })

  it('keeps absent close-path operations referentially stable', () => {
    const panels = workbenchPanelsForPaths(['/repo/a.ts'])

    expect(closeEditorPathInWorkbenchPanels(panels, '/repo/missing.ts')).toBe(panels)
  })

  it('stores outer split layout percentages and keeps unchanged values referentially stable', () => {
    const panels = createDefaultWorkbenchPanels()

    expect(setWorkbenchOuterLayout(panels, { main: 68, sidebar: 32 }).outerLayout).toEqual({
      main: 68,
      sidebar: 32,
    })
    expect(setWorkbenchOuterLayout(panels, { main: 76, sidebar: 24 })).toBe(panels)
  })

  it('stores main split layout percentages and keeps unchanged values referentially stable', () => {
    const panels = createDefaultWorkbenchPanels()

    expect(setWorkbenchMainLayout(panels, { bottom: 36, editor: 64 }).mainLayout).toEqual({
      bottom: 36,
      editor: 64,
    })
    expect(setWorkbenchMainLayout(panels, { bottom: 30, editor: 70 })).toBe(panels)
  })

  it('sets sidebar and bottom tabs while keeping current values referentially stable', () => {
    const panels = createDefaultWorkbenchPanels()
    const sidebarResult = setWorkbenchSidebarTab(panels, 'git')
    const bottomResult = setWorkbenchBottomTab(panels, 'problems')

    expect(sidebarResult).not.toBe(panels)
    expect(sidebarResult.activeSidebarTab).toBe('git')
    expect(setWorkbenchSidebarTab(panels, 'files')).toBe(panels)
    expect(bottomResult).not.toBe(panels)
    expect(bottomResult.activeBottomTab).toBe('problems')
    expect(setWorkbenchBottomTab(panels, 'terminal')).toBe(panels)
  })

  it('normalizes out-of-range dimensions and stale active editor ids', () => {
    const panels = workbenchPanelsForPaths(['/repo/a.ts', '/repo/b.ts'])
    const firstTabId = editorTabIdAt(panels, 0)
    const result = normalizeWorkbenchPanels({
      ...panels,
      activeEditorTabId: 'missing-tab',
      mainLayout: {
        bottom: 999,
        editor: 0,
      },
      outerLayout: {
        main: 0,
        sidebar: 999,
      },
    })

    expect(result.mainLayout).toEqual({
      bottom: 30,
      editor: 70,
    })
    expect(result.outerLayout).toEqual({
      main: 76,
      sidebar: 24,
    })
    expect(result.activeEditorTabId).toBe(firstTabId)
  })

  it('normalizes stale active editor ids to null when no tabs exist', () => {
    const result = normalizeWorkbenchPanels({
      ...createDefaultWorkbenchPanels(),
      activeEditorTabId: 'missing-tab',
    })

    expect(result.activeEditorTabId).toBeNull()
  })

  it('preserves valid active editor ids while normalizing panels', () => {
    const panels = workbenchPanelsForPaths(['/repo/a.ts', '/repo/b.ts'])
    const activeTabId = editorTabIdAt(panels, 1)
    const result = normalizeWorkbenchPanels(panels)

    expect(result.activeEditorTabId).toBe(activeTabId)
  })
})

function workbenchPanelsForPaths(paths: readonly string[]) {
  let panels = createDefaultWorkbenchPanels()
  for (const path of paths) panels = openEditorPathInWorkbenchPanels(panels, path)

  return panels
}

function editorTabIdAt(panels: WorkbenchPanels, index: number) {
  const id = panels.editorTabs[index]?.id
  expect(id).toEqual(expect.any(String))

  return id ?? ''
}

function editorTabPaths(panels: WorkbenchPanels) {
  return panels.editorTabs.map((tab) => tab.path)
}
