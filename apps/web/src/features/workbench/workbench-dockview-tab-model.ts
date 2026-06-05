import { editorTabModel } from '@/components/workspace/editor-tabs/utils/editor-tab-model'
import type {
  EditorTabConflictMap,
  EditorTabModel,
} from '@/components/workspace/editor-tabs/utils/editor-tab-types'
import type { FileStatus } from '@/features/git/types'

import type { WorkbenchDockviewPanelRecord } from './workbench-dockview-model'

export type WorkbenchDockviewTabModelContext = {
  readonly conflicts: EditorTabConflictMap
  readonly gitFiles: readonly FileStatus[]
  readonly rootPath: string
}

export function workbenchDockviewEditorTabModel({
  active,
  context,
  record,
}: {
  readonly active: boolean
  readonly context: WorkbenchDockviewTabModelContext
  readonly record: WorkbenchDockviewPanelRecord
}): EditorTabModel {
  return editorTabModel({
    conflicts: context.conflicts,
    gitFiles: context.gitFiles,
    rootPath: context.rootPath,
    selectedTabId: active ? record.tabId : null,
    tab: {
      id: record.tabId,
      path: workbenchDockviewRecordPath(record),
    },
  })
}

export function workbenchDockviewEditorTabModels({
  activeTabId,
  context,
  records,
}: {
  readonly activeTabId: string | null
  readonly context: WorkbenchDockviewTabModelContext
  readonly records: readonly WorkbenchDockviewPanelRecord[]
}) {
  return records.map((record) =>
    workbenchDockviewEditorTabModel({
      active: record.tabId === activeTabId,
      context,
      record,
    }),
  )
}

export function workbenchDockviewRecordPath(record: WorkbenchDockviewPanelRecord) {
  if (record.panel.type === 'diff') return record.panel.diffDocumentId
  if (record.panel.type === 'file') return record.panel.path

  return record.panel.id
}
