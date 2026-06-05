import { use } from 'react'
import type { IDockviewPanelProps } from 'dockview-react'

import { WorkbenchDiffEditorPanel } from './workbench-diff-editor-panel'
import { WorkbenchDockviewContext } from './workbench-dockview-context'
import type { WorkbenchDockviewPanelParams } from './workbench-dockview-model'
import { WorkbenchFileEditorPanel } from './workbench-file-editor-panel'
import { WorkbenchPanelUnavailable } from './workbench-panel-unavailable'
import { WorkbenchUnsupportedPanel } from './workbench-unsupported-panel'
import { useDockviewPanelActive } from './use-dockview-panel-active'

export function WorkbenchDockviewPanel({
  api,
  params,
}: IDockviewPanelProps<WorkbenchDockviewPanelParams>) {
  const context = use(WorkbenchDockviewContext)
  const active = useDockviewPanelActive(api)
  const record = context?.recordsById.get(params.panel.id) ?? null

  if (!context) {
    return <WorkbenchPanelUnavailable message='Workbench context is unavailable.' />
  }

  if (!record) {
    return <WorkbenchPanelUnavailable message='This workbench panel is no longer open.' />
  }

  if (record.panel.type === 'file') {
    return (
      <WorkbenchFileEditorPanel
        active={active}
        editorKeymapLayers={context.editorKeymapLayers}
        panel={record.panel}
        rootPath={context.rootPath}
        tabId={record.tabId}
      />
    )
  }

  if (record.panel.type === 'diff') {
    return <WorkbenchDiffEditorPanel active={active} panel={record.panel} />
  }

  return <WorkbenchUnsupportedPanel panel={record.panel} />
}
