import { describe, expect, it } from 'vitest'

import {
  createEditorPaneLayoutForPaths,
  splitEditorPaneTab,
} from '@/features/editor/state/editor-pane-state'

import { createWorkspaceLayoutStore } from './surface-state'
import { dispatchWorkbenchEditorSurfaceOperation } from './workbench-editor-surface-dispatch'
import {
  editorSurfaceSerializedState,
  workspaceLayoutForEditorPaneLayout,
} from './workbench-editor-surface-layout'
import type { WorkspaceLayout } from './layout-types'

describe('dispatchWorkbenchEditorSurfaceOperation', () => {
  it('commits renderer-owned resize and maximize operations', () => {
    const layout = splitEditorWorkspaceLayout()
    const store = createWorkspaceLayoutStore(layout)
    const committed: WorkspaceLayout[] = []
    const splitId = layout.rootNodeId
    const windowId = layout.activeWindowId
    if (!splitId) throw new Error('Expected split layout')
    if (!windowId) throw new Error('Expected active window')

    dispatchWorkbenchEditorSurfaceOperation(
      { deltaPx: 120, handleIndex: 0, splitId, type: 'resizeSplit' },
      {
        commitLayout: (layout) => committed.push(layout),
        requestCloseTab: () => false,
        store,
      },
    )
    dispatchWorkbenchEditorSurfaceOperation(
      { type: 'maximizeWindow', windowId },
      {
        commitLayout: (layout) => committed.push(layout),
        requestCloseTab: () => false,
        store,
      },
    )

    expect(committed).toHaveLength(2)
    expect(committed[0]?.nodesById[splitId]).toMatchObject({
      kind: 'split',
      sizes: [0.62, 0.38],
    })
    expect(committed[1]?.windowsById[windowId]?.mode).toBe('maximized')
  })

  it('routes editor closes through dirty-close request handling', () => {
    const layout = splitEditorWorkspaceLayout()
    const store = createWorkspaceLayoutStore(layout)
    const requestedTabIds: string[] = []
    const committed: WorkspaceLayout[] = []
    const surfaceId = layout.activeSurfaceId
    if (!surfaceId) throw new Error('Expected active surface')

    dispatchWorkbenchEditorSurfaceOperation(
      { surfaceId, type: 'closeSurface' },
      {
        commitLayout: (layout) => committed.push(layout),
        requestCloseTab: (tabId) => {
          requestedTabIds.push(tabId)
          return true
        },
        store,
      },
    )

    expect(requestedTabIds).toEqual([
      editorSurfaceSerializedState(layout.surfacesById[surfaceId])?.editorTabId,
    ])
    expect(committed).toEqual([])
  })
})

function splitEditorWorkspaceLayout() {
  const editorLayout = createEditorPaneLayoutForPaths(
    ['/repo/src/a.ts', '/repo/src/b.ts'],
    '/repo/src/a.ts',
  )
  const tabId = editorLayout.root.kind === 'leaf' ? editorLayout.root.tabs[1]?.id : null
  const splitLayout = tabId ? splitEditorPaneTab(editorLayout, tabId, 'horizontal') : editorLayout

  return workspaceLayoutForEditorPaneLayout(splitLayout)
}
