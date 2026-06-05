import { WorkbenchDiffEditorPanel } from '../workbench-diff-editor-panel'
import { WorkbenchPanelUnavailable } from '../workbench-panel-unavailable'
import type { WorkbenchSurfaceRendererProps } from './surface-renderer-registry'

export function WorkbenchDiffEditorSurface({ active, surface }: WorkbenchSurfaceRendererProps) {
  if (surface.type !== 'diff') {
    return <WorkbenchPanelUnavailable message='This surface is not a diff editor.' />
  }
  if (!surface.resourceKey) {
    return <WorkbenchPanelUnavailable message='This diff editor is missing a document id.' />
  }

  return (
    <WorkbenchDiffEditorPanel
      active={active}
      panel={{
        diffDocumentId: surface.resourceKey,
        id: surface.id,
        type: 'diff',
      }}
    />
  )
}
