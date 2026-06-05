import { createWorkbenchSurfaceRendererRegistry } from './surface-renderer-registry'
import { WorkbenchDiffEditorSurface } from './workbench-diff-editor-surface'
import { WorkbenchFileEditorSurface } from './workbench-file-editor-surface'

export const workbenchEditorSurfaceRendererRegistry = createWorkbenchSurfaceRendererRegistry([
  {
    renderer: WorkbenchDiffEditorSurface,
    type: 'diff',
  },
  {
    renderer: WorkbenchFileEditorSurface,
    type: 'file-editor',
  },
])
