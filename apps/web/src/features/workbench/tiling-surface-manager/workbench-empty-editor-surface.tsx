import { FileViewerEmpty } from '@/components/workspace/file-tree/components/file-viewer-empty'

import type { WorkbenchSurfaceRendererProps } from './surface-renderer-registry'
import { WorkbenchPanelUnavailable } from '../workbench-panel-unavailable'

export function WorkbenchEmptyEditorSurface({ surface }: WorkbenchSurfaceRendererProps) {
  if (surface.type !== 'placeholder') {
    return <WorkbenchPanelUnavailable message='This surface is not an empty editor.' />
  }

  return <FileViewerEmpty />
}
