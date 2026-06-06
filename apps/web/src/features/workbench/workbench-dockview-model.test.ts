import { describe, expect, it } from 'vitest'

import { createEditorPaneLayoutForPaths } from '@/features/editor/state/editor-pane-state'
import { snapshotDiffDocumentId } from '@/features/git/diff-document'
import type { FileDiff } from '@/features/git/types'

import {
  workbenchDockviewActivePanelIdForEditorLayout,
  workbenchDockviewPanelRecordsForEditorLayout,
  workbenchDockviewRecordMap,
} from './workbench-dockview-model'
import { diffWorkbenchPanelId, fileWorkbenchPanelId } from './workbench-panel-ids'

describe('workbench Dockview model', () => {
  it('derives file and diff workbench panel records from the editor pane layout', () => {
    const diffDocumentId = snapshotDiffDocumentId(snapshotDiff('/repo/src/app.ts'))
    const layout = createEditorPaneLayoutForPaths(
      ['/repo/src/app.ts', diffDocumentId],
      diffDocumentId,
    )

    const records = workbenchDockviewPanelRecordsForEditorLayout(layout)
    const recordsById = workbenchDockviewRecordMap(records)

    expect(records.map((record) => record.panel.id)).toEqual([
      fileWorkbenchPanelId('/repo/src/app.ts'),
      diffWorkbenchPanelId(diffDocumentId),
    ])
    expect(recordsById.get(diffWorkbenchPanelId(diffDocumentId))?.panel.type).toBe('diff')
    expect(workbenchDockviewActivePanelIdForEditorLayout(layout)).toBe(
      diffWorkbenchPanelId(diffDocumentId),
    )
  })

  it('returns no active Dockview panel for an empty editor layout', () => {
    const layout = createEditorPaneLayoutForPaths([], null)

    expect(workbenchDockviewPanelRecordsForEditorLayout(layout)).toEqual([])
    expect(workbenchDockviewActivePanelIdForEditorLayout(layout)).toBeNull()
  })
})

function snapshotDiff(path: string): FileDiff {
  return {
    newObjectId: 'abcdef1234567890',
    path,
    staged: false,
    worktree: 'modified',
  }
}
