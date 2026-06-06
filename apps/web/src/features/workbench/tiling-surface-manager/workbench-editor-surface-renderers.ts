import { WorkbenchDiagnosticsSurface } from './workbench-diagnostics-surface'
import { createWorkbenchSurfaceRendererRegistry } from './surface-renderer-registry'
import { WorkbenchDiffEditorSurface } from './workbench-diff-editor-surface'
import { WorkbenchEmptyEditorSurface } from './workbench-empty-editor-surface'
import { WorkbenchFileEditorSurface } from './workbench-file-editor-surface'
import { WorkbenchFileNavigatorSurface } from './workbench-file-navigator-surface'
import { WorkbenchGitChangesSurface } from './workbench-git-changes-surface'
import { WorkbenchLogsSurface } from './workbench-logs-surface'
import { WorkbenchSearchResultsSurface } from './workbench-search-results-surface'
import { WorkbenchTerminalSurface } from './workbench-terminal-surface'

export const workbenchEditorSurfaceRendererRegistry = createWorkbenchSurfaceRendererRegistry([
  {
    renderer: WorkbenchDiagnosticsSurface,
    type: 'diagnostics',
  },
  {
    renderer: WorkbenchDiffEditorSurface,
    type: 'diff',
  },
  {
    renderer: WorkbenchFileEditorSurface,
    type: 'file-editor',
  },
  {
    renderer: WorkbenchFileNavigatorSurface,
    type: 'file-navigator',
  },
  {
    renderer: WorkbenchGitChangesSurface,
    type: 'git-changes',
  },
  {
    renderer: WorkbenchLogsSurface,
    type: 'logs',
  },
  {
    renderer: WorkbenchEmptyEditorSurface,
    type: 'placeholder',
  },
  {
    renderer: WorkbenchSearchResultsSurface,
    type: 'search-results',
  },
  {
    renderer: WorkbenchTerminalSurface,
    type: 'terminal',
  },
])
