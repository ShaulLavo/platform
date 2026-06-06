import { EditorPaneTabBody } from '@/components/workspace/editor-panes/components/editor-pane-tab-body'

import { PanelUnavailable } from '@/features/workbench/components/panel-unavailable'
import { editorSurfaceSerializedState } from '@/features/workbench/utils/editor-surface-layout'
import type { SurfaceRendererProps } from '@/features/workbench/utils/surface-renderer-registry'
import { useEditorSurfaceContext } from '@/features/workbench/hooks/use-editor-surface-context'

export function DiffEditorSurface({ active, surface }: SurfaceRendererProps) {
  const context = useEditorSurfaceContext()
  const editorState = editorSurfaceSerializedState(surface)
  if (surface.type !== 'diff') {
    return <PanelUnavailable message='This surface is not a diff editor.' />
  }
  if (!surface.resourceKey) {
    return <PanelUnavailable message='This diff editor is missing a document id.' />
  }
  if (!editorState) {
    return <PanelUnavailable message='This diff editor is missing editor state.' />
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
