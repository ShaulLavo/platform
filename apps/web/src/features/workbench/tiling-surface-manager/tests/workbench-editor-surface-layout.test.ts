import { describe, expect, it } from 'vitest'

import {
  activeEditorPanePath,
  createEditorPaneLayoutForPaths,
  createEditorPaneTab,
  editorPaneOpenPaths,
  splitEditorPaneTab,
  type EditorPaneLayout,
} from '@/features/editor/state/editor-pane-state'
import { snapshotDiffDocumentId } from '@/features/git/diff-document'
import type { FileDiff } from '@/features/git/types'

import { diffSurfaceId, fileEditorSurfaceId } from '../layout-ids'
import {
  editorPaneIdForWorkbenchWindowId,
  editorPaneLayoutForWorkspaceLayout,
  workspaceLayoutForEditorPaneLayout,
} from '../workbench-editor-surface-layout'

describe('workspaceLayoutForEditorPaneLayout', () => {
  it('maps file and diff editor tabs to editor surfaces', () => {
    const diffDocumentId = snapshotDiffDocumentId(snapshotDiff('/repo/src/app.ts'))
    const editorLayout = createEditorPaneLayoutForPaths(
      ['/repo/src/readme.md', diffDocumentId],
      diffDocumentId,
    )
    const layout = workspaceLayoutForEditorPaneLayout(editorLayout)

    expect(layout.surfacesById[fileEditorSurfaceId('/repo/src/readme.md')]?.type).toBe(
      'file-editor',
    )
    expect(layout.surfacesById[diffSurfaceId(diffDocumentId)]?.type).toBe('diff')
    expect(layout.activeSurfaceId).toBe(diffSurfaceId(diffDocumentId))
  })

  it('preserves editor tab ids in surface serialized state', () => {
    const editorLayout = createEditorPaneLayoutForPaths(['/repo/src/app.ts'], '/repo/src/app.ts')
    const tab = editorLayout.root.kind === 'leaf' ? editorLayout.root.tabs[0] : null
    const layout = workspaceLayoutForEditorPaneLayout(editorLayout)
    const surface = layout.surfacesById[fileEditorSurfaceId('/repo/src/app.ts')]

    expect(surface?.serializedState).toEqual({
      editorPaneId: editorLayout.activePaneId,
      editorTabId: tab?.id,
    })
  })

  it('creates one workbench window per editor pane leaf', () => {
    const editorLayout = createEditorPaneLayoutForPaths(
      ['/repo/src/a.ts', '/repo/src/b.ts'],
      '/repo/src/a.ts',
    )
    const tabId = editorLayout.root.kind === 'leaf' ? editorLayout.root.tabs[0]?.id : null
    const splitLayout = tabId ? splitEditorPaneTab(editorLayout, tabId, 'horizontal') : editorLayout
    const layout = workspaceLayoutForEditorPaneLayout(splitLayout)

    expect(
      Object.values(layout.windowsById).filter((window) =>
        editorPaneIdForWorkbenchWindowId(window.id),
      ),
    ).toHaveLength(2)
    expect(layout.rootNodeId ? layout.nodesById[layout.rootNodeId]?.kind : null).toBe('split')
  })

  it('prefers the active duplicate tab when one path appears in multiple panes', () => {
    const leftTab = createEditorPaneTab('/repo/src/app.ts')
    const rightTab = createEditorPaneTab('/repo/src/app.ts')
    const splitLayout: EditorPaneLayout = {
      activePaneId: 'right-pane',
      root: {
        children: [
          {
            activeTabId: leftTab.id,
            id: 'left-pane',
            kind: 'leaf',
            tabs: [leftTab],
          },
          {
            activeTabId: rightTab.id,
            id: 'right-pane',
            kind: 'leaf',
            tabs: [rightTab],
          },
        ],
        direction: 'horizontal',
        id: 'root-split',
        kind: 'split',
        sizes: [0.5, 0.5],
      },
    }
    const layout = workspaceLayoutForEditorPaneLayout(splitLayout)
    const surface = layout.surfacesById[fileEditorSurfaceId('/repo/src/app.ts')]

    expect(surface?.serializedState).toEqual({
      editorPaneId: 'right-pane',
      editorTabId: rightTab.id,
    })
  })

  it('round trips visible editor surfaces back to compatibility editor panes', () => {
    const editorLayout = createEditorPaneLayoutForPaths(
      ['/repo/src/a.ts', '/repo/src/b.ts'],
      '/repo/src/b.ts',
    )
    const tabId = editorLayout.root.kind === 'leaf' ? editorLayout.root.tabs[0]?.id : null
    const splitLayout = tabId ? splitEditorPaneTab(editorLayout, tabId, 'horizontal') : editorLayout
    const workspaceLayout = workspaceLayoutForEditorPaneLayout(splitLayout)
    const roundTrip = editorPaneLayoutForWorkspaceLayout(workspaceLayout)

    expect(new Set(editorPaneOpenPaths(roundTrip))).toEqual(
      new Set(['/repo/src/a.ts', '/repo/src/b.ts']),
    )
    expect(activeEditorPanePath(roundTrip)).toBe('/repo/src/a.ts')
    expect(roundTrip.root.kind).toBe('split')
  })
})

function snapshotDiff(path: string): FileDiff {
  return {
    newFileMissing: false,
    newObjectId: 'new-object',
    oldFileMissing: false,
    oldObjectId: 'old-object',
    path,
  }
}
