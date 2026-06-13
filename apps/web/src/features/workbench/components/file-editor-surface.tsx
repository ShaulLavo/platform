import { EditorSurfaceTabBody } from '@/features/workbench/components/editor-surface-tab-body'
import { PanelUnavailable } from '@/features/workbench/components/panel-unavailable'
import { useEditorSurfaceContext } from '@/features/workbench/hooks/use-editor-surface-context'
import { editorSurfaceSerializedState } from '@/features/workbench/utils/editor-surface-layout'
import type { SurfaceRendererProps } from '@/features/workbench/utils/surface-renderer-registry'

export function FileEditorSurface({ active, surface }: SurfaceRendererProps) {
  const context = useEditorSurfaceContext()
  const editorState = editorSurfaceSerializedState(surface)
  if (surface.type !== 'file-editor') {
    return <PanelUnavailable message='This surface is not a file editor.' />
  }
  if (!surface.resourceKey) {
    return <PanelUnavailable message='This file editor is missing a path.' />
  }
  if (!editorState) {
    return <PanelUnavailable message='This file editor is missing editor state.' />
  }

  return (
    <EditorSurfaceTabBody
      active={active}
      definitionTarget={editorState.definitionTarget}
      editorKeymapLayers={context.editorKeymapLayers}
      path={surface.resourceKey}
      rootPath={context.rootPath}
      tabId={editorState.editorTabId}
    />
  )
}
