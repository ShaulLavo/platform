import { describe, expect, it } from 'vitest'

import {
  editorWorkspaceLayoutForPaths,
  splitEditorWorkspaceLayoutForPaths,
} from '../../../../test/factories/editor-workspace-layout'
import { snapshotDiffDocumentId } from '@/features/git/diff-document'
import type { SnapshotDiffDocumentInput } from '@/features/git/diff-document'

import {
  activeEditorPathForWorkspaceLayout,
  activeEditorSurfaceTab,
  editorOpenPathsForWorkspaceLayout,
  editorGroupIdForWorkbenchWindowId,
  editorSurfacePathCounts,
  editorSurfaceSerializedState,
  editorSurfaceTabRecords,
} from '@/features/workbench/utils/editor-surface-layout'
import { fileEditorSurfaceId } from '@workspace/tiling/utils/layout-ids'

describe('editor surface layout selectors', () => {
  it('lists visible file and diff editor paths in layout order', () => {
    const diffDocumentId = snapshotDiffDocumentId(snapshotDiff('/repo/src/app.ts'))
    const layout = editorWorkspaceLayoutForPaths(
      ['/repo/src/readme.md', diffDocumentId],
      diffDocumentId,
    )

    expect(editorOpenPathsForWorkspaceLayout(layout)).toEqual([
      '/repo/src/readme.md',
      diffDocumentId,
    ])
    expect(activeEditorPathForWorkspaceLayout(layout)).toBe(diffDocumentId)
  })

  it('reads editor tab records from file-backed surfaces', () => {
    const layout = splitEditorWorkspaceLayoutForPaths({
      activePath: '/repo/src/b.ts',
      leftPaths: ['/repo/src/a.ts'],
      rightPaths: ['/repo/src/b.ts'],
    })
    const activeTab = activeEditorSurfaceTab(layout)

    expect(activeTab?.path).toBe('/repo/src/b.ts')
    expect(editorSurfaceTabRecords(layout).map((tab) => tab.path)).toEqual([
      '/repo/src/a.ts',
      '/repo/src/b.ts',
    ])
    expect(editorSurfacePathCounts(layout)).toEqual(
      new Map([
        ['/repo/src/a.ts', 1],
        ['/repo/src/b.ts', 1],
      ]),
    )
  })

  it('preserves serialized editor tab ids on surfaces', () => {
    const layout = editorWorkspaceLayoutForPaths(['/repo/src/app.ts'], '/repo/src/app.ts')
    const surface = layout.surfacesById[fileEditorSurfaceId('/repo/src/app.ts')]

    expect(surface ? editorSurfaceSerializedState(surface) : null).toEqual({
      editorGroupId: 'main',
      editorTabId: 'test-tab:main:0',
    })
  })

  it('decodes editor group ids from editor workbench window ids', () => {
    const layout = splitEditorWorkspaceLayoutForPaths({
      activePath: '/repo/src/a.ts',
      leftPaths: ['/repo/src/a.ts'],
      rightPaths: ['/repo/src/b.ts'],
    })
    const paneIds = Object.values(layout.windowsById)
      .map((window) => editorGroupIdForWorkbenchWindowId(window.id))
      .filter(Boolean)

    expect(new Set(paneIds)).toEqual(new Set(['left', 'right']))
  })
})

function snapshotDiff(path: string): SnapshotDiffDocumentInput {
  return {
    hunks: [],
    newFileMissing: false,
    newObjectId: 'new-object',
    oldFileMissing: false,
    oldObjectId: 'old-object',
    patch: '',
    path,
    staged: false,
  }
}
