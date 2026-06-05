import { EditorPaneTabBody } from '@/components/workspace/editor-panes/components/editor-pane-tab-body'

import { WorkbenchPanelUnavailable } from '../workbench-panel-unavailable'
import { useWorkbenchEditorSurfaceContext } from './use-workbench-editor-surface-context'
import { editorSurfaceSerializedState } from './workbench-editor-surface-layout'
import type { WorkbenchSurfaceRendererProps } from './surface-renderer-registry'

export function WorkbenchFileEditorSurface({ active, surface }: WorkbenchSurfaceRendererProps) {
  const context = useWorkbenchEditorSurfaceContext()
  const editorState = editorSurfaceSerializedState(surface)
  if (surface.type !== 'file-editor') {
    return <WorkbenchPanelUnavailable message='This surface is not a file editor.' />
  }
  if (!surface.resourceKey) {
    return <WorkbenchPanelUnavailable message='This file editor is missing a path.' />
  }
  if (!editorState) {
    return <WorkbenchPanelUnavailable message='This file editor is missing editor state.' />
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
