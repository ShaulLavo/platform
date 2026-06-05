import { EditorPaneTabBody } from '@/components/workspace/editor-panes/components/editor-pane-tab-body'
import type { EditorKeymapLayer } from '@editor/core'

import type { WorkbenchFileEditorPanel as WorkbenchFileEditorPanelModel } from './workbench-panel-types'

export function WorkbenchFileEditorPanel({
  active,
  editorKeymapLayers,
  panel,
  rootPath,
  tabId,
}: {
  readonly active: boolean
  readonly editorKeymapLayers: readonly EditorKeymapLayer[]
  readonly panel: WorkbenchFileEditorPanelModel
  readonly rootPath: string
  readonly tabId: string
}) {
  return (
    <EditorPaneTabBody
      active={active}
      editorKeymapLayers={editorKeymapLayers}
      path={panel.path}
      rootPath={rootPath}
      tabId={tabId}
    />
  )
}
