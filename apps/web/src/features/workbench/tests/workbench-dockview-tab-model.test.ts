import { describe, expect, it } from 'vitest'

import { snapshotDiffDocumentId } from '@/features/git/diff-document'
import type { FileDiff } from '@/features/git/types'

import type { WorkbenchDockviewPanelRecord } from '../workbench-dockview-model'
import {
  workbenchDockviewEditorTabModel,
  workbenchDockviewRecordPath,
} from '../workbench-dockview-tab-model'
import { createDiffWorkbenchPanel, createFileWorkbenchPanel } from '../workbench-panel-ids'

describe('workbench Dockview tab model', () => {
  it('preserves Chrome editor tab metadata for file panels', () => {
    const record = workbenchRecord('/repo/src/app.ts')

    const tab = workbenchDockviewEditorTabModel({
      active: true,
      context: {
        conflicts: {},
        gitFiles: [],
        rootPath: '/repo',
      },
      record,
    })

    expect(tab).toMatchObject({
      active: true,
      copyPath: '/repo/src/app.ts',
      copyRelativePath: 'src/app.ts',
      id: 'tab:/repo/src/app.ts',
      name: 'app.ts',
      path: '/repo/src/app.ts',
    })
  })

  it('uses the diff document id as the tab path for diff panels', () => {
    const diffDocumentId = snapshotDiffDocumentId(snapshotDiff('/repo/src/app.ts'))
    const record: WorkbenchDockviewPanelRecord = {
      paneId: 'pane-a',
      panel: createDiffWorkbenchPanel(diffDocumentId),
      tabId: 'tab:diff',
    }

    expect(workbenchDockviewRecordPath(record)).toBe(diffDocumentId)
  })
})

function workbenchRecord(path: string): WorkbenchDockviewPanelRecord {
  return {
    paneId: 'pane-a',
    panel: createFileWorkbenchPanel(path),
    tabId: `tab:${path}`,
  }
}

function snapshotDiff(path: string): FileDiff {
  return {
    newObjectId: 'abcdef1234567890',
    path,
    staged: false,
    worktree: 'modified',
  }
}
