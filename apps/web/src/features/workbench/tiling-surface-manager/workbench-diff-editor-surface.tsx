import { EditorPaneTabBody } from '@/components/workspace/editor-panes/components/editor-pane-tab-body'

import { WorkbenchPanelUnavailable } from '../workbench-panel-unavailable'
import { editorSurfaceSerializedState } from './workbench-editor-surface-layout'
import type { WorkbenchSurfaceRendererProps } from './surface-renderer-registry'
import { useWorkbenchEditorSurfaceContext } from './use-workbench-editor-surface-context'

export function WorkbenchDiffEditorSurface({ active, surface }: WorkbenchSurfaceRendererProps) {
  const context = useWorkbenchEditorSurfaceContext()
  const editorState = editorSurfaceSerializedState(surface)
  if (surface.type !== 'diff') {
    return <WorkbenchPanelUnavailable message='This surface is not a diff editor.' />
  }
  if (!surface.resourceKey) {
    return <WorkbenchPanelUnavailable message='This diff editor is missing a document id.' />
  }
  if (!editorState) {
    return <WorkbenchPanelUnavailable message='This diff editor is missing editor state.' />
  }

  return (
    <EditorPaneTabBody
      active={active}
      editorKeymapLayers={context.editorKeymapLayers}
      path={surface.resourceKey}
      rootPath={context.rootPath}
      tabId={editorState.editorTabId}
    />
  )
}
